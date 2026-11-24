// @vitest-environment jsdom
// Echte Hauptansicht, Ansichtssteuerung und App-Tabzustand bei wiederholter Scrollbedienung.
import { act, Profiler, useLayoutEffect } from 'react';
import { assert, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { scrollNachfuehrungMessung } from '@/test/hauptfenster/scrollNachfuehrungMessung';
import { kleinesGesetz } from '@/test/gesetz/gesetzFabriken';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';

vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/hauptfenster/scrollNachfuehrungMessung'))
    .scrollVirtualizerMessung,
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
const dom = domTestWurzel();
const gesetz = kleinesGesetz();
let tabs: ReturnType<typeof useAppTabs>;
let frames: FrameRequestCallback[];
let commits: number;
let zustandsCommits: number;
const nichts = () => {};
function Probe() {
  const steuerung = useAppTabs();
  const lesezeichen = useLesezeichenUndFavoriten(steuerung);
  useLayoutEffect(() => {
    tabs = steuerung;
    zustandsCommits++;
  });
  return (
    <>
      <Profiler
        id="App-Tabzustand"
        onRender={() => {
          commits++;
        }}
      >
        <output hidden>
          {steuerung.aktiverTabId ? steuerung.tabTitel[steuerung.aktiverTabId] : undefined}
        </output>
      </Profiler>
      <HauptansichtFixture
        minimalistischerModus={false}
        tabsteuerung={steuerung}
        lesezeichen={lesezeichen}
        setFavoritenStatus={nichts}
        navigation={{ handleVerweisKlick: nichts, handleLesezeichenOeffnen: nichts }}
        verlaufSchrittUndOeffnen={nichts}
        verlaufAktivierung={steuerung.verlaufAktivierung}
        verlaufBedienung={steuerung.verlaufBedienung}
      />
    </>
  );
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  frames = [];
  commits = 0;
  zustandsCommits = 0;
  document.body.append(dom.host);
  Element.prototype.scrollIntoView = nichts;
  scrollNachfuehrungMessung((fn) => {
    frames.push(fn);
    return frames.length;
  });
});
afterEach(() => {
  dom.host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function framesAusfuehren() {
  const jetzt = frames;
  frames = [];
  await act(async () => jetzt.forEach((fn) => fn(performance.now())));
}
it('P6-A4: Scrollen innerhalb derselben Norm erhält den App-Tabtitel ohne zusätzlichen Commit', async () => {
  await act(async () => dom.root.render(<Probe />));
  await act(async () => tabs.gesetzOeffnen(gesetz));
  await act(async () => vi.dynamicImportSettled());
  for (let i = 0; i < 5; i++) await framesAusfuehren();
  const tabId = tabs.aktiverTabId;
  assert(tabId);
  expect(tabs.tabTitel[tabId]).toBe('§ 1');
  const block = dom.host.querySelector<HTMLElement>('[data-index]');
  const container = block?.closest<HTMLElement>('[style*="overflow: auto"]');
  assert(container);
  const vorher = tabs.tabTitel;
  const vorherCommits = commits;
  const vorherZustandsCommits = zustandsCommits;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  for (const top of [50, 80, 100]) {
    await act(async () => {
      container.scrollTop = top;
      container.dispatchEvent(new Event('scroll'));
    });
    await framesAusfuehren();
    await act(async () => vi.advanceTimersByTime(100));
    expect(tabs.tabTitel).toBe(vorher);
  }
  await act(async () => vi.advanceTimersByTime(250));
  expect(tabs.tabTitel).toBe(vorher);
  expect(zustandsCommits).toBe(vorherZustandsCommits);
  expect(commits).toBe(vorherCommits);
});

it('P6-A4: erneutes Öffnen derselben Textansicht über die Tableiste erhält die Titelzustandsidentität', async () => {
  await act(async () => dom.root.render(<Probe />));
  await act(async () => tabs.gesetzOeffnen(gesetz));
  await act(async () => vi.dynamicImportSettled());
  for (let i = 0; i < 5; i++) await framesAusfuehren();
  const tabId = tabs.aktiverTabId;
  assert(tabId);
  const vorher = tabs.tabTitel;
  expect(vorher[tabId]).toBe('§ 1');
  const plus = dom.host.querySelector<HTMLButtonElement>('button[title^="Neuer Tab"]');
  assert(plus);
  await act(async () => plus.click());
  expect(tabs.aktiverTabId).not.toBe(tabId);
  const tab = dom.host.querySelector<HTMLElement>(`[data-tab-id="${tabId}"]`);
  assert(tab);
  await act(async () => {
    tab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
  });
  await act(async () => vi.dynamicImportSettled());
  for (let i = 0; i < 5; i++) await framesAusfuehren();
  expect(tabs.aktiverTabId).toBe(tabId);
  expect(tabs.tabTitel).toBe(vorher);
});
