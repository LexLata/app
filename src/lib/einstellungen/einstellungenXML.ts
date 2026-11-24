// Schlüsselzuordnung, XML-Abbildung und Übernahme des Einstellungsbestands;
// ohne Backup-Auslösung, damit Import und Wiederherstellung getrennt bleiben.
import {
  EU_FASSUNG_KEY,
  EU_DURCHFUEHRUNGSAKT_SUCHE_KEY,
} from '@/lib/einstellungen/speicherschluessel';
import { escapeXML, isoZeitstempel, liesXmlWurzel, xmlText } from '@/lib/utils/xmlVerarbeitung';
import { AUTO_AKTUALISIERUNGS_INTERVALL_KEY as INTERVALL_KEY } from '@/lib/einstellungen/speicherschluessel';
import { LEISTEN_TAUSCHEN_KEY } from '@/lib/einstellungen/speicherschluessel';
import { APP_UPDATES_AUTOMATISCH_SUCHEN_KEY } from '@/lib/einstellungen/speicherschluessel';
import { APP_AKZENTFARBE_KEY } from '@/lib/einstellungen/speicherschluessel';
import { FARBSCHEMA_KEY } from '@/lib/einstellungen/speicherschluessel';
import { GESETZESTEXT_AKZENTFARBE_KEY } from '@/lib/einstellungen/speicherschluessel';
import { HERVORHEBUNGSFARBE_KEY } from '@/lib/einstellungen/speicherschluessel';
import { LINUX_TITELLEISTEN_KEY } from '@/lib/einstellungen/speicherschluessel';
import { MARKIERUNGEN_DEAKTIVIERT_KEY } from '@/lib/einstellungen/speicherschluessel';
import { MINIMALISTISCHER_MODUS_KEY } from '@/lib/einstellungen/speicherschluessel';
import { NACHBEREITUNG_BEI_IMPORT_KEY } from '@/lib/einstellungen/speicherschluessel';
import { PLATTFORMFREMDE_UI_KEY } from '@/lib/einstellungen/speicherschluessel';
import { SEITENLEISTEN_TASTENKUERZEL_KEY } from '@/lib/einstellungen/speicherschluessel';
import {
  SCHRIFT_KEY,
  LEISTEN_SCHRIFT_KEY,
  SCHRIFTART_KEY,
  ZEILENABSTAND_KEY,
  BLOCKSATZ_KEY,
  SATZ_NEU_ZEILE_KEY,
  SILBENTRENNUNG_KEY,
  RANDBREITE_KEY,
  STRUKTURKONTEXTLEISTE_GROESSE_KEY,
  LESBARE_ZEILENLAENGE_KEY,
  LESBARE_ZEILENLAENGE_BREITE_KEY,
} from '@/lib/einstellungen/speicherschluessel';
import { UI_GROESSE_KEY } from '@/lib/einstellungen/speicherschluessel';
import {
  ABKUERZUNGEN_AKTIV_KEY as ZITAT_ABKUERZUNGEN_AKTIV_KEY,
  OHNE_PUNKT_KEY as ZITAT_OHNE_PUNKT_KEY,
  ROEMISCHE_ABSAETZE_KEY as ZITAT_ROEMISCHE_ABSAETZE_KEY,
} from '@/lib/einstellungen/speicherschluessel';

// ---------------------------------------------------------------------------
// Key-Listen
// ---------------------------------------------------------------------------

/**
 * Feste XML-Tags und zugehörige interne Speicherschlüssel. Die Reihenfolge
 * hält Exporte reproduzierbar. Tags und rohe localStorage-Strings gehören
 * zum Dateiformat; Umbenennungen interner Schlüssel ändern die Tags nicht.
 */
