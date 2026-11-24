import { gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// Prüft den verpflichtenden Empfänger mit gemeinsamer Konfliktsperre und nativen Abschlüssen.

import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const zustand = vi.hoisted(() => ({
  label: 'main',
  browser: false,
  xml: '<markierungskonflikte pruefstatus="aktuell"/>' as string | undefined,
  gehalten: false,
  vollbedarf: false,
  fehler: false,
  verbraucht: false,
  quellen: new Set<string>(),
  pruefungen: new Set<string>(),
  nummer: 0,
  schreibfehler: false,
  warteQuellen: undefined as (() => Promise<void>) | undefined,
  lesefehler: false,
  sicherungen: [] as string[],
  sperrKette: Promise.resolve() as Promise<unknown>,
  quellenWarten: [] as (() => void)[],
  claimFehler: undefined as Error | undefined,
  abschlussFehler: undefined as Error | undefined,
}));
const invoke = vi.hoisted(() =>
  vi.fn(
    async (
      befehl: string,
      args?: { vorgaenge?: string[]; erwarteterInhalt?: string; konfliktToken?: string },
    ) => {
      if (befehl === 'datei_sperre_fortsetzen') {
        expect(zustand.gehalten).toBe(false);
        zustand.gehalten = true;
        return true;
      }
      if (befehl === 'pruefvorgang_quellen_abwarten') {
        expect(zustand.gehalten).toBe(false);
        await warteAufQuellen();
        return;
      }
      expect(zustand.gehalten).toBe(true);
      if (befehl === 'datei_sperre_unterbrechen') {
        zustand.gehalten = false;
        return;
      }
      if (befehl === 'pruefvorgang_quelle_abschliessen' && zustand.abschlussFehler) {
        const fehler = zustand.abschlussFehler;
        zustand.abschlussFehler = undefined;
        throw fehler;
      }
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return uebernehmeWiederholung();
      if (befehl === 'archiviere_beschaedigte_datei') {
        if (args?.erwarteterInhalt !== zustand.xml) return { status: 'geaendert' };
        zustand.sicherungen.push(zustand.xml!);
        zustand.xml = undefined;
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      if (args?.vorgaenge?.includes('fremd')) throw Error('Fremde Sitzung');
      if (befehl === 'pruefvorgang_vollpruefung_abschliessen') {
        expect(zustand.xml).toContain('pruefstatus="aktuell"');
        zustand.pruefungen.clear();
        zustand.vollbedarf = false;
        zustand.fehler = false;
        zustand.verbraucht = false;
      }
      if (befehl === 'pruefvorgang_registrieren') {
        const id = `v${++zustand.nummer}`;
        zustand.quellen.add(id);
        return id;
      }
      for (const id of args?.vorgaenge ?? []) bearbeiteVorgang(befehl, id);
      if (zustand.quellen.size === 0) zustand.quellenWarten.splice(0).forEach((weiter) => weiter());

      aktualisiereFehlerstatus(befehl, args?.vorgaenge);
      return {
        offeneQuellen: zustand.quellen.size,
        offenePruefungen: zustand.pruefungen.size,
        vollbedarf: zustand.vollbedarf,
      };
    },
  ),
);
async function warteAufQuellen(): Promise<void> {
  if (zustand.warteQuellen) await zustand.warteQuellen();
  else if (zustand.quellen.size > 0)
    await new Promise<void>((resolve) => zustand.quellenWarten.push(resolve));
}
function uebernehmeWiederholung(): boolean {
  if (zustand.claimFehler) throw zustand.claimFehler;
  if (zustand.quellen.size > 0) throw Error('Quellen sind noch offen.');
  if (!zustand.vollbedarf || zustand.verbraucht) return false;
  zustand.verbraucht = true;
  return true;
}
function aktualisiereFehlerstatus(befehl: string, vorgaenge?: string[]): void {
  if (
    befehl === 'pruefvorgang_vollbedarf' ||
    (befehl === 'pruefvorgang_fehler' && !vorgaenge?.length)
  )
    zustand.vollbedarf = true;
  if (befehl === 'pruefvorgang_fehler' && (!vorgaenge?.length || zustand.vollbedarf))
    zustand.fehler = true;
}
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => {
    if (zustand.browser) throw new Error('Browser');
    return { label: zustand.label };
  },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => {}) }));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitDateiSperre: vi.fn((_: string, lauf: (token: string) => Promise<unknown>) => {
    const ergebnis = zustand.sperrKette.then(async () => {
      expect(zustand.gehalten).toBe(false);
      zustand.gehalten = true;
      try {
        return await lauf('konflikttoken');
      } finally {
        zustand.gehalten = false;
      }
    });
    zustand.sperrKette = ergebnis.catch(() => undefined);
    return ergebnis;
  }),
  appDatenLesen: vi.fn(async () => {
    if (zustand.lesefehler || zustand.xml === undefined) throw Error('Lesen');
    return zustand.xml;
  }),
  appDatenExistiert: vi.fn(async () => zustand.xml !== undefined),
  appDatenSchreiben: vi.fn(async (_: string, xml: string) => {
    expect(zustand.gehalten).toBe(true);
    if (zustand.schreibfehler) throw Error('Schreiben');
    zustand.xml = xml;
  }),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetzeFuerPruefung: vi.fn(async () => []),
  ladeGesetzeFuerPruefung: async (
    referenzen: import('@/lib/domain/gesetzTypes').Gesetzesreferenz[],
  ) => {
    if (referenzen.length === 0) return [];
    const gesetz = await import('@/lib/persistenz/gesetz/gesetz.index');
    return [...(await gesetz.ladeAlleGesetzeFuerPruefung())];
  },
  pruefeGesetzDatei: vi.fn(),
  sichereUngueltigeGesetzDatei: vi.fn(),
  existierenNichtamtlicheTitelFuerPruefung: vi.fn(async () => new Set()),
  beiSpeicherBatchAbgeschlossen: vi.fn(),
  beiNichtamtlicheTitelGeschrieben: vi.fn(),
}));
vi.mock('@/lib/markierungen/eintrag/eintrag.index', async (original) => ({
  ...(await original<typeof import('@/lib/markierungen/eintrag/eintrag.index')>()),
  ladeEintraege: vi.fn(async () => []),
  escapeXML: (await import('@/lib/utils/xmlVerarbeitung')).escapeXML,
  ladeEintraegeFuerPruefung: vi.fn(async () => []),
  ermittleGesetzeMitMarkierungen: vi.fn(async () => []),
  leseMarkierungsXMLFuerPruefung: vi.fn(),
  beiMarkierungGeaendert: vi.fn(),
  beiMarkierungenBulkGeaendert: vi.fn(),
}));
vi.mock('./markierungskonflikteSpeicher.fensterOeffnen', () => ({ planeFensterOeffnen: vi.fn() }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  zustand.xml = '<markierungskonflikte pruefstatus="aktuell"/>';
  zustand.gehalten = false;
  zustand.vollbedarf = false;
  zustand.fehler = false;
  zustand.verbraucht = false;
  zustand.quellen.clear();
  zustand.pruefungen.clear();
  zustand.nummer = 0;
  zustand.schreibfehler = false;
  zustand.warteQuellen = undefined;
  zustand.lesefehler = false;
  zustand.sicherungen.length = 0;
  zustand.claimFehler = undefined;
  zustand.abschlussFehler = undefined;
});
async function kanal() {
  const speicher = await ladeSpeicherMitKette();
  speicher.initialisiereMarkierungen();
  return import('@/lib/persistenz/kern/kern.index');
}
it('hebt einen gespeicherten Fehler durch einen neuen unveränderten Quellabschluss nicht auf', async () => {
  zustand.label = 'main';
  zustand.xml =
    '<markierungskonflikte pruefstatus="fehlgeschlagen"><gesetz kurztitel="Alt" normgeber="de-bund"/></markierungskonflikte>';
  const speicher = await ladeSpeicherMitKette();
  speicher.initialisiereMarkierungen();
  await speicher.bereiteMarkierungsStartPruefungVor();
  const kern = await import('@/lib/persistenz/kern/kern.index');
  const vorgang = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(vorgang, 'unveraendert');
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(zustand.vollbedarf).toBe(true);
  expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
  expect(zustand.xml).toContain('kurztitel="Alt"');
  await speicher.pruefeMarkierungenBeimStart();
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
});

