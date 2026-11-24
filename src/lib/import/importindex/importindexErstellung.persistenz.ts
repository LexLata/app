// importindexErstellung.persistenz.ts
// Aus importindexErstellung.ts ausgelagerter Teil (500-Zeilen-Richtwert): alles
// rund um das AppData-Ablageformat der Importindex-Dateien – Pfad, <verarbeitungszeit>-
// Zeitstempel-Vergleich/-Auffrischung, herkunft-Attribut (Standard aus
// resources/importindizes vs. selbst per Live-Abruf erstellt, siehe
// ImportindexOverlay.tsx) und das bedingte Schreiben selbst. importindexErstellung.ts
// enthält die Erstellungslogik und stellt diese Funktionen intern bereit.

import { meldeImportindexGeschrieben } from './importindexAenderung';

import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import { SaxesParser } from 'saxes';
import { liesXmlWurzel, xmlKind } from '@/lib/utils/xmlVerarbeitung';
import { isoZeitstempel, liesVerarbeitungszeitstempel } from '@/lib/utils/xmlVerarbeitung';
import {
  sicherstelleOrdner,
  appDatenLesen,
  appDatenSchreiben,
} from '@/lib/persistenz/kern/kern.index';

import {
  validiereImportindex,
  kategorieFuerDateiname,
  dateinameFuerKategorie,
} from './importindexValidierung';
import { mitImportindexSchreibabschnitt } from './importindexSchreibkoordination';
// ---------------------------------------------------------------------------
// Änderungs-Erkennung für den <verarbeitungszeit>-Zeitstempel: Bei inhaltlich
// unverändertem Importindex NUR den Zeitstempel aufzufrischen, statt die ganze
// Datei neu zu schreiben, und den Nutzer entsprechend zu informieren
// ("keine Änderungen").
// ---------------------------------------------------------------------------

/** Bestimmt nur den direkten Zeitstempel unter infos. SAX-Positionen erlauben
 *  die Änderung, ohne andere Inhalte, Attribute oder die Formatierung anzufassen. */
function zeitstempelBereich(
  xml: string,
): { start: number; inhaltStart: number; inhaltEnde: number; ende: number } | null {
  const parser = new SaxesParser({ xmlns: true });
  const pfad: string[] = [];
  let start = 0;
  let inhaltStart = 0;
  let zeitStart = 0;
  let bereich: ReturnType<typeof zeitstempelBereich> = null;
  parser.on('opentagstart', () => {
    start = xml.lastIndexOf('<', parser.position - 1);
  });
  parser.on('opentag', (tag) => {
    pfad.push(tag.name);
    if (pfad.join('/') === 'importindex/infos/verarbeitungszeit') {
      inhaltStart = parser.position;
      zeitStart = start;
    }
  });
  parser.on('closetag', () => {
    if (pfad.join('/') === 'importindex/infos/verarbeitungszeit' && !bereich) {
      bereich = {
        start: zeitStart,
        inhaltStart,
        inhaltEnde: xml.lastIndexOf('</', parser.position - 1),
        ende: parser.position,
      };
    }
    pfad.pop();
  });
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: zeitstempelBereich liest Importindex-XML mit SaxesParser für originale Zeichenpositionen; importindexErstellung.persistenz.test.ts prüft Zeitstempelentfernung und Persistenz.
  parser.write(xml).close();
  return bereich;
}

/** Entfernt den <verarbeitungszeit>-Zeitstempel aus einem Importindex-XML-String, für den
 *  reinen Inhaltsvergleich (Zeitstempel selbst ist keine inhaltliche
 *  Änderung). Robust gegen ein evtl. vorhandenes herkunft-Attribut (siehe
 *  ImportindexOverlay.tsx), da dieses ebenfalls keine inhaltliche Änderung ist. */
export function importindexOhneVerarbeitungszeit(xml: string): string {
  try {
    const bereich = zeitstempelBereich(xml);
    return bereich ? xml.slice(0, bereich.start) + xml.slice(bereich.ende) : xml;
  } catch {
    // Beschädigten Rohbestand unverändert vergleichen: Der neue Importindex wird
    // separat validiert und ersetzt ihn vollständig.
    return xml;
  }
}

/** Ersetzt nur den Inhalt des <verarbeitungszeit>-Tags in einem bereits gespeicherten
 *  Importindex-XML-String, ohne den Rest der Datei anzufassen – für den Fall, dass
 *  ein frisch erzeugter Importindex inhaltlich (siehe importindexOhneVerarbeitungszeit) exakt
 *  dem bestehenden entspricht. Ein evtl. vorhandenes herkunft-Attribut bleibt
 *  erhalten (nur der Textinhalt des Tags wird ersetzt). */
export function mitNeuerVerarbeitungszeit(xml: string, zeit: Date): string {
  const bereich = zeitstempelBereich(xml);
  return bereich
    ? xml.slice(0, bereich.inhaltStart) + isoZeitstempel(zeit) + xml.slice(bereich.inhaltEnde)
    : xml;
}

