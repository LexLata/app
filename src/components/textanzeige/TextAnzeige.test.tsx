// @vitest-environment jsdom
// TextAnzeige.test.tsx
// Prüft den öffentlichen Anzeigevertrag einschließlich DOM-Gruppen und Eingaben.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TextAnzeige, type HervorhebungsBereich } from './textanzeige.index';
import type { TextAnzeigeProps, TextAttributElementProps, TextElement } from './textanzeige.types';
import type { ComponentPropsWithRef } from 'react';
import fc from 'fast-check';

function dom(element: React.ReactNode) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

describe('TextAnzeige', () => {
  it('schützt getrennte Angaben automatisch und lässt das Gesetzeskürzel lösbar', () => {
    const host = dom(<TextAnzeige text="§ 9999 Abs. 1 ZPO" />);
    expect(host.textContent).toBe('§\u00a09999 Abs.\u00a01 ZPO');
    expect(
      [...host.querySelectorAll('[style="white-space:nowrap"]')].map((n) => n.textContent),
    ).toEqual(['§\u00a09999', 'Abs.\u00a01']);
  });
  it('unterscheidet allgemeinen Text und Zitatmodus; zeigt auch Zahlen', () => {
    expect(dom(<TextAnzeige text="I 2" />).textContent).toBe('I 2');
    expect(dom(<TextAnzeige text="I 2" modus="zitat" />).textContent).toBe('I\u00a02');
    expect(dom(<TextAnzeige text={42} />).textContent).toBe('42');
  });
  it.each([
    [0, 1],
    [2, 6],
    [7, 11],
    [1, 2],
  ])('hält Gruppen über Hervorhebung [%i,%i) zusammen', (von, bis) => {
    const host = dom(
      <TextAnzeige
        text="§ 9999 Abs. 1 ZPO"
        hervorhebungen={[{ von, bis }]}
        hervorhebungStil={{ color: 'red' }}
      />,
    );
    const strong = host.querySelector('strong')!;
    expect(strong.textContent).toBe('§\u00a09999 Abs.\u00a01 ZPO'.slice(von, bis));
    expect(strong.closest('[style="white-space:nowrap"]')).not.toBeNull();
    expect(strong.style.color).toBe('red');
    expect(host.textContent?.length).toBe(17);
  });
  it('verwendet UTF-16-Positionen, respektiert Ausschnitte und weist ungültige Bereiche ab', () => {
    expect(
      dom(<TextAnzeige text="😀 § 1" hervorhebungen={[{ von: 3, bis: 4 }]} />).querySelector(
        'strong',
      )?.textContent,
    ).toBe('§');
    expect(dom(<TextAnzeige text="§ " />).textContent).toBe('§ ');
    expect(() =>
      renderToStaticMarkup(<TextAnzeige text="abc" hervorhebungen={[{ von: 2, bis: 4 }]} />),
    ).toThrow(RangeError);
    expect(() =>
      renderToStaticMarkup(
        <TextAnzeige
          text="abc"
          hervorhebungen={[
            { von: 0, bis: 2 },
            { von: 1, bis: 3 },
          ]}
        />,
      ),
    ).toThrow(RangeError);
  });
  it('rendert Optionen als reinen Text und wahrt ihren Datenwert', () => {
    const host = dom(
      <select>
        <TextAnzeige element="option" text="Art. 1" value="Art. 1" />
      </select>,
    );
    expect(host.querySelector('option')?.textContent).toBe('Art.\u00a01');
    expect(host.querySelector('option')?.childElementCount).toBe(0);
    expect(host.querySelector('option')?.value).toBe('Art. 1');
  });
});

it('stellt die benötigten Anzeige- und Attributtypen an der Modulgrenze bereit', () => {
  expectTypeOf<TextAnzeigeProps['text']>().toEqualTypeOf<string | number>();
  expectTypeOf<TextAttributElementProps<'input'>['ref']>().toEqualTypeOf<
    ComponentPropsWithRef<'input'>['ref']
  >();
  expectTypeOf<HervorhebungsBereich>().toEqualTypeOf<{ von: number; bis: number }>();
  expectTypeOf<TextElement>().toEqualTypeOf<keyof HTMLElementTagNameMap>();
});

it('erhält Hervorhebungen auch über mehrere Gruppen und gewöhnliche Zwischenräume', () => {
  const ursprung = '§ 9999 Abs. 1 ZPO';
  const anzeige = '§\u00a09999 Abs.\u00a01 ZPO';
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: ursprung.length - 1 }),
      fc.integer({ min: 1, max: ursprung.length }),
      (a, b) => {
        const von = Math.min(a, b - 1);
        const bis = Math.max(a + 1, b);
        const host = dom(<TextAnzeige text={ursprung} hervorhebungen={[{ von, bis }]} />);
        expect(host.textContent).toBe(anzeige);
        expect([...host.querySelectorAll('strong')].map((n) => n.textContent).join('')).toBe(
          anzeige.slice(von, bis),
        );
        expect(
          [...host.querySelectorAll('[style="white-space:nowrap"]')].map((n) => n.textContent),
        ).toEqual(['§\u00a09999', 'Abs.\u00a01']);
      },
    ),
  );
});
