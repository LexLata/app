// importindexSuche.ts
// Sucht einen Kurztitel case-insensitiv in den Importindex-XMLs
// ("de-bund.xml", "de-bw.xml", "eu.xml") in AppData und
// liefert den zugehörigen Importindex-Eintrag (insbesondere den korrekt
// groß-/kleingeschriebenen Kurztitel sowie den Link) zurück.
//
// Bund-/BW-Quellen und das Öffnen-Overlay nutzen denselben Indexzugriff,
// sodass Schreibweise und Link aus dem gespeicherten Eintrag stammen.
//
// "Importindex sicherstellen" bedeutet: existiert die Datei in AppData noch nicht
// (oder ist sie älter als die mitgelieferte Bundle-Version), wird sie aus
// dem Bundle kopiert – dieselbe Regel wie beim App-Start
// (importindexVorinstallation.ts), hier nur zusätzlich bei Bedarf (on demand) statt
// nur einmalig beim Start ausgelöst, für den Fall, dass die Datei zwischen
// Start und Suche gelöscht wurde.

import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import { meldeImportindexGeschrieben } from './importindexAenderung';

import {
  sicherstelleOrdner,
  appDatenLesen,
  appDatenSchreiben,
} from '@/lib/persistenz/kern/kern.index';
import {
  importindexAppDataPfad,
  liesVerarbeitungszeit,
  leseHerkunft,
} from './importindexErstellung.persistenz';
import {
  validiereImportindex,
  kategorieFuerDateiname,
  dateinameFuerKategorie,
} from './importindexValidierung';
import { leseImportindexEintraege } from './importindexZugriff';
import { mitImportindexSchreibabschnitt } from './importindexSchreibkoordination';
export { ImportindexFormatFehler } from './importindexValidierung';
import {
  istImportindexAktiv,
  type ImportindexKategorie,
} from '@/lib/import/importindex/importindexErstellungSteuerung';

export type { ImportindexKategorie } from '@/lib/import/importindex/importindexErstellungSteuerung';

export const IMPORTINDEX_BUNDESRECHT_DATEINAME = 'de-bund.xml';
export const IMPORTINDEX_LANDESRECHT_BW_DATEINAME = 'de-bw.xml';
export const IMPORTINDEX_EUROPARECHT_DATEINAME = 'eu.xml';

// Bewusst NICHT "ImportindexEintrag" genannt (Namenskollision mit dem deutlich
// reichhaltigeren ImportindexEintrag in importindexErstellung.ts, der zusätzliche, nur
// während der Indexerstellung selbst relevante Felder wie duplikatVon,
// kurztitelBwZusatz, permalinkArt etc. führt). Hier geht es NUR um das
// schlanke Lese-/Suchformat, das alle Aufrufer außerhalb der
// Indexerstellung (Öffnen-Overlay, Verweismarkierung-Auflösung, Datei-Import, ...)
// tatsächlich brauchen.
export type { ImportindexSucheEintrag } from './importindexVertrag.types';
import type { ImportindexSucheEintrag } from './importindexVertrag.types';

/**
 * Stellt sicher, dass der Importindex in AppData vorhanden ist, liest ihn und
 * sucht case-insensitiv nach `kurztitel`. Gibt `null` zurück, wenn kein
 * passender Eintrag gefunden wurde.
 */
export async function sucheImImportindex(
  kategorie: ImportindexKategorie,
  kurztitel: string,
): Promise<ImportindexSucheEintrag | null> {
  const eintraege = await leseGesamtenImportindex(dateinameFuerKategorie(kategorie));

  const gesucht = kurztitelVergleichsform(kurztitel).trim();
  return eintraege.find((e) => kurztitelVergleichsform(e.kurztitel) === gesucht) ?? null;
}

/**
 * Wie sucheImImportindex, aber sucht case-insensitiv nach `langtitel` statt nach
 * `kurztitel`. Wird beim lokalen Datei-Import von Bundesrecht/Landesrecht BW
 * genutzt (siehe gesetzDateiVerarbeitung.ts): dort liegt aus der Quelldatei kein
 * verlässlicher Kurztitel vor (Bund: jurabk kann von der im Importindex gepflegten
 * Schreibweise abweichen; BW: aus dem HTML-<title> abgeleitet), wohl aber ein
 * Langtitel, über den der korrekte, im Importindex gepflegte Kurztitel gefunden
 * werden kann.
 */
export async function sucheImImportindexPerLangtitel(
  kategorie: ImportindexKategorie,
  langtitel: string,
): Promise<ImportindexSucheEintrag | null> {
  const eintraege = await leseGesamtenImportindex(dateinameFuerKategorie(kategorie));

  const gesucht = langtitel.trim().toLowerCase();
  if (!gesucht) return null;
  return eintraege.find((e) => e.langtitel.toLowerCase() === gesucht) ?? null;
}

/**
 * Stellt sicher, dass der Importindex in AppData vorhanden ist, und liest ihn
 * vollständig ein (z.B. für den Abgleich beim Verweistagging im
 * Importabschluss, das gegen den kompletten Importindex statt nur gegen
 * installierte Gesetze prüft).
 */
