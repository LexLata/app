// @vitest-environment jsdom
// Ausgangsstellenprüfung mit registrierter Prüfkoordination, Queue und echten Quellenketten.
import {
  markierungsAusgangspruefungNativeAttrappe,
  markierungsAusgangspruefungTestFormular,
  gesetzPfad,
  titelPfad,
  gesetzXML,
} from '@/test/markierungen/markierungsAusgangspruefungTestAufbau';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import {
  initialisiereMarkierungen,
  pruefeAlleMarkierungen,
} from '@/lib/markierungen/markierungen.index';

const m = markierungsAusgangspruefungNativeAttrappe();
const dom = domTestWurzel();
const formular = markierungsAusgangspruefungTestFormular();
const { FormularPruefung } = formular;
beforeEach(() => {
  vi.clearAllMocks();
  m.dateien.clear();
  m.callbacks.clear();
  m.dateien.set(gesetzPfad, gesetzXML);
  m.dateien.set(
    'markierungen/BGB_de-bund-markierungen.xml',
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
  );
  initialisiereMarkierungen();
  m.vollbedarf = false;
  m.wiederholen = false;
  m.emit.mockResolvedValue(undefined);
  m.dateien.set('markierungskonflikte.xml', '<markierungskonflikte pruefstatus="aktuell"/>');
  m.hinweise.mockResolvedValue(undefined);
  m.lesen.mockImplementation(async (pfad: string) => {
    const inhalt = m.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Fehlt');
    return inhalt;
  });
  m.invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'datei_sperre_erwerben') return args.relativerPfad;
      if (befehl === 'datei_sperre_freigeben' || befehl === 'datei_sperre_unterbrechen') return;
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'archiviere_beschaedigte_datei') {
        m.dateien.delete(args.relativerPfad);
        return { status: 'archiviert', sicherungspfad: 'kopie' };
      }
      if (befehl === 'atomar_datei_schreiben') {
        m.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (befehl === 'pruefvorgang_registrieren') return 'quelle';
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
        const uebernommen = m.wiederholen;
        m.wiederholen = false;
        return uebernommen;
      }
      if (befehl === 'pruefvorgang_vollpruefung_abschliessen') m.vollbedarf = false;
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: m.vollbedarf };
    },
  );
});
const freigaben: (() => void)[] = [];
afterEach(async () => {
  freigaben.splice(0).forEach((freigeben) => freigeben());
  await pruefeAlleMarkierungen(() => {}).catch(() => undefined);
  vi.useRealTimers();
});
function wartenderLauf() {
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  freigaben.push(freigeben);
  return { warten, freigeben };
}
async function verzögerteFolge(repariert = true) {
  const gate = wartenderLauf();
  const urspruenglich = m.invoke.getMockImplementation()!;
  let sperreWartet = true;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'datei_sperre_erwerben' && sperreWartet) {
      sperreWartet = false;
      await gate.warten;
      throw Error('Sperre des vorausgehenden Prüflaufs');
    }
    return urspruenglich(befehl, args);
  });
  // Öffentliche Prüfung belegt die echte Queue; ihr nativer Sperraufruf wartet.
  const davor = pruefeAlleMarkierungen(() => {}).catch(() => undefined);
  m.vollbedarf = true;
  m.dateien.set(gesetzPfad, '<kaputt/>');
  const original = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei' && args.relativerPfad === gesetzPfad) {
      // Reparatur durch einen anderen Schreiber während des Inhaltsvergleichs.
      if (repariert) m.dateien.set(gesetzPfad, gesetzXML);
      return { status: 'veraendert', sicherungspfad: null };
    }
    return original(befehl, args);
  });
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(m.invoke).toHaveBeenCalledWith('pruefvorgang_registrieren', expect.anything());
  expect(m.invoke).toHaveBeenCalledWith(
    repariert ? 'pruefvorgang_quelle_abschliessen' : 'pruefvorgang_fehler',
    expect.anything(),
  );
  return { gate, davor };
}
it('wartet auf den registrierten Folgelauf und dessen späten Hinweis vor dem Schließen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { gate, davor } = await verzögerteFolge();
  expect(formular.pruefung.bezugPruefungLaeuft).toBe(true);
  let geschlossen = false;
  const schließen = formular.pruefung.warteAufAbschluss().then(() => {
    geschlossen = true;
  });
  await Promise.resolve();
  expect(geschlossen).toBe(false);
  expect(m.hinweise).not.toHaveBeenCalled();
  const annahme = wartenderLauf();
  m.hinweise.mockImplementation(() => annahme.warten);
  m.emit.mockRejectedValue(Error('späte Synchronisation'));
  await act(async () => {
    gate.freigeben();
    await davor;
  });
  expect(m.hinweise).toHaveBeenCalledExactlyOnceWith(
    [expect.objectContaining({ anlass: 'synchronisation' })],
    'fenster-1',
  );
  expect(geschlossen).toBe(false);
  await act(async () => {
    annahme.freigeben();
    await schließen;
  });
  expect(geschlossen).toBe(true);
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  expect(formular.pruefung.aktionsFehler).toBeNull();
  expect(m.banner).not.toHaveBeenCalled();
});
it('meldet die endliche Frist ohne Quelländerungsbehauptung und bricht den Folgelauf nicht ab', async () => {
  vi.useFakeTimers();
  const { gate, davor } = await verzögerteFolge();
  const schließen = formular.pruefung.warteAufAbschluss();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
    await schließen;
  });
  expect(formular.pruefung.aktionsFehler).toContain('nicht zuverlässig abgeschlossen');
  expect(formular.pruefung.aktionsFehler).not.toContain('geändert');
  expect(formular.pruefung.aktionsFehler).not.toContain('gespeichert');
  expect(m.hinweise).not.toHaveBeenCalled();
  expect(formular.pruefung.bezugPruefungLaeuft).toBe(false);
  await act(async () => {
    gate.freigeben();
    await davor;
  });
  expect(m.dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="aktuell"');
  expect(m.hinweise).not.toHaveBeenCalled();
  expect(formular.pruefung.aktionsFehler).toContain('nicht zuverlässig abgeschlossen');
});
it('ein überholter Folgelauf überschreibt die aktuelle Prüfung nicht und übergibt seine Quellenhinweise', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { gate, davor } = await verzögerteFolge();
  await act(async () =>
    m.callbacks.get('gesetze-geaendert')!({
      payload: [{ kurztitel: 'BGB', normgeber: 'de-bund' }],
    }),
  );
  expect(formular.pruefung.bezugPruefungLaeuft).toBe(false);
  expect(formular.pruefung.aktionsFehler).toBeNull();
  // Die alte Folge heilt eine weitere Quelle innerhalb derselben Queue.
  m.dateien.set(titelPfad, '<defekt');
  m.wiederholen = true;
  m.emit.mockRejectedValue(Error('Synchronisation nach Heilung'));
  await act(async () => {
    gate.freigeben();
    await davor;
    await formular.pruefung.warteAufAbschluss();
  });
  expect(formular.pruefung.bezugPrueffehler).toBeNull();
  expect(formular.pruefung.aktionsFehler).toBeNull();
  expect(m.dateien.has(titelPfad)).toBe(false);
  expect(m.hinweise).toHaveBeenCalledOnce();
  expect(m.hinweise.mock.calls[0]?.[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ anlass: 'sicherung' }),
      expect.objectContaining({ anlass: 'synchronisation' }),
    ]),
  );
  expect(m.banner).not.toHaveBeenCalled();
});