it('merkt vor I/O vor und erhält Befunde sowie Erweiterungen', async () => {
  const kern = await kanal();
  zustand.xml =
    '<markierungskonflikte pruefstatus="aktuell" zusatz="x"><gesetz kurztitel="A" normgeber="de-bund"/><extra/></markierungskonflikte>';
  expect(await kern.merkePruefpflichtigeAenderungVor()).toBe('v1');
  expect(zustand.xml).toContain('pruefstatus="ausstehend"');
  expect(zustand.xml).toContain('kurztitel="A"');
  expect(zustand.xml).toContain('zusatz="x"');
  expect(zustand.xml).toMatch(/<extra\s*\/>/);
});
it('erhält regulären laufenden Bedarf selektiv, unterbrochenen Bedarf vollständig', async () => {
  const kern = await kanal();
  await kern.merkePruefpflichtigeAenderungVor();
  await kern.merkePruefpflichtigeAenderungVor();
  expect(zustand.vollbedarf).toBe(false);
  zustand.quellen.clear();
  await kern.merkePruefpflichtigeAenderungVor();
  expect(zustand.vollbedarf).toBe(true);
});
it('bricht vorab bei Schreibfehler den unbegonnenen Vorgang ab', async () => {
  const kern = await kanal();
  zustand.schreibfehler = true;
  await expect(kern.merkePruefpflichtigeAenderungVor()).rejects.toThrow('Schreiben');
  expect(zustand.quellen.size).toBe(0);
  expect(zustand.xml).toContain('aktuell');
});
it('bestätigt unveränderte Quellen erst nach dem letzten offenen Vorgang als aktuell', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  const b = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(a, 'unveraendert');
  expect(zustand.xml).toContain('ausstehend');
  await kern.schliessePruefpflichtigeQuelleAb(b, 'unveraendert');
  expect(zustand.xml).toContain('aktuell');
});
it('hält geänderte Quellen als offene Prüfung und erhält Fehlbedarf', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert');
  expect(zustand.quellen.size).toBe(0);
  expect(zustand.pruefungen.size).toBe(1);
  expect(zustand.xml).toContain('ausstehend');
  const b = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(b, 'fehlgeschlagen');
  expect(zustand.vollbedarf).toBe(true);
  expect(zustand.xml).toContain('fehlgeschlagen');
});
it('lässt erledigte späte Fehler den aktuellen Stand unverändert', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(a, 'unveraendert');
  await kern.schliessePruefpflichtigeQuelleAb(a, 'fehlgeschlagen');
  expect(zustand.vollbedarf).toBe(false);
  expect(zustand.xml).toContain('aktuell');
});

it.each(['Vollprüfung', 'Anzeige', 'direkte Verifikation'])(
  'wartet ohne Konfliktsperre auf Quellen und übernimmt frische Erweiterungen: %s',
  async (weg) => {
    const kern = await kanal();
    const a = await kern.merkePruefpflichtigeAenderungVor();
    zustand.vollbedarf = true;
    let wartenBegonnen!: () => void;
    const wartet = new Promise<void>((resolve) => {
      wartenBegonnen = resolve;
    });
    let weiter!: () => void;
    zustand.warteQuellen = async () => {
      wartenBegonnen();
      await new Promise<void>((resolve) => {
        weiter = resolve;
      });
    };
    const speicher = await ladeSpeicherMitKette();
    const anzeige =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    const voll =
      weg === 'Vollprüfung'
        ? speicher.pruefeAlleMarkierungen()
        : weg === 'Anzeige'
          ? anzeige.ladeMarkierungskonflikteFuerAnzeige()
          : anzeige.verifiziereBekannteKonflikte();
    await wartet;
    expect(zustand.gehalten).toBe(false);
    expect(zustand.xml).toContain('ausstehend');
    zustand.xml = '<markierungskonflikte pruefstatus="ausstehend" inzwischen="frisch"/>';
    expect(await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert')).toBe(true);
    weiter();
    await voll;
    expect(zustand.xml).toContain('aktuell');
    expect(zustand.xml).toContain('inzwischen="frisch"');
    expect(zustand.pruefungen.size).toBe(0);
  },
);
it('schließt erfolgreiche Teilprüfung ab, erhält anderen offenen Quellvorgang', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  const b = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert');
  const speicher = await ladeSpeicherMitKette();
  await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })], {
    vorgaenge: [a],
  });
  expect(zustand.xml).toContain('ausstehend');
  expect(zustand.pruefungen.size).toBe(0);
  await kern.schliessePruefpflichtigeQuelleAb(b, 'unveraendert');
  expect(zustand.xml).toContain('aktuell');
});
it('hält bei Teilabschluss-Schreibniederlage pending und alte Befunde; Vollbedarf bleibt erhalten', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert');
  const vorher = zustand.xml;
  zustand.schreibfehler = true;
  const speicher = await ladeSpeicherMitKette();
  await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })], {
    vorgaenge: [a],
  });
  expect(zustand.xml).toBe(vorher);
  expect(zustand.vollbedarf).toBe(true);
});
it('weist fremde Quellabschlüsse zurück und erhält fremde sowie eigene offene Vorgänge', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  expect(await kern.schliessePruefpflichtigeQuelleAb('fremd', 'unveraendert')).toBe(false);
  expect(zustand.quellen.has(a)).toBe(true);
  expect(zustand.xml).toContain('ausstehend');
  await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert');
  await (await ladeSpeicherMitKette()).reiheInPruefungsKetteEin(async () => undefined);
});
it('lässt Quellabschluss-Lesefehler die Quellphase nativ fehlschlagen statt Quellenwarten zu blockieren', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  zustand.lesefehler = true;
  expect(await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert')).toBe(false);
  expect(zustand.quellen.size).toBe(0);
  expect(zustand.vollbedarf).toBe(true);
});
it('erhält fehlgeschlagene GG-Prüfung trotz späterer neuer BGB-Vormerkung und erfolgreichem Teilabschluss', async () => {
  const kern = await kanal();
  const gg = await kern.merkePruefpflichtigeAenderungVor();
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockRejectedValueOnce(Error('GG-Vollfehler'));
  await kern.schliessePruefpflichtigeQuelleAb(gg, 'fehlgeschlagen');
  await (await ladeSpeicherMitKette()).reiheInPruefungsKetteEin(async () => undefined);
  expect(zustand.verbraucht).toBe(true);
  const bgb = await kern.merkePruefpflichtigeAenderungVor();
  expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
  await kern.schliessePruefpflichtigeQuelleAb(bgb, 'geaendert');
  const speicher = await ladeSpeicherMitKette();
  await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })], {
    vorgaenge: [bgb],
  });
  expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
  expect(zustand.vollbedarf).toBe(true);
});

