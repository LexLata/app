import { alsSuchverzeichniseintrag } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// gesetzAktualisierungDispatch.test.ts
//
// Deckt zwei fachlich getrennte Dinge ab:
// 1. aktualisiereGesetz: Dispatch anhand von gesetz.normgeber
//    (bw -> gesetzImportBW, bund -> gesetzImportBund) –
//    beide quellenspezifischen Module werden mit vi.mock ersetzt, da ihr
//    tatsächlicher Download-Code hier nicht relevant ist.
// 2. aktualisiereGesetze: Aggregation mehrerer
//    aktualisiereGesetz-Aufrufe (Fehler verschluckt, Kategorie ->
//    aktualisierteReferenzen/unveraenderteGesetze, Nachrichtentext) – dafür wird nur
//    aktualisiereGesetz selbst gemockt (über dieselben zwei
//    Modul-Mocks), baueAktualisierungsNachricht und parallelMitLimit laufen
//    echt mit (parallelMitLimit selbst ist bereits separat in
//    parallelMitLimit.test.ts abgedeckt, hier geht es nur um die Verdrahtung
//    drumherum).
//
// Die Aggregationstests prüfen einzelne Kandidaten. Die parallele
// Verarbeitung selbst wird in parallelMitLimit.test.ts geprüft.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

// Die automatische Vorprüfung liest den echten EU-Importindex über die Dateigrenze.
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    if (pfad.endsWith('europaKuratiert.json')) return '[]';
    return '<importindex version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>eu</normgeber><datenquelle name="EUR-Lex"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>32016R0679</abrufkennung></gesetz></inhalt></importindex>';
  },
}));

// Erreichbarkeitsvorabprüfung des automatischen Durchlaufs (externe Grenze: HTTP).
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
});

// vi.fn()-Instanzen DIREKT im Factory-Objekt (nicht als äußere const +
// Indirektion) – gleiches Muster wie in den bestehenden vi.mock-Aufrufen im
// Projekt (siehe verweismarkierungAktionen.test.ts), damit die Instanz
// zuverlässig dieselbe bleibt, die auch von aktualisiereGesetz
// über den dynamischen import() aufgelöst wird.
vi.mock('@/lib/import/bund/bund.index', () => ({
  aktualisierungVomInternet: vi.fn(),
}));
vi.mock('@/lib/import/eu/eu.index', () => ({ aktualisierungVomInternetEU: vi.fn() }));
vi.mock('@/lib/import/bw/bw.index', () => ({
  aktualisierungGesetzVomInternetBW: vi.fn(),
}));

// Nur für den eigenen describe-Block unten ("Sperre gegen doppelte
// Aktualisierung") auf konkrete Werte gesetzt (siehe dortiges beforeEach) –
// alle übrigen Tests verwenden ebenfalls diese Mocks.
const versucheGesetzSperreZuErhalten = vi.fn<(gesetz: Gesetzesreferenz) => Promise<boolean>>();
const gibGesetzSperreFrei = vi.fn<(gesetz: Gesetzesreferenz) => Promise<void>>();
vi.mock('@/lib/import/dispatch/importVorgang', () => ({
  mitManuellemImportVorgang: (arbeit: () => Promise<unknown>) => arbeit(),
  mitAutomatischemImportVorgang: async (arbeit: () => Promise<unknown>) => ({
    gestartet: true,
    ergebnis: await arbeit(),
  }),
  versucheGesetzSperreZuErhalten: (...args: [Gesetzesreferenz]) =>
    versucheGesetzSperreZuErhalten(...args),
  gibGesetzSperreFrei: (...args: [Gesetzesreferenz]) => gibGesetzSperreFrei(...args),
}));

import { aktualisiereGesetz, aktualisiereGesetze } from './gesetzAktualisierungDispatch';
import { aktualisierungVomInternetEU } from '@/lib/import/eu/eu.index';
import { aktualisiereGesetzeAutomatisch } from './gesetzAktualisierungDispatch';
import type { AutomatischeAktualisierungErgebnis } from '@/lib/import/importVertrag.types';
import { LANDESRECHT_BW_QUELLE } from '@/lib/persistenz/gesetz/gesetz.index';
import { aktualisierungVomInternet } from '@/lib/import/bund/bund.index';
import { aktualisierungGesetzVomInternetBW } from '@/lib/import/bw/bw.index';
import type { AktualisierungsErgebnis } from '@/lib/import/importVertrag.types';

