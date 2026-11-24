// rust-abgleich.test.ts
// Gleicht Rust-Festlegungen mit dem übrigen Bestand ab: Startaufgaben-Anzahl
// (Rust ↔ Frontend), feste Rust-Version (rust-toolchain.toml ↔ Workflows) und
// dass jeder cargo-Aufruf aus src-tauri/ startet (sonst gilt die Datei nicht).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const lesen = (pfad: string) => readFileSync(pfad, 'utf8');

function startaufgabenAbweichung(rustQuelle: string, tsQuelle: string): string | null {
  const rust = /const STARTAUFGABEN_ANZAHL: u8 = (\d+);/.exec(rustQuelle)?.[1];
  const ts = /export const STARTAUFGABEN_ANZAHL = (\d+);/.exec(tsQuelle)?.[1];
  if (!rust || !ts) return 'STARTAUFGABEN_ANZAHL nicht gefunden';
  return rust === ts ? null : `Rust ${rust}, Frontend ${ts}`;
}

const CARGO_AUFRUF = /(^|[\s|;&(])cargo\s/;

/** Befunde eines Workflows: abweichende Version, cargo-Schritt außerhalb von src-tauri/. */
function workflowBefunde(datei: string, inhalt: string, version: string): string[] {
  const befunde = [...inhalt.matchAll(/^\s*toolchain:\s*(\S+)/gm)]
    .filter(([, gefunden]) => gefunden !== version)
    .map(([, gefunden]) => `${datei}: toolchain ${gefunden} statt ${version}`);
  const schritte = inhalt.replace(/^\s*#.*$/gm, '').split(/^\s*- (?=name:|uses:|run:|id:|if:)/m);
  for (const schritt of schritte) {
    const ohneName = schritt.replace(/^.*\bname:.*$/gm, '');
    if (CARGO_AUFRUF.test(ohneName) && !/^\s*working-directory:\s*src-tauri\s*$/m.test(schritt)) {
      befunde.push(`${datei}: cargo-Aufruf ohne working-directory: src-tauri`);
    }
  }
  return befunde;
}

/** Befunde zur festen Rust-Version; leer, wenn alles passt. */
function toolchainBefunde(
  toolchainToml: string,
  workflows: Record<string, string>,
  skripte: Record<string, string>,
): string[] {
  const version = /^channel\s*=\s*"([^"]+)"/m.exec(toolchainToml)?.[1];
  if (!version) return ['rust-toolchain.toml: channel fehlt'];
  return [
    ...Object.entries(workflows).flatMap(([datei, inhalt]) =>
      workflowBefunde(datei, inhalt, version),
    ),
    ...Object.entries(skripte)
      .filter(([, befehl]) => CARGO_AUFRUF.test(befehl) && !befehl.startsWith('cd src-tauri && '))
      .map(([name]) => `package.json ${name}: cargo-Aufruf nicht aus src-tauri/`),
  ];
}

describe('Startaufgaben-Anzahl', () => {
  it('meldet abweichende Zahlen', () => {
    expect(
      startaufgabenAbweichung(
        'pub(crate) const STARTAUFGABEN_ANZAHL: u8 = 5;',
        'export const STARTAUFGABEN_ANZAHL = 6;',
      ),
    ).toBe('Rust 5, Frontend 6');
    expect(startaufgabenAbweichung('', 'export const STARTAUFGABEN_ANZAHL = 6;')).toBe(
      'STARTAUFGABEN_ANZAHL nicht gefunden',
    );
  });

  it('stimmt im Bestand überein', () => {
    expect(
      startaufgabenAbweichung(
        lesen('src-tauri/src/commands/startaufgaben.rs'),
        lesen('src/hooks/app-start/startaufgaben.ts'),
      ),
    ).toBeNull();
  });
});

describe('feste Rust-Version', () => {
  const toml = '[toolchain]\nchannel = "1.96.0"\n';
  const workflow = (version: string, schritt: string) =>
    `jobs:\n  a:\n    steps:\n      - name: Rust einrichten\n        with:\n          toolchain: ${version}\n${schritt}`;

  it('meldet abweichende Workflow-Version', () => {
    expect(toolchainBefunde(toml, { 'a.yml': workflow('stable', '') }, {})).toEqual([
      'a.yml: toolchain stable statt 1.96.0',
    ]);
  });

  it('meldet cargo-Aufrufe vom Stammordner', () => {
    const vomStamm =
      '      - name: Tests\n        run: cargo test --manifest-path src-tauri/Cargo.toml\n';
    const ausSrcTauri =
      '      - name: Tests\n        working-directory: src-tauri\n        run: cargo test\n';
    expect(toolchainBefunde(toml, { 'a.yml': workflow('1.96.0', vomStamm) }, {})).toEqual([
      'a.yml: cargo-Aufruf ohne working-directory: src-tauri',
    ]);
    expect(toolchainBefunde(toml, { 'a.yml': workflow('1.96.0', ausSrcTauri) }, {})).toEqual([]);
    expect(
      toolchainBefunde(
        toml,
        {},
        {
          a: 'node x.mjs cargo test --manifest-path src-tauri/Cargo.toml',
          b: 'cd src-tauri && cargo clippy',
          c: 'node scripts/werkzeuge/drittlizenzen.mjs',
        },
      ),
    ).toEqual(['package.json a: cargo-Aufruf nicht aus src-tauri/']);
  });

  it('ist im Bestand eingehalten', () => {
    const ordner = '.github/workflows';
    const workflows = Object.fromEntries(
      readdirSync(ordner)
        .filter((datei) => datei.endsWith('.yml'))
        .map((datei) => [datei, lesen(join(ordner, datei))]),
    );
    const skripte = (JSON.parse(lesen('package.json')) as { scripts: Record<string, string> })
      .scripts;
    expect(toolchainBefunde(lesen('src-tauri/rust-toolchain.toml'), workflows, skripte)).toEqual(
      [],
    );
  });
});
