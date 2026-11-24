// Fehler beim Laden vorhandener Markierungen beenden beide neuen Anfragen,
// ohne eine abgelehnte Promise an Menü oder Tastenkürzel weiterzugeben.
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import {
  tabFuerTest,
  holeTabGesetzFuerTest,
  beendeTabBestandFuerTest,
} from '@/test/tabs/tabBestandFuerTest';
import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { Tab } from '@/lib/domain/appTypes';
import {
  zeigeUeberlappungsBanner,
  type MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import { ermittleAuswahl } from '@/lib/domain/textpfad/textpfad.index';
import { alleBannerSchliessen, getSnapshot, zeigeBanner } from '@/lib/banner/banner.index';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import { useVerweismarkierungUndKommentarHilfsfenster } from './useVerweismarkierungUndKommentarHilfsfenster';

import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));

const ladeMarkierungen = vi.fn();
const invoke = vi.fn();
const pruefeMarkierungAnStelle = vi.fn();
const ladeAlleGesetze = vi.fn();

vi.mock('@/lib/domain/textpfad/textpfad.index', () => ({
  ermittleAuswahl: vi.fn(),
}));
vi.mock('@/lib/domain/norm/norm.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/domain/norm/norm.index')>()),
  ausgangsnormKennung: vi.fn(),
}));
vi.mock('@/lib/markierungen/markierungen.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/markierungen/markierungen.index')>()),
  ladeMarkierungen: (...args: unknown[]) => ladeMarkierungen(...args),
  pruefeMarkierungAnStelle: (...args: unknown[]) => pruefeMarkierungAnStelle(...args),
  zeigeUeberlappungsBanner: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeAlleGesetze: (...args: unknown[]) => ladeAlleGesetze(...args),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  ladeMarkierungen.mockReset().mockResolvedValue([]);
  ladeAlleGesetze.mockReset().mockResolvedValue([]);
  invoke.mockReset().mockResolvedValue(undefined);
  pruefeMarkierungAnStelle.mockReset().mockReturnValue({ blockiertNeueMarkierung: false });
  vi.mocked(ausgangsnormKennung).mockReset().mockReturnValue(normAusgangsstelle('§ 1'));
  vi.mocked(ermittleAuswahl)
    .mockReset()
    .mockReturnValue({
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 3 },
      xmlId: 'norm-1',
      bezugstext: 'Text',
    });
  vi.stubGlobal('window', { getSelection: () => null });
  richteNativeEreignisgrenzeEin(async (...args) => invoke(...args));
});
afterEach(async () => {
  await beendeTabBestandFuerTest();
  vi.unstubAllGlobals();
});

function kollisionsGesetz(): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel: 'BGB',
    langtitel: 'BGB',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'ueberschrift',
        data: {
          id: 'u',
          xmlId: 'ueberschrift:010',
          gliederungskennzahl: '010',
          bezeichnung: 'Buch 1',
          ebene: 1,
        },
      },
      {
        typ: 'norm',
        data: normaleNorm({ id: 'n', xmlId: 'norm-1010', bezeichnung: '§ 1010', absaetze: [] }),
      },
    ],
  });
}

function TestHilfsfenster(gesetz: GesetzDarstellung, markierungenDeaktiviert = false) {
  return useVerweismarkierungUndKommentarHilfsfenster({
    ladeGesetz: markierungsEinzelzugriffFuerTest,
    holeTabGesetz: holeTabGesetzFuerTest,
    tabsRef: { current: [tabFuerTest({ id: 'tab', gesetz }) as Tab] },
    aktiverTabIdRef: { current: 'tab' },
    einklappZustandRef: {
      current: {
        ['tab-' + gesetzesreferenzSchluessel(gesetz)]: {
          aktivesElementId: 'u',
          ueberschriften: new Set<string>(),
          normen: new Set<string>(),
        },
      },
    },
    markierungenDeaktiviertRef: { current: markierungenDeaktiviert },
  });
}