const aktualisierungVomInternetMock = vi.mocked(aktualisierungVomInternet);
const aktualisierungGesetzVomInternetBWMock = vi.mocked(aktualisierungGesetzVomInternetBW);

function baueGesetz(overrides: Partial<GesetzDarstellung> = {}): GesetzDarstellung {
  return {
    kurztitel: overrides.kurztitel ?? 'TestG',
    langtitel: 'Testgesetz',
    datenquelle: overrides.datenquelle,
    normgeber: overrides.normgeber ?? 'de-bund',
    hatGliederungsartikel: false,
    elemente: [],
    ...overrides,
  };
}

beforeEach(() => {
  aktualisierungVomInternetMock.mockReset();
  aktualisierungGesetzVomInternetBWMock.mockReset();
  versucheGesetzSperreZuErhalten.mockReset().mockResolvedValue(true);
  gibGesetzSperreFrei.mockReset().mockResolvedValue(undefined);
});

describe('aktualisiereGesetz – Dispatch nach normgeber', () => {
  it.each([
    ['unbekannt', 'format'],
    ['fremd', 'format'],
    ['europarat', 'format'],
  ] as const)('weist Normgeber %s ohne Quellenaufruf zurück', async (normgeber, grund) => {
    const gesetz = baueGesetz({ normgeber: normgeber as GesetzDarstellung['normgeber'] });
    const fortschritt = vi.fn();

    await expect(aktualisiereGesetz(gesetz, fortschritt)).resolves.toMatchObject({
      art: 'fehler',
      fehler: { grund },
    });
    expect(aktualisierungVomInternetMock).not.toHaveBeenCalled();
    expect(aktualisierungGesetzVomInternetBWMock).not.toHaveBeenCalled();
    expect(fortschritt).toHaveBeenCalledWith('fehler');
    expect(fortschritt).not.toHaveBeenCalledWith('laden');
  });
  it('gibt einen geworfenen Quellenfehler als strukturierten Fehler zurück und meldet fehler', async () => {
    const gesetz = baueGesetz();
    const fortschritt = vi.fn();
    aktualisierungVomInternetMock.mockRejectedValue(new Error('Index nicht lesbar'));

    await expect(aktualisiereGesetz(gesetz, fortschritt)).resolves.toEqual({
      art: 'fehler',
      fehler: { grund: 'sonstiger', meldung: 'Index nicht lesbar' },
    });
    expect(fortschritt).toHaveBeenLastCalledWith('fehler');
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith(gesetz);
  });

  it('reicht Fehler eines Aufrufer-Callbacks weiterhin als Ausnahme weiter', async () => {
    const gesetz = baueGesetz();
    aktualisierungVomInternetMock.mockResolvedValue({
      art: 'erfolg',
      gesetz,
      kategorie: 'unveraendert',
    });

    await expect(
      aktualisiereGesetz(gesetz, () => {
        throw new Error('Callback kaputt');
      }),
    ).rejects.toThrow('Callback kaputt');
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith(gesetz);
  });

  it.each(['de-bw'])('ruft den BW-Importer für Normgeber %s auf', async (normgeber) => {
    const gesetz = baueGesetz({ datenquelle: { name: LANDESRECHT_BW_QUELLE }, normgeber });
    const ergebnis: AktualisierungsErgebnis = { art: 'erfolg', gesetz, kategorie: 'unveraendert' };
    aktualisierungGesetzVomInternetBWMock.mockResolvedValue(ergebnis);

    const result = await aktualisiereGesetz(gesetz);

    expect(result).toBe(ergebnis);
    expect(aktualisierungGesetzVomInternetBWMock).toHaveBeenCalledWith(
      gesetz,
      undefined,
      expect.objectContaining({ referenzenFuer: expect.any(Function) }),
      undefined,
    );
    expect(aktualisierungVomInternetMock).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'gesetze-im-internet.de', 'Irgendeine andere Quelle'])(
    'ruft für Normgeber bund unabhängig vom Anzeigetext quelle=%p den Bundesimport auf',
    async (quelle) => {
      const gesetz = baueGesetz({ datenquelle: { name: quelle }, normgeber: 'de-bund' });
      const ergebnis: AktualisierungsErgebnis = {
        art: 'erfolg',
        gesetz,
        kategorie: 'aktualisiert',
      };
      aktualisierungVomInternetMock.mockResolvedValue(ergebnis);

      const result = await aktualisiereGesetz(gesetz);

      expect(result).toBe(ergebnis);
      expect(aktualisierungVomInternetMock).toHaveBeenCalledWith(
        gesetz,
        undefined,
        expect.objectContaining({ referenzenFuer: expect.any(Function) }),
        undefined,
      );
      expect(aktualisierungGesetzVomInternetBWMock).not.toHaveBeenCalled();
    },
  );
});