function bearbeiteVorgang(befehl: string, id: string): void {
  if (befehl === 'pruefvorgang_abbrechen') zustand.quellen.delete(id);
  if (befehl === 'pruefvorgang_quelle_abschliessen' && zustand.quellen.delete(id))
    zustand.pruefungen.add(id);
  if (befehl === 'pruefvorgang_teilpruefung_abschliessen') zustand.pruefungen.delete(id);
  if (befehl === 'pruefvorgang_fehler' && (zustand.quellen.has(id) || zustand.pruefungen.has(id))) {
    zustand.quellen.delete(id);
    zustand.pruefungen.add(id);
    zustand.vollbedarf = true;
  }
}
it('erhält Vollbedarf und sichtbaren Fehler, wenn Quellenwarten scheitert', async () => {
  const kern = await kanal();
  await kern.merkePruefpflichtigeAenderungVor();
  zustand.warteQuellen = async () => {
    throw Error('Quellenwartefrist');
  };
  const speicher = await ladeSpeicherMitKette();
  await expect(speicher.pruefeAlleMarkierungen()).rejects.toThrow('Quellenwartefrist');
  await speicher.reiheInPruefungsKetteEin(async () => undefined);
  expect(zustand.xml).toContain('fehlgeschlagen');
  expect(zustand.vollbedarf).toBe(true);
  const banner = await import('@/lib/banner/banner.index');
  expect(banner.zeigeBanner).toHaveBeenCalled();
});
it('behebt Einzelprüfung ohne eigenes Gesetz durch einmaligen vollständigen Neuaufbau', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert');
  const speicher = await ladeSpeicherMitKette();
  await speicher.pruefeEineMarkierungSelektiv(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    'schluessel',
    a,
  );
  expect(zustand.xml).toContain('aktuell');
  expect(zustand.vollbedarf).toBe(false);
  expect(invoke).toHaveBeenCalledWith('pruefvorgang_wiederholung_uebernehmen', {
    konfliktToken: 'konflikttoken',
  });
});

it('archiviert beschädigten Konfliktstand vor dem Quellenwarten und berechnet nach Freigabe frisch', async () => {
  await kanal();
  zustand.xml = '<markierungskonflikte><kaputt>';
  zustand.quellen.add('anderes-fenster');
  zustand.warteQuellen = async () => {
    expect(zustand.xml).toContain('pruefstatus="ausstehend"');
    expect(invoke).toHaveBeenCalledWith(
      'archiviere_beschaedigte_datei',
      expect.objectContaining({ token: 'konflikttoken' }),
    );
    expect(zustand.vollbedarf).toBe(true);
    zustand.quellen.clear();
    zustand.xml = '<markierungskonflikte pruefstatus="ausstehend" frisch="nach-freigabe"/>';
  };
  const speicher = await ladeSpeicherMitKette();
  await speicher.pruefeAlleMarkierungen();
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  expect(zustand.xml).toContain('frisch="nach-freigabe"');
  expect(zustand.vollbedarf).toBe(false);
});

it('archiviert vor der direkten Quellvormerkung ohne auf die eigene Quellphase zu warten', async () => {
  const kern = await kanal();
  zustand.xml = '<falsche-wurzel/>';
  const vorgang = await kern.merkePruefpflichtigeAenderungVor();
  expect(vorgang).toBe('v1');
  const befehle = invoke.mock.calls.map(([befehl]) => befehl);
  expect(befehle.indexOf('archiviere_beschaedigte_datei')).toBeLessThan(
    befehle.indexOf('pruefvorgang_registrieren'),
  );
  expect(befehle).not.toContain('pruefvorgang_quellen_abwarten');
  expect(zustand.xml).toContain('pruefstatus="ausstehend"');
  expect(zustand.vollbedarf).toBe(true);
  await kern.schliessePruefpflichtigeQuelleAb(vorgang, 'unveraendert');
  await (await ladeSpeicherMitKette()).reiheInPruefungsKetteEin(async () => undefined);
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  expect(zustand.vollbedarf).toBe(false);
});
it.each(['manuell', 'selektiv', 'einzeln', 'anzeige'])(
  'prüft bei %s nach jeder Sperrfreigabe erneut neue Quellvormerkungen',
  async (weg) => {
    const kern = await kanal();
    const a = await kern.merkePruefpflichtigeAenderungVor();
    let runden = 0;
    let b: string | undefined;
    zustand.warteQuellen = async () => {
      runden++;
      if (runden === 1) {
        await kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert');
        b = await kern.merkePruefpflichtigeAenderungVor();
        zustand.xml = '<markierungskonflikte pruefstatus="ausstehend" frisch="erste-runde"/>';
      } else {
        if (!b) throw new Error('Die neue Quellvormerkung fehlt.');
        await kern.schliessePruefpflichtigeQuelleAb(b, 'geaendert');
        zustand.xml = '<markierungskonflikte pruefstatus="ausstehend" frisch="zweite-runde"/>';
      }
    };
    const speicher = await ladeSpeicherMitKette();
    zustand.xml = '<kaputt/>';
    if (weg === 'manuell') await speicher.pruefeAlleMarkierungen();
    if (weg === 'selektiv')
      await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
    if (weg === 'einzeln')
      await speicher.pruefeEineMarkierungSelektiv(gesetzesreferenz({ kurztitel: 'BGB' }), 'x');
    if (weg === 'anzeige')
      await (
        await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige')
      ).ladeMarkierungskonflikteFuerAnzeige();
    expect(runden).toBe(2);
    expect(zustand.xml).toContain('frisch="zweite-runde"');
    expect(zustand.xml).toContain('pruefstatus="aktuell"');
  },
);