function abgelegterKontext(befehl: string) {
  const aufruf = invoke.mock.calls.find(([name]) => name === befehl);
  expect(aufruf).toBeDefined();
  return JSON.parse(aufruf![1].payload);
}

describe('Überschriftenkennung im Hilfsfensterkontext', () => {
  it.each([
    ['handleKommentarAnfrage', 'kommentar_kontext_ablegen', true],
    ['handleKommentarAnfrage', 'kommentar_kontext_ablegen', false],
    ['handleVerweismarkierungAnfrage', 'verweismarkierung_kontext_ablegen', true],
    ['handleVerweismarkierungAnfrage', 'verweismarkierung_kontext_ablegen', false],
  ] as const)(
    '%s legt Überschrift 010 über %s ab (Textauswahl: %s)',
    async (aktion, befehl, mitAuswahl) => {
      const domain = await vi.importActual<typeof import('@/lib/domain/norm/norm.index')>(
        '@/lib/domain/norm/norm.index',
      );
      vi.mocked(ausgangsnormKennung).mockImplementation(domain.ausgangsnormKennung);
      vi.mocked(ermittleAuswahl).mockReturnValue(
        mitAuswahl
          ? {
              textstelle: {
                pfad: bereichPfad('bezeichnung'),
                zeichenbereichStart: 0,
                zeichenbereichEnde: 4,
              },
              xmlId: 'ueberschrift:010',
              bezugstext: 'Buch',
            }
          : { fehler: 'leer' },
      );
      const gesetz = kollisionsGesetz();
      await TestHilfsfenster(gesetz)[aktion]();
      expect(abgelegterKontext(befehl)).toMatchObject({
        ausgangsstelle: ueberschriftAusgangsstelle('010'),

        ausgangsBezeichnung: 'Buch 1',
      });
      expect(abgelegterKontext(befehl)).not.toHaveProperty('ausgangsPraefix');
      if (mitAuswahl) {
        expect(abgelegterKontext(befehl).auswahl).toEqual({
          textstelle: {
            pfad: bereichPfad('bezeichnung'),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 4,
          },
          bezugstext: 'Buch',
        });
        expect(pruefeMarkierungAnStelle).toHaveBeenCalledExactlyOnceWith([], {
          ausgangsstelle: ueberschriftAusgangsstelle('010'),

          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: bereichPfad('bezeichnung'),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 4,
            },
            bezugstext: '',
          },
        });
      } else {
        expect(abgelegterKontext(befehl)).not.toHaveProperty('auswahl');
        expect(abgelegterKontext(befehl)).not.toHaveProperty('textstelle');
        expect(pruefeMarkierungAnStelle).not.toHaveBeenCalled();
      }
      expect(invoke).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['kommentar', 'verweismarkierung'] as const)(
    'erhält die Überschrift beim Bearbeiten von %s',
    async (typ) => {
      const gesetz = kollisionsGesetz();
      ladeAlleGesetze.mockResolvedValue([gesetz]);
      const eintrag: MarkierungsEintrag = markierungsEintrag({
        typ,
        ausgangsstelle: ueberschriftAusgangsstelle('010'),

        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: bereichPfad('bezeichnung'),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 4,
          },
          bezugstext: 'Buch',
        },

        ...(typ === 'kommentar'
          ? { kommentarText: 'Notiz' }
          : {
              verweisinhalt: {
                verweistext: '§ 1010',
                verweisziele: [
                  verweisziel({
                    typ: 'zielnormOhneElementstand',
                    bezeichnung: '1010',
                    verweistextZeichenbereich: [0, 6],
                  }),
                ],
              },
            }),
      });
      const handler = TestHilfsfenster(gesetz);
      await (typ === 'kommentar'
        ? handler.handleKommentarBearbeiten(gesetz, eintrag)
        : handler.handleVerweismarkierungBearbeiten(gesetz, eintrag));
      const kontext = abgelegterKontext(
        typ === 'kommentar' ? 'kommentar_kontext_ablegen' : 'verweismarkierung_kontext_ablegen',
      );
      expect(kontext).toMatchObject({
        ausgangsstelle: ueberschriftAusgangsstelle('010'),

        ausgangsBezeichnung: 'Buch 1',
        bearbeiten: {
          textbezug: {
            textstelle: {
              pfad: { typ: 'bereich' as const, bereich: 'bezeichnung' },
              zeichenbereichStart: 0,
              zeichenbereichEnde: 4,
            },
            bezugstext: 'Buch',
          },
        },
      });
      expect(kontext).not.toHaveProperty('ausgangsPraefix');
      expect(kontext.bearbeiten).not.toHaveProperty('pfad');
      expect(kontext.bearbeiten.vorher).not.toHaveProperty('textstelle');
      for (const feld of ['zeichenbereichStart', 'zeichenbereichEnde', 'bezugstext'])
        expect(kontext.bearbeiten.vorher).not.toHaveProperty(feld);
      if (typ === 'kommentar') expect(kontext.aktuellesElement).toEqual(gesetz.elemente[0]!.data);
      expect(invoke).toHaveBeenCalledTimes(2);
    },
  );
});

