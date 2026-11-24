// Die fremde BW-Metadatenstruktur wird vor jedem Feldzugriff geprüft.
import { expect, it, vi } from 'vitest';
import { liesJurisLinkMeta } from './importindexErstellungBW.parsing';
it('liest vollständige Metadaten', () => {
  expect(liesJurisLinkMeta('{"linkMeta":{"docId":"abc","part":"R"}}')).toEqual({
    linkMeta: { docId: 'abc', part: 'R' },
  });
});
it.each([
  '',
  '{',
  'null',
  '[]',
  '{}',
  '{"linkMeta":{}}',
  '{"linkMeta":{"docId":2,"part":"R"}}',
  '{"linkMeta":{"docId":"abc","part":[]}}',
])('verwirft defekte Metadaten %s', (json) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(liesJurisLinkMeta(json)).toBeNull();
});
