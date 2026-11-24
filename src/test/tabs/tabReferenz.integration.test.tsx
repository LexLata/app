// @vitest-environment jsdom
// Referenzbasierte Tabverträge mit echten Hooks und ausschließlich nativen Attrappen.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { useEffect, act } from 'react';
import { assert, beforeEach, expect, it } from 'vitest';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import {
  geschlossenenTabPushen,
  geschlossenenTabPoppen,
} from '@/lib/persistenz/fenster/fenster.index';
import { kleinesGesetz } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel, referenzVon } from '@/lib/domain/gesetzesreferenz';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
import { leererVerlauf } from '@/lib/domain/app/tabVerlauf';
const dom = domTestWurzel();
const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
// Wiederzuöffnendes Gesetz; liegt im Bestand, damit kein Import nötig ist.
const zpo = { ...kleinesGesetz(), kurztitel: 'ZPO', normgeber: 'de-bund' };
let tabs: ReturnType<typeof useAppTabs>;
let navigation: ReturnType<typeof useGesetzOeffnen>;
function Probe() {
  const aktuell = useAppTabs();
  const oeffnung = useGesetzOeffnen({
    ...gesetzOeffnenFixture(aktuell),
    ladeGesetz: einzelzugriffFuerTest(async () => ({
      liste: [zpo],
      befunde: [],
      ordnerLesbar: true,
    })),
  });
  useEffect(() => {
    tabs = aktuell;
    navigation = oeffnung;
  });
  return null;
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  await act(async () => dom.root.render(<Probe />));
});
it.each(['ladend', 'fehlt', 'nicht-lesbar'] as const)(
  'überschreibt einen %s Tab beim Wiederöffnen auch mit Leerersetzung nicht',
  async (ladezustand) => {
    const id = tabs.aktiverTabId;
    assert(id);
    act(() => tabs.setTabs([{ id, gesetzesreferenz: referenz, ladezustand }]));
    geschlossenenTabPushen({ gesetzesreferenz: referenzVon(zpo), verlauf: leererVerlauf() });
    await act(async () => navigation.tabWiederherstellen({ beimFensterstart: true }));
    expect(tabs.tabs).toHaveLength(2);
    expect(tabs.tabs.find((tab) => tab.id === id)).toEqual({
      id,
      gesetzesreferenz: referenz,
      ladezustand,
    });
    expect(tabs.holeTabGesetz(tabs.tabs.find((tab) => tab.id !== id))).toBe(zpo);
  },
);
it('ersetzt einen Tab ohne Referenz beim Wiederöffnen wie bisher', async () => {
  const id = tabs.aktiverTabId;
  geschlossenenTabPushen({ gesetzesreferenz: referenzVon(zpo), verlauf: leererVerlauf() });
  await act(async () => navigation.tabWiederherstellen({ beimFensterstart: true }));
  expect(tabs.tabs).toHaveLength(1);
  expect(tabs.tabs[0]).toMatchObject({
    id,
    gesetzesreferenz: referenzVon(zpo),
    ladezustand: 'geladen',
  });
});
it.each(['ladend', 'fehlt', 'nicht-lesbar'] as const)(
  'speichert die Referenz eines %s Tabs beim Schließen und schließt ihn bei Gesetzeslöschung',
  (ladezustand) => {
    act(() => tabs.setTabs([{ id: 'a', gesetzesreferenz: referenz, ladezustand }]));
    act(() => tabs.tabSchliessen('a'));
    expect(geschlossenenTabPoppen()?.gesetzesreferenz).toEqual(referenz);
    act(() => tabs.setTabs([{ id: 'b', gesetzesreferenz: referenz, ladezustand }]));
    act(() => tabs.gesetzeTabsSchliessen([referenz]));
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.tabs[0]?.gesetzesreferenz).toBeUndefined();
  },
);
it('trägt beim synchronen Öffnen Referenz und geladenen Zustand ein', () => {
  act(() => {
    tabs.gesetzOeffnen({
      ...referenz,
      langtitel: 'Bürgerliches Gesetzbuch',
      hatGliederungsartikel: false,
      elemente: [],
    });
  });
  expect(tabs.tabs.at(-1)).toMatchObject({ gesetzesreferenz: referenz, ladezustand: 'geladen' });
});

it.each(['immer-neu', 'bevorzugt-vorhanden'] as const)(
  'behält bei erneutem Öffnen gleicher Daten die angezeigten Laufzeit-IDs (%s)',
  (modus) => {
    const bisher = kleinesGesetz();
    const frisch = structuredClone(bisher);
    const norm = frisch.elemente[0];
    assert(norm);
    norm.data.id = 'neuer-parselauf';
    let ersterTab = '';
    act(() => {
      ersterTab = tabs.gesetzOeffnen(bisher);
    });
    const key = ersterTab + '-' + gesetzesreferenzSchluessel(bisher);
    tabs.einklappZustandRef.current[key] = {
      normen: new Set(['p1']),
      ueberschriften: new Set(),
      aktivesElementId: 'p1',
    };
    act(() => {
      tabs.gesetzOeffnen(frisch, 'p1', modus);
    });
    expect(tabs.holeTabGesetz(tabs.tabs.find((tab) => tab.id === ersterTab))).toBe(bisher);
    expect(tabs.holeTabGesetz(tabs.tabs.find((tab) => tab.id === tabs.aktiverTabId))).toBe(bisher);
    expect(tabs.einklappZustandRef.current[key].aktivesElementId).toBe('p1');
    expect(tabs.tabs.find((tab) => tab.id === tabs.aktiverTabId)?.initialNorm).toBe('p1');
  },
);
