// @vitest-environment jsdom
// FensterEingabeFeld.test.tsx
// Attributschutz darf den ursprünglichen Kommentar-/Verweistext nicht verändern.
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());
import { FensterEingabeFeld } from './FensterEingabeFeld';
import { useFensterEnterTaste } from '@/hooks/fenster/useFensterEnterTaste';
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));

it('lässt Umschalt+Enter als Zeilenumbruch durch, ohne die Fensteraktion auszulösen', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const hauptaktion = vi.fn();
  const textareaRef = createRef<HTMLTextAreaElement>();
  function Fenster() {
    useFensterEnterTaste(hauptaktion);
    return (
      <FensterEingabeFeld
        disabled={false}
        value="Kommentar"
        cursorAmEnde={false}
        rows={2}
        minHeight={50}
        platzhalter="Kommentar"
        hinweisText=""
        textareaRef={textareaRef}
        onChange={vi.fn()}
        onEnter={hauptaktion}
      />
    );
  }
  try {
    await act(async () => root.render(<Fenster />));
    textareaRef.current!.focus();
    const zeilenumbruch = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => textareaRef.current!.dispatchEvent(zeilenumbruch));
    expect(zeilenumbruch.defaultPrevented).toBe(false);
    expect(hauptaktion).not.toHaveBeenCalled();
    await act(async () =>
      textareaRef.current!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }),
      ),
    );
    expect(hauptaktion).toHaveBeenCalledOnce();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(hauptaktion).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('schützt den Platzhalter und erhält Wert, Ref, Bearbeitung und Enter auch nach Sperrung', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const textareaRef = createRef<HTMLTextAreaElement>();
  const original = '§  9999\tAbs. 1\nArt. 2';
  const onChange = vi.fn();
  const onEnter = vi.fn();
  const props = {
    value: original,
    cursorAmEnde: false,
    rows: 2,
    minHeight: 50,
    platzhalter: 'Art. 1 Abs. 1',
    hinweisText: 'Art. 1 Abs. 1',
    textareaRef,
    onChange,
    onEnter,
  };
  await act(async () => root.render(<FensterEingabeFeld {...props} disabled={false} />));
  const feld = textareaRef.current!;
  expect(feld).toBe(host.querySelector('textarea'));
  expect(feld.value).toBe(original);
  expect(feld.placeholder).toBe('Art.\u00a01 Abs.\u00a01');
  expect(host.querySelector('span')!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  const bearbeitet = original + ' § 3';
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      feld,
      bearbeitet,
    );
    feld.dispatchEvent(new Event('input', { bubbles: true }));
    feld.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith(bearbeitet);
  expect(onEnter).toHaveBeenCalledOnce();
  await act(async () => root.render(<FensterEingabeFeld {...props} value={bearbeitet} disabled />));
  expect(feld.value).toBe(bearbeitet);
  expect(feld.disabled).toBe(true);
  await act(async () => root.unmount());
});

/** Ersetzt ResizeObserver; die Rückrufe löst der Test selbst aus. */
function groessenBeobachterAttrappe(): Array<() => void> {
  const beobachter: Array<() => void> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private rueckruf: () => void) {}
      observe() {
        beobachter.push(this.rueckruf);
      }
      disconnect() {}
      unobserve() {}
    },
  );
  return beobachter;
}

it('misst lange Texte mit der Breite, die bei sichtbarer Scrollleiste gilt', async () => {
  const beobachter = groessenBeobachterAttrappe();
  // Modell: Der Formularbereich zeigt 50 px. Ist der Inhalt höher, erscheint
  // eine Scrollleiste; das Feld wird schmaler und der Text braucht 58 statt 40 px.
  const hoehe = (el: HTMLElement): number => {
    if (el instanceof HTMLTextAreaElement) return parseFloat(el.style.height) || 0;
    const feld = el.querySelector('textarea');
    return Math.max(feld ? hoehe(feld) : 0, parseFloat(el.style.minHeight) || 0);
  };
  const spies = [
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return hoehe(this);
    }),
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return hoehe(this);
    }),
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      const huelle = this.parentElement;
      return huelle && hoehe(huelle) > 50 ? 58 : 40;
    }),
  ];
  let breite = 300;
  spies.push(
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => breite),
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const textareaRef = createRef<HTMLTextAreaElement>();
  try {
    await act(async () =>
      root.render(
        <FensterEingabeFeld
          value="Sehr langer Kommentar"
          cursorAmEnde={false}
          disabled={false}
          rows={2}
          minHeight={50}
          textareaRef={textareaRef}
          onChange={vi.fn()}
          onEnter={vi.fn()}
        />,
      ),
    );
    // Fenster wächst, der Bereich scrollt: Scrollleiste macht das Feld schmaler.
    const feld = textareaRef.current;
    assert(feld);
    feld.style.height = '58px';
    breite = 285;
    await act(async () => beobachter.forEach((r) => r()));
    expect(feld.style.height).toBe('58px');
  } finally {
    await act(async () => root.unmount());
    spies.forEach((s) => s.mockRestore());
  }
});

it('passt die Höhe an, wenn sich die Breite des Felds ändert', async () => {
  const beobachter = groessenBeobachterAttrappe();
  let breite = 300;
  let inhaltHoehe = 40;
  const breiteSpy = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(() => breite);
  const hoeheSpy = vi
    .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
    .mockImplementation(() => inhaltHoehe);
  const host = document.createElement('div');
  const root = createRoot(host);
  const textareaRef = createRef<HTMLTextAreaElement>();
  try {
    await act(async () =>
      root.render(
        <FensterEingabeFeld
          value="Langer Kommentar"
          cursorAmEnde={false}
          disabled={false}
          rows={2}
          minHeight={50}
          textareaRef={textareaRef}
          onChange={vi.fn()}
          onEnter={vi.fn()}
        />,
      ),
    );
    expect(textareaRef.current?.style.height).toBe('40px');
    // Scrollleiste erscheint: Feld wird schmaler, Text braucht mehr Zeilen.
    breite = 280;
    inhaltHoehe = 58;
    await act(async () => beobachter.forEach((r) => r()));
    expect(textareaRef.current?.style.height).toBe('58px');
    // Scrollleiste verschwindet: Feld wird breiter, Text braucht weniger Zeilen.
    breite = 300;
    inhaltHoehe = 40;
    await act(async () => beobachter.forEach((r) => r()));
    expect(textareaRef.current?.style.height).toBe('40px');
  } finally {
    await act(async () => root.unmount());
    breiteSpy.mockRestore();
    hoeheSpy.mockRestore();
  }
});
