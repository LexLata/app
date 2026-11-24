// drittlizenzen.test.ts
// Prüft Erfassung der npm-Produktionsabhängigkeiten, Übernahme der cargo-about-Daten,
// Lizenzbefund und Aufbau der Datei THIRD-PARTY-LICENSES an einem Wegwerf-Aufbau.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  drittlizenzenText,
  lizenzbefund,
  npmKomponenten,
  rustKomponenten,
  standardtexte,
  standardtexteErgaenzen,
  type Komponente,
} from './drittlizenzenAblauf';

let ordner: string;
afterEach(() => rmSync(ordner, { recursive: true, force: true }));

function paketAnlegen(pfad: string, paket: object, dateien: Record<string, string> = {}) {
  mkdirSync(join(ordner, pfad), { recursive: true });
  writeFileSync(join(ordner, pfad, 'package.json'), JSON.stringify(paket));
  for (const [name, inhalt] of Object.entries(dateien))
    writeFileSync(join(ordner, pfad, name), inhalt);
}

describe('npm-Produktionsabhängigkeiten', () => {
  it('erfasst transitive Produktionspakete mit Lizenztext und lässt devDependencies weg', () => {
    ordner = mkdtempSync(join(tmpdir(), 'lexlata-drittlizenzen-'));
    writeFileSync(
      join(ordner, 'package-lock.json'),
      JSON.stringify({
        packages: {
          '': { name: 'app' },
          'node_modules/a': { version: '1.0.0' },
          'node_modules/a/node_modules/b': { version: '2.0.0' },
          'node_modules/werkzeug': { version: '3.0.0', dev: true },
        },
      }),
    );
    paketAnlegen(
      'node_modules/a',
      { name: 'a', version: '1.0.0', license: 'MIT' },
      {
        LICENSE: 'Copyright (c) A\n\nMIT-Text\n',
        'README.md': 'kein Lizenztext',
      },
    );
    paketAnlegen('node_modules/a/node_modules/b', {
      name: 'b',
      version: '2.0.0',
      license: { type: 'ISC' },
      author: { name: 'Bea' },
    });
    paketAnlegen('node_modules/werkzeug', { name: 'werkzeug', version: '3.0.0', license: 'MIT' });

    expect(npmKomponenten(ordner)).toEqual([
      {
        herkunft: 'npm',
        name: 'a',
        version: '1.0.0',
        lizenz: 'MIT',
        lizenztexte: ['Copyright (c) A\n\nMIT-Text'],
      },
      {
        herkunft: 'npm',
        name: 'b',
        version: '2.0.0',
        lizenz: 'ISC',
        lizenztexte: [],
        autoren: 'Bea',
      },
    ]);
  });
});

describe('Rust-Crates aus cargo-about', () => {
  it('übernimmt Lizenztexte je Crate, kennzeichnet Standardtexte und lässt das App-Crate weg', () => {
    ordner = mkdtempSync(join(tmpdir(), 'lexlata-drittlizenzen-'));
    const crate = (name: string, authors: string[] = []) => ({ name, version: '1.0.0', authors });
    const komponenten = rustKomponenten(
      {
        licenses: [
          {
            id: 'MIT',
            text: 'Copyright X\nMIT',
            source_path: '/x/LICENSE',
            used_by: [{ crate: crate('x') }],
          },
          {
            id: 'MIT',
            text: 'MIT-Standard',
            source_path: null,
            used_by: [{ crate: crate('y', ['Yv']) }],
          },
          {
            id: 'AGPL-3.0-or-later',
            text: 'AGPL',
            source_path: null,
            used_by: [{ crate: crate('app') }],
          },
        ],
        crates: [
          { package: { name: 'x', version: '1.0.0' }, license: 'MIT' },
          { package: { name: 'y', version: '1.0.0' }, license: 'MIT OR Apache-2.0' },
          { package: { name: 'app', version: '1.0.0' }, license: 'AGPL-3.0-or-later' },
        ],
      },
      'app',
    );
    expect(komponenten.map((k) => k.name)).toEqual(['x', 'y']);
    expect(komponenten[0]).toEqual({
      herkunft: 'Rust',
      name: 'x',
      version: '1.0.0',
      lizenz: 'MIT',
      lizenztexte: ['Copyright X\nMIT'],
    });
    expect(komponenten[1]).toMatchObject({ lizenztexte: ['MIT-Standard'], autoren: 'Yv' });
    expect(komponenten[1].hinweis).toContain('Standardtext');
  });
});