describe('neue Markierungsanfrage bei Lesefehler', () => {
  it.each(['handleKommentarAnfrage', 'handleVerweismarkierungAnfrage'] as const)(
    '%s bricht ohne Fenster und ohne abgelehnte Promise ab',
    async (aktion) => {
      const gesetz = gesetzDarstellung({
        kurztitel: 'BGB',
        elemente: [
          {
            typ: 'norm',
            data: normaleNorm({
              id: 'element-1',
              xmlId: 'norm-1',
              bezeichnung: '§ 1',
              absaetze: [],
            }),
          },
        ],
      });
      const tab = tabFuerTest({ id: 'tab-1', gesetz }) as Tab;
      const fehler = new Error('Markierungsdatei nicht lesbar');
      ladeMarkierungen.mockRejectedValue(fehler);
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const handler = useVerweismarkierungUndKommentarHilfsfenster({
          ladeGesetz: markierungsEinzelzugriffFuerTest,
          holeTabGesetz: holeTabGesetzFuerTest,
          tabsRef: { current: [tab] },
          aktiverTabIdRef: { current: tab.id },
          einklappZustandRef: { current: {} },
          markierungenDeaktiviertRef: { current: false },
        });

        await expect(handler[aktion]()).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledWith(
          'Markierungen konnten vor dem Öffnen nicht geprüft werden:',
          fehler,
        );
        expect(ladeMarkierungen).toHaveBeenCalledWith(gesetz);
        expect(invoke).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
        await beendeTabBestandFuerTest();
        vi.unstubAllGlobals();
      }
    },
  );
});

it('überträgt den vollständigen bisherigen Kommentar-Elementstand in den Bearbeitungskontext', async () => {
  const gesetz = kollisionsGesetz();
  ladeAlleGesetze.mockResolvedValue([gesetz]);
  const elementstand = { titel: 'Bisheriger Titel', textlaenge: 42 };
  const eintrag: MarkierungsEintrag = markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1010'),

    kommentarText: 'Zweiter Kommentar',
    bezug: { typ: 'pauschal' as const, elementstand: elementstand },
  });
  await TestHilfsfenster(gesetz).handleKommentarBearbeiten(gesetz, eintrag);
  expect(abgelegterKontext('kommentar_kontext_ablegen')).toMatchObject({
    bearbeiten: {
      kommentarText: 'Zweiter Kommentar',
      vorher: { kommentarText: 'Zweiter Kommentar', elementstand },
    },
  });
});

