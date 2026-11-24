// @vitest-environment jsdom
// Öffentliche Links durch echte Hooks, Tabs, Dateilader und Importdispatch; nur native Grenzen sind ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, createElement } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useTiefenLinks } from './useTiefenLinks';
import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
const native = vi.hoisted(() => ({ getCurrent: vi.fn(), abruf: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: native.abruf }));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: native.getCurrent }));
const dom = domTestWurzel();
let tabs: ReturnType<typeof useAppTabs>;
let links: ReturnType<typeof useTiefenLinks>;
function xml(normgeber: string) {
  return `<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>${normgeber}</normgeber></infos><inhalt><norm id="p433"><bezeichnung>§ 433</bezeichnung><text>Text</text></norm></inhalt></gesetz>`;
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  alleBannerSchliessen();
  io.dateien.set(
    'importindizes/de-bund.xml',
    '<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt></inhalt></importindex>',
  );
});
async function starten(mobile: boolean, codes: string[]) {
  const gesetze = codes.map((code) => {
    io.dateien.set(`gesetze/BGB_${code}.xml`, xml(code));
    const gesetz = parseGesetzesXML(xml(code));
    assert(gesetz);
    return gesetz;
  });
  function Probe() {
    tabs = useAppTabs();
    const oeffnen = useGesetzOeffnen({
      ...gesetzOeffnenFixture(tabs, gesetze),

      ladeGesetz: einzelzugriffFuerTest(ladeGesetzBestand),
    });
    links = useTiefenLinks({
      gesetze,
      elementOeffnen: oeffnen.elementOeffnen,
      gesetzesreferenzOeffnen: mobile ? undefined : oeffnen.gesetzesreferenzOeffnen,
    });
    return null;
  }
  await act(async () => dom.root.render(createElement(Probe)));
  return gesetze;
}
async function linkOeffnen(
  url: string,
  art: 'kalt' | 'warm',
  gesetze: Awaited<ReturnType<typeof starten>>,
) {
  native.getCurrent.mockResolvedValue([url]);
  await act(async () => {
    if (art === 'kalt') {
      const ziel = await links.leseAppStartZiel();
      if (ziel) links.oeffneTiefenLinkZiel(ziel, gesetze);
    } else
      for (const empfangen of io.listener.get('tiefenlink-oeffnen') ?? [])
        empfangen({ payload: [url] });
  });
}
for (const mobile of [false, true])
  for (const art of ['kalt', 'warm'] as const) {
    it.each([
      'de-bund',
      'DE-Bund',
      'bund',
      'Bund' /* normgeber-link: Großschreibung ausschließlich in der Linkeingabe. */,
    ])(`${mobile ? 'Mobile' : 'Desktop'} ${art}: öffnet %s exakt bis § 433`, async (code) => {
      const gesetze = await starten(mobile, ['de-bund', 'bund']);
      await linkOeffnen(`lexlata://${code}/bgb/433`, art, gesetze);
      const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabIdRef.current);
      expect(tabs.holeTabGesetz(tab)?.normgeber).toBe(code.toLowerCase());
      expect(tabs.holeTabGesetz(tab)?.kurztitel).toBe('BGB');
      assert(tab);
      expect(tabs.verlaufLesen(tab.id)?.eintraege.at(-1)?.xmlId).toBe('p433');
    });
    it.each(['lexlata://Bund/bgb/433', 'lexlata://de-bund/fehlt/433', 'lexlata://de-bund/bgb/999'])(
      `${mobile ? 'Mobile' : 'Desktop'} ${art}: meldet unauflösbares Ziel %s`,
      async (url) => {
        const gesetze = await starten(mobile, ['de-bund']);
        await linkOeffnen(url, art, gesetze);
        if (url.endsWith('/999') && !mobile) {
          const aktiv = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabIdRef.current);
          expect(tabs.holeTabGesetz(aktiv)?.kurztitel).toBe('BGB');
          expect(tabs.verlaufLesen(aktiv!.id)?.eintraege.every((e) => e.xmlId !== '999')).toBe(
            true,
          );
        } else expect(tabs.tabsRef.current.every((t) => !tabs.holeTabGesetz(t))).toBe(true);
        await vi.waitFor(() =>
          expect(
            getSnapshot().some(
              (b) =>
                b.text.includes('Das Linkziel konnte nicht geöffnet werden.') &&
                b.text.includes('lexlata://de-bund/bgb/433'),
            ),
          ).toBe(true),
        );
      },
    );
    it.each(['de_bund', 'İ'])(
      `${mobile ? 'Mobile' : 'Desktop'} ${art}: meldet ungültigen Code %s`,
      async (code) => {
        const gesetze = await starten(mobile, ['de-bund']);
        await linkOeffnen(`lexlata://${code}/bgb/433`, art, gesetze);
        expect(
          getSnapshot().some(
            (b) =>
              b.text.includes('Das gültige Format') && b.text.includes('lexlata://de-bund/bgb/433'),
          ),
        ).toBe(true);
      },
    );
  }

for (const art of ['kalt', 'warm'] as const)
  it(`Desktop ${art}: bewahrt den konkreten Offlinefehler im echten Importweg`, async () => {
    const gesetze = await starten(false, []);
    io.dateien.set(
      'importindizes/de-bund.xml',
      '<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>bgb</abrufkennung></gesetz></inhalt></importindex>',
    );
    native.abruf.mockRejectedValue(new TypeError('Failed to fetch'));
    await linkOeffnen('lexlata://de-bund/bgb/433', art, gesetze);
    await vi.waitFor(() =>
      expect(getSnapshot().some((b) => b.text.includes('Keine Internetverbindung'))).toBe(true),
    );
    expect(
      getSnapshot().some((b) => b.text.includes('Das Linkziel konnte nicht geöffnet werden.')),
    ).toBe(false);
    expect(native.abruf).toHaveBeenCalled();
  });