const k = (teil: Partial<Komponente> & Pick<Komponente, 'name'>): Komponente => ({
  herkunft: 'npm',
  version: '1.0.0',
  lizenz: 'MIT',
  lizenztexte: ['MIT-Text'],
  ...teil,
});

describe('Lizenzbefund', () => {
  it('zählt Lizenz-IDs und markiert Unverträgliches, Fehlendes und Unbekanntes', () => {
    const befund = lizenzbefund([
      k({ name: 'a' }),
      k({ name: 'b', lizenz: 'MIT OR Apache-2.0' }),
      k({ name: 'c', lizenz: 'GPL-2.0-only' }),
      k({ name: 'd', lizenz: 'GPL-2.0-only OR MIT' }),
      k({ name: 'e', lizenz: 'CC-BY-NC-4.0 AND MIT' }),
      k({ name: 'f', lizenz: '' }),
      k({ name: 'g', lizenztexte: [] }),
    ]);
    expect(befund.ids).toEqual([
      ['Apache-2.0', 1],
      ['CC-BY-NC-4.0', 1],
      ['GPL-2.0-only', 2],
      ['MIT', 5],
    ]);
    expect(befund.auffaellig).toEqual([
      'npm c 1.0.0: Lizenz prüfen (GPL-2.0-only)',
      'npm e 1.0.0: Lizenz prüfen (CC-BY-NC-4.0 AND MIT)',
      'npm f 1.0.0: keine Lizenzangabe',
      'npm g 1.0.0: kein Lizenztext gefunden',
    ]);
  });
});

describe('Datei THIRD-PARTY-LICENSES', () => {
  it('sortiert nach Herkunft, Name und Version und fasst gleiche Texte zusammen', () => {
    const text = drittlizenzenText(
      [
        k({ name: 'zeta', herkunft: 'Sonstige', lizenz: 'OFL-1.1', lizenztexte: ['OFL-Text'] }),
        k({ name: 'beta' }),
        k({ name: 'alpha', lizenztexte: [], autoren: 'Al' }),
        k({ name: 'serde', herkunft: 'Rust', lizenztexte: ['MIT-Text', 'Apache-Text'] }),
      ],
      'abc123',
    );
    expect(text).toContain(
      '\nFingerabdruck src-tauri/Cargo.lock (SHA-256, ohne App-Version): abc123\n',
    );
    expect(text).toContain(
      [
        'Rust:',
        '',
        'serde 1.0.0 | MIT | [T1] [T2]',
        '',
        'npm:',
        '',
        'alpha 1.0.0 | MIT | kein Lizenztext im Paket',
        '    Urheber laut Paketangabe: Al',
        'beta 1.0.0 | MIT | [T1]',
        '',
        'Sonstige:',
        '',
        'zeta 1.0.0 | OFL-1.1 | [T3]',
      ].join('\n'),
    );
    expect(text.match(/MIT-Text/g)).toHaveLength(1);
    expect(text.indexOf('[T1]\n---')).toBeLessThan(text.indexOf('[T3]\n---'));
    expect(text.endsWith('OFL-Text\n')).toBe(true);
  });
});

describe('Standardtexte für Pakete ohne Lizenztext', () => {
  const sammlung = standardtexte({
    licenses: [
      { id: 'MIT', text: 'Eigener MIT-Text', source_path: '/a/LICENSE', used_by: [] },
      { id: 'MIT', text: 'MIT-Standard', source_path: null, used_by: [] },
      { id: 'Apache-2.0', text: 'Apache-Standard', source_path: null, used_by: [] },
    ],
    crates: [],
  });
  it('ordnet den Standardtext zu und behält Paket mit eigenem Text unverändert', () => {
    const [ohne, oder, mit] = standardtexteErgaenzen(
      [
        k({ name: 'ohne', lizenztexte: [], autoren: 'Al' }),
        k({ name: 'oder', lizenz: 'ISC OR Apache-2.0', lizenztexte: [] }),
        k({ name: 'mit' }),
      ],
      sammlung,
    );
    expect(ohne).toMatchObject({ lizenztexte: ['MIT-Standard'], autoren: 'Al' });
    expect(ohne.hinweis).toContain('Standardtext');
    expect(oder.lizenztexte).toEqual(['Apache-Standard']);
    expect(mit).toEqual(k({ name: 'mit' }));
  });
  it.each(['ISC', 'MIT AND ISC', ''])('bricht ohne Standardtext für "%s" ab', (lizenz) => {
    expect(() =>
      standardtexteErgaenzen([k({ name: 'saxes', lizenz, lizenztexte: [] })], sammlung),
    ).toThrow('npm saxes 1.0.0: kein Lizenztext im Paket und kein Standardtext');
  });
});