export const XML_TAG_ZU_SPEICHERSCHLUESSEL = {
  farbschema: FARBSCHEMA_KEY,
  appAkzentfarbe: APP_AKZENTFARBE_KEY,
  gesetzestextAkzentfarbe: GESETZESTEXT_AKZENTFARBE_KEY,
  hervorhebungsfarbe: HERVORHEBUNGSFARBE_KEY,
  schriftgroesse: SCHRIFT_KEY,
  leistenSchriftgroesse: LEISTEN_SCHRIFT_KEY,
  schriftart: SCHRIFTART_KEY,
  zeilenabstand: ZEILENABSTAND_KEY,
  satzNeuZeile: SATZ_NEU_ZEILE_KEY,
  blocksatz: BLOCKSATZ_KEY,
  silbentrennung: SILBENTRENNUNG_KEY,
  randbreite: RANDBREITE_KEY,
  strukturKontextLeisteGroesse: STRUKTURKONTEXTLEISTE_GROESSE_KEY,
  lesbareZeilenlaenge: LESBARE_ZEILENLAENGE_KEY,
  lesbareZeilenlaengeBreite: LESBARE_ZEILENLAENGE_BREITE_KEY,
  uiGroesse: UI_GROESSE_KEY,
  markierungenDeaktiviert: MARKIERUNGEN_DEAKTIVIERT_KEY,
  minimalistischerModus: MINIMALISTISCHER_MODUS_KEY,
  nachbereitungBeiImport: NACHBEREITUNG_BEI_IMPORT_KEY,
  euFassung: EU_FASSUNG_KEY,
  euDurchfuehrungsaktSuche: EU_DURCHFUEHRUNGSAKT_SUCHE_KEY,
  seitenleistenTastenkuerzel: SEITENLEISTEN_TASTENKUERZEL_KEY,
  autoAktualisierungIntervall: INTERVALL_KEY,
  linuxTitelleistenPraeferenz: LINUX_TITELLEISTEN_KEY,
  plattformfremdeUiAnzeigen: PLATTFORMFREMDE_UI_KEY,
  zitatAbkuerzungenAktiv: ZITAT_ABKUERZUNGEN_AKTIV_KEY,
  zitatOhnePunkt: ZITAT_OHNE_PUNKT_KEY,
  zitatRoemischeAbsaetze: ZITAT_ROEMISCHE_ABSAETZE_KEY,
  leistenTauschen: LEISTEN_TAUSCHEN_KEY,
  appUpdatesAutomatischSuchen: APP_UPDATES_AUTOMATISCH_SUCHEN_KEY,
} as const;

export const EXPORTIERBARE_SCHLUESSEL: readonly string[] = Object.values(
  XML_TAG_ZU_SPEICHERSCHLUESSEL,
);

/** Prüft, ob AKTUELL keine der exportierbaren Einstellungen explizit
 *  gesetzt ist (reiner Default-Zustand, noch nie geändert). Wird von
 *  dateiImport.ts genutzt, um einen Import in genau diesem Fall wie
 *  "kein Bestand vorhanden" zu behandeln (sofort übernehmen, kein
 *  Konflikt/keine Nutzer-Rückfrage) – anders als bei echten Dateien gibt es
 *  hier sonst nie ein "kein Bestand", da baueEinstellungenXML() immer eine
 *  (ggf. leere) Vergleichsbasis liefert. */
export function istEinstellungsbestandLeer(schluessel: readonly string[]): boolean {
  return !schluessel.some((key) => EXPORTIERBARE_SCHLUESSEL.includes(key));
}

export function keineEinstellungExplizitGesetzt(): boolean {
  const gesetzt = EXPORTIERBARE_SCHLUESSEL.filter((schluessel) => {
    try {
      return localStorage.getItem(schluessel) !== null;
    } catch {
      return false;
    }
  });
  return istEinstellungsbestandLeer(gesetzt);
}

/** Baut die Export-XML frisch aus dem AKTUELLEN localStorage-Zustand –
 *  wird sowohl vom eigentlichen Export (exportSpeicher.ts) als auch vom
 *  Import-Konfliktvergleich (dateiImport.ts, als Vergleichsbasis
 *  statt des Backups) verwendet. Keys
 *  ohne expliziten localStorage-Wert (noch nie geändert, siehe
 *  useLocalStorageState.ts) werden ausgelassen statt mit ihrem Default
 *  aufgefüllt – Reset entspricht dadurch "Key ganz entfernen", nicht
 *  "Key mit Enstellungen.xml-Default überschreiben". */
