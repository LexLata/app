// @vitest-environment jsdom
// CustomTastatur.test.tsx
// Anzeigeformatierung darf die Pointersteuerung und ausgegebenen Zeichen nicht verändern.
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Taste } from './CustomTastatur.Taste';
import { ModusUmschaltTaste } from './CustomTastatur.ModusUmschaltTaste';
import { CustomTastatur } from './CustomTastatur';
import { LANGDRUCK_SCHWELLE_MS } from './CustomTastatur.layout';
import type { TastenHandle } from './CustomTastatur.types';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function pointer(taste: Element, typ: string, x = 0, y = 0) {
  const event = new MouseEvent(typ, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  await act(async () => taste.dispatchEvent(event));
}

it('schützt Label, Bubble und Alternativen und gibt die ursprünglichen Werte aus', async () => {
  const onTaste = vi.fn();
  const wert = '§  9999\tAbs. 1';
  const alternative = 'Art. 2 Abs. 3';
  await act(async () =>
    root.render(<Taste label="§ 1" wert={wert} alternativen={[alternative]} onTaste={onTaste} />),
  );
  const taste = host.querySelector('button')!;
  expect(taste.textContent).toBe('§\u00a01');
  await pointer(taste, 'pointerdown');
  expect(taste.lastElementChild?.textContent).toBe('§\u00a0\u00a09999\tAbs.\u00a01');
  await pointer(taste, 'pointerup');
  expect(onTaste).toHaveBeenLastCalledWith(wert);
  await pointer(taste, 'pointerdown');
  await act(async () => vi.advanceTimersByTime(LANGDRUCK_SCHWELLE_MS));
  const basis = taste.querySelector<HTMLElement>('[data-alt-index="-basis-"]')!;
  const alt = taste.querySelector<HTMLElement>('[data-alt-index="0"]')!;
  expect(basis.textContent).toBe('§\u00a0\u00a09999\tAbs.\u00a01');
  expect(alt.textContent).toBe('Art.\u00a02 Abs.\u00a03');
  vi.spyOn(basis, 'getBoundingClientRect').mockReturnValue({ left: 0, right: 40 } as DOMRect);
  vi.spyOn(alt, 'getBoundingClientRect').mockReturnValue({ left: 40, right: 80 } as DOMRect);
  await pointer(taste, 'pointermove', 60);
  await pointer(taste, 'pointerup');
  expect(onTaste.mock.calls).toEqual([[wert], [alternative]]);
});

it('schützt den Modustext und erhält Registrierung, Wechsel und Abbruch', async () => {
  const wechsel = vi.fn();
  const halten = vi.fn();
  const beenden = vi.fn();
  const registrieren = vi.fn();
  await act(async () =>
    root.render(
      <ModusUmschaltTaste
        label="§ 123"
        onModusWechsel={wechsel}
        setzeModusHalten={halten}
        loescheModusHaltenUndPruefen={beenden}
        registrieren={registrieren}
        tastenMapRef={{ current: new WeakMap<HTMLButtonElement, TastenHandle>() }}
      />,
    ),
  );
  const taste = host.querySelector('button')!;
  expect(taste.textContent).toBe('§\u00a0123');
  expect(registrieren.mock.calls[0]![0]).toBe(taste);
  await pointer(taste, 'pointerdown');
  expect(wechsel).toHaveBeenCalledTimes(1);
  expect(halten).toHaveBeenCalledWith(wechsel);
  await pointer(taste, 'pointercancel');
  expect(beenden).toHaveBeenCalledTimes(1);
});

it('erhält Moduswechsel, Peek, Leerzeichen, Fertig und Löschwiederholung im echten Layout', async () => {
  const onTaste = vi.fn();
  const loeschen = vi.fn();
  const fertig = vi.fn();
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
  await act(async () =>
    root.render(<CustomTastatur onTaste={onTaste} onLoeschen={loeschen} onFertig={fertig} />),
  );
  const finden = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;
  const modus = finden('#+=');
  await pointer(modus, 'pointerdown');
  expect(finden('ABC')).toBe(modus);
  const sonderzeichen = finden('[');
  await pointer(sonderzeichen, 'pointerdown');
  await pointer(sonderzeichen, 'pointerup');
  expect(onTaste).toHaveBeenLastCalledWith('[');
  expect(finden('ABC')).toBe(modus);
  await pointer(modus, 'pointerup');
  expect(finden('#+=')).toBe(modus);
  for (const label of ['Leerzeichen', 'Fertig']) {
    const taste = finden(label);
    await pointer(taste, 'pointerdown');
    await pointer(taste, 'pointerup');
  }
  expect(onTaste).toHaveBeenLastCalledWith(' ');
  expect(fertig).toHaveBeenCalledTimes(1);
  const loeschTaste = finden('⌫');
  await pointer(loeschTaste, 'pointerdown');
  await act(async () => vi.advanceTimersByTime(520));
  await pointer(loeschTaste, 'pointerup');
  const anzahl = loeschen.mock.calls.length;
  expect(anzahl).toBeGreaterThan(1);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(loeschen).toHaveBeenCalledTimes(anzahl);
});

it('erhält Shift und Caps Lock mit dem SVG-Slot und Großbuchstaben', async () => {
  vi.setSystemTime(1000);
  const onTaste = vi.fn();
  await act(async () =>
    root.render(<CustomTastatur onTaste={onTaste} onLoeschen={vi.fn()} onFertig={vi.fn()} />),
  );
  const shift = host.querySelector('svg')!.closest('button')!;
  const tippen = async (taste: Element) => {
    await pointer(taste, 'pointerdown');
    await pointer(taste, 'pointerup');
  };
  await tippen(shift);
  expect(shift.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
  const grossA = [...host.querySelectorAll('button')].find((b) => b.textContent === 'A')!;
  await tippen(grossA.firstElementChild!);
  expect(onTaste).toHaveBeenLastCalledWith('A');
  await act(async () => vi.advanceTimersByTime(100));
  await tippen(shift);
  expect(shift.querySelector('rect')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(400));
  await tippen(shift);
  expect(shift.querySelector('rect')).toBeNull();
  expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'a')).toBe(true);
});