describe('aktualisiereGesetz – Sperre gegen doppelte gleichzeitige Aktualisierung', () => {
  it('Sperre bereits vergeben -> Fehler ohne Netzaufruf, kein Fortschritt "laden"', async () => {
    versucheGesetzSperreZuErhalten.mockResolvedValue(false);
    const gesetz = baueGesetz(gesetzesreferenz({ kurztitel: 'BGB' }));
    const fortschritt = vi.fn();

    const result = await aktualisiereGesetz(gesetz, fortschritt);

    expect(result).toEqual({
      art: 'fehler',
      fehler: {
        grund: 'beschaeftigt',
        meldung: 'BGB wird bereits an anderer Stelle aktualisiert.',
      },
    });
    expect(aktualisierungVomInternetMock).not.toHaveBeenCalled();
    expect(fortschritt).toHaveBeenCalledWith('fehler');
    expect(fortschritt).not.toHaveBeenCalledWith('laden');
    expect(gibGesetzSperreFrei).not.toHaveBeenCalled();
  });

  it('fragt die Sperre für gesetz.kurztitel an und gibt sie nach Erfolg wieder frei', async () => {
    const gesetz = baueGesetz(gesetzesreferenz({ kurztitel: 'ZPO' }));
    aktualisierungVomInternetMock.mockResolvedValue({
      art: 'erfolg',
      gesetz,
      kategorie: 'unveraendert',
    });

    await aktualisiereGesetz(gesetz);

    expect(versucheGesetzSperreZuErhalten).toHaveBeenCalledWith(gesetz);
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith(gesetz);
  });

  it('gibt die Sperre auch nach einem Fehler der eigentlichen Aktualisierung wieder frei', async () => {
    const gesetz = baueGesetz(gesetzesreferenz({ kurztitel: 'ZPO' }));
    aktualisierungVomInternetMock.mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'format', meldung: 'kaputt' },
    });

    await aktualisiereGesetz(gesetz);

    expect(gibGesetzSperreFrei).toHaveBeenCalledWith(gesetz);
  });
});

