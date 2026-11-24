import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
// useAppTabs.uebertragung.test.tsx
// Prüft die Tabübernahme zwischen Fenstern mit echten React-Tabs.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppTabs } from './useAppTabs';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { TabUebertragung } from '@/lib/domain/appTypes';

vi.mock('@/lib/persistenz/nutzerdaten/aktivierungSpeicher', () => ({
  ladeAktivierungXmlId: () => null,
}));
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  geschlossenenTabPoppen: vi.fn(() => null),
  geschlossenenTabPushen: vi.fn(),
  geschlosseneTabsMenuStatusSynchronisieren: vi.fn(),
}));
const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const gesetz: GesetzDarstellung = {
  ...referenz,

  langtitel: 'Bürgerliches Gesetzbuch',
  hatGliederungsartikel: false,
  elemente: [],
};
let root: Root;
let tabs: ReturnType<typeof useAppTabs>;
beforeEach(async () => {
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', dom.window);
  richteNativeEreignisgrenzeEin(async (name) =>
    name === 'gesetz_dateistempel_lesen'
      ? ['de-bund', 'unbekannt'].map((normgeber) => ({
          name: `BGB_${normgeber}.xml`,
          dateistempel: { groesse: '1', aenderungszeit: '1' },
        }))
      : undefined,
  );
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.querySelector('main')!);
  function App() {
    tabs = useAppTabs();
    return null;
  }
  await act(async () => root.render(createElement(App)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it.each([
  { kurztitel: 'bGb', normgeber: 'de-bund' },
  { kurztitel: 'bGb', normgeber: 'unbekannt' },
])('übernimmt ein Gesetz über Referenz %j gegen den eigenen Bestand', async (gesetzesreferenz) => {
  const zielgesetz = {
    ...gesetz,
    normgeber: gesetzesreferenz.normgeber === 'de-bund' ? 'de-bund' : 'unbekannt',
  };

  await act(async () => {
    tabs.uebernehmeTabGesetz({ id: 'vorbereitung' }, zielgesetz);
    expect(await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz })).toBe(true);
    await tabs.ladeGesetz(zielgesetz);
  });
  expect(tabs.holeTabGesetz(tabs.tabs[0])).toBe(zielgesetz);
});

it('überträgt einen Leertab ohne Gesetzesreferenz und lehnt unbekannte Gesetze ab', async () => {
  let transport!: TabUebertragung;
  await act(async () => {
    transport = tabs.tabFuerUebertragungKopieren(tabs.tabs[0]!.id)!;
  });
  expect(transport.gesetzesreferenz).toBeUndefined();
  await act(async () => {
    expect(await tabs.tabAusUebertragungUebernehmen(transport, undefined)).toBe(true);
  });
  const vorher = tabs.tabs;
  richteNativeEreignisgrenzeEin(async (name) =>
    name === 'gesetz_dateistempel_lesen' ? [] : undefined,
  );
  await act(async () => {
    expect(
      await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz: referenz }, undefined),
    ).toBe(false);
  });
  expect(tabs.tabs).toBe(vorher);
});
