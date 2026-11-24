// adressierbarkeit-messen.mjs
// Offline-Einstieg: optionale Quellordner, Ausgabe als Markdown auf stdout.
import { JSDOM } from 'jsdom';
import { writeFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.Node = window.Node;
try {
  const { messeQuellen, erstelleBericht } = await tsImport(
    './adressierbarkeit.ts',
    import.meta.url,
  );
  const [ordner = 'arbeitsdaten/gesetzesxml'] = process.argv.slice(2);
  if (process.argv.length > 3)
    throw new Error('Aufruf: node scripts/werkzeuge/adressierbarkeit-messen.mjs [Gesetze-Ordner]');
  const ergebnis = await messeQuellen([{ name: 'Präfixlauf', ordner }], console.error);
  if (process.env.LEXLATA_MESSDATEN)
    await writeFile(process.env.LEXLATA_MESSDATEN, JSON.stringify(ergebnis));
  console.log(erstelleBericht(ergebnis));
  if (ergebnis.fehler.length) process.exitCode = 1;
} finally {
  window.close();
}
