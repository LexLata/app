import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseZitat } from '@/lib/markierungen/zitat/zitat.index';

const KURZTITEL_POOL = ['BGB', 'StGB', 'ZPO', 'GG', 'HGB', 'StPO'];

interface Segment {
  zahlen: number[];
  kurztitel: string | undefined;
}

const segmentArb: fc.Arbitrary<Segment> = fc.record({
  zahlen: fc.array(fc.integer({ min: 1, max: 999 }), { minLength: 1, maxLength: 3 }),
  kurztitel: fc.option(fc.constantFrom(...KURZTITEL_POOL), { nil: undefined }),
});

function baueText(segmente: Segment[]): string {
  return segmente
    .map((s) => s.zahlen.join(', ') + (s.kurztitel !== undefined ? ` ${s.kurztitel}` : ''))
    .join('; ');
}

describe('Gesetzeszuordnung über Semikolonsegmente', () => {
  it('jede Norm erhält genau den Kurztitel ihres Semikolonsegments oder keinen', () => {
    fc.assert(
      fc.property(fc.array(segmentArb, { minLength: 1, maxLength: 4 }), (segmente) => {
        const text = baueText(segmente);
        const { zitate } = parseZitat(text);

        const erwartet = segmente.flatMap((s) => s.zahlen.map(() => s.kurztitel));
        const tatsaechlich = zitate.map((zitat) => zitat.gesetzRoh);

        expect(tatsaechlich).toEqual(erwartet);
      }),
    );
  });
});
