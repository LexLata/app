import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import keineUnskaliertenPx from './eslint-rules/keine-unskalierten-px.cjs';
import textanzeigeVerbindlich from './eslint-rules/textanzeige-verbindlich.cjs';
import tauriInvokeGrenze from './eslint-rules/tauri-invoke-grenze.cjs';
import interfaceDurchreichen from './eslint-rules/interface-durchreichen.cjs';

export default tseslint.config(
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    // '**/'-Präfix bewusst: ohne ihn matchen diese Patterns NUR exakt auf
    // Root-Ebene, nicht rekursiv (ESLint-Flat-Config-Verhalten, kein
    // .gitignore-Verhalten). Das führte real zu einem Heap-OOM, als eine
    // liegengebliebene Stryker-Sandbox (.stryker-tmp/sandbox-*/, entsteht
    // bei einem harten Absturz ohne Cleanup) eine verschachtelte Kopie von
    // src-tauri/target enthielt, die so NICHT ausgeschlossen wurde – ESLint
    // hat dann versucht, zehntausende Rust-Build-Artefakte einzulesen.
    ignores: [
      '**/dist',
      '**/src-tauri/target',
      '**/src-tauri/gen',
      '**/node_modules',
      '**/.stryker-tmp',
      '**/reports',
      '**/coverage',
      '.claude/worktrees',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      // Typinformationen für die gezielt aktivierten Regeln. Das vollständige
      // recommendedTypeChecked-Preset bleibt bewusst außen vor.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      lexlata: {
        rules: {
          'keine-unskalierten-px': keineUnskaliertenPx,
          'interface-durchreichen': interfaceDurchreichen,
          'tauri-invoke-grenze': tauriInvokeGrenze,
          'textanzeige-verbindlich': textanzeigeVerbindlich,
        },
      },
      sonarjs: { rules: { 'cognitive-complexity': sonarjs.rules['cognitive-complexity'] } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/incompatible-library': 'error',
      // Der React Compiler ist nicht aktiv. Ref-Spiegel und Zustandsresets
      // in Effekten bleiben bewusst erlaubt; immutability gilt unten für
      // Produktionsdateien.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      // Verhindert Dateien, die neben Komponenten auch andere Exports haben
      // (bricht sonst Vite Fast Refresh) – Konstanten-Exports erlaubt.
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
        },
      ],
      // Bereits über tsc --noEmit (noUnusedLocals/noUnusedParameters)
      // abgedeckt – keine doppelte Fehlerquelle.
      '@typescript-eslint/no-unused-vars': 'off',
      // Nie unskalierte px-Literale (siehe Projektregel).
      'lexlata/keine-unskalierten-px': 'error',
      // Vergessenes 'await' vor invoke()/Promise-Aufrufen bleibt sonst still –
      // gerade bei Tauri-Commands ein realer, schwer bemerkbarer Fehlerklasse.
      // War zunächst 'warn' (56 Bestandsfunde bei Einführung) – seit deren
      // vollständigem Abbau (s. Chat) auf 'error' hochgestuft, kein eigener
      // audit.sh-Fortschrittscheck mehr nötig (ESLint blockiert jetzt selbst
      // jeden Commit mit einem neuen Fund).
      '@typescript-eslint/no-floating-promises': 'error',
      // Nur diese eine Regel aus sonarjs/recommended – der Rest des Presets
      // erzeugte im Test ~130 zusätzliche Funde, größtenteils Rauschen für
      // unseren Stil (v.a. no-nested-conditional gegen JSX-Ternaries).
      'sonarjs/cognitive-complexity': 'error',
      // Erzwingt den @/*-Alias (siehe tsconfig.json) statt relativer
      // Parent-Imports ('../...') – unabhängig von der Tiefe der
      // importierenden Datei bleibt der Importpfad stabil bei Verschiebungen.
      // Gleiche-Ebene-Imports ('./...') bleiben bewusst erlaubt.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*'],
              message:
                "Bitte den '@/...'-Alias statt eines relativen Parent-Imports ('../...') verwenden.",
            },
          ],
        },
      ],
    },
  },
  {
    // Produktionsregeln einschließlich Mobile; Testaufbau enthält bewusst Rohanzeigen
    // und await auf synchronen Attrappen.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.*', 'src/test/**'],
    rules: {
      'lexlata/textanzeige-verbindlich': 'error',
      'lexlata/tauri-invoke-grenze': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      'react-hooks/immutability': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Modul-Interfaces reichen keine Namen um- oder von außen durch
    // (eslint-rules/interface-durchreichen.cjs), ausnahmslos.
    files: ['src/**/*.index.ts'],
    rules: { 'lexlata/interface-durchreichen': 'error' },
  },
  {
    // src/mobile/* nutzt aktuell KEIN Skalierungssystem (useUiSkalierungsFaktor
    // wird dort nirgends aufgerufen) – eigene Entscheidung (Touch-Ziel-
    // Mindestgrößen vs. Desktop-UI-Größe-Einstellung) noch offen, daher
    // separat vom übrigen px-Sweep ausgenommen, siehe Rückfrage im Chat.
    files: ['src/mobile/**'],
    rules: { 'lexlata/keine-unskalierten-px': 'off' },
  },
  {
    // textRollen.ts enthält die UNSKALIERTEN Rohwerte, aus denen
    // useTextRollen() erst die skalierten Werte berechnet (siehe
    // skaliereFontSize() dort) – die Regel kann hier strukturell nicht
    // greifen, da sie verlangen würde, dass die Rolle sich selbst
    // referenziert. Anders als bei buttonRollen.ts (nur 1 Fund, dort
    // punktuell mit radiusRollen gelöst) betrifft das hier alle 9 Rollen-
    // Definitionen gleichermaßen – daher Datei-Ausnahme statt 9 Einzel-
    // Disables.
    files: ['src/lib/stil/textRollen.ts'],
    rules: { 'lexlata/keine-unskalierten-px': 'off' },
  },
  eslintConfigPrettier,
);
