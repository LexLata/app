import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
// gesetzVerwaltung.integration.test.tsx
// Prüft echte React-Zustände, globale Mehrfensterereignisse und geordnete
// Reloads; Tauri und Dateispeicher bleiben kontrollierbare äußere Grenzen.
import { geladenesTabGesetz, tabFuerTest } from '@/test/tabs/tabFabriken';
import { tabVerlaeufeLesen } from '@/test/hauptfenster/tabVerlaeufeLesen';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fc from 'fast-check';
import { parseHTML } from 'linkedom';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '@tauri-apps/api/event';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { Tab } from '@/lib/domain/appTypes';
import { useAppTabs } from './useAppTabs';
import { useGesetzVerwaltung } from './useGesetzVerwaltung';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';

const native = vi.hoisted(() => ({
  listen: vi.fn(),
  gezielt: vi.fn(),
  callbacks: new Map<string, Set<(event: Event<unknown>) => void>>(),
  spaeteAnmeldungen: [] as (() => void)[],
  verzoegern: false,
  abmelden: vi.fn(),
  laden: vi.fn(),
  loeschen: vi.fn(),
  push: vi.fn(),
  gesetzeskurzbefehlLoeschen: vi.fn(),
  aktivierung: vi.fn(),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: native.gezielt }),
}));
vi.mock('@/lib/plattform/menu/menu.index', () => ({ setzeAktiv: vi.fn() }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeAlleGesetze: native.laden,
  leseGesetz: (ref: Gesetzesreferenz) => einzelzugriffFuerTest(ladeGesetzBestand)(ref),
  loescheGesetz: native.loeschen,
  hatNormenOhneTitel: () => false,
}));
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  geschlosseneTabsMenuStatusSynchronisieren: vi.fn(),
  geschlossenenTabPushen: native.push,
  geschlossenenTabPoppen: vi.fn(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/aktivierungSpeicher', () => ({
  ladeAktivierungXmlId: native.aktivierung,
  entferneAktivierung: vi.fn(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  ladeAlleGesetzeskurzbefehle: async () => ({}),
  loescheGesetzeskurzbefehl: native.gesetzeskurzbefehlLoeschen,
}));

function gesetz(normgeber = 'de-bund', zeit = 'alt'): GesetzDarstellung {
  return {
    kurztitel: 'PolG',
    normgeber,
    verarbeitungszeit: new Date(zeit === 'neu' ? '2026-10-06' : '2026-10-05'),
    elemente: [],
    langtitel: 'Polizeigesetz',
    hatGliederungsartikel: false,
  };
}
const bund = gesetz();
const bw = gesetz('de-bw');
const ref = { kurztitel: 'PolG', normgeber: 'de-bund' };
const wurzeln: Root[] = [];
const fenster = new Map<
  string,
  ReturnType<typeof useAppTabs> & ReturnType<typeof useGesetzVerwaltung>
