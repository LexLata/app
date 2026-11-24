// importindexExport.ts
// Liest die vorhandenen Importindizes für den Export.

import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import { appDatenLesen } from '@/lib/persistenz/kern/kern.index';
import {
  IMPORTINDEX_BUNDESRECHT_DATEINAME,
  IMPORTINDEX_EUROPARECHT_DATEINAME,
  IMPORTINDEX_LANDESRECHT_BW_DATEINAME,
  importindexDateiPfad,
} from '@/lib/import/importindex/importindexSuche';
import type { ImportindexExportDatei } from '@/lib/import/importVertrag.types';

export async function leseImportindizesFuerExport(): Promise<ImportindexExportDatei[]> {
  const kategorien = [
    { kategorie: NORMGEBER_DE_BUND, name: IMPORTINDEX_BUNDESRECHT_DATEINAME },
    { kategorie: NORMGEBER_DE_BW, name: IMPORTINDEX_LANDESRECHT_BW_DATEINAME },
    { kategorie: NORMGEBER_EU, name: IMPORTINDEX_EUROPARECHT_DATEINAME },
  ] satisfies { kategorie: ImportindexKategorie; name: string }[];
  const ergebnisse = await Promise.all(
    kategorien.map(async ({ kategorie, name }) => {
      try {
        return { name, inhalt: await appDatenLesen(importindexDateiPfad(kategorie)) };
      } catch {
        return null;
      }
    }),
  );
  return ergebnisse.filter((datei): datei is ImportindexExportDatei => datei !== null);
}
