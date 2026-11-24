// dateipfade.ts
// Plattformfunktionen für mitgelieferte Ressourcen und allgemeine Exportpfade.
// Den Datenordner ermittelt ausschließlich plattform/datenordner.ts.
export {
  resolveResource as ressourcenPfad,
  join as verbindeDateipfad,
  downloadDir as downloadsOrdner,
  dirname as ermittleDateiordner,
} from '@tauri-apps/api/path';
