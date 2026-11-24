// zeilenlimit-pruefen.test.ts
// Verhalten der verpflichtenden Zeilengrenze mit begründeter, konkret bezifferter Ausnahmeliste.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  GRENZE,
  liesAusnahmen,
  pruefeZeilenlimit,
  unterliegtZeilenlimit,
  zaehleZeilen,
  zaehleProduktionszeilen,
} from './zeilenlimit-pruefen.mjs';

const BEGRUENDUNG = 'Altbestand; Aufteilung ist geplant.';

function ausnahme(datei: string, maximum: number, begruendung: string = BEGRUENDUNG) {
  return { datei, maximum, begruendung };
}

describe('zaehleZeilen', () => {
  it.each([
    ['', 0],
    ['a\n', 1],
    ['a\nb', 2],
    ['a\n\n', 2],
    ['a\r\nb\r\n', 2],
  ])('zählt %j als %i Zeilen (wie wc -l, letzte Zeile ohne Umbruch eingeschlossen)', (text, n) => {
    expect(zaehleZeilen(text)).toBe(n);
  });
});

describe('unterliegtZeilenlimit', () => {
  it.each([
    'src/App.tsx',
    'src/lib/import/bund/gesetzQuellen.ts',
    'src/hooks/tabs/useAppTabs.ts',
    'src-tauri/src/lib.rs',
  ])('erfasst Produktionsdatei %s', (pfad) => {
    expect(unterliegtZeilenlimit(pfad)).toBe(true);
  });

  it.each([
    'src/lib/x/y.test.ts',
    'src/components/x.test.tsx',
    'src/components/x.integration.test.tsx',
    'src/test/dateiAttrappen.ts',
    'scripts/automatisch/pruefen.mjs',
    'src-tauri/tests/integration.rs',
    'src/lib/x/y.js',
    'docs/beispiel.ts',
  ])('lässt %s aus', (pfad) => {
    expect(unterliegtZeilenlimit(pfad)).toBe(false);
  });
});

