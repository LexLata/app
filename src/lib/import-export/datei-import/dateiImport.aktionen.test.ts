// dateiImport.aktionen.test.ts
//
// Unit-Tests für loeseImportKonflikt: die
// Konfliktauflösung NACH einer Nutzerentscheidung im DateiImportOverlay
// (Ersetzen/Zusammenführen). Alle betroffenen Speicher-Module werden über
// vi.mock() ersetzt (Parameter-Injection wäre hier nicht möglich, die
// Verdrahtung Konflikt-art -> konkrete Speicher-Funktion ist selbst der
// Testgegenstand) – analog zum "Verdrahtung pro Format"-Abschnitt in
// dateiImport.einfach.test.ts. meldeAenderung wird aus
// '@/lib/import-export/datei-import/dateiImport.einfach' gemockt (dort
// tatsächlich definiert, siehe Kopfkommentar in der Quelldatei).

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ermittleImportAktionen, loeseImportKonflikt } from './dateiImport.aktionen';
import { GesetzSpeicherFolgefehler } from '@/lib/persistenz/gesetz/gesetz.index';
import type { GesetzKonflikt, DateiKonflikt, ImportKonflikt } from './dateiImport.types';

const speichereGesetz = vi.fn<(...args: unknown[]) => Promise<void>>();
const zusammenfuehrenFavoriten = vi.fn<(...args: unknown[]) => Promise<Set<string>>>();
const ersetzeFavoritenDatei = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  pruefeFavoritenImport: () => 1,
  zusammenfuehrenFavoriten: (...args: unknown[]) => zusammenfuehrenFavoriten(...args),
  ersetzeFavoritenDatei: (...args: unknown[]) => ersetzeFavoritenDatei(...args),
}));

const ersetzeNichtamtlicheTitelDatei = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  speichereGesetz: (...args: unknown[]) => speichereGesetz(...args),
  ersetzeNichtamtlicheTitelDatei: (...args: unknown[]) => ersetzeNichtamtlicheTitelDatei(...args),
}));

const zusammenfuehrenLesezeichen = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const ersetzeLesezeichenDatei = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher', () => ({
  pruefeLesezeichenImport: () => 1,
  zusammenfuehrenLesezeichen: (...args: unknown[]) => zusammenfuehrenLesezeichen(...args),
  ersetzeLesezeichenDatei: (...args: unknown[]) => ersetzeLesezeichenDatei(...args),
}));

const parseMarkierungsEintraege = vi.fn<(inhalt: string) => unknown[]>();
const zusammenfuehrenMarkierungen = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const ersetzeMarkierungenDatei = vi.fn<(...args: unknown[]) => Promise<boolean>>();
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  beurteileMarkierungsImport: (xml: string) => ({
    eintraege: parseMarkierungsEintraege(xml),
    ausgeschlossen: 0,
    meldungen: [],
  }),
  istMarkierungsImportUnveraendert: () => false,
  leseMarkierungenRohtext: async () => null,
  zusammenfuehrenMarkierungen: (...args: unknown[]) => zusammenfuehrenMarkierungen(...args),
  ersetzeMarkierungenDatei: (...args: unknown[]) => ersetzeMarkierungenDatei(...args),
}));

const zusammenfuehrenGesetzeskurzbefehle = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const ersetzeGesetzeskurzbefehleDatei = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  pruefeGesetzeskurzbefehleImport: () => 1,
  zusammenfuehrenGesetzeskurzbefehle: (...args: unknown[]) =>
    zusammenfuehrenGesetzeskurzbefehle(...args),
  ersetzeGesetzeskurzbefehleDatei: (...args: unknown[]) => ersetzeGesetzeskurzbefehleDatei(...args),
}));

const wendeEinstellungenXMLAn =
  vi.fn<typeof import('@/lib/einstellungen/einstellungen.index').wendeEinstellungenXMLAn>();
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  wendeEinstellungenXMLAn: (...args: [string]) => wendeEinstellungenXMLAn(...args),
}));

const meldeAenderung = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/lib/import-export/datei-import/dateiImport.einfach', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/import-export/datei-import/dateiImport.einfach')
  >()),
  meldeAenderung: (...args: unknown[]) => meldeAenderung(...args),
  ohneZeitstempel: (xml: string) => xml,
}));

