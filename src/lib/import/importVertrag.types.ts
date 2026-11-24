// importVertrag.types.ts
//
// Gemeinsame, reine Typverträge der Importpipeline. Dispatch, Quellenmodule,
// Importabschluss und äußere Fassade verwenden damit dieselben Ergebnis- und
// Fehlerformen, ohne Laufzeitabhängigkeiten oder einen Rückimport zur
// öffentlichen import.index.ts zu erzeugen.

import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { NachbereitungBeiImport } from '@/lib/einstellungen/einstellungen.index';
import type { GesetzInfos } from '@/lib/domain/gesetzInfos';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
export type ImportFehlerGrund =
  | 'laden'
  | 'nichtVerfuegbar'
  | 'nichtImIndex'
  | 'keineVerbindung'
  | 'download'
  | 'entpacken'
  | 'format'
  | 'speichern'
  | 'bereitsVorhanden'
  | 'beschaeftigt'
  | 'sonstiger';

export interface ImportFehler {
  grund: ImportFehlerGrund;
  meldung: string;
}

/** Fortschrittsmeldung innerhalb eines einzelnen Importvorgangs. */
export interface ImportFortschritt {
  phase: 'download' | 'entpacken' | 'parsen' | 'vertaggen' | 'speichern' | 'fertig';
  meldung: string;
}

export type ImportEinzelErgebnis =
  { art: 'erfolg'; gesetz: GesetzDarstellung } | { art: 'fehler'; fehler: ImportFehler };

export type AktualisierungsKategorie = 'unveraendert' | 'aktualisiert';

export type AktualisierungsErgebnis =
  | { art: 'erfolg'; gesetz: GesetzDarstellung; kategorie: AktualisierungsKategorie }
  | { art: 'fehler'; fehler: ImportFehler };

export type GesetzDateiFormat = 'bja-xml' | 'kanonisch-xml' | 'html-bw';

/** Nachbereitungsfehler melden ausgelassenen Satzaufbau einzelner Normen;
 * das sichere Importergebnis bleibt für Speicherung oder Konfliktentscheidung erhalten. */
export type GesetzDateiErgebnis =
  | { art: 'neu' | 'unveraendert'; kurztitel: string; nachbereitungsfehler?: string[] }
  | {
      art: 'konflikt';
      kurztitel: string;
      neuesXML: string;
      neuesGesetz: GesetzInfos;
      nachbereitungsfehler?: string[];
      bestehendeVerarbeitungszeit?: Date;
      importierteVerarbeitungszeit?: Date;
    }
  | { art: 'fehler'; fehler: ImportFehler };

export interface ImportindexExportDatei {
  name: string;
  inhalt: string;
}

/** Eingabe für Bund/BW; EU und mitgelieferte GesetzesXML-Dateien benötigen CELEX oder Dateiname als abrufkennung. */
export type GesetzImportEingabe = string | { kurztitel: string; abrufkennung: string };

export interface GesetzImportErgebnis {
  erfolgreiche: GesetzDarstellung[];
  fehlgeschlagene: { kurztitel: string; fehler: ImportFehler }[];
}

export interface GesetzAktualisierungsErgebnis {
  aktualisierteReferenzen: Gesetzesreferenz[];
  unveraenderteGesetze: GesetzDarstellung[];
  fehlgeschlagene: { gesetz: Gesetzesreferenz; fehler: ImportFehler }[];
  nachricht: string | null;
}

/** Auswahl ohne Aktualisierung; ein benötigter unlesbarer Index verwirft den ganzen Bestand. */
export type AktualisierbareGesetzeErgebnis =
  | {
      art: 'ermittelt';
      kandidaten: LesbarerSuchverzeichniseintrag[];
      nichtImImportindex: LesbarerSuchverzeichniseintrag[];
    }
  | { art: 'importindexNichtLesbar' };

/** Registrierung umfasst Indexprüfung und Aktualisierung und wird bei jedem Abschluss freigegeben. */
export type AutomatischeAktualisierungErgebnis =
  | { art: 'zurueckgestellt' }
  /** Keine der benötigten Quellen erreichbar; stiller Abbruch, nächster Durchlauf versucht es erneut. */
  | { art: 'keineVerbindung' }
  | { art: 'importindexNichtLesbar' }
  | { art: 'ausgefuehrt'; ergebnis: GesetzAktualisierungsErgebnis };

/** Das konkrete Reparaturziel; gleichnamige Gesetze anderer Quellen sind eigenständig. */
export interface GesetzReparaturZiel {
  dateiBasis: string;
  kurztitel: string;
  quelle: ImportindexKategorie;
}

/** Optionale Zielprüfung für Quellenimporte. Der Callback prüft den aktuellen
 * Dateizustand unmittelbar vor dem Schreiben und bricht bei Bedarf durch Werfen ab. */
export interface GesetzImportZielpruefung {
  ziel: GesetzReparaturZiel;
  vorSchreiben: () => Promise<void>;
}

/** Tatsächlich erreichter Zustand eines einzelnen Reparaturziels. */
export type GesetzReparaturErgebnis =
  | {
      status: 'repariert' | 'bereits_gueltig';
      ziel: GesetzReparaturZiel;
      gesetz: GesetzDarstellung;
    }
  | {
      status: 'archiviert' | 'gesichert_aber_nicht_entfernt';
      ziel: GesetzReparaturZiel;
      sicherungspfad: string;
    }
  | { status: 'fehlt' | 'leer'; ziel: GesetzReparaturZiel }
  | {
      status: 'beschaeftigt' | 'verbindungsfehler' | 'fehler';
      ziel: GesetzReparaturZiel;
      fehler: ImportFehler;
    }
  | { status: 'unlesbar' | 'sicherung_fehlgeschlagen'; ziel: GesetzReparaturZiel; fehler: string };

export type GesetzDateiImport = (
  format: GesetzDateiFormat,
  inhalt: string,
  optionen?: {
    nachbereitungBeiImport?: NachbereitungBeiImport;
    /** Dateiweise Diagnosezustellung; keine Aussage über den Speichererfolg. */
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
  },
) => Promise<GesetzDateiErgebnis>;
