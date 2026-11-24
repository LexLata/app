// @vitest-environment jsdom
// Beobachtet abschließende Prüfmeldungen über echte Startprüfung, Heilung und Bannerstore.
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { beforeEach, expect, it, vi } from 'vitest';
const konfliktpfad = 'markierungskonflikte.xml';
const markierungspfad = 'markierungen/CIC1917_vatikan-markierungen.xml';
const falsch =
  '<markierungen><infos><gesetz normgeber="vatikan">CIC1983</gesetz></infos><inhalt/></markierungen>';
async function aufbauen() {
  vi.resetModules();
  vorbereiten();
  const [speicherModul, kette] = await Promise.all([
    import('@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher'),
    import('@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette'),
  ]);
  const speicher = { ...speicherModul, reiheInPruefungsKetteEin: kette.reiheInPruefungsKetteEin };
  const banner = await import('@/lib/banner/banner.index');
  banner.alleBannerSchliessen();
  speicher.initialisiereMarkierungen();
  io.dateien.set(konfliktpfad, '<markierungskonflikte pruefstatus="ausstehend"/>');
  const nativ = io.invoke.getMockImplementation();
  if (!nativ) throw new Error('Native Grenze fehlt.');
  let uebernommen = false;
  io.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
      if (uebernommen) return false;
      uebernommen = true;
      return true;
    }
    return nativ(befehl, args);
  });
  await speicher.bereiteMarkierungsStartPruefungVor();
  return { speicher, banner };
}
beforeEach(() => vi.clearAllMocks());
it('zeigt nach Archivierung und erfolgreicher Startnachprüfung nur den Sicherungshinweis', async () => {
  const { speicher, banner } = await aufbauen();
  io.dateien.set(markierungspfad, falsch);
  const nativ = io.invoke.getMockImplementation();
  if (!nativ) throw new Error('Native Grenze fehlt.');
  io.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei')
      expect(banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler')).toEqual([]);
    return nativ(befehl, args);
  });
  await speicher.pruefeMarkierungenBeimStart();
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(io.dateien.get(markierungspfad + '.sicherung')).toBe(falsch);
  expect(io.dateien.has(markierungspfad)).toBe(false);
  expect(io.dateien.get(konfliktpfad)).toContain('pruefstatus="aktuell"');
  expect(banner.getSnapshot()).toContainEqual(
    expect.objectContaining({
      text: expect.stringContaining('CIC1917_vatikan-markierungen.xml'),
    }),
  );
  expect(JSON.stringify(banner.getSnapshot())).not.toContain('.sicherung');
  expect(banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler')).toEqual([]);
});
it('behält bei endgültigem Sicherungsfehler den Fehlerhinweis und den fehlgeschlagenen Prüfstand', async () => {
  const { speicher, banner } = await aufbauen();
  io.dateien.set(markierungspfad, falsch);
  const nativ = io.invoke.getMockImplementation();
  if (!nativ) throw new Error('Native Grenze fehlt.');
  io.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei') throw new Error('Sicherung verweigert');
    return nativ(befehl, args);
  });
  await expect(speicher.pruefeMarkierungenBeimStart()).rejects.toThrow();
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(io.dateien.get(markierungspfad)).toBe(falsch);
  expect(io.dateien.get(konfliktpfad)).toContain('pruefstatus="fehlgeschlagen"');
  expect(
    banner
      .getSnapshot()
      .filter((meldung) => meldung.text.startsWith('Die Prüfung der Markierungskonflikte')),
  ).toHaveLength(1);
});
it.each([true, false])(
  'meldet erst das endgültige Ergebnis der nachgelagerten Wiederholung (Erfolg: %s)',
  async (erfolgreich) => {
    const { speicher, banner } = await aufbauen();
    const nativ = io.invoke.getMockImplementation();
    if (!nativ) throw new Error('Native Grenze fehlt.');
    let ersterAbschluss = true;
    io.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'pruefvorgang_vollpruefung_abschliessen') {
        // Auch während des bereits laufenden Folgelaufs darf kein Zwischenfehler stehen.
        expect(banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler')).toEqual([]);
        if (ersterAbschluss || !erfolgreich) {
          ersterAbschluss = false;
          throw new Error('Vorübergehend kein Prüfabschluss');
        }
      }
      return nativ(befehl, args);
    });
    if (erfolgreich) await expect(speicher.pruefeMarkierungenBeimStart()).resolves.toBeUndefined();
    else await expect(speicher.pruefeMarkierungenBeimStart()).rejects.toThrow('Vorübergehend');
    await speicher.reiheInPruefungsKetteEin(async () => {});
    expect(io.dateien.get(konfliktpfad)).toContain(
      `pruefstatus="${erfolgreich ? 'aktuell' : 'fehlgeschlagen'}"`,
    );
    const fehler = banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler');
    expect(fehler).toHaveLength(erfolgreich ? 0 : 1);
    if (!erfolgreich)
      expect(fehler[0]?.text).toContain('Prüfabschluss konnte jedoch nicht bestätigt');
  },
);

