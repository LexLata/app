// @vitest-environment jsdom
// useCustomTastatur.test.tsx
// Eingabeprops ergänzen nur Ereignisse und Eingabemodus; originale Werte bleiben erhalten.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useCustomTastatur } from './useCustomTastatur';

it.each([false, true])('liefert ohne Textprops den Eingabevertrag bei aktiv=%s', async (aktiv) => {
  const host = document.createElement('div');
  const root = createRoot(host);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let tastatur!: ReturnType<typeof useCustomTastatur>;
  const onWertAendern = vi.fn();
  function Eingabe() {
    tastatur = useCustomTastatur({
      aktiv,
      wert: '§  9999\tAbs. 1😀',
      onWertAendern,
      inputRef: { current: null },
    });
    return null;
  }
  try {
    await act(async () => root.render(<Eingabe />));
    expect(Object.keys(tastatur.inputProps).sort()).toEqual(
      aktiv
        ? [
            'inputMode',
            'onClick',
            'onFocus',
            'onPointerDown',
            'onPointerMove',
            'onPointerUp',
            'onSelect',
            'readOnly',
          ]
        : [],
    );
    if (aktiv) {
      expect(tastatur.inputProps.readOnly).toBe(true);
      expect(tastatur.inputProps.inputMode).toBe('none');
      expect(
        Object.entries(tastatur.inputProps)
          .filter(([name]) => name.startsWith('on'))
          .every(([, wert]) => typeof wert === 'function'),
      ).toBe(true);
    }
    await act(async () => tastatur.tasteEingeben('Art. 2'));
    expect(onWertAendern).toHaveBeenCalledExactlyOnceWith('§  9999\tAbs. 1😀Art. 2');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
