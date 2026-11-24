// praefixstrukturLadegrenze.test.ts
// Die Suchfassade lädt den Prüflauf erst auf ausdrücklichen Aufruf.
import { expect, it, vi } from 'vitest';
vi.mock('./praefixlauf', () => {
  throw new Error('Prüflauf geladen');
});
vi.mock('./praefixstrukturErgaenzung', () => ({
  ergaenzePraefixstrukturMitDiagnose: async () => ({ eintraege: [], vollstaendig: true }),
}));
it('hält die Suchoperation unabhängig vom Prüflauf', async () => {
  const fassade = await import('./praefixstruktur.index');
  expect(await fassade.ergaenzePraefixstrukturMitDiagnose('de-bund', [])).toEqual({
    eintraege: [],
    vollstaendig: true,
  });
  await expect(
    fassade.fuehrePraefixlaufAus(
      { modus: 'praefix', normgeber: 'de-bund', anzahl: 1 },
      {} as never,
    ),
  ).rejects.toMatchObject({ cause: { message: 'Prüflauf geladen' } });
});