it.each([
  ['handleKommentarAnfrage', 'kommentar_kontext_ablegen', 'kommentar_fenster_oeffnen'],
  [
    'handleVerweismarkierungAnfrage',
    'verweismarkierung_kontext_ablegen',
    'verweismarkierung_fenster_oeffnen',
  ],
] as const)(
  '%s schützt nur nativen Titel, nicht Ausgangsbezeichnung oder Kontext',
  async (aktion, kontextBefehl, fensterBefehl) => {
    vi.mocked(ermittleAuswahl).mockReturnValue({ fehler: 'leer' });
    const gesetz = kollisionsGesetz();
    const ueberschrift = gesetz.elemente[0]!;
    if (ueberschrift.typ !== 'ueberschrift') throw new Error('Testüberschrift fehlt');
    ueberschrift.data.bezeichnung = 'Art. 1 Abs. 1';
    const domain = await vi.importActual<typeof import('@/lib/domain/norm/norm.index')>(
      '@/lib/domain/norm/norm.index',
    );
    vi.mocked(ausgangsnormKennung).mockImplementation(domain.ausgangsnormKennung);
    await TestHilfsfenster(gesetz)[aktion]();
    const kontext = abgelegterKontext(kontextBefehl);
    expect(kontext.ausgangsBezeichnung).toBe('Art. 1 Abs. 1');
    const fenster = invoke.mock.calls.find(([name]) => name === fensterBefehl)!;
    expect(fenster[1].titel).toContain('Art.\u00a01 Abs.\u00a01');
    expect(fenster[1].label).toBe(
      invoke.mock.calls.find(([name]) => name === kontextBefehl)![1].label,
    );
    expect(invoke.mock.calls.findIndex(([name]) => name === kontextBefehl)).toBeLessThan(
      invoke.mock.calls.findIndex(([name]) => name === fensterBefehl),
    );
  },
);

it.each([
  ['handleKommentarAnfrage', 'kommentar_kontext_ablegen', 'kommentar_fenster_oeffnen', 'Kommentar'],
  [
    'handleVerweismarkierungAnfrage',
    'verweismarkierung_kontext_ablegen',
    'verweismarkierung_fenster_oeffnen',
    'Verweis',
  ],
] as const)(
  'schützt den nativen Titel bei %s und überträgt unveränderten Bezugstext',
  async (aktion, kontextBefehl, fensterBefehl, titelPraefix) => {
    const gesetz = kollisionsGesetz();
    const domain = await vi.importActual<typeof import('@/lib/domain/norm/norm.index')>(
      '@/lib/domain/norm/norm.index',
    );
    vi.mocked(ausgangsnormKennung).mockImplementation(domain.ausgangsnormKennung);
    const original = 'Art.  1\tAbs. 1\n§ 9999';
    gesetz.elemente[0]!.data.bezeichnung = 'Art. 1 Abs. 1';
    vi.mocked(ermittleAuswahl).mockReturnValue({
      textstelle: {
        pfad: bereichPfad('bezeichnung'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: original.length,
      },
      xmlId: 'ueberschrift:010',
      bezugstext: original,
    });
    await TestHilfsfenster(gesetz)[aktion]();
    expect(invoke).toHaveBeenCalledWith(
      fensterBefehl,
      expect.objectContaining({
        titel: `${titelPraefix} zu Art.\u00a01 Abs.\u00a01 hinzufügen`,
      }),
    );
    expect(abgelegterKontext(kontextBefehl)).toMatchObject({
      ausgangsBezeichnung: 'Art. 1 Abs. 1',
      auswahl: { bezugstext: original },
    });
  },
);

it('Zielkonflikt: öffnet Verweisbearbeitung ohne Ausgangsstelle mit unveränderten Ausgangsdaten', async () => {
  const { bearbeiteVerweismarkierung } =
    await import('./useVerweismarkierungUndKommentarHilfsfenster.ausgangskontext');
  ladeAlleGesetze.mockResolvedValue([kollisionsGesetz()]);
  const elementstand = { titel: 'Gespeicherter Titel', textlaenge: 123 };
  const verweisinhalt = { verweistext: '§ 9', verweisziele: [] };
  await bearbeiteVerweismarkierung(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    markierungsEinzelzugriffFuerTest,
    markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 9'),

      verweisinhalt,
      bezug: { typ: 'pauschal' as const, elementstand: elementstand },
    }),
    () => {},
  );
  expect(invoke).toHaveBeenCalledWith('verweismarkierung_fenster_oeffnen', expect.anything());
  expect(abgelegterKontext('verweismarkierung_kontext_ablegen')).toMatchObject({
    ausgangsstelle: normAusgangsstelle('§ 9'),

    bearbeiten: { vorher: { verweisinhalt, elementstand } },
  });
});

