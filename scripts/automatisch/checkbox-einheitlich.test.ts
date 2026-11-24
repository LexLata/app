import { describe, expect, it } from 'vitest';
import { findeRoheCheckboxen } from './checkbox-einheitlich.mjs';
import { pruefskripteAuswaehlen } from './pruefen.mjs';
import { readFileSync } from 'node:fs';

describe('einheitliche Checkbox', () => {
  it.each(['type="checkbox"', "type='checkbox'", "type={'checkbox'}", "type: 'checkbox'"])(
    'meldet %s mit Datei und Zeile und erlaubt nur die gemeinsame Komponente und Tests',
    (inhalt) => {
      expect(
        findeRoheCheckboxen([
          { pfad: 'src/beispiel.tsx', inhalt: `\n${inhalt}` },
          { pfad: 'src/components/Checkbox.tsx', inhalt },
          { pfad: 'src/components/CheckboxAndere.tsx', inhalt },
          { pfad: 'src/beispiel.test.tsx', inhalt },
        ]),
      ).toEqual([
        { pfad: 'src/beispiel.tsx', zeile: 2 },
        { pfad: 'src/components/CheckboxAndere.tsx', zeile: 1 },
      ]);
    },
  );
  it('führt die Checkboxprüfung im regulären Prüflauf aus', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(scripts['pruefen:checkbox']).toBe('node scripts/automatisch/checkbox-einheitlich.mjs');
    expect(pruefskripteAuswaehlen(scripts)).toContain('pruefen:checkbox');
  });
});
