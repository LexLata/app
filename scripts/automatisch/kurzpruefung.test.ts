// kurzpruefung.test.ts
// Prüft die öffentliche Prüfplanung an echten temporären Git-Arbeitsständen.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { kurzpruefungPlanen } from './kurzpruefung.mjs';

let ordner: string;
function git(...args: string[]) {
  return execFileSync('git', args, { cwd: ordner, encoding: 'utf8' });
}
function schreiben(pfad: string, inhalt = '// geändert\n') {
  mkdirSync(dirname(join(ordner, pfad)), { recursive: true });
  writeFileSync(join(ordner, pfad), inhalt);
}
beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'lexlata-kurzpruefung-'));
  git('init', '-q');
  schreiben('src/beispiel.ts', 'export const zahl = 1;\n');
  schreiben('src/beispiel.test.ts');
  schreiben('scripts/automatisch/beispiel.test.ts');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Basis');
});
afterEach(() => rmSync(ordner, { recursive: true, force: true }));

it('erfasst staged, unstaged und ungetrackte Dateien einschließlich Leerzeichen', () => {
  schreiben('src/beispiel.ts');
  git('add', 'src/beispiel.ts');
  schreiben('src/beispiel.test.ts', '// unstaged\n');
  schreiben('src/neu mit leerzeichen.test.ts');
  const plan = kurzpruefungPlanen(ordner);
  expect(plan.dateien).toEqual([
    'src/beispiel.test.ts',
    'src/beispiel.ts',
    'src/neu mit leerzeichen.test.ts',
  ]);
  expect(plan.tests).toBe('betroffen');
  expect(plan.rust).toBe(false);
  expect(plan.lint).toEqual(plan.dateien);
});
it('prüft bei Skriptlogik auch dynamisch aufrufende Skripttests', () => {
  schreiben('scripts/automatisch/beispiel.mjs');
  const plan = kurzpruefungPlanen(ordner);
  expect(plan.testDateien).toContain('scripts/automatisch/beispiel.test.ts');
  expect(plan.testDateien).toContain('scripts/automatisch/beispiel.mjs');
});
it('prüft bei Quellcode auch Skripttests ohne Importbeziehung und führt keine Datei doppelt', () => {
  schreiben('src/beispiel.ts');
  schreiben('scripts/automatisch/beispiel.test.ts', '// ebenfalls geändert\n');
  const plan = kurzpruefungPlanen(ordner);
  expect(plan.tests).toBe('betroffen');
  expect(plan.testDateien).toEqual(['scripts/automatisch/beispiel.test.ts', 'src/beispiel.ts']);
});
it('nimmt bei alleiniger Quellcodeänderung auch unveränderte Skripttests auf', () => {
  schreiben('src/beispiel.ts');
  expect(kurzpruefungPlanen(ordner).testDateien).toEqual([
    'src/beispiel.ts',
    'scripts/automatisch/beispiel.test.ts',
  ]);
});
it.each(['einzeln', 'mit Quellcode', 'gelöscht'])(
  'prüft die fachliche Beispielmatrix %s gezielt',
  (fall) => {
    const dokument = 'docs/doku/markierungskonflikte.md';
    schreiben(dokument, 'Beispielmatrix\n');
    if (fall === 'gelöscht') {
      git('add', dokument);
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-qm',
        'Matrix',
      );
      unlinkSync(join(ordner, dokument));
    }
    if (fall === 'mit Quellcode') schreiben('src/beispiel.ts');
    const plan = kurzpruefungPlanen(ordner);
    expect(plan.tests).toBe('betroffen');
    expect(plan.testDateien).toContain(
      'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
    );
    expect(plan.rust).toBe(false);
    expect(plan.lint).toEqual(fall === 'mit Quellcode' ? ['src/beispiel.ts'] : []);
  },
);
it.each([
  'ressourcen/schema.rng',
  'package-lock.json',
  'eslint-rules/regel.cjs',
  '.husky/pre-commit',
  'unbekannt.xyz',
])('erweitert bei nicht sicher zuordenbarer Änderung %s auf vollständige Prüfklassen', (pfad) => {
  schreiben(pfad);
  expect(kurzpruefungPlanen(ordner)).toMatchObject({ tests: 'alle', lint: 'alle', rust: true });
});
it('erweitert bei Löschung und Umbenennung einschließlich alter Pfade auf alle Tests', () => {
  git('mv', 'src/beispiel.ts', 'src/umbenannt.ts');
  unlinkSync(join(ordner, 'src/beispiel.test.ts'));
  const plan = kurzpruefungPlanen(ordner);
  expect(plan.tests).toBe('alle');
  expect(plan.dateien).toContain('src/beispiel.ts');
  expect(plan.dateien).toContain('src/umbenannt.ts');
  expect(plan.lint).toEqual(['src/umbenannt.ts']);
});
it('lässt nur bei bekannter reiner Dokumentation Tests und Rust bewusst aus', () => {
  schreiben('docs/hinweis.md');
  expect(kurzpruefungPlanen(ordner)).toMatchObject({ tests: 'keine', lint: [], rust: false });
});
it('erweitert ohne lesbaren Git-Vergleich auf vollständige Prüfklassen', () => {
  rmSync(join(ordner, '.git'), { recursive: true, force: true });
  expect(kurzpruefungPlanen(ordner)).toMatchObject({ tests: 'alle', lint: 'alle', rust: true });
});
it('lässt bei reinem Rust alle Vitest-Tests und Rustprüfungen laufen', () => {
  schreiben('src-tauri/src/lib.rs');
  expect(kurzpruefungPlanen(ordner)).toMatchObject({ tests: 'alle', lint: [], rust: true });
});

