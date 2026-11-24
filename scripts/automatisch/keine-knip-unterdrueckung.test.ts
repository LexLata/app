import { describe, expect, it } from 'vitest';

import { findeKnipUnterdrueckungen } from './keine-knip-unterdrueckung.mjs';

const at = '@';

describe('findeKnipUnterdrueckungen', () => {
  it.each(['public', 'beta', 'alias', 'internal'])('meldet die Knip-Markierung %s', (name) => {
    expect(
      findeKnipUnterdrueckungen([
        { pfad: 'src/beispiel.ts', inhalt: `/** ${at}${name} */\nexport const wert = 1;` },
      ]),
    ).toEqual([{ pfad: 'src/beispiel.ts', zeile: 1, markierung: `${at}${name}` }]);
  });

  it('meldet alle Fundstellen mit ihrer Zeile', () => {
    const funde = findeKnipUnterdrueckungen([
      {
        pfad: 'src/beispiel.ts',
        inhalt: `export const eins = 1;\n/** ${at}public */\n/** ${at}alias andererName */`,
      },
    ]);

    expect(funde).toEqual([
      { pfad: 'src/beispiel.ts', zeile: 2, markierung: `${at}public` },
      { pfad: 'src/beispiel.ts', zeile: 3, markierung: `${at}alias` },
    ]);
  });

  it('akzeptiert ähnliche, aber nicht verbotene Bezeichner', () => {
    expect(
      findeKnipUnterdrueckungen([
        {
          pfad: 'src/beispiel.ts',
          inhalt: `/** ${at}publicApi */\n/** ${at}betaVersion */\n/** ${at}aliases */`,
        },
      ]),
    ).toEqual([]);
  });
});
