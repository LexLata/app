import { describe, it, expect } from 'vitest';
import { parseZitat } from '@/lib/markierungen/zitat/zitat.index';

describe('Gesetzeszuordnung beim Parse', () => {
  it.each([
    ['434, 90 ZVG', ['434', '90'], ['ZVG', 'ZVG']],
    ['1 Abs 1 GG, 3, 5', ['1', '3', '5'], ['GG', undefined, undefined]],
    ['§ 3, § 4 ZPO', ['3', '4'], [undefined, 'ZPO']],
    ['Art. 229 § 2 EGBGB', ['229 2'], ['EGBGB']],
    ['Art. 229 6 Var. 1 EGBGB', ['229 6'], ['EGBGB']],
    ['§ 280 Abs. 1 BGB analog', ['280'], ['BGB']],
    ['GG, 1', ['', '1'], ['GG', undefined]],
    ['§ 3 BGB; § 4', ['3', '4'], ['BGB', undefined]],
    ['3; GG', ['3', ''], [undefined, 'GG']],
    ['GG, StGB', ['', ''], ['GG', 'StGB']],
  ])('%s', (text, normzahlen, gesetze) => {
    const { zitate } = parseZitat(text);
    expect(zitate.map((zitat) => zitat.normzahlRoh)).toEqual(normzahlen);
    expect(zitate.map((zitat) => zitat.gesetzRoh)).toEqual(gesetze);
    for (const [index, zitat] of zitate.entries()) {
      expect(Object.hasOwn(zitat, 'gesetzRoh')).toBe(gesetze[index] !== undefined);
      expect(zitat.ohneZiel && zitat.ganzesGesetz).toBeFalsy();
      expect(zitat.textStart).toBe(index === 0 ? 0 : zitate[index - 1]!.textEnde);
    }
    expect(zitate.at(-1)?.textEnde).toBe(text.length);
  });

  it('ordnet reinen Zusatzangaben ohne Ziel keinen Kurztitel zu', () => {
    const { zitate } = parseZitat('Abs. 3 GG');
    expect(zitate).toHaveLength(2);
    expect(zitate[0]).toMatchObject({ ohneZiel: true });
    expect(Object.hasOwn(zitate[0]!, 'gesetzRoh')).toBe(false);
    expect(zitate[1]).toMatchObject({ gesetzRoh: 'GG', ganzesGesetz: true });
  });
});