it('leitet Zwischenraum-Pointer an die registrierte Taste weiter und bricht ohne Ausgabe ab', async () => {
  const onTaste = vi.fn();
  await act(async () =>
    root.render(<CustomTastatur onTaste={onTaste} onLoeschen={vi.fn()} onFertig={vi.fn()} />),
  );
  const container = host.firstElementChild!;
  Object.defineProperty(container, 'setPointerCapture', { value: vi.fn() });
  await pointer(container, 'pointerdown');
  await pointer(container, 'pointercancel');
  expect(onTaste).not.toHaveBeenCalled();
  await pointer(container, 'pointerdown');
  await pointer(container, 'pointerup');
  expect(onTaste).toHaveBeenCalledExactlyOnceWith('§');
});

it('liefert in der Pointerfactory ausschließlich Ereignisse ohne Textprops', async () => {
  const { baueTastenPointerHandler } = await import('./CustomTastatur.pointer');
  const props = baueTastenPointerHandler(
    { current: null },
    { down: vi.fn(), move: vi.fn(), up: vi.fn(), cancel: vi.fn() },
  );
  expect(Object.keys(props).sort()).toEqual([
    'onContextMenu',
    'onPointerCancel',
    'onPointerDown',
    'onPointerMove',
    'onPointerUp',
  ]);
  expect(Object.values(props).every((wert) => typeof wert === 'function')).toBe(true);
});

it.each([
  { fall: 'noch nicht ausgelöstem Langdruck', label: 's', halten: 0, loslassen: false },
  { fall: 'Nachleuchten', label: 'a', halten: 0, loslassen: true },
  { fall: 'noch nicht gestarteter Löschwiederholung', label: '⌫', halten: 0, loslassen: false },
  { fall: 'laufender Löschwiederholung', label: '⌫', halten: 520, loslassen: false },
])(
  'beendet beim Schließen mit $fall alle Tasten-Timer und weitere Eingaben',
  async ({ label, halten, loslassen }) => {
    const eingabe = vi.fn();
    const loeschen = vi.fn();
    function TastaturMitSchliessen() {
      const [offen, setOffen] = useState(true);
      return offen ? (
        <CustomTastatur onTaste={eingabe} onLoeschen={loeschen} onFertig={() => setOffen(false)} />
      ) : null;
    }
    await act(async () => root.render(<TastaturMitSchliessen />));
    const finden = (text: string) => {
      const taste = [...host.querySelectorAll('button')].find(
        (taste) => taste.textContent === text,
      );
      if (!taste) throw new Error(`Taste „${text}“ fehlt`);
      return taste;
    };
    const taste = finden(label);
    await pointer(taste, 'pointerdown');
    await act(async () => vi.advanceTimersByTime(halten));
    if (loslassen) await pointer(taste, 'pointerup');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    if (halten > 0) expect(loeschen.mock.calls.length).toBeGreaterThan(1);
    const fertig = finden('Fertig');
    await pointer(fertig, 'pointerdown');
    await pointer(fertig, 'pointerup');
    expect(host.querySelector('button')).toBeNull();
    const eingabenBeimSchliessen = eingabe.mock.calls.length;
    const loeschungenBeimSchliessen = loeschen.mock.calls.length;
    const ausstehendeTimer = vi.getTimerCount();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(eingabe).toHaveBeenCalledTimes(eingabenBeimSchliessen);
    expect(loeschen).toHaveBeenCalledTimes(loeschungenBeimSchliessen);
    expect(ausstehendeTimer).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  },
);