beforeEach(() => {
  vi.clearAllMocks();
  wendeEinstellungenXMLAn.mockReturnValue({ aenderungsstand: 'vollstaendig', fehler: [] });
  zusammenfuehrenFavoriten.mockResolvedValue(new Set(['neu']));
  zusammenfuehrenLesezeichen.mockResolvedValue(true);
  zusammenfuehrenGesetzeskurzbefehle.mockResolvedValue(true);
  parseMarkierungsEintraege.mockReturnValue([]);
  zusammenfuehrenMarkierungen.mockResolvedValue(true);
  ersetzeMarkierungenDatei.mockResolvedValue(true);
});

function dateiKonflikt(overrides: Partial<DateiKonflikt> = {}): DateiKonflikt {
  return {
    art: 'favoriten',
    anzeigename: 'BGB Favoriten',
    kurztitel: 'BGB',
    importInhalt: '<x><a>neu</a></x>',
    gesetz:
      overrides.kurztitel === undefined
        ? gesetzesreferenz({ kurztitel: 'BGB' })
        : gesetzesreferenz({ kurztitel: overrides.kurztitel }),
    ...overrides,
  };
}

describe('loeseImportKonflikt: gesetz', () => {
  it('schreibt neuesXML unverändert über speichereGesetz', async () => {
    const konflikt: GesetzKonflikt = {
      art: 'gesetz',
      kurztitel: 'BGB',
      neuesXML: '<gesetz/>',
      neuesGesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    };
    await loeseImportKonflikt(konflikt, 'ersetzen');
    expect(speichereGesetz).toHaveBeenCalledWith(konflikt.neuesGesetz, '<gesetz/>', {
      inhaltGeaendert: true,
      meldungEmpfangen: expect.any(Function),
      zielGeschrieben: expect.any(Function),
    });
  });
});

describe('loeseImportKonflikt: favoriten', () => {
  it("aktion 'ersetzen' -> ersetzeFavoritenDatei(kurztitel, importInhalt), meldet 'favoriten'", async () => {
    const konflikt = dateiKonflikt({ art: 'favoriten', kurztitel: 'BGB' });
    await loeseImportKonflikt(konflikt, 'ersetzen');
    expect(ersetzeFavoritenDatei).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      konflikt.importInhalt,
      expect.any(Function),
    );
    expect(zusammenfuehrenFavoriten).not.toHaveBeenCalled();
    expect(meldeAenderung).not.toHaveBeenCalled();
  });

  it("aktion 'zusammenfuehren' -> parst importInhalt und ruft zusammenfuehrenFavoriten(kurztitel, geparst) auf", async () => {
    const konflikt = dateiKonflikt({ art: 'favoriten', kurztitel: 'BGB' });
    await loeseImportKonflikt(konflikt, 'zusammenfuehren');
    expect(zusammenfuehrenFavoriten).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      konflikt.importInhalt,
      expect.any(Function),
    );
    expect(ersetzeFavoritenDatei).not.toHaveBeenCalled();
    expect(meldeAenderung).not.toHaveBeenCalled();
  });
});

describe('loeseImportKonflikt: lesezeichen', () => {
  it("aktion 'ersetzen' -> ersetzeLesezeichenDatei(importInhalt) OHNE kurztitel, meldet 'lesezeichen'", async () => {
    const konflikt = dateiKonflikt({ art: 'lesezeichen', kurztitel: undefined });
    await loeseImportKonflikt(konflikt, 'ersetzen');
    expect(ersetzeLesezeichenDatei).toHaveBeenCalledWith(
      konflikt.importInhalt,
      expect.any(Function),
    );
    expect(meldeAenderung).not.toHaveBeenCalled();
  });

  it("aktion 'zusammenfuehren' -> parst importInhalt und ruft zusammenfuehrenLesezeichen(geparst) auf", async () => {
    const konflikt = dateiKonflikt({ art: 'lesezeichen', kurztitel: undefined });
    await loeseImportKonflikt(konflikt, 'zusammenfuehren');
    expect(zusammenfuehrenLesezeichen).toHaveBeenCalledWith(
      konflikt.importInhalt,
      expect.any(Function),
    );
  });
});

