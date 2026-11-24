// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('schaltet durch Kästchen und Beschriftung um und zeigt nur angehakt einen dekorativen Haken', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    function Beispiel() {
      const [checked, setzen] = useState(false);
      return (
        <label>
          <Checkbox checked={checked} onChange={setzen} />
          Auswahl
        </label>
      );
    }
    try {
      await act(async () => root.render(<Beispiel />));
      const input = host.querySelector('input');
      if (!input) throw new Error('Checkbox fehlt');
      expect(host.querySelector('svg')).toBeNull();
      await act(async () => input.click());
      expect(input.checked).toBe(true);
      expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      const label = host.querySelector('label');
      if (!label) throw new Error('Beschriftung fehlt');
      await act(async () => label.click());
      expect(input.checked).toBe(false);
      expect(host.querySelector('svg')).toBeNull();
      input.focus();
      expect(document.activeElement).toBe(input);
      expect(input.type).toBe('checkbox');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('folgt kontrolliert checked und schaltet deaktiviert nicht um', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const aendern = vi.fn();
    try {
      await act(async () =>
        root.render(<Checkbox checked={false} onChange={aendern} aria-label="Auswahl" />),
      );
      const input = host.querySelector('input');
      if (!input) throw new Error('Checkbox fehlt');
      await act(async () => input.click());
      expect(aendern).toHaveBeenCalledWith(true);
      expect(input.checked).toBe(false);
      await act(async () => root.render(<Checkbox checked disabled onChange={aendern} />));
      aendern.mockClear();
      await act(async () => input.click());
      expect(aendern).not.toHaveBeenCalled();
      expect(input.checked).toBe(true);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
