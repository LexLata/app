import { defineConfig } from 'vitest/config';

// Eigene, von vite.config.ts getrennte Konfiguration: vite.config.ts enthält
// Tauri-spezifische Server-Optionen (fester Port, HMR-Host etc.), die für
// Testläufe irrelevant sind. Beide nutzen dieselbe native tsconfigPaths-
// Auflösung (seit Vite 8), damit der @/*-Alias identisch aufgelöst wird.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Node-Umgebung als Standard (schnell, kein Browser-DOM nötig) – Tests,
    // die echtes Rendering/RTL brauchen, überschreiben dies einzeln per
    // `// @vitest-environment jsdom`-Kommentar am Dateikopf.
    environment: 'node',
    setupFiles: ['./src/test/setupNode.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    coverage: {
      // Nur json-summary: wird von scripts/audit/coverage-zusammenfassung.mjs für
      // die kompakte audit.sh-Zeile ausgewertet. Kein html/text-Reporter,
      // um den Terminal-Output beim Audit-Lauf nicht zuzumüllen – bei Bedarf
      // lokal `npx vitest run --coverage --coverage.reporter=html` einzeln
      // aufrufen.
      provider: 'v8',
      reporter: ['json-summary'],
      reportsDirectory: '.reports/coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
});