describe('aktualisiereGesetze – Aggregation (jeweils EIN Kandidat pro Aufruf, siehe Kopfkommentar)', () => {
  it('liefert leere Arrays und nachricht=null bei leerer Kandidatenliste', async () => {
    const result = await aktualisiereGesetze([]);
    expect(result).toEqual({
      aktualisierteReferenzen: [],
      unveraenderteGesetze: [],
      fehlgeschlagene: [],
      nachricht: null,
    });
  });

  it('Kategorie "unveraendert" landet in unveraenderteGesetze, NICHT in aktualisierteReferenzen', async () => {
    const g = baueGesetz(gesetzesreferenz({ kurztitel: 'A' }));
    const gFrisch = baueGesetz(gesetzesreferenz({ kurztitel: 'A (frisch)' }));
    aktualisierungVomInternetMock.mockResolvedValue({
      art: 'erfolg',
      gesetz: gFrisch,
      kategorie: 'unveraendert',
    });

    const result = await aktualisiereGesetze([g]);

    expect(result.aktualisierteReferenzen).toEqual([]);
    expect(result.unveraenderteGesetze).toEqual([gFrisch]);
    expect(result.nachricht).toBe('Keine Neuerungen.');
  });

  it('Kategorie "aktualisiert" landet in aktualisierteReferenzen, NICHT in unveraenderteGesetze', async () => {
    const g = baueGesetz(gesetzesreferenz({ kurztitel: 'B' }));
    aktualisierungVomInternetMock.mockResolvedValue({
      art: 'erfolg',
      gesetz: g,
      kategorie: 'aktualisiert',
    });

    const result = await aktualisiereGesetze([g]);

    expect(result.aktualisierteReferenzen).toEqual([referenzVon(g)]);
    expect(result.unveraenderteGesetze).toEqual([]);
    expect(result.nachricht).toBe('Datei aktualisiert: B.');
  });

  it('Kategorie "aktualisiert" landet auch über Landesrecht-BW-Dispatch in aktualisierteReferenzen', async () => {
    const g = baueGesetz({
      kurztitel: 'C',
      datenquelle: { name: LANDESRECHT_BW_QUELLE },
      normgeber: 'de-bw',
    });
    aktualisierungGesetzVomInternetBWMock.mockResolvedValue({
      art: 'erfolg',
      gesetz: g,
      kategorie: 'aktualisiert',
    });

    const result = await aktualisiereGesetze([g]);

    expect(result.aktualisierteReferenzen).toEqual([referenzVon(g)]);
    expect(result.unveraenderteGesetze).toEqual([]);
    expect(result.nachricht).toBe('Datei aktualisiert: C.');
  });

  it('verschluckt einen Fehler (ergebnis.fehler gesetzt) – kein Eintrag in einem der Buckets, nachricht=null', async () => {
    const g = baueGesetz(gesetzesreferenz({ kurztitel: 'Fehler-Gesetz' }));
    aktualisierungVomInternetMock.mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'download', meldung: 'Netzwerkfehler' },
    });

    const result = await aktualisiereGesetze([g]);

    expect(result).toEqual({
      aktualisierteReferenzen: [],
      unveraenderteGesetze: [],
      fehlgeschlagene: [{ gesetz: g, fehler: { grund: 'download', meldung: 'Netzwerkfehler' } }],
      nachricht: null,
    });
  });

  it('mehrere SEQUENTIELLE Aufrufe verarbeiten jeweils ihren eigenen Kandidaten korrekt (kein globaler Zustand zwischen Aufrufen)', async () => {
    for (let i = 0; i < 10; i++) {
      const g = baueGesetz(gesetzesreferenz({ kurztitel: `G${i}` }));
      aktualisierungVomInternetMock.mockResolvedValue({
        art: 'erfolg',
        gesetz: g,
        kategorie: 'unveraendert',
      });
      const result = await aktualisiereGesetze([g]);
      expect(result.unveraenderteGesetze).toEqual([g]);
    }
    expect(aktualisierungVomInternetMock).toHaveBeenCalledTimes(10);
  });
});

