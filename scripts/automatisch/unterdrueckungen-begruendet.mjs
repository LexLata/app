// Kontrolliert die Form sämtlicher ESLint-Unterdrückungen im Quellbestand.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import tseslint from 'typescript-eslint';

/** Liest echte Kommentare; Direktiven in Zeichenketten zählen nicht. */
export function kontrolliereUnterdrueckungen(code, datei) {
  const { ast } = tseslint.parser.parseForESLint(code, {
    filePath: datei,
    comment: true,
    loc: true,
    ecmaFeatures: { jsx: true },
  });
  const fehler = [];
  for (const kommentar of ast.comments) {
    const direktive = /^(eslint-disable(?:-next-line|-line)?)\b(.*)$/su.exec(
      kommentar.value.trim(),
    );
    if (!direktive) continue;
    const trennung = /\s-{2,}\s/u.exec(direktive[2]);
    const regeln = (trennung ? direktive[2].slice(0, trennung.index) : direktive[2]).trim();
    const begruendung = trennung ? direktive[2].slice(trennung.index + trennung[0].length) : '';
    const gruende = [];
    if (direktive[1] !== 'eslint-disable-next-line')
      gruende.push('Nur eslint-disable-next-line ist erlaubt.');
    if (
      !regeln ||
      regeln.split(',').some((regel) => !/^['"]?[\w@/.-]+['"]?$/u.test(regel.trim()))
    ) {
      gruende.push('Mindestens ein ausdrücklicher Regelname ist erforderlich.');
    }
    if (begruendung.replace(/\s/gu, '').length < 10)
      gruende.push('Begründung nach -- benötigt mindestens 10 Zeichen ohne Leerraum.');
    if (gruende.length)
      fehler.push(
        `${datei}:${kommentar.loc.start.line}:${kommentar.loc.start.column + 1}: ${gruende.join(' ')}`,
      );
  }
  return fehler;
}

/** Prüft die vereinbarten Quellordner und Konfigurationsdateien im Wurzelordner. */
export async function pruefeBestand(wurzel = '.') {
  const endung = /\.(?:ts|tsx|mjs|cjs|js)$/u;
  const dateien = [];
  async function sammle(ordner, rekursiv) {
    for (const eintrag of await readdir(ordner, { withFileTypes: true })) {
      const pfad = join(ordner, eintrag.name);
      if (rekursiv && eintrag.isDirectory()) await sammle(pfad, true);
      else if (eintrag.isFile() && endung.test(eintrag.name)) dateien.push(pfad);
    }
  }
  await sammle(wurzel, false);
  for (const ordner of ['src', 'scripts', 'eslint-rules']) await sammle(join(wurzel, ordner), true);
  const fehler = [];
  for (const datei of dateien.sort())
    fehler.push(...kontrolliereUnterdrueckungen(await readFile(datei, 'utf8'), datei));
  return fehler;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const fehler = await pruefeBestand();
    for (const meldung of fehler) console.error(meldung);
    console.log(`Unterdrückungen: ${fehler.length} Verstöße.`);
    process.exitCode = fehler.length ? 1 : 0;
  } catch (fehler) {
    console.error('Unterdrückungsprüfung fehlgeschlagen:', fehler);
    process.exitCode = 2;
  }
}