>();
function Hauptfenster({ name }: { name: string }) {
  const tabs = useAppTabs();
  const verwaltung = useGesetzVerwaltung(tabs);
  fenster.set(name, { ...tabs, ...verwaltung });
  return null;
}
async function oeffne(name = 'eins', strict = false) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  wurzeln.push(root);
  const erwarteteAnmeldungen = native.listen.mock.calls.length + (strict ? 8 : 4);
  await act(async () => {
    root.render(
      strict ? (
        <StrictMode>
          <Hauptfenster name={name} />
        </StrictMode>
      ) : (
        <Hauptfenster name={name} />
      ),
    );
  });
  await act(async () => {
    await vi.waitFor(() => expect(native.listen).toHaveBeenCalledTimes(erwarteteAnmeldungen));
  });
  return root;
}
function zustand(name = 'eins') {
  return fenster.get(name)!;
}
async function tabsSetzen(tabs: Tab[], aktiv = tabs[0]!.id, name = 'eins') {
  await act(async () => {
    zustand(name).setTabs(tabs);
    zustand(name).setAktiverTabId(aktiv);
  });
}
function sende(name: string, payload: Gesetzesreferenz[]) {
  for (const callback of native.callbacks.get(name) ?? []) {
    callback({ event: name, id: 1, payload });
  }
}
function verzoegert<T>() {
  let aufloesen!: (wert: T) => void;
  let ablehnen!: (fehler: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    aufloesen = resolve;
    ablehnen = reject;
  });
  return { promise, aufloesen, ablehnen };
}
async function geladen(name = 'eins') {
  await act(async () => {
    await Promise.all([zustand(name).ladeGesetz(bund), zustand(name).ladeGesetz(bw)]);
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  native.aktivierung.mockReset().mockReturnValue(null);
  const { window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  native.callbacks.clear();
  native.spaeteAnmeldungen = [];
  native.verzoegern = false;
  native.laden.mockReset().mockResolvedValue([bund, bw]);
  native.loeschen.mockReset().mockResolvedValue({ benachrichtigung: 'gesendet' });
  native.gesetzeskurzbefehlLoeschen.mockResolvedValue(undefined);
  native.listen.mockImplementation(
    (name: string, callback: (event: Event<unknown>) => void) =>
      new Promise<() => void>((resolve) => {
        const anmelden = () => {
          const callbacks = native.callbacks.get(name) ?? new Set();
          callbacks.add(callback);
          native.callbacks.set(name, callbacks);
          resolve(() => {
            native.abmelden();
            callbacks.delete(callback);
          });
        };
        if (native.verzoegern) native.spaeteAnmeldungen.push(anmelden);
        else anmelden();
      }),
  );
  // Tatsächliches Tauri-listen läuft bis zur IPC-Grenze. Damit werden auch
  // die Any-Reichweite und verspätete native Anmeldung real ausgeführt.
  let naechsteId = 0;
  const handler = new Map<number, (event: Event<unknown>) => void>();
  const abmeldungen = new Map<number, () => void>();
  Object.assign(window, {
    __TAURI_INTERNALS__: {
      transformCallback: (callback: (event: Event<unknown>) => void) => {
        const id = ++naechsteId;
        handler.set(id, callback);
        return id;
      },
      invoke: async (
        command: string,
        args: { event: string; target: unknown; handler: number; eventId: number },
      ) => {
        if (command === 'plugin:event|listen') {
          expect(args.target).toEqual({ kind: 'Any' });
          const unlisten = await native.listen(args.event, handler.get(args.handler));
          abmeldungen.set(args.handler, unlisten);
          return args.handler;
        }
        expect(command).toBe('plugin:event|unlisten');
        abmeldungen.get(args.eventId)?.();
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
  alleBannerSchliessen();
});
afterEach(async () => {
  await act(async () => {
    for (const root of wurzeln.splice(0)) root.unmount();
  });
  vi.useRealTimers();
  fenster.clear();
  vi.unstubAllGlobals();
  alleBannerSchliessen();
});

describe('Reloadreihung', () => {
  it('behält nach Lesefehler Bestand, Tabs und betroffene Referenzen bis zum erfolgreichen Wiederholen', async () => {
    await oeffne();
    await geladen();
    await tabsSetzen([tabFuerTest({ id: 'tab', gesetz: bund }, zustand())]);
    native.laden.mockRejectedValueOnce(new Error('nicht lesbar'));
    await act(async () => {
      sende('gesetze-geaendert', [ref]);
    });
    expect([zustand().holeGeladenes(bund), zustand().holeGeladenes(bw)].filter(Boolean)).toEqual([
      bund,
      bw,
    ]);
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBe(bund);
    const frisch = { ...gesetz('de-bund', 'neu'), langtitel: 'Neues Polizeigesetz' };
    native.laden.mockResolvedValue([frisch]);
    await act(async () => {
      sende('gesetze-geaendert', [ref]);
      await zustand().ladeGesetz(ref);
    });
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBe(frisch);
    native.laden.mockResolvedValueOnce([]);
    await geladen();
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBe(frisch);
  });
});

describe('Bestätigte Löschung', () => {
  it('schließt in zwei Fenstern alle passenden Tabs, bereinigt Hilfszustände und lässt anderen Normgeber offen', async () => {
    await oeffne();
    await oeffne('zwei');
    for (const name of ['eins', 'zwei']) {
      await geladen(name);
      await tabsSetzen(
        [
          tabFuerTest({ id: 'a', gesetz: bund }, zustand()),
          tabFuerTest({ id: 'b', gesetz: bund }, zustand()),
          tabFuerTest({ id: 'c', gesetz: bw }, zustand()),
        ],
        'a',
        name,
      );
      await act(async () => {
        zustand(name).setTabTitel({ a: 'Titel a', b: 'Titel b', c: 'Titel c' });
      });
      await act(async () => {
        zustand(name).verlaufHinzufuegen('a', {
          gesetzesreferenz: { kurztitel: bund.kurztitel, normgeber: bund.normgeber },
          xmlId: 'p1',
        });
      });
      zustand(name).scrollPositionenRef.current['a-' + gesetzesreferenzSchluessel(bund)] = {
        index: 3,
        offset: 8,
      };
      zustand(name).einklappZustandRef.current['b-' + gesetzesreferenzSchluessel(bund)] = {
        ueberschriften: new Set(),
        normen: new Set(),
        aktivesElementId: null,
      };
    }
    native.laden.mockResolvedValue([bw]);
    await act(async () => {
      sende('gesetze-geloescht', [ref]);
      sende('gesetze-geloescht', [ref]);
    });
    for (const name of ['eins', 'zwei']) {
      expect(zustand(name).tabs.map((tab) => tab.id)).toEqual(['c']);
      expect(zustand(name).aktiverTabId).toBe('c');
      expect(zustand(name).tabTitel).toEqual({ c: 'Titel c' });
      expect(tabVerlaeufeLesen(zustand(name))).toEqual({});
      expect(zustand(name).verlaufLesen('a')).toBeUndefined();
      expect(zustand(name).verlaufLesen('b')).toBeUndefined();
      expect(zustand(name).scrollPositionenRef.current).toEqual({});
      expect(zustand(name).einklappZustandRef.current).toEqual({});
    }
    expect(native.push).toHaveBeenCalledTimes(4);
    expect(native.gezielt).not.toHaveBeenCalled();
  });

  it('wahrt Tabreihenfolge, aktive Wahl und Idempotenz für beliebige Referenzkombinationen', async () => {
    await oeffne();
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('de-bund', 'de-bw', 'leer'), { minLength: 1, maxLength: 15 }),
        fc.nat(),
        async (normgeber, aktivIndex) => {
          const tabs = normgeber.map((geber, index): Tab =>
            tabFuerTest(
              {
                id: `tab-${index}`,
                gesetz: geber === 'leer' ? undefined : gesetz(geber),
              },
              zustand(),
            ),
          );
          const aktiv = tabs[aktivIndex % tabs.length]!.id;
          await tabsSetzen(tabs, aktiv);
          native.push.mockClear();
          await act(async () => {
            zustand().gesetzeTabsSchliessen([ref]);
          });
          const verblieben = tabs.filter((tab) => tab.gesetzesreferenz?.normgeber !== 'de-bund');
          if (verblieben.length > 0) expect(zustand().tabs).toEqual(verblieben);
          else {
            expect(zustand().tabs).toHaveLength(1);
            expect(zustand().holeTabGesetz(zustand().tabs[0])).toBeUndefined();
          }
          if (verblieben.some((tab) => tab.id === aktiv))
            expect(zustand().aktiverTabId).toBe(aktiv);
          expect(zustand().tabs.some((tab) => tab.id === zustand().aktiverTabId)).toBe(true);
          const nachher = zustand().tabs;
          await act(async () => {
            zustand().gesetzeTabsSchliessen([ref]);
          });
          expect(zustand().tabs).toBe(nachher);
          expect(native.push).toHaveBeenCalledTimes(tabs.length - verblieben.length);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('behält einen leeren aktiven Tab beim letzten Tab und ist auch vor einem Render idempotent', async () => {
    await oeffne();
    await tabsSetzen(
      [
        tabFuerTest({ id: 'a', gesetz: bund }, zustand()),
        tabFuerTest({ id: 'b', gesetz: bund }, zustand()),
      ],
      'b',
    );
    await act(async () => {
      zustand().gesetzeTabsSchliessen([ref]);
      zustand().gesetzeTabsSchliessen([ref]);
    });
    expect(zustand().tabs).toHaveLength(1);
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBeUndefined();
    expect(zustand().aktiverTabId).toBe(zustand().tabs[0]!.id);
    expect(native.push).toHaveBeenCalledTimes(2);
  });

  it('verwirft vor Löschung gestarteten Reload und zeigt späteren Neuimport ohne Tabs zu öffnen', async () => {
    await oeffne();
    await geladen();
    await tabsSetzen([tabFuerTest({ id: 'a', gesetz: bund }, zustand())]);
    const alt = verzoegert<GesetzDarstellung[]>();
    native.laden.mockReturnValueOnce(alt.promise);
    await act(async () => {
      sende('gesetze-geaendert', [ref]);
    });
    await act(async () => {
      sende('gesetze-geloescht', [ref]);
      alt.aufloesen([bund, bw]);
    });
    expect([zustand().holeGeladenes(bund), zustand().holeGeladenes(bw)].filter(Boolean)).toEqual([
      bw,
    ]);
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBeUndefined();
    const neuerImport = gesetz('de-bund', 'neu');
    native.laden.mockResolvedValue([neuerImport, bw]);
    await act(async () => {
      sende('gesetze-geaendert', [ref]);
    });
    await geladen();
    expect([zustand().holeGeladenes(bund), zustand().holeGeladenes(bw)].filter(Boolean)).toEqual([
      neuerImport,
      bw,
    ]);
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBeUndefined();
  });

  it('bereinigt im auslösenden Fenster auch ohne Ereignis und meldet Versandfehler getrennt', async () => {
    await oeffne();
    await geladen();
    await tabsSetzen([
      tabFuerTest({ id: 'a', gesetz: bund }, zustand()),
      tabFuerTest({ id: 'b', gesetz: bund }, zustand()),
    ]);
    native.loeschen.mockResolvedValue({
      benachrichtigung: 'fehlgeschlagen',
      fehler: new Error('Transport'),
    });
    native.laden.mockResolvedValue([bw]);
    await act(async () => {
      await zustand().handleLoeschen(bund);
    });
    expect([zustand().holeGeladenes(bund), zustand().holeGeladenes(bw)].filter(Boolean)).toEqual([
      bw,
    ]);
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBeUndefined();
    expect(getSnapshot()).toEqual([
      expect.objectContaining({ text: expect.stringContaining('Das Gesetz wurde gelöscht.') }),
    ]);
  });

  it('schließt bei fehlgeschlagener Entfernung keinen Tab', async () => {
    await oeffne();
    await geladen();
    await tabsSetzen([tabFuerTest({ id: 'a', gesetz: bund }, zustand())]);
    native.loeschen.mockRejectedValue(new Error('Löschen fehlgeschlagen'));
    await act(async () => {
      await zustand().handleLoeschen(bund);
    });
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBe(bund);
    expect([zustand().holeGeladenes(bund), zustand().holeGeladenes(bw)].filter(Boolean)).toEqual([
      bund,
      bw,
    ]);
    expect(getSnapshot()).toEqual([
      expect.objectContaining({ text: 'Das Gesetz konnte nicht gelöscht werden.' }),
    ]);
  });
});

it('meldet verspätete Listener nach StrictMode und Unmount ab und verwirft laufende Ergebnisse', async () => {
  native.verzoegern = true;
  const root = await oeffne('eins', true);
  expect(native.spaeteAnmeldungen).toHaveLength(8);
  const spaet = verzoegert<GesetzDarstellung[]>();
  native.laden.mockReturnValueOnce(spaet.promise);
  let lauf!: Promise<void>;
  await act(async () => {
    lauf = zustand()
      .ladeGesetz(ref)
      .then(() => {});
  });
  await act(async () => {
    root.unmount();
  });
  const vor = zustand();
  await act(async () => {
    for (const anmelden of native.spaeteAnmeldungen) anmelden();
    spaet.aufloesen([bund]);
    await lauf;
  });
  expect(native.abmelden).toHaveBeenCalledTimes(8);
  await act(async () => {
    sende('gesetze-geaendert', [ref]);
    sende('gesetze-geloescht', [ref]);
  });
  expect(native.laden).not.toHaveBeenCalled();
  expect(zustand()).toBe(vor);
  expect(native.push).not.toHaveBeenCalled();
});

describe('Bereits angezeigter Gesetzesstand', () => {
  const xml = `<gesetz><infos><kurztitel>PolG</kurztitel><normgeber>de-bund</normgeber>
    <langtitel>Polizeigesetz</langtitel><verarbeitungszeit>2026-10-29T10:00:00Z</verarbeitungszeit>
    </infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text>
    <absatz zahl="1"><satz zahl="1">Ein Text mit <verweis norm="§ 2">Verweis</verweis>.
    <nummer zahl="1">Ein Eintrag.</nummer></satz></absatz></text></norm></inhalt></gesetz>`;

  it('erhält die sofort geöffnete Ansicht beim späteren Änderungsereignis trotz neuer Laufzeit-IDs', async () => {
    await oeffne();
    const importiert = parseGesetzesXML(xml);
    const geladen = parseGesetzesXML(xml);
    assert(importiert && geladen);
    const [element] = importiert.elemente;
    const [geladenesElement] = geladen.elemente;
    assert(element && geladenesElement);
    expect(element.data.id).not.toBe(geladenesElement.data.id);
    await act(async () => {
      zustand().gesetzOeffnen(importiert, 'p1', 'aktiver-tab');
    });
    const [tab] = zustand().tabs;
    assert(tab);
    const key = tab.id + '-' + gesetzesreferenzSchluessel(importiert);
    const scroll = { index: 0, offset: 18 };
    const klappen = {
      ueberschriften: new Set<string>(),
      normen: new Set([element.data.id]),
      aktivesElementId: element.data.id,
    };
    zustand().scrollPositionenRef.current[key] = scroll;
    zustand().einklappZustandRef.current[key] = klappen;
    native.laden.mockResolvedValue([geladen]);
    for (let i = 0; i < 2; i++) {
      await act(async () => sende('gesetze-geaendert', [ref]));
      expect([zustand().holeGeladenes(bund), zustand().holeGeladenes(bw)].filter(Boolean)).toEqual([
        importiert,
      ]);
      expect(zustand().tabs[0]).toBe(tab);
      expect(zustand().scrollPositionenRef.current[key]).toBe(scroll);
      expect(zustand().einklappZustandRef.current[key]).toBe(klappen);
    }
  });

  it.each([
    ['Normtext', 'Ein Text', 'Ein neuer Text'],
    ['Listeninhalt', 'Ein Eintrag.', 'Ein anderer Eintrag.'],
    ['Verweisziel', 'norm="§ 2"', 'norm="§ 3"'],
    ['XML-ID', 'id="p1"', 'id="p2"'],
    ['Kopfangaben', 'Polizeigesetz', 'Neuer Langtitel'],
    ['nichtamtlicher Titel', '</bezeichnung>', '</bezeichnung>'],
  ])('erneuert bei geändertem %s nur die veraltete Ansicht', async (art, vorher, nachher) => {
    await oeffne('eins');
    await oeffne('zwei');
    const alt = parseGesetzesXML(xml);
    const frisch = parseGesetzesXML(xml.replace(vorher, nachher));
    assert(alt && frisch);
    if (art === 'nichtamtlicher Titel') {
      const [norm] = frisch.elemente;
      assert(norm?.typ === 'norm');
      norm.data.titel = 'Ergänzter Titel';
      norm.data.titelIstNichtamtlich = true;
    }
    await tabsSetzen([tabFuerTest({ id: 'alt', gesetz: alt }, zustand())], 'alt', 'eins');
    await tabsSetzen(
      [tabFuerTest({ id: 'aktuell', gesetz: frisch }, zustand('zwei'))],
      'aktuell',
      'zwei',
    );
    const aktuellerTab = zustand('zwei').tabs[0];
    native.laden.mockResolvedValue([frisch]);
    await act(async () => sende('gesetze-geaendert', [ref]));
    expect(zustand('eins').holeTabGesetz(zustand('eins').tabs[0])).toBe(frisch);
    expect(zustand('eins').tabs[0]?.reloadVersion).toBe(1);
    expect(zustand('zwei').tabs[0]).toBe(aktuellerTab);
  });
  it('übernimmt bei geändertem Prüfzeitpunkt nur die Verarbeitungszeit, ohne die Ansicht neu aufzubauen', async () => {
    await oeffne();
    const alt = parseGesetzesXML(xml);
    const frisch = parseGesetzesXML(xml.replace('10:00:00Z', '11:00:00Z'));
    assert(alt && frisch);
    await tabsSetzen([tabFuerTest({ id: 'alt', gesetz: alt }, zustand())], 'alt');
    native.laden.mockResolvedValue([frisch]);
    await act(async () => sende('gesetze-geaendert', [ref]));
    const angezeigt = zustand().holeTabGesetz(zustand().tabs[0]);
    expect(angezeigt?.verarbeitungszeit).toEqual(frisch.verarbeitungszeit);
    expect(angezeigt?.elemente).toBe(alt.elemente);
    expect(zustand().tabs[0]?.reloadVersion).toBeUndefined();
  });
});

describe('Tablokale Position beim Darstellungstausch', () => {
  function darstellung(lauf: string): GesetzDarstellung {
    return {
      ...bund,
      langtitel: lauf === 'neu' ? 'Geändertes Polizeigesetz' : bund.langtitel,
      elemente: [
        {
          typ: 'ueberschrift',
          data: {
            id: lauf + '-kopf',
            xmlId: 'ueberschrift:010',
            gliederungskennzahl: '010',
            ebene: 1,
            bezeichnung: 'Erster Teil',
          },
        },
        ...['p1', 'p2', 'p3'].map((xmlId, index) => ({
          typ: 'norm' as const,
          data: normaleNorm({
            id: lauf + '-' + xmlId,
            xmlId,
            bezeichnung: '§ ' + (index + 1),
            absaetze: [],
          }),
        })),
      ],
    };
  }
  function aktiveStelle(tabId: string, id: string | null) {
    zustand().einklappZustandRef.current[tabId + '-' + gesetzesreferenzSchluessel(bund)] = {
      ueberschriften: new Set(['alt-kopf']),
      normen: new Set(['alt-p1']),
      aktivesElementId: id,
    };
    zustand().scrollPositionenRef.current[tabId + '-' + gesetzesreferenzSchluessel(bund)] = {
      index: 2,
      offset: 8,
    };
  }

  it.each(['Gesetzesimport', 'Titelimport', 'StrictMode'])(
    'erhält bei %s zwei unterschiedliche aktive Normen trotz neuer Laufzeit-IDs',
    async (art) => {
      await oeffne('eins', art === 'StrictMode');
      const alt = { ...darstellung('alt'), kurztitel: 'Polg' };
      const frisch = darstellung('neu');
      if (art === 'Titelimport') frisch.elemente[1]!.data.titel = 'Nichtamtlicher Titel';
      await tabsSetzen([
        tabFuerTest({ id: 'a', gesetz: alt }, zustand()),
        tabFuerTest(
          {
            id: 'b',
            gesetz: alt,
          },
          zustand(),
        ),
      ]);
      aktiveStelle('a', 'alt-p1');
      aktiveStelle('b', 'alt-p2');
      native.aktivierung.mockReturnValue('p3');
      native.laden.mockResolvedValue([frisch]);
      await act(async () => {
        sende('gesetze-geaendert', [ref]);
      });
      expect(zustand().tabs.map((tab) => tab.initialNorm)).toEqual(['p1', 'p2']);
      expect(zustand().tabs.map((tab) => zustand().holeTabGesetz(tab))).toEqual([frisch, frisch]);
      expect(zustand().tabs.map((tab) => tab.reloadVersion)).toEqual([1, 1]);
      expect(zustand().einklappZustandRef.current).toEqual({});
      expect(zustand().scrollPositionenRef.current).toEqual({});
      expect(native.aktivierung).not.toHaveBeenCalled();
    },
  );

  it('erhält eine Überschrift über ihre Gliederungskennzahl', async () => {
    await oeffne();
    await tabsSetzen([tabFuerTest({ id: 'a', gesetz: darstellung('alt') }, zustand())]);
    aktiveStelle('a', 'alt-kopf');
    native.aktivierung.mockReturnValue('p3');
    await act(async () => {
      zustand().gesetzeAktualisierenInTabs([darstellung('neu')], [ref]);
    });
    expect(zustand().tabs[0]!.initialNorm).toBe('ueberschrift:010');
    expect(native.aktivierung).not.toHaveBeenCalled();
  });

  it.each([null, 'nicht-in-alter-ansicht', 'alt-p2'])(
    'nutzt bei fehlender gültiger tablokaler Stelle (%s) den gespeicherten Rückfall',
    async (id) => {
      await oeffne();
      await tabsSetzen([tabFuerTest({ id: 'a', gesetz: darstellung('alt') }, zustand())]);
      aktiveStelle('a', id);
      const frisch = darstellung('neu');
      frisch.elemente = frisch.elemente.filter((el) => el.data.xmlId !== 'p2');
      native.aktivierung.mockReturnValue('p3');
      await act(async () => {
        zustand().gesetzeAktualisierenInTabs([frisch], [ref]);
      });
      expect(zustand().tabs[0]!.initialNorm).toBe('p3');
      expect(native.aktivierung).toHaveBeenCalledWith(frisch);
    },
  );

  it('rät ohne gespeicherten Rückfall keine Ersatznorm für die weggefallene aktive Norm', async () => {
    await oeffne();
    await tabsSetzen([tabFuerTest({ id: 'a', gesetz: darstellung('alt') }, zustand())]);
    aktiveStelle('a', 'alt-p2');
    const frisch = darstellung('neu');
    // Die gleiche Bezeichnung an anderer XML-ID darf nicht als Entsprechung gelten.
    frisch.elemente[2]!.data.xmlId = 'andere-norm';
    await act(async () => {
      zustand().gesetzeAktualisierenInTabs([frisch], [ref]);
    });
    expect(zustand().tabs[0]!.initialNorm).toBeUndefined();
    expect(zustand().tabs[0]!.reloadVersion).toBe(1);
  });

  it('verwendet bei ganz fehlendem tablokalem Zustand den bestehenden gespeicherten Rückfall', async () => {
    await oeffne();
    await tabsSetzen([tabFuerTest({ id: 'a', gesetz: darstellung('alt') }, zustand())]);
    native.aktivierung.mockReturnValue('p3');
    await act(async () => {
      zustand().gesetzeAktualisierenInTabs([darstellung('neu')], [ref]);
    });
    expect(zustand().tabs[0]!.initialNorm).toBe('p3');
  });

  it('erhält einen noch nicht ausgeführten expliziten Sprungauftrag vor lokalen und gemeinsamen Rückfallwerten', async () => {
    await oeffne();
    await tabsSetzen([
      tabFuerTest({ id: 'a', gesetz: darstellung('alt'), initialNorm: 'p2' }, zustand()),
    ]);
    aktiveStelle('a', 'alt-p1');
    native.aktivierung.mockReturnValue('p3');
    await act(async () => {
      zustand().gesetzeAktualisierenInTabs([darstellung('neu')], [ref]);
    });
    expect(zustand().tabs[0]!.initialNorm).toBe('p2');
    expect(native.aktivierung).not.toHaveBeenCalled();
  });

  it('lässt beim leichten Prüfzeitpunktpatch Ansichtsrefs, aktive Stelle und Laufzeit-IDs unverändert', async () => {
    await oeffne();
    const alt = { ...darstellung('alt'), kurztitel: 'Polg' };
    const zweite = alt;
    await tabsSetzen([
      tabFuerTest({ id: 'a', gesetz: alt, reloadVersion: 2 }, zustand()),
      tabFuerTest({ id: 'b', gesetz: zweite, reloadVersion: 5 }, zustand()),
    ]);
    aktiveStelle('a', 'alt-p2');
    aktiveStelle('b', 'anderer-parse-p1');
    const klappen = { ...zustand().einklappZustandRef.current };
    const scroll = { ...zustand().scrollPositionenRef.current };
    const frisch = { ...darstellung('neu'), verarbeitungszeit: new Date('2026-10-06') };
    await act(async () => {
      zustand().gesetzInfoInTabsPatchen([frisch], [ref]);
    });
    for (const [index, bisher] of [alt, zweite].entries()) {
      const tab = zustand().tabs[index]!;
      expect(geladenesTabGesetz(zustand(), tab).verarbeitungszeit).toEqual(
        frisch.verarbeitungszeit,
      );
      expect(geladenesTabGesetz(zustand(), tab).elemente).toBe(bisher.elemente);
      expect(tab.reloadVersion).toBe(index === 0 ? 2 : 5);
      expect(tab.initialNorm).toBeUndefined();
      const key = tab.id + '-' + gesetzesreferenzSchluessel(bisher);
      expect(zustand().einklappZustandRef.current[key]).toBe(klappen[key]);
      expect(zustand().scrollPositionenRef.current[key]).toBe(scroll[key]);
    }
    expect(native.aktivierung).not.toHaveBeenCalled();
  });
});

describe('Verlauf nach ausstehender Timerfrist', () => {
  it.each(['lokal', 'global', 'manuell'] as const)(
    'hält den letzten Tab nach %s entfernt, auch nach 60 Sekunden',
    async (art) => {
      await oeffne();
      await geladen();
      await tabsSetzen([tabFuerTest({ id: 'entfernt', gesetz: bund }, zustand())]);
      vi.useFakeTimers();
      await act(async () => {
        zustand().verlaufHinzufuegen('entfernt', {
          gesetzesreferenz: { kurztitel: bund.kurztitel, normgeber: bund.normgeber },
          xmlId: 'alt',
        });
        zustand().verlaufAktivierung(
          'entfernt',
          { gesetzesreferenz: bund, xmlId: 'p1' },
          'schritt',
        );
        await vi.advanceTimersByTimeAsync(30_000);
      });
      native.laden.mockResolvedValue([bw]);
      await act(async () => {
        if (art === 'lokal') await zustand().handleLoeschen(bund);
        else if (art === 'manuell') zustand().tabSchliessen('entfernt');
        else {
          sende('gesetze-geloescht', [ref]);
          sende('gesetze-geloescht', [ref]);
        }
      });
      const verbleibende = zustand().tabs;
      expect(verbleibende).toHaveLength(1);
      expect(zustand().holeTabGesetz(verbleibende[0])).toBeUndefined();
      expect(tabVerlaeufeLesen(zustand())).toEqual({});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(zustand().tabs).toBe(verbleibende);
      expect(tabVerlaeufeLesen(zustand())).toEqual({});
      expect(native.push).toHaveBeenCalledOnce();
    },
  );

  it('verwirft den alten Timer trotz offenem anderen Normgeber und erfasst dessen gültige Norm', async () => {
    await oeffne();
    await geladen();
    await tabsSetzen([
      tabFuerTest({ id: 'de-bund', gesetz: bund }, zustand()),
      tabFuerTest({ id: 'de-bw', gesetz: bw }, zustand()),
    ]);
    vi.useFakeTimers();
    act(() =>
      zustand().verlaufAktivierung('de-bund', { gesetzesreferenz: bund, xmlId: 'p1' }, 'schritt'),
    );
    native.laden.mockResolvedValue([bw]);
    await act(async () => {
      sende('gesetze-geloescht', [ref]);
      sende('gesetze-geloescht', [ref]);
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(zustand().tabs.map((tab) => tab.id)).toEqual(['de-bw']);
    expect(tabVerlaeufeLesen(zustand())).toEqual({});
    act(() =>
      zustand().verlaufAktivierung('de-bw', { gesetzesreferenz: bw, xmlId: 'p2' }, 'schritt'),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(zustand().verlaufLesen('de-bw')?.eintraege).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(zustand().verlaufLesen('de-bw')!.eintraege).toEqual([
      { gesetzesreferenz: { kurztitel: bw.kurztitel, normgeber: bw.normgeber }, xmlId: 'p2' },
    ]);
  });
});

it.each([false, true])(
  'verwirft beim manuellen Schließen vor dem nächsten Render jeden späten Verlaufseintrag (letzter Tab: %s)',
  async (letzterTab) => {
    await oeffne('eins', true);
    await tabsSetzen([
      tabFuerTest({ id: 'entfernt', gesetz: bund }, zustand()),
      ...(letzterTab ? [] : [tabFuerTest({ id: 'bleibt', gesetz: bw }, zustand())]),
    ]);
    vi.useFakeTimers();
    zustand().verlaufAktivierung('entfernt', { gesetzesreferenz: bund, xmlId: 'p1' }, 'schritt');
    await act(async () => {
      zustand().tabSchliessen('entfernt');
      zustand().verlaufHinzufuegen('entfernt', {
        gesetzesreferenz: { kurztitel: bund.kurztitel, normgeber: bund.normgeber },
        xmlId: 'spaet',
      });
      expect(tabVerlaeufeLesen(zustand())).toEqual({});
      vi.advanceTimersByTime(60_000);
      expect(tabVerlaeufeLesen(zustand())).toEqual({});
      zustand().tabSchliessen('entfernt');
    });
    expect(native.push).toHaveBeenCalledOnce();
    expect(zustand().tabs).toHaveLength(1);
    expect(zustand().tabs[0]!.id).not.toBe('entfernt');
    expect(zustand().holeTabGesetz(zustand().tabs[0])).toBe(letzterTab ? undefined : bw);
    expect(zustand().aktiverTabId).toBe(zustand().tabs[0]!.id);
    expect(zustand().tabsRef.current).toEqual(zustand().tabs);
    expect(tabVerlaeufeLesen(zustand())).toEqual({});
  },
);

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: native.laden,
}));
