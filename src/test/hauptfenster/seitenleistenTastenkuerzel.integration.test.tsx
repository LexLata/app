// @vitest-environment jsdom
// Prüft die Einstellung mit echten Tastenereignissen, Hauptansicht und Nutzerdatenspeichern.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useLayoutEffect } from 'react';
import { beforeEach, afterEach, assert, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { HauptansichtFixture } from './HauptansichtFixture';
import { gesetzOeffnenFixture } from './gesetzOeffnenFixture';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { useTastenkuerzel } from '@/hooks/eingabe/useTastenkuerzel';
import { useAppAktionen } from '@/hooks/useAppAktionen';
import { useSeitenleistenTastenkuerzel } from '@/hooks/einstellungen/useSeitenleistenTastenkuerzel';
import { hinzufuegenFavoriten } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { hinzufuegenLesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
import { scrollNachfuehrungMessung } from './scrollNachfuehrungMessung';
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/hauptfenster/scrollNachfuehrungMessung'))
    .scrollVirtualizerMessung,
}));
const dom = domTestWurzel();
let frames: FrameRequestCallback[] = [];
async function nachfuehren() {
  for (let i = 0; frames.length > 0 && i < 30; i++) {
    const bereit = frames;
    frames = [];
    await act(async () => bereit.forEach((fn) => fn(performance.now())));
  }
}
afterEach(() => vi.restoreAllMocks());
const gesetz = gesetzMitNormen(Array.from({ length: 54 }, (_, i) => `§ ${i + 1}`));
const nichts = () => {};
let tabs: ReturnType<typeof useAppTabs>;
let navigation: ReturnType<typeof useGesetzOeffnen>;
function Probe() {
  const t = useAppTabs();
  const n = useGesetzOeffnen({
    ...gesetzOeffnenFixture(t, [gesetz]),
    ladeGesetz: einzelzugriffFuerTest(async () => ({
      liste: [gesetz],
      befunde: [],
      ordnerLesbar: true,
    })),
  });
  const lesezeichen = useLesezeichenUndFavoriten(t);
  const { seitenleistenTastenkuerzel } = useSeitenleistenTastenkuerzel();
  const aktionen = useAppAktionen({
    uebersichtExportAktionRef: { current: null },
    ...t,
    ...n,
    fensterSchliessen: nichts,
    aktivesOverlay: null,
    setAktivesOverlay: nichts,
  });
  useTastenkuerzel({
    ...t,
    ...n,
    ...aktionen,
    seitenleistenTastenkuerzel,
    gesetzeskurzbefehle: {},
    gesetze: [],
    lesezeichenEintraege: lesezeichen.lesezeichen,
    handleLesezeichenOeffnen: n.handleLesezeichenOeffnen,
    setAktivesOverlay: nichts,
    setOeffnenOverlayInitial: nichts,
    handleFavoritSpeichern: nichts,
    handleLesezeichenSpeichern: nichts,
    handleAlleLesezeichenEntfernen: nichts,
    handleUnterstreichen: nichts,
    handleHervorheben: nichts,
    handleVerweismarkierungAnfrage: nichts,
    handleKommentarAnfrage: nichts,
    handleMarkierungRueckgaengig: nichts,
    handleMarkierungWiederholen: nichts,
    handleZuklappen: nichts,
    handleAufklappen: nichts,
    einfuehrungAktiv: false,
    einfuehrungTeilaktion: 0,
  });
  useLayoutEffect(() => {
    tabs = t;
    navigation = n;
  });
  return (
    <HauptansichtFixture
      tabsteuerung={t}
      navigation={n}
      lesezeichen={lesezeichen}
      seitenleistenTastenkuerzel={seitenleistenTastenkuerzel}
      setFavoritenStatus={nichts}
      verlaufSchrittUndOeffnen={aktionen.verlaufSchrittUndOeffnen}
      verlaufAktivierung={t.verlaufAktivierung}
      verlaufBedienung={t.verlaufBedienung}
    />
  );
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  frames = [];
  scrollNachfuehrungMessung((fn) => frames.push(fn));
  HTMLElement.prototype.scrollIntoView = nichts;
  await hinzufuegenFavoriten(
    gesetz,
    Array.from({ length: 53 }, (_, i) => String(i + 1)),
  );
  await hinzufuegenLesezeichen(
    Array.from({ length: 11 }, (_, i) => ({ bezeichnung: String(i + 1), gesetz })),
  );
});
it('öffnet bei aus keinen Favoriten und kein Lesezeichen, schaltet alle fünf Gruppen sofort an und wieder aus', async () => {
  document.body.append(dom.host);
  await act(async () => dom.root.render(<Probe />));
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: '53' }));
  await nachfuehren();
  const tabId = tabs.aktiverTabId;
  assert(tabId);
  for (const aktiv of [false, true, false]) {
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'lexlata.seitenleistenTastenkuerzel',
          newValue: String(aktiv),
        }),
      ),
    );
    for (const [ereignis, ziel] of [
      [{ key: 'a', code: 'KeyA' }, '0'],
      [{ key: 'A', code: 'KeyA', shiftKey: true }, '26'],
      [{ key: 'å', code: 'KeyA', altKey: true }, '52'],
      [{ key: '¡', code: 'Digit1', altKey: true }, '0'],
      [{ key: '⁄', code: 'Digit1', altKey: true, shiftKey: true }, '10'],
    ] as const) {
      const davor = structuredClone(tabs.verlaufLesen(tabId));
      const e = new KeyboardEvent('keydown', { ...ereignis, cancelable: true, bubbles: true });
      await act(async () => document.body.dispatchEvent(e));
      await nachfuehren();
      expect(e.defaultPrevented).toBe(aktiv);
      const verlauf = tabs.verlaufLesen(tabId);
      if (aktiv) expect(verlauf?.eintraege[0]?.xmlId).toBe(ziel);
      else expect(verlauf).toEqual(davor);
      expect(tabs.aktiverTabId).toBe(tabId);
    }
  }
  dom.host.remove();
});
