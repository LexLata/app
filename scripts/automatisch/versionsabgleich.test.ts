import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { versionNachziehen, versionPruefen } from './versionsabgleich.mjs';

const CARGO_TOML = `[package]
name = "app"
version = "0.1.0"
edition = "2021"

[lib]
name = "app_lib"
version = "9.9.9"
`;

const CARGO_LOCK = `version = 4

[[package]]
name = "anderes"
version = "0.1.0"

[[package]]
name = "app"
version = "0.1.0"
dependencies = [
 "anderes",
]

[[package]]
name = "app-zusatz"
version = "0.1.0"
`;

function fixture({
  version = '0.1.0',
  lockVersion = version,
  toml = CARGO_TOML,
  lock = CARGO_LOCK,
  tauriVersion = '../package.json' as string | null,
} = {}) {
  const wurzel = mkdtempSync(join(tmpdir(), 'versionsabgleich-'));
  mkdirSync(join(wurzel, 'src-tauri'));
  writeFileSync(
    join(wurzel, 'package.json'),
    JSON.stringify({ name: 'app', version, private: true }, null, 2) + '\n',
  );
  writeFileSync(
    join(wurzel, 'package-lock.json'),
    JSON.stringify(
      {
        name: 'app',
        version: lockVersion,
        lockfileVersion: 3,
        requires: true,
        packages: { '': { name: 'app', version: lockVersion } },
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(join(wurzel, 'src-tauri/Cargo.toml'), toml);
  writeFileSync(join(wurzel, 'src-tauri/Cargo.lock'), lock);
  writeFileSync(
    join(wurzel, 'src-tauri/tauri.conf.json'),
    JSON.stringify({ productName: 'App', version: tauriVersion }),
  );
  return wurzel;
}

const lesen = (wurzel: string, pfad: string) => readFileSync(join(wurzel, pfad), 'utf8');

describe('versionNachziehen', () => {
  it('überträgt die package.json-Version nur in [package] und den App-Eintrag der Cargo.lock', () => {
    const wurzel = fixture({ version: '0.3.2' });
    versionNachziehen(wurzel);
    expect(lesen(wurzel, 'src-tauri/Cargo.toml')).toBe(
      CARGO_TOML.replace('version = "0.1.0"', 'version = "0.3.2"'),
    );
    expect(lesen(wurzel, 'src-tauri/Cargo.lock')).toBe(
      CARGO_LOCK.replace('name = "app"\nversion = "0.1.0"', 'name = "app"\nversion = "0.3.2"'),
    );
  });

  it('bricht ab, wenn der App-Eintrag in Cargo.lock fehlt', () => {
    const wurzel = fixture({ lock: 'version = 4\n' });
    expect(() => versionNachziehen(wurzel)).toThrow(/Cargo\.lock/);
  });
});

describe('versionPruefen', () => {
  it('meldet nichts bei übereinstimmenden Angaben', () => {
    expect(versionPruefen(fixture())).toEqual([]);
  });

  it('meldet abweichende package-lock.json', () => {
    const meldungen = versionPruefen(fixture({ version: '0.2.0', lockVersion: '0.1.0' }));
    expect(meldungen.join('\n')).toMatch(/package-lock\.json/);
  });

  it('meldet abweichende Cargo.toml und Cargo.lock', () => {
    const meldungen = versionPruefen(fixture({ version: '0.2.0', lockVersion: '0.2.0' }));
    expect(meldungen).toHaveLength(2);
    expect(meldungen.join('\n')).toMatch(/Cargo\.toml[\s\S]*Cargo\.lock/);
  });

  it('meldet tauri.conf.json ohne Verweis auf ../package.json', () => {
    expect(versionPruefen(fixture({ tauriVersion: '0.1.0' })).join('\n')).toMatch(
      /tauri\.conf\.json/,
    );
    expect(versionPruefen(fixture({ tauriVersion: null })).join('\n')).toMatch(/tauri\.conf\.json/);
  });

  it('ist im Projekt selbst stimmig', () => {
    expect(versionPruefen(resolve(__dirname, '../..'))).toEqual([]);
  });
});

describe('npm run versionsnummer im Projektaufbau', () => {
  it('zieht Cargo-Dateien nach, ohne zu committen oder zu taggen', () => {
    const projekt = resolve(__dirname, '../..');
    const wurzel = fixture();
    const pkg = JSON.parse(lesen(wurzel, 'package.json'));
    const { version, versionsnummer } = JSON.parse(lesen(projekt, 'package.json')).scripts;
    pkg.scripts = { version, versionsnummer };
    expect(version).toBeDefined();
    expect(versionsnummer).toBeDefined();
    writeFileSync(join(wurzel, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
    mkdirSync(join(wurzel, 'scripts/automatisch'), { recursive: true });
    writeFileSync(
      join(wurzel, 'scripts/automatisch/versionsabgleich.mjs'),
      lesen(projekt, 'scripts/automatisch/versionsabgleich.mjs'),
    );
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
        cwd: wurzel,
        encoding: 'utf8',
      });
    git('init', '-q');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'start');

    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npm, ['run', 'versionsnummer', '--', '0.4.0'], {
      cwd: wurzel,
      shell: process.platform === 'win32',
      stdio: 'pipe',
    });

    expect(JSON.parse(lesen(wurzel, 'package.json')).version).toBe('0.4.0');
    expect(versionPruefen(wurzel)).toEqual([]);
    expect(git('log', '--oneline').trim().split('\n')).toHaveLength(1);
    expect(git('tag').trim()).toBe('');
    expect(git('status', '--porcelain')).toMatch(/Cargo\.toml/);
  }, 60_000);
});
