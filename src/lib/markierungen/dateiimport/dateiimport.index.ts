// dateiimport.index.ts
//
// Fassade des dateiimport-Submoduls. Wird ausschließlich von
// markierungen.index.ts konsumiert – kein anderer markierungen-Unterordner
// greift hierher zurück.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/markierungen/dateiimport/** darf ausschließlich aus DIESER Datei
// importieren, nie direkt aus markierungSpeicher.dateiImport.ts.

export {
  beurteileMarkierungsImport,
  istMarkierungsImportUnveraendert,
  zusammenfuehrenMarkierungen,
  ersetzeMarkierungenDatei,
  leseMarkierungenRohtext,
} from '@/lib/markierungen/dateiimport/markierungSpeicher.dateiImport';
