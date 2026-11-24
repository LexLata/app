// praefixstrukturen.mjs
// Startet die unsichtbare Entwicklungs-App einmalig mit dem Prüflaufauftrag.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { tsImport } from 'tsx/esm/api';
// Der Leser der Grundbestandsliste nutzt den XML-Parser der App; außerhalb der App über jsdom.
const { window } = new JSDOM('');
globalThis.DOMParser = window.DOMParser;
globalThis.Node = window.Node;
const { bereitePraefixlaufStartVor, bereiteGrundbestandVor } = await tsImport(
  './praefixstrukturenArgumente.ts',
  import.meta.url,
);
const repository = fileURLToPath(new URL('../../', import.meta.url));
/** Startet die App einmal mit dem vorbereiteten Auftrag; liefert den Exitcode. */
function starte(start, npmPfad) {
  return new Promise((fertig) => {
    const kind = spawn(process.execPath, [npmPfad, 'run', ...start.argumente], {
      cwd: repository,
      env: { ...process.env, ...start.umgebung },
      stdio: 'inherit',
    });
    kind.on('error', (fehler) => {
      console.error(fehler.message);
      fertig(1);
    });
    kind.on('exit', (code) => fertig(code ?? 1));
  });
}
try {
  const befehl = process.env.npm_lifecycle_event;
  // npm wechselt ins Paketverzeichnis; INIT_CWD ist das Verzeichnis des Aufrufs.
  const grundbestand =
    befehl === 'grundbestand' &&
    bereiteGrundbestandVor(
      process.argv.slice(2),
      repository,
      process.env.INIT_CWD ?? process.cwd(),
    );
  const start =
    !grundbestand &&
    bereitePraefixlaufStartVor(
      process.argv.slice(2),
      repository,
      befehl === 'gesetzesxml' || befehl === 'quelldateien' ? befehl : 'praefix',
    );
  console.log('Normale Entwicklungs-App vor dem Prüflauf schließen (Port 1420).');
  const npmPfad = process.env.npm_execpath;
  if (!npmPfad) throw new Error('Bitte über npm run praefixstrukturen starten.');
  if (grundbestand) {
    const { fuehreGrundbestandAus } = await tsImport('./grundbestandAblauf.ts', import.meta.url);
    process.exitCode = await fuehreGrundbestandAus(
      grundbestand,
      (s) => starte(s, npmPfad),
      (zeile) => console.log(zeile),
    );
  } else process.exitCode = await starte(start, npmPfad);
} catch (fehler) {
  console.error(fehler.message);
  process.exitCode = 1;
}
