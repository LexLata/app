// @vitest-environment jsdom
// euKopfangaben.test.ts
// Amtliche Fundstellen werden ausschließlich aus den eigenen Veröffentlichungsdaten gelesen.
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { expect, it } from 'vitest';
import { konvertiereEuQuelle } from './euKonvertierung';

it.each([
  ['02016R0679-20160504', 'ABl. L 119 vom 4.5.2016, S. 1'],
  ['32024R1689', 'ABl. L, 2024/1689 vom 12.7.2024'],
  ['02024R1689-20260727', 'ABl. L, 2024/1689'],
])('liest die mitgelieferte Fundstelle aus %s', (datei, erwartet) => {
  const archiv = new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${datei}.fmx4`));
  const result = konvertiereEuQuelle(
    { kurztitel: 'G', langtitel: 'Gesetz', abrufkennung: '32024R1689' },
    {
      archive: { original: archiv },
      herkunft: {
        basisCelex: '32024R1689',
        celex: datei,
        fassung: 'original',
        ergaenzung: 'nicht-noetig',
      },
    },
    new Date(),
  );
  if ('fehler' in result) throw new Error(result.fehler.meldung);
  expect(
    new DOMParser().parseFromString(result.xml, 'application/xml').querySelector('fundstelle')
      ?.textContent,
  ).toBe(erwartet);
  expect(result.xml).not.toContain('<aenderungsvermerk>');
});
it('lässt die Fundstelle bei fehlenden eigenen Veröffentlichungsdaten weg, auch wenn der Text andere Amtsblattzitate enthält', () => {
  const archiv = unzipSync(
    new Uint8Array(readFileSync('src/lib/import/eu/testdaten/formex/02016R0679-20160504.fmx4')),
  );
  for (const [name, bytes] of Object.entries(archiv)) {
    if (name.endsWith('.doc.xml'))
      archiv[name] = strToU8(
        strFromU8(bytes).replace(/<PUBLICATION\.REF[\s\S]*?<\/PUBLICATION\.REF>/, ''),
      );
  }
  const result = konvertiereEuQuelle(
    { kurztitel: 'G', langtitel: 'Gesetz', abrufkennung: '32016R0679' },
    {
      archive: { original: zipSync(archiv) },
      herkunft: {
        basisCelex: '32016R0679',
        celex: '32016R0679',
        fassung: 'original',
        ergaenzung: 'nicht-noetig',
      },
    },
    new Date(),
  );
  if ('fehler' in result) throw new Error(result.fehler.meldung);
  expect(result.xml).not.toContain('<fundstelle>');
});
