// markierungskonflikteSpeicher.test.ts
//
// Tests für die I/O-Orchestrierung in markierungskonflikteSpeicher.ts
// (fuehrePruefungAus/fuehreEinzelPruefungAus/ermittleReferenzierende über die
// öffentlichen Funktionen pruefeMarkierungenSelektiv/
// pruefeEineMarkierungSelektiv/pruefeAlleMarkierungen, sowie die
// serialisierende pruefungsKette über reiheInPruefungsKetteEin). Die reine
// Entscheidungs-/Diff-Logik selbst ist bereits vollständig in
// markierungskonflikteSpeicher.entscheidung.test.ts abgedeckt (siehe dortiger
// Kopfkommentar) – hier daher bewusst NUR die zusätzliche Orchestrierung:
// Referenz-Scan, Set/Delete-Weiterverarbeitung, Serialisierung,
// Fenster-Trigger.
//
// Real bleiben (siehe Kopfkommentar markierungskonflikteSpeicher.ts):
// markierungskonflikteXML.ts, markierungskonflikteSpeicher.entscheidung.ts,
// markierungskonflikteSpeicher.dateiZugriff.ts, markierungsXML.ts
// (escapeXML/unescapeXML), domain/markierungskonfliktPruefung.ts. Gemockt:
// appDatenZugriff (In-Memory), gesetzSpeicher.ladeAlleGesetzeFuerPruefung,
// markierungSpeicher.ladeEintraege, nichtamtlicheTitelSpeicher.
// existierenNichtamtlicheTitelFuerPruefung, gesetzSpeicherEreignisse.
// beiSpeicherBatchAbgeschlossen, markierungskonflikteSpeicher.fensterOeffnen.
// planeFensterOeffnen sowie '@tauri-apps/api/event' (transitiv über den
// echten dateiZugriff.ts benötigt).
import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

// Reine, ungemockte Funktion – wird hier nur genutzt, um in den
// pruefeEineMarkierungSelektiv-Tests den ECHTEN `schluessel` einer Fixture
// zu berechnen (siehe patchEinzelnenEigenenEintrag: ein nicht passender
// Schlüssel führt NICHT zu pruefeMarkierung(), sondern zur reinen
// Alt-Übernahme – ein hartkodierter Platzhalter-Schlüssel würde die
// eigentliche Konflikt-Neuberechnung also gar nicht auslösen).

import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { appDatenOrdnerLesen, appDatenSchreiben } from '@/lib/persistenz/kern/kern.index';
import { initialisiereMarkierungen } from './markierungskonflikteSpeicher';
import {
  pruefeEineMarkierungSelektiv,
  pruefeMarkierungenSelektiv,
} from './markierungskonflikteSpeicher.selektiv';
import { pruefeAlleMarkierungen } from './markierungskonflikteSpeicher.pruefsteuerung';
import { reiheInPruefungsKetteEin } from './markierungskonflikteSpeicher.pruefkette';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const DATEI = 'markierungskonflikte.xml';
const appDatenSpeicher = new Map<string, string>();

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitDateiSperre: vi.fn(async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('konflikttoken'),
  ),
  appDatenExistiert: vi.fn((pfad: string) =>
    Promise.resolve(
      appDatenSpeicher.has(pfad) ||
        [...appDatenSpeicher.keys()].some((k) => k.startsWith(`${pfad}/`)),
    ),
  ),
  appDatenLesen: vi.fn((pfad: string) => {
    const inhalt = appDatenSpeicher.get(pfad);
    if (inhalt === undefined) return Promise.reject(new Error('Datei nicht gefunden'));
    return Promise.resolve(inhalt);
  }),
  appDatenSchreiben: vi.fn((pfad: string, inhalt: string, token?: string) => {
    if (pfad === DATEI) expect(token).toBe('konflikttoken');
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenLoeschen: vi.fn((pfad: string, token?: string) => {
    if (pfad === DATEI) expect(token).toBe('konflikttoken');
    if (!appDatenSpeicher.has(pfad)) return Promise.reject(new Error('nicht gefunden'));
    appDatenSpeicher.delete(pfad);
    return Promise.resolve();
  }),
  // Vereinfachung ggü. dem echten Tauri-readDir: liefert leer/reject sowohl
  // bei tatsächlich fehlendem Ordner als auch bei vorhandenem, aber leerem
  // Ordner – für fuehrePruefungAus/ermittleReferenzierende äquivalent, da
  // beide Fälle dort identisch (try/catch -> leere Liste) behandelt werden.
  appDatenOrdnerLesen: vi.fn((ordner: string) => {
    const praefix = `${ordner}/`;
    const namen = [...appDatenSpeicher.keys()]
      .filter((k) => k.startsWith(praefix))
      .map((k) => ({ name: k.slice(praefix.length) }));
    if (namen.length === 0) return Promise.reject(new Error('Ordner existiert nicht'));
    return Promise.resolve(namen);
  }),
}));

