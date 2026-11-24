// @vitest-environment jsdom
// Ladezustände und Referenztitel mit echter Hauptansicht und echtem Tabzustand.
import { act, useLayoutEffect } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/hauptfenster/scrollNachfuehrungMessung'))
    .scrollVirtualizerMessung,
}));
const dom = domTestWurzel();
let tabs: ReturnType<typeof useAppTabs>;
const nichts = () => {};
const oeffnenOverlayUmschalten = vi.fn();
function Probe() {
  const steuerung = useAppTabs();
  useLayoutEffect(() => {
    tabs = steuerung;
  });
  const lesezeichen = useLesezeichenUndFavoriten(steuerung);
  return (
    <HauptansichtFixture
      tabsteuerung={steuerung}
      lesezeichen={lesezeichen}
      setFavoritenStatus={nichts}
      onOeffnenOverlayUmschalten={oeffnenOverlayUmschalten}
      navigation={{ handleVerweisKlick: nichts, handleLesezeichenOeffnen: nichts }}
      verlaufSchrittUndOeffnen={nichts}
      verlaufAktivierung={steuerung.verlaufAktivierung}
      verlaufBedienung={steuerung.verlaufBedienung}
    />
  );
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  Element.prototype.scrollIntoView = nichts;
  await act(async () => dom.root.render(<Probe />));
});
it.each([
  ['ladend', 'Gesetz wird geladen'],
  ['fehlt', 'Gesetz nicht mehr vorhanden'],
  ['nicht-lesbar', 'Gesetz konnte nicht geladen werden'],
] as const)(
  'zeigt für %s Referenztitel und passenden Hinweis ohne alten Untertitel',
  (ladezustand, hinweis) => {
    act(() => {
      tabs.setTabs([
        { id: 'laden', gesetzesreferenz: { normgeber: 'de-bund', kurztitel: 'BGB' }, ladezustand },
      ]);
      tabs.setAktiverTabId('laden');
      tabs.setTabTitel({ laden: 'Alter Untertitel' });
    });
    expect(dom.host.textContent).toContain('BGB');
    expect(dom.host.textContent).toContain(hinweis);
    if (ladezustand === 'ladend') {
      const status = dom.host.querySelector('[role="status"]');
      expect(status?.textContent).toBe('LexLataGesetz wird geladen');
      expect(status?.querySelector('[aria-hidden]')?.getAttribute('style')).toContain('mask-image');
      expect(status?.querySelector('button')).toBeNull();
    } else {
      // Fehlerhinweis erscheint anstelle von „LexLata“; das Öffnen bleibt bedienbar.
      const status = dom.host.querySelector('[role="status"]');
      expect(status?.textContent).toContain(hinweis);
      expect(status?.textContent).not.toContain('LexLata');
      oeffnenOverlayUmschalten.mockClear();
      act(() => status?.querySelector('button')?.click());
      expect(oeffnenOverlayUmschalten).toHaveBeenCalledOnce();
    }
    expect(dom.host.textContent).not.toContain('Alter Untertitel');
  },
);
it('ersetzt die Ladeanzeige im selben Referenztab durch den geladenen Gesetzestext', async () => {
  act(() => {
    tabs.setTabs([
      {
        id: 'laden',
        gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' },
        ladezustand: 'ladend',
      },
    ]);
    tabs.setAktiverTabId('laden');
  });
  expect(dom.host.textContent).toContain('Gesetz wird geladen');
  const gesetz = parseGesetzesXML(
    '<gesetz version="1"><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Geladener Gesetzestext</absatz></text></norm></inhalt></gesetz>',
  );
  assert(gesetz);
  await act(async () => {
    tabs.gesetzOeffnen(gesetz, 'p1');
  });
  expect(tabs.aktiverTabId).toBe('laden');
  expect(tabs.tabs).toHaveLength(1);
  expect(dom.host.textContent).toContain('Geladener Gesetzestext');
  expect(dom.host.textContent).not.toContain('Gesetz wird geladen');
});
it('zeigt ein nach mehr als 50 Gesetzen wiederhergestelltes Gesetz aus demselben Bestand und schützt offene Tabs', async () => {
  const { io } = await import('@/test/einfuehrung/einfuehrungNativeAttrappe');
  const gesetze = Array.from({ length: 61 }, (_, i) => ({
    kurztitel: `G${i}`,
    normgeber: 'de-bund',
    langtitel: '',
    hatGliederungsartikel: false,
    elemente: [],
  }));
  io.dateien.set(
    'gesetze/G0_de-bund.xml',
    '<gesetz version="1"><infos><kurztitel>G0</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Wiederhergestellter Gesetzestext</titel><text><absatz>Wiederhergestellter Gesetzestext</absatz></text></norm></inhalt></gesetz>',
  );
  await act(async () => {
    for (const gesetz of gesetze) {
      io.dateien.set(
        `gesetze/${gesetz.kurztitel}_de-bund.xml`,
        io.dateien.get('gesetze/G0_de-bund.xml')!.replaceAll('G0', gesetz.kurztitel),
      );
      await tabs.ladeGesetz(gesetz);
    }
  });
  const wiederhergestellt = {
    id: 'sitzung',
    initialNorm: 'p1',
    gesetzesreferenz: { normgeber: 'de-bund', kurztitel: 'G0' },
    ladezustand: 'geladen' as const,
  };
  expect(tabs.holeTabGesetz(wiederhergestellt)).toBeUndefined();
  await act(async () => {
    tabs.setTabs([wiederhergestellt]);
    tabs.setAktiverTabId('sitzung');
  });
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(tabs.holeTabGesetz(wiederhergestellt)?.elemente).toHaveLength(1);
  expect(dom.host.textContent).toContain('Wiederhergestellter Gesetzestext');
  expect(dom.host.textContent).not.toContain('Gesetz wird geladen');
  await act(async () => {
    for (const gesetz of gesetze.slice(1)) {
      const id = tabs.gesetzOeffnen(gesetz, undefined, 'immer-neu');
      tabs.tabSchliessen(id);
    }
  });
  expect(tabs.holeTabGesetz(wiederhergestellt)?.elemente).toHaveLength(1);
  expect(dom.host.textContent).toContain('Wiederhergestellter Gesetzestext');
  expect(dom.host.textContent).not.toContain('Gesetz wird geladen');
});