describe('loeseImportKonflikt: gesetzeskurzbefehle', () => {
  it("aktion 'ersetzen' -> ersetzeGesetzeskurzbefehleDatei(importInhalt), meldet 'gesetzeskurzbefehle'", async () => {
    const konflikt = dateiKonflikt({ art: 'gesetzeskurzbefehle', kurztitel: undefined });
    await loeseImportKonflikt(konflikt, 'ersetzen');
    expect(ersetzeGesetzeskurzbefehleDatei).toHaveBeenCalledWith(
      konflikt.importInhalt,
      expect.any(Function),
    );
    expect(meldeAenderung).not.toHaveBeenCalled();
  });

  it("aktion 'zusammenfuehren' -> zusammenfuehrenGesetzeskurzbefehle(importInhalt, behalteBestehendeBeiKonflikt) mit übergebenem Flag", async () => {
    const konflikt = dateiKonflikt({ art: 'gesetzeskurzbefehle', kurztitel: undefined });
    await loeseImportKonflikt(konflikt, 'zusammenfuehren', false);
    expect(zusammenfuehrenGesetzeskurzbefehle).toHaveBeenCalledWith(
      konflikt.importInhalt,
      false,
      expect.any(Function),
    );
  });

  it("aktion 'zusammenfuehren' OHNE explizites Flag -> Default true wird durchgereicht", async () => {
    const konflikt = dateiKonflikt({ art: 'gesetzeskurzbefehle', kurztitel: undefined });
    await loeseImportKonflikt(konflikt, 'zusammenfuehren');
    expect(zusammenfuehrenGesetzeskurzbefehle).toHaveBeenCalledWith(
      konflikt.importInhalt,
      true,
      expect.any(Function),
    );
  });
});

describe('loeseImportKonflikt: markierung', () => {
  it("aktion 'ersetzen' -> ersetzeMarkierungenDatei(kurztitel, importInhalt), meldet 'markierung' MIT kurztitel", async () => {
    const konflikt = dateiKonflikt({ art: 'markierung', kurztitel: 'ZPO' });
    await loeseImportKonflikt(konflikt, 'ersetzen');
    expect(ersetzeMarkierungenDatei).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'ZPO' }),
      konflikt.importInhalt,
      expect.any(Function),
      expect.any(Function),
    );
    expect(meldeAenderung).toHaveBeenCalledWith(
      'markierung',
      gesetzesreferenz({ kurztitel: 'ZPO' }),
    );
  });

  it("aktion 'zusammenfuehren' -> parst importInhalt und ruft zusammenfuehrenMarkierungen(kurztitel, geparst, behalteBestehendeBeiKonflikt) auf", async () => {
    const konflikt = dateiKonflikt({ art: 'markierung', kurztitel: 'ZPO' });
    const geparst = [{ typ: 'unterstreichung' }];
    parseMarkierungsEintraege.mockReturnValue(geparst);
    await loeseImportKonflikt(konflikt, 'zusammenfuehren', false);
    expect(parseMarkierungsEintraege).toHaveBeenCalledWith(konflikt.importInhalt);
    expect(zusammenfuehrenMarkierungen).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'ZPO' }),
      geparst,
      false,
      expect.any(Function),
      expect.any(Function),
    );
    expect(meldeAenderung).toHaveBeenCalledWith(
      'markierung',
      gesetzesreferenz({ kurztitel: 'ZPO' }),
    );
  });
});

describe('loeseImportKonflikt: nichtamtlicheTitel', () => {
  it("aktion 'ersetzen' -> identisches Verhalten", async () => {
    const konflikt = dateiKonflikt({ art: 'nichtamtlicheTitel', kurztitel: 'HGB' });
    await loeseImportKonflikt(konflikt, 'ersetzen');
    expect(ersetzeNichtamtlicheTitelDatei).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'HGB' }),
      konflikt.importInhalt,
      expect.any(Function),
      expect.any(Function),
    );
    expect(meldeAenderung).toHaveBeenCalledWith(
      'nichtamtlicheTitel',
      gesetzesreferenz({ kurztitel: 'HGB' }),
    );
  });
});

describe('loeseImportKonflikt: einstellungen', () => {
  it('Ersetzen ruft wendeEinstellungenXMLAn synchron ohne meldeAenderung auf', async () => {
    const konflikt = dateiKonflikt({
      art: 'einstellungen',
      kurztitel: undefined,
      importInhalt: '<einstellungen/>',
    });
    await loeseImportKonflikt(konflikt, 'ersetzen');
    expect(wendeEinstellungenXMLAn).toHaveBeenCalledWith('<einstellungen/>', expect.any(Function));
    expect(meldeAenderung).not.toHaveBeenCalled();
  });
});

