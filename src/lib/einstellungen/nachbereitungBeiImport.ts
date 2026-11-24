// nachbereitungBeiImport.ts
// Liest den vierwertigen Importmodus; localStorage bleibt die einzige Quelle.
import { NACHBEREITUNG_BEI_IMPORT_KEY } from './speicherschluessel';

export type NachbereitungBeiImport = 'aus' | 'verweise' | 'saetze' | 'saetze-und-verweise';

export function parseNachbereitungBeiImport(roh: string | null): NachbereitungBeiImport {
  return roh === 'verweise' || roh === 'saetze' || roh === 'saetze-und-verweise' ? roh : 'aus';
}

export function leseNachbereitungBeiImport(): NachbereitungBeiImport {
  try {
    return parseNachbereitungBeiImport(localStorage.getItem(NACHBEREITUNG_BEI_IMPORT_KEY));
  } catch {
    return 'aus';
  }
}
