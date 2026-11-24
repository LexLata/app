import { geladenesTabGesetz } from '@/test/tabs/tabFabriken';
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
// Charakterisiert Tab-Invarianten, Schließen, Wiederherstellen und Effektpositionen.
import {
  istGleichesGesetz,
  gesetzesreferenzSchluessel,
  referenzVon,
} from '@/lib/domain/gesetzesreferenz';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import fc from 'fast-check';
import { afterEach, beforeEach, expect, it, vi, assert } from 'vitest';
import { useAppTabs } from './useAppTabs';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { GeschlossenerTab } from '@/lib/persistenz/fenster/fenster.index';

const beobachtung = vi.hoisted(() => ({
  protokoll: [] as string[],
  stapel: [] as GeschlossenerTab[],
}));
vi.mock('@/lib/persistenz/nutzerdaten/aktivierungSpeicher', () => ({
  ladeAktivierungXmlId: () => null,
}));
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  geschlossenenTabPoppen: () => beobachtung.stapel.pop(),
  geschlossenenTabPushen: (tab: GeschlossenerTab) => beobachtung.stapel.push(tab),
  geschlosseneTabsMenuStatusSynchronisieren: () =>
    beobachtung.protokoll.push('Menüsynchronisierung'),
}));
const gesetz: GesetzDarstellung = {
  kurztitel: 'BGB',
  normgeber: 'de-bund',
  langtitel: 'Bürgerliches Gesetzbuch',
  hatGliederungsartikel: false,
  elemente: [],
};
const anderes: GesetzDarstellung = { ...gesetz, kurztitel: 'ZPO' };
let root: Root | undefined;
let tabs: ReturnType<typeof useAppTabs>;
beforeEach(async () => {
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', dom.window);
  richteNativeEreignisgrenzeEin(async (name) =>
    name === 'gesetz_dateistempel_lesen'
      ? [{ name: 'BGB_de-bund.xml', dateistempel: { groesse: '1', aenderungszeit: '1' } }]
      : undefined,
  );
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  beobachtung.protokoll = [];
  beobachtung.stapel = [];
  root = createRoot(document.querySelector('main')!);
  function App() {
    tabs = useAppTabs();
    return null;
  }
  await act(async () => root!.render(createElement(App)));
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  vi.unstubAllGlobals();
});

it('synchronisiert das Menü beim Mount ohne zusätzliche Meldung beim Leertabwechsel', async () => {
  expect(beobachtung.protokoll).toEqual(['Menüsynchronisierung']);
  await act(async () => tabs.erstelleLeerenTab());
  expect(beobachtung.protokoll).toEqual(['Menüsynchronisierung']);
  await act(async () => root!.unmount());
  root = undefined;
});

it.each(['einmalig'])(
  'schließt den letzten Tab und legt ihn samt Verlauf auf den Wiederöffnungsstapel (%s)',
  async () => {
    const eintrag = { gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' }, xmlId: 'n1' };
    await act(async () => {
      tabs.gesetzOeffnen(gesetz, undefined, 'aktiver-tab');
      tabs.verlaufHinzufuegen(tabs.aktiverTabIdRef.current!, eintrag);
    });
    const alt = tabs.aktiverTabId!;
    await act(async () => tabs.tabSchliessen(alt));
    expect(tabs.verlaufLesen(alt)).toBeUndefined();
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.holeTabGesetz(tabs.tabs[0])).toBeUndefined();
    expect(beobachtung.stapel).toHaveLength(1);
    expect(beobachtung.stapel[0]?.verlauf.eintraege).toEqual([eintrag]);
  },
);

it('entfernt alle betroffenen Tabs atomar, wiederholt folgenlos und bereinigt ihren Ansichtszustand', async () => {
  await act(async () => {
    tabs.gesetzOeffnen(gesetz, undefined, 'aktiver-tab');
    tabs.gesetzOeffnen(gesetz, undefined, 'immer-neu');
    tabs.gesetzOeffnen(anderes, undefined, 'immer-neu');
  });
  const betroffen = tabs.tabs.filter(
    (t) => tabs.holeTabGesetz(t) && istGleichesGesetz(geladenesTabGesetz(tabs, t), gesetz),
  );
  for (const tab of betroffen)
    tabs.scrollPositionenRef.current[`${tab.id}-${gesetzesreferenzSchluessel(gesetz)}`] = {
      index: 1,
      offset: 2,
    };
  await act(async () => {
    tabs.gesetzeTabsSchliessen([gesetz]);
    expect(tabs.tabsRef.current).toHaveLength(1);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(anderes);
    tabs.gesetzeTabsSchliessen([gesetz]);
  });
  expect(beobachtung.stapel).toHaveLength(2);
  expect(tabs.scrollPositionenRef.current).toEqual({});
  await act(async () => tabs.gesetzeTabsSchliessen([anderes]));
  expect(tabs.tabs).toHaveLength(1);
  expect(tabs.holeTabGesetz(tabs.tabs[0])).toBeUndefined();
  expect(tabs.aktiverTabId).toBe(tabs.tabs[0]?.id);
});

