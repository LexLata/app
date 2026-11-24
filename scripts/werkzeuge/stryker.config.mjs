// scripts/werkzeuge/stryker.config.mjs
//
// Wird von mutation.sh ausdrücklich übergeben; alle Pfade gelten relativ zur
// Projektwurzel (Arbeitsverzeichnis des npm-Skripts).
//
// Mutation Testing, bewusst NICHT Teil von audit.sh (zu langsam für einen
// häufigen Lauf) und OHNE Hard-Threshold (break: null) – reines
// Diagnose-Werkzeug, kein Gate.
//
// mutate ist absichtlich auf die Test-Pflicht-Schicht beschränkt
// (src/lib/domain, src/lib/darstellung, src/lib/persistenz und
// src/lib/markierungen/zitat). Das reine Zitatmodul gehört trotz seines
// eigenen Modulorts weiterhin zur getesteten Logik. Für alles außerhalb
// (React-Komponenten, Hooks, dünne I/O-Orchestrierung) ist laut Projektkonvention oft bewusst wenig/nichts
// getestet – dort würde Stryker nur Rauschen erzeugen (viele "No Coverage"-
// Mutanten ohne Erkenntniswert), nicht wegen der Laufzeit (coverageAnalysis
// 'perTest' überspringt Testläufe für ungetesteten Code ohnehin schnell).
//
// Aufruf: npm run mutation           (ganze Pflicht-Schicht, default ohne .test.ts files)
//         npm run mutation -- --mutate 'src/lib/markierungen/zitat/**/*.ts,!src/lib/markierungen/zitat/**/*.test.ts'  (spezifischer Ordner ohne .test.ts files)
export default {
  // Vitest-Update nur mit aussagekräftigem Stryker-Gegencheck übernehmen:
  // Mit Stryker 10.0.0 + Vitest 5.0.2 überlebten alle 7 Mutanten von
  // src/lib/domain/app/tabAktivierung.ts fälschlich (0 Tests je Mutant),
  // obwohl der normale Vitest-Lauf bestand. Mit Vitest 4.1.11 wurden alle
  // 7 getötet. Beim nächsten Versuch nach einem Runner-Fix oder einer anderen
  // Korrektur normale Tests, Coverage und einen Mutationstest ausführen;
  // dessen erkennbar fehlerhafte Mutanten müssen wieder getötet werden.
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  // Native Build-Artefakte und ihre Android-Symlinks nicht kopieren.
  // Nur die beiden Importindizes braucht der Leistungstest der Kurztitelsuche
  // auch innerhalb der Stryker-Sandbox; der übrige native Baum bleibt ausgeschlossen.
  ignorePatterns: [
    'src-tauri/**',
    '!src-tauri/resources/indizes/index-bundesrecht.xml',
    '!src-tauri/resources/indizes/index-landesrecht-bw.xml',
    'src-tauri/gen',
    'src-tauri/target',
    'public',
  ],
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/domain/**/*.{ts,tsx}',
    'src/lib/darstellung/**/*.{ts,tsx}',
    'src/lib/persistenz/**/*.{ts,tsx}',
    'src/lib/markierungen/zitat/**/*.ts',
    '!src/lib/domain/**/*.test.{ts,tsx}',
    '!src/lib/darstellung/**/*.test.{ts,tsx}',
    '!src/lib/persistenz/**/*.test.{ts,tsx}',
    '!src/lib/markierungen/zitat/**/*.test.ts',
  ],
  // 'progress' zeigt nur einen Live-Fortschrittsbalken (kein Terminal-
  // Rauschen). 'clear-text' NUR mit reportScoreTable – die kompakte
  // Pro-Datei-Tabelle (inkl. 'total'- UND 'covered'-Score-Spalte), aber
  // ohne die Test-/Mutanten-Einzelauflistung (die kommt jetzt exklusiv aus
  // scripts/werkzeuge/mutation-zusammenfassung.mjs → .reports/mutation/zusammenfassung.txt,
  // NICHT ins Terminal). 'json' als Rohdaten-Quelle für dieses Skript.
  // 'html' bleibt für die interaktive Detail-Exploration im Browser.
  reporters: ['html', 'json', 'clear-text', 'progress'],
  clearTextReporter: {
    reportTests: false,
    reportMutants: false,
    reportScoreTable: true,
  },
  htmlReporter: {
    fileName: '.reports/mutation/index.html',
  },
  // json-Reporter schreibt ohne explizite Angabe nach reports/mutation/
  // mutation.json (Stryker-Default) – hier auf denselben .reports/-Ort wie
  // der html-Reporter und audit.sh umgebogen.
  jsonReporter: {
    fileName: '.reports/mutation/mutation.json',
  },
  // Static Mutants (Code, der nur einmal beim Modul-Laden läuft, nicht pro
  // Testlauf) wurden zunächst über ignoreStatic:true übersprungen – das
  // führte aber zu False-Positive-"Survived"-Meldungen bei Dateien mit
  // verhaltensrelevanten Top-Level-Lookup-Tabellen (z.B.
  // zitatParser.tokenizer.ts: SONDER_MUSTER, ZUSATZ_WOERTER, …): bei
  // ignoreStatic:true + "hybrider" perTest-Coverage testet Stryker den
  // Mutanten nur gegen EINEN zufällig gefundenen Test statt gegen die
  // tatsächlich einschlägigen (siehe Analyse vom 2026-08-26). Deshalb
  // projektweit auf ignoreStatic:false umgestellt – Laufzeit-Mehrkosten in
  // der Praxis vernachlässigbar.
  ignoreStatic: false,
  // Info-Werkzeug, kein Gate: kein Build-Abbruch bei niedrigem Score.
  thresholds: { high: 80, low: 60, break: null },
};