// Öffnungsfehler nennen das betroffene Hilfsfenster eindeutig.
it.each([
  ['handleKommentarAnfrage', 'kommentar_fenster_oeffnen', 'Kommentarfenster'],
  ['handleVerweismarkierungAnfrage', 'verweismarkierung_fenster_oeffnen', 'Verweisfenster'],
] as const)('%s protokolliert einen nativen Öffnungsfehler', async (aktion, befehl, name) => {
  vi.mocked(ausgangsnormKennung).mockImplementation(
    (
      await vi.importActual<typeof import('@/lib/domain/norm/norm.index')>(
        '@/lib/domain/norm/norm.index',
      )
    ).ausgangsnormKennung,
  );
  const fehler = new Error('Native Fensteröffnung fehlgeschlagen');
  invoke.mockImplementation(async (aufruf: string) => {
    if (aufruf === befehl) throw fehler;
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(TestHilfsfenster(kollisionsGesetz())[aktion]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledExactlyOnceWith(`${name} konnte nicht geöffnet werden:`, fehler);
  } finally {
    log.mockRestore();
  }
});

it.each(['handleKommentarAnfrage', 'handleVerweismarkierungAnfrage'] as const)(
  'sperrt %s bei deaktivierten Markierungen ohne Bestandsänderung oder Fensteröffnung',
  async (aktion) => {
    await TestHilfsfenster(kollisionsGesetz(), true)[aktion]();
    expect(ladeMarkierungen).not.toHaveBeenCalled();
    expect(pruefeMarkierungAnStelle).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  },
);

it.each(['kommentar', 'verweismarkierung'] as const)(
  '%s: Bearbeitungsübertragung erhält die vollständige Textstelle und den Originalbezugstext',
  async (typ) => {
    const gesetz = kollisionsGesetz();
    const pfad = normtextPfad({
      absatz: '(1)',
      unterabsatz: '[2]',
      satz: 3,
      satzInEintrag: 4,
      eintraege: [
        { ebene: 'nummer' as const, bezeichnung: '1' },
        { ebene: 'litera' as const, bezeichnung: 'a', wiederholung: 2 },
      ],
    });
    const eintrag: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 1010'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad, zeichenbereichStart: 2, zeichenbereichEnde: 6 },
        bezugstext: ' A\u00a0B',
      },

      ...(typ === 'kommentar'
        ? { kommentarText: 'Notiz' }
        : { verweisinhalt: { verweistext: '§ 1010', verweisziele: [] } }),
    });
    const handler = TestHilfsfenster(gesetz);
    await (typ === 'kommentar'
      ? handler.handleKommentarBearbeiten(gesetz, eintrag)
      : handler.handleVerweismarkierungBearbeiten(gesetz, eintrag));
    const bearbeiten = abgelegterKontext(
      typ === 'kommentar' ? 'kommentar_kontext_ablegen' : 'verweismarkierung_kontext_ablegen',
    ).bearbeiten;
    expect(bearbeiten.textbezug).toEqual({
      textstelle: { pfad, zeichenbereichStart: 2, zeichenbereichEnde: 6 },
      bezugstext: ' A\u00a0B',
    });
    expect(bearbeiten).not.toHaveProperty('pfad');
    expect(bearbeiten.vorher).not.toHaveProperty('textstelle');
    expect(bearbeiten.vorher).not.toHaveProperty('bezugstext');
    expect(bearbeiten.vorher).not.toHaveProperty('zeichenbereichStart');
    expect(bearbeiten.vorher).not.toHaveProperty('zeichenbereichEnde');
  },
);

