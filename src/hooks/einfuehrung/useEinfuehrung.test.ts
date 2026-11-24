// @vitest-environment jsdom
// Prüft die Auswahlsperren über den öffentlichen Einführungshook.
import '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, createElement, useEffect } from 'react';
import { beforeEach, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useEinfuehrung } from './useEinfuehrung';
const dom = domTestWurzel();
let einfuehrung: ReturnType<typeof useEinfuehrung>;
function Probe() {
  const ergebnis = useEinfuehrung();
  useEffect(() => {
    einfuehrung = ergebnis;
  });
  return null;
}
beforeEach(async () => {
  localStorage.clear();
  await act(async () => dom.root.render(createElement(Probe)));
});
it.each(Array.from({ length: 9 }, (_, i) => i))(
  'leitet Auswahlsperren für Teilaktion %s ab',
  async (teilaktion) => {
    await act(async () => einfuehrung.naechsteTeilaktion(teilaktion));
    expect(einfuehrung.sperren).toEqual({
      normAuswahlGesperrt: [0, 1, 3].includes(teilaktion),
      ueberschriftenGesperrt: [0, 1, 2, 3, 4].includes(teilaktion),
      einklappenGesperrt: [0, 1, 2, 3, 4].includes(teilaktion),
    });
    await act(async () => einfuehrung.beenden());
    expect(Object.values(einfuehrung.sperren)).toEqual([false, false, false]);
  },
);