const nativerStand = vi.hoisted(() => ({ vollbedarf: false, fehler: false, verbraucht: false }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (befehl: string) => {
    if (befehl === 'datei_sperre_unterbrechen') return;
    if (befehl === 'datei_sperre_fortsetzen') return true;
    if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
      if (!nativerStand.fehler || nativerStand.verbraucht) return false;
      nativerStand.verbraucht = true;
      return true;
    }
    if (befehl === 'pruefvorgang_fehler') nativerStand.fehler = true;
    if (befehl === 'pruefvorgang_vollbedarf' || befehl === 'pruefvorgang_fehler')
      nativerStand.vollbedarf = true;
    if (befehl === 'pruefvorgang_vollpruefung_abschliessen') {
      nativerStand.vollbedarf = false;
      nativerStand.fehler = false;
      nativerStand.verbraucht = false;
    }
    return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: nativerStand.vollbedarf };
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(() => Promise.resolve()),
}));

const ladeAlleGesetzeFuerPruefung =
  vi.fn<typeof import('@/test/tabs/gesetzSpeicherTestzugang').ladeAlleGesetzeFuerPruefung>();
const ladeEintraegeSpeicher = new Map<string, MarkierungsEintrag[]>();
const ladeEintraege = vi.fn((gesetz: Gesetzesreferenz) =>
  Promise.resolve(ladeEintraegeSpeicher.get(gesetz.kurztitel) ?? []),
);
vi.mock('@/lib/markierungen/eintrag/eintrag.index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/markierungen/eintrag/eintrag.index')>();
  return {
    ...actual,
    ladeEintraegeFuerPruefung: (kurztitel: Gesetzesreferenz) => ladeEintraege(kurztitel),
    MARKIERUNGEN_ORDNER: 'markierungen',
  };
});

const existierenNichtamtlicheTitelFuerPruefung = vi.fn<
  (k: Gesetzesreferenz[]) => Promise<Set<string>>
>(() => Promise.resolve(new Set<string>()));

// vi.hoisted statt eines einfachen `let`: die gemockte
// gesetzSpeicherEreignisse.beiSpeicherBatchAbgeschlossen() wird bereits beim
// (hier untenstehenden) Import von markierungskonflikteSpeicher.ts aufgerufen
// (dortiger Modul-Top-Level-Aufruf) – ESM wertet Imports vor dem restlichen
// Datei-Body aus, ein normales `let` wäre zu diesem Zeitpunkt noch im TDZ.
const zustand = vi.hoisted(() => ({
  subscriber: undefined as ((betroffene: Gesetzesreferenz[]) => void) | undefined,
  titelSubscriber: undefined as ((kurztitel: Gesetzesreferenz) => void) | undefined,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetzeFuerPruefung: (...args: Parameters<typeof ladeAlleGesetzeFuerPruefung>) =>
    ladeAlleGesetzeFuerPruefung(...args),
  ladeGesetzeFuerPruefung: async (referenzen: Gesetzesreferenz[]) =>
    referenzen.length === 0 ? [] : [...(await ladeAlleGesetzeFuerPruefung())],
  existierenNichtamtlicheTitelFuerPruefung: (k: Gesetzesreferenz[]) =>
    existierenNichtamtlicheTitelFuerPruefung(k),
  beiSpeicherBatchAbgeschlossen: vi.fn((fn: (betroffene: Gesetzesreferenz[]) => void) => {
    zustand.subscriber = fn;
    return () => {};
  }),
  beiNichtamtlicheTitelGeschrieben: vi.fn((fn: (kurztitel: Gesetzesreferenz) => void) => {
    zustand.titelSubscriber = fn;
    return () => {};
  }),
}));

const planeFensterOeffnen = vi.fn();
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.fensterOeffnen',
  () => ({
    planeFensterOeffnen: (...args: unknown[]) => planeFensterOeffnen(...args),
  }),
);

// ---------------------------------------------------------------------------
// Fixture-Helfer (analog zu markierungskonflikteSpeicher.entscheidung.test.ts)
// ---------------------------------------------------------------------------

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function norm(xmlId: string, bezeichnung: string): NormDarstellung {
  return normaleNorm({ id: naechsteId(), xmlId, bezeichnung, absaetze: [] });
}

function gesetz(kurztitel: string, normen: NormDarstellung[] = []): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: normen.map((n) => ({ typ: 'norm' as const, data: n })),
  });
}

function pauschalerKommentarEintrag(bezeichnung: string): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
  }) as MarkierungsEintrag;
}

function zielnorm(overrides: Parameters<typeof zielnormTestdaten>[0]): Verweisziel {
  return zielnormTestdaten(overrides);
}

function verweisEintrag(bezeichnung: string, verweisziele: Verweisziel[]): MarkierungsEintrag {
  return markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
    verweisinhalt: { verweistext: 'x', verweisziele },
  });
}

function bestehenderBlock(kurztitel: string): string {
  return [
    '<markierungskonflikte pruefstatus="aktuell">',
    `    <gesetz kurztitel="${kurztitel}" normgeber="de-bund">`,
    '        <konflikt typ="gesetz-fehlt"/>',
    '    </gesetz>',
    '</markierungskonflikte>',
  ].join('\n');
}

