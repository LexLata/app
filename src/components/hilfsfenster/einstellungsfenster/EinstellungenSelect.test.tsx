// @vitest-environment jsdom
// EinstellungenSelect.test.tsx
// Prüft Attribut-Spread, Ref und unveränderte Optionswerte an der zentralen Auswahlgrenze.
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());
import { EinstellungenSelect } from './EinstellungenSelect';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));

it('schützt Attribute aus Spread und erhält Ref, Stil, Auswahl und Änderungsereignis', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const ref = createRef<HTMLSelectElement>();
  const onChange = vi.fn();
  const attribute = { title: 'Art. 1', 'aria-label': 'Abs. 1', element: 'textarea' };
  await act(async () =>
    root.render(
      <EinstellungenSelect
        {...attribute}
        ref={ref}
        defaultValue="§ 1"
        onChange={(e) => onChange(e.target.value)}
        style={{ color: 'red' }}
      >
        <TextAnzeige element="option" value="§ 1" text="Art. 1 Abs. 1" />
        <TextAnzeige element="option" value="Art. 2" text="Art. 2" />
      </EinstellungenSelect>,
    ),
  );
  const select = ref.current!;
  expect(select).toBe(host.querySelector('select'));
  expect(select.title).toBe('Art.\u00a01');
  expect(select.getAttribute('aria-label')).toBe('Abs.\u00a01');
  expect(select.style.color).toBe('red');
  expect(select.value).toBe('§ 1');
  expect(select.options[0]!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  expect(select.options[0]!.children).toHaveLength(0);
  await act(async () => {
    select.value = 'Art. 2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith('Art. 2');
  await act(async () => root.unmount());
});
