// gesetzImportBW.ts
// Internet-Import und Aktualisierung für Landesrecht Baden-Württemberg
// (landesrecht-bw.de). Ausgelagert aus gesetzSpeicher.ts.
//
// landesrecht-bw.de ist eine vollständige React-SPA: das vom Server
// gelieferte HTML enthält nur eine leere Hülle, der eigentliche Inhalt wird
// erst clientseitig gerendert. Ein reiner fetch() kann den Link "Aktuelle
// Gesamtausgabe" daher nicht finden – der Download läuft stattdessen über
// ein echtes (vorerst sichtbares) WebView-Fenster auf Rust-Seite, siehe
// src-tauri/src/landesrecht_import.rs.

import type { GesetzAktualisierungsBestand } from '@/lib/domain/gesetzTypes';
import { NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import { ladeGesetzHTMLBW, parseGeladenesGesetz } from './gesetzDownloadBW';
import {
  ImportindexFormatFehler,
  sucheImImportindex,
} from '@/lib/import/importindex/importindex.index';
import {
  pruefeDateibestandVorErstimport,
  taggeUndSpeichereGesetzesXML,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import { pruefeQuelleErreichbar } from '@/lib/import/basis/basis.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type {
  AktualisierungsErgebnis,
  ImportEinzelErgebnis,
  ImportFehler,
  ImportFortschritt,
  GesetzImportZielpruefung,
} from '@/lib/import/importVertrag.types';

async function ladeGesetzHTMLUeberIndex(
  suchschluessel: string,
  fehlermeldungNichtGefunden: string,
  pruefeErstimport = false,
  zielpruefung?: GesetzImportZielpruefung,
  fortschritt?: (f: ImportFortschritt) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<
  | {
      eintrag: NonNullable<Awaited<ReturnType<typeof sucheImImportindex>>>;
      gesamtausgabeHTML: string;
    }
  | { fehler: ImportFehler }
> {
  fortschritt?.({ phase: 'download', meldung: `Suche „${suchschluessel}" im Importindex …` });
  let eintrag;
  try {
    eintrag = await sucheImImportindex(NORMGEBER_DE_BW, suchschluessel);
  } catch (fehler) {
    if (fehler instanceof ImportindexFormatFehler)
      return { fehler: { grund: 'format', meldung: fehler.message } };
    throw fehler;
  }
  if (!eintrag) return { fehler: { grund: 'nichtImIndex', meldung: fehlermeldungNichtGefunden } };

  if (pruefeErstimport && !zielpruefung) {
    const fehler = await pruefeDateibestandVorErstimport(
      { kurztitel: eintrag.kurztitel, normgeber: NORMGEBER_DE_BW },
      meldungEmpfangen,
    );
    if (fehler) return { fehler };
  }

  const erreichbarkeit = await pruefeQuelleErreichbar(NORMGEBER_DE_BW);
  if (erreichbarkeit.fehler)
    return { fehler: { grund: 'keineVerbindung', meldung: erreichbarkeit.fehler } };

  const download = await ladeGesetzHTMLBW(eintrag, fortschritt);
  if ('fehler' in download) return download;
  return { eintrag, gesamtausgabeHTML: download.gesamtausgabeHTML };
}

/**
 * Sucht `kuerzel` case-insensitiv in "de-bw.xml" (AppData;
 * wird bei Bedarf zuvor aus dem Bundle kopiert, siehe importindexSuche.ts), lädt
 * die aktuelle Gesamtausgabe des gefundenen Gesetzes als HTML herunter
 * und importiert sie direkt über den bestehenden HTML-Importpfad
 * (HTMLImporterBW → taggeUndSpeichereGesetzesXML), genau wie beim
 * Datei-Import (html-bw-Zweig in gesetzDateiImport.ts).
 * @param kuerzel  Eingabe des Nutzers – die Suche im Importindex ist case-
 *   insensitiv, der gefundene Importindex-Link wird case-sensitiv (wie im Importindex
 *   hinterlegt) für die landesrecht-bw.de-URL verwendet.
 */
export async function importiereGesetzVomInternetBW(
  kuerzel: string,
  fortschritt?: (f: ImportFortschritt) => void,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis> {
  const download = await ladeGesetzHTMLUeberIndex(
    kuerzel,
    `„${kuerzel}" wurde im Importindex Landesrecht BW nicht gefunden. Bitte Kürzel prüfen oder Importindex aktualisieren.`,
    true,
    zielpruefung,
    fortschritt,
    meldungEmpfangen,
  );
  if ('fehler' in download) return { art: 'fehler', fehler: download.fehler };
  const { eintrag, gesamtausgabeHTML } = download;

  return verarbeiteGeladenesGesetz(
    gesamtausgabeHTML,
    eintrag.kurztitel,
    fortschritt,
    undefined,
    zielpruefung,
    kontext,
    meldungEmpfangen,
  );
}

/**
 * Lädt ein bereits importiertes Gesetz (Baden-Württemberg) erneut über
 * den Importindex-Link herunter und überschreibt die gespeicherte Datei. Spiegelt
 * aktualisierungVomInternet (Bund), aber für Landesrecht BW.
 */
export async function aktualisierungGesetzVomInternetBW(
  gesetz: GesetzAktualisierungsBestand,
  fortschritt?: (f: ImportFortschritt) => void,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis> {
  const download = await ladeGesetzHTMLUeberIndex(
    gesetz.kurztitel,
    `„${gesetz.kurztitel}" wurde im Importindex Landesrecht BW nicht gefunden. Bitte Importindex aktualisieren.`,
    false,
    undefined,
    fortschritt,
    meldungEmpfangen,
  );
  if ('fehler' in download) return { art: 'fehler', fehler: download.fehler };
  const { eintrag, gesamtausgabeHTML } = download;

  return verarbeiteGeladenesGesetz(
    gesamtausgabeHTML,
    eintrag.kurztitel,
    fortschritt,
    gesetz,
    undefined,
    kontext,
    meldungEmpfangen,
  );
}

/** Gemeinsame Konvertierung und Formatfehler; der Importabschluss bleibt zentral. */
function verarbeiteGeladenesGesetz(
  html: string,
  kurztitel: string,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  bestehendes: undefined,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis>;
function verarbeiteGeladenesGesetz(
  html: string,
  kurztitel: string,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  bestehendes: GesetzAktualisierungsBestand,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis>;
async function verarbeiteGeladenesGesetz(
  html: string,
  kurztitel: string,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  bestehendes: GesetzAktualisierungsBestand | undefined,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis | AktualisierungsErgebnis> {
  const ergebnis = parseGeladenesGesetz(html, kurztitel, fortschritt);
  if (ergebnis.fehler)
    return { art: 'fehler', fehler: { grund: 'format', meldung: ergebnis.fehler } };
  const argumente = [
    ergebnis.xmlString!,
    ergebnis.kurztitel ?? '',
    fortschritt,
    undefined,
  ] as const;
  if (bestehendes)
    return taggeUndSpeichereGesetzesXML(
      ...argumente,
      true,
      bestehendes,
      zielpruefung,
      kontext,
      meldungEmpfangen,
    );
  return taggeUndSpeichereGesetzesXML(
    ...argumente,
    false,
    undefined,
    zielpruefung,
    kontext,
    meldungEmpfangen,
  );
}