beforeEach(async () => {
  await reiheInPruefungsKetteEin(async () => undefined);
  nativerStand.vollbedarf = false;
  nativerStand.fehler = false;
  nativerStand.verbraucht = false;
  initialisiereMarkierungen();
  appDatenSpeicher.clear();
  // Selektivität setzt einen vollständigen gültigen Ausgangsbestand voraus.
  appDatenSpeicher.set(DATEI, '<markierungskonflikte pruefstatus="aktuell"/>');
  ladeEintraegeSpeicher.clear();
  vi.clearAllMocks();
  ladeAlleGesetzeFuerPruefung.mockResolvedValue([]);
  existierenNichtamtlicheTitelFuerPruefung.mockResolvedValue(new Set());
  planeFensterOeffnen.mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Modul-Anmeldung bei gesetzSpeicherEreignisse
// ---------------------------------------------------------------------------

describe('Anmeldung bei beiSpeicherBatchAbgeschlossen', () => {
  it('meldet ausdrücklich einen Subscriber an, der denselben selektiven Prüflauf auslöst', async () => {
    expect(zustand.subscriber).toBeTypeOf('function');
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]);
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('nicht-vorhanden')]);

    zustand.subscriber!([gesetzesreferenz({ kurztitel: 'BGB' })]);

    await vi.waitFor(() => {
      expect(appDatenSpeicher.get(DATEI)).toContain('kurztitel="BGB"');
    });
  });
});

// ---------------------------------------------------------------------------
// pruefeMarkierungenSelektiv
// ---------------------------------------------------------------------------

describe('pruefeMarkierungenSelektiv', () => {
  it('leeres Set -> sofortiges No-Op ohne jeden I/O-Zugriff', async () => {
    await pruefeMarkierungenSelektiv([]);
    expect(ladeAlleGesetzeFuerPruefung).not.toHaveBeenCalled();
  });

  it('schreibt für ein betroffenes Gesetz mit nicht mehr passender Markierung einen neuen eigenen Konfliktblock', async () => {
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]);
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('nicht-mehr-vorhanden')]);

    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);

    expect(appDatenSpeicher.get(DATEI)).toContain('kurztitel="BGB"');
  });

  it('löscht einen bestehenden Block vollständig, wenn für das betroffene Gesetz keine Markierungen mehr existieren', async () => {
    appDatenSpeicher.set(DATEI, bestehenderBlock('BGB'));
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]);
    // ladeEintraegeSpeicher bleibt für 'BGB' leer:

    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);

    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus=');
    expect(appDatenSpeicher.get(DATEI)).not.toContain('<gesetz ');
  });

  it('ermittelt referenzierende Gesetze über den Rohtext-Vorfilter und patcht NUR deren Zielkonflikt zum betroffenen Gesetz, nicht deren eigenen Konflikt', async () => {
    // BGB verweist im (rohen) Markierungs-XML explizit auf StGB:
    appDatenSpeicher.set(
      'markierungen/BGB_de-bund-markierungen.xml',
      '<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>Ziel</verweistext><verweisziel><gesetz normgeber="de-bund">StGB</gesetz><verweistextZeichenbereich start="0" ende="4"/></verweisziel></verweisinhalt></verweismarkierung></inhalt></markierungen>',
    );
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB')]); // StGB existiert NICHT (mehr)
    ladeEintraegeSpeicher.set('StGB', []); // StGB selbst gerade gelöscht -> keine eigenen Einträge mehr
    ladeEintraegeSpeicher.set('BGB', [
      verweisEintrag('1', [
        zielnorm({
          bezeichnung: '1',
          gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
          elementstand: { textlaenge: 5 },
        }),
      ]),
    ]);

    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'StGB' })]);

    const geschrieben = appDatenSpeicher.get(DATEI)!;
    expect(geschrieben).toContain('<gesetz kurztitel="BGB" normgeber="de-bund">');
    expect(geschrieben).toContain(
      '<konflikt typ="ziel-gesetz-fehlt" gesetz="StGB" normgeber="de-bund"/>',
    );
    // StGB selbst hat keine Markierungen mehr -> kein eigener <gesetz>-Block:
    expect(geschrieben).not.toContain('<gesetz kurztitel="StGB" normgeber="de-bund">');
  });

  it('nurEigeneMarkierungen: true überspringt den Referenz-Scan komplett (appDatenOrdnerLesen für den Markierungen-Ordner wird nicht aufgerufen)', async () => {
    appDatenSpeicher.set(
      'markierungen/StGB_de-bund-markierungen.xml',
      '<verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><gesetz normgeber="de-bund">BGB</gesetz></verweismarkierung>',
    );
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB'), gesetz('StGB')]);
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('433')]);

    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })], {
      nurEigeneMarkierungen: true,
    });

    expect(vi.mocked(appDatenOrdnerLesen)).not.toHaveBeenCalled();
    expect(appDatenSpeicher.get(DATEI) ?? '').not.toContain('kurztitel="StGB"');
  });

  it('öffnet das Markierungskonflikte-Fenster bei einem neu entdeckten Konflikt', async () => {
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([]); // BGB existiert nicht (mehr) -> gesetzFehlt
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('433')]);

    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);

    expect(planeFensterOeffnen).toHaveBeenCalledTimes(1);
  });

  it('öffnet das Fenster NICHT bei reiner Auflösung eines bestehenden Konflikts', async () => {
    appDatenSpeicher.set(DATEI, bestehenderBlock('BGB'));
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]); // BGB existiert jetzt wieder
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('433')]); // passt wieder -> kein Konflikt mehr

    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);

    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus=');
    expect(appDatenSpeicher.get(DATEI)).not.toContain('<gesetz ');
    expect(planeFensterOeffnen).not.toHaveBeenCalled();
  });

  it('zwei überlappende Aufrufe laufen serialisiert: der zweite liest markierungskonflikte.xml erst NACHDEM der erste fertig geschrieben hat', async () => {
    const reihenfolge: string[] = [];
    let ersterFreigeben!: () => void;
    const wartenAufFreigabe = new Promise<void>((r) => {
      ersterFreigeben = r;
    });

    let aufrufNr = 0;
    ladeEintraege.mockImplementation(async (gesetz: Gesetzesreferenz) => {
      aufrufNr += 1;
      if (aufrufNr === 1) {
        reihenfolge.push('erster-lauf-start');
        await wartenAufFreigabe;
        reihenfolge.push('erster-lauf-ende');
      } else {
        reihenfolge.push('zweiter-lauf');
      }
      return ladeEintraegeSpeicher.get(gesetz.kurztitel) ?? [];
    });
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([]);

    const ersterAufruf = pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
    const zweiterAufruf = pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'StGB' })]);

    ersterFreigeben();
    await ersterAufruf;
    await zweiterAufruf;

    expect(reihenfolge.indexOf('zweiter-lauf')).toBeGreaterThan(
      reihenfolge.indexOf('erster-lauf-ende'),
    );
  });

  it('ein Fehler in einem Lauf wird abgefangen und verhindert NICHT, dass ein nachfolgender Lauf trotzdem normal durchläuft', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ladeAlleGesetzeFuerPruefung.mockRejectedValueOnce(new Error('kaputt')).mockResolvedValue([]);

    await expect(
      pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]),
    ).resolves.toBeUndefined();
    ladeEintraegeSpeicher.set('StGB', [pauschalerKommentarEintrag('1')]);
    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'StGB' })]);

    expect(appDatenSpeicher.get(DATEI)).toContain('kurztitel="StGB"');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// pruefeEineMarkierungSelektiv