export function baueEinstellungenXML(): string {
  const zeilen: string[] = [];
  for (const [tag, schluessel] of Object.entries(XML_TAG_ZU_SPEICHERSCHLUESSEL)) {
    let wert: string | null;
    try {
      wert = localStorage.getItem(schluessel);
    } catch {
      wert = null;
    }
    if (wert === null) continue;
    zeilen.push(`    <${tag}>${escapeXML(wert)}</${tag}>`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<einstellungen version="1">',
    `    <verarbeitungszeit>${isoZeitstempel(new Date())}</verarbeitungszeit>`,
    ...zeilen,
    '</einstellungen>',
  ].join('\n');
}

/** Entfernt den verarbeitungszeit-Tag für den Inhaltsvergleich zweier Fassungen
 *  (Zeitstempel soll allein keinen Konflikt auslösen) – analog zu
 *  ohneZeitstempel/gesetzesXMLOhneVeraenderlicheFelder an den entsprechenden Stellen für die
 *  anderen Export-Kategorien. */
export function einstellungenOhneVerarbeitungszeit(xml: string): string {
  return xml.replace(/<verarbeitungszeit>[^<]*<\/verarbeitungszeit>/, '');
}

/** Löst ein StorageEvent AUF DIESEM Fenster manuell aus – das native
 *  `storage`-Event feuert per Web-Standard NIE im schreibenden Fenster
 *  selbst (siehe useLocalStorageState.ts-Kopfkommentar), sondern nur in
 *  ANDEREN Fenstern desselben Ursprungs. Andere Fenster bekommen die
 *  Änderung dadurch bereits automatisch mit (funktioniert schon heute
 *  fensterübergreifend für dieselben Keys); nur das aktuelle Fenster
 *  bräuchte ohne diesen manuellen Dispatch einen Neustart, um seine
 *  bereits gemounteten Einstellungs-Hooks (z. B. useFarbschema in
 *  App.tsx/EinstellungenFenster.tsx) auf den neuen Wert zu bringen. */
export function sendeStorageEvent(schluessel: string, neuerWert: string | null): void {
  try {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: schluessel,
        newValue: neuerWert,
        storageArea: localStorage,
      }),
    );
  } catch {
    // StorageEvent-Konstruktor nicht verfügbar (sollte in jeder unterstützten
    // WebView-Engine funktionieren) – betrifft dann nur die Live-Aktualisierung
    // in DIESEM Fenster, localStorage selbst ist trotzdem aktuell.
  }
}

/** Übernimmt eine importierte Einstellungen-XML vollständig ("Ersetzen",
 *  einziges Angebot im DateiImportOverlay – siehe ermittleImportAktionen):
 *  setzt zunächst ALLE exportierbaren Keys zurück (damit ein in der
 *  importierten Fassung fehlender Key nicht seinen aktuellen, evtl. vom
 *  Import abweichenden Wert behält – echtes "Ersetzen" statt "Zusammen-
 *  führen"), übernimmt danach die in der XML enthaltenen Werte. */
export function uebernehmeEinstellungenXML(xml: string): {
  aenderungsstand: 'keine' | 'teilweise' | 'vollstaendig';
  fehler: string[];
} {
  const root = liesXmlWurzel(xml, 'einstellungen');
  const fehler: string[] = [];
  let geaendert = false;
  const uebernehmen = (schluessel: string, wert: string | null) => {
    let vorher: string | null | undefined;
    try {
      vorher = localStorage.getItem(schluessel);
    } catch {
      /* Lesen bestätigt keine Änderung. */
    }
    try {
      if (wert === null) localStorage.removeItem(schluessel);
      else localStorage.setItem(schluessel, wert);
      geaendert ||= wert !== null || (vorher !== undefined && vorher !== null);
      sendeStorageEvent(schluessel, wert);
    } catch {
      fehler.push(
        `Die Einstellung „${schluessel.replace('lexlata.', '')}“ konnte nicht ${wert === null ? 'entfernt' : 'gesetzt'} werden.`,
      );
    }
  };
  for (const schluessel of EXPORTIERBARE_SCHLUESSEL) uebernehmen(schluessel, null);
  for (const [tag, schluessel] of Object.entries(XML_TAG_ZU_SPEICHERSCHLUESSEL)) {
    const wert = xmlText(root, tag) ?? null;
    if (wert !== null) uebernehmen(schluessel, wert);
  }
  return {
    aenderungsstand: fehler.length ? (geaendert ? 'teilweise' : 'keine') : 'vollstaendig',
    fehler,
  };
}
