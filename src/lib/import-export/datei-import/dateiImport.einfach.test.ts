// dateiImport.test.ts
//
// Tests für klassifiziereEinfacheDatei (den generischen, per
// EinfacheFormatKonfiguration injizierten 3-Wege-Klassifizierer, der die
// vorher fünffach duplizierte if-Kette in verarbeiteEinfacheDatei ersetzt).
// Abhängigkeiten werden als Fake-Konfiguration übergeben statt über
// vi.mock() (Parameter-Injection statt Closures, siehe Kopfkommentar in
// verweismarkierungAktionen.test.ts) – daher testet dies bewusst NUR
// klassifiziereEinfacheDatei selbst, nicht das format->Konfiguration-Mapping
// in verarbeiteEinfacheDatei (das ist nach dem Refactor nur noch simpler
// Objekt-Zugriff, siehe EINFACHE_FORMAT_KONFIGURATION in der Quelldatei).

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  ohneZeitstempel,
  klassifiziereEinfacheDatei,
  verarbeiteEinfacheDatei,
  meldeAenderung,
} from './dateiImport.einfach';
import type { EinfacheFormatKonfiguration } from './dateiImport.einfach';
import {
  zusammenfuehrenFavoriten,
  leseFavoritenRohtext,
} from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import {
  leseNichtamtlicheTitelRohtext,
  ersetzeNichtamtlicheTitelDatei,
} from '@/lib/persistenz/gesetz/gesetz.index';
import {
  zusammenfuehrenLesezeichen,
  leseLesezeichenRohtext,
} from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import {
  beurteileMarkierungsImport,
  zusammenfuehrenMarkierungen,
  leseMarkierungenRohtext,
} from '@/lib/markierungen/markierungen.index';
import {
  zusammenfuehrenGesetzeskurzbefehle,
  leseGesetzeskurzbefehleRohtext,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import {
  baueEinstellungenXML,
  keineEinstellungExplizitGesetzt,
  wendeEinstellungenXMLAn,
} from '@/lib/einstellungen/einstellungen.index';
import { emitTo } from '@tauri-apps/api/event';

vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  pruefeFavoritenImport: () => 1,
  zusammenfuehrenFavoriten: vi.fn(),
  leseFavoritenRohtext: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  leseNichtamtlicheTitelRohtext: vi.fn(),
  ersetzeNichtamtlicheTitelDatei: vi.fn(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher', () => ({
  pruefeLesezeichenImport: () => 1,
  zusammenfuehrenLesezeichen: vi.fn(),
  leseLesezeichenRohtext: vi.fn(),
}));
vi.mock('@/lib/markierungen/markierungen.index', async (original) => ({
  liesMarkierungsGesetz: (await original<typeof import('@/lib/markierungen/markierungen.index')>())
    .liesMarkierungsGesetz,
  beurteileMarkierungsImport: vi.fn(),
  istMarkierungsImportUnveraendert: vi.fn(() => false),
  zusammenfuehrenMarkierungen: vi.fn(),
  leseMarkierungenRohtext: vi.fn(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  pruefeGesetzeskurzbefehleImport: () => 1,
  zusammenfuehrenGesetzeskurzbefehle: vi.fn(),
  leseGesetzeskurzbefehleRohtext: vi.fn(),
}));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  baueEinstellungenXML: vi.fn(),
  einstellungenOhneVerarbeitungszeit: vi.fn((s: string) => s),
  keineEinstellungExplizitGesetzt: vi.fn(),
  wendeEinstellungenXMLAn: vi.fn(() => ({ aenderungsstand: 'vollstaendig', fehler: [] })),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(),
}));

function konfig(overrides: Partial<EinfacheFormatKonfiguration> = {}): EinfacheFormatKonfiguration {
  return {
    kategorie: 'favoriten',
    name: (inhalt) => inhalt,
    leseRohtext: vi.fn<(name: string) => Promise<string | null>>(async () => null),
    importiere: vi.fn<(name: string, inhalt: string) => Promise<void>>(async () => undefined),
    meldeAenderung: vi.fn<(name: string) => Promise<void>>(async () => undefined),
    anzeigename: (name) => name,
    hatKurztitel: false,
    ...overrides,
  };
}

