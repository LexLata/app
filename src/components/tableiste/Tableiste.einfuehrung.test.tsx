// @vitest-environment jsdom
// Echte Tableiste und Drag-Hooks; nur native Schnittstellen und Layoutmessung sind ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { assert, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { scrollNachfuehrungMessung } from '@/test/hauptfenster/scrollNachfuehrungMessung';
import { Tableiste } from './Tableiste';
const dom = domTestWurzel();
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  Element.prototype.scrollIntoView = () => {};
  scrollNachfuehrungMessung(() => 1);
});
it.each([0, 800])(
  'P6-A1: sperrt Wechsel, Schließen, beide Plus-Positionen und Herausziehen; ohne Prop bleiben sie bedienbar (Breite %s)',
  async (breite) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(breite);
    const aktivieren = vi.fn();
    const schliessen = vi.fn();
    const neu = vi.fn();
    const herausziehen = vi.fn();
    const anordnen = vi.fn();
    const props = {
      tabs: [{ id: 'a' }, { id: 'b' }],
      aktiverTabId: 'a',
      tabTitel: {},
      onTabAktivieren: aktivieren,
      onTabSchliessen: schliessen,
      onNeuenTabOeffnen: neu,
      onTabsNeuAnordnen: anordnen,
      onUebersichtOeffnen: () => {},
      onTabHerausziehen: herausziehen,
      onTabInFensterAufnehmen: () => {},
      fremdVorschauIndexRef: { current: null },
      minimalistischerModus: false,
      plattformfremdeUiAnzeigen: false,
      kannVerlaufZurueck: false,
      kannVerlaufVorwaerts: false,
      onVerlaufZurueck: () => {},
      onVerlaufVorwaerts: () => {},
    };
    function pointer(ziel: EventTarget, typ: string, clientX = 10, clientY = 10) {
      ziel.dispatchEvent(new MouseEvent(typ, { bubbles: true, button: 0, clientX, clientY }));
    }
    for (const gesperrt of [true, undefined]) {
      await act(async () =>
        dom.root.render(<Tableiste {...props} einfuehrungGesperrt={gesperrt} />),
      );
      await act(async () => vi.dynamicImportSettled());
      const tab = dom.host.querySelector<HTMLElement>('[data-tab-id="b"]');
      const schliessenButton = tab?.querySelector('button');
      const plus = [...dom.host.querySelectorAll('button')].find((b) =>
        b.title.startsWith('Neuer Tab ('),
      );
      assert(tab && schliessenButton && plus);
      const grundfarbe = schliessenButton.style.color;
      await act(async () =>
        schliessenButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
      );
      expect(schliessenButton.style.color).toBe('var(--text-primaer)');
      await act(async () =>
        schliessenButton.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })),
      );
      expect(schliessenButton.style.color).toBe(grundfarbe);
      await act(async () => {
        pointer(tab, 'pointerdown');
        pointer(window, 'pointerup');
        schliessenButton.click();
        plus.click();
      });
      expect(aktivieren).toHaveBeenCalledTimes(gesperrt ? 0 : 1);
      expect(schliessen).toHaveBeenCalledTimes(gesperrt ? 0 : 1);
      expect(neu).toHaveBeenCalledTimes(gesperrt ? 0 : 1);
      await act(async () => {
        pointer(tab, 'pointerdown');
        pointer(window, 'pointermove', 20);
      });
      await act(async () => pointer(window, 'pointermove', -20, -20));
      await act(async () => pointer(window, 'pointerup', -20, -20));
      expect(herausziehen).toHaveBeenCalledTimes(gesperrt ? 0 : 1);
      if (gesperrt) {
        expect(anordnen).not.toHaveBeenCalled();
        expect(io.invoke.mock.calls.some(([name]) => name === 'fenster_alle_positionen')).toBe(
          false,
        );
      }
    }
  },
);