// Recovery muss auch Gesetze außerhalb des gezielten Auftrags vollständig erfassen.
it.each(['selektiv', 'einzeln', 'anzeige'])(
  'baut fehlenden Bestand bei %s vollständig auf',
  async (weg) => {
    zustand.xml = undefined;
    const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
    vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValueOnce([
      gesetzesreferenz({ kurztitel: 'Anderes' }),
    ]);
    const speicher = await ladeSpeicherMitKette();
    if (weg === 'selektiv')
      await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
    if (weg === 'einzeln')
      await speicher.pruefeEineMarkierungSelektiv(gesetzesreferenz({ kurztitel: 'BGB' }), 'x');
    if (weg === 'anzeige')
      await (
        await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige')
      ).ladeMarkierungskonflikteFuerAnzeige();
    expect(eintrag.ladeEintraegeFuerPruefung).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'Anderes' }),
      expect.any(Function),
    );
    expect(zustand.xml).toContain('pruefstatus="aktuell"');
    expect(zustand.vollbedarf).toBe(false);
  },
);

it.each(['selektiv', 'einzeln', 'anzeige'])(
  'stellt beschädigten Bestand bei %s einschließlich fremder Gesetze wieder her',
  async (weg) => {
    zustand.xml = '<falsche-wurzel/>';
    const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
    vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValueOnce([
      gesetzesreferenz({ kurztitel: 'Anderes' }),
    ]);
    vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockResolvedValueOnce([
      markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        kommentarText: 'x',
      }),
    ]);
    const speicher = await ladeSpeicherMitKette();
    if (weg === 'selektiv')
      await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
    if (weg === 'einzeln')
      await speicher.pruefeEineMarkierungSelektiv(gesetzesreferenz({ kurztitel: 'BGB' }), 'x');
    if (weg === 'anzeige') {
      const stand = await (
        await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige')
      ).ladeMarkierungskonflikteFuerAnzeige();
      expect(stand.gesetze[0]?.gesetz.kurztitel).toBe('Anderes');
    }
    expect(zustand.sicherungen).toEqual(['<falsche-wurzel/>']);
    expect(zustand.xml).toContain('kurztitel="Anderes"');
    expect(zustand.xml).toContain('pruefstatus="aktuell"');
  },
);

it('beendet die fehlerhafte Quelle vor dem Warten auf andere Quellen und übernimmt erst danach', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  const b = await kern.merkePruefpflichtigeAenderungVor();
  zustand.warteQuellen = async () => {
    expect(zustand.quellen.has(a)).toBe(false);
    expect(zustand.quellen.has(b)).toBe(true);
    expect(invoke.mock.calls.map(([befehl]) => befehl)).not.toContain(
      'pruefvorgang_wiederholung_uebernehmen',
    );
    await kern.schliessePruefpflichtigeQuelleAb(b, 'geaendert');
    zustand.xml = zustand.xml!.replace(
      '<markierungskonflikte',
      '<markierungskonflikte frisch="nach-quelle"',
    );
  };
  await kern.schliessePruefpflichtigeQuelleAb(a, 'fehlgeschlagen');
  const speicher = await ladeSpeicherMitKette();
  await speicher.reiheInPruefungsKetteEin(async () => undefined);
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  expect(zustand.xml).toContain('frisch="nach-quelle"');
  expect(
    invoke.mock.calls.filter(([befehl]) => befehl === 'pruefvorgang_wiederholung_uebernehmen'),
  ).toHaveLength(1);
});
it('gibt einen fehlgeschlagenen Abschluss nach gespeichertem Quellinhalt nur als false weiter', async () => {
  const kern = await kanal();
  const a = await kern.merkePruefpflichtigeAenderungVor();
  zustand.abschlussFehler = Error('Abschlusstransport');
  await expect(kern.schliessePruefpflichtigeQuelleAb(a, 'geaendert')).resolves.toBe(false);
  await (await ladeSpeicherMitKette()).reiheInPruefungsKetteEin(async () => undefined);
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  expect(zustand.quellen.size).toBe(0);
});
it('erhält sichtbaren Fehler und Vollbedarf bei zurückgewiesener nativer Übernahme', async () => {
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  const original = Error('Prüfquelle');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockRejectedValueOnce(original);
  zustand.claimFehler = Error('Übernahme nicht erreichbar');
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await (
      await ladeSpeicherMitKette()
    ).pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'GG' })]);
    expect(zustand.vollbedarf).toBe(true);
    expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
    expect(gesetz.ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(1);
    expect(protokoll).toHaveBeenCalledWith('Vollwiederholung fehlgeschlagen:', {
      ausloesenderFehler: original,
      wiederholungsfehler: zustand.claimFehler,
    });
  } finally {
    protokoll.mockRestore();
  }
});

it('sammelt bei Quellfehlerabschluss ohne ursprünglichen Befund alle Quellen vor der Heilung', async () => {
  const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
  const refs = [gesetzesreferenz({ kurztitel: 'A' }), gesetzesreferenz({ kurztitel: 'B' })];
  const defekt = new Set(['A', 'B']);
  vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue(refs);
  vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockImplementation(async (ref) => {
    if (defekt.has(ref.kurztitel))
      throw new eintrag.BeschaedigteMarkierungsdateiFehler(ref, '<kaputt>');
    return [];
  });
  vi.mocked(eintrag.ladeEintraege).mockImplementation(async (ref) => {
    expect(zustand.gehalten).toBe(false);
    defekt.delete(ref.kurztitel);
    return [];
  });
  const kern = await kanal();
  const vorgang = await kern.merkePruefpflichtigeAenderungVor();
  await kern.schliessePruefpflichtigeQuelleAb(vorgang, 'fehlgeschlagen');
  const speicher = await ladeSpeicherMitKette();
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(eintrag.ladeEintraege).toHaveBeenCalledTimes(2);
  expect(
    invoke.mock.calls.filter(([b]) => b === 'pruefvorgang_wiederholung_uebernehmen'),
  ).toHaveLength(1);
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue([]);
  vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockResolvedValue([]);
});

