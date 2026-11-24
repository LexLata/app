// verweismarkierungAktionen.test.ts
import {
  gliederungsartikel,
  normaleNorm,
  gesetzDarstellung,
  gesetzesreferenz,
} from '@/test/gesetz/gesetzFabriken';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// ---------------------------------------------------------------------------
// speichereVerweismarkierung – Charakterisierungstests VOR dem Cognitive-Complexity-
// Refactor (siehe Kopfkommentar der Datei). Nur die drei tatsächlich
// seiteneffektbehafteten Module werden gemockt (I/O bzw. Tauri-IPC); alle
// reinen Domain-Funktionen (parseZitat, pruefeZusatzangabe,
// findeElementZuBezeichnung, aktuellerTextAnPfad, …) laufen ECHT gegen von
// Hand aufgebaute GesetzDarstellung-Fixtures – robuster als das Verhalten
// dieser Funktionen ebenfalls zu mocken (siehe normAufloesung.test.ts für das
// gleiche Fixture-Muster).

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { schliesseGespeicherteMarkierungsAktionAb } from './markierungsUebertragung';
import type {
  DarstellungsElement,
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  versucheFehlendeGesetzeImportieren,
  speichereVerweismarkierung,
} from './verweismarkierungAktionen';
import type { VerweismarkierungKontext } from '@/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext';
import { FEHLERTEXT_KEINE_VERBINDUNG } from '@/lib/import/import.index';
import type { HinzufuegenErgebnis } from '@/lib/markierungen/eintrag/eintrag.index';
import {
  aktualisiereZielnorm,
  hinzufuegenMarkierung,
  zeigeUeberlappungsBanner,
} from '@/lib/markierungen/eintrag/eintrag.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { emitTo } from '@tauri-apps/api/event';
import * as zitatModul from '@/lib/markierungen/zitat/zitat.index';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeAlleGesetze: vi.fn(),
}));
vi.mock('@/lib/markierungen/eintrag/eintrag.index', () => ({
  aktualisiereZielnorm: vi.fn(),
  hinzufuegenMarkierung: vi.fn(),
  zeigeUeberlappungsBanner: vi.fn(),
}));
vi.mock('./markierungsUebertragung', async (importOriginal) => {
  const original = await importOriginal<typeof import('./markierungsUebertragung')>();
  return {
    ...original,
    schliesseGespeicherteMarkierungsAktionAb: vi.fn(async (aktion) => {
      original.meldeMarkierungsAnzeigeAenderung(aktion.gesetz);
      return { art: 'erfolg' };
    }),
  };
});
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(),
}));

const aktualisiereGesetz = vi.fn<(g: GesetzDarstellung) => Promise<unknown>>();
const importiereGesetze = vi.fn<
  (eingaben: string[]) => Promise<{
    erfolgreiche: GesetzDarstellung[];
    fehlgeschlagene: { kurztitel: string; fehler: { grund: 'nichtImIndex'; meldung: string } }[];
  }>
>();
const ladeGesetzeskandidaten = vi.fn<() => Promise<Gesetzesreferenz[]>>();
const importiereGesetzesreferenz = vi.fn(async (ref: Gesetzesreferenz) => {
  const ergebnis = await importiereGesetze([ref.kurztitel]);
  return ergebnis.erfolgreiche[0]
    ? { art: 'erfolg' as const, gesetz: ergebnis.erfolgreiche[0] }
    : { art: 'fehler' as const, fehler: ergebnis.fehlgeschlagene[0]!.fehler };
});
const starteImportAktualisierungsVorgang = vi.fn<() => Promise<void>>();
const beendeImportAktualisierungsVorgang = vi.fn<() => Promise<void>>();
vi.mock('@/lib/import/import.index', () => ({
  ladeGesetzeskandidaten: () => ladeGesetzeskandidaten(),
  importiereGesetzesreferenz: (ref: Gesetzesreferenz) => importiereGesetzesreferenz(ref),
  aktualisiereGesetz: (...args: [GesetzDarstellung]) => aktualisiereGesetz(...args),
  importiereGesetze: (...args: [string[]]) => importiereGesetze(...args),
  starteImportAktualisierungsVorgang: () => starteImportAktualisierungsVorgang(),
  beendeImportAktualisierungsVorgang: () => beendeImportAktualisierungsVorgang(),
  FEHLERTEXT_KEINE_VERBINDUNG:
    'Keine Internetverbindung. Bitte Verbindung prüfen und erneut versuchen.',
  baueAktualisierungsNachricht: (ergebnisse: { kurztitel: string; kategorie: string }[]) =>
    ergebnisse.length === 0
      ? null
      : `Aktualisiert: ${ergebnisse.map((e) => e.kurztitel).join(', ')}.`,
}));

function gesetz(
  kurztitel: string,
  datenquellenname?: string,
  elemente: DarstellungsElement[] = [],
): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: 'irrelevant',
    datenquelle: { name: datenquellenname },
    hatGliederungsartikel: false,
    elemente: [...elemente, norm('ausgang', '§ 0')],
  });
}

