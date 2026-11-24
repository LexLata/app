// Fassade des datei-import-Submoduls. Bündelt Datei-Import (ZIP/
// Mehrfachauswahl), Konfliktauflösung (.aktionen.ts) und Berichtsformate
// (.types.ts). Die Fassade benennt die von Aufrufern benötigten Typen und
// Operationen ausdrücklich.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/import-export/datei-import/** darf ausschließlich aus DIESER
// Datei importieren, nie direkt aus dateiImport.ts/.aktionen.ts/
// .einfach.ts/.types.ts/formatErkennung.ts.

export type {
  ImportKonflikt,
  ImportAktion,
  BerichtEintrag,
  DateiImportErgebnis,
  ImportFehler,
} from '@/lib/import-export/datei-import/dateiImport.types';

export type { DateiImportZustand } from '@/lib/import-export/datei-import/dateiImportVorgang';
export {
  starteDateiImport,
  abonniereDateiImportZustand,
  verwerfeDateiImportErgebnis,
  leseDateiImportZustand,
  useDateiImportZustand,
  istReinerImportErfolg,
  dateiImportErfolgstext,
} from '@/lib/import-export/datei-import/dateiImportVorgang';

export {
  gliedereImportbericht,
  betroffenesGesetz,
  meldungAlsImportFehler,
} from '@/lib/import-export/datei-import/dateiImport.types';

export {
  ermittleImportAktionen,
  loeseImportKonflikt,
} from '@/lib/import-export/datei-import/dateiImport.aktionen';

/** Öffnet die Dateiauswahl (Mehrfachauswahl XML/HTML/ZIP) und liefert die
 * gewählten Pfade; null bei Abbruch. Dialogfehler dürfen werfen. */
export async function waehleImportDateien(): Promise<string[] | null> {
  const dateiImport = await import('@/lib/import-export/datei-import/gesetzDateiImport');
  return dateiImport.waehleImportDateien();
}

export { ImportAbschlussFehler } from '@/lib/import-export/datei-import/dateiImport.types';
