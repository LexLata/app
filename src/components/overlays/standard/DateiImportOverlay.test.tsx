// Fehlgeschlagene Konfliktaktionen behalten die Importkandidaten; Sammelaktionen
// berichten ausschließlich die vorher tatsächlich abgeschlossenen Dateien.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { DateiImportOverlay } from './DateiImportOverlay';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { OverlayKopfzeile } from './OverlayKopfzeile';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import type { DateiImportErgebnis, ImportKonflikt } from '@/lib/import-export/import-export.index';

const { zustand, aufloesen, aktionen, gliedern } = vi.hoisted(() => ({
  zustand: {
    werte: [] as unknown[],
    nummer: 0,
    refs: new Array<{ current: unknown }>(),
    refNummer: 0,
  },
  aufloesen: vi.fn(),
  aktionen: vi.fn(),
  gliedern: vi.fn<(eintraege: unknown, fehler: unknown[]) => unknown>(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useReducer: () => [0, () => {}],
  useEffect: () => {},
  useRef: (anfang: unknown) => {
    const nummer = zustand.refNummer++;
    zustand.refs[nummer] ??= { current: anfang };
    return zustand.refs[nummer];
  },
  useState: (anfang: unknown) => {
    const nummer = zustand.nummer++;
    // Wie React: eine Funktion als Anfangswert wird einmal aufgerufen.
    if (!(nummer in zustand.werte))
      zustand.werte[nummer] = typeof anfang === 'function' ? anfang() : anfang;
    return [
      zustand.werte[nummer],
      (wert: unknown) => {
        zustand.werte[nummer] = typeof wert === 'function' ? wert(zustand.werte[nummer]) : wert;
      },
    ];
  },
}));
// Zuordnung und Umwandlung der Neulademeldungen bleiben echt (öffentliches Interface).
vi.mock('@/lib/import-export/import-export.index', async (original) => ({
  betroffenesGesetz: (await original<typeof import('@/lib/import-export/import-export.index')>())
    .betroffenesGesetz,
  meldungAlsImportFehler: (
    await original<typeof import('@/lib/import-export/import-export.index')>()
  ).meldungAlsImportFehler,
  ImportAbschlussFehler: class extends Error {},
  loeseImportKonflikt: aufloesen,
  ermittleImportAktionen: aktionen,
  gliedereImportbericht: gliedern,
  istReinerImportErfolg: () => false,
}));
vi.mock('@/hooks/stil/useTextRollen', () => ({ useTextRollen: () => ({}) }));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useButtonRollen', () => ({
  useButtonRollen: () => ({ sekundaerKompakt: () => ({}), sekundaer: () => ({}) }),
}));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({
  useAbstandRollen: () => ({}),
  erzeugeAbstandRollen: () => ({}),
}));