it('aktualisiert und patcht ausschließlich benannte Gesetze', async () => {
  await act(async () => {
    tabs.gesetzOeffnen(gesetz, undefined, 'aktiver-tab');
    tabs.gesetzOeffnen(anderes, undefined, 'immer-neu');
  });
  const unberuehrt = tabs.tabs[1];
  const frisch = { ...gesetz, langtitel: 'Geänderter Langtitel' };
  await act(async () => tabs.gesetzeAktualisierenInTabs([frisch, anderes], [referenzVon(gesetz)]));
  expect(tabs.holeTabGesetz(tabs.tabs[0])).toBe(frisch);
  expect(tabs.tabs[0]?.reloadVersion).toBe(1);
  expect(tabs.tabs[1]).toBe(unberuehrt);
  const elemente = tabs.holeTabGesetz(tabs.tabs[0])?.elemente;
  await act(async () =>
    tabs.gesetzInfoInTabsPatchen(
      [{ ...frisch, verarbeitungszeit: new Date('2026-10-20') }],
      [referenzVon(gesetz)],
    ),
  );
  expect(tabs.holeTabGesetz(tabs.tabs[0])?.verarbeitungszeit).toEqual(new Date('2026-10-20'));
  expect(tabs.holeTabGesetz(tabs.tabs[0])?.elemente).toBe(elemente);
  expect(tabs.tabs[0]?.reloadVersion).toBe(1);
  expect(tabs.tabs[1]).toBe(unberuehrt);
});

it('bewahrt bei zufälligen Folgen die Tab-Invarianten und sofortigen Ref-Spiegel', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 60 }),
      async (aktionen) => {
        for (const aktion of aktionen) {
          await act(async () => {
            if (aktion === 0) tabs.gesetzOeffnen(gesetz, undefined, 'immer-neu');
            if (aktion === 1) tabs.tabSchliessen(tabs.aktiverTabIdRef.current!);
            if (aktion === 2) tabs.erstelleLeerenTab();
            if (aktion === 3) tabs.gesetzOeffnen(gesetz, undefined, 'aktiver-tab');
            expect(tabs.tabsRef.current.length).toBeGreaterThan(0);
            expect(tabs.tabsRef.current.some((t) => t.id === tabs.aktiverTabIdRef.current)).toBe(
              true,
            );
          });
          expect(tabs.tabsRef.current).toEqual(tabs.tabs);
          expect(tabs.aktiverTabIdRef.current).toBe(tabs.aktiverTabId);
        }
        await act(async () => tabs.setTabs([{ id: 'neuer-testlauf' }]));
        await act(async () => tabs.setAktiverTabId('neuer-testlauf'));
        beobachtung.stapel = [];
      },
    ),
    { numRuns: 100, seed: 1212 },
  );
});