it.each(['handleKommentarAnfrage', 'handleVerweismarkierungAnfrage'] as const)(
  '%s zeigt bei Überlappung schon vor dem Öffnen das Banner',
  async (aktion) => {
    vi.mocked(ermittleAuswahl).mockReturnValue({
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 3 },
      xmlId: 'ueberschrift:010',
      bezugstext: 'Buch',
    });
    vi.mocked(ausgangsnormKennung).mockImplementation(
      (
        await vi.importActual<typeof import('@/lib/domain/norm/norm.index')>(
          '@/lib/domain/norm/norm.index',
        )
      ).ausgangsnormKennung,
    );
    pruefeMarkierungAnStelle.mockReturnValue({ blockiertNeueMarkierung: true });
    await TestHilfsfenster(kollisionsGesetz())[aktion]();
    expect(pruefeMarkierungAnStelle).toHaveBeenCalledOnce();
    expect(zeigeUeberlappungsBanner).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  },
);

it('leitet den ausdrücklichen Empfänger beim Bearbeiten bis in den echten Ladeabschluss weiter', async () => {
  const { bearbeiteVerweismarkierung } =
    await import('./useVerweismarkierungUndKommentarHilfsfenster.ausgangskontext');
  const empfangen = vi.fn();
  await bearbeiteVerweismarkierung(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    markierungsEinzelzugriffFuerTest,
    markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: '§ 1', verweisziele: [] },
    }),
    empfangen,
  );
  expect(ladeAlleGesetze).toHaveBeenCalledWith(expect.any(Function), empfangen);
});

it('zeigt Lesebefunde beim Öffnen der Verweisbearbeitung: Dateibefunde gesammelt, die übrigen als ein Vorgangsergebnis', async () => {
  alleBannerSchliessen();
  ladeAlleGesetze.mockImplementation(
    async (_auswahl: unknown, empfangen?: (meldung: AktionsMeldung) => void) => {
      const basis = {
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'lesen',
        aenderungsstand: 'keine',
      } as const;
      for (const datei of ['a.xml', 'b.xml'])
        empfangen?.({ ...basis, text: datei, grund: 'nichtLesbar', betroffen: datei });
      empfangen?.({ ...basis, text: 'Erster Hinweis.' });
      empfangen?.({ ...basis, text: 'Zweiter Hinweis.' });
      return [];
    },
  );
  await TestHilfsfenster(kollisionsGesetz()).handleVerweismarkierungBearbeiten(
    gesetzesreferenz({ kurztitel: 'BGB' }),
    markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: '§ 1', verweisziele: [] },
    }),
  );
  const banner = getSnapshot();
  expect(banner.map((b) => b.art).sort()).toEqual(['dateibefunde', 'vorgangsergebnis']);
  const namen = banner
    .find((b) => b.art === 'dateibefunde')
    ?.gliederung?.kategorien.flatMap((k) => k.gruppen.flatMap((g) => g.namen.map((n) => n.name)));
  expect(namen).toEqual(['a.xml', 'b.xml']);
  const vorgang = banner.find((b) => b.art === 'vorgangsergebnis');
  expect(vorgang?.text).toContain('Erster Hinweis.');
  expect(vorgang?.text).toContain('Zweiter Hinweis.');
});

it.each(['handleKommentarAnfrage', 'handleVerweismarkierungAnfrage'] as const)(
  '%s öffnet bei doppelter Ausgangsstelle kein Fenster und zeigt die Meldung',
  async (aktion) => {
    const data = normaleNorm({ id: 'n', xmlId: 'norm-1', bezeichnung: '§ 1', absaetze: [] });
    const gesetz = gesetzDarstellung({
      elemente: [
        { typ: 'norm', data },
        { typ: 'norm', data: { ...data, id: 'n2', xmlId: 'n2' } },
      ],
    });
    const handler = TestHilfsfenster(gesetz);
    await handler[aktion]();
    expect(invoke).not.toHaveBeenCalled();
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Diese Stelle lässt sich im Gesetz nicht eindeutig adressieren. Hier sind keine Markierungen möglich.',
      }),
    );
  },
);

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: (...args: unknown[]) => ladeAlleGesetze(...args),
}));