// ---------------------------------------------------------------------------

describe('pruefeEineMarkierungSelektiv', () => {
  it('unbekanntes Gesetz (nicht mehr geladen) -> No-Op, kein Schreiben', async () => {
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([]); // 'BGB' nicht enthalten

    await pruefeEineMarkierungSelektiv(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'irgendein-schluessel',
    );

    expect(vi.mocked(appDatenSchreiben)).not.toHaveBeenCalled();
  });

  it('keine Markierungen mehr für das Gesetz -> ein bestehender Block wird gelöscht', async () => {
    appDatenSpeicher.set(DATEI, bestehenderBlock('BGB'));
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]);
    // ladeEintraegeSpeicher bleibt für 'BGB' leer:

    await pruefeEineMarkierungSelektiv(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'irgendein-schluessel',
    );

    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus=');
    expect(appDatenSpeicher.get(DATEI)).not.toContain('<gesetz ');
  });

  it('Ergebnis unverändert gegenüber dem bestehenden Block -> appDatenSchreiben wird nicht (erneut) aufgerufen', async () => {
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]);
    const eintrag = pauschalerKommentarEintrag('433');
    ladeEintraegeSpeicher.set('BGB', [eintrag]); // passt -> kein Konflikt, kein vorheriger Block

    await pruefeEineMarkierungSelektiv(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      identitaetsSchluessel(eintrag),
    );

    expect(vi.mocked(appDatenSchreiben)).not.toHaveBeenCalled();
  });

  it('öffnet NIE das Markierungskonflikte-Fenster, selbst wenn dadurch ein neuer Konflikt entsteht', async () => {
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]);
    const eintrag = pauschalerKommentarEintrag('nicht-mehr-vorhanden');
    ladeEintraegeSpeicher.set('BGB', [eintrag]);

    await pruefeEineMarkierungSelektiv(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      identitaetsSchluessel(eintrag),
    );

    expect(appDatenSpeicher.get(DATEI)).toContain('kurztitel="BGB"');
    expect(planeFensterOeffnen).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pruefeAlleMarkierungen
// ---------------------------------------------------------------------------

