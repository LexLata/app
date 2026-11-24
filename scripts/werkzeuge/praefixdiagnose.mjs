// praefixdiagnose.mjs
// Offline-Einstieg mit Browser-DOM; kein Appstart und keine Downloads.
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { tsImport } from 'tsx/esm/api';

const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.Node = window.Node;
try {
  if (process.argv.length !== 2) throw new Error('Aufruf ohne Argumente: npm run praefixdiagnose');
  const { fuehrePraefixdiagnoseAus } = await tsImport(
    './praefixdiagnoseAuswertung.ts',
    import.meta.url,
  );
  const { faelle } = await fuehrePraefixdiagnoseAus(
    fileURLToPath(new URL('../../', import.meta.url)),
    console.log,
  );
  if (faelle.some((fall) => fall.fehler)) {
    console.error('Dateifehler im Bericht; Auswertung ist unvollständig.');
    process.exitCode = 1;
  }
} catch (fehler) {
  console.error(fehler instanceof Error ? fehler.message : String(fehler));
  process.exitCode = 1;
} finally {
  window.close();
}