it('führt eine geänderte Testdatei über den echten Vitest-related-Aufruf aus', () => {
  schreiben(
    'src/beispiel.test.ts',
    `import { expect, it } from 'vitest';
import { zahl } from './beispiel';
it('prüft die Zahl', () => expect(zahl).toBe(1));`,
  );
  // Der echte Vitest-Aufruf prüft den öffentlichen CLI-Vertrag für Testdateien.
  const vitest = join(process.cwd(), 'node_modules/vitest/vitest.mjs');
  schreiben('vitest.config.mjs', 'export default { test: { include: ["src/**/*.test.ts"] } };');
  const ausgabe = execFileSync(
    process.execPath,
    [vitest, 'related', '--run', 'src/beispiel.test.ts'],
    {
      cwd: ordner,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: join(process.cwd(), 'node_modules') },
    },
  );
  expect(ausgabe).toContain('1 passed');
});

function cliVorbereiten() {
  for (const name of ['pruefen.mjs', 'kurzpruefung.mjs', 'wegwerf-heimat.mjs']) {
    const ziel = join(ordner, 'scripts/automatisch', name);
    copyFileSync(new URL(`./${name}`, import.meta.url), ziel);
  }
  schreiben(
    'npm.cjs',
    `console.log('NPM ' + process.argv.slice(2).join(' '));
    if (process.argv.includes(process.env.FEHLER_PRUEFUNG)) process.exit(2);`,
  );
  const werkzeug = `console.log('WERKZEUG ' + JSON.stringify(process.argv.slice(2)));
    if (process.env.FEHLER_WERKZEUG) process.exit(1);`;
  schreiben('node_modules/vitest/vitest.mjs', werkzeug);
  schreiben('node_modules/eslint/bin/eslint.js', werkzeug);
  schreiben('.gitignore', 'node_modules/\n.reports/\n');
  schreiben(
    'package.json',
    JSON.stringify({
      scripts: {
        pruefen: 'node scripts/automatisch/pruefen.mjs',
        vollpruefen: 'node scripts/automatisch/pruefen.mjs --voll',
        'pruefen:typen': 'tsc',
        'pruefen:tests': 'vitest run',
        'pruefen:rust': 'cargo test',
        'pruefen:rust-clippy': 'cargo clippy',
        'pruefen:lint': 'hook',
        'pruefen:lint-voll': 'eslint .',
        'pruefen:projekt': 'projekt',
      },
    }),
  );
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    'Prüfwerkzeuge',
  );
}
function cli(args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['scripts/automatisch/pruefen.mjs', ...args], {
    cwd: ordner,
    encoding: 'utf8',
    env: { ...process.env, npm_execpath: join(ordner, 'npm.cjs'), ...env },
  });
}
function echtesVitestVorbereiten(testDatei: string) {
  schreiben(
    'node_modules/vitest/vitest.mjs',
    `await import(${JSON.stringify(pathToFileURL(join(process.cwd(), 'node_modules/vitest/vitest.mjs')).href)});`,
  );
  schreiben(
    'vitest.config.mjs',
    `export default { test: { include: [${JSON.stringify(testDatei)}] } };`,
  );
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Vitest');
}
it('führt im CLI bei Ruständerungen auch Vitest und beide Rustprüfungen aus', () => {
  cliVorbereiten();
  schreiben('src-tauri/src/lib.rs');
  expect(cli().status).toBe(0);
  const log = readFileSync(join(ordner, '.reports/pruefen/letzter-lauf.log'), 'utf8');
  expect(log).toContain('NPM run pruefen:tests');
  expect(log).toContain('NPM run pruefen:rust\n');
  expect(log).toContain('NPM run pruefen:rust-clippy');
});
it('führt bei Quellcodeänderungen einen tatsächlich dateilesenden Skripttest ohne Import aus', () => {
  cliVorbereiten();
  schreiben(
    'scripts/automatisch/beispiel.test.ts',
    `import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('liest den Quellcodevertrag', () => expect(readFileSync('src/beispiel.ts', 'utf8')).toContain('zahl = 2'));`,
  );
  echtesVitestVorbereiten('scripts/automatisch/beispiel.test.ts');
  schreiben('src/beispiel.ts', 'export const zahl = 2;\n');
  expect(cli().status).toBe(0);
  const log = readFileSync(join(ordner, '.reports/pruefen/letzter-lauf.log'), 'utf8');
  expect(log).toContain('1 passed');
});
it.each([false, true])(
  'führt im CLI den Beispielmatrixtest bei Dokumentänderung aus (gelöscht: %s)',
  (geloescht) => {
    cliVorbereiten();
    const dokument = 'docs/doku/markierungskonflikte.md';
    schreiben(dokument, 'vorher\n');
    schreiben(
      'scripts/automatisch/markierungskonflikte-beispiele.test.ts',
      `import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('liest die Beispielmatrix', () => expect(readFileSync('${dokument}', 'utf8')).toContain('nachher'));`,
    );
    echtesVitestVorbereiten('scripts/automatisch/markierungskonflikte-beispiele.test.ts');
    if (geloescht) unlinkSync(join(ordner, dokument));
    else schreiben(dokument, 'nachher\n');
    const ergebnis = cli();
    expect(ergebnis.status).toBe(geloescht ? 1 : 0);
    const log = readFileSync(join(ordner, '.reports/pruefen/letzter-lauf.log'), 'utf8');
    expect(log).toContain('markierungskonflikte-beispiele.test.ts');
    expect(log).toContain(geloescht ? 'ENOENT' : '1 passed');
  },
);
it('grenzt im CLI Tests und Lint ein, behält Typen und Projektprüfungen und trennt Protokolle', () => {
  cliVorbereiten();
  schreiben('src/beispiel.ts');
  const ergebnis = cli();
  expect(ergebnis.status).toBe(0);
  const kurzLog = readFileSync(join(ordner, '.reports/pruefen/letzter-lauf.log'), 'utf8');
  expect(kurzLog).toContain('NPM run pruefen:typen');
  expect(kurzLog).toContain('NPM run pruefen:projekt');
  expect(kurzLog).toContain(
    '["related","--run","src/beispiel.ts","scripts/automatisch/beispiel.test.ts"]',
  );
  expect(kurzLog).toContain('["--max-warnings","0","--no-warn-ignored","src/beispiel.ts"]');
  expect(kurzLog).not.toContain('NPM run pruefen:rust');
  expect(cli(['--voll']).status).toBe(0);
  const vollLog = readFileSync(join(ordner, '.reports/vollpruefen/letzter-lauf.log'), 'utf8');
  expect(vollLog).toContain('Aufruf: npm run vollpruefen');
  expect([...vollLog.matchAll(/NPM run ([^\n]+)/g)].map((treffer) => treffer[1])).toEqual([
    'pruefen:typen',
    'pruefen:tests',
    'pruefen:rust',
    'pruefen:rust-clippy',
    'pruefen:lint-voll',
    'pruefen:projekt',
  ]);
  expect(readFileSync(join(ordner, '.reports/pruefen/letzter-lauf.log'), 'utf8')).toBe(kurzLog);
});
it('meldet Werkzeugfehler auch im ausführlichen Kurzlauf und führt folgende Prüfungen aus', () => {
  cliVorbereiten();
  schreiben('src/beispiel.test.ts', '// verändert\n');
  const ergebnis = cli(['--ausfuehrlich'], { FEHLER_WERKZEUG: '1' });
  expect(ergebnis.status).toBe(1);
  expect(ergebnis.stdout).toContain('WERKZEUG');
  expect(ergebnis.stdout).toContain('NPM run pruefen:projekt');
  expect(ergebnis.stdout).toContain('2 von 4 Prüfungen fehlgeschlagen.');
  expect(existsSync(join(ordner, '.reports/pruefen/letzter-lauf.log'))).toBe(false);
});

it('behält staged Änderungen auch bei gegenläufiger Änderung im Arbeitsbaum', () => {
  schreiben('src/beispiel.ts', 'export const zahl = 2;\n');
  git('add', 'src/beispiel.ts');
  schreiben('src/beispiel.ts', 'export const zahl = 1;\n');
  expect(kurzpruefungPlanen(ordner).dateien).toEqual(['src/beispiel.ts']);
});

it('nennt beim Größenfallback den tatsächlich vollständigen Lintumfang', () => {
  cliVorbereiten();
  for (let nummer = 0; nummer < 100; nummer++) schreiben(`src/datei-${nummer}.ts`);
  const ergebnis = cli();
  expect(ergebnis.status).toBe(0);
  expect(ergebnis.stdout).toContain('Lint: alle');
  const log = readFileSync(join(ordner, '.reports/pruefen/letzter-lauf.log'), 'utf8');
  expect(log).toContain('NPM run pruefen:lint-voll');
});