describe('pruefeZeilenlimit', () => {
  it('lässt genau die Grenze zu und meldet eine Zeile mehr', () => {
    expect(
      pruefeZeilenlimit({ dateien: [{ pfad: 'src/a.ts', zeilen: GRENZE }], ausnahmen: [] }),
    ).toEqual({ fehler: [] });

    const { fehler } = pruefeZeilenlimit({
      dateien: [{ pfad: 'src/a.ts', zeilen: GRENZE + 1 }],
      ausnahmen: [],
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain('src/a.ts');
    expect(fehler[0]).toContain(String(GRENZE + 1));
  });

  it('erlaubt eine Datei bis zum Maximum ihrer Ausnahme, nicht darüber', () => {
    const liste = [ausnahme('src/App.tsx', 600)];
    expect(
      pruefeZeilenlimit({ dateien: [{ pfad: 'src/App.tsx', zeilen: 600 }], ausnahmen: liste })
        .fehler,
    ).toEqual([]);

    const { fehler } = pruefeZeilenlimit({
      dateien: [{ pfad: 'src/App.tsx', zeilen: 601 }],
      ausnahmen: liste,
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain('601');
    expect(fehler[0]).toContain('600');
  });

  it('meldet eine überflüssige Ausnahme, sobald die Datei die Grenze einhält', () => {
    for (const zeilen of [GRENZE, 120]) {
      const { fehler } = pruefeZeilenlimit({
        dateien: [{ pfad: 'src/a.ts', zeilen }],
        ausnahmen: [ausnahme('src/a.ts', 600)],
      });
      expect(fehler).toHaveLength(1);
      expect(fehler[0]).toContain('src/a.ts');
      expect(fehler[0]).toMatch(/entfern/i);
    }
  });

  it('meldet eine Ausnahme für eine unbekannte oder nicht prüfpflichtige Datei', () => {
    const { fehler } = pruefeZeilenlimit({
      dateien: [{ pfad: 'src/a.ts', zeilen: 10 }],
      ausnahmen: [ausnahme('src/gibtEsNicht.ts', 700)],
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain('src/gibtEsNicht.ts');
  });

  it.each([
    ['ohne Begründung', ausnahme('src/a.ts', 600, '')],
    ['mit Leerraum als Begründung', ausnahme('src/a.ts', 600, '   ')],
    ['mit Maximum auf der Grenze', ausnahme('src/a.ts', GRENZE)],
    ['mit Maximum unter der Grenze', ausnahme('src/a.ts', GRENZE - 1)],
    ['mit Bruchzahl als Maximum', ausnahme('src/a.ts', 600.5)],
  ])('weist eine Ausnahme %s zurück', (_name, eintrag) => {
    const { fehler } = pruefeZeilenlimit({
      dateien: [{ pfad: 'src/a.ts', zeilen: GRENZE + 50 }],
      ausnahmen: [eintrag],
    });
    expect(fehler.length).toBeGreaterThan(0);
    expect(fehler.join('\n')).toContain('src/a.ts');
  });

  it('weist doppelte Einträge für dieselbe Datei zurück', () => {
    const { fehler } = pruefeZeilenlimit({
      dateien: [{ pfad: 'src/a.ts', zeilen: 550 }],
      ausnahmen: [ausnahme('src/a.ts', 600), ausnahme('src/a.ts', 700)],
    });
    expect(fehler.join('\n')).toMatch(/doppelt|mehrfach/i);
  });

  it('meldet alle Verstöße auf einmal', () => {
    const { fehler } = pruefeZeilenlimit({
      dateien: [
        { pfad: 'src/a.ts', zeilen: 800 },
        { pfad: 'src/b.ts', zeilen: 900 },
        { pfad: 'src/c.ts', zeilen: 100 },
      ],
      ausnahmen: [],
    });
    expect(fehler).toHaveLength(2);
  });

  it('meldet ein zu hohes Maximum mit Ist-Zahl und Absenkanweisung als Fehler', () => {
    const { fehler } = pruefeZeilenlimit({
      dateien: [{ pfad: 'src/a.ts', zeilen: 640 }],
      ausnahmen: [ausnahme('src/a.ts', 700)],
    });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain('640');
    expect(fehler[0]).toContain('700');
    expect(fehler[0]).toContain('Maximum auf 640 senken');
  });

  it('meldet ohne Ausnahmen genau die Dateien über der Grenze', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 3000 }), { maxLength: 40 }), (zahlen) => {
        const dateien = zahlen.map((zeilen, i) => ({ pfad: `src/d${i}.ts`, zeilen }));
        const { fehler } = pruefeZeilenlimit({ dateien, ausnahmen: [] });
        expect(fehler).toHaveLength(zahlen.filter((n) => n > GRENZE).length);
      }),
    );
  });

  it('akzeptiert jede Datei über der Grenze, wenn ihr Maximum ihrer Größe entspricht', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: GRENZE + 1, max: 3000 }), { maxLength: 20 }),
        (zahlen) => {
          const dateien = zahlen.map((zeilen, i) => ({ pfad: `src/d${i}.ts`, zeilen }));
          const ausnahmen = dateien.map((d) => ausnahme(d.pfad, d.zeilen));
          expect(pruefeZeilenlimit({ dateien, ausnahmen })).toEqual({ fehler: [] });
        },
      ),
    );
  });
});

describe('liesAusnahmen', () => {
  it('liest die Einträge aus dem JSON-Dokument', () => {
    const eintrag = ausnahme('src/a.ts', 600);
    expect(liesAusnahmen(JSON.stringify({ ausnahmen: [eintrag] }))).toEqual([eintrag]);
  });

  it.each([
    ['kein JSON', 'das ist kein JSON'],
    ['ohne Feld ausnahmen', '{}'],
    ['ausnahmen kein Array', '{"ausnahmen": 3}'],
    ['Eintrag kein Objekt', '{"ausnahmen": ["src/a.ts"]}'],
  ])('weist ein Dokument %s mit Fehler zurück', (_name, text) => {
    expect(() => liesAusnahmen(text)).toThrow();
  });
});