const gesetz: GesetzKonflikt = {
  art: 'gesetz',
  kurztitel: 'BGB',
  neuesXML: '<gesetz/>',
  neuesGesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
};
const alleKonflikte = [
  gesetz,
  ...(
    [
      'favoriten',
      'lesezeichen',
      'gesetzeskurzbefehle',
      'markierung',
      'nichtamtlicheTitel',
      'einstellungen',
    ] as const
  ).map((art) =>
    dateiKonflikt({
      art,
      kurztitel: ['favoriten', 'markierung', 'nichtamtlicheTitel'].includes(art)
        ? 'BGB'
        : undefined,
      anzeigename: art,
    }),
  ),
];
const speicherMocks = [
  speichereGesetz,
  ersetzeFavoritenDatei,
  zusammenfuehrenFavoriten,
  ersetzeLesezeichenDatei,
  zusammenfuehrenLesezeichen,
  ersetzeGesetzeskurzbefehleDatei,
  zusammenfuehrenGesetzeskurzbefehle,
  ersetzeMarkierungenDatei,
  zusammenfuehrenMarkierungen,
  ersetzeNichtamtlicheTitelDatei,
  wendeEinstellungenXMLAn,
];
describe('gemeinsamer Konfliktvertrag', () => {
  it.each(alleKonflikte)('Aktionen und Berichte für $art', async (konflikt) => {
    const aktionen = ['gesetz', 'nichtamtlicheTitel', 'einstellungen'].includes(konflikt.art)
      ? (['ersetzen'] as const)
      : (['ersetzen', 'zusammenfuehren'] as const);
    expect(ermittleImportAktionen(konflikt)).toEqual(aktionen);
    expect(speicherMocks.every((mock) => mock.mock.calls.length === 0)).toBe(true);
    expect(meldeAenderung).not.toHaveBeenCalled();
    for (const aktion of aktionen) {
      expect(await loeseImportKonflikt(konflikt, aktion)).toEqual({
        ...(['markierung', 'gesetz', 'nichtamtlicheTitel', 'einstellungen'].includes(konflikt.art)
          ? {
              abschluss: expect.objectContaining({ abonnieren: expect.any(Function) }),
              meldungen: [],
            }
          : {}),
        ...(konflikt.art === 'einstellungen'
          ? { eingangUnvollstaendig: false, quelle: undefined }
          : {}),
        kategorie: konflikt.art,
        aktion: aktion === 'ersetzen' ? 'ersetzt' : 'zusammengefuehrt',
        name:
          konflikt.art === 'einstellungen'
            ? 'Einstellungen'
            : konflikt.art === 'gesetz'
              ? konflikt.kurztitel
              : (konflikt.kurztitel ?? konflikt.anzeigename),
      });
    }
  });
  it.each(
    alleKonflikte.filter((k) => ['gesetz', 'nichtamtlicheTitel', 'einstellungen'].includes(k.art)),
  )('verbietet Zusammenführen für $art vor I/O', async (konflikt) => {
    await expect(loeseImportKonflikt(konflikt, 'zusammenfuehren')).rejects.toThrow(
      /nicht zulässig/,
    );
    expect(speicherMocks.every((mock) => mock.mock.calls.length === 0)).toBe(true);
    expect(meldeAenderung).not.toHaveBeenCalled();
  });
  it('reicht Schreibfehler durch und benachrichtigt nicht', async () => {
    ersetzeFavoritenDatei.mockRejectedValueOnce(new Error('Schreiben'));
    await expect(loeseImportKonflikt(dateiKonflikt(), 'ersetzen')).rejects.toThrow('Schreiben');
    expect(meldeAenderung).not.toHaveBeenCalled();
  });
  it('Nutzerdatenmeldung liegt beim Speicher', async () => {
    await expect(loeseImportKonflikt(dateiKonflikt(), 'ersetzen')).resolves.toMatchObject({
      aktion: 'ersetzt',
    });
    expect(meldeAenderung).not.toHaveBeenCalled();
    expect(ersetzeFavoritenDatei).toHaveBeenCalledOnce();
  });
});