describe('aktualisiereGesetze – Property: ein einzelner Kandidat landet abhängig von Ausgang in genau einem Bucket oder in keinem', () => {
  it('hält für beliebige Einzel-Ausgänge (fehler/unveraendert/aktualisiert)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          ausgang: fc.constantFrom<'fehler' | 'unveraendert' | 'aktualisiert'>(
            'fehler',
            'unveraendert',
            'aktualisiert',
          ),
        }),
        async ({ id, ausgang }) => {
          const g = baueGesetz(gesetzesreferenz({ kurztitel: `G-${id}` }));
          aktualisierungVomInternetMock.mockReset();
          if (ausgang === 'fehler') {
            aktualisierungVomInternetMock.mockResolvedValue({
              art: 'fehler',
              fehler: { grund: 'format', meldung: 'x' },
            });
          } else {
            aktualisierungVomInternetMock.mockResolvedValue({
              art: 'erfolg',
              gesetz: g,
              kategorie: ausgang,
            });
          }

          const result = await aktualisiereGesetze([g]);

          if (ausgang === 'fehler') {
            expect(result.aktualisierteReferenzen).toEqual([]);
            expect(result.unveraenderteGesetze).toEqual([]);
          } else if (ausgang === 'unveraendert') {
            expect(result.aktualisierteReferenzen).toEqual([]);
            expect(result.unveraenderteGesetze).toEqual([g]);
          } else {
            expect(result.aktualisierteReferenzen).toEqual([referenzVon(g)]);
            expect(result.unveraenderteGesetze).toEqual([]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Sammelaktualisierung mit vollständiger Ausgangsreferenz', () => {
  it.each([true, false])(
    'trennt Bund und BW bei umgekehrtem Abschluss: Bund zuerst=%s',
    async (bundZuerst) => {
      const bund = baueGesetz({ kurztitel: 'TestG', normgeber: 'de-bund' });
      const bw = baueGesetz({ kurztitel: 'TestG', normgeber: 'de-bw' });
      const bundFertig = warteAuf<AktualisierungsErgebnis>();
      const bwFertig = warteAuf<AktualisierungsErgebnis>();
      aktualisierungVomInternetMock.mockReturnValue(bundFertig.promise);
      aktualisierungGesetzVomInternetBWMock.mockReturnValue(bwFertig.promise);
      const fortschritt = vi.fn();
      const fertig = vi.fn();
      const lauf = aktualisiereGesetze([bund, bw], fortschritt).then((ergebnis) => {
        fertig();
        return ergebnis;
      });
      await vi.waitFor(() => expect(fortschritt).toHaveBeenCalledTimes(2));
      expect(fortschritt.mock.calls).toEqual([
        [bund, 'laden'],
        [bw, 'laden'],
      ]);
      const fehler = { grund: 'download' as const, meldung: 'BW nicht erreichbar' };
      const erfolg = {
        art: 'erfolg' as const,
        gesetz: { ...bund, kurztitel: 'TESTG' },
        kategorie: 'unveraendert' as const,
      };
      if (bundZuerst) bundFertig.resolve(erfolg);
      else bwFertig.resolve({ art: 'fehler', fehler });
      await vi.waitFor(() => expect(fortschritt).toHaveBeenCalledTimes(3));
      expect(fertig).not.toHaveBeenCalled();
      if (bundZuerst) bwFertig.resolve({ art: 'fehler', fehler });
      else bundFertig.resolve(erfolg);
      const ergebnis = await lauf;
      expect(fortschritt).toHaveBeenCalledWith(bund, 'ok', { kategorie: 'unveraendert' });
      expect(fortschritt).toHaveBeenCalledWith(bw, 'fehler', fehler);
      expect(ergebnis.fehlgeschlagene).toEqual([{ gesetz: bw, fehler }]);
      expect(ergebnis.unveraenderteGesetze).toEqual([erfolg.gesetz]);
    },
  );

  it('ordnet auch unerwartete Fehler der Ausgangsreferenz zu', async () => {
    const gesetz = baueGesetz();
    versucheGesetzSperreZuErhalten.mockRejectedValueOnce(new Error('Sperrfehler'));
    const fortschritt = vi.fn();
    const ergebnis = await aktualisiereGesetze([gesetz], fortschritt);
    expect(ergebnis.fehlgeschlagene).toEqual([
      { gesetz, fehler: { grund: 'sonstiger', meldung: 'Sperrfehler' } },
    ]);
    expect(fortschritt).toHaveBeenLastCalledWith(
      gesetz,
      'fehler',
      ergebnis.fehlgeschlagene[0]!.fehler,
    );
  });
});

function warteAuf<T>() {
  let resolve!: (wert: T) => void;
  const promise = new Promise<T>((aufloesen) => {
    resolve = aufloesen;
  });
  return { promise, resolve };
}

it.each(['EUR-Lex', 'EU-Recht', undefined])(
  'aktualisiert EU unabhängig von Quelle %s auch automatisch',
  async (quelle) => {
    const gesetz = baueGesetz({ normgeber: 'eu', datenquelle: { name: quelle } });
    const eu = vi
      .mocked(aktualisierungVomInternetEU)
      .mockResolvedValue({ art: 'erfolg', gesetz, kategorie: 'aktualisiert' });
    expect(await aktualisiereGesetz(gesetz)).toMatchObject({
      kategorie: 'aktualisiert',
    });
    expect(eu).toHaveBeenCalledWith(gesetz, undefined, expect.any(Object), undefined);
    expect(aktualisierungVomInternetMock).not.toHaveBeenCalled();
    expect(versucheGesetzSperreZuErhalten).toHaveBeenCalledWith(gesetz);
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith(gesetz);
    const automatisch: AutomatischeAktualisierungErgebnis = await aktualisiereGesetzeAutomatisch([
      alsSuchverzeichniseintrag(gesetz),
    ]);
    expect(automatisch).toMatchObject({
      art: 'ausgefuehrt',
      ergebnis: { aktualisierteReferenzen: [referenzVon(gesetz)], fehlgeschlagene: [] },
    });
    versucheGesetzSperreZuErhalten.mockResolvedValueOnce(false);
    expect(await aktualisiereGesetz(gesetz)).toMatchObject({
      fehler: { grund: 'beschaeftigt' },
    });
  },
);

it('weist die zweite gleichzeitige EU-Aktualisierung ab und gibt die Sperre anschließend frei', async () => {
  const gesetz = baueGesetz({ normgeber: 'eu' });
  const download = warteAuf<AktualisierungsErgebnis>();
  let gesperrt = false;
  versucheGesetzSperreZuErhalten.mockImplementation(async () => {
    if (gesperrt) return false;
    gesperrt = true;
    return true;
  });
  gibGesetzSperreFrei.mockImplementation(async () => {
    gesperrt = false;
  });
  vi.mocked(aktualisierungVomInternetEU).mockReturnValue(download.promise);
  const erster = aktualisiereGesetz(gesetz);
  await vi.waitFor(() => expect(gesperrt).toBe(true));
  expect(await aktualisiereGesetz(gesetz)).toMatchObject({
    fehler: { grund: 'beschaeftigt' },
  });
  download.resolve({ art: 'erfolg', gesetz, kategorie: 'unveraendert' });
  expect(await erster).toMatchObject({ kategorie: 'unveraendert' });
  expect(gesperrt).toBe(false);
});

it.each(['GRCh: Originaltext importiert.', 'Originaltext importiert.'])(
  'nennt die Gesetzesreferenz im Sammelhinweis genau einmal bei %s',
  async (text) => {
    const gesetz = baueGesetz({ kurztitel: 'GRCh', normgeber: 'eu' });
    vi.mocked(aktualisierungVomInternetEU).mockImplementationOnce(async (_g, _f, _k, empfangen) => {
      empfangen?.({
        text,
        typ: 'info',
        art: 'hinweis',
        anlass: 'import',
        aenderungsstand: 'vollstaendig',
      });
      return { art: 'erfolg', gesetz, kategorie: 'unveraendert' };
    });
    const empfangen = vi.fn();
    await aktualisiereGesetze([gesetz], undefined, empfangen);
    expect(empfangen).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'GRCh (eu): Originaltext importiert.' }),
    );
  },
);

