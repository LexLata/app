// importindex.index.test.ts
// Benennbare Verzeichnisverträge und Diagnosen über die Modulgrenze.
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
const { europa } = vi.hoisted(() => ({ europa: vi.fn() }));
vi.mock('./europaVerzeichnis', () => ({
  leseEuropaVerzeichnis: vi.fn(),
  leseEuropaVerzeichnisMitDiagnosen: europa,
}));
import { leseReferenzVerzeichnis, type VerzeichnisFehler } from './importindex.index';
import type { ReferenzQuelle, VerzeichnisErgebnis } from './importindexVertrag.types';
describe('importindex-Fassade', () => {
  it('reicht Europa-Teilfehler durch und macht Vertragstypen benennbar', async () => {
    expectTypeOf<ReferenzQuelle>().toEqualTypeOf<'de-bund' | 'de-bw' | 'eu'>();
    expectTypeOf<VerzeichnisErgebnis['fehler']>().toEqualTypeOf<VerzeichnisFehler[]>();
    const ergebnis: VerzeichnisErgebnis = {
      eintraege: [],
      fehler: [{ quelle: 'eu', meldung: 'Datei fehlt' }],
    };
    europa.mockResolvedValue(ergebnis);
    expect(await leseReferenzVerzeichnis('eu')).toBe(ergebnis);
  });
});