describe('versucheFehlendeGesetzeImportieren', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ladeGesetzeskandidaten.mockImplementation(async () => [
      ...(await ladeAlleGesetze()),
      gesetzesreferenz({ kurztitel: 'UnbekanntG' }),
    ]);
    starteImportAktualisierungsVorgang.mockResolvedValue(undefined);
    beendeImportAktualisierungsVorgang.mockResolvedValue(undefined);
  });

  it('wendet für ein neues EU-Ziel die gewählte vollständige Referenz an', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
    const eu = { ...gesetz('DSGVO'), normgeber: 'eu' };
    importiereGesetzesreferenz.mockResolvedValueOnce({ art: 'erfolg', gesetz: eu });
    expect(
      (
        await versucheFehlendeGesetzeImportieren(
          [{ kurztitel: 'DSGVO', normgeber: 'eu' }],
          markierungsEinzelzugriffFuerTest,
        )
      ).mindestensEinErfolg,
    ).toBe(true);
    expect(importiereGesetzesreferenz).toHaveBeenCalledExactlyOnceWith({
      kurztitel: 'DSGVO',
      normgeber: 'eu',
    });
  });

  it('meldet einen namensgleichen anderen Normgeber beim gezielten Import als Fehler', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
    importiereGesetzesreferenz.mockResolvedValueOnce({
      art: 'erfolg',
      gesetz: { ...gesetz('G'), normgeber: 'de-bund' },
    });
    const angefordert = { kurztitel: 'G', normgeber: 'de-bw' };
    const ergebnis = await versucheFehlendeGesetzeImportieren(
      [angefordert],
      markierungsEinzelzugriffFuerTest,
    );
    expect(ergebnis.mindestensEinErfolg).toBe(false);
    expect(ergebnis.neuFehlgeschlagen).toEqual([
      { gesetz: angefordert, fehler: 'Das angeforderte Gesetz konnte nicht importiert werden.' },
    ]);
  });

  it('meldet ein Aktualisierungsergebnis eines anderen Normgebers als Fehler', async () => {
    const vorhanden = { ...gesetz('G'), normgeber: 'de-bw' };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([vorhanden]);
    aktualisiereGesetz.mockResolvedValueOnce({
      art: 'erfolg',
      gesetz: { ...gesetz('G'), normgeber: 'de-bund' },
      kategorie: 'aktualisiert',
    });
    const ergebnis = await versucheFehlendeGesetzeImportieren(
      [{ kurztitel: 'G', normgeber: 'de-bw' }],
      markierungsEinzelzugriffFuerTest,
    );
    expect(ergebnis.mindestensEinErfolg).toBe(false);
    expect(ergebnis.neuFehlgeschlagen).toEqual([
      {
        gesetz: { kurztitel: 'G', normgeber: 'de-bw' },
        fehler: 'Das angeforderte Gesetz konnte nicht importiert werden.',
      },
    ]);
  });

  it('bereits installiertes Gesetz -> aktualisiereGesetz statt importiereGesetze', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('ZPO')]);
    aktualisiereGesetz.mockResolvedValue({
      art: 'erfolg',
      gesetz: gesetz('ZPO'),
      kategorie: 'aktualisiert',
    });

    const ergebnis = await versucheFehlendeGesetzeImportieren(
      [gesetzesreferenz({ kurztitel: 'ZPO' })],
      markierungsEinzelzugriffFuerTest,
    );

    expect(aktualisiereGesetz).toHaveBeenCalledTimes(1);
    expect(importiereGesetze).not.toHaveBeenCalled();
    expect(ergebnis.mindestensEinErfolg).toBe(true);
    expect(ergebnis.aktualisierungsHinweis).toBe('Aktualisiert: ZPO.');
    expect(ergebnis.neuFehlgeschlagen).toEqual([]);
  });

  it('noch nicht installiertes Gesetz -> importiereGesetze statt aktualisiereGesetz', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
    importiereGesetze.mockResolvedValue({ erfolgreiche: [gesetz('PolG')], fehlgeschlagene: [] });

    const ergebnis = await versucheFehlendeGesetzeImportieren(
      [gesetzesreferenz({ kurztitel: 'PolG' })],
      markierungsEinzelzugriffFuerTest,
    );

    expect(importiereGesetze).toHaveBeenCalledWith(['PolG']);
    expect(aktualisiereGesetz).not.toHaveBeenCalled();
    expect(ergebnis.mindestensEinErfolg).toBe(true);
    expect(ergebnis.aktualisierungsHinweis).toBeNull();
  });

  it('Aktualisierung fehlgeschlagen -> in neuFehlgeschlagen eingetragen (vollständige Referenz)', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('ZPO')]);
    aktualisiereGesetz.mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'keineVerbindung', meldung: 'Keine Verbindung.' },
    });

    const ergebnis = await versucheFehlendeGesetzeImportieren(
      [gesetzesreferenz({ kurztitel: 'ZPO' })],
      markierungsEinzelzugriffFuerTest,
    );

    expect(ergebnis.mindestensEinErfolg).toBe(false);
    expect(ergebnis.neuFehlgeschlagen).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }), fehler: 'Keine Verbindung.' },
    ]);
  });

  it('Import fehlgeschlagen -> Fehler aus importiereGesetze in neuFehlgeschlagen übernommen', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
    importiereGesetze.mockResolvedValue({
      erfolgreiche: [],
      fehlgeschlagene: [
        { kurztitel: 'PolG', fehler: { grund: 'nichtImIndex', meldung: 'nicht gefunden' } },
      ],
    });

    const ergebnis = await versucheFehlendeGesetzeImportieren(
      [gesetzesreferenz({ kurztitel: 'PolG' })],
      markierungsEinzelzugriffFuerTest,
    );

    expect(ergebnis.mindestensEinErfolg).toBe(false);
    expect(ergebnis.neuFehlgeschlagen).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'PolG' }), fehler: 'nicht gefunden' },
    ]);
  });

  it('mehrere Kurztitel: installierte werden aktualisiert, neue in einem Rutsch importiert', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('ZPO')]);
    aktualisiereGesetz.mockResolvedValue({
      art: 'erfolg',
      gesetz: gesetz('ZPO'),
      kategorie: 'unveraendert',
    });
    importiereGesetze.mockResolvedValue({ erfolgreiche: [gesetz('StPO')], fehlgeschlagene: [] });

    await versucheFehlendeGesetzeImportieren(
      [gesetzesreferenz({ kurztitel: 'ZPO' }), gesetzesreferenz({ kurztitel: 'StPO' })],
      markierungsEinzelzugriffFuerTest,
    );

    expect(aktualisiereGesetz).toHaveBeenCalledTimes(1);
    expect(importiereGesetze).toHaveBeenCalledWith(['StPO']);
  });

  it('wartet nach unerwartetem Workerabbruch auf den anderen Import und erhält seinen Abschluss', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
    let freigeben!: () => void;
    const warten = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    const erstes = { kurztitel: 'AbbruchG', normgeber: 'de-bund' };
    const zweites = { kurztitel: 'ErfolgG', normgeber: 'de-bw' };
    importiereGesetzesreferenz.mockRejectedValueOnce(new Error('Unerwarteter Workerabbruch'));
    importiereGesetzesreferenz.mockImplementationOnce(async () => {
      await warten;
      return { art: 'erfolg' as const, gesetz: { ...gesetz('ErfolgG'), normgeber: 'de-bw' } };
    });
    let abgeschlossen = false;
    const arbeit = versucheFehlendeGesetzeImportieren(
      [erstes, zweites],
      markierungsEinzelzugriffFuerTest,
    ).then((ergebnis) => {
      abgeschlossen = true;
      return ergebnis;
    });
    await vi.waitFor(() => expect(importiereGesetzesreferenz).toHaveBeenCalledTimes(2));
    expect(abgeschlossen).toBe(false);
    freigeben();
    expect(await arbeit).toMatchObject({
      mindestensEinErfolg: true,
      neuFehlgeschlagen: [
        { gesetz: erstes, fehler: 'Der Import konnte nicht abgeschlossen werden.' },
      ],
      abschluesse: [
        { gesetz: erstes, art: 'nichtAbgeschlossen' },
        { gesetz: zweites, art: 'import', ergebnis: { art: 'erfolg' } },
      ],
    });
  });

  it('delegiert die Vorgangskoordination an die Importoperationen', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
    importiereGesetze.mockResolvedValue({ erfolgreiche: [], fehlgeschlagene: [] });

    await versucheFehlendeGesetzeImportieren([], markierungsEinzelzugriffFuerTest);

    expect(starteImportAktualisierungsVorgang).not.toHaveBeenCalled();
    expect(beendeImportAktualisierungsVorgang).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// speichereVerweismarkierung – Fixtures
// ---------------------------------------------------------------------------

/** Norm-Fixture (analog zu normAufloesung.test.ts): bezeichnung ist die
 *  vollständige Normbezeichnung wie im Gesetz, z.B. "§ 280". */
function norm(
  xmlId: string,
  bezeichnung: string,
  absaetze: NormDarstellung['absaetze'] = [],
): DarstellungsElement {
  return {
    typ: 'norm',
    data: normaleNorm({ id: `id-${xmlId}`, xmlId, bezeichnung, absaetze }),
  };
}

function absatz(bezeichnung: string): NormDarstellung['absaetze'][number] {
  return { id: `abs-${bezeichnung}`, bezeichnung, saetze: [] };
}

/** Ausgangsstelle bewusst mit einer nicht existenten Bezeichnung:
 *  die (best-effort) elementstand-Auflösung ist nicht Gegenstand dieser
 *  Tests (siehe baueTextbezugUndElementstand.test.ts nach dem Refactor). */
function verweismarkierungKontext(
  overrides: Partial<VerweismarkierungKontext> = {},
): VerweismarkierungKontext {
  return {
    openerLabel: 'opener-fenster',
    gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
    ausgangsstelle: normAusgangsstelle('§ 0'),

    ...overrides,
  };
}

const KEIN_FEHLGESCHLAGENER_IMPORT: ReadonlyMap<string, string | undefined> = new Map();

describe('speichereVerweismarkierung', () => {
  beforeEach(() => {
    ladeGesetzeskandidaten.mockImplementation(async () => [
      ...(await ladeAlleGesetze()),
      gesetzesreferenz({ kurztitel: 'UnbekanntG' }),
    ]);
    vi.mocked(ladeAlleGesetze).mockReset();
    vi.mocked(aktualisiereZielnorm).mockReset();
    vi.mocked(hinzufuegenMarkierung).mockReset();
    vi.mocked(zeigeUeberlappungsBanner).mockReset().mockResolvedValue(undefined);
    vi.mocked(emitTo).mockReset().mockResolvedValue(undefined);
    vi.mocked(schliesseGespeicherteMarkierungsAktionAb).mockClear();
  });

  it.each([
    'fehlendes Gesetz',
    'fehlende Bezeichnung',
    'doppelte Bezeichnung',
    'nach Vorabprüfung verändert',
  ])('lehnt einen neuen Verweis bei %s ohne Schreiben ab', async (fall) => {
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: false });
    const gueltig = gesetz('TestG', undefined, [norm('1', '§ 1'), norm('5', '§ 5')]);
    const bestand =
      fall === 'fehlendes Gesetz'
        ? []
        : [
            gesetz('TestG', undefined, [
              norm('5', '§ 5'),
              ...(fall === 'doppelte Bezeichnung' ? [norm('1a', '§ 1'), norm('1b', '§ 1')] : []),
            ]),
          ];
    ladeGesetzeskandidaten.mockResolvedValue([gesetzesreferenz({ kurztitel: 'TestG' })]);
    vi.mocked(ladeAlleGesetze).mockResolvedValue(bestand);
    if (fall === 'nach Vorabprüfung verändert')
      vi.mocked(ladeAlleGesetze).mockResolvedValueOnce([gueltig]);
    // Ein ganzes Gesetz als Ziel braucht keine Zielnorm, auch bei fehlendem Ausgangsgesetz.
    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext({
        ausgangsstelle: normAusgangsstelle('§ 1'),
      }),
      markierungsEinzelzugriffFuerTest,
      'TestG',
      false,
      true,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(ergebnis).toMatchObject({
      art: 'fehler',
      ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig',
      fehler: [
        {
          art: 'sonst',
          text: 'Diese Stelle lässt sich im Gesetz nicht eindeutig adressieren. Hier sind keine Markierungen möglich.',
        },
      ],
    });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
    expect(schliesseGespeicherteMarkierungsAktionAb).not.toHaveBeenCalled();
  });

  it('erkennt Indexkurztitel vor Import und analysiert nach Import mit derselben Referenz neu', async () => {
    const referenz = Object.freeze({ kurztitel: 'VO zu § 18 LHO', normgeber: 'de-bund' });
    const bestand = [referenz];
    ladeGesetzeskandidaten.mockClear().mockResolvedValue(bestand);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);
    const gewaehlt = new Map<string, Gesetzesreferenz>();
    const vorher = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 5 VO zu § 18 LHO',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    expect(vorher).toMatchObject({ art: 'fehler', fehler: [{ art: 'gesetz', gesetz: referenz }] });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
    const importiert = {
      ...gesetz(referenz.kurztitel, undefined, [norm('5', '§ 5')]),
      normgeber: referenz.normgeber,
    };
    importiereGesetze.mockResolvedValue({ erfolgreiche: [importiert], fehlgeschlagene: [] });
    expect(
      await versucheFehlendeGesetzeImportieren([referenz], markierungsEinzelzugriffFuerTest),
    ).toMatchObject({ mindestensEinErfolg: true });
    expect(importiereGesetzesreferenz).toHaveBeenLastCalledWith(referenz);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), importiert]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 5 VO zu § 18 LHO',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    expect(hinzufuegenMarkierung).toHaveBeenCalledOnce();
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele,
    ).toMatchObject([{ gesetz: referenz, bezeichnung: '§ 5' }]);
    expect(ladeGesetzeskandidaten).toHaveBeenCalledTimes(2);
    expect(bestand).toEqual([referenz]);
  });

  it('übergibt denselben unveränderten Bestand vorläufiger Analyse und endgültigem Parse', async () => {
    const bestand = [{ kurztitel: 'VO zu § 18 LHO', normgeber: 'de-bund' }];
    Object.freeze(bestand[0]);
    Object.freeze(bestand);
    ladeGesetzeskandidaten.mockClear().mockResolvedValue(bestand);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);
    const analyse = vi.spyOn(zitatModul, 'analysiereZitatZiele');
    const parse = vi.spyOn(zitatModul, 'parseZitat');
    try {
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 5 VO zu § 18 LHO',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );
      expect(analyse).toHaveBeenCalledWith('§ 5 VO zu § 18 LHO', bestand);
      expect(parse.mock.calls[0]?.[2]).toBe(bestand);
      expect(ladeGesetzeskandidaten).toHaveBeenCalledOnce();
      expect(ladeGesetzeskandidaten.mock.invocationCallOrder[0]).toBeLessThan(
        analyse.mock.invocationCallOrder[0]!,
      );
    } finally {
      analyse.mockRestore();
      parse.mockRestore();
    }
  });

  it('geschützter Kurztitel und bindende Auswahl bestimmen das Canon-Profil', async () => {
    const titel = 'and § 18 Can. 3';
    const bund = { ...gesetz(titel, undefined, [norm('5', '§ 5')]), normgeber: 'de-bund' };
    const kirche = {
      ...gesetz(titel, undefined, [norm('5', 'Can. 5')]),
      normgeber: 'Kirche',
      normpraefix: 'canon' as const,
    };
    const referenz = { kurztitel: titel, normgeber: 'Kirche' };
    ladeGesetzeskandidaten.mockResolvedValue([bund, kirche]);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), bund, kirche]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    const gewaehlt = new Map([['0', referenz]]);
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      `can. 5 § 1 ${titel}`,
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    expect(hinzufuegenMarkierung).toHaveBeenCalledOnce();
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele,
    ).toMatchObject([{ gesetz: referenz, bezeichnung: 'Can. 5' }]);
    expect(gewaehlt).toEqual(new Map([['0', referenz]]));
  });

  it('bricht bei fehlgeschlagener Kandidatenbeschaffung ohne Speicherung ab', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);
    ladeGesetzeskandidaten.mockRejectedValue(new DOMException('Abgebrochen', 'AbortError'));
    await expect(
      speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 5',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('erhält ein während Kandidatenbeschaffung ausgelöstes Abbruchsignal bis zum Abschluss', async () => {
    const controller = new AbortController();
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG', undefined, [norm('5', '§ 5')])]);
    ladeGesetzeskandidaten.mockImplementation(async () => {
      controller.abort();
      return [gesetzesreferenz({ kurztitel: 'TestG' })];
    });
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
      erfolgreich: true,
      aktion: {
        art: 'ersetzen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        rest: [],
        entfernt: [],
      },
    });
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 5',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      undefined,
      controller.signal,
    );
    expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledWith(
      expect.anything(),
      'opener-fenster',
      controller.signal,
    );
    expect(controller.signal.aborted).toBe(true);
  });

  it('Gesetzesangabe beendet das Canon-Präfix vor einem mehrdeutigen symbolfreien Ziel', async () => {
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      gesetz('TestG', undefined, [norm('c5', 'Can. 5'), norm('p5', '§ 5')]),
      { ...gesetz('CIC', undefined, [norm('c9', 'Can. 9')]), normpraefix: 'canon' },
    ]);
    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'Can. 9 CIC, 5',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: [{ art: 'norm' }] });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it.each([undefined, 'paragraph', 'artikel'] as const)(
    'Canon-Eingabe auf Zielprofil %s meldet einen Fehler statt eines Verweises auf das ganze BGB',
    async (normpraefix) => {
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
      vi.mocked(ladeAlleGesetze).mockResolvedValue([
        gesetz('TestG'),
        { ...gesetz('BGB', undefined, [norm('p1', '§ 1')]), normpraefix },
      ]);
      const gewaehlt = new Map<string, Gesetzesreferenz>();
      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        'canon 1 BGB',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
        gewaehlt,
      );
      expect(ergebnis).toMatchObject({
        art: 'fehler',
        fehler: [
          {
            art: 'gesetz',
            grund: 'fehlend',
            text: 'Für „canon 1 BGB“ konnte kein passendes Gesetz ermittelt werden.',
          },
        ],
      });
      expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
      expect(gewaehlt.size).toBe(0);
    },
  );

  it.each(['2278 § 1', 'canon 2278', 'Can.2278'])(
    'Canon-Ausgangsprofil speichert genau eine klickbare Norm: %s',
    async (text) => {
      const cic = {
        ...gesetz('TestG', undefined, [
          norm('c2278', 'Can.2278'),
          ...(text.startsWith('2278') ? [] : [norm('p2278', '§ 2278')]),
        ]),
        normpraefix: 'canon' as const,
      };
      vi.mocked(ladeAlleGesetze).mockResolvedValue([cic]);
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        text,
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );
      const ziele = vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele;
      expect(ziele).toHaveLength(1);
      expect(ziele[0]).toMatchObject({ bezeichnung: 'Can.2278' });
      const { verweisZuXmlId } = await import('@/lib/domain/norm/norm.index');
      expect(verweisZuXmlId(cic, ziele[0]!.bezeichnung ?? '')).toBe('c2278');
    },
  );

  it('ein zunächst fehlendes Canon-Ziel ohne Feld bleibt nach dem Laden ein Fehler', async () => {
    ladeGesetzeskandidaten.mockResolvedValue([gesetzesreferenz({ kurztitel: 'CIC' })]);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    const gewaehlt = new Map<string, Gesetzesreferenz>();
    const speichern = () =>
      speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        'canon 1 CIC',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
        gewaehlt,
      );
    expect(await speichern()).toMatchObject({
      art: 'fehler',
      fehler: [{ art: 'gesetz', gesetz: gesetzesreferenz({ kurztitel: 'CIC' }) }],
    });
    expect(gewaehlt.size).toBe(0);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      gesetz('TestG'),
      gesetz('CIC', undefined, [norm('p1', '§ 1')]),
    ]);
    expect(await speichern()).toMatchObject({
      art: 'fehler',
      fehler: [
        {
          art: 'gesetz',
          grund: 'fehlend',
          text: 'Für „canon 1 CIC“ konnte kein passendes Gesetz ermittelt werden.',
        },
      ],
    });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('meldet neben einem fehlenden Canon-Ziel auch Normfehler anderer Ziele', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      gesetz('TestG'),
      gesetz('BGB', undefined, [norm('p90', '§ 90')]),
    ]);
    ladeGesetzeskandidaten.mockResolvedValue([
      gesetzesreferenz({ kurztitel: 'CIC' }),
      gesetzesreferenz({ kurztitel: 'BGB' }),
    ]);
    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'can. 1 CIC, § 9 BGB',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(ergebnis).toMatchObject({
      art: 'fehler',
      fehler: [
        { art: 'gesetz', gesetz: gesetzesreferenz({ kurztitel: 'CIC' }) },
        { art: 'norm', gesetz: gesetzesreferenz({ kurztitel: 'BGB' }) },
      ],
    });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('Canon-Zielprofil wird vor dem endgültigen Parse geladen und wechselt zu BGB', async () => {
    const cic = {
      ...gesetz('CIC', undefined, [norm('9', 'Can. 9')]),
      normpraefix: 'canon' as const,
    };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      gesetz('TestG'),
      cic,
      gesetz('BGB', undefined, [norm('5', '§ 5')]),
    ]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'Can. 9 CIC, § 5 BGB',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele,
    ).toMatchObject([
      { gesetz: gesetzesreferenz({ kurztitel: 'CIC' }), bezeichnung: 'Can. 9' },
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '§ 5' },
    ]);
  });

  it('fehlendes Canon-Ziel meldet das Zielgesetz und wird nach Import erneut ausgewertet', async () => {
    const cic = {
      ...gesetz('CIC', undefined, [norm('2278', 'Can. 2278')]),
      normpraefix: 'canon' as const,
    };
    ladeGesetzeskandidaten.mockResolvedValue([gesetzesreferenz({ kurztitel: 'CIC' })]);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);
    const text = 'can. 2278 § 1 CIC';
    const gewaehlt = new Map<string, Gesetzesreferenz>();
    const vorher = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      text,
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    expect(vorher).toMatchObject({
      art: 'fehler',
      fehler: [{ art: 'gesetz', gesetz: gesetzesreferenz({ kurztitel: 'CIC' }) }],
    });
    importiereGesetze.mockResolvedValue({ erfolgreiche: [cic], fehlgeschlagene: [] });
    expect(
      await versucheFehlendeGesetzeImportieren(
        [gesetzesreferenz({ kurztitel: 'CIC' })],
        markierungsEinzelzugriffFuerTest,
      ),
    ).toMatchObject({
      mindestensEinErfolg: true,
    });
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), cic]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      text,
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele,
    ).toMatchObject([{ gesetz: gesetzesreferenz({ kurztitel: 'CIC' }), bezeichnung: 'Can. 2278' }]);
  });

  it('bereits ausgewähltes Ziel bestimmt das Profil bei namensgleichen Gesetzen', async () => {
    const mitProfil = {
      ...gesetz('CIC', undefined, [norm('1', 'Can. 1')]),
      normgeber: 'Kirche',
      normpraefix: 'canon' as const,
    };
    const ohneProfil = { ...gesetz('CIC', undefined, [norm('1', '§ 1')]), normgeber: 'de-bund' };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), ohneProfil, mitProfil]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    const gewaehlt = new Map([['0', { kurztitel: 'CIC', normgeber: 'Kirche' }]]);
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'canon 1 CIC',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele,
    ).toMatchObject([{ gesetz: { kurztitel: 'CIC', normgeber: 'Kirche' }, bezeichnung: 'Can. 1' }]);
  });

  it('ein fehlendes externes Ziel erbt kein Canon-Ausgangsprofil', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      { ...gesetz('TestG', undefined, [norm('9', 'Can. 9')]), normpraefix: 'canon' as const },
    ]);
    ladeGesetzeskandidaten.mockResolvedValue([gesetzesreferenz({ kurztitel: 'CIC' })]);
    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '9 § 2 CIC',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(ergebnis).toMatchObject({
      art: 'fehler',
      fehler: [{ art: 'gesetz', gesetz: gesetzesreferenz({ kurztitel: 'CIC' }) }],
    });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('symbolfreie Canon-Eingabe bleibt im gemischten Gesetz mehrdeutig', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      {
        ...gesetz('TestG', undefined, [norm('c1', 'Can. 1'), norm('p1', '§ 1')]),
        normpraefix: 'canon' as const,
      },
    ]);
    expect(
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '1 § 2',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      ),
    ).toMatchObject({ art: 'fehler', fehler: [{ art: 'norm' }] });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('fehlende Can. 9 ist kein Can. 90; Trotzdem speichern erhält das explizite Präfix', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      {
        ...gesetz('TestG', undefined, [norm('90', 'Can. 90'), norm('9', '§ 9')]),
        normpraefix: 'canon' as const,
      },
    ]);
    const fehler = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'Can. 9',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(fehler).toMatchObject({ art: 'fehler', fehler: [{ art: 'norm' }] });
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'Can. 9',
      false,
      true,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele,
    ).toMatchObject([{ bezeichnung: 'Can. 9' }]);
  });

  it.each(['§ 9', 'Art. 9'])(
    'meldet im echten Aufrufer fehlendes %s statt Norm 90',
    async (text) => {
      const symbol = text.startsWith('§') ? '§' : 'Art.';
      vi.mocked(ladeAlleGesetze).mockResolvedValue([
        gesetz('TestG', undefined, [norm('90', `${symbol} 90`)]),
      ]);
      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        text,
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );
      expect(ergebnis).toEqual({
        art: 'fehler',
        fehler: [expect.objectContaining({ art: 'norm' })],
      });
      expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
    },
  );

  it('speichert §§ 5, 7 mit zwei kanonischen Einzelpräfixen', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([
      gesetz('TestG', undefined, [
        norm('a5', 'Art. 5'),
        norm('a7', 'Art. 7'),
        norm('5', '§ 5'),
        norm('7', '§ 7'),
      ]),
    ]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§§ 5, 7',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1]).toMatchObject({
      verweisinhalt: {
        verweisziele: [{ bezeichnung: '§ 5' }, { bezeichnung: '§ 7' }],
      },
    });
  });

  it.each(['Art. 229 6 EGBGB', 'Art. 229 6 Abs. 1, 2 EGBGB'])(
    'löst %s bis zum gespeicherten Binnenparagraphen auf',
    async (text) => {
      const artikel = norm('229', 'Art. 229');
      if (artikel.typ === 'norm')
        artikel.data = gliederungsartikel({
          ...artikel.data,
          art: 'gliederungsartikel',
          gliederungsEbene: 0,
        });
      const g = {
        ...gesetz('EGBGB', undefined, [artikel, norm('229-6', '§ 6', [absatz('1'), absatz('2')])]),
        hatGliederungsartikel: true,
      };
      vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), g]);
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        text,
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );
      expect(vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1]).toMatchObject({
        verweisinhalt: {
          verweisziele: [
            {
              gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
              bezeichnung: 'Art. 229 § 6',
            },
          ],
        },
      });
    },
  );

  it.each(['Art 229 § 3, Art 229 § 4 EGBGB', 'Art 229 § 3, 4 EGBGB'])(
    'speichert %s mit beiden Zielnormen und vollständigen Präfixen',
    async (text) => {
      const artikel = norm('229', 'Art. 229');
      if (artikel.typ === 'norm')
        artikel.data = gliederungsartikel({
          ...artikel.data,
          art: 'gliederungsartikel',
          gliederungsEbene: 0,
        });
      const g = {
        ...gesetz('EGBGB', undefined, [
          norm('4', 'Art. 4'),
          artikel,
          norm('229-3', '§ 3'),
          norm('229-4', '§ 4'),
        ]),
        hatGliederungsartikel: true,
      };
      vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), g]);
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        text,
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );
      expect(hinzufuegenMarkierung).toHaveBeenCalledOnce();
      const verweisziele =
        vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt?.verweisziele;
      expect(verweisziele).toMatchObject([
        {
          gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
          bezeichnung: 'Art. 229 § 3',
        },
        {
          gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
          bezeichnung: 'Art. 229 § 4',
        },
      ]);
      const { verweisZuXmlId } = await import('@/lib/domain/norm/norm.index');
      for (const ziel of verweisziele!) {
        expect(verweisZuXmlId(g, ziel.bezeichnung ?? '')).toBe(
          `229-${(ziel.bezeichnung ?? '').slice(-1)}`,
        );
      }
    },
  );

  it('prüft den EGBGB-Kommafall ausschließlich an Art. 229 § 6', async () => {
    const artikel = norm('229', 'Art. 229');
    if (artikel.typ === 'norm')
      artikel.data = gliederungsartikel({
        ...artikel.data,
        art: 'gliederungsartikel',
        gliederungsEbene: 0,
      });
    const falscherArtikel = norm('1229', 'Art. 1229');
    if (falscherArtikel.typ === 'norm')
      falscherArtikel.data = gliederungsartikel({
        ...falscherArtikel.data,
        art: 'gliederungsartikel',
        gliederungsEbene: 0,
      });
    const g = {
      ...gesetz('EGBGB', undefined, [
        falscherArtikel,
        norm('1229-6', '§ 6', [absatz('2')]),
        artikel,
        norm('229-6', '§ 6', [absatz('1')]),
      ]),
      hatGliederungsartikel: true,
    };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([g]);
    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'Art. 229 6 Abs. 1, 2 EGBGB',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );
    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [expect.objectContaining({ art: 'norm', text: '2 existiert nicht in EGBGB.' })],
    });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('sendet die tatsächlich gespeicherte Aktion einmal vor der Darstellungsnachricht', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG', undefined, [norm('1', '§ 1')])]);
    const aktion: NonNullable<HinzufuegenErgebnis['aktion']> = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      rest: [],
      entfernt: [
        markierungsEintrag({
          typ: 'unterstreichung',
          ausgangsstelle: normAusgangsstelle('§ 1'),
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
            bezugstext: '',
          },
        }),
      ],
    };
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true, aktion });
    expect(
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      ),
    ).toEqual({ art: 'erfolg' });
    await vi.waitFor(() => expect(emitTo).toHaveBeenCalled());
    expect(vi.mocked(emitTo).mock.calls).toEqual([
      [
        { kind: 'Any' },
        'markierungen-geaendert',
        { gesetz: gesetzesreferenz({ kurztitel: 'TestG' }) },
      ],
    ]);
    expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledExactlyOnceWith(
      aktion,
      'opener-fenster',
      undefined,
    );
    expect(vi.mocked(schliesseGespeicherteMarkierungsAktionAb).mock.calls[0]![0]).toBe(aktion);
    expect(
      vi.mocked(schliesseGespeicherteMarkierungsAktionAb).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(emitTo).mock.invocationCallOrder[0]!);
  });

  it.each([false, true])(
    'verweigert ohne Quellenkandidaten eine geratene Zielreferenz (ohneElementstand=%s)',
    async (ohneElementstand) => {
      vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
      ladeGesetzeskandidaten.mockResolvedValue([]);
      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1 UnbekanntG',
        false,
        ohneElementstand,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );
      expect(ergebnis).toEqual({
        art: 'fehler',
        fehler: [
          {
            art: 'gesetz',
            grund: 'fehlend',
            text: 'Für „UnbekanntG“ konnte kein passendes Gesetz ermittelt werden.',
          },
        ],
      });
      expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'meldet gleichrangige Mehrdeutigkeit auch beim Trotzdem speichern (ohneElementstand=%s)',
    async (ohneElementstand) => {
      vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
      ladeGesetzeskandidaten.mockResolvedValue([
        { kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' },
        { kurztitel: 'SGB\u202fIV', normgeber: 'de-bund' },
      ]);
      const gewaehlt = new Map<string, Gesetzesreferenz>();
      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1 SGB IV',
        false,
        ohneElementstand,
        KEIN_FEHLGESCHLAGENER_IMPORT,
        gewaehlt,
      );
      expect(ergebnis).toEqual({
        art: 'fehler',
        fehler: [
          {
            art: 'gesetz',
            grund: 'mehrdeutig',
            text: 'Für „SGB IV“ kommen mehrere gleichrangige Gesetze infrage.',
          },
        ],
      });
      expect(gewaehlt.size).toBe(0);
      expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
      expect(aktualisiereZielnorm).not.toHaveBeenCalled();
    },
  );

  it('gibt nach tolerantem Vergleich die vorhandene Referenz trotz doppeltem Indexangebot an die Speicherung weiter', async () => {
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    const ziel = { ...gesetz('SGB\u00a0IV'), normgeber: 'de-bund' };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), ziel]);
    ladeGesetzeskandidaten.mockResolvedValue([
      ziel,
      { kurztitel: 'sgb\u00a0iv', normgeber: 'de-bund' },
    ]);
    expect(
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1 SGB IV.',
        false,
        true,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      ),
    ).toEqual({ art: 'keineAktion' });
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele[0]?.gesetz,
    ).toEqual({ kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' });
  });

  it('respektiert beim unveränderten Text eine bindende Auswahl trotz neuer gleichrangiger Kollision', async () => {
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true });
    const ziel = { ...gesetz('SGB\u00a0IV'), normgeber: 'de-bund' };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), ziel]);
    ladeGesetzeskandidaten.mockResolvedValue([
      ziel,
      { kurztitel: 'SGB\u202fIV', normgeber: 'de-bund' },
    ]);
    const gewaehlt = new Map([['0', { kurztitel: ziel.kurztitel, normgeber: 'de-bund' }]]);
    expect(
      await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1 SGB IV',
        false,
        true,
        KEIN_FEHLGESCHLAGENER_IMPORT,
        gewaehlt,
      ),
    ).toEqual({ art: 'keineAktion' });
    expect(
      vi.mocked(hinzufuegenMarkierung).mock.calls[0]![1].verweisinhalt!.verweisziele[0]?.gesetz,
    ).toEqual({ kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' });
  });

  it('bindet ein einmal gewähltes fehlendes Ziel über weitere Speicherversuche hinweg', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([]);
    const bund = { kurztitel: 'ZPO', normgeber: 'de-bund' };
    ladeGesetzeskandidaten.mockResolvedValue([bund]);
    const gewaehlt = new Map<string, Gesetzesreferenz>();
    const kontext = verweismarkierungKontext({
      gesetz: { kurztitel: 'TestG', normgeber: 'de-bw' },
    });
    const erstes = await speichereVerweismarkierung(
      kontext,
      markierungsEinzelzugriffFuerTest,
      '§ 1 ZPO',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    const bw = { ...gesetz('ZPO'), normgeber: 'de-bw' };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([bw]);
    ladeGesetzeskandidaten.mockResolvedValue([bw]);
    const zweites = await speichereVerweismarkierung(
      kontext,
      markierungsEinzelzugriffFuerTest,
      '§ 1 ZPO',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
      gewaehlt,
    );
    expect(erstes).toEqual({
      art: 'fehler',
      fehler: [{ art: 'gesetz', text: 'ZPO ist nicht auf dem Gerät.', gesetz: bund }],
    });
    expect(zweites).toEqual(erstes);
    expect(gewaehlt).toEqual(new Map([['0', bund]]));
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('bewahrt das gespeicherte Ziel beim unveränderten Bearbeiten eines Verweises', async () => {
    const bw = { ...gesetz('ZPO'), normgeber: 'de-bw' };
    vi.mocked(ladeAlleGesetze).mockResolvedValue([bw]);
    ladeGesetzeskandidaten.mockResolvedValue([bw]);
    const bund = { kurztitel: 'ZPO', normgeber: 'de-bund' };
    const kontext = verweismarkierungKontext({
      gesetz: { kurztitel: 'TestG', normgeber: 'de-bw' },
      bearbeiten: {
        zitatText: '§ 1 ZPO',
        vorher: {
          elementstand: testElementstand(),
          verweisinhalt: {
            verweistext: '§ 1 ZPO',
            verweisziele: [
              verweisziel({
                typ: 'zielnormOhneElementstand',
                gesetz: bund,
                bezeichnung: '1',
                verweistextZeichenbereich: [0, 7],
              }),
            ],
          },
        },
      },
    });
    expect(
      await speichereVerweismarkierung(
        kontext,
        markierungsEinzelzugriffFuerTest,
        '§ 1 ZPO',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      ),
    ).toEqual({
      art: 'fehler',
      fehler: [{ art: 'gesetz', text: 'ZPO ist nicht auf dem Gerät.', gesetz: bund }],
    });
    expect(aktualisiereZielnorm).not.toHaveBeenCalled();
  });

  it.each(['   ', 'und', ',', '/'])('meldet fehlende Norm bei %j', async (text) => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);

    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      text,
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [{ art: 'sonst', text: 'Es konnte keine Norm erkannt werden.' }],
    });
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
  });

  it('legt einen neuen allgemeinen Verweis an einer bekannten Norm an (Erfolg)', async () => {
    const testG = gesetz('TestG', undefined, [norm('1', '§ 1')]);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
      erfolgreich: true,
      aktion: {
        art: 'hinzufuegen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        eintrag: {} as never,
      },
    } as HinzufuegenErgebnis);

    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 1',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );

    expect(ergebnis).toEqual({ art: 'erfolg' });
    expect(hinzufuegenMarkierung).toHaveBeenCalledTimes(1);
    const [kurztitelArg, eintragArg] = vi.mocked(hinzufuegenMarkierung).mock.calls[0]!;
    expect(kurztitelArg).toEqual(gesetzesreferenz({ kurztitel: 'TestG' }));
    expect(eintragArg).toMatchObject({
      typ: 'verweismarkierung',
      verweisinhalt: {
        verweistext: '§ 1',
        // bezeichnung stammt aus xmlIdZuBezeichnung/letztesToken: nur das
        // letzte Leerzeichen-getrennte Token der Norm-bezeichnung ("§ 1" →
        // "1"), siehe normKurzform.ts.
        verweisziele: [expect.objectContaining({ bezeichnung: '§ 1' })],
      },
    });
    // Gemeinsamer Tail: Broadcast an alle Fenster nach erfolgreichem Speichern.
    await vi.waitFor(() => expect(emitTo).toHaveBeenCalled());
    expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungen-geaendert', {
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
    });
  });

  it('meldet Fehler, wenn das Zielgesetz nicht auf dem Gerät ist', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);

    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 1 UnbekanntG',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [
        {
          art: 'gesetz',
          text: 'UnbekanntG ist nicht auf dem Gerät.',
          gesetz: gesetzesreferenz({ kurztitel: 'UnbekanntG' }),
        },
      ],
    });
  });

  it('zeigt den konkreten Fehlertext, wenn für dieses Kurztitel bereits ein Import fehlgeschlagen ist', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);
    const fehlgeschlagen = new Map([['["de-bund","unbekanntg"]', FEHLERTEXT_KEINE_VERBINDUNG]]);

    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 1 UnbekanntG',
      false,
      false,
      fehlgeschlagen,
    );

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [
        {
          art: 'gesetz',
          text: FEHLERTEXT_KEINE_VERBINDUNG,
          gesetz: gesetzesreferenz({ kurztitel: 'UnbekanntG' }),
        },
      ],
    });
  });

  it('meldet Fehler, wenn die Zielnorm im gefundenen Gesetz nicht existiert', async () => {
    const testG = gesetz('TestG', undefined, [norm('1', '§ 1')]);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);

    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 9999',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: [
        {
          art: 'norm',
          text: '§ 9999 existiert nicht in TestG.',
          gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        },
      ],
    });
  });

  it('übernimmt bei ohneElementstand=true die Rohangabe ohne Existenzprüfung', async () => {
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG')]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
      erfolgreich: true,
      aktion: {
        art: 'hinzufuegen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        eintrag: {} as never,
      },
    } as HinzufuegenErgebnis);

    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      '§ 9999',
      false,
      true,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );

    expect(ergebnis).toEqual({ art: 'erfolg' });
    const [, eintragArg] = vi.mocked(hinzufuegenMarkierung).mock.calls[0]!;
    expect(eintragArg).toMatchObject({
      verweisinhalt: {
        verweisziele: [expect.objectContaining({ bezeichnung: '§ 9999' })],
      },
    });
  });

  it('legt bei einem Verweis auf ein ganzes Gesetz (z.B. "GG") kein Normziel an', async () => {
    const gg = gesetz('GG', undefined, [norm('1', '§ 1')]);
    vi.mocked(ladeAlleGesetze).mockResolvedValue([gesetz('TestG'), gg]);
    vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
      erfolgreich: true,
      aktion: {
        art: 'hinzufuegen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        eintrag: {} as never,
      },
    } as HinzufuegenErgebnis);

    const ergebnis = await speichereVerweismarkierung(
      verweismarkierungKontext(),
      markierungsEinzelzugriffFuerTest,
      'GG',
      false,
      false,
      KEIN_FEHLGESCHLAGENER_IMPORT,
    );

    expect(ergebnis).toEqual({ art: 'erfolg' });
    const [, eintragArg] = vi.mocked(hinzufuegenMarkierung).mock.calls[0]!;
    expect(eintragArg).toMatchObject({
      verweisinhalt: {
        verweisziele: [
          expect.objectContaining({
            gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
            typ: 'ganzesGesetz',
          }),
        ],
      },
    });
  });

  describe('Ambiguität (Komma-Grenze nach Abs., siehe zitatParser.ts)', () => {
    it('verwirft den Kandidaten, wenn die vorherige Norm den genannten Absatz tatsächlich hat', async () => {
      // "§ 280 Abs. 1, 3, 281": "3" ist mehrdeutig (Abs. 3 von § 280 ODER
      // eigenständige Norm "3") – § 280 hat hier tatsächlich einen Abs. 3,
      // die Prüfung soll den Kandidaten daher verwerfen (kein eigener
      // Verweismarkierung für "3", dessen Textbereich wandert zu § 280).
      const testG = gesetz('TestG', undefined, [
        norm('280', '§ 280', [absatz('(1)'), absatz('(3)')]),
        norm('281', '§ 281'),
      ]);
      vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: true,
        aktion: {
          art: 'hinzufuegen',
          gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
          eintrag: {} as never,
        },
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 280 Abs. 1, 3, 281',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );

      expect(ergebnis).toEqual({ art: 'erfolg' });
      const [, eintragArg] = vi.mocked(hinzufuegenMarkierung).mock.calls[0]!;
      const verweisziele = (
        eintragArg as { verweisinhalt: { verweisziele: { bezeichnung: string }[] } }
      ).verweisinhalt.verweisziele;
      // Nur 2 Ziele: § 280 (mit erweitertem Textbereich) und § 281 – "3" wurde
      // NICHT als eigenständiges drittes Ziel angelegt. (bezeichnung ist das
      // letzte Token der Norm-bezeichnung, siehe Kommentar oben.)
      expect(verweisziele.map((z) => z.bezeichnung)).toEqual(['§ 280', '§ 281']);
    });

    it('behandelt den Kandidaten als eigenständige Norm, wenn die vorherige Norm den Absatz NICHT hat', async () => {
      // Gleicher Zitat-Text, aber § 280 hat diesmal KEINEN Abs. 3 – die
      // Mehrdeutigkeit löst sich also zugunsten von "eigenständige Norm 3"
      // auf, die hier mangels Norm "3" im Gesetz als Fehler landet.
      const testG = gesetz('TestG', undefined, [
        norm('280', '§ 280', [absatz('(1)')]),
        norm('281', '§ 281'),
      ]);
      vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);

      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 280 Abs. 1, 3, 281',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );

      expect(ergebnis).toEqual({
        art: 'fehler',
        fehler: [
          {
            art: 'norm',
            text: '3 existiert nicht in TestG.',
            gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
          },
        ],
      });
    });
  });

  describe('Bearbeiten-Modus (kontext.bearbeiten gesetzt)', () => {
    function bearbeitenKontext(): VerweismarkierungKontext {
      return verweismarkierungKontext({
        bearbeiten: {
          zitatText: '§ 1',
          vorher: {
            elementstand: testElementstand(),
            verweisinhalt: { verweistext: '§ 1', verweisziele: [] },
          },
        },
      });
    }

    it('aktualisiert einen bestehenden Verweis und meldet die Aktion ans Opener-Fenster', async () => {
      const testG = gesetz('TestG', undefined, [norm('1', '§ 1')]);
      vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);
      vi.mocked(aktualisiereZielnorm).mockResolvedValue('geaendert');

      const ergebnis = await speichereVerweismarkierung(
        bearbeitenKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );

      expect(ergebnis).toEqual({ art: 'erfolg' });
      expect(schliesseGespeicherteMarkierungsAktionAb).toHaveBeenCalledWith(
        expect.objectContaining({ art: 'verweisBearbeiten' }),
        'opener-fenster',
        undefined,
      );
      await vi.waitFor(() => expect(emitTo).toHaveBeenCalled());
      expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungen-geaendert', {
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      });
    });

    it('meldet Fehler, wenn der zu bearbeitende Verweis nicht mehr gefunden wird', async () => {
      const testG = gesetz('TestG', undefined, [norm('1', '§ 1')]);
      vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);
      vi.mocked(aktualisiereZielnorm).mockResolvedValue('nichtGefunden');

      const ergebnis = await speichereVerweismarkierung(
        bearbeitenKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );

      expect(ergebnis).toEqual({
        art: 'fehler',
        fehler: [
          {
            art: 'sonst',
            text: 'Dieser Verweis konnte nicht mehr gefunden werden – wurde er zwischenzeitlich entfernt?',
          },
        ],
      });
    });
  });

  describe('Ablehnungsgründe beim Anlegen (hinzufuegenMarkierung.ablehnungsgrund)', () => {
    it('meldet einen Fehler bei einem identischen Duplikat', async () => {
      const testG = gesetz('TestG', undefined, [norm('1', '§ 1')]);
      vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: false,
        ablehnungsgrund: 'duplikat',
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );

      expect(ergebnis).toEqual({
        art: 'fehler',
        fehler: [{ art: 'sonst', text: 'Ein identischer Verweis existiert bereits.' }],
      });
      expect(zeigeUeberlappungsBanner).not.toHaveBeenCalled();
    });

    it('liefert Überlappung als lokalen Fehler ohne Hauptfensterereignis', async () => {
      const testG = gesetz('TestG', undefined, [norm('1', '§ 1')]);
      vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: false,
        ablehnungsgrund: 'ueberlappung',
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );

      expect(zeigeUeberlappungsBanner).not.toHaveBeenCalled();
      expect(emitTo).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({
        art: 'fehler',
        fehler: [
          {
            art: 'sonst',
            text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
          },
        ],
      });
    });

    it('bricht ohne Aktion ab, wenn hinzufuegenMarkierung weder erfolgreich noch mit Aktion zurückkommt', async () => {
      const testG = gesetz('TestG', undefined, [norm('1', '§ 1')]);
      vi.mocked(ladeAlleGesetze).mockResolvedValue([testG]);
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: false,
      } as HinzufuegenErgebnis);

      const ergebnis = await speichereVerweismarkierung(
        verweismarkierungKontext(),
        markierungsEinzelzugriffFuerTest,
        '§ 1',
        false,
        false,
        KEIN_FEHLGESCHLAGENER_IMPORT,
      );

      expect(ergebnis).toEqual({ art: 'keineAktion' });
      // Kein Broadcast, wenn nichts gespeichert wurde.
      expect(emitTo).not.toHaveBeenCalledWith(
        { kind: 'Any' },
        'markierungen-geaendert',
        expect.anything(),
      );
    });
  });
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: vi.fn(),
}));