describe('klassifiziereEinfacheDatei', () => {
  it("kein Bestand (leseRohtext -> null): importiert, meldet die Änderung, art 'neu'", async () => {
    const leseRohtext = vi.fn<(name: string) => Promise<string | null>>(async () => null);
    const importiere = vi.fn<(name: string, inhalt: string) => Promise<void>>(
      async () => undefined,
    );
    const meldeAenderung = vi.fn<(name: string) => Promise<void>>(async () => undefined);
    const k = konfig({
      kategorie: 'markierung',
      name: () => 'BGB',
      leseRohtext,
      importiere,
      meldeAenderung,
    });

    const ergebnis = await klassifiziereEinfacheDatei('<inhalt/>', k);

    expect(leseRohtext).toHaveBeenCalledWith('BGB', undefined, expect.any(Function));
    expect(importiere).toHaveBeenCalledWith('BGB', '<inhalt/>', undefined, expect.any(Function));
    expect(meldeAenderung).toHaveBeenCalledWith('BGB');
    expect(ergebnis).toEqual({ art: 'neu', kategorie: 'markierung', name: 'BGB' });
  });

  it("Bestand vorhanden UND inhaltlich identisch (ohne <verarbeitungszeit>-Tag) -> 'unveraendert', kein Import/Meldung", async () => {
    const importiere = vi.fn<(name: string, inhalt: string) => Promise<void>>(
      async () => undefined,
    );
    const meldeAenderung = vi.fn<(name: string) => Promise<void>>(async () => undefined);
    const k = konfig({
      kategorie: 'lesezeichen',
      name: () => 'Lesezeichen',
      leseRohtext: async () =>
        '<x><infos><verarbeitungszeit>2025-01-01</verarbeitungszeit></infos><a/></x>',
      importiere,
      meldeAenderung,
    });

    const ergebnis = await klassifiziereEinfacheDatei(
      '<x><infos><verarbeitungszeit>2026-06-01</verarbeitungszeit></infos><a/></x>',
      k,
    );

    expect(importiere).not.toHaveBeenCalled();
    expect(meldeAenderung).not.toHaveBeenCalled();
    expect(ergebnis).toEqual({
      art: 'unveraendert',
      kategorie: 'lesezeichen',
      name: 'Lesezeichen',
    });
  });

  it('Edge-Case: unveraendert wird korrekt erkannt (Gegentest zum vorigen: identischer <verarbeitungszeit>-Tag-freier Inhalt)', async () => {
    const k = konfig({
      kategorie: 'lesezeichen',
      name: () => 'Lesezeichen',
      leseRohtext: async () =>
        '<x><infos><verarbeitungszeit>2025-01-01</verarbeitungszeit></infos><a/></x>',
    });

    const ergebnis = await klassifiziereEinfacheDatei(
      '<x><infos><verarbeitungszeit>2099-12-31</verarbeitungszeit></infos><a/></x>',
      k,
    );

    expect(ergebnis).toEqual({
      art: 'unveraendert',
      kategorie: 'lesezeichen',
      name: 'Lesezeichen',
    });
  });

  it('Bestand vorhanden UND inhaltlich unterschiedlich -> Konflikt-Objekt mit importInhalt, kein Import/Meldung', async () => {
    const importiere = vi.fn<(name: string, inhalt: string) => Promise<void>>(
      async () => undefined,
    );
    const meldeAenderung = vi.fn<(name: string) => Promise<void>>(async () => undefined);
    const k = konfig({
      kategorie: 'gesetzeskurzbefehle',
      name: () => 'Gesetzeskurzbefehle',
      leseRohtext: async () => '<x><a>alt</a></x>',
      anzeigename: () => 'Gesetzeskurzbefehle',
      importiere,
      meldeAenderung,
    });

    const ergebnis = await klassifiziereEinfacheDatei('<x><a>neu</a></x>', k);

    expect(importiere).not.toHaveBeenCalled();
    expect(meldeAenderung).not.toHaveBeenCalled();
    expect(ergebnis).toEqual({
      art: 'gesetzeskurzbefehle',
      anzeigename: 'Gesetzeskurzbefehle',
      kurztitel: undefined,
      importInhalt: '<x><a>neu</a></x>',
    });
  });

  it('hatKurztitel: true -> Konflikt-Objekt trägt kurztitel = name', async () => {
    const k = konfig({
      kategorie: 'favoriten',
      name: () => 'BGB',
      leseRohtext: async () => '<x><a>alt</a></x>',
      anzeigename: (name) => `${name} Favoriten`,
      hatKurztitel: true,
    });

    const ergebnis = await klassifiziereEinfacheDatei('<x><a>neu</a></x>', k);

    expect(ergebnis).toEqual({
      art: 'favoriten',
      anzeigename: 'BGB Favoriten',
      kurztitel: 'BGB',
      importInhalt: '<x><a>neu</a></x>',
    });
  });

  it('hatKurztitel: false -> Konflikt-Objekt trägt kurztitel = undefined (auch wenn name gesetzt ist)', async () => {
    const k = konfig({
      kategorie: 'gesetzeskurzbefehle',
      name: () => 'Gesetzeskurzbefehle',
      leseRohtext: async () => '<x><a>alt</a></x>',
      hatKurztitel: false,
    });

    const ergebnis = await klassifiziereEinfacheDatei('<x><a>neu</a></x>', k);

    expect(ergebnis).toMatchObject({ kurztitel: undefined });
  });

  it('name(inhalt) wird VOR leseRohtext ausgewertet und dessen Ergebnis konsistent an leseRohtext/importiere/meldeAenderung/anzeigename weitergereicht', async () => {
    const name = vi.fn<(inhalt: string) => string>((inhalt) => `Name-aus:${inhalt}`);
    const leseRohtext = vi.fn<(name: string) => Promise<string | null>>(async () => null);
    const importiere = vi.fn<(name: string, inhalt: string) => Promise<void>>(
      async () => undefined,
    );
    const meldeAenderung = vi.fn<(name: string) => Promise<void>>(async () => undefined);
    const k = konfig({ name, leseRohtext, importiere, meldeAenderung });

    await klassifiziereEinfacheDatei('roh-inhalt', k);

    expect(name).toHaveBeenCalledWith('roh-inhalt');
    expect(leseRohtext).toHaveBeenCalledWith(
      'Name-aus:roh-inhalt',
      undefined,
      expect.any(Function),
    );
    expect(importiere).toHaveBeenCalledWith(
      'Name-aus:roh-inhalt',
      'roh-inhalt',
      undefined,
      expect.any(Function),
    );
    expect(meldeAenderung).toHaveBeenCalledWith('Name-aus:roh-inhalt');
  });
});

