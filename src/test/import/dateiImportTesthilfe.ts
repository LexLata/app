// dateiImportTesthilfe.ts
// Einziger Testzugang zum Einlesen des Datei-Imports ohne den Overlay-Zustand
// des Datei-Import-Vorgangs (die App nutzt es nur über starteDateiImport).
// Bündelt den genehmigten Direktimport an einer Stelle, statt ihn in jedem
// Test einzeln freizugeben.
export { importierePfade } from '@/lib/import-export/datei-import/gesetzDateiImport';
