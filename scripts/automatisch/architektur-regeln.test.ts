// architektur-regeln.test.ts
// Prüft Architekturgrenzen mit echten, aufgelösten Importen in kleinen Dateibäumen.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cruise } from 'dependency-cruiser';
import { ESLint } from 'eslint';
import { kontrolliereAusnahmen } from './textanzeige-ausnahmen.mjs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const konfiguration = require('./dependency-cruiser.cjs');

async function pruefeDateien(dateien: Record<string, string>, bereiche = ['src']) {
  const ordner = await mkdtemp(join(tmpdir(), 'lexlata-architektur-'));
  try {
    for (const [pfad, inhalt] of Object.entries(dateien)) {
      await mkdir(dirname(join(ordner, pfad)), { recursive: true });
      await writeFile(join(ordner, pfad), inhalt);
    }
    const ergebnis = await cruise(bereiche, {
      ...konfiguration.options,
      tsConfig: undefined,
      baseDir: await realpath(ordner),
      validate: true,
      outputType: 'json',
      ruleSet: { forbidden: konfiguration.forbidden },
    });
    const bericht = JSON.parse(String(ergebnis.output)) as {
      summary: { violations: { from: string; rule: { name: string; severity: string } }[] };
    };
    return bericht.summary.violations.filter((v) => v.rule.severity === 'error');
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}

const exportWert = 'export const wert = 1; export type Wert = number;';
const importArten = [
  (pfad: string) => `import { wert } from '${pfad}'; export const ergebnis = wert;`,
  (pfad: string) => `import type { Wert } from '${pfad}'; export type Ergebnis = Wert;`,
  (pfad: string) => `export const lade = () => import('${pfad}');`,
  (pfad: string) => `export { wert } from '${pfad}';`,
];

describe('Ordnergrenzen', () => {
  it.each(importArten)('verbietet Gegenrichtungen für jede Importart', async (importText) => {
    const fehler = await pruefeDateien({
      'src/hooks/normal.ts': exportWert,
      'src/components/Normal.ts': exportWert,
      'src/mobile/Normal.ts': exportWert,
      'src/App.ts': exportWert,
      'src/test/hilfe.ts': exportWert,
      'src/lib/gegenrichtung.ts': importText('../hooks/normal'),
      'src/lib/gegenrichtung.test.ts': importText('../hooks/normal'),
      'src/hooks/komponente.ts': importText('../components/Normal'),
      'src/hooks/einstieg.ts': importText('../App'),
      'src/hooks/mobil.ts': importText('../mobile/Normal'),
      'src/components/mobil.ts': importText('../mobile/Normal'),
      'src/lib/testimport.ts': importText('../test/hilfe'),
    });
    expect(new Set(fehler.map((v) => v.from))).toEqual(
      new Set([
        'src/lib/gegenrichtung.ts',
        'src/lib/gegenrichtung.test.ts',
        'src/hooks/komponente.ts',
        'src/hooks/einstieg.ts',
        'src/hooks/mobil.ts',
        'src/components/mobil.ts',
        'src/lib/testimport.ts',
      ]),
    );
  });

  it('erlaubt normale Richtungen und begrenzte Testzugriffe', async () => {
    expect(
      await pruefeDateien({
        'src/lib/normal.ts': exportWert,
        'src/hooks/normal.ts': "export { wert } from '../lib/normal';",
        'src/components/Normal.ts': "export { wert } from '../hooks/normal';",
        'src/mobile/Normal.ts': "export { wert } from '../components/Normal';",
        'src/App.ts': "export { wert } from './mobile/Normal';",
        'src/test/hilfe.ts': exportWert,
        'src/lib/normal.test.ts': "export { wert } from '../test/hilfe';",
        'src/lib/andere.test.ts': "export { wert } from './normal.test';",
      }),
    ).toEqual([]);
  });

  it('erlaubt nur die benannte mobile Integrationskante', async () => {
    const quelle =
      'src/components/gesetzestextansicht/ansichtssteuerung/scrollen/Gesetzestextansicht.weitergabe.test.tsx';
    const ziel = 'src/mobile/screens/GesetzTextScreen.tsx';
    const fehler = await pruefeDateien({
      [ziel]: exportWert,
      'src/mobile/screens/AndereAnsicht.tsx': exportWert,
      [quelle]:
        "export { wert } from '../../../../mobile/screens/GesetzTextScreen'; export { Wert } from '../../../../mobile/screens/AndereAnsicht';",
      'src/components/andere.test.tsx':
        "export { wert } from '../mobile/screens/GesetzTextScreen';",
    });
    expect(
      fehler
        .filter((v) => v.rule.name.includes('mobile'))
        .map((v) => v.from)
        .sort(),
    ).toEqual([quelle, 'src/components/andere.test.tsx'].sort());
  });

  it('begrenzt den vorhandenen Verweis-Integrationstest auf seinen Navigationshook', async () => {
    const quelle =
      'src/lib/markierungen/hilfsfenster-aktionen/verweismarkierungAktionen.zitatAufloesung.test.ts';
    const fehler = await pruefeDateien({
      'src/hooks/tabs/useGesetzOeffnen.ts': exportWert,
      'src/hooks/tabs/andererHook.ts': exportWert,
      [quelle]:
        "export { wert } from '../../../hooks/tabs/useGesetzOeffnen'; export { Wert } from '../../../hooks/tabs/andererHook';",
    });
    expect(fehler.map((v) => v.rule.name)).toEqual(['verweis-integrationstest-nur-benannter-hook']);
  });
});

describe('Modulgrenzen für Tests und Werkzeuge unter scripts', () => {
  const modul = {
    'src/lib/banner/banner.index.ts': "export { wert } from './bannerStore';",
    'src/lib/banner/bannerStore.ts': exportWert,
  };

  it.each(importArten)('verbietet den Zugriff ins Innere eines Moduls', async (importText) => {
    const fehler = await pruefeDateien(
      {
        ...modul,
        'scripts/automatisch/probe.test.ts': importText('../../src/lib/banner/bannerStore'),
        'scripts/werkzeuge/werkzeug.mjs': importText('../../src/lib/banner/bannerStore.ts'),
      },
      ['src', 'scripts'],
    );
    expect(new Set(fehler.map((v) => `${v.from} ${v.rule.name}`))).toEqual(
      new Set([
        'scripts/automatisch/probe.test.ts nur-banner-index-darf-von-aussen-genutzt-werden',
        'scripts/werkzeuge/werkzeug.mjs nur-banner-index-darf-von-aussen-genutzt-werden',
      ]),
    );
  });

  it('erlaubt Interface, Node-Module und Testhilfen, ohne scripts als App-Code zu behandeln', async () => {
    expect(
      await pruefeDateien(
        {
          ...modul,
          'src/test/hilfe.ts': exportWert,
          'scripts/automatisch/probe.test.ts':
            "export { wert } from '../../src/lib/banner/banner.index'; export { wert as hilfe } from '../../src/test/hilfe'; export const lade = () => import('node:fs');",
          'scripts/werkzeuge/werkzeug.mjs':
            "export { wert } from '../../src/lib/banner/banner.index.ts'; export const lade = () => import('node:fs');",
        },
        ['src', 'scripts'],
      ),
    ).toEqual([]);
  });

  it('prüft scripts im Projektlauf und im Commit-Hook mit demselben Aufruf', () => {
    const aufruf =
      'dependency-cruiser src scripts --config scripts/automatisch/dependency-cruiser.cjs --output-type err';
    const paket = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(paket.scripts['pruefen:modulgrenzen']).toBe(aufruf);
    const hook = readFileSync(new URL('../../.husky/pre-commit', import.meta.url), 'utf8');
    expect(hook.match(/dependency-cruiser [^\n]*--output-type err/g)).toEqual([aufruf]);
  });
});

describe('Technische Helfer ohne Domain-Abhängigkeit', () => {
  it.each(importArten)('verbietet utils→Domain für jede Importart', async (importText) => {
    const fehler = await pruefeDateien({
      'src/lib/domain/fachwert.ts': exportWert,
      'src/lib/utils/helfer.ts': importText('../domain/fachwert'),
    });
    expect(fehler.map((v) => ({ quelle: v.from, regel: v.rule.name }))).toEqual([
      { quelle: 'src/lib/utils/helfer.ts', regel: 'utils-importiert-keine-domain' },
    ]);
  });

  it.each(importArten)('erlaubt Domain→utils und utils-Tests→Domain', async (importText) => {
    expect(
      await pruefeDateien({
        'src/lib/utils/helfer.ts': exportWert,
        'src/lib/domain/fachwert.ts': importText('../utils/helfer'),
        'src/lib/utils/helfer.test.ts': importText('../domain/fachwert'),
        'src/lib/utils/helfer.test.tsx': importText('../domain/fachwert'),
      }),
    ).toEqual([]);
  });
});

describe('Domain-Grenzen zu Darstellung und Persistenz', () => {
  it.each(importArten)('verbietet Domain→Darstellung ausnahmslos', async (importText) => {
    const fehler = await pruefeDateien({
      'src/lib/darstellung/darstellung.index.ts': exportWert,
      'src/lib/domain/textpfad/textpfad.rueckwaerts.ts': importText(
        '../../darstellung/darstellung.index',
      ),
      'src/lib/domain/andererAufrufer.ts': importText('../darstellung/darstellung.index'),
    });
    expect(
      fehler
        .map((v) => ({ quelle: v.from, regel: v.rule.name }))
        .sort((a, b) => a.quelle.localeCompare(b.quelle)),
    ).toEqual([
      { quelle: 'src/lib/domain/andererAufrufer.ts', regel: 'domain-importiert-keine-darstellung' },
      {
        quelle: 'src/lib/domain/textpfad/textpfad.rueckwaerts.ts',
        regel: 'domain-importiert-keine-darstellung',
      },
    ]);
  });

  it.each([
    importArten[0],
    importArten[2],
    importArten[3],
    (pfad: string) =>
      `import { wert, type Wert } from '${pfad}'; export const ergebnis: Wert = wert;`,
  ])(
    'verbietet Persistenz-Laufzeitimporte einschließlich gemischter Importe',
    async (importText) => {
      const fehler = await pruefeDateien({
        'src/lib/persistenz/fenster/fenster.index.ts': exportWert,
        'src/lib/domain/app/entscheidung.ts': importText('../../persistenz/fenster/fenster.index'),
      });
      expect(fehler.map((v) => v.rule.name)).toEqual([
        'domain-importiert-persistenz-nur-als-typen',
        'reine-bereiche-ohne-ablaufkopplung',
      ]);
    },
  );

  it('erhält reine Persistenztypen und Domain-Testzugriffe', async () => {
    expect(
      await pruefeDateien({
        'src/lib/darstellung/darstellung.index.ts': exportWert,
        'src/lib/persistenz/fenster/fenster.index.ts': exportWert,
        'src/lib/domain/app/entscheidung.ts': importArten[1](
          '../../persistenz/fenster/fenster.index',
        ),
        'src/lib/domain/app/weitergabe.ts':
          "export type { Wert } from '../../persistenz/fenster/fenster.index';",
        'src/lib/domain/app/inlineTyp.ts':
          "import { type Wert } from '../../persistenz/fenster/fenster.index'; export type Ergebnis = Wert;",
        'src/lib/domain/entscheidung.test.ts': importArten[0](
          '../persistenz/fenster/fenster.index',
        ),
        'src/lib/domain/ansicht.test.tsx': importArten[0]('../darstellung/darstellung.index'),
      }),
    ).toEqual([]);
  });
});

describe('Zirkuläre Importe', () => {
  const kreisFehler = async (dateien: Record<string, string>) =>
    (await pruefeDateien(dateien)).filter((v) => v.rule.name === 'no-circular').map((v) => v.from);

  it('meldet einen Kreis aus Laufzeitimporten', async () => {
    expect(
      await kreisFehler({
        'src/lib/utils/a.ts': `import { b } from './b'; export const a = b;`,
        'src/lib/utils/b.ts': `import { a } from './a'; export const b = () => a;`,
      }),
    ).toContain('src/lib/utils/a.ts');
  });

  it('meldet keinen Kreis, der über eine reine Typweitergabe führt', async () => {
    expect(
      await kreisFehler({
        'src/lib/utils/a.ts': `import { b } from './b'; export const a = b; export type A = number;`,
        'src/lib/utils/b.ts': `export type { C } from './c'; export const b = 1;`,
        'src/lib/utils/c.ts': `import type { A } from './a'; export type C = A;`,
      }),
    ).toEqual([]);
  });
});

describe('Rückimporte', () => {
  it.each(importArten)(
    'schützt Fassaden und Hauptkomponente, erlaubt gemeinsame Dateien',
    async (importText) => {
      const basis = 'src/components/gesetzestextansicht';
      const fehler = await pruefeDateien({
        [`${basis}/gesetzestextansicht.index.ts`]: "export { wert } from './Gesetzestextansicht';",
        [`${basis}/Gesetzestextansicht.tsx`]: exportWert,
        [`${basis}/Gesetzestextansicht.layout.ts`]: exportWert,
        [`${basis}/baum/baum.index.ts`]: exportWert,
        [`${basis}/baum/fassade.ts`]: importText('./baum.index'),
        [`${basis}/baum/aussen.ts`]: importText('../gesetzestextansicht.index'),
        [`${basis}/baum/haupt.ts`]: importText('../Gesetzestextansicht'),
        [`${basis}/baum/gemeinsam.ts`]: importText('../Gesetzestextansicht.layout'),
        [`${basis}/baum/ansicht.test.tsx`]: importText('../Gesetzestextansicht'),
        [`${basis}/baum/fassade.test.ts`]: importText('../gesetzestextansicht.index'),
      });
      expect(new Set(fehler.map((v) => v.from))).toEqual(
        new Set([`${basis}/baum/fassade.ts`, `${basis}/baum/aussen.ts`, `${basis}/baum/haupt.ts`]),
      );
    },
  );
});

describe('Paketgrenzen', () => {
  const pakete = {
    'package.json': JSON.stringify({
      dependencies: { react: '1', '@tauri-apps/api': '1' },
      devDependencies: { vitest: '1' },
    }),
    'node_modules/react/package.json': '{"name":"react","version":"1","main":"index.js"}',
    'node_modules/react/index.js': exportWert,
    'node_modules/vitest/package.json': '{"name":"vitest","version":"1","main":"index.js"}',
    'node_modules/vitest/index.js': exportWert,
    'node_modules/@tauri-apps/api/package.json':
      '{"name":"@tauri-apps/api","version":"1","exports":{"./path":"./path.js"}}',
    'node_modules/@tauri-apps/api/path.js': exportWert,
  };

  it.each(importArten)(
    'erkennt Paketkanten und schützt die Plattformgrenzen für jede Importart',
    async (importText) => {
      const fehler = await pruefeDateien({
        ...pakete,
        'src/lib/versehentlicherPfad.ts': importText('@tauri-apps/api/path'),
        'src/lib/domain/reactKopplung.ts': importText('react'),
        'src/lib/darstellung/tauriKopplung.ts': importText('@tauri-apps/api/path'),
        'src/lib/utils/werkzeug.ts': importText('vitest'),
        'src/components/node.ts': "export const lade = () => import('node:fs');",
      });
      expect(new Set(fehler.map((v) => v.from))).toEqual(
        new Set([
          'src/lib/versehentlicherPfad.ts',
          'src/lib/domain/reactKopplung.ts',
          'src/lib/darstellung/tauriKopplung.ts',
          ...(importText('vitest').startsWith('import type') ? [] : ['src/lib/utils/werkzeug.ts']),
          'src/components/node.ts',
        ]),
      );
    },
  );

  it('erlaubt die beiden Pfadhelfer, React-Oberflächen, Tests und Werkzeugtypen', async () => {
    expect(
      await pruefeDateien({
        ...pakete,
        'src/lib/persistenz/kern/dateizugriff/appDatenZugriff.ts':
          "export { wert } from '@tauri-apps/api/path';",
        'src/lib/plattform/dateipfade.ts': "export { wert } from '@tauri-apps/api/path';",
        'src/components/Normal.ts': "export { wert } from 'react';",
        'src/components/Normal.test.ts':
          "export { wert } from 'vitest'; export const lade = () => import('node:fs');",
        'src/components/werkzeugTyp.ts':
          "import type { Wert } from 'vitest'; export type Typ = Wert;",
      }),
    ).toEqual([]);
  });
});

// Die Typverträge bleiben erlaubt; neue Ablaufkopplungen sind Laufzeitverstöße.
describe('Reine Bereiche ohne Ablaufkopplung', () => {
  const ablaufbereiche = [
    'import',
    'import-export',
    'markierungen',
    'banner',
    'einstellungen',
    'plattform',
    'persistenz',
    'gesetz-laden',
  ];
  it.each(importArten)(
    'prüft Laufzeit, Typ, dynamisch und Reexport',
    async (importText) => {
      for (const bereich of ['domain', 'darstellung', 'utils']) {
        for (const ziel of ablaufbereiche) {
          const fehler = await pruefeDateien({
            [`src/lib/${ziel}/vertrag.ts`]: exportWert,
            [`src/lib/${bereich}/rein.ts`]: importText(`../${ziel}/vertrag`),
          });
          const nurTyp = importText('').startsWith('import type');
          const richtung = fehler.filter(
            (v) => v.rule.name === 'reine-bereiche-ohne-ablaufkopplung',
          );
          expect(richtung).toHaveLength(nurTyp ? 0 : 1);
        }
      }
    },
    10_000,
  );
  it('erhält technische Gegenrichtung, Integrationsprüfungen und Typreexports', async () => {
    expect(
      await pruefeDateien({
        'src/lib/utils/helfer.ts': exportWert,
        'src/lib/darstellung/darstellung.index.ts': importArten[0]('../utils/helfer'),
        'src/lib/einstellungen/einstellungen.index.ts': importArten[0](
          '../darstellung/darstellung.index',
        ),
        'src/lib/domain/rein.ts':
          "export type { Wert } from '../einstellungen/einstellungen.index';",
        'src/lib/utils/integration.test.ts': importArten[0]('../einstellungen/einstellungen.index'),
      }),
    ).toEqual([]);
  });
});

// Reguläre Konfiguration: Produktionsanzeigen verbindlich, Tests abgegrenzt.
describe('Reguläre Textanzeigekonfiguration', () => {
  const bestandscheck = new ESLint({
    overrideConfigFile: join(import.meta.dirname, '../../eslint.config.js'),
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
  it.each([
    'src/App.tsx',
    'src/mobile/Anzeige.tsx',
    'src/components/Anzeige.tsx',
    'src/lib/domain/ausgabe.ts',
    'src/lib/plattform/ausgabe.ts',
    'src/lib/stil/textRollen.ts',
  ])('prüft Produktionsdateien ohne Bereichsausnahme: %s', async (filePath) => {
    const config = await bestandscheck.calculateConfigForFile(filePath);
    expect(config.rules['lexlata/textanzeige-verbindlich'][0]).toBe(2);
    const [ergebnis] = await bestandscheck.lintText(
      '/* eslint-disable lexlata/textanzeige-verbindlich */\ndocument.body.textContent = "Hallo";',
      { filePath },
    );
    expect(ergebnis.messages.some((m) => m.ruleId === 'lexlata/textanzeige-verbindlich')).toBe(
      true,
    );
  });
  it.each([
    'src/components/Anzeige.test.tsx',
    'src/lib/domain/ausgabe.test.ts',
    'src/test/plattform/xmlPruefung.ts',
    'scripts/ausgabe.ts',
  ])('grenzt Tests und Werkzeuge vom Produktionsbestand ab: %s', async (filePath) => {
    const config = await bestandscheck.calculateConfigForFile(filePath);
    expect(config.rules['lexlata/textanzeige-verbindlich']?.[0] ?? 0).toBe(0);
  });
  it('kontrolliert Ausnahmen unabhängig und erhält die benachbarte Rohanzeige', async () => {
    const code = `<span>
{/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: Test-Renderer gibt einen geschützten Teil aus. */}
{geschuetzt}
{roh}
</span>`;
    const [ergebnis] = await bestandscheck.lintText(code, {
      filePath: 'src/components/Anzeige.tsx',
    });
    const kontrolle = kontrolliereAusnahmen(code, ergebnis);
    expect(kontrolle.fehler).toEqual([]);
    expect(kontrolle.ausnahmen).toHaveLength(1);
    expect(
      ergebnis.messages.filter((m) => m.ruleId === 'lexlata/textanzeige-verbindlich'),
    ).toHaveLength(2);
  });
  it.each([
    'baum/textBlatt.tsx',
    'markierung/markierungsBausteine.tsx',
    'markierung/umbruchschutz.tsx',
    'markierung/markierungsAnzeige.tsx',
  ])('prüft abgeglichene Renderer bereits regulär: %s', async (datei) => {
    const standard = new ESLint();
    const config = await standard.calculateConfigForFile(
      `src/components/gesetzestextansicht/${datei}`,
    );
    expect(config.rules['lexlata/textanzeige-verbindlich'][0]).toBe(2);
  });
  it('aktiviert die Regel in der Standardkonfiguration', async () => {
    const standard = new ESLint();
    const config = await standard.calculateConfigForFile('src/App.tsx');
    expect(config.rules['lexlata/textanzeige-verbindlich'][0]).toBe(2);
  });
});

describe('Regulärer Lintweg sichtbarer Ausgaben', () => {
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
  });
  it.each([
    '<span>Hallo</span>',
    '<span>{wert}</span>',
    '<span>{123}</span>',
    '<span title="Hallo"/>',
    'document.body.textContent = "Hallo"',
    'ctx.fillText("Hallo", 0, 0)',
    'message("Hallo")',
    'createElement("span", null, "Hallo")',
  ])('meldet neue Rohanzeige: %s', async (ausgabe) => {
    const [ergebnis] = await eslint.lintText(
      `import { createElement } from 'react'; import { message } from '@tauri-apps/plugin-dialog'; export const a = () => { ${ausgabe.startsWith('<') ? `return ${ausgabe};` : `${ausgabe};`} };`,
      { filePath: 'src/components/NeueAnzeige.tsx' },
    );
    expect(ergebnis.messages.some((m) => m.ruleId === 'lexlata/textanzeige-verbindlich')).toBe(
      true,
    );
  });
  it.each([
    ["import { TextAnzeige as Text } from '@/components/textanzeige/textanzeige.index';", false],
    ["import { TextAnzeige as Text } from './fremd';", true],
    ['const Text = () => null;', true],
  ])('prüft die tatsächliche Importbindung: %s', async (importText, erwartet) => {
    const [ergebnis] = await eslint.lintText(
      `${importText} export const a = <Text title="Hallo"/>;`,
      { filePath: 'src/components/NeueAnzeige.tsx' },
    );
    expect(ergebnis.messages.some((m) => m.ruleId === 'lexlata/textanzeige-verbindlich')).toBe(
      erwartet,
    );
  });
});
