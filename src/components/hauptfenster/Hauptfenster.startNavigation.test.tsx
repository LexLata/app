// @vitest-environment jsdom
// Verknüpft die unveränderten Start-Hooks: Starttabs vor Link, interne Navigation erst nach Start und Laden.
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { act, useEffect, useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useFensterstartInitialisierung } from '@/hooks/useFensterstartInitialisierung';
import { useInterneNavigation } from '@/hooks/fenster/useInterneNavigation';
import type { useFensterRestore } from '@/hooks/fenster/useFensterRestore';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { ElementOeffnenParams } from '@/lib/domain/appTypes';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';

const nativ = vi.hoisted(() => ({
  invoke: vi.fn(),
  lesen: vi.fn(),
  linkOeffnen: vi.fn(),
  protokoll: [] as string[],
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke }));
vi.mock('@/lib/plattform/tauriHelpers', async (original) => ({
  ...(await original<typeof import('@/lib/plattform/tauriHelpers')>()),
  letzterTabAnfrageLesen: async () => false,
}));
vi.mock(
  '@/lib/plattform/fensterkommunikation/fensterkommunikation.index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/lib/plattform/fensterkommunikation/fensterkommunikation.index')
    >()),
    hoereImEigenenFenster: () => ({ bereit: Promise.resolve(), abmelden: () => {} }),
  }),
);
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  geschlosseneTabsMenuStatusSynchronisieren: () => {},
  FensterUebernahmeFehler: class extends Error {},
}));
vi.mock('@/lib/import/import.index', () => ({
  synchronisiereStartupImportindizes: async () => {},
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  pruefeMarkierungenBeimStart: async () => {},
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  hatNormenOhneTitel: () => false,
  synchronisiereNichtamtlicheTitelFuerGesetze: async () => false,
}));
const dom = domTestWurzel();
const gesetz: GesetzDarstellung = gesetzMitNormen(['§ 1', '§ 2'], {
  kurztitel: 'BGB',
  normgeber: 'de-bund',
  langtitel: '',
  hatGliederungsartikel: false,
  kennung: (i) => `n${i + 1}`,
  norm: (i) => ({ xmlId: `p${i + 1}` }),
});
let tabs: ReturnType<typeof useAppTabs>;
let liefereGesetze: (wert: GesetzDarstellung[]) => void;
let beendeRestore: () => void;
let startAbgeschlossen = false;
function Start(_props: { geladen: boolean }) {
  const tabsteuerung = useAppTabs();
  useEffect(() => {
    tabs = tabsteuerung;
  });
  const [laden] = useState(
    () =>
      new Promise<GesetzDarstellung[]>((resolve) => {
        liefereGesetze = resolve;
      }),
  );
  const [restoreFreigabe] = useState(
    () =>
      new Promise<void>((resolve) => {
        beendeRestore = resolve;
      }),
  );
  const [restoreErledigt, setRestoreErledigt] = useState(false);
  const fensterRestore = {
    restoreErledigt,
    initialRestore: async (_gesetze, setTabs, setAktiverTabId) => {
      await laden;
      nativ.protokoll.push('restore:beginnt');
      await restoreFreigabe;
      setTabs([tabFuerTest({ id: 'gespeichert', gesetz, initialNorm: 'p1' })]);
      setAktiverTabId('gespeichert');
      setRestoreErledigt(true);
      nativ.protokoll.push('restore:tabs');
      return true;
    },
  } as ReturnType<typeof useFensterRestore>;
  const elementOeffnen = ({ xmlId }: ElementOeffnenParams) => {
    nativ.protokoll.push('intern:ziel');
    tabsteuerung.gesetzOeffnen(gesetz, xmlId, 'aktiver-tab');
  };
  const { startAbgeschlossen: abgeschlossen } = useFensterstartInitialisierung({
    ladeGesetz: tabsteuerung.ladeGesetz,
    tabAusUebertragungUebernehmen: tabsteuerung.tabAusUebertragungUebernehmen,
    // Der Start dieses Tests fordert keine Tabwiederöffnung an.
    tabWiederherstellen: () => {},
    setTabs: tabsteuerung.setTabs,
    setAktiverTabId: tabsteuerung.setAktiverTabId,
    fensterRestore,
    leseAppStartZiel: nativ.lesen,
    oeffneTiefenLinkZiel: (...args) => {
      nativ.protokoll.push('startlink');
      nativ.linkOeffnen(...args);
      tabsteuerung.gesetzOeffnen(gesetz, 'p1', 'aktiver-tab');
    },
  });
  useInterneNavigation({
    gesetzesreferenzOeffnen: ({ xmlId, bezeichnung }, _modus, _ausgang, melden) => {
      elementOeffnen({ gesetz, xmlId: xmlId ?? (bezeichnung === '2' ? 'p2' : undefined) });
      melden?.(true);
    },
    startAbgeschlossen: abgeschlossen,
    tabsRef: tabsteuerung.tabsRef,
    aktiverTabIdRef: tabsteuerung.aktiverTabIdRef,
    elementOeffnen,
  });
  useEffect(() => {
    startAbgeschlossen = abgeschlossen;
  });
  return null;
}
beforeEach(() => {
  nativ.protokoll.length = 0;
  nativ.lesen
    .mockReset()
    .mockResolvedValue({ kurztitel: 'BGB', normgeber: 'de-bund', bezeichnung: '1' });
  nativ.linkOeffnen.mockClear();
  let auftrag: unknown = {
    kennung: 1,
    neuesFenster: false,
    auftrag: {
      gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
      ziel: { type: 'norm', bezeichnung: '2' },
    },
  };
  nativ.invoke.mockReset().mockImplementation(async (befehl: string) => {
    if (befehl === 'interne_navigation_lesen') return auftrag;
    if (befehl === 'interne_navigation_bestaetigen') auftrag = null;
    return null;
  });
});
it('wartet auf Starttabs; verarbeitet Startlink und internes Ziel ohne Sammelladeabschluss', async () => {
  await act(async () => dom.root.render(<Start geladen={false} />));
  expect(nativ.protokoll).toEqual([]);
  expect(nativ.invoke.mock.calls.some(([befehl]) => befehl === 'interne_navigation_lesen')).toBe(
    false,
  );
  await act(async () => liefereGesetze([gesetz]));
  expect(nativ.protokoll).toEqual(['restore:beginnt']);
  expect(nativ.linkOeffnen).not.toHaveBeenCalled();
  await act(async () => beendeRestore());
  expect(startAbgeschlossen).toBe(true);
  expect(nativ.protokoll).toEqual(['restore:beginnt', 'restore:tabs', 'startlink', 'intern:ziel']);
  expect(nativ.linkOeffnen).toHaveBeenCalledOnce();
  expect(tabs.tabs.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe('p2');
  await act(async () => dom.root.render(<Start geladen />));
  await vi.waitFor(() => expect(nativ.protokoll.at(-1)).toBe('intern:ziel'));
  expect(tabs.tabs.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe('p2');
  await act(async () => dom.root.render(<Start geladen />));
  expect(nativ.linkOeffnen).toHaveBeenCalledOnce();
  expect(tabs.tabs.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe('p2');
});

vi.mock('@/lib/plattform/fensterUebergabe', async (original) => ({
  ...(await original<typeof import('@/lib/plattform/fensterUebergabe')>()),
  tabUebertragungAbholen: async () => null,
}));
