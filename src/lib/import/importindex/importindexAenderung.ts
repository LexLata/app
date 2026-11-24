// Erfolgreiche Schreibungen lokal melden und mit technischer Absenderkennung an andere Fenster senden.
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
export const importindexAbsender = crypto.randomUUID();
// Erfolgreiche Schreibungen melden; Lesen und unveränderter Abgleich bleiben stumm.
const empfaenger = new Set<() => void>();

export function beiImportindexGeschrieben(empfangen: () => void): () => void {
  empfaenger.add(empfangen);
  return () => {
    empfaenger.delete(empfangen);
  };
}

export function meldeImportindexGeschrieben(kategorie: ImportindexKategorie): void {
  void sendeGlobal('importindex-geaendert', { kategorie, absender: importindexAbsender }).catch(
    (fehler: unknown) =>
      console.error('Importindex-Änderung konnte nicht gesendet werden:', fehler),
  );
  for (const empfangen of empfaenger) {
    try {
      empfangen();
    } catch (fehler) {
      console.error('Importindex-Schreibbenachrichtigung fehlgeschlagen:', fehler);
    }
  }
}
