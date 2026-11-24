// pruefe-europa-kuratiert.mjs
// Manuelle Diagnose der echten Ressourcen einschließlich RelaxNG; außerhalb von npm run vollpruefen.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { tsImport } from 'tsx/esm/api';
import { validateXML } from 'xmllint-wasm';
const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.Node = window.Node;
try {
  const lesen = (pfad) => readFile(new URL(`../../${pfad}`, import.meta.url), 'utf8');
  const [liste, eu, bund, bw, schema] = await Promise.all([
    lesen('src-tauri/resources/europa/europaKuratiert.json'),
    ...['eu', 'de-bund', 'de-bw'].map((name) =>
      lesen(`src-tauri/resources/importindizes/${name}.xml`),
    ),
    lesen('docs/schema/importindex.rng'),
  ]);
  const { werteEuropaKuratiertAus } = await tsImport(
    './pruefeEuropaKuratiertAuswertung.ts',
    import.meta.url,
  );
  const ergebnis = await validateXML({
    xml: eu,
    schema,
    extension: 'relaxng',
    maxMemoryPages: 2048,
  });
  const bericht = `EU-Startindex Schema: ${ergebnis.valid ? 'gültig' : `FEHLER ${JSON.stringify(ergebnis.errors)}`}\n${werteEuropaKuratiertAus(liste, eu, bund, bw)}\n`;
  await mkdir(new URL('../../.reports/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../../.reports/europa-kuratiert-diagnose.txt', import.meta.url),
    bericht,
  );
  console.log(bericht);
  if (bericht.includes('FEHLER')) process.exitCode = 1;
} catch (fehler) {
  console.error(String(fehler));
  process.exitCode = 1;
} finally {
  window.close();
}
