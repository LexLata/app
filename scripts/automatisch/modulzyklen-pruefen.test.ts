// modulzyklen-pruefen.test.ts
// Führt die Kreisprüfung mit echtem dependency-cruiser an synthetischen Mini-Projekten aus.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { einheitFuer, werteCruiseLaufAus } from './modulzyklen-pruefen.mjs';

const skript = resolve(import.meta.dirname, 'modulzyklen-pruefen.mjs');

function pruefeProjekt(dateien: Record<string, string>, module: string[] = []) {
  const ordner = mkdtempSync(join(tmpdir(), 'lexlata-modulzyklen-'));
  try {
    const alle: Record<string, string> = {
      'scripts/automatisch/dependency-cruiser.cjs':
        'module.exports = { options: { tsPreCompilationDeps: true } };\n',
      'scripts/automatisch/modulgrenzen.cjs': `module.exports = { MODULE: ${JSON.stringify(
        module.map((pfad) => ({ pfad })),
      )} };\n`,
      ...dateien,
    };
    for (const [pfad, inhalt] of Object.entries(alle)) {
      mkdirSync(dirname(join(ordner, pfad)), { recursive: true });
      writeFileSync(join(ordner, pfad), inhalt);
    }
    const lauf = spawnSync(process.execPath, [skript], { cwd: ordner, encoding: 'utf8' });
    return { status: lauf.status, ausgabe: lauf.stdout + lauf.stderr };
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}

describe('Kreisprüfung auf Modulebene', () => {
  it('meldet einen Zweierkreis zwischen Einheiten mit den schließenden Kanten', () => {
    const ergebnis = pruefeProjekt({
      'src/lib/stil/a.ts': "import { b } from '../utils/b';\nexport const a = () => b;\n",
      'src/lib/utils/b.ts': "import { a } from '../stil/a';\nexport const b = () => a;\n",
    });
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('src/lib/stil');
    expect(ergebnis.ausgabe).toContain('src/lib/utils');
    expect(ergebnis.ausgabe).toContain('src/lib/stil/a.ts → src/lib/utils/b.ts');
    expect(ergebnis.ausgabe).toContain('src/lib/utils/b.ts → src/lib/stil/a.ts');
  });

  it('meldet denselben Kreis nicht, wenn eine Richtung nur Typen importiert', () => {
    const ergebnis = pruefeProjekt({
      'src/lib/stil/a.ts':
        "import type { B } from '../utils/b';\nexport type A = { b?: B };\nexport const a = 1;\n",
      'src/lib/utils/b.ts':
        "import { a } from '../stil/a';\nexport type B = number;\nexport const b = a;\n",
    });
    expect(ergebnis.ausgabe).not.toContain('src/lib/stil/a.ts');
    expect(ergebnis.status).toBe(0);
  });

  it('meldet einen Kreis über ein dynamisches import()', () => {
    const ergebnis = pruefeProjekt({
      'src/lib/stil/a.ts': "export const a = () => import('../utils/b');\n",
      'src/lib/utils/b.ts': "import { a } from '../stil/a';\nexport const b = a;\n",
    });
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('src/lib/stil/a.ts → src/lib/utils/b.ts');
  });

  it('wertet Importe innerhalb einer Einheit nicht als Modulkreis', () => {
    const ergebnis = pruefeProjekt(
      {
        'src/lib/import/x.ts': "import { y } from './bund/y';\nexport const x = () => y;\n",
        'src/lib/import/bund/y.ts': 'export const y = 1;\n',
        'src/lib/utils/z.ts': "import { x } from '../import/x';\nexport const z = x;\n",
        'src/lib/import/bund/w.ts': "import { z } from '../../utils/z';\nexport const w = z;\n",
      },
      ['src/lib/import', 'src/lib/import/bund'],
    );
    expect(ergebnis.ausgabe).toContain('src/lib/import, src/lib/utils');
    const ohneRueckweg = pruefeProjekt(
      {
        'src/lib/import/x.ts': "import { y } from './bund/y';\nexport const x = () => y;\n",
        'src/lib/import/bund/y.ts': 'export const y = 1;\n',
      },
      ['src/lib/import', 'src/lib/import/bund'],
    );
    expect(ohneRueckweg.status).toBe(0);
  });

  it('meldet einen Laufzeitkreis innerhalb einer Einheit, auch neben einem Kreis mit Typimport', () => {
    const ergebnis = pruefeProjekt({
      'src/lib/utils/a.ts': "import { b } from './b';\nexport const a = () => b;\n",
      'src/lib/utils/b.ts':
        "import type { A } from './a';\nimport { c } from './c';\nexport type B = A;\nexport const b = () => c;\n",
      'src/lib/utils/c.ts': "import { a } from './a';\nexport const c = () => a;\n",
    });
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('Dateikreise');
    expect(ergebnis.ausgabe).toContain(
      'src/lib/utils/a.ts, src/lib/utils/b.ts, src/lib/utils/c.ts',
    );
  });

  it('meldet einen Dateikreis nur über Typimport nicht', () => {
    const ergebnis = pruefeProjekt({
      'src/lib/utils/a.ts':
        "import { b } from './b';\nexport type A = number;\nexport const a = b;\n",
      'src/lib/utils/b.ts': "import type { A } from './a';\nexport const b: A = 1;\n",
    });
    expect(ergebnis.status).toBe(0);
  });

  it('meldet einen Kreis über eine lose Wurzeldatei und einen Unterordner von lib/domain', () => {
    const ergebnis = pruefeProjekt({
      'src/lib/domain/a.ts': "import { b } from './norm/b';\nexport const a = () => b;\n",
      'src/lib/domain/norm/b.ts': "import { a } from '../a';\nexport const b = () => a;\n",
    });
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('src/lib/domain/a.ts → src/lib/domain/norm/b.ts');
  });

  it('wertet Testdateien nicht als Teil eines Kreises', () => {
    const ergebnis = pruefeProjekt({
      'src/lib/stil/a.ts': "import { b } from '../utils/b';\nexport const a = () => b;\n",
      'src/lib/utils/b.ts': 'export const b = 1;\n',
      'src/lib/utils/b.test.ts': "import { a } from '../stil/a';\nexport const t = a;\n",
    });
    expect(ergebnis.status).toBe(0);
  });
});

describe('Zuordnung zu Einheiten', () => {
  const module = ['src/lib/import', 'src/lib/import/bund', 'src/lib/domain/app/oeffnen'];
  it.each([
    ['src/lib/import/bund/x.ts', 'src/lib/import'],
    ['src/lib/domain/app/oeffnen/x.ts', 'src/lib/domain/app/oeffnen'],
    ['src/lib/domain/app/y.ts', 'src/lib/domain/app'],
    ['src/lib/domain/z.ts', 'src/lib/domain (Wurzel)'],
    ['src/hooks/useX.ts', 'src/hooks (Wurzel)'],
    ['src/hooks/fenster/useY.ts', 'src/hooks/fenster'],
    ['src/components/hauptfenster/Hauptansicht.tsx', 'src/components/hauptfenster'],
    ['src/lib/plattform/tauriHelpers.ts', 'src/lib/plattform'],
    ['src/lib/persistenz/nutzerdaten/n.ts', 'src/lib/persistenz/nutzerdaten'],
    ['src/mobile/m/x.tsx', 'src/mobile'],
    ['src/App.tsx', 'src (Wurzel)'],
  ])('ordnet %s der Einheit %s zu', (datei, einheit) => {
    expect(einheitFuer(datei, module)).toBe(einheit);
  });
});

describe('Auswertung des dependency-cruiser-Laufs', () => {
  const ausgabe = JSON.stringify({ modules: [{ source: 'src/a.ts', dependencies: [] }] });

  it('liefert die Module eines regulär beendeten Laufs', () => {
    expect(werteCruiseLaufAus({ status: 0, stdout: ausgabe })).toEqual([
      { source: 'src/a.ts', dependencies: [] },
    ]);
  });

  it.each([
    [{ status: 2, stdout: ausgabe, stderr: 'Absturz' }, 'Status 2'],
    [{ status: null, signal: 'SIGABRT', stdout: ausgabe }, 'Signal SIGABRT'],
    [{ status: 0, stdout: '' }, 'Status 0'],
    [{ status: null, error: new Error('ENOENT'), stdout: '' }, 'ENOENT'],
  ])('lässt die Prüfung bei unerwartetem Laufende scheitern: %j', (lauf, grund) => {
    expect(() => werteCruiseLaufAus(lauf)).toThrow(grund);
  });
});