describe('aktualisiereGesetzeAutomatisch – Erreichbarkeitsvorabprüfung', () => {
  const verbindungsfehler = 'error sending request for url (https://x.de/)';
  beforeEach(() => {
    vi.mocked(aktualisierungVomInternetEU).mockClear();
    aktualisierungGesetzVomInternetBWMock.mockClear();
    aktualisierungVomInternetMock.mockClear();
    versucheGesetzSperreZuErhalten.mockClear();
    versucheGesetzSperreZuErhalten.mockResolvedValue(true);
    gibGesetzSperreFrei.mockResolvedValue(undefined);
  });

  it('bricht ohne Verbindung still ab, ohne Aktualisierung oder Importindexzugriff', async () => {
    fetchMock.mockRejectedValue(verbindungsfehler);
    const gesetz = baueGesetz({ normgeber: 'de-bund' });
    const ergebnis = await aktualisiereGesetzeAutomatisch([alsSuchverzeichniseintrag(gesetz)]);
    expect(ergebnis).toEqual({ art: 'keineVerbindung' });
    expect(aktualisierungVomInternetMock).not.toHaveBeenCalled();
    expect(versucheGesetzSperreZuErhalten).not.toHaveBeenCalled();
  });

  it('prüft jede Quelle nur einmal, auch bei mehreren Gesetzen desselben Normgebers', async () => {
    fetchMock.mockRejectedValue(verbindungsfehler);
    const gesetze = [baueGesetz({ kurztitel: 'A' }), baueGesetz({ kurztitel: 'B' })].map((g) =>
      alsSuchverzeichniseintrag(g),
    );
    await aktualisiereGesetzeAutomatisch(gesetze);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aktualisiert nur Gesetze erreichbarer Quellen', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('landesrecht-bw.de')) throw verbindungsfehler;
      return new Response(null, { status: 200 });
    });
    const eu = baueGesetz({ normgeber: 'eu', kurztitel: 'TestG' });
    const bw = baueGesetz({ normgeber: 'de-bw', kurztitel: 'TestG' });
    vi.mocked(aktualisierungVomInternetEU).mockResolvedValue({
      art: 'erfolg',
      gesetz: eu,
      kategorie: 'aktualisiert',
    });
    const ergebnis = await aktualisiereGesetzeAutomatisch(
      [eu, bw].map((g) => alsSuchverzeichniseintrag(g)),
    );
    expect(aktualisierungGesetzVomInternetBWMock).not.toHaveBeenCalled();
    expect(aktualisierungVomInternetEU).toHaveBeenCalledTimes(1);
    expect(ergebnis).toMatchObject({
      art: 'ausgefuehrt',
      ergebnis: { aktualisierteReferenzen: [referenzVon(eu)] },
    });
  });
});