// ---------------------------------------------------------------------------
// verarbeiteEinfacheDatei / EINFACHE_FORMAT_KONFIGURATION
//
// Anders als oben wird hier NICHT mehr über eine Fake-Konfiguration
// injiziert, sondern die produktive Verdrahtung Format-String -> echte
// Speicher-Funktion geprüft (via vi.mock der importierten Module) – das ist
// exakt die Stelle, die verarbeiteEinfacheDatei tatsächlich aufruft
// (dateiImport.ts) und die vorher trotz "Survived"-Status in
// Wirklichkeit nie aufgerufen wurde: das Objektliteral zählt beim
// Modul-Import bereits als Coverage, ohne dass eine der Arrow-Functions je
// ausgeführt oder einer der kategorie/anzeigename/hatKurztitel-Werte
// je gelesen wurde (siehe Mutation-Testing-Analyse im Chatverlauf).
describe('verarbeiteEinfacheDatei: Verdrahtung pro Format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(beurteileMarkierungsImport).mockReturnValue({
      eintraege: [],
      ausgeschlossen: 0,
      meldungen: [],
    });
    vi.mocked(emitTo).mockResolvedValue(undefined);
  });

  describe('favoriten-xml', () => {
    it("kein Bestand: liest/importiert über favoritenSpeicher, meldet 'favoriten-geaendert'", async () => {
      vi.mocked(leseFavoritenRohtext).mockResolvedValue(null);

      const ergebnis = await verarbeiteEinfacheDatei(
        'favoriten-xml',
        '<x><infos><gesetz normgeber="de-bund">BGB</gesetz></infos></x>',
      );

      expect(leseFavoritenRohtext).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        expect.any(Function),
      );
      expect(zusammenfuehrenFavoriten).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        '<x><infos><gesetz normgeber="de-bund">BGB</gesetz></infos></x>',
        expect.any(Function),
      );
      expect(emitTo).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({ art: 'neu', kategorie: 'favoriten', name: 'BGB' });
    });

    it('Konflikt: anzeigename und kurztitel korrekt befüllt', async () => {
      vi.mocked(leseFavoritenRohtext).mockResolvedValue('<x><a>alt</a></x>');

      const ergebnis = await verarbeiteEinfacheDatei(
        'favoriten-xml',
        '<x><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><a>neu</a></x>',
      );

      expect(ergebnis).toMatchObject({
        art: 'favoriten',
        anzeigename: 'BGB Favoriten',
        kurztitel: 'BGB',
      });
    });

    it('weist fehlende Gesetzesreferenz vor dem Import zurück', async () => {
      vi.mocked(leseFavoritenRohtext).mockResolvedValue(null);

      await expect(verarbeiteEinfacheDatei('favoriten-xml', '<x/>')).rejects.toThrow(
        'Gesetzesreferenz fehlt',
      );
      expect(leseFavoritenRohtext).not.toHaveBeenCalled();
    });

    it('<gesetz> mit umgebendem Whitespace wird getrimmt', async () => {
      vi.mocked(leseFavoritenRohtext).mockResolvedValue(null);

      const ergebnis = await verarbeiteEinfacheDatei(
        'favoriten-xml',
        '<x><infos><gesetz normgeber="de-bund">  BGB  </gesetz></infos></x>',
      );

      expect(leseFavoritenRohtext).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        expect.any(Function),
      );
      expect(ergebnis).toEqual({ art: 'neu', kategorie: 'favoriten', name: 'BGB' });
    });
  });

  describe('markierung-xml', () => {
    it('kein Bestand: liest/importiert über markierungSpeicher.dateiImport, meldet mit Kurztitel', async () => {
      vi.mocked(leseMarkierungenRohtext).mockResolvedValue(null);
      vi.mocked(beurteileMarkierungsImport).mockReturnValue({
        eintraege: [],
        ausgeschlossen: 0,
        meldungen: [],
      });

      const ergebnis = await verarbeiteEinfacheDatei(
        'markierung-xml',
        '<x><infos><gesetz normgeber="de-bund">ZPO</gesetz></infos></x>',
      );

      expect(leseMarkierungenRohtext).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: 'ZPO' }),
        expect.any(Function),
      );
      expect(zusammenfuehrenMarkierungen).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: 'ZPO' }),
        [],
        true,
        expect.any(Function),
        expect.any(Function),
      );
      expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungen-geaendert', {
        gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }),
      });
      expect(ergebnis).toEqual({
        art: 'neu',
        kategorie: 'markierung',
        name: 'ZPO',
        meldungen: [],
        abschluss: expect.objectContaining({ abonnieren: expect.any(Function) }),
      });
    });

    it('Konflikt: anzeigename und kurztitel korrekt befüllt', async () => {
      vi.mocked(leseMarkierungenRohtext).mockResolvedValue('<x><a>alt</a></x>');

      const ergebnis = await verarbeiteEinfacheDatei(
        'markierung-xml',
        '<x><infos><gesetz normgeber="de-bund">ZPO</gesetz></infos><a>neu</a></x>',
      );

      expect(ergebnis).toMatchObject({
        art: 'markierung',
        anzeigename: 'ZPO Markierungen',
        kurztitel: 'ZPO',
      });
    });

    it('ordnet die Markierungsdatei nach getrimmtem Kurztitel und Normgeber unter infos zu', async () => {
      vi.mocked(leseMarkierungenRohtext).mockClear();
      vi.mocked(leseMarkierungenRohtext).mockResolvedValue(null);
      vi.mocked(beurteileMarkierungsImport).mockReturnValue({
        eintraege: [],
        ausgeschlossen: 0,
        meldungen: [],
      });

      await verarbeiteEinfacheDatei(
        'markierung-xml',
        '<markierungen><infos><gesetz normgeber="de-bw"><!--x-->  BGB  </gesetz></infos><inhalt/></markierungen>',
      );

      expect(leseMarkierungenRohtext).toHaveBeenCalledWith(
        { kurztitel: 'BGB', normgeber: 'de-bw' },
        expect.any(Function),
      );
    });

    it('weist eine Markierungsdatei ohne Gesetzesreferenz unter infos vor dem Bestandszugriff zurück', async () => {
      vi.mocked(leseMarkierungenRohtext).mockClear();

      await expect(
        verarbeiteEinfacheDatei(
          'markierung-xml',
          '<markierungen><infos/><inhalt><gesetz normgeber="de-bund">ZPO</gesetz></inhalt></markierungen>',
        ),
      ).rejects.toThrow('Datei ungültig: Gesetzesreferenz fehlt.');
      await expect(
        verarbeiteEinfacheDatei(
          'markierung-xml',
          '<markierungen><infos><gesetz normgeber="A_B">ZPO</gesetz></infos></markierungen>',
        ),
      ).rejects.toThrow('Normgeber');
      expect(leseMarkierungenRohtext).not.toHaveBeenCalled();
    });
  });

  describe('lesezeichen-xml', () => {
    it("kein Bestand: fester Name 'Lesezeichen', liest/importiert über lesezeichenSpeicher, kein kurztitel", async () => {
      vi.mocked(leseLesezeichenRohtext).mockResolvedValue(null);

      const ergebnis = await verarbeiteEinfacheDatei('lesezeichen-xml', '<x/>');

      expect(leseLesezeichenRohtext).toHaveBeenCalledWith(expect.any(Function));
      expect(zusammenfuehrenLesezeichen).toHaveBeenCalledWith('<x/>', expect.any(Function));
      expect(emitTo).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({ art: 'neu', kategorie: 'lesezeichen', name: 'Lesezeichen' });
    });

    it('Konflikt: anzeigename fix, keine kurztitel (hatKurztitel: false)', async () => {
      vi.mocked(leseLesezeichenRohtext).mockResolvedValue('<x><a>alt</a></x>');

      const ergebnis = await verarbeiteEinfacheDatei('lesezeichen-xml', '<x><a>neu</a></x>');

      expect(ergebnis).toMatchObject({
        art: 'lesezeichen',
        anzeigename: 'Lesezeichen',
        kurztitel: undefined,
      });
    });
  });

  describe('nichtamtlicheTitel-xml', () => {
    it('kein Bestand: liest über nichtamtlicheTitelSpeicher, importiert DIREKT (ohne Wrapper), meldet über gesetze-geaendert', async () => {
      vi.mocked(leseNichtamtlicheTitelRohtext).mockResolvedValue(null);

      const ergebnis = await verarbeiteEinfacheDatei(
        'nichtamtlicheTitel-xml',
        '<x><infos><gesetz normgeber="de-bund">HGB</gesetz></infos></x>',
      );

      expect(leseNichtamtlicheTitelRohtext).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: 'HGB' }),
        expect.any(Function),
      );
      expect(ersetzeNichtamtlicheTitelDatei).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: 'HGB' }),
        '<x><infos><gesetz normgeber="de-bund">HGB</gesetz></infos></x>',
        expect.any(Function),
        expect.any(Function),
      );
      expect(emitTo).toHaveBeenCalledWith('*', 'gesetze-geaendert', [
        gesetzesreferenz({ kurztitel: 'HGB' }),
      ]);
      expect(ergebnis).toEqual({
        art: 'neu',
        kategorie: 'nichtamtlicheTitel',
        name: 'HGB',
        meldungen: [],
        abschluss: expect.objectContaining({ abonnieren: expect.any(Function) }),
      });
    });

    it('Konflikt: anzeigename und kurztitel korrekt befüllt', async () => {
      vi.mocked(leseNichtamtlicheTitelRohtext).mockResolvedValue('<x><a>alt</a></x>');

      const ergebnis = await verarbeiteEinfacheDatei(
        'nichtamtlicheTitel-xml',
        '<x><infos><gesetz normgeber="de-bund">HGB</gesetz></infos><a>neu</a></x>',
      );

      expect(ergebnis).toMatchObject({
        art: 'nichtamtlicheTitel',
        anzeigename: 'HGB nichtamtliche Titel',
        kurztitel: 'HGB',
      });
    });
  });

  describe('gesetzeskurzbefehle-xml', () => {
    it("kein Bestand: fester Name 'Gesetzeskurzbefehle', liest/importiert über gesetzeskurzbefehlSpeicher, kein kurztitel", async () => {
      vi.mocked(leseGesetzeskurzbefehleRohtext).mockResolvedValue(null);

      const ergebnis = await verarbeiteEinfacheDatei('gesetzeskurzbefehle-xml', '<x/>');

      expect(leseGesetzeskurzbefehleRohtext).toHaveBeenCalledWith(expect.any(Function));
      expect(zusammenfuehrenGesetzeskurzbefehle).toHaveBeenCalledWith(
        '<x/>',
        true,
        expect.any(Function),
      );
      expect(emitTo).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({
        art: 'neu',
        kategorie: 'gesetzeskurzbefehle',
        name: 'Gesetzeskurzbefehle',
      });
    });

    it('Konflikt: anzeigename fix, keine kurztitel (hatKurztitel: false)', async () => {
      vi.mocked(leseGesetzeskurzbefehleRohtext).mockResolvedValue('<x><a>alt</a></x>');

      const ergebnis = await verarbeiteEinfacheDatei(
        'gesetzeskurzbefehle-xml',
        '<x><a>neu</a></x>',
      );

      expect(ergebnis).toMatchObject({
        art: 'gesetzeskurzbefehle',
        anzeigename: 'Gesetzeskurzbefehle',
        kurztitel: undefined,
      });
    });
  });

  describe('einstellungen-xml (Sonderfall, kein EinfacheFormatKonfiguration-Eintrag)', () => {
    it('noch keine Einstellung explizit gesetzt: wendet XML direkt an, art "neu"', async () => {
      vi.mocked(keineEinstellungExplizitGesetzt).mockReturnValue(true);

      const ergebnis = await verarbeiteEinfacheDatei('einstellungen-xml', '<einstellungen/>');

      expect(wendeEinstellungenXMLAn).toHaveBeenCalledWith(
        '<einstellungen/>',
        expect.any(Function),
      );
      expect(ergebnis).toMatchObject({
        art: 'neu',
        kategorie: 'einstellungen',
        name: 'Einstellungen',
        meldungen: [],
        abschluss: expect.any(Object),
      });
    });

    it('Einstellung bereits gesetzt UND inhaltlich identisch (ohne verarbeitungszeit-Tag) -> "unveraendert"', async () => {
      vi.mocked(keineEinstellungExplizitGesetzt).mockReturnValue(false);
      vi.mocked(baueEinstellungenXML).mockReturnValue('<einstellungen><a>1</a></einstellungen>');

      const ergebnis = await verarbeiteEinfacheDatei(
        'einstellungen-xml',
        '<einstellungen><a>1</a></einstellungen>',
      );

      expect(wendeEinstellungenXMLAn).not.toHaveBeenCalled();
      expect(ergebnis).toEqual({
        art: 'unveraendert',
        kategorie: 'einstellungen',
        name: 'Einstellungen',
      });
    });

    it('Einstellung bereits gesetzt UND inhaltlich unterschiedlich -> Konflikt', async () => {
      vi.mocked(keineEinstellungExplizitGesetzt).mockReturnValue(false);
      vi.mocked(baueEinstellungenXML).mockReturnValue('<einstellungen><a>1</a></einstellungen>');

      const ergebnis = await verarbeiteEinfacheDatei(
        'einstellungen-xml',
        '<einstellungen><a>2</a></einstellungen>',
      );

      expect(ergebnis).toEqual({
        art: 'einstellungen',
        anzeigename: 'Einstellungen',
        importInhalt: '<einstellungen><a>2</a></einstellungen>',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Property-Test: <verarbeitungszeit>-Tag-Inhalt darf beliebig sein, ohne die
// unveraendert/Konflikt-Klassifizierung zu beeinflussen (solange der Rest
// des Inhalts identisch ist). Bestätigt zugleich, dass der äquivalente
// StringLiteral-Mutant in ohneGeaendertTag (siehe Stryker-disable-Kommentar
// an der Implementierung) über die öffentliche API nicht beobachtbar ist.
// ---------------------------------------------------------------------------
describe('Property: klassifiziereEinfacheDatei ignoriert <verarbeitungszeit>-Tag-Inhalt', () => {
  it('liefert für beliebige, unterschiedliche <verarbeitungszeit>-Werte bei sonst identischem Inhalt immer "unveraendert"', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('<')),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('<')),
        async (altesDatum, neuesDatum) => {
          const k = konfig({
            kategorie: 'lesezeichen',
            name: () => 'Lesezeichen',
            leseRohtext: async () =>
              `<x><infos><verarbeitungszeit>${altesDatum}</verarbeitungszeit></infos><a/></x>`,
          });

          const ergebnis = await klassifiziereEinfacheDatei(
            `<x><infos><verarbeitungszeit>${neuesDatum}</verarbeitungszeit></infos><a/></x>`,
            k,
          );

          expect(ergebnis).toEqual({
            art: 'unveraendert',
            kategorie: 'lesezeichen',
            name: 'Lesezeichen',
          });
        },
      ),
    );
  });
});

it.each([
  'favoriten',
  'lesezeichen',
  'gesetzeskurzbefehle',
  'markierung',
  'nichtamtlicheTitel',
] as const)(
  '%s blendet ausschließlich seinen direkten infos-Zeitstempel aus',
  async (kategorie) => {
    const tag = kategorie === 'nichtamtlicheTitel' ? 'geaendert' : 'verarbeitungszeit';
    const xml = (zeit: string, text: string) =>
      `<x><infos><${tag}>${zeit}</${tag}></infos><inhalt><${tag}>${text}</${tag}></inhalt></x>`;
    const k = konfig({ kategorie, leseRohtext: async () => xml('alt', 'Text') });
    expect((await klassifiziereEinfacheDatei(xml('neu', 'Text'), k)).art).toBe('unveraendert');
    expect((await klassifiziereEinfacheDatei(xml('neu', 'Änderung'), k)).art).toBe(kategorie);
    const andererTag = tag === 'geaendert' ? 'verarbeitungszeit' : 'geaendert';
    const fremd = (zeit: string) => `<x><infos><${andererTag}>${zeit}</${andererTag}></infos></x>`;
    expect(
      (
        await klassifiziereEinfacheDatei(
          fremd('neu'),
          konfig({ kategorie, leseRohtext: async () => fremd('alt') }),
        )
      ).art,
    ).toBe(kategorie);
    const verschachtelt = (zeit: string) =>
      `<x><infos><stand><${tag}>${zeit}</${tag}></stand></infos></x>`;
    expect(
      (
        await klassifiziereEinfacheDatei(
          verschachtelt('neu'),
          konfig({ kategorie, leseRohtext: async () => verschachtelt('alt') }),
        )
      ).art,
    ).toBe(kategorie);
  },
);

it('ordnet maskierte Gesetzesbezüge nach einmaligem Dekodieren dem Bestand zu', async () => {
  const gesetz = `&<>"' &amp; &lt;`;
  vi.mocked(leseFavoritenRohtext).mockResolvedValue(null);
  const ergebnis = await verarbeiteEinfacheDatei(
    'favoriten-xml',
    '<favoriten><infos><gesetz normgeber="de-bund">&amp;&lt;&gt;&quot;&apos; &amp;amp; &amp;lt;</gesetz></infos></favoriten>',
  );
  expect(leseFavoritenRohtext).toHaveBeenCalledWith(
    gesetzesreferenz({ kurztitel: gesetz }),
    expect.any(Function),
  );
  expect(zusammenfuehrenFavoriten).toHaveBeenCalledWith(
    gesetzesreferenz({ kurztitel: gesetz }),
    expect.any(String),
    expect.any(Function),
  );
  expect(ergebnis).toMatchObject({ name: gesetz });
});

it('verwendet einen Kurztitel außerhalb von infos nicht als Dateizuordnung', async () => {
  vi.mocked(leseFavoritenRohtext).mockClear();
  vi.mocked(leseFavoritenRohtext).mockResolvedValue(null);
  await expect(
    verarbeiteEinfacheDatei(
      'favoriten-xml',
      '<favoriten><infos/><inhalt><gesetz normgeber="de-bund">Zielgesetz</gesetz></inhalt></favoriten>',
    ),
  ).rejects.toThrow('Gesetzesreferenz fehlt');
  expect(leseFavoritenRohtext).not.toHaveBeenCalled();
});

it.each(['markierung-xml', 'nichtamtlicheTitel-xml'] as const)(
  'dekodiert auch die Zuordnung für %s genau einmal',
  async (format) => {
    const gesetz = `&<>"' &amp; &lt;`;
    vi.mocked(leseMarkierungenRohtext).mockResolvedValue(null);
    vi.mocked(leseNichtamtlicheTitelRohtext).mockResolvedValue(null);
    vi.mocked(beurteileMarkierungsImport).mockReturnValue({
      eintraege: [],
      ausgeschlossen: 0,
      meldungen: [],
    });
    const xml =
      '<x><infos><gesetz normgeber="de-bund">&amp;&lt;&gt;&quot;&apos; &amp;amp; &amp;lt;</gesetz></infos></x>';
    await verarbeiteEinfacheDatei(format, xml);
    if (format === 'markierung-xml') {
      expect(leseMarkierungenRohtext).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: gesetz }),
        expect.any(Function),
      );
      expect(zusammenfuehrenMarkierungen).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: gesetz }),
        [],
        true,
        expect.any(Function),
        expect.any(Function),
      );
    } else {
      expect(leseNichtamtlicheTitelRohtext).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: gesetz }),
        expect.any(Function),
      );
      expect(ersetzeNichtamtlicheTitelDatei).toHaveBeenCalledWith(
        gesetzesreferenz({ kurztitel: gesetz }),
        xml,
        expect.any(Function),
        expect.any(Function),
      );
    }
  },
);