/** AppData-Unterordner für alle Importindex-Dateien (Bundesrecht, Landesrecht BW,
 *  inkl. der Backup-Datei "de-bw.xml.vorherige-version") –
 *  vorher direkt im AppData-Wurzelverzeichnis. Zentral hier (statt in
 *  importindexSuche.ts, wo die Dateinamen-Konstanten liegen) definiert, damit
 *  importindexVorinstallation.ts diese Funktion nutzen kann, ohne einen
 *  Modul-Zirkelbezug mit importindexSuche.ts einzugehen (importindexSuche.ts importiert
 *  bereits synchronisiereEineDatei aus importindexVorinstallation.ts). Alle
 *  Stellen, die eine Importindex-Datei in AppData lesen/schreiben
 *  (importindexVorinstallation.ts, importindexErstellungBW.ts, exportSpeicher.ts,
 *  dateiImport.ts), verwenden diese Funktion statt den Dateinamen
 *  direkt als Pfad zu nutzen. */
export function importindexAppDataPfad(dateiname: string): string {
  return `importindizes/${dateiname}`;
}

/** Liest den <verarbeitungszeit>-Zeitpunkt aus einem rohen Importindex-XML-Text – egal ob
 *  aus einer bereits in AppData liegenden oder einer zu importierenden
 *  Datei. Für den Datei-Import-Dopplungsvergleich (siehe
 *  dateiImport.ts): "ist der importierte Importindex neuer als der
 *  bestehende?", UND für die Anzeige im ImportindexOverlay. Liefert null, wenn
 *  kein (gültiger) verarbeitungszeit-Tag vorliegt. Robust gegen das optionale
 *  herkunft-Attribut am Tag (siehe leseHerkunft/setzeHerkunft unten). */
export function liesVerarbeitungszeit(xml: string): Date | null {
  const zeit = xmlKind(xmlKind(liesXmlWurzel(xml, 'importindex'), 'infos'), 'verarbeitungszeit');
  return liesVerarbeitungszeitstempel(zeit?.textContent?.trim()) ?? null;
}

/** Liest das herkunft-Attribut aus einem rohen Importindex-XML-Text (siehe
 *  setzeHerkunft unten) – "standard" für einen unverändert aus
 *  resources/importindizes kopierten Importindex, "nutzer" für einen per Live-Abruf
 *  erstellten. Fehlt das optionale Attribut oder ist sein Wert unbekannt,
 *  wird "nutzer" angenommen. */
export function leseHerkunft(xml: string): 'nutzer' | 'standard' {
  const zeit = xmlKind(xmlKind(liesXmlWurzel(xml, 'importindex'), 'infos'), 'verarbeitungszeit');
  return zeit?.getAttribute('herkunft') === 'standard' ? 'standard' : 'nutzer';
}

/** Setzt (bzw. überschreibt) das herkunft-Attribut im <verarbeitungszeit>-Tag –
 *  unterscheidet für die Anzeige im ImportindexOverlay, ob der aktuell in AppData
 *  liegende Importindex der mitgelieferte Standard ist oder von einem Live-Abruf
 *  (erstelleBundesImportindex/erstelleLandesrechtBWImportindexNeu) stammt. Wird sowohl
 *  beim Kopieren aus dem Bundle (importindexVorinstallation.ts, herkunft
 *  "standard") als auch beim Auffrischen eines unveränderten Live-Abrufs
 *  (speichereImportindexAktualisierung unten, herkunft "nutzer") verwendet. */