it('übernimmt erfolgreichen Neuaufbau eines zweiten Fensters nach Quellenwarten ohne Doppelberechnung', async () => {
  const fensterA = await ladeSpeicherMitKette();
  vi.resetModules();
  const fensterB = await ladeSpeicherMitKette();
  expect(fensterA.reiheInPruefungsKetteEin).not.toBe(fensterB.reiheInPruefungsKetteEin);
  zustand.xml = '<kaputt/>';
  zustand.quellen.add('quelle');
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  zustand.warteQuellen = async () => {
    expect(zustand.sicherungen).toEqual(['<kaputt/>']);
    zustand.quellen.clear();
    await fensterB.pruefeAlleMarkierungen();
    zustand.xml = zustand.xml!.replace(
      '<markierungskonflikte',
      '<markierungskonflikte zweites="erhalten"',
    );
  };
  await fensterA.pruefeErforderlicheVollpruefung();
  expect(gesetz.ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(2);
  expect(zustand.xml).toContain('zweites="erhalten"');
  expect(zustand.vollbedarf).toBe(false);
});

it.each(['selektiv', 'anzeige'])(
  'erhält gescheiterten archivierten Neuaufbau bei späterem %s im zweiten Fenster',
  async (weg) => {
    const fensterA = await ladeSpeicherMitKette();
    const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
    zustand.xml = '<kaputt/>';
    vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung)
      .mockRejectedValueOnce(Error('Prüfquelle'))
      .mockRejectedValueOnce(Error('Wiederholungsquelle'));
    await expect(fensterA.pruefeErforderlicheVollpruefung()).rejects.toThrow('Prüfquelle');
    await fensterA.reiheInPruefungsKetteEin(async () => undefined);
    expect(zustand.xml).toContain('fehlgeschlagen');
    expect(zustand.verbraucht).toBe(true);
    vi.clearAllMocks();
    vi.resetModules();
    const fensterB = await ladeSpeicherMitKette();
    if (weg === 'selektiv')
      await fensterB.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
    else
      expect(
        (
          await (
            await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige')
          ).ladeMarkierungskonflikteFuerAnzeige()
        ).pruefstatus,
      ).toBe('fehlgeschlagen');
    expect(zustand.sicherungen).toEqual(['<kaputt/>']);
    expect(zustand.xml).toContain('fehlgeschlagen');
    expect(zustand.vollbedarf).toBe(true);
  },
);

it('fordert nach Archivierung mit gescheitertem Statusschreiben im zweiten Fenster einen Neuaufbau', async () => {
  const fensterA = await ladeSpeicherMitKette();
  zustand.xml = '<kaputt/>';
  zustand.schreibfehler = true;
  await expect(fensterA.pruefeErforderlicheVollpruefung()).rejects.toThrow('Schreiben');
  expect(zustand.xml).toBeUndefined();
  zustand.schreibfehler = false;
  vi.resetModules();
  const fensterB = await ladeSpeicherMitKette();
  await fensterB.pruefeEineMarkierungSelektiv(gesetzesreferenz({ kurztitel: 'BGB' }), 'x');
  expect(zustand.sicherungen).toEqual(['<kaputt/>']);
  expect(zustand.xml).toContain('aktuell');
  expect(zustand.vollbedarf).toBe(false);
});

it('erhält archivierte Sicherung und pending, wenn das vollständige Ergebnis nicht gespeichert werden kann', async () => {
  zustand.xml = '<kaputt/>';
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockImplementationOnce(async () => {
    zustand.schreibfehler = true;
    return [];
  });
  const speicher = await ladeSpeicherMitKette();
  await expect(speicher.pruefeErforderlicheVollpruefung()).rejects.toThrow('Schreiben');
  expect(zustand.sicherungen).toEqual(['<kaputt/>']);
  expect(zustand.xml).toContain('ausstehend');
  expect(zustand.vollbedarf).toBe(true);
});

it('wiederholt einen gescheiterten gezielten Auftrag einmal vollständig und wird aktuell', async () => {
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockRejectedValueOnce(Error('Gezielter Fehler'));
  const speicher = await ladeSpeicherMitKette();
  await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'GG' })]);
  expect(
    invoke.mock.calls.filter(([b]) => b === 'pruefvorgang_wiederholung_uebernehmen'),
  ).toHaveLength(1);
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  expect(zustand.vollbedarf).toBe(false);
});
it('begrenzt die gescheiterte Vollwiederholung und ermöglicht danach manuellen Erfolg', async () => {
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung)
    .mockRejectedValueOnce(Error('Gezielter Fehler'))
    .mockRejectedValueOnce(Error('Vollfehler'));
  const speicher = await ladeSpeicherMitKette();
  await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'GG' })]);
  expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
  expect(zustand.verbraucht).toBe(true);
  expect(
    invoke.mock.calls.filter(([b]) => b === 'pruefvorgang_wiederholung_uebernehmen'),
  ).toHaveLength(1);
  await speicher.pruefeAlleMarkierungen();
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
});

it('teilt die einmalige Übernahme zwischen zwei unabhängig geladenen Fenstern', async () => {
  const fensterA = await ladeSpeicherMitKette();
  vi.resetModules();
  const fensterB = await ladeSpeicherMitKette();
  expect(fensterA.reiheInPruefungsKetteEin).not.toBe(fensterB.reiheInPruefungsKetteEin);
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung)
    .mockRejectedValueOnce(Error('Fenster A'))
    .mockRejectedValueOnce(Error('Fenster B'));
  await Promise.all([
    fensterA.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'GG' })]),
    fensterB.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]),
  ]);
  expect(gesetz.ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(4);
  expect(
    invoke.mock.calls.filter(([b]) => b === 'pruefvorgang_wiederholung_uebernehmen'),
  ).toHaveLength(2);
  expect(
    invoke.mock.calls.filter(([b]) => b === 'pruefvorgang_vollpruefung_abschliessen'),
  ).toHaveLength(1);
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
});

it.each(['manuell', 'manuell nach Budgetverbrauch', 'erforderlich'])(
  'heilt mehrere bekannte Markierungsquellen außerhalb der Konfliktsperre und prüft frisch vollständig: %s',
  async (auftrag) => {
    const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
    const refs = [
      gesetzesreferenz({ kurztitel: 'A' }),
      { kurztitel: 'B', normgeber: 'de-bund' as const },
    ];
    const defekt = new Set(['A', 'B']);
    vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue(refs);
    vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockImplementation(async (ref) => {
      if (defekt.has(ref.kurztitel))
        throw new eintrag.BeschaedigteMarkierungsdateiFehler(ref, '<kaputt>');
      return [];
    });
    vi.mocked(eintrag.ladeEintraege).mockImplementation(async (ref) => {
      expect(zustand.gehalten).toBe(false);
      expect(zustand.verbraucht).toBe(true);
      defekt.delete(ref.kurztitel);
      return [];
    });
    const speicher = await ladeSpeicherMitKette();
    if (auftrag === 'manuell nach Budgetverbrauch') zustand.verbraucht = true;
    if (auftrag === 'erforderlich') {
      zustand.xml = undefined;
      await speicher.pruefeErforderlicheVollpruefung();
    } else await speicher.pruefeAlleMarkierungen();
    expect(eintrag.ladeEintraege).toHaveBeenCalledTimes(2);
    expect(eintrag.ladeEintraege).toHaveBeenCalledWith(refs[1], expect.any(Function));
    expect(zustand.xml).toContain('pruefstatus="aktuell"');
    expect(zustand.vollbedarf).toBe(false);
    vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue([]);
    vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockResolvedValue([]);
  },
);

