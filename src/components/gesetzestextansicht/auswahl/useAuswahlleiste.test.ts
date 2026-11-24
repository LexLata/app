// useAuswahlleiste.test.ts
// Verzögerte Imports prüfen Auswahlablösung und die bestehenden Kopierschutzregeln.

import { normaleNorm, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import type { useAuswahlleiste } from './useAuswahlleiste';
import { Auswahlleiste } from './auswahlleiste';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useTextRollen', () => ({ useTextRollen: () => ({ standardtext: {} }) }));
vi.mock('@/hooks/stil/useRadiusRollen', () => ({ useRadiusRollen: () => ({ standard: 4 }) }));

const { mehrere } = vi.hoisted(() => ({ mehrere: { aktuell: false } }));
vi.mock('@/lib/domain/norm/norm.index', () => ({
  ausgangsnormKennung: vi.fn(),
}));
vi.mock('@/lib/domain/textpfad/textpfad.index', () => ({
  ermittleAuswahl: (selection: Selection) =>
    mehrere.aktuell
      ? { fehler: 'ueberspannt-mehrere' }
      : {
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 2 },
          xmlId: selection.toString(),
        },
  ermittleMehrfachAuswahl: (selection: Selection) => ({
    xmlId: selection.toString(),
    pfad: normtextPfad({}),
  }),
}));
function spaeter<T>() {
  let fertig!: (wert: T) => void;
  const promise = new Promise<T>((resolve) => {
    fertig = resolve;
  });
  return { promise, fertig };
}
let aufraeumen: () => Promise<void>;
beforeEach(() => {
  vi.resetModules();
  vi.mocked(ausgangsnormKennung).mockReset().mockReturnValue(normAusgangsstelle('§ 1'));
  mehrere.aktuell = false;
  const { window } = parseHTML(
    '<html><body><div id="root"></div><div id="text"></div></body></html>',
  );
  window.HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 200, height: 30 }) as DOMRect;
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await aufraeumen?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(mitLeiste = false, strict = false) {
  const kopie = spaeter<boolean>();
  const importiert = spaeter<void>();
  const begonnen = spaeter<void>();
  const pruefen = vi.fn(() => ({ ueberlappende: [], blockiertNeueMarkierung: false }));
  vi.doMock('@/lib/markierungen/markierungen.index', async () => {
    begonnen.fertig();
    await importiert.promise;
    return { pruefeMarkierungAnStelle: pruefen };
  });
  const { useAuswahlleiste: useLeiste } = await import('./useAuswahlleiste');
  const root = createRoot(document.getElementById('root')!);
  const container = document.getElementById('text')! as HTMLDivElement;
  let text = 'a';
  window.getSelection = () =>
    ({
      isCollapsed: !text,
      toString: () => text,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 20, right: 80 }),
        getClientRects: () => [{ top: 100, width: 60, height: 20 }],
      }),
    }) as unknown as Selection;
  let hook!: ReturnType<typeof useAuswahlleiste>;
  const params = {
    containerRef: { current: container },
    gesetz: gesetzMitNormen(['§ 1', '§ 2'], { kennung: ['a', 'b'] }),
    markierungenNachXmlId: new Map(),
    markierungenDeaktiviert: false,
  };
  function Probe() {
    hook = useLeiste(params);
    if (!mitLeiste || !hook.leiste) return null;
    return createElement(Auswahlleiste, {
      leiste: hook.leiste,
      onUnterstreichen: vi.fn(),
      onHervorheben: vi.fn(),
      onVerweismarkierungAnfrage: vi.fn(),
      onKommentarAnfrage: vi.fn(),
      onEntfernen: vi.fn(),
      onZitatKopieren: () => kopie.promise,
      onKopierenLaeuftAendern: hook.setKopierenLaeuft,
      onAusgefuehrt: hook.ausblenden,
    });
  }
  const anzeigen = async () => {
    await act(async () =>
      root.render(
        strict ? createElement(StrictMode, null, createElement(Probe)) : createElement(Probe),
      ),
    );
  };
  await anzeigen();
  aufraeumen = async () => {
    await act(async () => root.unmount());
    aufraeumen = async () => {};
  };
  const ereignis = async (ziel: EventTarget, typ: string, werte = {}) => {
    await act(async () =>
      ziel.dispatchEvent(
        Object.assign(new window.Event(typ, { bubbles: true, cancelable: true }), werte),
      ),
    );
  };
  return {
    kopie,
    klick: async () => {
      const button = document.querySelector<HTMLButtonElement>('[title="Zitat kopieren"]')!;
      await ereignis(button, 'mousedown');
      await ereignis(button, 'click');
    },
    params,
    anzeigen,
    pruefen,
    get hook() {
      return hook;
    },
    text: (wert: string) => {
      text = wert;
    },
    mouseup: async () => {
      await ereignis(container, 'mouseup', { clientX: 40, clientY: 120 });
      await begonnen.promise;
    },
    selectionchange: () => ereignis(document, 'selectionchange'),
    escape: () => ereignis(document, 'keydown', { key: 'Escape' }),
    scroll: () => ereignis(container, 'scroll'),
    fertig: async () => {
      await act(async () => {
        importiert.fertig();
        await vi.dynamicImportSettled();
      });
    },
  };
}
describe('Auswahlermittlung-Lebensdauer', () => {
  it('prüft die Konkurrenz an Überschrift 010 statt an § 1010', async () => {
    const domain = await vi.importActual<typeof import('@/lib/domain/norm/norm.index')>(
      '@/lib/domain/norm/norm.index',
    );
    vi.mocked(ausgangsnormKennung).mockImplementation(domain.ausgangsnormKennung);
    const h = await render();
    h.params.gesetz.elemente = [
      {
        typ: 'ueberschrift',
        data: { id: 'u', xmlId: 'a', gliederungskennzahl: '010', bezeichnung: 'Buch 1', ebene: 1 },
      },
      {
        typ: 'norm',
        data: normaleNorm({ id: 'n', xmlId: 'b', bezeichnung: '§ 1010', absaetze: [] }),
      },
    ];
    await h.anzeigen();
    await h.mouseup();
    await h.fertig();
    expect(h.pruefen).toHaveBeenCalledExactlyOnceWith([], {
      ausgangsstelle: ueberschriftAusgangsstelle('010'),

      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 2 },
        bezugstext: '',
      },
    });
    expect(h.hook.leiste?.xmlId).toBe('a');
  });
  it.each([
    'Escape',
    'Scroll',
    'selectionchange',
    'Leeren',
    'Ausblenden',
    'Deaktivieren',
    'Unmount',
  ])('verwirft Importabschluss nach %s', async (abbruch) => {
    const h = await render();
    await h.mouseup();
    if (abbruch === 'Escape') await h.escape();
    if (abbruch === 'Scroll') await h.scroll();
    if (abbruch === 'selectionchange') {
      h.text('b');
      await h.selectionchange();
    }
    if (abbruch === 'Leeren') {
      h.text('');
      await h.selectionchange();
    }
    if (abbruch === 'Ausblenden') await act(async () => h.hook.ausblenden());
    if (abbruch === 'Deaktivieren') {
      h.params.markierungenDeaktiviert = true;
      await h.anzeigen();
    }
    if (abbruch === 'Unmount') await aufraeumen();
    await h.fertig();
    expect(h.pruefen).not.toHaveBeenCalled();
    expect(h.hook.leiste).toBeNull();
  });
  it('öffnet die unverändert gültige Auswahl', async () => {
    const h = await render();
    await h.mouseup();
    await h.fertig();
    expect(h.hook.leiste?.xmlId).toBe('a');
  });
  it('übernimmt bei zwei Imports B vor dem verzögerten Abschluss von A', async () => {
    const h = await render();
    await h.mouseup();
    vi.doUnmock('@/lib/markierungen/markierungen.index');
    h.text('b');
    await h.mouseup();
    // Der zweite Import nutzt die inzwischen verfügbare echte Modulauflösung.
    // A bleibt durch seinen kontrollierten Import weiterhin ausstehend.
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(h.hook.leiste?.xmlId).toBe('b');
    });
    await h.fertig();
    expect(h.hook.leiste?.xmlId).toBe('b');
    expect(h.pruefen).not.toHaveBeenCalled();
  });
  it('verwirft A auch wenn die jüngere gültige Mehrfachauswahl B bereits vor dem Importabschluss erscheint', async () => {
    const h = await render();
    await h.mouseup();
    mehrere.aktuell = true;
    h.text('b');
    await h.mouseup();
    expect(h.hook.leiste?.ueberspannt).toBe(true);
    expect(h.hook.leiste?.kopierZiel?.xmlId).toBe('b');
    await h.fertig();
    expect(h.hook.leiste?.ueberspannt).toBe(true);
    expect(h.hook.leiste?.kopierZiel?.xmlId).toBe('b');
    expect(h.pruefen).not.toHaveBeenCalled();
  });
  it('schützt kollabierende Kopierselektion, beendet sie aber durch Escape und Scroll', async () => {
    const h = await render();
    await h.mouseup();
    await h.fertig();
    h.hook.setKopierenLaeuft(true);
    h.text('');
    await h.selectionchange();
    await h.mouseup();
    expect(h.hook.leiste?.xmlId).toBe('a');
    await h.escape();
    expect(h.hook.leiste).toBeNull();
    h.text('b');
    await h.mouseup();
    await h.fertig();
    h.hook.setKopierenLaeuft(true);
    await h.scroll();
    expect(h.hook.leiste).toBeNull();
    h.text('a');
    await h.mouseup();
    await h.fertig();
    expect(h.hook.leiste?.xmlId).toBe('a');
  });
  it('behält die echte Kopierrückmeldung trotz kollabierter Selektion für 1200 ms', async () => {
    const h = await render(true);
    await h.mouseup();
    await h.fertig();
    vi.useFakeTimers();
    await h.klick();
    h.text('');
    await h.selectionchange();
    await h.mouseup();
    expect(h.hook.leiste?.xmlId).toBe('a');
    await act(async () => h.kopie.fertig(true));
    expect(document.body.textContent).toContain('Zitat kopiert');
    await act(async () => vi.advanceTimersByTime(1199));
    expect(h.hook.leiste?.xmlId).toBe('a');
    await act(async () => vi.advanceTimersByTime(1));
    expect(h.hook.leiste).toBeNull();
  });
  it.each(['Escape', 'Scroll', 'Auswahlwechsel', 'Deaktivieren', 'Unmount'])(
    'bindet Hook und Kopierkomponente bei %s an dieselbe gültige Auswahl',
    async (ende) => {
      const h = await render(true);
      await h.mouseup();
      await h.fertig();
      await h.klick();
      if (ende === 'Escape') await h.escape();
      if (ende === 'Scroll') await h.scroll();
      if (ende === 'Auswahlwechsel') {
        h.text('b');
        await h.selectionchange();
      }
      if (ende === 'Deaktivieren') {
        h.params.markierungenDeaktiviert = true;
        await h.anzeigen();
      }
      if (ende === 'Unmount') {
        await aufraeumen();
        expect(document.getElementById('root')!.childNodes).toHaveLength(0);
      } else expect(h.hook.leiste).toBeNull();
      if (ende !== 'Unmount') {
        h.params.markierungenDeaktiviert = false;
        await h.anzeigen();
        h.text('b');
        await h.mouseup();
        await h.fertig();
      }
      vi.useFakeTimers();
      await act(async () => h.kopie.fertig(true));
      await act(async () => vi.advanceTimersByTime(1200));
      expect(document.body.textContent).not.toContain('Zitat kopiert');
      if (ende !== 'Unmount') expect(h.hook.leiste?.xmlId).toBe('b');
    },
  );
  it('öffnet auch nach dem StrictMode-Neustart genau eine aktuelle Auswahlermittlung', async () => {
    const h = await render(false, true);
    await h.mouseup();
    await h.fertig();
    expect(h.pruefen).toHaveBeenCalledOnce();
    expect(h.hook.leiste?.xmlId).toBe('a');
    await h.escape();
    expect(h.hook.leiste).toBeNull();
  });
});