describe('Rust-Produktionszeilen', () => {
  const modul = '#[cfg(test)]\nmod tests {\n    #[test] fn test() {}\n}\n';
  it.each(['// Kommentar\n', '/* Kommentar */\n'])(
    'zählt reine Kommentardateien ohne Testmodul vollständig: %s',
    (kommentar) => {
      const pfad = 'src-tauri/src/a.rs';
      const zeilen = zaehleProduktionszeilen(pfad, kommentar.repeat(501));
      expect(zeilen).toBe(501);
      expect(pruefeZeilenlimit({ dateien: [{ pfad, zeilen }], ausnahmen: [] }).fehler).toHaveLength(
        1,
      );
    },
  );
  it('zieht nur vollständig erkannte Testmodule am Dateiende ab', () => {
    expect(
      zaehleProduktionszeilen(
        'src-tauri/src/a.rs',
        'fn produktiv() {}\n' + modul + modul.replace('tests', 'weitere_tests'),
      ),
    ).toBe(1);
  });
  it('zählt Produktionscode nach einem Testmodul einschließlich des vorangehenden Moduls', () => {
    const davor = modul + 'fn produktiv() {}\n';
    expect(zaehleProduktionszeilen('src-tauri/src/a.rs', davor + modul)).toBe(zaehleZeilen(davor));
    expect(zaehleProduktionszeilen('src-tauri/src/a.rs', davor)).toBe(zaehleZeilen(davor));
  });
  it.each([
    '#[cfg(test)]\nmod tests {\n',
    '#[cfg(test)]\nmod tests;\n',
    '#[cfg(test)]\nmod tests { let x = r##"offen; }\n',
    '#[cfg(test)]\nmod tests { let x = "offen; }\n',
    '#[cfg(test)]\nmod tests { /* offen\n}\n',
    'fn produktiv() {\n#[cfg(test)]\nmod tests {}\n',
  ])('zählt bei unklarer Abgrenzung die ganze Datei: %s', (text) => {
    expect(zaehleProduktionszeilen('src-tauri/src/a.rs', text)).toBe(zaehleZeilen(text));
  });
  it('ignoriert Klammern und vermeintliche Module in Literalen und Kommentaren', () => {
    const text =
      'fn produktiv() {}\n' +
      '#[cfg(test)]\nmod tests {\nlet a = r###"} /*"###;\nlet b = "}\\"{";\nlet c = \'}\';\n/* } /* { */ } */\n}\n';
    expect(zaehleProduktionszeilen('src-tauri/src/a.rs', text)).toBe(1);
  });
  it('lässt reine Testmodule ohne Produktionszeilen aus', () => {
    expect(zaehleProduktionszeilen('src-tauri/src/a.rs', modul)).toBe(0);
    expect(zaehleProduktionszeilen('src-tauri/src/a.rs', '// Tests\n' + modul)).toBe(0);
  });
  it('lässt eine vollständig als Testdatei deklarierte Rust-Datei aus', () => {
    expect(
      zaehleProduktionszeilen(
        'src-tauri/src/a.rs',
        '// Tests\n#![cfg(test)]\nuse super::*;\n#[test] fn test() {}\n',
      ),
    ).toBe(0);
  });
  it('meldet eine Rust-Datei über 500 Produktionszeilen ohne Ausnahme', () => {
    const pfad = 'src-tauri/src/a.rs';
    const zeilen = zaehleProduktionszeilen(pfad, 'fn produktiv() {}\n'.repeat(501) + modul);
    const { fehler } = pruefeZeilenlimit({ dateien: [{ pfad, zeilen }], ausnahmen: [] });
    expect(unterliegtZeilenlimit(pfad)).toBe(true);
    expect(zeilen).toBe(501);
    expect(fehler).toHaveLength(1);
  });
});

describe('zeilenlimit-pruefen.mjs im Git-Repository', () => {
  const skript = resolve(import.meta.dirname, 'zeilenlimit-pruefen.mjs');

  function mitRepo(pruefung: (repo: string) => void) {
    const repo = mkdtempSync(join(tmpdir(), 'lexlata-zeilenlimit-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: repo });
      mkdirSync(join(repo, 'src'));
      mkdirSync(join(repo, 'scripts/automatisch'), { recursive: true });
      writeFileSync(
        join(repo, 'scripts/automatisch/zeilenlimit-ausnahmen.json'),
        '{ "ausnahmen": [] }\n',
      );
      writeFileSync(join(repo, 'src/gross.ts'), 'export {};\n'.repeat(GRENZE + 1));
      pruefung(repo);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
  const lauf = (repo: string, ...args: string[]) =>
    spawnSync(process.execPath, [skript, ...args], { cwd: repo, encoding: 'utf8' });

  it('meldet eine ungetrackte Datei über der Grenze', () => {
    mitRepo((repo) => {
      const ergebnis = lauf(repo);
      expect(ergebnis.status).toBe(1);
      expect(ergebnis.stderr).toContain('src/gross.ts');
    });
  });

  it('übergeht in der Hook-Fassung eine ungestagte Datei und meldet sie nach dem Stagen', () => {
    mitRepo((repo) => {
      expect(lauf(repo, '--staged').status).toBe(0);
      execFileSync('git', ['add', 'src/gross.ts'], { cwd: repo });
      const ergebnis = lauf(repo, '--staged');
      expect(ergebnis.status).toBe(1);
      expect(ergebnis.stderr).toContain('src/gross.ts');
    });
  });
});
