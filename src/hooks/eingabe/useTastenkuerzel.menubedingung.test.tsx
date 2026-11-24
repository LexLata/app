// @vitest-environment jsdom
// Prüft Menübedingungen durch Tasteneingaben am echten Hook.
import { act, createElement } from 'react';
import { menueUndTastenAktionenFuerTest } from '@/test/plattform/menueUndTastenAktionenFuerTest';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { setzeAktiv, meldeGesetzOffenStatus } from '@/lib/plattform/menu/menu.index';
import { useTastenkuerzel } from './useTastenkuerzel';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'linux' }));
const dom = domTestWurzel();
type Optionen = Parameters<typeof useTastenkuerzel>[0];
function optionen(aenderungen: Partial<Optionen>): Optionen {
  return {
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: 'leerer-tab' },
    gesetzeskurzbefehle: {},
    gesetze: [],
    lesezeichenEintraege: [],
    ...menueUndTastenAktionenFuerTest(),
    elementOeffnen: vi.fn(),
    gesetzesreferenzOeffnen: vi.fn<Optionen['gesetzesreferenzOeffnen']>(),
    setAktiverTabId: vi.fn(),
    handleLesezeichenOeffnen: vi.fn(),
    verlaufSchrittUndOeffnen: vi.fn(),
    handleZuklappen: vi.fn(),
    handleAufklappen: vi.fn(),
    einfuehrungAktiv: false,
    einfuehrungTeilaktion: 0,
    ...aenderungen,
  };
}
const faelle = [
  ['gesetze-aktualisieren', 'r', false, false, null],
  ['alle-lesezeichen-entfernen', 'ß', true, true, 'handleAlleLesezeichenEntfernen'],
  ['gesetz-info', 'i', false, false, null],
  ['volltext-suche', 'f', false, false, null],
  ['verlauf-anzeigen', 'y', false, false, null],
  ['favorit-speichern', 'd', true, false, 'handleFavoritSpeichern'],
  ['lesezeichen-speichern', 'd', false, false, 'handleLesezeichenSpeichern'],
  ['verweismarkierung', 'k', false, false, 'handleVerweismarkierungAnfrage'],
  ['kommentar', 'k', true, false, 'handleKommentarAnfrage'],
] as const;
it.each(
  faelle.flatMap((fall) => [undefined, false, true].map((aktiv) => [...fall, aktiv] as const)),
)(
  '%s beachtet Menüzustand bei %s (Umschalt %s, Alt %s, Handler %s, aktiv %s)',
  async (id, key, shiftKey, altKey, handler, aktiv) => {
    const aktion = vi.fn();
    const overlay = vi.fn();
    if (aktiv !== undefined) setzeAktiv(id, aktiv);
    function Probe() {
      useTastenkuerzel(
        optionen({
          tabsRef: { current: [] },
          aktiverTabIdRef: { current: 'leerer-tab' },
          gesetzeskurzbefehle: {},
          gesetze: [],
          lesezeichenEintraege: [],
          setAktivesOverlay: overlay,
          ...(handler ? { [handler]: aktion } : {}),
        }),
      );
      return null;
    }
    await act(async () => dom.root.render(createElement(Probe)));
    const event = new KeyboardEvent('keydown', {
      key,
      code: id === 'alle-lesezeichen-entfernen' ? 'KeyD' : `Key${key.toUpperCase()}`,
      ctrlKey: true,
      shiftKey,
      altKey,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(handler ? aktion : overlay).toHaveBeenCalledTimes(aktiv === false ? 0 : 1);
  },
);
it.each(['i', 'f', 'y'])('öffnet im leeren Tab mit %s kein Gesetzesoverlay', async (key) => {
  meldeGesetzOffenStatus(false);
  const overlay = vi.fn();
  function Probe() {
    useTastenkuerzel(
      optionen({
        tabsRef: { current: [] },
        aktiverTabIdRef: { current: 'leer' },
        setAktivesOverlay: overlay,
      }),
    );
    return null;
  }
  await act(async () => dom.root.render(createElement(Probe)));
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(overlay).not.toHaveBeenCalled();
});

it('führt Zuletzt geschlossenen Tab öffnen trotz gesperrtem Menüpunkt weiterhin aus', async () => {
  setzeAktiv('letzter-tab', false);
  const tabWiederherstellen = vi.fn();
  function Probe() {
    useTastenkuerzel(
      optionen({
        tabsRef: { current: [] },
        aktiverTabIdRef: { current: null },
        tabWiederherstellen,
      }),
    );
    return null;
  }
  await act(async () => dom.root.render(createElement(Probe)));
  const event = new KeyboardEvent('keydown', {
    key: 't',
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(tabWiederherstellen).toHaveBeenCalledOnce();
});
