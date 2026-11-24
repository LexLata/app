import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { doppelteDateinamen } from './doppelte-dateinamen.mjs';

describe('doppelteDateinamen', () => {
  it('meldet nichts bei durchweg eindeutigen Dateinamen', () => {
    expect(
      doppelteDateinamen(['src/lib/import/bund/bund.index.ts', 'src/lib/import/eu/eu.index.ts']),
    ).toEqual([]);
  });

  it('erkennt zwei Dateien mit identischem Namen an unterschiedlichen Pfaden', () => {
    expect(
      doppelteDateinamen([
        'src/lib/import/gemeinsam/gemeinsam.index.ts',
        'src/lib/markierungen/gemeinsam/gemeinsam.index.ts',
        'src/lib/import/bund/bund.index.ts',
      ]),
    ).toEqual([
      [
        'gemeinsam.index.ts',
        [
          'src/lib/import/gemeinsam/gemeinsam.index.ts',
          'src/lib/markierungen/gemeinsam/gemeinsam.index.ts',
        ],
      ],
    ]);
  });

  it('meldet mehr als zwei gleichnamige Dateien als eine gemeinsame Gruppe', () => {
    const treffer = doppelteDateinamen(['a/x.ts', 'b/x.ts', 'c/x.ts']);
    expect(treffer).toHaveLength(1);
    expect(treffer[0][1]).toEqual(['a/x.ts', 'b/x.ts', 'c/x.ts']);
  });

  it('ignoriert Nicht-Quelldateien (Endungsfilter) – z.B. Icons/Konfig, die legitim mehrfach vorkommen', () => {
    expect(
      doppelteDateinamen([
        'src-tauri/icons/menu/dark/export.png',
        'src-tauri/icons/menu/light/export.png',
        'tsconfig.json',
        'scripts/tsconfig.json',
        '.gitignore',
        'src-tauri/.gitignore',
      ]),
    ).toEqual([]);
  });

  it('meldet eine Kollision unter src-tauri/gen/ trotzdem, falls dort je .ts/.js auftaucht', () => {
    // Bewusst KEINE Ausnahme für src-tauri/gen/ (siehe Kopfkommentar): aktuell
    // liegt dort keine einzige .ts/.js-Datei, eine Ausnahme dafür wäre
    // Spekulation ohne echten Anwendungsfall. Taucht dort künftig generierter
    // Code auf, soll eine Kollision ganz normal auffallen wie jede andere.
    expect(
      doppelteDateinamen(['src-tauri/gen/apple/irgendwas/hilfe.ts', 'src/lib/domain/hilfe.ts']),
    ).toEqual([
      ['hilfe.ts', ['src-tauri/gen/apple/irgendwas/hilfe.ts', 'src/lib/domain/hilfe.ts']],
    ]);
  });

  it('erkennt gleichnamige Rust-Dateien mit vollständigem Namen samt Endung', () => {
    expect(
      doppelteDateinamen([
        'src-tauri/src/fenster.rs',
        'src-tauri/src/commands/fenster.rs',
        'src-tauri/src/fenster.ts',
      ]),
    ).toEqual([['fenster.rs', ['src-tauri/src/commands/fenster.rs', 'src-tauri/src/fenster.rs']]]);
  });

  it('sortiert Fundgruppen nach Dateiname, Pfade innerhalb einer Gruppe alphabetisch', () => {
    const treffer = doppelteDateinamen(['z/y.ts', 'a/y.ts', 'b/a.ts', 'c/a.ts']);
    expect(treffer.map(([name]) => name)).toEqual(['a.ts', 'y.ts']);
    expect(treffer[0][1]).toEqual(['b/a.ts', 'c/a.ts']);
    expect(treffer[1][1]).toEqual(['a/y.ts', 'z/y.ts']);
  });

  it(
    'nurPruefen (--staged/explizite Pfade): Gruppierung läuft über ALLE Pfade, aber nur ' +
      'Gruppen mit mindestens einem betroffenen Dateinamen werden gemeldet',
    () => {
      const alle = ['src/a/geteilt.ts', 'src/b/geteilt.ts', 'src/c/anders.ts', 'src/d/anders.ts'];
      // Nur src/b/geteilt.ts ist "gestaged" – der Duplikat-Partner
      // src/a/geteilt.ts liegt außerhalb, muss aber trotzdem in der
      // gemeldeten Gruppe auftauchen (sonst wüsste man nicht, WOMIT es
      // kollidiert).
      expect(doppelteDateinamen(alle, ['src/b/geteilt.ts'])).toEqual([
        ['geteilt.ts', ['src/a/geteilt.ts', 'src/b/geteilt.ts']],
      ]);
    },
  );

  it('nurPruefen: keine Meldung, wenn kein geprüfter Pfad zu einer Duplikat-Gruppe gehört', () => {
    const alle = ['src/a/geteilt.ts', 'src/b/geteilt.ts', 'src/c/einzigartig.ts'];
    expect(doppelteDateinamen(alle, ['src/c/einzigartig.ts'])).toEqual([]);
  });

  it('ohne nurPruefen: alle Duplikat-Gruppen werden gemeldet', () => {
    const alle = ['src/a/x.ts', 'src/b/x.ts'];
    expect(doppelteDateinamen(alle)).toEqual([['x.ts', ['src/a/x.ts', 'src/b/x.ts']]]);
  });
});