const speicherwege = [
  { art: 'gesetz', aktion: 'ersetzen', speichern: speichereGesetz },
  { art: 'favoriten', aktion: 'ersetzen', speichern: ersetzeFavoritenDatei },
  { art: 'favoriten', aktion: 'zusammenfuehren', speichern: zusammenfuehrenFavoriten },
  { art: 'lesezeichen', aktion: 'ersetzen', speichern: ersetzeLesezeichenDatei },
  { art: 'lesezeichen', aktion: 'zusammenfuehren', speichern: zusammenfuehrenLesezeichen },
  { art: 'gesetzeskurzbefehle', aktion: 'ersetzen', speichern: ersetzeGesetzeskurzbefehleDatei },
  {
    art: 'gesetzeskurzbefehle',
    aktion: 'zusammenfuehren',
    speichern: zusammenfuehrenGesetzeskurzbefehle,
  },
  { art: 'markierung', aktion: 'ersetzen', speichern: ersetzeMarkierungenDatei },
  { art: 'markierung', aktion: 'zusammenfuehren', speichern: zusammenfuehrenMarkierungen },
  { art: 'nichtamtlicheTitel', aktion: 'ersetzen', speichern: ersetzeNichtamtlicheTitelDatei },
  { art: 'einstellungen', aktion: 'ersetzen', speichern: wendeEinstellungenXMLAn },
] as const;
describe('Fehler und Reihenfolge aller Speicherwege', () => {
  it.each(speicherwege)(
    '$art/$aktion liefert bei Schreibfehler keinen Erfolg',
    async ({ art, aktion, speichern }) => {
      speichern.mockImplementationOnce(() => {
        throw new Error('Schreibfehler');
      });
      await expect(
        loeseImportKonflikt(
          alleKonflikte.find((k) => k.art === art)!,
          aktion,
        ),
      ).rejects.toThrow('Schreibfehler');
      expect(speichern).toHaveBeenCalledOnce();
      expect(meldeAenderung).not.toHaveBeenCalled();
    },
  );
  it.each(speicherwege.filter((w) => w.art === 'markierung' || w.art === 'nichtamtlicheTitel'))(
    '$art/$aktion speichert vor einem Ereignisfehler',
    async ({ art, aktion, speichern }) => {
      meldeAenderung.mockRejectedValueOnce(new Error('Ereignisfehler'));
      await expect(
        loeseImportKonflikt(
          alleKonflikte.find((k) => k.art === art)!,
          aktion,
        ),
      ).resolves.toMatchObject({
        aktion: aktion === 'ersetzen' ? 'ersetzt' : 'zusammengefuehrt',
        meldungen: [expect.objectContaining({ text: expect.stringContaining('Ereignisfehler') })],
      });
      expect(speichern).toHaveBeenCalledOnce();
      expect(meldeAenderung).toHaveBeenCalledWith(
        ...(art === 'markierung' || art === 'nichtamtlicheTitel'
          ? [art, gesetzesreferenz({ kurztitel: 'BGB' })]
          : [art]),
      );
      expect(speichern.mock.invocationCallOrder[0]).toBeLessThan(
        meldeAenderung.mock.invocationCallOrder[0]!,
      );
    },
  );
  it('Markierungsmerge reicht das Standardflag true durch', async () => {
    await loeseImportKonflikt(dateiKonflikt({ art: 'markierung' }), 'zusammenfuehren');
    expect(zusammenfuehrenMarkierungen).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [],
      true,
      expect.any(Function),
      expect.any(Function),
    );
  });
});

describe('vollständige Referenz nach Konfliktentscheidung', () => {
  it.each(['favoriten', 'markierung', 'nichtamtlicheTitel'] as const)(
    '%s behält den Normgeber',
    async (art) => {
      const referenz = { kurztitel: 'BGB', normgeber: 'de-bw' };
      const konflikt = dateiKonflikt({ art, gesetz: referenz });
      await loeseImportKonflikt(konflikt, 'ersetzen');
      const speichern =
        art === 'favoriten'
          ? ersetzeFavoritenDatei
          : art === 'markierung'
            ? ersetzeMarkierungenDatei
            : ersetzeNichtamtlicheTitelDatei;
      expect(speichern).toHaveBeenCalledWith(
        referenz,
        konflikt.importInhalt,
        expect.any(Function),
        ...(art === 'favoriten' ? [] : [expect.any(Function)]),
      );
      if (art !== 'favoriten') expect(meldeAenderung).toHaveBeenCalledWith(art, referenz);
    },
  );
});

