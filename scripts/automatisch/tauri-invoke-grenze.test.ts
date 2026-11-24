// Quelltextproben für direkte, umbenannte und dynamische Umgehungen der Befehlsgrenze.
import { createRequire } from 'node:module';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const regel = require('../../eslint-rules/tauri-invoke-grenze.cjs');
function pruefe(quelle: string, datei = 'src/probe.ts') {
  return new Linter().verify(
    quelle,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tseslint.parser },
        plugins: { lexlata: { rules: { grenze: regel } } },
        rules: { 'lexlata/grenze': 'error' },
      },
    ],
    { filename: datei },
  );
}
it.each([
  "export { invoke as aufruf } from '@tauri-apps/api/core'",
  "export * from '@tauri-apps/api/core'",
  "import { invoke } from '@tauri-apps/api/core'; invoke('x')",
  "import { invoke as aufruf } from '@tauri-apps/api/core'; aufruf('x')",
  "import * as core from '@tauri-apps/api/core'; core.invoke('x')",
  "import * as core from '@tauri-apps/api/core'; core['invoke']('x')",
  "import * as core from '@tauri-apps/api/core'; const { invoke: aufruf } = core; aufruf('x')",
  "const { invoke } = await import('@tauri-apps/api/core'); invoke('x')",
  "const core = await import('@tauri-apps/api/core'); core.invoke('x')",
  "let core; core = await import('@tauri-apps/api/core'); core.invoke('x')",
  "import * as core from '@tauri-apps/api/core'; const alias = core; alias.invoke('x')",
  "(await import('@tauri-apps/api/core')).invoke('x')",
  "import('@tauri-apps/api/core').then(({invoke}) => invoke('x'))",
  "import('@tauri-apps/api/core').then(core => core.invoke('x'))",
])('sperrt %s', (quelle) =>
  expect(pruefe(quelle).some((m) => m.ruleId === 'lexlata/grenze')).toBe(true),
);
it.each([
  "import { isTauri } from '@tauri-apps/api/core'; isTauri()",
  "import * as core from '@tauri-apps/api/core'; core.isTauri()",
  "const { isTauri } = await import('@tauri-apps/api/core'); isTauri()",
  "import { rufeBefehl } from './tauri-befehle.index'; rufeBefehl('neues_fenster_anfordern')",
])('erlaubt %s', (quelle) => expect(pruefe(quelle)).toEqual([]));
it.each(['src/probe.test.ts', 'src/test/probe.ts', 'src/lib/plattform/tauri-befehle/aufruf.ts'])(
  'erlaubt invoke im freigegebenen Bereich %s',
  (datei) => expect(pruefe("import { invoke } from '@tauri-apps/api/core'", datei)).toEqual([]),
);
