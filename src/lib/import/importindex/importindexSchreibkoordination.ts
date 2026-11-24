// importindexSchreibkoordination.ts
// Serialisiert ausschließlich laufende Schreibabschnitte je Kategorie im Fenster.
import type { ImportindexKategorie } from './importindexVertrag.types';
const warteschlangen = new Map<ImportindexKategorie, Promise<void>>();
export async function mitImportindexSchreibabschnitt<T>(
  kategorie: ImportindexKategorie,
  arbeit: () => Promise<T>,
): Promise<T> {
  const vorher = warteschlangen.get(kategorie) ?? Promise.resolve();
  let freigeben!: () => void;
  const fertig = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const ende = vorher.then(() => fertig);
  warteschlangen.set(kategorie, ende);
  await vorher;
  try {
    return await arbeit();
  } finally {
    freigeben();
    if (warteschlangen.get(kategorie) === ende) warteschlangen.delete(kategorie);
  }
}