describe('bestätigte Zielspeicherung bei unmittelbarem Folgefehler', () => {
  it.each(['markierung', 'nichtamtlicheTitel', 'gesetz'] as const)(
    '%s wird genau einmal gespeichert',
    async (art) => {
      const speichern =
        art === 'gesetz'
          ? speichereGesetz
          : art === 'markierung'
            ? ersetzeMarkierungenDatei
            : ersetzeNichtamtlicheTitelDatei;
      speichern.mockImplementationOnce(async (...args: unknown[]) => {
        const optionen: { meldungEmpfangen?: unknown; zielGeschrieben?: unknown } | undefined =
          art === 'gesetz' ? Object(args[2]) : undefined;
        const bestaetigen = optionen ? optionen.zielGeschrieben : args.at(-1);
        if (typeof bestaetigen !== 'function') throw new Error('Schreibbestätigung fehlt');
        bestaetigen();
        const empfangen = optionen ? optionen.meldungEmpfangen : args.at(-2);
        if (typeof empfangen !== 'function') throw new Error('Meldungsempfänger fehlt');
        empfangen({
          typ: 'fehler',
          art: 'hinweis',
          anlass: 'synchronisation',
          aenderungsstand: 'vollstaendig',
          text: 'Fensterfehler',
        });
        throw new Error('Fensterfehler');
      });
      const bericht = await loeseImportKonflikt(
        { ...benoetigterKonflikt(art), quelle: 'Archiv.zip → Ordner/Datei.xml' },
        'ersetzen',
      );
      expect(bericht).toMatchObject({ aktion: 'ersetzt', quelle: 'Archiv.zip → Ordner/Datei.xml' });
      expect(bericht.meldungen).toHaveLength(1);
      expect(speichern).toHaveBeenCalledOnce();
    },
  );
  it('GesetzSpeicherFolgefehler belegt die Speicherung auch ohne Callback', async () => {
    speichereGesetz.mockRejectedValueOnce(
      new GesetzSpeicherFolgefehler(true, new Error('Titelergänzung'), gesetz.neuesGesetz),
    );
    await expect(loeseImportKonflikt(gesetz, 'ersetzen')).resolves.toMatchObject({
      aktion: 'ersetzt',
      meldungen: [expect.objectContaining({ text: expect.stringContaining('Titelergänzung') })],
    });
  });
  it('eine erfolgreiche Sicherung belegt keine Zielspeicherung', async () => {
    ersetzeNichtamtlicheTitelDatei.mockImplementationOnce(async (...args: unknown[]) => {
      const empfangen = args[2];
      if (typeof empfangen !== 'function') throw new Error('Meldungsempfänger fehlt');
      empfangen({
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'sicherung',
        aenderungsstand: 'vollstaendig',
        text: 'Bestand gesichert',
      });
      throw new Error('Zieldatei nicht geschrieben');
    });
    await expect(
      loeseImportKonflikt(dateiKonflikt({ art: 'nichtamtlicheTitel' }), 'ersetzen'),
    ).rejects.toThrow('Bestand gesichert Zieldatei nicht geschrieben');
  });
});

function benoetigterKonflikt(art: ImportKonflikt['art']) {
  const konflikt = alleKonflikte.find((k) => k.art === art);
  if (!konflikt) throw new Error('Erwarteter Konflikt fehlt');
  return konflikt;
}

it('behält Referenzbefunde des Gesetzkonflikts nach Ersetzen', async () => {
  const meldung = {
    typ: 'warnung',
    art: 'hinweis',
    anlass: 'lesen',
    aenderungsstand: 'keine',
    text: 'Referenzzugriff fehlt',
  } as const;
  const konflikt = {
    art: 'gesetz',
    kurztitel: 'BGB',
    neuesGesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    neuesXML: '<gesetz/>',
    quelle: 'Archiv.zip → BGB.xml',
    meldungen: [meldung],
  } as const;
  const bericht = await loeseImportKonflikt(
    { ...konflikt, meldungen: [...konflikt.meldungen] },
    'ersetzen',
  );
  expect(bericht).toMatchObject({
    aktion: 'ersetzt',
    quelle: konflikt.quelle,
    meldungen: [meldung],
    eingangUnvollstaendig: false,
  });
});
