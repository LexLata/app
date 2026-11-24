// aktualisierungsNachricht.ts
//
// Reine Formatierung der Aktualisierungsergebnisse. Die Kategorie stammt
// aus dem gemeinsamen Importvertrag; hier werden keine Quellenmodule geladen.

import type { AktualisierungsKategorie } from '@/lib/import/importVertrag.types';

/** Die Kategorien stammen aus dem gemeinsamen Importvertrag. */
export type { AktualisierungsKategorie } from '@/lib/import/importVertrag.types';

/** Baut aus den Aktualisierungs-Ergebnissen mehrerer Gesetze den gemeinsamen
 *  Benachrichtigungstext. Gibt null zurück, wenn keine Ergebnisse vorliegen. */
export function baueAktualisierungsNachricht(
  ergebnisse: { kurztitel: string; kategorie: AktualisierungsKategorie }[],
): string | null {
  if (ergebnisse.length === 0) return null;

  const aktualisiert = ergebnisse
    .filter((e) => e.kategorie === 'aktualisiert')
    .map((e) => e.kurztitel);
  if (aktualisiert.length === 0) return 'Keine Neuerungen.';

  const listeFormat = new Intl.ListFormat('de', { style: 'long', type: 'conjunction' });
  return `${aktualisiert.length > 1 ? 'Dateien' : 'Datei'} aktualisiert: ${listeFormat.format(aktualisiert)}.`;
}
