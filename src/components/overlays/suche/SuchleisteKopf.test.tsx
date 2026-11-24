// @vitest-environment jsdom
// SuchleisteKopf.test.tsx
// Prüft den geschützten Hinweis bei unveränderten Suchwerten und Löschinteraktion.
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());
import { SuchleisteKopf } from './SuchleisteKopf';
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));

it('schützt den Platzhalter, erhält Originalwert und Ref und löscht mit Fokus', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const inputRef = createRef<HTMLInputElement>();
  const onChange = vi.fn();
  const original = '§  9999 Abs. 1';
  await act(async () =>
    root.render(
      <SuchleisteKopf
        value={original}
        onChange={onChange}
        platzhalter="Art. 1 Abs. 1"
        inputRef={inputRef}
      />,
    ),
  );
  expect(inputRef.current).toBe(host.querySelector('input'));
  expect(inputRef.current?.value).toBe(original);
  expect(inputRef.current?.placeholder).toBe('Art.\u00a01 Abs.\u00a01');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      inputRef.current,
      'Art. 2',
    );
    inputRef.current!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith('Art. 2');
  await act(async () => host.querySelector('button')!.click());
  expect(onChange).toHaveBeenLastCalledWith('');
  expect(document.activeElement).toBe(inputRef.current);
  await act(async () => root.unmount());
  host.remove();
});

it('erhält gesperrte Originaleingaben mit Tabs und Zeilenumbruch', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const inputRef = createRef<HTMLInputElement>();
  const original = '§  9999\tAbs. 1\nArt. 2';
  await act(async () =>
    root.render(
      <SuchleisteKopf
        value={original}
        onChange={vi.fn()}
        platzhalter="§ 9999"
        disabled
        inputRef={inputRef}
      />,
    ),
  );
  // Native einzeilige Inputs entfernen Zeilenumbrüche; React erhält den Rohwert im Formularvertrag.
  expect(inputRef.current?.value).toBe(original.replaceAll('\n', ''));
  expect(inputRef.current?.disabled).toBe(true);
  expect(inputRef.current?.placeholder).toBe('§\u00a09999');
  expect(host.querySelector('button')).toBeNull();
  await act(async () => root.unmount());
});