describe('pruefeAlleMarkierungen', () => {
  it('entfernt verwaiste Alt-Blöcke zu inzwischen nicht mehr installierten/vorhandenen Gesetzen vollständig (Regressionstest für den im Kopfkommentar dokumentierten Bug)', async () => {
    appDatenSpeicher.set(DATEI, bestehenderBlock('Verwaist'));
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB', [norm('433', '§ 433')])]); // 'Verwaist' nicht mehr installiert
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('433')]); // passt -> kein Konflikt für BGB
    // kein 'markierungen/Verwaist_de-bund-markierungen.xml' mehr vorhanden

    await pruefeAlleMarkierungen();

    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus=');
    expect(appDatenSpeicher.get(DATEI)).not.toContain('<gesetz ');
  });

  it('erfasst auch Kurztitel aus vorhandenen Markierungs-Dateien, deren Gesetz nicht (mehr) installiert ist', async () => {
    appDatenSpeicher.set('markierungen/StGB_de-bund-markierungen.xml', '<markierungenen/>');
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([]); // StGB nicht (mehr) installiert
    ladeEintraegeSpeicher.set('StGB', [pauschalerKommentarEintrag('1')]); // Markierungen aber noch vorhanden -> gesetzFehlt

    await pruefeAlleMarkierungen();

    const geschrieben = appDatenSpeicher.get(DATEI);
    expect(geschrieben).toContain('kurztitel="StGB"');
    expect(geschrieben).toContain('<konflikt typ="gesetz-fehlt"/>');
  });
});

// ---------------------------------------------------------------------------
// reiheInPruefungsKetteEin
// ---------------------------------------------------------------------------

describe('reiheInPruefungsKetteEin', () => {
  it('reicht das Ergebnis des übergebenen Laufs unverändert durch', async () => {
    const ergebnis = await reiheInPruefungsKetteEin(() => Promise.resolve('mein-ergebnis'));
    expect(ergebnis).toBe('mein-ergebnis');
  });

  it('fängt einen Fehler des Laufs ab und liefert undefined statt zu werfen', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ergebnis = await reiheInPruefungsKetteEin(() => Promise.reject(new Error('kaputt')));
    expect(ergebnis).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('manuelle Fehlerweitergabe', () => {
  it('reicht Schreibfehler weiter und lässt nachfolgende Läufe weiterlaufen', async () => {
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB')]);
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('1')]);
    const fehler = new Error('Platte voll');
    await vi.mocked(appDatenSchreiben).withImplementation(
      async () => {
        throw fehler;
      },
      async () => {
        await expect(pruefeAlleMarkierungen()).rejects.toBe(fehler);
      },
    );
    await expect(
      pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]),
    ).resolves.toBeUndefined();
    expect(appDatenSpeicher.get(DATEI)).toContain('BGB');
  });
  it('reicht Ordnerlesefehler bei vorhandenem Ordner weiter', async () => {
    appDatenSpeicher.set('markierungen/BGB_de-bund-markierungen.xml', 'x');
    const fehler = new Error('Zugriff verweigert');
    await vi.mocked(appDatenOrdnerLesen).withImplementation(
      async () => {
        throw fehler;
      },
      async () => {
        await expect(pruefeAlleMarkierungen()).rejects.toBe(fehler);
      },
    );
  });
  it('reiht auch die Vorbereitung serialisiert ein und gibt deren Fehler weiter', async () => {
    let freigeben!: () => void;
    let meldeBeginn!: () => void;
    const begonnen = new Promise<void>((resolve) => {
      meldeBeginn = resolve;
    });
    const vorher = reiheInPruefungsKetteEin(
      () =>
        new Promise<void>((resolve) => {
          freigeben = resolve;
          meldeBeginn();
        }),
    );
    await begonnen;
    const fehler = new Error('Vorbereitung');
    ladeAlleGesetzeFuerPruefung.mockRejectedValue(fehler);
    const manuell = pruefeAlleMarkierungen();
    const pruefung = expect(manuell).rejects.toBe(fehler);
    expect(ladeAlleGesetzeFuerPruefung).not.toHaveBeenCalled();
    freigeben();
    await vorher;
    await pruefung;
    await expect(reiheInPruefungsKetteEin(() => Promise.resolve('weiter'))).resolves.toBe('weiter');
  });
});

describe('vollständige Prüfung mit Ladebefunden', () => {
  it.each([1, 2])(
    'bricht bei Ladebefunden im %s. Laden vor dem Schreiben ab',
    async (ladeversuch) => {
      const original = bestehenderBlock('BGB');
      appDatenSpeicher.set(DATEI, original);
      ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('1')]);
      if (ladeversuch === 2) ladeAlleGesetzeFuerPruefung.mockResolvedValueOnce([gesetz('BGB')]);
      ladeAlleGesetzeFuerPruefung.mockRejectedValue(
        new Error('Die Gesetze konnten nicht vollständig geladen werden.'),
      );
      await expect(pruefeAlleMarkierungen()).rejects.toThrow('nicht vollständig geladen');
      erwarteErhalteneFehlerbefunde(original);
      expect(appDatenSchreiben).toHaveBeenCalledExactlyOnceWith(
        DATEI,
        appDatenSpeicher.get(DATEI),
        'konflikttoken',
      );
      ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB')]);
      await expect(pruefeAlleMarkierungen()).resolves.toBeUndefined();
    },
  );
});

