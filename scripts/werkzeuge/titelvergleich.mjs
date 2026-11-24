// titelvergleich.mjs
// Aufruf: npm run titelvergleich -- hin <erste.xml> <zweite.xml>   |   -- zurueck <vergleich.md>
import { resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';

const { titelvergleichHin, titelvergleichZurueck } = await tsImport(
  './titelvergleichAblauf.ts',
  import.meta.url,
);
const [richtung, ...pfade] = process.argv.slice(2);
// npm wechselt ins Paketverzeichnis; INIT_CWD ist das Verzeichnis des Aufrufs.
const absolut = (pfad) => resolve(process.env.INIT_CWD ?? process.cwd(), pfad);
try {
  let ausgabe;
  if (richtung === 'hin' && pfade.length === 2) ausgabe = titelvergleichHin(...pfade.map(absolut));
  else if (richtung === 'zurueck' && pfade.length === 1)
    ausgabe = titelvergleichZurueck(absolut(pfade[0]));
  else {
    throw new Error(
      'Aufruf: npm run titelvergleich -- hin <erste.xml> <zweite.xml>\n' +
        '        npm run titelvergleich -- zurueck <vergleich.md>',
    );
  }
  console.log(`Geschrieben: ${ausgabe}`);
} catch (fehler) {
  console.error(fehler.message);
  process.exitCode = 1;
}
