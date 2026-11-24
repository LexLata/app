// @vitest-environment jsdom
// TextAttributElement.test.tsx
// Prüft die Attributgrenze und unveränderte Eingabe- und Interaktionsverträge.
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());
import { TextAnzeige, TextAttributElement } from './textanzeige.index';

function dom(element: React.ReactNode) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

describe('TextAttributElement', () => {
  it('schützt Attribute aus Spread und lässt Layoutkinder unverändert', () => {
    const attrs = { title: '§ 1', placeholder: 'Art. 1', 'aria-label': 'Abs. 1' };
    const host = dom(
      <TextAttributElement element="div" {...attrs}>
        <span>§ 1</span>
      </TextAttributElement>,
    );
    expect(host.firstElementChild?.getAttribute('title')).toBe('§\u00a01');
    expect(host.firstElementChild?.getAttribute('placeholder')).toBe('Art.\u00a01');
    expect(host.firstElementChild?.getAttribute('aria-label')).toBe('Abs.\u00a01');
    expect(host.textContent).toBe('§ 1');
    expect(dom(<TextAttributElement element="img" alt="§ 1" />).querySelector('img')?.alt).toBe(
      '§\u00a01',
    );
  });
  it('wahrt Ref, Originalwerte, Sperrung und Ereignisse', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const ref = createRef<HTMLInputElement>();
    const original = '§  9999\tAbs. 1\nArt. 2';
    let geklickt = false;
    await act(async () =>
      root.render(
        <TextAttributElement
          element="input"
          ref={ref}
          defaultValue={original}
          readOnly
          disabled
          title="§ 1"
          onClick={() => {
            geklickt = true;
          }}
        />,
      ),
    );
    expect(ref.current).toBe(host.querySelector('input'));
    expect(ref.current?.defaultValue).toBe(original);
    expect(ref.current?.disabled).toBe(true);
    expect(ref.current?.readOnly).toBe(true);
    await act(async () =>
      root.render(
        <TextAttributElement
          element="button"
          onClick={() => {
            geklickt = true;
          }}
        >
          <TextAnzeige text="§ 1" />
        </TextAttributElement>,
      ),
    );
    await act(async () => host.querySelector('button')!.click());
    expect(geklickt).toBe(true);
    await act(async () => root.unmount());
  });
});