it('heilt Referenzscan-Befunde nach vollständiger Sammlung und übergeht eigene eingereihte Ereignisse', async () => {
  const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
  const refs = [gesetzesreferenz({ kurztitel: 'A' }), gesetzesreferenz({ kurztitel: 'B' })];
  const defekt = new Set(['A', 'B']);
  vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue(refs);
  vi.mocked(eintrag.leseMarkierungsXMLFuerPruefung).mockImplementation(async (ref) => {
    throw new eintrag.BeschaedigteMarkierungsdateiFehler(ref, '<kaputt>');
  });
  vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockImplementation(async (ref) => {
    if (defekt.has(ref.kurztitel))
      throw new eintrag.BeschaedigteMarkierungsdateiFehler(ref, '<kaputt>');
    return [];
  });
  const speicher = await ladeSpeicherMitKette();
  let ereignis: Promise<unknown> | undefined;
  vi.mocked(eintrag.ladeEintraege).mockImplementation(async (ref) => {
    expect(zustand.gehalten).toBe(false);
    defekt.delete(ref.kurztitel);
    ereignis = speicher.reiheInPruefungsKetteEin(async () => {});
    return [];
  });
  await speicher.pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'Ziel' })]);
  await ereignis;
  expect(eintrag.ladeEintraege).toHaveBeenCalledTimes(2);
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue([]);
  vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockResolvedValue([]);
});

it('lässt neue Beschädigung in frischer Vollprüfung sichtbar, ohne zweite Heilungsrunde', async () => {
  const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
  let geheilt = false;
  vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockImplementation(async () => [
    gesetzesreferenz({ kurztitel: geheilt ? 'B' : 'A' }),
  ]);
  vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockImplementation(async (ref) => {
    if (ref.kurztitel === 'A' && geheilt) return [];
    throw new eintrag.BeschaedigteMarkierungsdateiFehler(ref, '<kaputt>');
  });
  vi.mocked(eintrag.ladeEintraege).mockImplementation(async () => {
    geheilt = true;
    return [];
  });
  const speicher = await ladeSpeicherMitKette();
  await expect(speicher.pruefeAlleMarkierungen()).rejects.toMatchObject({
    gesetz: gesetzesreferenz({ kurztitel: 'B' }),
  });
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(eintrag.ladeEintraege).toHaveBeenCalledTimes(1);
  expect(zustand.verbraucht).toBe(true);
  expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
  vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue([]);
  vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockResolvedValue([]);
});

it.each(['aktuell', 'ausstehend', 'fehlgeschlagen', 'statuslos', 'kaputt', 'fehlt'])(
  'bereitet nur den Status vor und prüft beim Start einmal vollständig: %s',
  async (status) => {
    vi.resetModules();
    zustand.label = 'main';
    zustand.browser = false;
    zustand.xml =
      status === 'fehlt'
        ? undefined
        : status === 'kaputt'
          ? '<kaputt>'
          : status === 'statuslos'
            ? '<markierungskonflikte/>'
            : `<markierungskonflikte pruefstatus="${status}"/>`;
    const speicher = await ladeSpeicherMitKette();
    const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
    const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
    await Promise.all([
      speicher.bereiteMarkierungsStartPruefungVor(),
      speicher.bereiteMarkierungsStartPruefungVor(),
    ]);
    expect(gesetz.ladeAlleGesetzeFuerPruefung).not.toHaveBeenCalled();
    expect(eintrag.ermittleGesetzeMitMarkierungen).not.toHaveBeenCalled();
    expect(zustand.vollbedarf).toBe(status !== 'aktuell');
    await Promise.all([
      speicher.pruefeMarkierungenBeimStart(),
      speicher.pruefeMarkierungenBeimStart(),
    ]);
    expect(gesetz.ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(status === 'aktuell' ? 0 : 2);
    expect(
      invoke.mock.calls.filter(([befehl]) => befehl === 'pruefvorgang_vollpruefung_abschliessen'),
    ).toHaveLength(status === 'aktuell' ? 0 : 1);
    expect(zustand.vollbedarf).toBe(false);
    expect(zustand.xml).toContain('pruefstatus="aktuell"');
  },
);
it.each(['fenster-1', 'verweismarkierung-1', 'markierungskonflikte', 'browser'])(
  'startet keinen Neuaufbau außerhalb des initialen Hauptfensters: %s',
  async (label) => {
    vi.resetModules();
    zustand.label = label;
    zustand.browser = label === 'browser';
    zustand.xml = undefined;
    const speicher = await ladeSpeicherMitKette();
    await speicher.bereiteMarkierungsStartPruefungVor();
    await speicher.pruefeMarkierungenBeimStart();
    expect(invoke).not.toHaveBeenCalled();
    zustand.browser = false;
  },
);
it('behält Lesefehler sichtbar und versucht beim Startabschluss begrenzt erneut', async () => {
  vi.resetModules();
  zustand.label = 'main';
  zustand.lesefehler = true;
  const original = zustand.xml;
  const speicher = await ladeSpeicherMitKette();
  const { zeigeBanner } = await import('@/lib/banner/banner.index');
  await expect(speicher.bereiteMarkierungsStartPruefungVor()).rejects.toThrow('Lesen');
  expect(zustand.vollbedarf).toBe(true);
  expect(zustand.xml).toBe(original);
  expect(zeigeBanner).toHaveBeenCalled();
  await expect(speicher.pruefeMarkierungenBeimStart()).rejects.toThrow('Lesen');
  await speicher.reiheInPruefungsKetteEin(async () => {});
  const anzahl = invoke.mock.calls.length;
  await expect(speicher.pruefeMarkierungenBeimStart()).rejects.toThrow('Lesen');
  expect(invoke).toHaveBeenCalledTimes(anzahl);
  expect(zustand.xml).toBe(original);
});

it('wartet beim Start außerhalb der Sperre und berücksichtigt den inzwischen abgeschlossenen Vollstand', async () => {
  vi.resetModules();
  zustand.label = 'main';
  zustand.xml = '<markierungskonflikte pruefstatus="ausstehend"/>';
  const speicher = await ladeSpeicherMitKette();
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  await speicher.bereiteMarkierungsStartPruefungVor();
  zustand.quellen.add('laufend');
  let weiter!: () => void;
  zustand.warteQuellen = () =>
    new Promise<void>((resolve) => {
      weiter = resolve;
    });
  const abschluss = speicher.pruefeMarkierungenBeimStart();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('pruefvorgang_quellen_abwarten', {}));
  expect(zustand.gehalten).toBe(false);
  expect(gesetz.ladeAlleGesetzeFuerPruefung).not.toHaveBeenCalled();
  zustand.quellen.clear();
  zustand.vollbedarf = false;
  zustand.xml = '<markierungskonflikte pruefstatus="aktuell" zusatz="frisch"/>';
  weiter();
  await abschluss;
  expect(gesetz.ladeAlleGesetzeFuerPruefung).not.toHaveBeenCalled();
  expect(zustand.xml).toContain('zusatz="frisch"');
});