it.each(['favoriten-xml', 'markierung-xml', 'nichtamtlicheTitel-xml'] as const)(
  '%s ordnet infos/gesetz zu und ignoriert abweichende Verweisziele',
  async (format) => {
    vi.mocked(leseFavoritenRohtext).mockResolvedValue(null);
    vi.mocked(leseMarkierungenRohtext).mockResolvedValue(null);
    vi.mocked(leseNichtamtlicheTitelRohtext).mockResolvedValue(null);
    vi.mocked(beurteileMarkierungsImport).mockReturnValue({
      eintraege: [],
      ausgeschlossen: 0,
      meldungen: [],
    });
    const xml =
      '<x><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><verweisziel><gesetz normgeber="de-bund">GG</gesetz></verweisziel></inhalt></x>';
    const ergebnis = await verarbeiteEinfacheDatei(format, xml);
    expect(ergebnis).toMatchObject({ name: 'BGB' });
    const leser =
      format === 'favoriten-xml'
        ? leseFavoritenRohtext
        : format === 'markierung-xml'
          ? leseMarkierungenRohtext
          : leseNichtamtlicheTitelRohtext;
    expect(leser).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      expect.any(Function),
    );
    expect(leser).not.toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'GG' }),
      expect.any(Function),
    );
  },
);