function findeButton(knoten: ReactNode, text: string): (() => Promise<void>) | undefined {
  return alleKnoepfe(knoten, text)[0]?.onClick;
}
/** Knopf an der Stelle i; fehlt er, schlägt der Test fehl. */
function knopf(knoten: ReactNode, text: string, i = 0): KnopfProps {
  const gefunden = alleKnoepfe(knoten, text)[i];
  if (!gefunden) throw new Error(`Knopf „${text}“ fehlt.`);
  return gefunden;
}
type KnopfProps = { onClick: () => Promise<void>; disabled?: boolean };
/** Alle Knöpfe mit der Aufschrift, in Anzeigereihenfolge. */
function alleKnoepfe(knoten: ReactNode, text: string): KnopfProps[] {
  if (Array.isArray(knoten)) return knoten.flatMap((kind) => alleKnoepfe(kind, text));
  if (!knoten || typeof knoten !== 'object' || !('props' in knoten)) return [];
  const el = knoten as ReactElement<KnopfProps & { children?: ReactNode }>;
  const kind = el.props.children as ReactElement<{ text?: string }> | undefined;
  if (el.type === 'button' && kind?.type === TextAnzeige && kind.props.text === text)
    return [el.props];
  return alleKnoepfe(el.props.children, text);
}
/** Kopfzeile des gerenderten Overlays (Schließen-Kreuz). */
function kopfzeile(baum: ReturnType<typeof rendern>) {
  const kinder = baum.props.children as ReactElement<{
    schliessenDeaktiviert?: boolean;
    onSchliessen: () => void;
  }>[];
  const kopf = kinder.find((kind) => kind.type === OverlayKopfzeile);
  if (!kopf) throw new Error('Kopfzeile fehlt.');
  return kopf;
}
function gesetzKonflikt(kurztitel: string, normgeber = 'de-bund'): ImportKonflikt {
  return {
    art: 'gesetz',
    kurztitel,
    neuesXML: '',
    neuesGesetz: gesetzesreferenz({ kurztitel, normgeber }),
  };
}
/** Fehlerliste, die der Importbericht beim letzten Rendern erhalten hat. */
function berichtsfehler(kandidaten: ImportKonflikt[]): unknown[] | undefined {
  rendern(kandidaten);
  return gliedern.mock.calls.at(-1)?.[1];
}
/** Berichtseinträge: Name und Texte ihrer Meldungen. */
function berichtsmeldungen(): unknown[] {
  const eintraege = zustand.werte[1];
  if (!Array.isArray(eintraege)) return [];
  return eintraege.map((e: { name: string; meldungen?: { text: string }[] }) => [
    e.name,
    e.meldungen?.map((m) => m.text),
  ]);
}
/** Neuladen läuft nach dem Speichern im Hintergrund; wartet auf dessen serielle Kette (dritter Ref). */
async function neuladenAbgeschlossen() {
  await zustand.refs[2]?.current;
}
function offen<T>() {
  let erfuellen: (wert: T) => void = () => {};
  const promise = new Promise<T>((resolve) => (erfuellen = resolve));
  return { promise, erfuellen };
}
const konflikte: ImportKonflikt[] = ['A', 'B'].map((name) => ({
  art: 'favoriten',
  anzeigename: name,
  kurztitel: name,
  importInhalt: '<favoriten />',
}));
/** Weder ein Einzelkonflikt noch eine Sammelaktion ist gesperrt. */
function nichtsLaeuft(): boolean {
  const laufende = zustand.werte[3];
  return laufende instanceof Set && laufende.size === 0 && zustand.werte[4] === false;
}
// Dasselbe Ergebnis je Kandidatenliste: Erneutes Rendern übernimmt es nicht neu.
const ergebnisse = new WeakMap<ImportKonflikt[], DateiImportErgebnis>();
function rendern(kandidaten = konflikte, onNeuLaden = vi.fn()) {
  zustand.nummer = 0;
  zustand.refNummer = 0;
  const ergebnis = ergebnisse.get(kandidaten) ?? {
    konflikte: kandidaten,
    berichtEintraege: [],
    fehler: [],
  };
  ergebnisse.set(kandidaten, ergebnis);
  return DateiImportOverlay({
    zustand: { art: 'fertig', ergebnis },
    onSchliessen: vi.fn(),
    onNeuLaden,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  gliedern.mockReturnValue({ form: 'saetze', allgemein: [], kategorien: [], anzahl: 0 });
  zustand.werte = [];
  zustand.refs = [];
  aktionen.mockImplementation((k: ImportKonflikt) =>
    ['gesetz', 'nichtamtlicheTitel', 'einstellungen'].includes(k.art)
      ? ['ersetzen']
      : ['ersetzen', 'zusammenfuehren'],
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('DateiImportOverlay bei Wartefrist', () => {
  it.each(['Ersetzen', 'Zusammenführen', 'Alle ersetzen', 'Alle zusammenführen'])(
    '%s behält Konflikte ohne Erfolgsbericht',
    async (text) => {
      aufloesen.mockRejectedValue('wartefrist');
      await expect(findeButton(rendern(), text)!()).resolves.toBeUndefined();
      expect(zustand.werte[0]).toEqual(konflikte);
      expect(zustand.werte[1]).toEqual([
        expect.objectContaining({
          aktion: 'nichtUebernommen',
          meldungen: [expect.objectContaining({ text: 'wartefrist' })],
        }),
      ]);
      expect(nichtsLaeuft()).toBe(true);
    },
  );
  it.each(['Alle ersetzen', 'Alle zusammenführen'])(
    'behält bei %s nur den fehlgeschlagenen Kandidaten',
    async (button) => {
      aufloesen
        .mockResolvedValueOnce({ kategorie: 'favoriten', aktion: 'ersetzt', name: 'A' })
        .mockRejectedValueOnce('wartefrist');
      await expect(findeButton(rendern(), button)!()).resolves.toBeUndefined();
      expect(zustand.werte[0]).toEqual([konflikte[1]]);
      expect(zustand.werte[1]).toEqual([
        { kategorie: 'favoriten', aktion: 'ersetzt', name: 'A' },
        expect.objectContaining({ aktion: 'nichtUebernommen', name: 'B' }),
      ]);
    },
  );
});

describe('Modulaktionen und Erfolg', () => {
  it('verwendet die Modulentscheidung auch für Favoriten', () => {
    aktionen.mockReturnValue(['ersetzen']);
    const baum = rendern();
    expect(findeButton(baum, 'Zusammenführen')).toBeUndefined();
    expect(findeButton(baum, 'Alle zusammenführen')).toBeUndefined();
  });
  it('übernimmt den Bericht unverändert', async () => {
    const bericht = { kategorie: 'lesezeichen', aktion: 'neu', name: 'Modulname' };
    aufloesen.mockResolvedValueOnce(bericht);
    await findeButton(rendern(), 'Ersetzen')!();
    expect((zustand.werte[1] as unknown[])[0]).toBe(bericht);
    expect(aufloesen).toHaveBeenCalledWith(konflikte[0], 'ersetzen', true);
  });
  it('überspringt beim Sammelmerge nur unzulässige Kandidaten und stoppt bei Fehler', async () => {
    const gesetz: ImportKonflikt = {
      art: 'gesetz',
      kurztitel: 'C',
      neuesXML: '',
      neuesGesetz: gesetzesreferenz({ kurztitel: 'C' }),
    };
    const bericht = { kategorie: 'favoriten', aktion: 'zusammengefuehrt', name: 'A' };
    aufloesen.mockResolvedValueOnce(bericht).mockRejectedValueOnce('Fehler');
    const spaeter: ImportKonflikt = {
      art: 'favoriten',
      anzeigename: 'D',
      kurztitel: 'D',
      importInhalt: '',
    };
    await findeButton(rendern([gesetz, ...konflikte, spaeter]), 'Alle zusammenführen')!();
    expect(aufloesen.mock.calls.map((c) => c[0])).toEqual(konflikte);
    expect(zustand.werte[0]).toEqual([konflikte[1], gesetz, spaeter]);
    expect(zustand.werte[1]).toEqual([
      bericht,
      expect.objectContaining({ aktion: 'nichtUebernommen', name: 'B' }),
    ]);
    expect(nichtsLaeuft()).toBe(true);
  });
  it('übernimmt Gesetzeserfolg vor einem fehlgeschlagenen Reload', async () => {
    const gesetz: ImportKonflikt = {
      art: 'gesetz',
      kurztitel: 'C',
      neuesXML: '',
      neuesGesetz: gesetzesreferenz({ kurztitel: 'C' }),
    };
    const bericht = { kategorie: 'gesetz', aktion: 'ersetzt', name: 'C' };
    aufloesen.mockResolvedValueOnce(bericht);
    const reload = vi.fn(async () => {
      expect(zustand.werte[0]).toEqual([]);
      expect((zustand.werte[1] as unknown[])[0]).toBe(bericht);
      throw new Error('Reload');
    });
    await findeButton(rendern([gesetz], reload), 'Ersetzen')!();
    await neuladenAbgeschlossen();
    expect(reload).toHaveBeenCalledOnce();
    expect(zustand.werte[0]).toEqual([]);
    expect(zustand.werte[1]).toEqual([
      expect.objectContaining({
        ...bericht,
        meldungen: [expect.objectContaining({ text: expect.stringContaining('Reload') })],
      }),
    ]);
    expect(nichtsLaeuft()).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('Buttons je Konfliktart', () => {
  it.each([
    'gesetz',
    'favoriten',
    'lesezeichen',
    'gesetzeskurzbefehle',
    'markierung',
    'nichtamtlicheTitel',
    'einstellungen',
  ] as const)('zeigt zulässige Aktionen für %s', (art) => {
    const kandidat: ImportKonflikt =
      art === 'gesetz'
        ? { art, kurztitel: 'A', neuesXML: '', neuesGesetz: gesetzesreferenz({ kurztitel: 'A' }) }
        : { art, anzeigename: 'A', importInhalt: '' };
    const baum = rendern([kandidat]);
    expect(findeButton(baum, 'Ersetzen')).toBeDefined();
    expect(findeButton(baum, 'Alle ersetzen')).toBeDefined();
    const merge = ['favoriten', 'lesezeichen', 'gesetzeskurzbefehle', 'markierung'].includes(art);
    expect(Boolean(findeButton(baum, 'Zusammenführen'))).toBe(merge);
    expect(Boolean(findeButton(baum, 'Alle zusammenführen'))).toBe(merge);
  });
});

describe('Sammelmerge überspringt ausschließlich ersetzbare Arten', () => {
  it('löst alle vier Mergearten auf und behält Gesetz, Titel und Einstellungen', async () => {
    const kandidaten: ImportKonflikt[] = [
      {
        art: 'gesetz',
        kurztitel: 'gesetz',
        neuesXML: '',
        neuesGesetz: gesetzesreferenz({ kurztitel: 'A' }),
      },
      ...(
        [
          'favoriten',
          'lesezeichen',
          'gesetzeskurzbefehle',
          'markierung',
          'nichtamtlicheTitel',
          'einstellungen',
        ] as const
      ).map((art) => ({ art, anzeigename: art, importInhalt: '' })),
    ];
    aufloesen.mockImplementation(async (k: ImportKonflikt) => ({
      kategorie: k.art,
      aktion: 'zusammengefuehrt',
      name: k.art,
    }));
    await findeButton(rendern(kandidaten), 'Alle zusammenführen')!();
    expect(aufloesen.mock.calls.map((c) => c[0].art)).toEqual([
      'favoriten',
      'gesetzeskurzbefehle',
      'lesezeichen',
      'markierung',
    ]);
    expect((zustand.werte[0] as ImportKonflikt[]).map((k) => k.art)).toEqual([
      'einstellungen',
      'gesetz',
      'nichtamtlicheTitel',
    ]);
    expect(nichtsLaeuft()).toBe(true);
  });
});

// Die Kopfzeile muss denselben laufenden Vorgang wie der Overlayrahmen sperren.
describe('Schließen während der Konfliktauflösung', () => {
  it.each(['Erfolg', 'Fehler'])('entsperrt das Kreuz nach %s', async (abschluss) => {
    let abschliessen!: () => void;
    aufloesen.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          abschliessen = () =>
            abschluss === 'Erfolg'
              ? resolve({ kategorie: 'favoriten', aktion: 'ersetzt', name: 'A' })
              : reject(new Error('Importfehler'));
        }),
    );
    const kopf = () => kopfzeile(rendern());
    expect(kopf().props.schliessenDeaktiviert ?? false).toBe(false);
    const vorgang = findeButton(rendern(), 'Ersetzen')!();
    expect(kopf().props.schliessenDeaktiviert).toBe(true);
    abschliessen();
    await vorgang;
    expect(kopf().props.schliessenDeaktiviert).toBe(false);
  });
});

describe('Sperre je Konflikt und Neuladen der Gesetzesliste', () => {
  it('lädt bei „Alle ersetzen“ einmal am Ende neu und hängt nur zuordenbare Meldungen an Gesetze', async () => {
    const kandidaten = [gesetzKonflikt('A'), gesetzKonflikt('B')];
    aufloesen.mockImplementation(async (k: ImportKonflikt) => ({
      kategorie: 'gesetz',
      aktion: 'ersetzt',
      name: k.kurztitel,
    }));
    const reload = vi.fn(async (_referenzen: unknown, melde?: (m: object) => void) => {
      // Erst nach beiden Konflikten.
      expect(aufloesen).toHaveBeenCalledTimes(2);
      melde?.({ typ: 'warnung', text: 'A', grund: 'dateiLeer', betroffen: 'A_de-bund.xml' });
      melde?.({ typ: 'warnung', text: 'ohne Bezug' });
      melde?.({
        typ: 'warnung',
        text: 'C gesichert',
        grund: 'wegenBeschaedigungGesichert',
        betroffen: 'C_de-bund.xml',
      });
    });
    await knopf(rendern(kandidaten, reload), 'Alle ersetzen').onClick();
    await neuladenAbgeschlossen();
    expect(reload).toHaveBeenCalledOnce();
    expect(zustand.werte[1]).toEqual([
      expect.objectContaining({ name: 'A', meldungen: [expect.objectContaining({ text: 'A' })] }),
      { kategorie: 'gesetz', aktion: 'ersetzt', name: 'B' },
    ]);
    // Nicht zuordenbar: ohne Grund als eigener Satz, mit Grund in seiner Gruppe.
    expect(berichtsfehler(kandidaten)).toEqual([
      { grund: 'meldung', detail: 'ohne Bezug' },
      { grund: 'meldung', datei: 'C_de-bund.xml', meldungsgrund: 'wegenBeschaedigungGesichert' },
    ]);
    expect(nichtsLaeuft()).toBe(true);
  });

  it('hängt bei einer Einzelaktion fremde Meldungen nicht an das übernommene Gesetz und meldet sie einmal', async () => {
    aufloesen.mockImplementation(async (k: ImportKonflikt) => ({
      kategorie: 'gesetz',
      aktion: 'ersetzt',
      name: k.kurztitel,
    }));
    const fremd = {
      typ: 'warnung',
      text: 'fremd',
      grund: 'wegenBeschaedigungGesichert',
      betroffen: 'AO_x_de-bund.xml',
    };
    const reload = vi.fn(async (_referenzen: unknown, melde?: (m: object) => void) => {
      melde?.(fremd);
      melde?.({ typ: 'warnung', text: 'AO', grund: 'dateiLeer', betroffen: 'AO_de-bund.xml' });
    });
    const kandidaten = [gesetzKonflikt('AO'), gesetzKonflikt('B')];
    // Zwei Einzelaktionen nacheinander: erst „AO“, dann „B“ (rückt an die erste Stelle).
    await knopf(rendern(kandidaten, reload), 'Ersetzen').onClick();
    await knopf(rendern(kandidaten, reload), 'Ersetzen').onClick();
    await neuladenAbgeschlossen();
    // Nur die eigene Datei (vollständige Dateibasis) gehört zum Gesetz „AO“.
    expect(berichtsmeldungen()).toEqual([
      ['AO', ['AO']],
      ['B', undefined],
    ]);
    expect(berichtsfehler(kandidaten)).toEqual([
      { grund: 'meldung', datei: 'AO_x_de-bund.xml', meldungsgrund: 'wegenBeschaedigungGesichert' },
    ]);
  });

  it('zeigt nach dem Schließen eintreffende Meldungen nach dem Neuladen gesammelt: Dateibefunde im Dateibefund-Banner', async () => {
    alleBannerSchliessen();
    aufloesen.mockImplementation(async (k: ImportKonflikt) => ({
      kategorie: 'gesetz',
      aktion: 'ersetzt',
      name: k.kurztitel,
    }));
    const neuladen = offen<void>();
    const reload = vi.fn(async (_referenzen: unknown, melde?: (m: object) => void) => {
      await neuladen.promise;
      for (const datei of ['X_de-bund.xml', 'Y_de-bund.xml'])
        melde?.({ typ: 'warnung', text: datei, grund: 'nichtLesbar', betroffen: datei });
      melde?.({ typ: 'warnung', text: 'Die Gesetzesliste ist unvollständig.' });
      melde?.({ typ: 'warnung', text: 'Ein weiterer Hinweis.' });
    });
    const kandidaten = [gesetzKonflikt('AO')];
    await knopf(rendern(kandidaten, reload), 'Ersetzen').onClick();
    kopfzeile(rendern(kandidaten, reload)).props.onSchliessen();
    expect(getSnapshot()).toEqual([]);
    neuladen.erfuellen();
    await neuladenAbgeschlossen();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      getSnapshot()
        .map((b) => b.art)
        .sort(),
    ).toEqual(['dateibefunde', 'vorgangsergebnis']);
    const vorgang = getSnapshot().find((b) => b.art === 'vorgangsergebnis');
    expect(vorgang?.text).toContain('Die Gesetzesliste ist unvollständig.');
    expect(vorgang?.text).toContain('Ein weiterer Hinweis.');
    expect(vorgang?.text).not.toContain('X_de-bund.xml');
  });

  it('ordnet einen Kurztitel mehrerer übernommener Gesetze keinem davon zu', async () => {
    aufloesen.mockImplementation(async (k: ImportKonflikt) => ({
      kategorie: 'gesetz',
      aktion: 'ersetzt',
      name: k.kurztitel,
    }));
    const reload = vi.fn(async (_referenzen: unknown, melde?: (m: object) => void) => {
      melde?.({ typ: 'warnung', text: 'mehrdeutig', betroffen: 'BGB' });
      melde?.({ typ: 'warnung', text: 'eindeutig', betroffen: 'BGB_de-bw.xml' });
    });
    const kandidaten = [gesetzKonflikt('BGB'), gesetzKonflikt('BGB', 'de-bw')];
    await knopf(rendern(kandidaten, reload), 'Alle ersetzen').onClick();
    await neuladenAbgeschlossen();
    expect(berichtsmeldungen()).toEqual([
      ['BGB', undefined],
      ['BGB', ['eindeutig']],
    ]);
    expect(berichtsfehler(kandidaten)).toEqual([
      { grund: 'meldung', datei: 'BGB', detail: 'mehrdeutig' },
    ]);
  });

  it('sperrt während einer Einzelaktion nur deren Konflikt und die Sammelaktionen', async () => {
    const laufend = offen<object>();
    aufloesen.mockReturnValueOnce(laufend.promise).mockResolvedValueOnce({
      kategorie: 'favoriten',
      aktion: 'ersetzt',
      name: 'B',
    });
    const vorgang = knopf(rendern(), 'Ersetzen').onClick();
    const a = knopf(rendern(), 'Ersetzen', 0);
    const b = knopf(rendern(), 'Ersetzen', 1);
    expect([a.disabled, b.disabled]).toEqual([true, false]);
    expect(knopf(rendern(), 'Alle ersetzen').disabled).toBe(true);
    // Doppelklick auf den laufenden Konflikt löst ihn kein zweites Mal aus.
    await a.onClick();
    await b.onClick();
    expect(aufloesen.mock.calls.map((c) => c[0])).toEqual(konflikte);
    laufend.erfuellen({ kategorie: 'favoriten', aktion: 'ersetzt', name: 'A' });
    await vorgang;
    expect(nichtsLaeuft()).toBe(true);
  });

  it('lädt bei parallelen Einzelaktionen nacheinander neu', async () => {
    const kandidaten = [gesetzKonflikt('A'), gesetzKonflikt('B')];
    aufloesen.mockImplementation(async (k: ImportKonflikt) => ({
      kategorie: 'gesetz',
      aktion: 'ersetzt',
      name: k.kurztitel,
    }));
    const erstes = offen<void>();
    let gleichzeitig = 0;
    let hoechstens = 0;
    const reload = vi.fn(async () => {
      hoechstens = Math.max(hoechstens, ++gleichzeitig);
      if (reload.mock.calls.length === 1) await erstes.promise;
      gleichzeitig--;
    });
    const baum = rendern(kandidaten, reload);
    const vorgaenge = [knopf(baum, 'Ersetzen', 0).onClick(), knopf(baum, 'Ersetzen', 1).onClick()];
    // Beide Speichervorgänge enden, obwohl das erste Neuladen noch läuft.
    await Promise.all(vorgaenge);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(nichtsLaeuft()).toBe(true);
    erstes.erfuellen();
    await neuladenAbgeschlossen();
    expect(reload).toHaveBeenCalledTimes(2);
    expect(hoechstens).toBe(1);
  });
});
