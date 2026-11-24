// Prüft den regulären Bestandsaudit einschließlich Ausnahmen und Fehlerstatus.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, symlink, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const wurzel = join(import.meta.dirname, '../..');
async function lauf(
  config: string | null,
  eslintStart?: string,
  code = 'export const ausgabe = <span>Hallo</span>;',
  leer = false,
  nurAusnahmekontrolle = false,
) {
  const ordner = await mkdtemp(join(tmpdir(), 'lexlata-textaudit-'));
  try {
    await mkdir(join(ordner, 'scripts/audit'), { recursive: true });
    await mkdir(join(ordner, 'scripts/automatisch'), { recursive: true });
    await cp(
      join(wurzel, 'scripts/automatisch/textanzeige-ausnahmen.mjs'),
      join(ordner, 'scripts/automatisch/textanzeige-ausnahmen.mjs'),
    );
    await mkdir(join(ordner, 'src/components'), { recursive: true });
    await cp(
      join(wurzel, 'scripts/audit/audit-eslint.sh'),
      join(ordner, 'scripts/audit/audit-eslint.sh'),
    );
    await cp(
      join(wurzel, 'scripts/audit/audit-eslint.mjs'),
      join(ordner, 'scripts/audit/audit-eslint.mjs'),
    );
    if (eslintStart !== undefined && eslintStart !== 'fehlend') {
      await writeFile(join(ordner, 'scripts/audit/audit-eslint.mjs'), eslintStart);
    }
    await writeFile(join(ordner, 'package.json'), '{"type":"module"}');
    if (!leer) await writeFile(join(ordner, 'src/components/Anzeige.tsx'), code);
    if (eslintStart === undefined)
      await symlink(join(wurzel, 'node_modules'), join(ordner, 'node_modules'), 'junction');
    else {
      await mkdir(join(ordner, 'node_modules/eslint/bin'), { recursive: true });
      if (eslintStart !== 'fehlend')
        await writeFile(join(ordner, 'node_modules/eslint/bin/eslint.js'), eslintStart);
    }
    if (config !== null) await writeFile(join(ordner, 'eslint.config.js'), config);
    const ergebnis = nurAusnahmekontrolle
      ? spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '--eval',
            `
          import { pruefeAusnahmedateien } from './scripts/automatisch/textanzeige-ausnahmen.mjs';
          const { fehler } = await pruefeAusnahmedateien(['src/components/Anzeige.tsx']);
          for (const meldung of fehler) console.error(meldung);
          process.exitCode = fehler.length > 0 ? 1 : 0;
        `,
          ],
          { cwd: ordner, encoding: 'utf8' },
        )
      : spawnSync('bash', ['scripts/audit/audit-eslint.sh'], { cwd: ordner, encoding: 'utf8' });
    const bericht = await readFile(join(ordner, '.reports/eslint.txt'), 'utf8').catch(() => '');
    return { ...ergebnis, bericht };
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}
const parser = `import tseslint from ${JSON.stringify(join(wurzel, 'node_modules/typescript-eslint/dist/index.js'))};`;
const regel = `import regel from ${JSON.stringify(join(wurzel, 'eslint-rules/textanzeige-verbindlich.cjs'))};`;
const config = `${parser} ${regel} export default [{ files: ['src/**/*.{ts,tsx}'], languageOptions: {parser: tseslint.parser}, plugins: {lexlata: {rules: {'textanzeige-verbindlich': regel}}}, rules: {'lexlata/textanzeige-verbindlich': 'error'}}];`;