export function setzeHerkunft(xml: string, herkunft: 'nutzer' | 'standard'): string {
  const bereich = zeitstempelBereich(xml);
  if (!bereich) return xml;
  const tag = xml.slice(bereich.start, bereich.inhaltStart);
  let gefunden = false;
  let angepasst = tag.replace(
    /(\s+)([^\s=/>]+)(\s*=\s*)(["'])(.*?)\4/gs,
    (attribut, abstand: string, name: string, gleich: string) => {
      if (name !== 'herkunft') return attribut;
      gefunden = true;
      return `${abstand}${name}${gleich}"${herkunft}"`;
    },
  );
  if (!gefunden) angepasst = angepasst.replace(/>$/, ` herkunft="${herkunft}">`);
  return xml.slice(0, bereich.start) + angepasst + xml.slice(bereich.inhaltStart);
}

/**
 * Schreibt `xml` nach AppData, aber nur, wenn es sich inhaltlich (ohne den
 * <verarbeitungszeit>-Zeitstempel) von einer evtl. bestehenden Datei unterscheidet –
 * sonst wird lediglich der Zeitstempel in der bestehenden Datei
 * aufgefrischt. Bündelt die Orchestrierung (lesen -> vergleichen ->
 * passend schreiben), die zuvor in importindexErstellungBund.ts und
 * importindexErstellungBW.ts identisch dupliziert war (zwei echte Anwendungsfälle
 * rechtfertigen die gemeinsame Funktion). Wirft bei Lese-/Schreibfehlern wie
 * die zugrundeliegenden Tauri-fs-Aufrufe – Aufrufer fangen das wie bisher
 * selbst ab, um ihre eigene Banner-Fehlermeldung zu zeigen.
 *
 * BEWUSST NICHT mit dem `verarbeitungszeit`-Muster des Gesetz-Imports
 * (gesetzImportAbschluss.ts) zusammengelegt: dort hängt das Analogon
 * (`inhaltGeaendert`) zusätzlich an Markierungskonflikt-Neuprüfung und
 * 'gesetze-geaendert'-Broadcast – Seiteneffekte, die es bei Importindexdateien gar
 * nicht gibt. Gemeinsame Substanz wäre dort nur noch die Zwei-Zeilen-Regex
 * (importindexOhneVerarbeitungszeit/gesetzesXMLOhneVeraenderlicheFelder sind strukturell ohnehin schon
 * eigenständig), der Rest ist zufällige Ähnlichkeit, keine echte Dopplung.
 */
async function schreibeImportindexIntern(
  dateiname: string,
  xml: string,
  // Bereits im selben Schreibabschnitt gelesener Bestand (null = Erstlauf);
  // wird nicht erneut gelesen, damit Vergleich und Sicherung auf demselben Stand beruhen.
  bestehendesXml: string | null,
): Promise<{ unveraendert: boolean }> {
  await sicherstelleOrdner('importindizes');
  const appDataPfad = importindexAppDataPfad(dateiname);

  const unveraendert =
    bestehendesXml !== null &&
    importindexOhneVerarbeitungszeit(bestehendesXml) === importindexOhneVerarbeitungszeit(xml);

  if (unveraendert) {
    // speichereImportindexAktualisierung wird ausschließlich von den Live-Abruf-
    // Funktionen (erstelleBundesImportindex/erstelleLandesrechtBWImportindexNeu)
    // aufgerufen – auch ein inhaltlich unveränderter Refresh ist also ein
    // Nutzer-Lauf, ein evtl. vorher gesetztes herkunft="standard" muss auf
    // "nutzer" umgestellt werden (nicht nur der Zeitstempel).
    await appDatenSchreiben(
      appDataPfad,
      mitNeuerVerarbeitungszeit(setzeHerkunft(bestehendesXml!, 'nutzer'), new Date()),
    );
  } else {
    await appDatenSchreiben(appDataPfad, xml);
  }

  meldeImportindexGeschrieben(kategorieFuerDateiname(dateiname));
  return { unveraendert };
}

/** Optionen werden innerhalb der Koordination vor dem ersten Backup/Schreiben geprüft. */
export interface ImportindexSpeicherOptionen {
  sichereVorherigeVersion?: boolean;
  erwarteterBestand?: string | null;
  pruefeAbbruch?: () => boolean;
  beginneSpeichern?: () => void;
}

export async function speichereImportindexAktualisierung(
  kategorie: ImportindexKategorie,
  xml: string,
  optionen?: ImportindexSpeicherOptionen,
): Promise<{ unveraendert: boolean }> {
  validiereImportindex(xml, kategorie);
  return mitImportindexSchreibabschnitt(kategorie, async () => {
    const dateiname = dateinameFuerKategorie(kategorie);
    let vorherigesXml: string | null = null;
    try {
      vorherigesXml = await appDatenLesen(importindexAppDataPfad(dateiname));
    } catch {
      /* Erstinstallation: keine Sicherung vorhanden. */
    }
    if (optionen?.pruefeAbbruch?.()) throw new Error('Indexaktualisierung abgebrochen.');
    if (
      optionen &&
      'erwarteterBestand' in optionen &&
      vorherigesXml !== optionen.erwarteterBestand
    ) {
      throw new Error(
        'Der Importindex wurde während der Vorbereitung verändert. Bitte den Abgleich erneut starten.',
      );
    }
    const aktualisiertesXml = mitNeuerVerarbeitungszeit(setzeHerkunft(xml, 'nutzer'), new Date());
    validiereImportindex(aktualisiertesXml, kategorie);
    const inhaltGeaendert =
      vorherigesXml !== null &&
      importindexOhneVerarbeitungszeit(vorherigesXml) !==
        importindexOhneVerarbeitungszeit(aktualisiertesXml);
    optionen?.beginneSpeichern?.();
    if (optionen?.sichereVorherigeVersion && inhaltGeaendert) {
      await sicherstelleOrdner('importindizes');
      await appDatenSchreiben(
        importindexAppDataPfad(`${dateiname}.vorherige-version`),
        vorherigesXml!,
      );
    }
    return schreibeImportindexIntern(dateiname, aktualisiertesXml, vorherigesXml);
  });
}
