// @vitest-environment jsdom
// ziehvorschau.darstellung.test.ts – Vertrag des eigenständigen Seiteneinstiegs.
import { assert, describe, expect, it } from 'vitest';
import { stelleZiehvorschauDar } from './ziehvorschau.darstellung';

describe('Ziehvorschauseite', () => {
  it('übernimmt Titel und Aussehen und begrenzt lange Titel auf eine Zeile', () => {
    const titel = 'Sehr langer Gesetzeskurztitel '.repeat(30);
    const parameter = new URLSearchParams({
      titel,
      hintergrund: '#112233',
      textfarbe: '#778899',
      schrift: '14px Arial',
      innenabstand: '5px 12px 5px 14px',
      eckenradius: '7px',
    });
    const kaestchen = stelleZiehvorschauDar(document, parameter);
    expect(kaestchen.textContent).toBe(titel);
    expect(kaestchen.style.backgroundColor).toBe('rgb(17, 34, 51)');
    expect(kaestchen.style.border).toBe('');
    expect(kaestchen.style.display).toBe('flex');
    expect(kaestchen.style.alignItems).toBe('center');
    expect(kaestchen.style.borderRadius).toBe('7px');
    expect(kaestchen.style.padding).toBe('0px 12px 0px 14px');
    expect(document.body.style.backgroundColor).toBe('rgb(17, 34, 51)');
    expect(kaestchen.style.color).toBe('rgb(119, 136, 153)');
    expect(kaestchen.style.font).toBe('14px Arial');
    const text = kaestchen.firstElementChild;
    assert(text instanceof HTMLElement);
    expect(text.style.minWidth).toBe('0px');
    expect(text.style.whiteSpace).toBe('nowrap');
    expect(text.style.overflow).toBe('hidden');
    expect(text.style.textOverflow).toBe('ellipsis');
  });
  it('hält Normangaben und übergebene Zeilenumbrüche in derselben Anzeigezeile', () => {
    const titel = '§ 9 BGB\nArt. 3 GG\r\nBGB';
    const kaestchen = stelleZiehvorschauDar(document, new URLSearchParams({ titel }));
    expect(document.body.children).toHaveLength(1);
    expect(document.body.firstElementChild).toBe(kaestchen);
    expect(kaestchen.textContent).toBe(titel);
    const text = kaestchen.firstElementChild;
    assert(text instanceof HTMLElement);
    expect(text.style.minWidth).toBe('0px');
    expect(text.style.whiteSpace).toBe('nowrap');
    expect(text.style.overflow).toBe('hidden');
    expect(text.style.textOverflow).toBe('ellipsis');
    expect(kaestchen.firstElementChild?.children).toHaveLength(0);
  });
  it('bleibt ohne Parameter leer', () => {
    expect(stelleZiehvorschauDar(document, new URLSearchParams()).textContent).toBe('');
  });
  it('stellt übergebenen Text als Text dar', () => {
    const kaestchen = stelleZiehvorschauDar(
      document,
      new URLSearchParams({ titel: '<img src=x onerror=alert(1)>' }),
    );
    expect(kaestchen.firstElementChild?.children).toHaveLength(0);
    expect(kaestchen.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});
