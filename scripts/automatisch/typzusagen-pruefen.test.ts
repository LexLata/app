// typzusagen-pruefen.test.ts
// Prüft Syntaxbaumzählung, unveränderliche Obergrenzen und kontrollierte Dateiübertragung.
import { describe, expect, it } from 'vitest';
import {
  aktualisiereBaseline,
  pruefeTypzusagen,
  uebertrageBaseline,
  zaehleTypzusagen,
} from './typzusagen-pruefen.mjs';

const zahlen = (nichtNull = 0, cast = 0, doppelCast = 0) => ({ nichtNull, cast, doppelCast });
const datei = (pfad: string, nichtNull = 0, cast = 0) => ({ pfad, ...zahlen(nichtNull, cast) });
const baseline = () => ({ produktion: { 'src/a.ts': zahlen(2, 1) }, tests: zahlen(3) });

describe('Syntaxbaumzählung', () => {
  it('unterscheidet Zusicherungen und wirkungslose Zeichenfolgen', () => {
    expect(zaehleTypzusagen('src/a.ts', 'a!; a![0]; a!.b; a !== b; // x!\n"x!";')).toEqual(
      zahlen(3),
    );
  });
  it('zählt Casts einschließlich Winkelschreibweise, aber keine Konstanten oder Importnamen', () => {
    expect(
      zaehleTypzusagen(
        'src/a.ts',
        'x as T; <T>x; x as const; x satisfies T; import {a as b} from "m"; export {a as b};',
      ),
    ).toEqual(zahlen(0, 2));
    expect(zaehleTypzusagen('src/a.tsx', 'const a = <T>x</T>;')).toEqual(zahlen());
  });
  it('zählt Doppel-Casts ausschließlich in ihrer eigenen Kategorie, auch geklammert', () => {
    expect(zaehleTypzusagen('src/a.ts', 'x as unknown as T; (x as unknown) as T;')).toEqual(
      zahlen(0, 0, 2),
    );
  });
});

describe('Baseline', () => {
  it('prüft Produktion je Datei und Tests als gemeinsame Summe', () => {
    expect(
      pruefeTypzusagen(
        [
          datei('src/a.ts', 2, 1),
          datei('src/x.test.ts', 1),
          datei('src/test/a.ts', 1),
          datei('src/test/gesetz/b.ts', 1),
        ],
        baseline(),
      ).fehler,
    ).toEqual([]);
  });
  it('meldet Wachstum mit Datei, Kategorie, Ist und Höchstwert', () => {
    const ergebnis = pruefeTypzusagen(
      [datei('src/a.ts', 4, 1), datei('src/a.test.ts', 4)],
      baseline(),
    );
    expect(ergebnis.fehler.join('\n')).toMatch(/src\/a.ts.*nichtNull.*4.*2/);
    expect(ergebnis.fehler.join('\n')).toMatch(/Tests.*4.*3/);
    expect(ergebnis.ausgabe).toMatch(/Produktion.*Differenz/);
    expect(ergebnis.ausgabe).toMatch(/Tests.*Differenz/);
  });
  it('verlangt bei Schrumpfung die Aktualisierung und erhöht dabei keinen Wert', () => {
    const dateien = [datei('src/a.ts', 1, 2), datei('src/a.test.ts', 2)];
    expect(pruefeTypzusagen(dateien, baseline()).fehler.join('\n')).toContain('--aktualisieren');
    const neu = aktualisiereBaseline(dateien, baseline());
    expect(neu.produktion['src/a.ts']).toEqual(zahlen(1, 1));
    expect(neu.tests).toEqual(zahlen(2));
    expect(
      pruefeTypzusagen([datei('src/a.ts', 1, 1), datei('src/a.test.ts', 2)], neu).fehler,
    ).toEqual([]);
  });
  it('verlangt Einträge für neue Dateien und konkrete Begründungen für Ausnahmen', () => {
    const dateien = [datei('src/neu.ts', 1)];
    const neu = { produktion: {}, tests: zahlen() };
    expect(pruefeTypzusagen(dateien, neu).fehler.join('\n')).toContain('--uebertrage');
    expect(
      pruefeTypzusagen(dateien, {
        ...neu,
        produktion: { 'src/neu.ts': { ...zahlen(1), begruendung: '   ' } },
      }).fehler.join('\n'),
    ).toContain('Begründung');
    expect(
      pruefeTypzusagen(dateien, {
        ...neu,
        produktion: {
          'src/neu.ts': { ...zahlen(1), begruendung: 'DOM-Schnittstelle verlangt Zusicherung.' },
        },
      }).fehler,
    ).toEqual([]);
  });
  it('meldet gelöschte und jetzt zusicherungsfreie Dateien', () => {
    expect(pruefeTypzusagen([], baseline()).fehler.join('\n')).toContain('--uebertrage');
    expect(pruefeTypzusagen([datei('src/a.ts')], baseline()).fehler.join('\n')).toContain(
      '--aktualisieren',
    );
  });
  it('überträgt nur vorhandenes Budget auf Nachfolger', () => {
    const dateien = [datei('src/b.ts', 1, 1), datei('src/c.ts', 1), datei('src/a.test.ts', 3)];
    const neu = uebertrageBaseline(dateien, baseline(), 'src/a.ts', ['src/b.ts', 'src/c.ts']);
    expect(neu.produktion).not.toHaveProperty('src/a.ts');
    expect(pruefeTypzusagen(dateien, neu).fehler).toEqual([]);
    expect(() =>
      uebertrageBaseline([datei('src/b.ts', 3)], baseline(), 'src/a.ts', ['src/b.ts']),
    ).toThrow(/nichtNull/);
  });
  it('weist ungültige Baselinewerte und Windows-Pfade zurück', () => {
    expect(
      pruefeTypzusagen([], { produktion: { 'src\\a.ts': zahlen(-1) }, tests: zahlen() }).fehler
        .length,
    ).toBeGreaterThan(0);
  });
});
