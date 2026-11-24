// @vitest-environment jsdom
// Vorschau und spätere Aktivierung verwenden dieselben simulierten Sichtbarkeiten.
import { act } from 'react';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useScrollNachfuehrung } from './useScrollNachfuehrung';
import type { ScrollStand } from './scrollen/scrollen.index';
const dom = domTestWurzel();
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const sichtbar = (id: string, titelSichtbar: boolean, koerperSichtbar: boolean) => ({
  id,
  titelSichtbar,
  koerperSichtbar,
});
async function aufbauen(standLesen: () => ScrollStand | null, bereit = true, gesperrt = false) {
  const vorschau = vi.fn();
  const aktivieren = vi.fn();
  let steuerung: ReturnType<typeof useScrollNachfuehrung> | undefined;
  function Probe() {
    steuerung = useScrollNachfuehrung({
      standLesen,
      bereit,
      gesperrt,
      aktivesElementId: 'a',
      aktivieren,
      vorlaeufigMelden: vorschau,
    });
    return null;
  }
  const neuDarstellen = () => dom.root.render(<Probe />);
  await act(async () => neuDarstellen());
  assert(steuerung);
  return { steuerung, vorschau, aktivieren, neuDarstellen };
}
it.each([
  [[sichtbar('b', true, false), sichtbar('a', false, true)], 'a'],
  [[sichtbar('b', false, true), sichtbar('c', true, false)], 'c'],
  [[sichtbar('b', false, true), sichtbar('c', false, true)], 'b'],
  [[], 'a'],
] as const)(
  'vorläufiges Element stimmt mit der späteren Aktivierung überein: %s',
  async (liste, erwartet) => {
    const stand: ScrollStand = {
      benutzerscrollen: true,
      scrollTop: 100,
      viewportHoehe: 500,
      zeilen: [],
      sichtbarkeitsliste: liste,
    };
    const { steuerung, vorschau, aktivieren } = await aufbauen(() => stand);
    await act(async () => steuerung?.vormerken(stand));
    expect(vorschau).toHaveBeenLastCalledWith(erwartet);
    expect(aktivieren).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(250));
    if (erwartet === 'a') expect(aktivieren).not.toHaveBeenCalled();
    else expect(aktivieren).toHaveBeenCalledExactlyOnceWith(erwartet);
    expect(vorschau).toHaveBeenLastCalledWith(null);
  },
);

it('behält die Scrollvorschau und ihre Ruhefrist bei einer Zwischenmessung ohne Benutzerscrollen', async () => {
  let stand: ScrollStand = {
    benutzerscrollen: true,
    scrollTop: 100,
    viewportHoehe: 500,
    zeilen: [],
    sichtbarkeitsliste: [sichtbar('b', true, true)],
  };
  const { steuerung, vorschau, aktivieren, neuDarstellen } = await aufbauen(() => stand);
  await act(async () => steuerung?.vormerken(stand));
  expect(vorschau).toHaveBeenLastCalledWith('b');
  await act(async () => vi.advanceTimersByTime(100));
  stand = { ...stand, benutzerscrollen: false };
  await act(async () => {
    steuerung?.vormerken(stand);
    neuDarstellen();
  });
  expect(vorschau.mock.calls).toEqual([['b']]);
  await act(async () => vi.advanceTimersByTime(149));
  expect(aktivieren).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(aktivieren).toHaveBeenCalledExactlyOnceWith('b');
});

it.each([
  [true, false, [sichtbar('b', true, false)], true],
  [false, false, [sichtbar('b', true, false)], false],
  [true, true, [sichtbar('b', true, false)], false],
  [true, false, [sichtbar('a', true, false), sichtbar('b', true, false)], false],
  [true, false, [sichtbar('a', false, true), sichtbar('b', true, false)], false],
] as const)(
  'P4-A2/A5/A6: sofortige Nachführung berücksichtigt Bereitschaft %s und Sperre %s',
  async (bereit, gesperrt, liste, erwartet) => {
    const { steuerung, aktivieren } = await aufbauen(
      () => ({
        benutzerscrollen: false,
        scrollTop: 100,
        viewportHoehe: 500,
        zeilen: [],
        sichtbarkeitsliste: liste,
      }),
      bereit,
      gesperrt,
    );
    expect(steuerung.fuehreFaelligeNach()).toBe(erwartet);
    if (erwartet) expect(aktivieren).toHaveBeenCalledExactlyOnceWith('b');
    else expect(aktivieren).not.toHaveBeenCalled();
  },
);
it('P4-A5: ohne lesbaren Messstand bleibt die sofortige Nachführung aus', async () => {
  const { steuerung, aktivieren } = await aufbauen(() => null);
  expect(steuerung.fuehreFaelligeNach()).toBe(false);
  expect(aktivieren).not.toHaveBeenCalled();
});
