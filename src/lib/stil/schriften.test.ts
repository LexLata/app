// schriften.test.ts
// Die mitgelieferte Serifenschrift wird in Normal und Kursiv beim Dokument angemeldet.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registriereSchriften } from './schriften';

afterEach(() => vi.unstubAllGlobals());

describe('registriereSchriften', () => {
  it('meldet Source Serif 4 in Normal und Kursiv an', () => {
    const angemeldet: { familie: string; quelle: string; stil?: string }[] = [];
    vi.stubGlobal(
      'FontFace',
      class {
        stil?: string;
        constructor(
          readonly familie: string,
          readonly quelle: string,
          beschreibung: { style?: string },
        ) {
          this.stil = beschreibung.style;
        }
      },
    );
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: (face: (typeof angemeldet)[number]) => angemeldet.push(face) },
    });
    registriereSchriften();
    expect(angemeldet.map((face) => `${face.familie}/${face.stil}`).sort()).toEqual([
      'Source Serif 4/italic',
      'Source Serif 4/normal',
    ]);
    expect(angemeldet.every((face) => face.quelle.includes('.woff2'))).toBe(true);
  });

  it('tut ohne FontFace-Unterstützung nichts', () => {
    vi.stubGlobal('FontFace', undefined);
    expect(() => registriereSchriften()).not.toThrow();
  });
});