it.each(['de-bund', 'unbekannt'])(
  'öffnet andere Schreibweisen im vorhandenen Tab und erhält Zustände und Verlauf (Normgeber=%s)',
  async (normgeber) => {
    const alt = { ...gesetz, normgeber };
    const andersGeschrieben = { ...alt, kurztitel: 'Bgb' };
    let erster: string;
    await act(async () => {
      erster = tabs.gesetzOeffnen(alt, undefined, 'aktiver-tab');
    });
    const key = erster! + '-' + gesetzesreferenzSchluessel(alt);
    const scroll = { index: 4, offset: 7 };
    const klappen = {
      ueberschriften: new Set<string>(),
      normen: new Set(['n1']),
      aktivesElementId: 'n1',
    };
    tabs.scrollPositionenRef.current[key] = scroll;
    tabs.einklappZustandRef.current[key] = klappen;
    const eintrag = { gesetzesreferenz: referenzVon(andersGeschrieben), xmlId: 'p1' };
    await act(async () => {
      expect(tabs.gesetzOeffnen(andersGeschrieben, undefined, 'bevorzugt-vorhanden')).toBe(erster!);
      tabs.verlaufHinzufuegen(erster!, eintrag);
    });
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.scrollPositionenRef.current[key]).toBe(scroll);
    expect(tabs.einklappZustandRef.current[key]).toBe(klappen);
    expect(tabs.verlaufLesen(erster!)?.eintraege).toEqual([eintrag]);
    const frisch = { ...andersGeschrieben, verarbeitungszeit: new Date('2026-10-20') };
    await act(async () => tabs.gesetzeAktualisierenInTabs([frisch], [referenzVon(frisch)]));
    expect(tabs.holeTabGesetz(tabs.tabs[0])).toBe(frisch);
    expect(tabs.tabs[0]?.reloadVersion).toBe(1);
    expect(tabs.scrollPositionenRef.current[key]).toBeUndefined();
    expect(tabs.einklappZustandRef.current[key]).toBeUndefined();
  },
);

it('trennt Ansichten mit gleichem Kurztitel bei verschiedenen Normgebern', async () => {
  const bund = gesetz;
  const land = { ...gesetz, normgeber: 'de-bw' };
  let bundTab: string;
  let landTab: string;
  await act(async () => {
    bundTab = tabs.gesetzOeffnen(bund, undefined, 'aktiver-tab');
  });
  await act(async () => {
    landTab = tabs.gesetzOeffnen(land, undefined, 'bevorzugt-vorhanden');
  });
  expect(bundTab!).not.toBe(landTab!);
  const bundKey = bundTab! + '-' + gesetzesreferenzSchluessel(bund);
  const landKey = landTab! + '-' + gesetzesreferenzSchluessel(land);
  const landScroll = { index: 9, offset: 1 };
  const landKlappen = {
    ueberschriften: new Set<string>(),
    normen: new Set(['land']),
    aktivesElementId: 'land',
  };
  tabs.scrollPositionenRef.current[bundKey] = { index: 1, offset: 2 };
  tabs.scrollPositionenRef.current[landKey] = landScroll;
  tabs.einklappZustandRef.current[bundKey] = { ...landKlappen, normen: new Set(['de-bund']) };
  tabs.einklappZustandRef.current[landKey] = landKlappen;
  const bundNeu = { ...bund, langtitel: 'Geänderter Langtitel' };
  await act(async () => tabs.gesetzeAktualisierenInTabs([bundNeu, land], [referenzVon(bund)]));
  expect(tabs.scrollPositionenRef.current[bundKey]).toBeUndefined();
  expect(tabs.einklappZustandRef.current[bundKey]).toBeUndefined();
  expect(tabs.scrollPositionenRef.current[landKey]).toBe(landScroll);
  expect(tabs.einklappZustandRef.current[landKey]).toBe(landKlappen);
  expect(tabs.holeTabGesetz(tabs.tabs.find((tab) => tab.id === landTab!))).toBe(land);
});

