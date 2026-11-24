// Prüft lokale Unterdrückungen unabhängig von der unterdrückten Schutzregel.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { kontrolliereAusnahmen } from './textanzeige-ausnahmen.mjs';

const regel = 'lexlata/textanzeige-verbindlich';
const eslint = new ESLint({
  // Synthetische Dateien haben kein TypeScript-Projekt; die hier nicht geprüften typbasierten Regeln ausnehmen.
  overrideConfig: {
    languageOptions: { parserOptions: { projectService: false } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  allowInlineConfig: false,
});
async function pruefe(code: string) {
  const [roh] = await eslint.lintText(code, { filePath: 'src/components/Anzeige.tsx' });
  return kontrolliereAusnahmen(code, roh);
}
const kommentar = `eslint-disable-next-line ${regel} -- Bereits geschützt: mitUmbruchschutz gibt den geschützten Teil aus; Renderer-Verhaltenstest.`;
describe('Unabhängige Textanzeige-Ausnahmekontrolle', () => {
  it.each([
    `// ${kommentar}\nexport const a = <span>{wert}</span>;`,
    `export const a = <span>\n{/* ${kommentar} */}\n{wert}\n</span>;`,
    `export const a = (\n// ${kommentar}\n<span>{wert}</span>\n);`,
  ])('akzeptiert eine begründete nächste Zeile an gültigen JSX-Positionen', async (code) => {
    const ergebnis = await pruefe(code);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.ausnahmen).toHaveLength(1);
    expect(ergebnis.ausnahmen[0].begruendung).toContain('mitUmbruchschutz');
  });
  it.each([
    [`/* eslint ${regel}: "off" */\nexport const a = <span>{wert}</span>;`, 'nächste Zeile'],
    [`/* eslint "${regel}": 0 */\nexport const a = <span>{wert}</span>;`, 'nächste Zeile'],
    [
      `/* eslint-disable ${regel} -- Bereits geschützt: ganze Datei */\nexport const a = <span>{wert}</span>;`,
      'nächste Zeile',
    ],
    [
      `// eslint-disable-line ${regel} -- Reines Symbol: Punkt\nexport const a = <span>{wert}</span>;`,
      'nächste Zeile',
    ],
    [`// eslint-disable-next-line ${regel}\nexport const a = <span>{wert}</span>;`, 'Begründung'],
    [
      `// eslint-disable-next-line ${regel} -- Bereits geschützt\nexport const a = <span>{wert}</span>;`,
      'Begründung',
    ],
    [
      `// eslint-disable-next-line ${regel}, no-console -- Reines Symbol: Punkt\nexport const a = <span>{wert}</span>;`,
      'ausschließlich',
    ],
    [
      `// eslint-disable-next-line -- Reines Symbol: Punkt\nexport const a = <span>{wert}</span>;`,
      'ausschließlich',
    ],
    [`// eslint-disable-next-line '${regel}'\nexport const a = <span>{wert}</span>;`, 'Begründung'],
    [
      `// eslint-disable-next-line ${regel} --Reines Symbol: KommentarSymbol zeigt ⓘ.\nexport const a = <span>{wert}</span>;`,
      'Begründung',
    ],
    [`// ${kommentar}\nexport const a = <span/>;`, 'veraltet'],
    [`// ${kommentar}\nexport const a = <span>{eins}{zwei}</span>;`, 'mehrere'],
    [`// ${kommentar}\n\nexport const a = <span>{wert}</span>;`, 'veraltet'],
  ])('verwirft ungültige Ausnahmen trotz ESLint-Unterdrückung', async (code, meldung) => {
    const fehler = (await pruefe(code)).fehler;
    expect(fehler.join('\n')).toContain(meldung);
    expect(fehler.every((m) => m.includes('Siehe docs/doku/umbruchschutz.md'))).toBe(true);
  });
  it('verwirft doppelte Ausnahmen für dieselbe Ausgabe', async () => {
    const code = `/* ${kommentar} */ /* ${kommentar} */\nexport const a = <span>{wert}</span>;`;
    const fehler = (await pruefe(code)).fehler;
    expect(fehler.join('\n')).toContain('mehrfach');
    expect(fehler.every((m) => m.includes('Siehe docs/doku/umbruchschutz.md'))).toBe(true);
  });
  it('lässt benachbarte Rohanzeigen und Ausnahmen anderer Regeln unberührt', async () => {
    const code = `// eslint-disable-next-line no-console\nconsole.log('Technik');\nexport const a = <span>\n{/* ${kommentar} */}\n{wert}\n{roh}\n</span>;`;
    const ergebnis = await pruefe(code);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.ausnahmen).toHaveLength(1);
    const normal = new ESLint({
      // Synthetische Dateien haben kein TypeScript-Projekt; die hier nicht geprüften typbasierten Regeln ausnehmen.
      overrideConfig: {
        languageOptions: { parserOptions: { projectService: false } },
        rules: {
          '@typescript-eslint/no-floating-promises': 'off',
          '@typescript-eslint/await-thenable': 'off',
          '@typescript-eslint/switch-exhaustiveness-check': 'off',
          '@typescript-eslint/only-throw-error': 'off',
          '@typescript-eslint/prefer-promise-reject-errors': 'off',
          '@typescript-eslint/restrict-template-expressions': 'off',
          '@typescript-eslint/unbound-method': 'off',
          '@typescript-eslint/require-await': 'off',
          '@typescript-eslint/no-unsafe-assignment': 'off',
          '@typescript-eslint/no-unsafe-return': 'off',
          '@typescript-eslint/no-unsafe-call': 'off',
          '@typescript-eslint/no-unsafe-member-access': 'off',
          '@typescript-eslint/no-unsafe-argument': 'off',
        },
      },
    });
    const [bericht] = await normal.lintText(code, { filePath: 'src/components/Anzeige.tsx' });
    expect(bericht.messages.filter((m) => m.ruleId === regel)).toHaveLength(1);
  });
});