describe('Audit der verbindlichen Textanzeige', () => {
  it('meldet einen erfolgreichen Lauf ohne Funde als sauber', async () => {
    const ergebnis = await lauf(config, undefined, 'export const ausgabe = <div/>;');
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.bericht).toContain('Textanzeige-Ausnahmen: 0');
    expect(ergebnis.stdout).toContain('✅');
  });
  it('meldet rohe Providerkinder im gemeinsamen Auditbericht', async () => {
    const ergebnis = await lauf(
      config,
      undefined,
      'import {createContext} from "react"; const C = createContext(null); export const ausgabe = <C.Provider value={null}>{"§ 1 BGB"}</C.Provider>;',
    );
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.bericht).toContain('lexlata/textanzeige-verbindlich');
    expect(ergebnis.bericht).toContain('Siehe docs/doku/umbruchschutz.md');
  });
  it('weist zulässige Ausnahmen sichtbar aus', async () => {
    const ergebnis = await lauf(
      config,
      undefined,
      '// eslint-disable-next-line lexlata/textanzeige-verbindlich -- Reines Symbol: KommentarSymbol zeigt ⓘ.\nexport const ausgabe = <span>ⓘ</span>;',
    );
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.bericht).toContain('KommentarSymbol zeigt ⓘ');
  });
  it('verwirft unbegründete Unterdrückungen unabhängig von ESLint', async () => {
    const ergebnis = await lauf(
      config,
      undefined,
      '// eslint-disable-next-line lexlata/textanzeige-verbindlich\nexport const ausgabe = <span>Hallo</span>;',
    );
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.bericht).toContain('Begründung');
  });
  it('verwirft dateiweite Abschaltung durch ESLint-Regelkonfiguration', async () => {
    const ergebnis = await lauf(
      config,
      undefined,
      '/* eslint lexlata/textanzeige-verbindlich: "off" */\nexport const a = <span>Hallo</span>;',
    );
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.bericht).toContain('nächste Zeile');
    expect(ergebnis.bericht).toContain('UNGÜLTIG');
  });
  it('kontrolliert Ausnahmen auch unabhängig von einer deaktivierten Schutzregel', async () => {
    const inaktiv = config.replace(
      "'lexlata/textanzeige-verbindlich': 'error'",
      "'lexlata/textanzeige-verbindlich': 'off'",
    );
    const ergebnis = await lauf(
      inaktiv,
      undefined,
      '// eslint-disable-next-line lexlata/textanzeige-verbindlich\nexport const a = <span>Hallo</span>;',
      false,
      true,
    );
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.stderr).toContain('Begründung');
    expect(ergebnis.stderr).not.toContain('veraltete Ausnahme');
  });
  it('meldet reguläre Warnungen im gemeinsamen Bericht und Fehlerstatus', async () => {
    const warnconfig = config.replace(
      "rules: {'lexlata/textanzeige-verbindlich': 'error'}",
      "rules: {'lexlata/textanzeige-verbindlich': 'error', 'no-console': 'warn'}",
    );
    const ergebnis = await lauf(warnconfig, undefined, 'console.log("Technik");');
    expect(ergebnis.status).toBe(3);
    expect(ergebnis.bericht).toContain('warning');
    expect(ergebnis.stdout).not.toContain('✅');
  });
  it('verwirft einen leeren Produktionsbestand mit Bericht', async () => {
    const ergebnis = await lauf(config, undefined, '', true);
    expect(ergebnis.status).toBe(2);
    expect(ergebnis.bericht).toContain('Kein Produktionsbestand');
  });

  it('schreibt Regelverletzungen in den gemeinsamen Bericht', async () => {
    const ergebnis = await lauf(config);
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.bericht).toContain('lexlata/textanzeige-verbindlich');
    expect(ergebnis.stdout).toContain('.reports/eslint.txt');
  });
  it.each([
    ['fehlende Konfiguration', null, 'config file'],
    ['kaputte Konfiguration', 'export default [;', 'SyntaxError'],
    ['geleerte Konfiguration', 'export default [];', 'Kein Produktionsbestand'],
    [
      'deaktivierte Regel',
      config.replace(
        "'lexlata/textanzeige-verbindlich': 'error'",
        "'lexlata/textanzeige-verbindlich': 'off'",
      ),
      'nicht aktiviert',
    ],
    [
      'fehlender Regelimport',
      "import regel from './nicht-vorhanden.cjs'; export default [];",
      'nicht-vorhanden',
    ],
    [
      'fehlende Regelregistrierung',
      `${parser} export default [{files: ['src/**/*.tsx'], languageOptions: {parser: tseslint.parser}, plugins: {lexlata: {rules: {}}}, rules: {'lexlata/textanzeige-verbindlich': 'error'}}];`,
      'textanzeige-verbindlich',
    ],
  ])('meldet %s als Fehler statt null Funde', async (_name, inhalt, text) => {
    const ergebnis = await lauf(inhalt);
    expect(ergebnis.status).toBe(2);
    expect(ergebnis.bericht).toContain(text);
    expect(ergebnis.stdout).not.toContain('✅');
  });
  it.each([
    ['fehlendes ESLint', 'fehlend'],
    ['stummer Startfehler', 'process.exit(2);'],
    ['stummer Startfehler mit reserviertem Befundstatus', 'process.exit(3);'],
  ])('meldet %s zuverlässig', async (_name, start) => {
    const ergebnis = await lauf(null, start);
    expect(ergebnis.status).not.toBe(0);
    if (start === 'process.exit(3);') expect(ergebnis.status).toBe(2);
    expect(ergebnis.bericht).toContain('Exit-Code');
    expect(ergebnis.stdout).not.toContain('✅');
  });
  it('hält den Bestandscheck im vollständigen Audit ausdrücklich angeschlossen', async () => {
    const audit = await readFile(join(wurzel, 'scripts/audit/audit.sh'), 'utf8');
    expect(audit).toContain('bash scripts/audit/audit-eslint.sh');
    expect(audit).not.toContain('audit-eslint.sh textanzeige');
    expect(audit).toContain('exit "$eslint_status"');
    execFileSync('bash', ['-n', 'scripts/audit/audit.sh'], { cwd: wurzel });
  });
});

// Führt den gesamten echten Auditstarter aus; fachfremde Werkzeuge sind Attrappen.
it.each([
  [1, 1],
  [2, 2],
  [3, 0],
  [0, 0],
])(
  'Gesamtaudit reicht Text-/Startfehler weiter, übrige Befunde bleiben beratend: %s',
  async (status, erwartet) => {
    const ordner = await mkdtemp(join(tmpdir(), 'lexlata-gesamtaudit-'));
    try {
      await mkdir(join(ordner, 'scripts/audit'), { recursive: true });
      const attrappen = `npx() { return 0; }
node() { return 0; }
python3() { return 0; }
bash() { case "$1" in scripts/audit/audit-eslint.sh) return ${status} ;; *) return 0 ;; esac; }
`;
      await writeFile(
        join(ordner, 'scripts/audit/audit.sh'),
        attrappen + (await readFile(join(wurzel, 'scripts/audit/audit.sh'), 'utf8')),
      );
      const ergebnis = spawnSync('bash', ['scripts/audit/audit.sh'], {
        cwd: ordner,
        encoding: 'utf8',
        env: { ...process.env, PATH: '/usr/bin:/bin' },
      });
      expect(ergebnis.status).toBe(erwartet);
    } finally {
      await rm(ordner, { recursive: true, force: true });
    }
  },
);