vi.mock('@/lib/import/import.index', () => ({ importiereGesetze: vi.fn() }));
vi.mock('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige', () => ({
  verifiziereBekannteKonflikte: vi.fn(),
}));
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktaktionen/markierungskonflikteAktionen',
  () => ({
    loescheMarkierungsDatei: vi.fn(() => Promise.resolve()),
  }),
);

it('reicht beim Sammellöschen den Fehler der Konfliktdatei weiter und erlaubt einen erneuten Versuch', async () => {
  const { loescheAlleMitKonflikten } =
    await import('@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.loeschen');
  const { appDatenSchreiben } = await import('@/lib/persistenz/kern/kern.index');
  const original = bestehenderBlock('BGB');
  appDatenSpeicher.set(DATEI, original);
  const fehler = new Error('Statusschreiben verweigert');
  const gesetze = [
    {
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      fehlendesGesetz: true as const,
      eintraege: [],
    },
  ];
  await vi.mocked(appDatenSchreiben).withImplementation(
    async () => {
      throw fehler;
    },
    async () => {
      await expect(loescheAlleMitKonflikten(gesetze)).rejects.toBe(fehler);
    },
  );
  expect(appDatenSpeicher.get(DATEI)).toBe(original);
  await expect(loescheAlleMitKonflikten(gesetze)).resolves.toBe(true);
  expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus=');
  expect(appDatenSpeicher.get(DATEI)).not.toContain('<gesetz ');
});

describe('Phase D: Zuordnung ist kein Zielnorm', () => {
  it('zählt infos/gesetz nicht und überspringt betroffene Ausgangsgesetze', async () => {
    // Fehlerphase bereits wiederholt: hier ausschließlich den selektiven Scan prüfen.
    nativerStand.verbraucht = true;
    appDatenSpeicher.set(
      'markierungen/BGB_de-bund-markierungen.xml',
      '<markierungen version="1"><infos><gesetz normgeber="de-bund">StGB</gesetz></infos><inhalt/></markierungen>',
    );
    appDatenSpeicher.set(
      'markierungen/StGB_de-bund-markierungen.xml',
      '<markierungen version="1"><infos><gesetz normgeber="de-bund">StGB</gesetz></infos><inhalt><verweisziel><gesetz normgeber="de-bund">StGB</gesetz><verweistextZeichenbereich start="0" ende="4"/></verweisziel></inhalt></markierungen>',
    );
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB'), gesetz('StGB')]);
    ladeEintraegeSpeicher.set('BGB', [pauschalerKommentarEintrag('nicht-mehr-vorhanden')]);
    ladeEintraegeSpeicher.set('StGB', []);
    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'StGB' })]);
    expect(ladeEintraege).not.toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus="fehlgeschlagen"');
    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus=');
    expect(appDatenSpeicher.get(DATEI)).not.toContain('<gesetz ');
  });
});

vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...appDatenSpeicher.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenExistiert: async (pfad: string) => appDatenSpeicher.has(pfad),
}));

it('vollständige Prüfung verweigert konkurrierende Markierungsdateien und erhält bestehende Konflikte', async () => {
  const original = bestehenderBlock('BGB');
  appDatenSpeicher.set(DATEI, original);
  appDatenSpeicher.set('markierungen/BGB_de-bund-markierungen.xml', 'erste Datei');
  appDatenSpeicher.set('markierungen/bgb_de-bund-markierungen.xml', 'zweite Datei');
  await expect(pruefeAlleMarkierungen()).rejects.toThrow('Mehrere Dateien');
  erwarteErhalteneFehlerbefunde(original);
});

it('findet direkte Verweisziele mit vollständiger Gesetzesidentität und maskiertem Kurztitel', async () => {
  appDatenSpeicher.set(
    'markierungen/BGB_de-bund-markierungen.xml',
    '<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>Ziel</verweistext><verweisziel><gesetz extra="x" normgeber="de-bw">A &amp; B</gesetz><verweistextZeichenbereich start="0" ende="4"/></verweisziel></verweisinhalt></verweismarkierung></inhalt></markierungen>',
  );
  ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB')]);
  ladeEintraegeSpeicher.set('BGB', [
    verweisEintrag('1', [
      zielnorm({
        bezeichnung: '1',
        gesetz: { kurztitel: 'A & B', normgeber: 'de-bw' },
        elementstand: { textlaenge: 5 },
      }),
    ]),
  ]);
  await pruefeMarkierungenSelektiv([{ kurztitel: 'A & B', normgeber: 'de-bund' }]);
  expect(ladeEintraege).not.toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }));
  await pruefeMarkierungenSelektiv([{ kurztitel: 'A & B', normgeber: 'de-bw' }]);
  expect(ladeEintraege).toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }));
  expect(appDatenSpeicher.get(DATEI)).toContain('gesetz="A &amp; B" normgeber="de-bw"');
});