export async function leseGesamtenImportindex(
  dateiname: string,
): Promise<ImportindexSucheEintrag[]> {
  const kategorie = kategorieFuerDateiname(dateiname);
  return leseImportindexEintraege(kategorie);
}

/** Alle Einträge einer Importindex-Kategorie (Bund, BW oder EU) – für die Fuzzy-Suche
 *  im Öffnen-Overlay (OeffnenOverlay.tsx/OeffnenScreen.tsx),
 *  wenn keine installierte Übereinstimmung gefunden wurde. leseGesamtenImportindex
 *  stellt selbst sicher, dass die Datei in AppData vorhanden ist (kopiert
 *  sie bei Bedarf aus dem Bundle), bevor gelesen wird. */
export async function alleImportindexEintraege(
  kategorie: ImportindexKategorie,
): Promise<ImportindexSucheEintrag[]> {
  return leseGesamtenImportindex(dateinameFuerKategorie(kategorie));
}

// ---------------------------------------------------------------------------
// Datei-Import (siehe dateiImport.ts)
// ---------------------------------------------------------------------------

/** Ergebnis einer geprüften Importindexdateiübernahme. */
export interface ImportindexDateiErgebnis {
  kategorie: ImportindexKategorie;
  aktion: 'neu' | 'unveraendert';
}
/** Metadaten des Bestands und fensterlokaler Live-Aktivstatus. */
export interface ImportindexStatus {
  aktiv: boolean;
  verarbeitungszeit: Date | null;
  herkunft: 'nutzer' | 'standard' | null;
}

/** Prüft die Eingabe vor jedem Bestandszugriff. Innerhalb der Schreibkoordination
 * wird ausschließlich ein neuerer gültiger Dateistand übernommen. */
export async function uebernehmeImportindexDatei(
  inhalt: string,
): Promise<ImportindexDateiErgebnis> {
  const { kategorie, zeit } = validiereImportindex(inhalt);
  const pfad = importindexAppDataPfad(dateinameFuerKategorie(kategorie));
  return mitImportindexSchreibabschnitt(kategorie, async () => {
    let bestehendeZeit: Date | null = null;
    try {
      bestehendeZeit = validiereImportindex(await appDatenLesen(pfad), kategorie).zeit;
    } catch {
      /* kein gültiger Bestand */
    }
    if (bestehendeZeit && zeit <= bestehendeZeit) return { kategorie, aktion: 'unveraendert' };
    await sicherstelleOrdner('importindizes');
    await appDatenSchreiben(pfad, inhalt);
    meldeImportindexGeschrieben(kategorie);
    return { kategorie, aktion: 'neu' };
  });
}

/** AppData-Pfad der Importindex-Datei zu `kategorie` – Kürzel für
 *  `importindexAppDataPfad(dateinameFuerKategorie(kategorie))` an Stellen, die nur
 *  die ImportindexKategorie kennen (import.index.ts), nicht den internen
 *  Dateinamen. */
export function importindexDateiPfad(kategorie: ImportindexKategorie): string {
  return importindexAppDataPfad(dateinameFuerKategorie(kategorie));
}

/** Kombinierter Status einer Importindex-Datei für ImportindexOverlay.tsx: ob gerade ein
 *  Erstellungs-/Abgleichslauf für `kategorie` läuft (istImportindexAktiv,
 *  importindexErstellungSteuerung.ts) sowie Erstellungszeitpunkt/Herkunft des
 *  aktuellen Bestands (vorher lokal in ImportindexOverlay.tsx: ladeIndexMeta).
 *  `verarbeitungszeit`/`herkunft` sind `null`, wenn (noch) keine Datei
 *  existiert (istImportindexAktiv bezieht sich NICHT auf Dateiexistenz,
 *  sondern nur auf einen laufenden Vorgang, kann also unabhängig davon
 *  true sein, z.B. während des allerersten Erstellungslaufs).
 *
 *  ABWEICHUNG vom ursprünglichen Entwurf (der eine synchrone Signatur
 *  vorsah): das Lesen der AppData-Datei (appDatenLesen) ist asynchron
 *  (Tauri-IPC) – ein synchroner Rückgabetyp hätte einen neuen, laufend
 *  aktuell zu haltenden In-Memory-Cache erfordert, was dem Plan-Abschnitt
 *  5 ("keine neue Zustandsquelle") widersprochen hätte. Async ist hier die
 *  einfachere, verhaltensgleiche Lösung (siehe Umbauplan Abschnitt 6). */
export async function importindexStatus(
  kategorie: ImportindexKategorie,
): Promise<ImportindexStatus> {
  const aktiv = istImportindexAktiv(kategorie);
  try {
    const xml = await appDatenLesen(importindexDateiPfad(kategorie));
    return { aktiv, verarbeitungszeit: liesVerarbeitungszeit(xml), herkunft: leseHerkunft(xml) };
  } catch {
    return { aktiv, verarbeitungszeit: null, herkunft: null };
  }
}

// ---------------------------------------------------------------------------
// XML-Parsing (Gegenstück zu serialisiereImportindex in importindexErstellungBund.ts /
// importindexErstellungBW.ts)
// ---------------------------------------------------------------------------