it('erhält beim gescheiterten Startlauf Befunde und begrenzt die automatische Wiederholung', async () => {
  vi.resetModules();
  zustand.label = 'main';
  zustand.xml =
    '<markierungskonflikte pruefstatus="fehlgeschlagen"><gesetz kurztitel="Alt" normgeber="de-bund"/></markierungskonflikte>';
  const speicher = await ladeSpeicherMitKette();
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockRejectedValue(new Error('Quelle unlesbar'));
  await speicher.bereiteMarkierungsStartPruefungVor();
  await expect(speicher.pruefeMarkierungenBeimStart()).rejects.toThrow('Quelle unlesbar');
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
  expect(zustand.xml).toContain('kurztitel="Alt"');
  expect(zustand.vollbedarf).toBe(true);
  expect(gesetz.ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(2);
  await expect(speicher.pruefeMarkierungenBeimStart()).rejects.toThrow('Quelle unlesbar');
  expect(gesetz.ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(2);
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockResolvedValue([]);
  await speicher.pruefeAlleMarkierungen();
  expect(zustand.xml).toContain('pruefstatus="aktuell"');
  expect(zustand.vollbedarf).toBe(false);
});

it.each(
  ['Anzeige', 'direkte Verifikation'].flatMap((weg) =>
    ['beschädigt', 'repariert', 'entfernt', 'Fremdneuaufbau'].map((quelle) => ({ weg, quelle })),
  ),
)(
  'entscheidet nach neuer Fremdquelle frisch vor der Heilung: $weg / $quelle',
  async ({ weg, quelle }) => {
    const fensterA = await ladeSpeicherMitKette();
    const anzeigeA =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    vi.resetModules();
    const fensterB = await ladeSpeicherMitKette();
    expect(fensterA.reiheInPruefungsKetteEin).not.toBe(fensterB.reiheInPruefungsKetteEin);
    const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
    const grundlage = gesetzDarstellung({
      kurztitel: 'BGB',
      langtitel: 'BGB',
      hatGliederungsartikel: false,
      elemente: [],
    });
    let defekt = true;
    const schaden = new gesetz.BeschaedigteGesetzdateiFehler(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'BGB_de-bund',
      '<kaputt>',
      'beschaedigt',
    );
    vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockImplementation(async () => {
      if (defekt) throw schaden;
      return quelle === 'entfernt' ? [] : [grundlage];
    });
    vi.mocked(gesetz.pruefeGesetzDatei).mockImplementation(async () =>
      defekt
        ? { status: 'ungueltig', dateiBasis: 'BGB_de-bund', inhalt: '<kaputt>' }
        : quelle === 'entfernt'
          ? { status: 'fehlt', dateiBasis: 'BGB_de-bund' }
          : {
              status: 'gueltig',
              dateiBasis: 'BGB_de-bund',
              inhalt: '<gesetz/>',
              gesetz: grundlage,
            },
    );
    vi.mocked(gesetz.sichereUngueltigeGesetzDatei).mockImplementation(async () => {
      expect(zustand.gehalten).toBe(false);
      expect(zustand.verbraucht).toBe(true);
      expect(zustand.quellen.size).toBe(0);
      defekt = false;
      return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
    });
    zustand.xml =
      '<markierungskonflikte pruefstatus="ausstehend"><gesetz kurztitel="Alt" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>';
    zustand.quellen.add('erste');
    let runden = 0;
    let zweite!: string;
    zustand.warteQuellen = async () => {
      if (runden === 2) {
        expect(zustand.verbraucht).toBe(true);
        expect(zustand.quellen.size).toBe(0);
        runden++;
        return;
      }
      // Die ursprüngliche Anzeige hat den Fehler abgeschlossen, aber weder
      // Budget noch Behandlung übernommen. Fenster B hat eine eigene lokale Queue.
      expect(zustand.verbraucht).toBe(false);
      expect(gesetz.sichereUngueltigeGesetzDatei).not.toHaveBeenCalled();
      if (++runden === 1) {
        await fensterB.reiheInPruefungsKetteEin(async (token) => {
          await invoke('pruefvorgang_quelle_abschliessen', { vorgaenge: ['erste'] });
          zweite = (await invoke('pruefvorgang_registrieren', { konfliktToken: token })) as string;
        }, true);
      } else {
        await fensterB.reiheInPruefungsKetteEin(async () => {
          await invoke('pruefvorgang_quelle_abschliessen', { vorgaenge: [zweite] });
          if (quelle !== 'beschädigt') defekt = false;
        }, true);
        if (quelle === 'Fremdneuaufbau') await fensterB.pruefeAlleMarkierungen();
      }
    };
    try {
      if (weg === 'Anzeige')
        expect(await anzeigeA.ladeMarkierungskonflikteFuerAnzeige()).toMatchObject({
          pruefstatus: 'aktuell',
        });
      else await anzeigeA.verifiziereBekannteKonflikte();
      expect(runden).toBe(quelle === 'Fremdneuaufbau' ? 2 : 3);
      expect(gesetz.sichereUngueltigeGesetzDatei).toHaveBeenCalledTimes(
        quelle === 'beschädigt' ? 1 : 0,
      );
      expect(
        invoke.mock.calls.filter(([b]) => b === 'pruefvorgang_wiederholung_uebernehmen'),
      ).toHaveLength(quelle === 'Fremdneuaufbau' ? 0 : 1);
      expect(zustand.xml).toContain('pruefstatus="aktuell"');
      expect(zustand.vollbedarf).toBe(false);
    } finally {
      vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockResolvedValue([]);
      zustand.warteQuellen = undefined;
    }
  },
);

it.each(
  ['Anzeige', 'direkte Verifikation', 'manuell'].flatMap((weg) =>
    [
      'Erfolg',
      'ohne Fremdneuaufbau',
      'Vollquellenfehler',
      'Anzeigefehler',
      'ausstehend',
      'fehlgeschlagen',
      'fehlt',
      'Vollbedarf',
      'neue Quelle',
    ].map((abschluss) => ({ weg, abschluss })),
  ),
)(
  'entscheidet nach begonnener Heilung frisch über Fremdneuaufbau: $weg / $abschluss',
  async ({ weg, abschluss }) => {
    const fensterA = await ladeSpeicherMitKette();
    const anzeigeA =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    vi.resetModules();
    const fensterB = await ladeSpeicherMitKette();
    expect(fensterA.reiheInPruefungsKetteEin).not.toBe(fensterB.reiheInPruefungsKetteEin);
    const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
    const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
    const kern = await import('@/lib/persistenz/kern/kern.index');
    const grundlage = gesetzDarstellung({
      kurztitel: 'BGB',
      langtitel: 'BGB',
      hatGliederungsartikel: false,
      elemente: [],
    });
    let defekt = true;
    let fremdAbgeschlossen = false;
    const schaden = new gesetz.BeschaedigteGesetzdateiFehler(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'BGB_de-bund',
      '<kaputt>',
      'beschaedigt',
    );
    vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockImplementation(async () => {
      if (defekt) throw schaden;
      if (fremdAbgeschlossen && abschluss === 'Anzeigefehler')
        throw Error('Anzeigequelle unlesbar');
      return [grundlage];
    });
    // BGB hat keinen bekannten Anzeigekonflikt. Die Vollprüfung muss dessen
    // Markierungen dennoch laden; eine anschließende Anzeige braucht nur Alt.
    vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue([
      gesetzesreferenz({ kurztitel: 'Alt' }),
      gesetzesreferenz({ kurztitel: 'BGB' }),
    ]);
    vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockImplementation(async (ref) => {
      if (fremdAbgeschlossen && abschluss === 'Vollquellenfehler' && ref.kurztitel === 'BGB')
        throw Error('Unnötige Vollquelle');
      return ref.kurztitel === 'Alt'
        ? [
            markierungsEintrag({
              bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
              typ: 'kommentar',
              ausgangsstelle: normAusgangsstelle('§ 1'),
              kommentarText: 'erhalten',
            }),
          ]
        : [];
    });
    vi.mocked(gesetz.pruefeGesetzDatei).mockImplementation(async () =>
      defekt
        ? { status: 'ungueltig', dateiBasis: 'BGB_de-bund', inhalt: '<kaputt>' }
        : {
            status: 'gueltig',
            dateiBasis: 'BGB_de-bund',
            inhalt: '<gesetz/>',
            gesetz: grundlage,
          },
    );
    vi.mocked(gesetz.sichereUngueltigeGesetzDatei).mockImplementation(async () => {
      expect(zustand.gehalten).toBe(false);
      expect(zustand.verbraucht).toBe(true);
      defekt = false;
      return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
    });
    zustand.xml =
      '<markierungskonflikte pruefstatus="ausstehend" zusatz="erhalten"><erweiterung wert="bleibt"/><gesetz kurztitel="Alt" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>';
    let fremdXml: string | undefined;
    let vollLadungen = 0;
    let gesetzLadungen = 0;
    let schreibungen = 0;
    let befehle = 0;
    let runden = 0;
    zustand.warteQuellen = async () => {
      expect(zustand.gehalten).toBe(false);
      if (defekt) return; // erster Übergang: noch ausstehende Budgetübernahme
      if (++runden > 1) {
        expect(abschluss).toBe('neue Quelle');
        await fensterB.reiheInPruefungsKetteEin(async () => {
          await invoke('pruefvorgang_quelle_abschliessen', { vorgaenge: ['neu'] });
        }, true);
        return;
      }
      expect(gesetz.sichereUngueltigeGesetzDatei).toHaveBeenCalledTimes(1);
      if (abschluss !== 'ohne Fremdneuaufbau') {
        await fensterB.pruefeAlleMarkierungen();
        expect(eintrag.ladeEintraegeFuerPruefung).toHaveBeenCalledWith(
          gesetzesreferenz({ kurztitel: 'BGB' }),
          expect.any(Function),
        );
      }
      if (abschluss === 'ausstehend' || abschluss === 'fehlgeschlagen')
        zustand.xml = zustand.xml!.replace('pruefstatus="aktuell"', `pruefstatus="${abschluss}"`);
      if (abschluss === 'fehlt') zustand.xml = undefined;
      if (abschluss === 'Vollbedarf') zustand.vollbedarf = true;
      if (abschluss === 'neue Quelle') zustand.quellen.add('neu');
      fremdXml = zustand.xml;
      gesetzLadungen = vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mock.calls.length;
      vollLadungen = vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mock.calls.length;
      schreibungen = vi.mocked(kern.appDatenSchreiben).mock.calls.length;
      befehle = invoke.mock.calls.length;
      fremdAbgeschlossen = true;
    };
    function pruefeUebernahme(): void {
      expect(gesetz.ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(gesetzLadungen + 1);
      expect(eintrag.ermittleGesetzeMitMarkierungen).toHaveBeenCalledTimes(vollLadungen);
      expect(kern.appDatenSchreiben).toHaveBeenCalledTimes(schreibungen);
      expect(zustand.xml).toBe(fremdXml);
      expect(invoke.mock.calls.slice(befehle).map(([b]) => b)).not.toContain('pruefvorgang_fehler');
      expect(invoke.mock.calls.slice(befehle).map(([b]) => b)).not.toContain(
        'pruefvorgang_vollpruefung_abschliessen',
      );
      expect(zustand.xml).toContain('zusatz="erhalten"');
      expect(zustand.xml).toContain('wert="bleibt"');
    }
    async function pruefeErgebnis(auftrag: Promise<unknown>): Promise<void> {
      const erfolgsUebernahme =
        weg !== 'manuell' && ['Erfolg', 'Vollquellenfehler', 'neue Quelle'].includes(abschluss);
      if (
        abschluss === 'Anzeigefehler' ||
        (weg === 'manuell' && abschluss === 'Vollquellenfehler')
      ) {
        if (weg === 'Anzeige')
          expect(await auftrag).toMatchObject({ pruefstatus: 'fehlgeschlagen' });
        else
          await expect(auftrag).rejects.toThrow(
            abschluss === 'Anzeigefehler' ? 'Anzeigequelle unlesbar' : 'Unnötige Vollquelle',
          );
        expect(zustand.xml).toContain('pruefstatus="fehlgeschlagen"');
        expect(zustand.xml).toContain('kurztitel="Alt"');
        if (weg !== 'manuell')
          expect(eintrag.ermittleGesetzeMitMarkierungen).toHaveBeenCalledTimes(vollLadungen);
        return;
      }
      const ergebnis = await auftrag;
      if (weg === 'Anzeige')
        expect(ergebnis).toMatchObject({
          pruefstatus: 'aktuell',
          gesetze: [{ gesetz: gesetzesreferenz({ kurztitel: 'Alt' }) }],
        });
      expect(zustand.xml).toContain('pruefstatus="aktuell"');
      if (erfolgsUebernahme) pruefeUebernahme();
      else
        expect(vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mock.calls.length).toBeGreaterThan(
          vollLadungen,
        );
    }
    try {
      const auftrag =
        weg === 'Anzeige'
          ? anzeigeA.ladeMarkierungskonflikteFuerAnzeige()
          : weg === 'manuell'
            ? fensterA.pruefeAlleMarkierungen()
            : anzeigeA.verifiziereBekannteKonflikte();
      await pruefeErgebnis(auftrag);
      expect(runden).toBe(abschluss === 'neue Quelle' ? 2 : 1);
    } finally {
      vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockResolvedValue([]);
      vi.mocked(eintrag.ermittleGesetzeMitMarkierungen).mockResolvedValue([]);
      vi.mocked(eintrag.ladeEintraegeFuerPruefung).mockResolvedValue([]);
      zustand.warteQuellen = undefined;
    }
  },
);

async function ladeSpeicherMitKette() {
  const [speicher, kette, selektiv] = await Promise.all([
    import('./markierungskonflikteSpeicher'),
    import('./markierungskonflikteSpeicher.pruefkette'),
    import('./markierungskonflikteSpeicher.selektiv'),
  ]);
  return {
    ...speicher,
    reiheInPruefungsKetteEin: kette.reiheInPruefungsKetteEin,
    pruefeEineMarkierungSelektiv: selektiv.pruefeEineMarkierungSelektiv,
  };
}
