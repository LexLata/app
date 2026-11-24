// auswahlleiste.test.tsx
// Kontrollierte Kopierabschlüsse und Timer prüfen Rückmeldungen der tatsächlichen Leiste.
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auswahlleiste } from './auswahlleiste';
import type { AuswahlleisteState } from './useAuswahlleiste';
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useTextRollen', () => ({ useTextRollen: () => ({ standardtext: {} }) }));
vi.mock('@/hooks/stil/useRadiusRollen', () => ({ useRadiusRollen: () => ({ standard: 4 }) }));
function spaeter<T>() {
  let fertig!: (wert: T) => void;
  const promise = new Promise<T>((resolve) => {
    fertig = resolve;
  });
  return { promise, fertig };
}
let aufraeumen: () => Promise<void>;
beforeEach(() => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  window.HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 200, height: 30 }) as DOMRect;
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});
afterEach(async () => {
  await aufraeumen?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(strict = false, geometrie: () => Partial<AuswahlleisteState> = () => ({})) {
  const root = createRoot(document.getElementById('root')!);
  const fertig = vi.fn();
  const kopierenLaeuft = vi.fn();
  const kopien: Array<ReturnType<typeof spaeter<boolean>>> = [];
  const kopieren = vi.fn(() => {
    const kopie = spaeter<boolean>();
    kopien.push(kopie);
    return kopie.promise;
  });
  function leiste(xmlId: string): AuswahlleisteState {
    return {
      position: { x: 100, y: 100 },
      selectionRect: { top: 100, bottom: 120, left: 20, right: 80 },
      ueberspannt: false,
      blockiert: false,
      einzeilig: true,
      xmlId,
      ueberlappende: [],
      kopierZiel: { xmlId, pfad: normtextPfad({}) },
      ...geometrie(),
    };
  }
  const anzeigen = async (xmlId: string | null) => {
    const komponent =
      xmlId === null
        ? null
        : createElement(Auswahlleiste, {
            leiste: leiste(xmlId),
            onUnterstreichen: vi.fn(),
            onHervorheben: vi.fn(),
            onVerweismarkierungAnfrage: vi.fn(),
            onKommentarAnfrage: vi.fn(),
            onEntfernen: vi.fn(),
            onZitatKopieren: kopieren,
            onKopierenLaeuftAendern: kopierenLaeuft,
            onAusgefuehrt: fertig,
          });
    await act(async () =>
      root.render(strict ? createElement(StrictMode, null, komponent) : komponent),
    );
  };
  await anzeigen('a');
  aufraeumen = async () => {
    await act(async () => root.unmount());
    aufraeumen = async () => {};
  };
  return {
    anzeigen,
    fertig,
    kopien,
    kopieren,
    kopierenLaeuft,
    klick: async () => {
      const button = document.querySelector<HTMLButtonElement>('[title="Zitat kopieren"]')!;
      await act(async () => {
        button.dispatchEvent(new window.Event('mousedown', { bubbles: true, cancelable: true }));
        button.dispatchEvent(new window.Event('click', { bubbles: true }));
      });
    },
    abschliessen: async (erfolg: boolean, index = 0) => {
      await act(async () => kopien[index]!.fertig(erfolg));
    },
    rueckmeldung: () => document.body.textContent!.includes('Zitat kopiert'),
    zeit: async (ms: number) => {
      await act(async () => vi.advanceTimersByTime(ms));
    },
  };
}
describe('Kopierabschluss-Lebensdauer', () => {
  it.each([false, true])('zeigt Erfolg genau 1200 ms (StrictMode: %s)', async (strict) => {
    const h = await render(strict);
    await h.klick();
    expect(h.kopierenLaeuft).toHaveBeenCalledWith(true);
    await h.abschliessen(true);
    expect(h.rueckmeldung()).toBe(true);
    await h.zeit(1199);
    expect(h.fertig).not.toHaveBeenCalled();
    await h.zeit(1);
    expect(h.fertig).toHaveBeenCalledOnce();
  });
  it('schließt bei Misserfolg weiterhin sofort', async () => {
    const h = await render();
    await h.klick();
    await h.abschliessen(false);
    expect(h.fertig).toHaveBeenCalledOnce();
    expect(h.rueckmeldung()).toBe(false);
  });
  it.each([true, false])(
    'ignoriert alten Kopierabschluss nach Auswahlwechsel (Erfolg: %s)',
    async (erfolg) => {
      const h = await render();
      await h.klick();
      await h.anzeigen('b');
      await h.abschliessen(erfolg);
      expect(h.fertig).not.toHaveBeenCalled();
      expect(h.rueckmeldung()).toBe(false);
      await h.zeit(1200);
      expect(h.fertig).not.toHaveBeenCalled();
    },
  );
  it.each(['Escape/Scroll-Ausblenden', 'Unmount'])('ignoriert Abschluss nach %s', async (ende) => {
    const h = await render();
    await h.klick();
    if (ende === 'Unmount') await aufraeumen();
    else {
      await h.anzeigen(null);
      await h.anzeigen('b');
    }
    expect(vi.getTimerCount()).toBe(0);
    await h.abschliessen(true);
    await h.zeit(1200);
    expect(h.fertig).not.toHaveBeenCalled();
  });
  it.each(['Auswahlwechsel', 'Ausblenden', 'Unmount'])(
    'räumt alten Rückmeldungstimer bei %s auf',
    async (ende) => {
      const h = await render();
      await h.klick();
      await h.abschliessen(true);
      await h.zeit(600);
      if (ende === 'Unmount') await aufraeumen();
      else if (ende === 'Ausblenden') {
        await h.anzeigen(null);
        await h.anzeigen('b');
      } else await h.anzeigen('b');
      expect(h.rueckmeldung()).toBe(false);
      if (ende !== 'Unmount') {
        await h.klick();
        await h.abschliessen(true, 1);
      }
      await h.zeit(600);
      expect(h.fertig).not.toHaveBeenCalled();
      if (ende !== 'Unmount') {
        await h.zeit(600);
        expect(h.fertig).toHaveBeenCalledOnce();
      }
    },
  );
  it('lässt einen älteren Kopierversuch keine neuere Rückmeldung schließen', async () => {
    const h = await render();
    await h.klick();
    await h.klick();
    await h.abschliessen(true, 1);
    await h.zeit(600);
    await h.abschliessen(false, 0);
    expect(h.fertig).not.toHaveBeenCalled();
    expect(h.rueckmeldung()).toBe(true);
    await h.zeit(600);
    expect(h.fertig).toHaveBeenCalledOnce();
  });
  it('ersetzt beim erneuten Kopieren den bisherigen Rückmeldungstimer', async () => {
    const h = await render();
    await h.klick();
    await h.abschliessen(true);
    await h.zeit(600);
    await h.klick();
    await h.abschliessen(true, 1);
    await h.zeit(600);
    expect(h.fertig).not.toHaveBeenCalled();
    await h.zeit(600);
    expect(h.fertig).toHaveBeenCalledOnce();
  });
});

it('erhält Symbolbeschriftungen, Auswahl und ursprüngliches Kopierziel', async () => {
  const h = await render();
  const button = document.querySelector<HTMLButtonElement>('[title="Zitat kopieren"]')!;
  expect(button.getAttribute('aria-label')).toBe('Zitat kopieren');
  expect(button.type).toBe('button');
  const mouseDown = new window.Event('mousedown', { bubbles: true, cancelable: true });
  button.dispatchEvent(mouseDown);
  expect(mouseDown.defaultPrevented).toBe(true);
  await h.klick();
  expect(h.kopieren).toHaveBeenCalledWith({ xmlId: 'a', pfad: normtextPfad({}) });
  expect(document.querySelector('[title="Unterstreichen"]')!.textContent).toBe('U');
  expect(document.querySelector('[title="Hervorheben"]')!.textContent).toBe('H');
});

it('misst nur bei geänderter Auswahlgeometrie und nicht bei Handler- oder Leistenobjektwechsel neu', async () => {
  let x = 100;
  const messen = vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect');
  const h = await render(false, () => ({ position: { x, y: 100 } }));
  const anzahl = messen.mock.calls.length;
  await h.anzeigen('b');
  expect(messen).toHaveBeenCalledTimes(anzahl);
  x = 200;
  await h.anzeigen('b');
  expect(messen).toHaveBeenCalledTimes(anzahl + 1);
  messen.mockRestore();
});
