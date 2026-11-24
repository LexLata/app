// importindexVertrag.types.ts
// Gemeinsame reine Typen ohne Rückabhängigkeit auf Laufzeitimplementierungen.
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import type { ImportindexSucheEintrag } from '@/lib/domain/importindexSucheEintrag';
export type { ImportindexSucheEintrag } from '@/lib/domain/importindexSucheEintrag';

export type { ImportindexKategorie } from '@/lib/domain/normgeber';
export type ImportindexErstellungErgebnis =
  { erfolg: true; anzahl: number } | { erfolg: false; fehler: string };

export type ReferenzQuelle = ImportindexKategorie;
export interface VerzeichnisFehler {
  quelle: ReferenzQuelle;
  meldung: string;
}
export interface VerzeichnisErgebnis {
  eintraege: ImportindexSucheEintrag[];
  fehler: VerzeichnisFehler[];
}