it('ordnet den Datei-Import nach Titel und Normgeber zu und bewahrt die Referenz im Konflikt', async () => {
  const roh =
    '<favoriten><infos><gesetz extra="ja" normgeber="de-bw"><!--neu-->BGB</gesetz></infos><inhalt/></favoriten>';
  vi.mocked(leseFavoritenRohtext).mockResolvedValue(null);
  await verarbeiteEinfacheDatei('favoriten-xml', roh);
  expect(leseFavoritenRohtext).toHaveBeenCalledWith(
    { kurztitel: 'BGB', normgeber: 'de-bw' },
    expect.any(Function),
  );
  expect(zusammenfuehrenFavoriten).toHaveBeenCalledWith(
    { kurztitel: 'BGB', normgeber: 'de-bw' },
    roh,
    expect.any(Function),
  );
  vi.mocked(leseFavoritenRohtext).mockResolvedValue('anderer Bestand');
  expect(await verarbeiteEinfacheDatei('favoriten-xml', roh)).toMatchObject({
    gesetz: { kurztitel: 'BGB', normgeber: 'de-bw' },
  });
  await expect(
    verarbeiteEinfacheDatei('favoriten-xml', roh.replace('normgeber="de-bw"', 'normgeber="A_B"')),
  ).rejects.toThrow('Normgeber');
});