it('erhält bei echter Konfliktdatei-Leseniederlage den Bestand und führt weder Schreiben noch Löschen aus', async () => {
  const kern = await import('@/lib/persistenz/kern/kern.index');
  const fehler = new Error('Konfliktdatei unlesbar');
  const original = bestehenderBlock('BGB');
  appDatenSpeicher.set(DATEI, original);
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await vi.mocked(kern.appDatenLesen).withImplementation(
      async () => {
        throw fehler;
      },
      async () => {
        await expect(pruefeAlleMarkierungen()).rejects.toBe(fehler);
      },
    );
    expect(appDatenSpeicher.get(DATEI)).toBe(original);
    expect(kern.appDatenSchreiben).not.toHaveBeenCalled();
    expect(kern.appDatenLoeschen).not.toHaveBeenCalled();
  } finally {
    protokoll.mockRestore();
  }
});

it('erhält bei gezielter Prüfung fehlgeschlagenen Status und unbekannte Wurzelangaben', async () => {
  appDatenSpeicher.set(
    DATEI,
    '<markierungskonflikte version="1" pruefstatus="fehlgeschlagen" extra="A &amp; B"><neu><gesetz kurztitel="X" normgeber="de-bund"/></neu><gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>',
  );
  ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB')]);
  await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
  const xml = appDatenSpeicher.get(DATEI)!;
  expect(xml).toContain('pruefstatus="fehlgeschlagen"');
  expect(xml).toContain('extra="A &amp; B"');
  expect(xml).toContain('<neu>');
  expect(xml).toContain('kurztitel="X"');
  expect(xml).not.toContain('kurztitel="BGB"');
});

function erwarteErhalteneFehlerbefunde(original: string): void {
  const vorher = new DOMParser().parseFromString(original, 'application/xml').documentElement;
  const nachher = new DOMParser().parseFromString(
    appDatenSpeicher.get(DATEI)!,
    'application/xml',
  ).documentElement;
  expect(nachher.getAttribute('pruefstatus')).toBe('fehlgeschlagen');
  expect(
    Array.from(nachher.children).map((el) => new XMLSerializer().serializeToString(el)),
  ).toEqual(Array.from(vorher.children).map((el) => new XMLSerializer().serializeToString(el)));
}

it('sammelt Gesetz-, Titel- und alle Markierungsbefunde vor dem Abbruch der Vollprüfung', async () => {
  const { BeschaedigteGesetzdateiFehler, BeschaedigteTiteldateiFehler } =
    await import('@/test/tabs/gesetzSpeicherTestzugang');
  const { BeschaedigteMarkierungsdateiFehler } =
    await import('@/lib/markierungen/eintrag/eintrag.index');
  const gesetzFehler = new BeschaedigteGesetzdateiFehler(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    'BGB.xml',
    'kaputt',
    'beschaedigt',
  );
  const titelFehler = new BeschaedigteTiteldateiFehler(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    'titel.xml',
    'kaputter Titel',
    'beschaedigt',
  );
  const markFehler = new BeschaedigteMarkierungsdateiFehler(
    gesetzesreferenz({ kurztitel: 'A' }),
    'kaputte Markierung',
  );
  const zugriffsFehler = new Error('Zugriff auf B verweigert');
  appDatenSpeicher.set('markierungen/A_de-bund-markierungen.xml', 'A');
  appDatenSpeicher.set('markierungen/B_de-bund-markierungen.xml', 'B');
  // Gestalt des Sammelfehlers der Gesetzquellenprüfung: AggregateError mit den Einzelbefunden.
  ladeAlleGesetzeFuerPruefung.mockRejectedValue(
    new AggregateError(
      [gesetzFehler, titelFehler],
      'Die Gesetze konnten nicht vollständig geladen werden.',
    ),
  );
  ladeEintraege.mockImplementation(async (ref) => {
    if (ref.kurztitel === 'A') throw markFehler;
    if (ref.kurztitel === 'B') throw zugriffsFehler;
    return [];
  });
  const original = bestehenderBlock('BGB');
  appDatenSpeicher.set(DATEI, original);
  await expect(pruefeAlleMarkierungen()).rejects.toMatchObject({
    beschaedigteQuellen: [gesetzFehler, titelFehler, markFehler],
    errors: [gesetzFehler, titelFehler, markFehler, zugriffsFehler],
  });
  erwarteErhalteneFehlerbefunde(original);
});

it('sammelt beschädigte Markierungen im Referenzscan und untersucht folgende Dateien weiter', async () => {
  appDatenSpeicher.set('markierungen/A_de-bund-markierungen.xml', '<kaputt>');
  appDatenSpeicher.set('markierungen/B_de-bund-markierungen.xml', '<auchKaputt>');
  const original = bestehenderBlock('BGB');
  appDatenSpeicher.set(DATEI, original);
  ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB')]);
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
  expect(protokoll).toHaveBeenCalledWith(
    'Markierungskonflikt-Prüfung fehlgeschlagen:',
    expect.objectContaining({
      beschaedigteQuellen: [
        expect.objectContaining({
          gesetz: gesetzesreferenz({ kurztitel: 'A' }),
          inhalt: '<kaputt>',
        }),
        expect.objectContaining({
          gesetz: gesetzesreferenz({ kurztitel: 'B' }),
          inhalt: '<auchKaputt>',
        }),
      ],
    }),
  );
  protokoll.mockRestore();
  erwarteErhalteneFehlerbefunde(original);
});

