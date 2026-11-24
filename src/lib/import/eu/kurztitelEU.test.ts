// kurztitelEU.test.ts
// Prüft die vereinbarten Nummernregeln unabhängig vom Langtitel.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { leiteKurztitelAb } from './kurztitelEU';
it.each([
  ['32016R0679', 'verordnung', 'VO 2016/679'],
  ['32008R0593', 'verordnung', 'VO 593/2008'],
  ['32004L0038', 'richtlinie', 'RL 2004/38'],
  ['31993L0013', 'richtlinie', 'RL 93/13'],
  ['32019R0947', 'durchfuehrungsverordnung', 'DVO 2019/947'],
  ['32013R0231', 'delegierte-verordnung', 'DelVO 231/2013'],
  ['31971R1408', 'verordnung', 'VO 1408/71'],
  ['32014R0001', 'verordnung', 'VO 1/2014'],
  ['32015R0001', 'verordnung', 'VO 2015/1'],
])('%s → %s', (celex, typ, erwartet) => expect(leiteKurztitelAb(celex, typ)).toBe(erwartet));
it('ist deterministisch, nicht leer und enthält die Nummer ohne führende Nullen', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1960, max: 2099 }),
      fc.integer({ min: 1, max: 99999 }),
      (jahr, nr) => {
        const celex = `3${jahr}R${String(nr).padStart(4, '0')}`;
        const titel = leiteKurztitelAb(celex, 'verordnung');
        expect(titel).toBe(leiteKurztitelAb(celex, 'verordnung'));
        expect(titel.split(' ')[1]!.split('/')).toContain(String(nr));
      },
    ),
  );
});