it('Markierungsdatei-Import erreicht am tatsächlichen Meldeweg zwei verschieden benannte Hauptfenster', async () => {
  const eventAPI =
    await vi.importActual<typeof import('@tauri-apps/api/event')>('@tauri-apps/api/event');
  vi.doMock('@tauri-apps/api/event', () => eventAPI);
  let fenster = 'import';
  let naechsteId = 0;
  type Empfang = (event: { payload: unknown }) => void;
  const empfaenger = new Map<number, { fenster: string; event: string; callback: Empfang }>();
  vi.stubGlobal('window', {
    __TAURI_INTERNALS__: {
      transformCallback: (callback: Empfang) => callback,
      invoke: async (
        befehl: string,
        args: {
          event: string;
          target: { kind: 'Any' } | { kind: 'AnyLabel'; label: string };
          handler: Empfang;
          eventId: number;
          payload: unknown;
        },
      ) => {
        if (befehl === 'plugin:event|listen') {
          const id = ++naechsteId;
          empfaenger.set(id, { fenster, event: args.event, callback: args.handler });
          return id;
        }
        if (befehl === 'plugin:event|unlisten') {
          empfaenger.delete(args.eventId);
          return;
        }
        if (befehl === 'plugin:event|emit_to') {
          for (const eintrag of empfaenger.values()) {
            if (
              eintrag.event === args.event &&
              (args.target.kind === 'Any' || args.target.label === eintrag.fenster)
            )
              eintrag.callback({ payload: args.payload });
          }
          return;
        }
        throw new Error(befehl);
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
  try {
    const a = vi.fn();
    const b = vi.fn();
    fenster = 'gesetz-a';
    const abmeldenA = await eventAPI.listen('markierungen-geaendert', a);
    fenster = 'gesetz-b';
    const abmeldenB = await eventAPI.listen('markierungen-geaendert', b);
    fenster = 'import';
    const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
    await meldeAenderung('markierung', gesetz);
    expect(a).toHaveBeenCalledExactlyOnceWith({ payload: { gesetz } });
    expect(b).toHaveBeenCalledExactlyOnceWith({ payload: { gesetz } });
    await abmeldenA();
    await abmeldenB();
    expect(empfaenger.size).toBe(0);
  } finally {
    vi.unstubAllGlobals();
    vi.doMock('@tauri-apps/api/event', () => ({ emitTo }));
  }
});

describe('ohneZeitstempel', () => {
  it.each([
    'favoriten',
    'lesezeichen',
    'gesetzeskurzbefehle',
    'markierung',
    'nichtamtlicheTitel',
    'einstellungen',
  ] as const)('entfernt bei %s nur die zugehörige direkte Zeitangabe', (kategorie) => {
    const tag = kategorie === 'nichtamtlicheTitel' ? 'geaendert' : 'verarbeitungszeit';
    const andererTag = tag === 'geaendert' ? 'verarbeitungszeit' : 'geaendert';
    const rest = `<${andererTag}>bleibt</${andererTag}><zusatz><${tag}>fachlich</${tag}></zusatz>`;
    const xml = `<?xml version="1.0"?><daten><infos><${tag}>alt</${tag}>${rest}</infos><inhalt/></daten>`;
    expect(ohneZeitstempel(xml, kategorie)).toBe(
      `<?xml version="1.0"?><daten><infos>${rest}</infos><inhalt/></daten>`,
    );
    const ohneZeit = `<daten><infos>${rest}</infos><inhalt/></daten>`;
    expect(ohneZeitstempel(ohneZeit, kategorie)).toBe(ohneZeit);
  });
});