it.each(['', ' \n\t '])(
  'überspringt leere Referenzscanquellen (%j) und findet weiterhin gültige Verweise',
  async (leer) => {
    ladeEintraege.mockImplementation(async (ref) => ladeEintraegeSpeicher.get(ref.kurztitel) ?? []);
    const { invoke } = await import('@tauri-apps/api/core');
    appDatenSpeicher.set('markierungen/A_de-bund-markierungen.xml', leer);
    appDatenSpeicher.set(
      'markierungen/BGB_de-bund-markierungen.xml',
      '<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>Ziel</verweistext><verweisziel><gesetz normgeber="de-bund">StGB</gesetz><verweistextZeichenbereich start="0" ende="4"/></verweisziel></verweisinhalt></verweismarkierung></inhalt></markierungen>',
    );
    ladeAlleGesetzeFuerPruefung.mockResolvedValue([gesetz('BGB')]);
    ladeEintraegeSpeicher.set('BGB', [
      verweisEintrag('1', [
        zielnorm({
          bezeichnung: '1',
          gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
          elementstand: { textlaenge: 5 },
        }),
      ]),
    ]);
    await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'StGB' })]);
    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus="aktuell"');
    expect(appDatenSpeicher.get(DATEI)).toContain(
      '<konflikt typ="ziel-gesetz-fehlt" gesetz="StGB" normgeber="de-bund"/>',
    );
    expect(invoke).not.toHaveBeenCalledWith('pruefvorgang_fehler', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith(
      'pruefvorgang_wiederholung_uebernehmen',
      expect.anything(),
    );
    expect(ladeAlleGesetzeFuerPruefung).toHaveBeenCalledTimes(1);
  },
);

it.each(['Lesen', 'Existenzprüfung'])(
  'erhält echte Zugriffsfehler beim Referenzscan: %s',
  async (zugriff) => {
    const kern = await import('@/lib/persistenz/kern/kern.index');
    const original = bestehenderBlock('BGB');
    appDatenSpeicher.set(DATEI, original);
    const pfad = 'markierungen/A_de-bund-markierungen.xml';
    appDatenSpeicher.set(pfad, '');
    nativerStand.verbraucht = true;
    const fehler = new Error('Zugriff verweigert');
    vi.mocked(kern.appDatenLesen).mockImplementation(async (ziel) => {
      if (ziel === pfad) throw new Error('Lesefehler');
      return appDatenSpeicher.get(ziel)!;
    });
    if (zugriff === 'Existenzprüfung')
      vi.mocked(kern.appDatenExistiert).mockImplementation(async (ziel) => {
        if (ziel === pfad) throw fehler;
        return (
          appDatenSpeicher.has(ziel) ||
          [...appDatenSpeicher.keys()].some((k) => k.startsWith(`${ziel}/`))
        );
      });
    else
      vi.mocked(kern.appDatenLesen).mockImplementation(async (ziel) => {
        if (ziel === pfad) throw fehler;
        return appDatenSpeicher.get(ziel)!;
      });
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await pruefeMarkierungenSelektiv([gesetzesreferenz({ kurztitel: 'BGB' })]);
      expect(protokoll).toHaveBeenCalledWith('Markierungskonflikt-Prüfung fehlgeschlagen:', fehler);
      erwarteErhalteneFehlerbefunde(original);
    } finally {
      vi.mocked(kern.appDatenLesen).mockImplementation(async (ziel) => appDatenSpeicher.get(ziel)!);
      vi.mocked(kern.appDatenExistiert).mockImplementation(
        async (ziel) =>
          appDatenSpeicher.has(ziel) ||
          [...appDatenSpeicher.keys()].some((k) => k.startsWith(`${ziel}/`)),
      );
      protokoll.mockRestore();
    }
  },
);

it('behält bei mehreren Quellenfehlern dieselbe private Fehlerklasse und die Ursachen', async () => {
  nativerStand.verbraucht = true;
  const ursachen = [new Error('Gesetzquelle'), new Error('Titelquelle')];
  ladeAlleGesetzeFuerPruefung.mockRejectedValue(new AggregateError(ursachen));
  const erster = await pruefeAlleMarkierungen().catch((fehler: unknown) => fehler);
  const zweiter = await pruefeAlleMarkierungen().catch((fehler: unknown) => fehler);
  expect(erster).toBeInstanceOf(AggregateError);
  expect(erster).toHaveProperty('name', 'KonfliktquellenPruefungFehler');
  expect((erster as AggregateError).errors).toEqual(ursachen);
  expect((zweiter as AggregateError).constructor).toBe((erster as AggregateError).constructor);
});
