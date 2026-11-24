// Prüft die Erkennung von Produktionsdateien und erklärenden Kopfkommentaren.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { hatErklaerendenKopfkommentar, istProduktionsdatei } from './kopfkommentare.mjs';

const skript = fileURLToPath(new URL('./kopfkommentare.mjs', import.meta.url));
let testordner: string | undefined;

afterEach(() => {
  if (testordner) rmSync(testordner, { recursive: true, force: true });
  testordner = undefined;
});

describe('Kopfkommentarprüfung', () => {
  it('erfasst Produktionsdateien in src und src-tauri/src', () => {
    expect(istProduktionsdatei('src/App.tsx')).toBe(true);
    expect(istProduktionsdatei('src/lib/import/dispatch/fortschritt.ts')).toBe(true);
    expect(istProduktionsdatei('src-tauri/src/commands/import.rs')).toBe(true);
    expect(istProduktionsdatei('src/App.test.tsx')).toBe(false);
    expect(istProduktionsdatei('scripts/automatisch/pruefen.mjs')).toBe(false);
    expect(istProduktionsdatei('src-tauri/gen/android/Main.kt')).toBe(false);
  });

  it('akzeptiert erklärende Zeilen- und Blockkommentare', () => {
    const pfad = 'src/App.tsx';
    expect(
      hatErklaerendenKopfkommentar('// App.tsx\n// Richtet die Hauptansicht ein.\nimport x;', pfad),
    ).toBe(true);
    expect(
      hatErklaerendenKopfkommentar('/* Richtet die Hauptansicht ein. */\nimport x;', pfad),
    ).toBe(true);
    expect(hatErklaerendenKopfkommentar('\uFEFF// Richtet die Hauptansicht ein.\n', pfad)).toBe(
      true,
    );
  });

  it('meldet fehlende und bloß benennende Kommentare', () => {
    const pfad = 'src/App.tsx';
    expect(hatErklaerendenKopfkommentar('import x;', pfad)).toBe(false);
    expect(hatErklaerendenKopfkommentar('\n// Erklärung\nimport x;', pfad)).toBe(false);
    expect(hatErklaerendenKopfkommentar('// App.tsx\nimport x;', pfad)).toBe(false);
    expect(hatErklaerendenKopfkommentar('/* App.tsx */\nimport x;', pfad)).toBe(false);
  });

  it('prüft bei --staged den Git-Index und nicht ungestagte Korrekturen', () => {
    testordner = mkdtempSync(join(tmpdir(), 'kopfkommentare-'));
    execFileSync('git', ['init', '-q'], { cwd: testordner });
    mkdirSync(join(testordner, 'src'));
    const datei = join(testordner, 'src', 'beispiel.ts');
    writeFileSync(datei, 'export const wert = 1;\n');
    execFileSync('git', ['add', 'src/beispiel.ts'], { cwd: testordner });
    writeFileSync(datei, '// Beschreibt den Testwert.\nexport const wert = 1;\n');

    const staged = spawnSync(process.execPath, [skript, '--staged'], {
      cwd: testordner,
      encoding: 'utf8',
    });
    expect(staged.status).toBe(1);
    expect(staged.stderr).toContain('src/beispiel.ts');
    expect(spawnSync(process.execPath, [skript], { cwd: testordner }).status).toBe(0);
  });
});