describe('doppelte-dateinamen.mjs im Git-Repository', () => {
  const skript = resolve(import.meta.dirname, 'doppelte-dateinamen.mjs');

  it('meldet einen gleichnamigen Partner, der noch nicht getrackt ist', () => {
    const repo = mkdtempSync(join(tmpdir(), 'lexlata-dateinamen-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: repo });
      for (const ordner of ['a', 'b']) mkdirSync(join(repo, ordner));
      writeFileSync(join(repo, 'a/hilfe.ts'), 'export {};\n');
      writeFileSync(join(repo, 'b/hilfe.ts'), 'export {};\n');
      execFileSync('git', ['add', 'a/hilfe.ts'], { cwd: repo });

      const lauf = spawnSync(process.execPath, [skript], { cwd: repo, encoding: 'utf8' });

      expect(lauf.status).toBe(1);
      expect(lauf.stderr).toContain('a/hilfe.ts');
      expect(lauf.stderr).toContain('b/hilfe.ts');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('übergeht eine getrackte, im Arbeitsbaum verschobene Datei', () => {
    const repo = mkdtempSync(join(tmpdir(), 'lexlata-dateinamen-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: repo });
      for (const ordner of ['a', 'b']) mkdirSync(join(repo, ordner));
      writeFileSync(join(repo, 'a/hilfe.ts'), 'export {};\n');
      execFileSync('git', ['add', 'a/hilfe.ts'], { cwd: repo });
      renameSync(join(repo, 'a/hilfe.ts'), join(repo, 'b/hilfe.ts'));

      const lauf = spawnSync(process.execPath, [skript], { cwd: repo, encoding: 'utf8' });

      expect(lauf.stderr).not.toContain('hilfe.ts');
      expect(lauf.status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('vergleicht mit --staged nur mit Dateien im Index, ohne --staged auch mit ungetrackten', () => {
    const repo = mkdtempSync(join(tmpdir(), 'lexlata-dateinamen-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: repo });
      for (const ordner of ['a', 'b']) mkdirSync(join(repo, ordner));
      writeFileSync(join(repo, 'a/hilfe.ts'), 'export {};\n');
      writeFileSync(join(repo, 'b/hilfe.ts'), 'export {};\n');
      execFileSync('git', ['add', 'a/hilfe.ts'], { cwd: repo });
      const lauf = (args: string[]) =>
        spawnSync(process.execPath, [skript, ...args], { cwd: repo, encoding: 'utf8' });

      expect(lauf(['--staged']).status).toBe(0);
      expect(lauf([]).status).toBe(1);

      execFileSync('git', ['add', 'b/hilfe.ts'], { cwd: repo });
      const nachAdd = lauf(['--staged']);
      expect(nachAdd.status).toBe(1);
      expect(nachAdd.stderr).toContain('a/hilfe.ts');
      expect(nachAdd.stderr).toContain('b/hilfe.ts');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