it('verwirft den Zwischenfehler nach bestätigtem fremdem Neuaufbau vor der Wiederholung', async () => {
  const { speicher, banner } = await aufbauen();
  const nativ = io.invoke.getMockImplementation();
  if (!nativ) throw new Error('Native Grenze fehlt.');
  io.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'pruefvorgang_vollpruefung_abschliessen')
      throw new Error('Vorübergehend kein Prüfabschluss');
    if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
      // Der fremde Auftrag hat zwischen dem ersten Fehlschlag und der
      // Wiederholungsentscheidung vollständig gespeichert und nativ bestätigt.
      io.dateien.set(konfliktpfad, '<markierungskonflikte pruefstatus="aktuell"/>');
      io.vollbedarf = false;
      return false;
    }
    return nativ(befehl, args);
  });
  await expect(speicher.pruefeMarkierungenBeimStart()).resolves.toBeUndefined();
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(io.dateien.get(konfliktpfad)).toContain('pruefstatus="aktuell"');
  expect(banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler')).toEqual([]);
});

it('zeigt nach vorübergehendem Quellabschlussfehler und erfolgreicher Heilung nur den Archivierungshinweis', async () => {
  const { speicher, banner } = await aufbauen();
  io.dateien.set(markierungspfad, falsch);
  const nativ = io.invoke.getMockImplementation();
  if (!nativ) throw new Error('Native Grenze fehlt.');
  let ersterAbschluss = true;
  io.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'pruefvorgang_quelle_abschliessen' && ersterAbschluss) {
      ersterAbschluss = false;
      throw new Error('Quellabschluss vorübergehend nicht bestätigt');
    }
    return nativ(befehl, args);
  });
  await speicher.pruefeMarkierungenBeimStart();
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(io.dateien.get(markierungspfad + '.sicherung')).toBe(falsch);
  expect(io.dateien.has(markierungspfad)).toBe(false);
  expect(io.dateien.get(konfliktpfad)).toContain('pruefstatus="aktuell"');
  expect(banner.getSnapshot()).toContainEqual(
    expect.objectContaining({
      text: expect.stringContaining('CIC1917_vatikan-markierungen.xml'),
    }),
  );
  expect(JSON.stringify(banner.getSnapshot())).not.toContain('.sicherung');
  expect(banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler')).toEqual([]);
});

it('meldet endgültige Fehler späterer Folgeläufe nach erfolgreicher Heilung', async () => {
  const { speicher, banner } = await aufbauen();
  io.dateien.set(markierungspfad, falsch);
  const nativ = io.invoke.getMockImplementation();
  if (!nativ) throw new Error('Native Grenze fehlt.');
  let wiederholungen = 0;
  let vollabschluesse = 0;
  io.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return ++wiederholungen <= 2;
    if (befehl === 'pruefvorgang_teilpruefung_abschliessen')
      throw new Error('Teilabschluss bleibt gescheitert');
    if (befehl === 'pruefvorgang_vollpruefung_abschliessen' && ++vollabschluesse > 1) {
      // Der spätere Auftrag sammelt weiterhin bis zu seiner eigenen Wiederholung.
      expect(banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler')).toEqual([]);
      throw new Error('Späterer Vollabschluss bleibt gescheitert');
    }
    return nativ(befehl, args);
  });
  await speicher.pruefeMarkierungenBeimStart();
  for (let i = 0; i < 3; i++) await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(vollabschluesse).toBeGreaterThan(1);
  expect(io.dateien.get(konfliktpfad)).toContain('pruefstatus="fehlgeschlagen"');
  expect(banner.getSnapshot().filter((meldung) => meldung.typ === 'fehler')).toHaveLength(1);
});
