// praefixlauf.types.ts
// Umgebungsvertrag und Bericht des Prüflauf-Kerns.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import type { LaufAusgabe } from '@/lib/import/quelldateien/quelldateien.index';
import type { LaufBericht } from '@/lib/import/quelldateien/quelldateien.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { Praefixstruktur } from '@/lib/domain/praefixstruktur';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';

export type PraefixlaufLadeErgebnis = (
  { gesetz: GesetzDarstellung; fehler?: never } | { fehler: string; gesetz?: never }
) & { netz: boolean; gesetzesXMLGeloescht?: boolean };

/**
 * Alles, was der Prüflauf von außen braucht. Die Tauri-Anbindung und die
 * Importer stellen sie im Betrieb bereit, Tests liefern Fakes.
 */
export interface PraefixlaufUmgebung extends LaufAusgabe {
  leseDateistand(
    normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
  ): Promise<{ quellen: string[]; gesetzesxml: string[] }>;
  /** Inhalt der PräfixstrukturXML oder null, wenn die Datei noch fehlt. */
  leseListe(): Promise<string | null>;
  /** Ersetzt die Datei atomar; wirft bei Fehler (beendet den Lauf). */
  schreibeListe(xml: string): Promise<void>;
  /** Alle Importindex-Einträge des Normgebers in Indexreihenfolge. */
  ladeKandidaten(
    normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
  ): Promise<ImportindexSucheEintrag[]>;
  /**
   * Erzeugt GesetzesXML aus einer vorhandenen Quelldatei immer neu; andernfalls
   * lädt und speichert die Beschaffung zuerst die Quelle. Die Beschaffung
   * verantwortet die Wartezeiten. Gesetzfehler ergeben `fehler`, Dateifehler
   * werfen. Ausschließlich Repository-Arbeitsdateien werden verändert.
   */
  ladeGesetz(
    normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
    eintrag: ImportindexSucheEintrag,
    meldeSchritt?: (schritt: string) => Promise<void>,
    quelleVorhanden?: boolean,
  ): Promise<PraefixlaufLadeErgebnis>;
  /** Prüft einmal je Lauf, ob die Quelle erreichbar ist; null = erreichbar. */
  pruefeErreichbarkeit(
    normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
  ): Promise<string | null>;
  /** Eine Zeile Fortschritt für das Terminal. */
  ausgabe(zeile: string): void | Promise<void>;
  /** Wartet die angegebene Zeit. */
  pause(millisekunden: number): Promise<void>;
  /** Zufallszahl im Bereich [0, 1). */
  zufall(): number;
}

/** Bericht eines Prüflaufs. */
export interface PraefixlaufBericht extends LaufBericht {
  /** Erfolgreich geprüfte Gesetze dieses Laufs je Wert (ohne Standardwert-Auslassung). */
  geprueft: Record<Praefixstruktur | 'leer', number>;
  /** Erfolgreich im Repository gespeicherte GesetzesXML dieses Laufs. */
  gespeichert: number;
  /** Kurztitel, die übersprungen wurden, weil sie bereits geprüft sind. */
  uebersprungen: string[];
  /**
   * Gesetze, die nicht geladen oder gelesen werden konnten oder deren Kurztitel im
   * Importindex nicht eindeutig ist; als gescheitert gespeichert.
   */
  fehlgeschlagen: { kurztitel: string; meldung: string }[];
  /** Anzahl der Importindex-Einträge ohne gespeicherten Befund oder Fehlschlag. */
  verbleibendUngeprueft: number;
}
