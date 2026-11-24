// scripts/automatisch/wegwerf-heimat.test.ts
// Verhaltenstests für das Startskript mit Wegwerf-Heimatordner.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const skript = join(process.cwd(), 'scripts/automatisch/wegwerf-heimat.mjs');

function starten(code: string) {
  return spawnSync(process.execPath, [skript, process.execPath, '-e', code], {
    encoding: 'utf8',
  });
}

it('lenkt HOME und XDG-Ordner in einen temporären Wegwerfordner um und räumt ihn danach auf', () => {
  const ergebnis = starten(
    `const os = require('node:os');
     console.log(JSON.stringify({ home: process.env.HOME, homedir: os.homedir(),
       data: process.env.XDG_DATA_HOME, existiert: require('node:fs').existsSync(process.env.XDG_DATA_HOME) }));`,
  );
  expect(ergebnis.status).toBe(0);
  const werte = JSON.parse(ergebnis.stdout) as Record<string, string | boolean>;
  const heimat = werte.home as string;
  expect(realpathSync.native(join(heimat, '..'))).toBe(realpathSync.native(tmpdir()));
  expect(heimat).toContain('lexlata-test-heimat-');
  expect(heimat).not.toBe(homedir());
  if (process.platform !== 'win32') expect(werte.homedir).toBe(heimat);
  expect(werte.data).toBe(join(heimat, '.local/share'));
  expect(werte.existiert).toBe(true);
  expect(existsSync(heimat)).toBe(false);
});

it('hält Cargo- und Rustup-Ordner auf der echten Heimat fest', () => {
  const ergebnis = spawnSync(
    process.execPath,
    [
      skript,
      process.execPath,
      '-e',
      'console.log(process.env.CARGO_HOME + "|" + process.env.RUSTUP_HOME)',
    ],
    {
      encoding: 'utf8',
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => k !== 'CARGO_HOME' && k !== 'RUSTUP_HOME'),
      ),
    },
  );
  expect(ergebnis.stdout.trim()).toBe(`${join(homedir(), '.cargo')}|${join(homedir(), '.rustup')}`);
});

it('reicht den Exitcode des Befehls durch', () => {
  expect(starten('process.exit(7)').status).toBe(7);
});