it('wartet auch nach direktem Ladefehler auf die registrierte Folge und erhält den lokalen Fehler', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.wiederholen = true;
  const { gate, davor } = await verzögerteFolge(false);
  expect(formular.pruefung.bezugPruefungLaeuft).toBe(true);
  let fertig = false;
  const schließen = formular.pruefung.warteAufAbschluss().then(() => {
    fertig = true;
  });
  await Promise.resolve();
  expect(fertig).toBe(false);
  m.dateien.set(gesetzPfad, gesetzXML);
  m.emit.mockRejectedValue(Error('späte Synchronisation'));
  await act(async () => {
    gate.freigeben();
    await davor;
    await schließen;
  });
  expect(formular.pruefung.bezugPrueffehler).toContain('nicht zuverlässig gelesen');
  expect(formular.pruefung.bezugErhalten).toBe(false);
  expect(m.hinweise).toHaveBeenCalledOnce();
  expect(m.hinweise.mock.calls[0]?.[0]).toContainEqual(
    expect.objectContaining({ anlass: 'synchronisation' }),
  );
  expect(m.banner).not.toHaveBeenCalled();
});
it('übergibt bei Fristablauf den Prüfhinweis zu einer tatsächlich gesicherten Quelle einmal', async () => {
  vi.useFakeTimers();
  m.dateien.set(titelPfad, '<defekt');
  const { gate, davor } = await verzögerteFolge();
  expect(m.dateien.has(titelPfad)).toBe(false);
  expect(m.hinweise).not.toHaveBeenCalled();
  const schließen = formular.pruefung.warteAufAbschluss();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
    await schließen;
  });
  expect(m.hinweise).toHaveBeenCalledOnce();
  expect(m.hinweise.mock.calls[0]?.[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ anlass: 'sicherung' }),
      expect.objectContaining({ anlass: 'pruefabschluss', aenderungsstand: 'teilweise' }),
    ]),
  );
  expect(formular.pruefung.aktionsFehler).toBeNull();
  await act(async () => {
    gate.freigeben();
    await davor;
  });
  expect(m.hinweise).toHaveBeenCalledOnce();
  expect(m.dateien.get('markierungskonflikte.xml')).toContain('pruefstatus="aktuell"');
});