it('überträgt hin und zurück nur Liste und Zeiger, ohne aktive Stelle und Rückkehrmarke', async () => {
  const quelle = tabs;
  let ziel: ReturnType<typeof useAppTabs> | undefined;
  const zielRoot = createRoot(document.createElement('div'));
  function Zielfenster() {
    ziel = useAppTabs();
    return null;
  }
  await act(async () => zielRoot.render(createElement(Zielfenster)));
  assert(ziel);
  const empfaenger = ziel;
  const eintrag = (xmlId: string) => ({ gesetzesreferenz: gesetz, xmlId });
  const transport = { eintraege: [eintrag('p2'), eintrag('p1')], position: 1 };
  try {
    await act(async () => quelle.gesetzOeffnen(gesetz));
    const quellId = quelle.aktiverTabIdRef.current;
    assert(quellId);
    await act(async () =>
      quelle.verlaufSetzen(quellId, {
        ...transport,
        aktivesElement: eintrag('p3'),
        rueckkehrmarke: { eintrag: eintrag('p4'), position: 1 },
      }),
    );
    const hin = quelle.tabFuerUebertragungKopieren(quellId);
    assert(hin);
    expect(hin.verlauf).toEqual(transport);
    await act(async () => {
      empfaenger.uebernehmeTabGesetz({ id: 'vorbereitung' }, gesetz);
      expect(await empfaenger.tabAusUebertragungUebernehmen(hin, undefined)).toBe(true);
      await empfaenger.ladeGesetz(gesetz);
      quelle.tabUebertragungAbschliessen(quellId);
    });
    expect(quelle.verlaufLesen(quellId)).toBeUndefined();
    const zielId = empfaenger.aktiverTabIdRef.current;
    assert(zielId);
    expect(empfaenger.verlaufLesen(zielId)).toEqual(transport);
    await act(async () =>
      empfaenger.verlaufSetzen(zielId, {
        ...transport,
        aktivesElement: eintrag('p5'),
        rueckkehrmarke: { eintrag: eintrag('p6'), position: 1 },
      }),
    );
    const zurueck = empfaenger.tabFuerUebertragungKopieren(zielId);
    assert(zurueck);
    expect(zurueck.verlauf).toEqual(transport);
    await act(async () => {
      quelle.uebernehmeTabGesetz({ id: 'vorbereitung' }, gesetz);
      expect(await quelle.tabAusUebertragungUebernehmen(zurueck, undefined)).toBe(true);
      await quelle.ladeGesetz(gesetz);
      empfaenger.tabUebertragungAbschliessen(zielId);
    });
    const neueId = quelle.aktiverTabIdRef.current;
    assert(neueId);
    expect(quelle.verlaufLesen(neueId)).toEqual(transport);
    expect(empfaenger.verlaufLesen(zielId)).toBeUndefined();
  } finally {
    await act(async () => zielRoot.unmount());
  }
});

it('stoppt bei einem echten Wechsel zum Leertab sofort und beginnt bei Rückkehr eine volle Frist', async () => {
  vi.useFakeTimers();
  const id = tabs.aktiverTabId;
  assert(id);
  const eintrag = (xmlId: string) => ({ gesetzesreferenz: gesetz, xmlId });
  await act(async () => {
    tabs.verlaufHinzufuegen(id, eintrag('A'));
    tabs.verlaufAktivierung(id, eintrag('D'), 'schritt');
    vi.advanceTimersByTime(40_000);
    tabs.erstelleLeerenTab();
    // Noch vor dem nächsten Render muss die Frist gestoppt sein.
    vi.advanceTimersByTime(80_000);
  });
  expect(tabs.verlaufLesen(id)?.eintraege.map((e) => e.xmlId)).toEqual(['A']);
  await act(async () => tabs.setAktiverTabId(id));
  await act(async () => vi.advanceTimersByTime(30_000));
  await act(async () => tabs.verlaufAktivierung(id, eintrag('D'), 'vorgegeben'));
  await act(async () => vi.advanceTimersByTime(29_999));
  expect(tabs.verlaufLesen(id)?.eintraege.map((e) => e.xmlId)).toEqual(['A']);
  await act(async () => vi.advanceTimersByTime(1));
  expect(tabs.verlaufLesen(id)?.eintraege.map((e) => e.xmlId)).toEqual(['D', 'A']);
  vi.useRealTimers();
});

it('kürzt einen direkt empfangenen Verlauf mit 105 Einträgen auf die neuesten 100', async () => {
  const eintraege = Array.from({ length: 105 }, (_, i) => ({
    gesetzesreferenz: gesetz,
    xmlId: `p${i}`,
  }));
  await act(async () => tabs.gesetzOeffnen(gesetz));
  const quellId = tabs.aktiverTabIdRef.current;
  assert(quellId);
  const uebertragung = tabs.tabFuerUebertragungKopieren(quellId);
  assert(uebertragung);
  const rueckkehrEintrag = eintraege[1];
  assert(rueckkehrEintrag);
  uebertragung.verlauf = {
    eintraege,
    position: 104,
    aktivesElement: eintraege[0],
    rueckkehrmarke: { eintrag: rueckkehrEintrag, position: 104 },
  };
  await act(async () => {
    expect(await tabs.tabAusUebertragungUebernehmen(uebertragung, undefined)).toBe(true);
    await tabs.ladeGesetz(gesetz);
  });
  const zielId = tabs.aktiverTabIdRef.current;
  assert(zielId);
  expect(tabs.verlaufLesen(zielId)).toEqual({ eintraege: eintraege.slice(0, 100), position: 99 });
});
