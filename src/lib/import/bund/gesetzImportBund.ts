// gesetzImportBund.ts
// Internet-Import und Aktualisierung für Bundesrecht (gesetze-im-internet.de):
// ZIP-Download, Entpacken, Weiterleitung an die bestehende Importer-Pipeline
// (XMLImporterBund.ts) und Speicherung. Ausgelagert aus gesetzSpeicher.ts, da
// diese Download-Logik (im Gegensatz zu Landesrecht BW, das über eine
// WebView läuft) rein Bund-spezifisch ist.

import type { GesetzAktualisierungsBestand } from '@/lib/domain/gesetzTypes';
import { NORMGEBER_DE_BUND } from '@/lib/domain/normgeber';
import { importiereBundXML } from '@/lib/import/bund/XMLImporterBund';
import {
  ImportindexFormatFehler,
  sucheImImportindex,
  type ImportindexSucheEintrag,
} from '@/lib/import/importindex/importindex.index';
import { ladeUndEntpackeVonGesetzeImInternet } from './gesetzDownloadBund';
import {
  pruefeDateibestandVorErstimport,
  taggeUndSpeichereGesetzesXML,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type {
  AktualisierungsErgebnis,
  ImportEinzelErgebnis,
  ImportFehler,
  ImportFortschritt,
  GesetzImportZielpruefung,
} from '@/lib/import/importVertrag.types';

async function sucheBundeseintrag(
  kurztitel: string,
): Promise<{ eintrag: ImportindexSucheEintrag | null } | { fehler: ImportFehler }> {
  try {
    return { eintrag: await sucheImImportindex(NORMGEBER_DE_BUND, kurztitel) };
  } catch (fehler) {
    if (fehler instanceof ImportindexFormatFehler)
      return { fehler: { grund: 'format', meldung: fehler.message } };
    throw fehler;
  }
}

/** Importieren, Verweise taggen, parsen, speichern – der gemeinsame Kern
 *  für Bund-Internet-Import und Bund-Aktualisierung. Ein vorhandenes
 *  Bestandsobjekt unterscheidet die Aktualisierung vom Erstimport.
 *  Wird außerdem vom Datei-Import (bja-xml-Zweig) genutzt, siehe
 *  gesetzDateiImport.ts. */
function verarbeiteUndSpeichere(
  eintrag: ImportindexSucheEintrag,
  fortschritt?: (f: ImportFortschritt) => void,
  kurztitelOverride?: string,
  bestehendesGesetz?: undefined,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis>;
function verarbeiteUndSpeichere(
  eintrag: ImportindexSucheEintrag,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  kurztitelOverride: string | undefined,
  bestehendesGesetz: GesetzAktualisierungsBestand,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis>;
async function verarbeiteUndSpeichere(
  eintrag: ImportindexSucheEintrag,
  fortschritt?: (f: ImportFortschritt) => void,
  kurztitelOverride?: string,
  bestehendesGesetz?: GesetzAktualisierungsBestand,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis | AktualisierungsErgebnis> {
  const download = await ladeUndEntpackeVonGesetzeImInternet(
    eintrag.abrufkennung,
    `Gesetz „${eintrag.kurztitel}" konnte nicht von gesetze-im-internet.de heruntergeladen werden.`,
    fortschritt,
  );
  if (download.fehler)
    return { art: 'fehler', fehler: { grund: download.fehlerGrund, meldung: download.fehler } };
  fortschritt?.({ phase: 'parsen', meldung: 'XML wird importiert …' });
  const ergebnis = importiereBundXML(download.xmlString!, 'Gesetze im Internet', kurztitelOverride);

  if (ergebnis.fehler)
    return { art: 'fehler', fehler: { grund: 'format', meldung: ergebnis.fehler } };

  if (bestehendesGesetz) {
    return taggeUndSpeichereGesetzesXML(
      ergebnis.xmlString!,
      ergebnis.kurztitel ?? '',
      fortschritt,
      'Importiertes XML konnte nicht gelesen werden.',
      true,
      bestehendesGesetz,
      zielpruefung,
      kontext,
      meldungEmpfangen,
    );
  }
  return taggeUndSpeichereGesetzesXML(
    ergebnis.xmlString!,
    ergebnis.kurztitel ?? '',
    fortschritt,
    'Importiertes XML konnte nicht gelesen werden.',
    false,
    undefined,
    zielpruefung,
    kontext,
    meldungEmpfangen,
  );
}

/**
 * Sucht `kuerzel` case-insensitiv in "de-bund.xml" (AppData; wird
 * bei Bedarf zuvor aus dem Bundle kopiert, siehe importindexSuche.ts) und lädt das
 * gefundene Gesetz von gesetze-im-internet.de herunter.
 * @param kuerzel   Eingabe des Nutzers, z.B. "bgb", "StGB", "GG"
 * @param fortschritt  Callback für Fortschrittsmeldungen
 */
export async function importiereVomInternet(
  kuerzel: string,
  fortschritt?: (f: ImportFortschritt) => void,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis> {
  fortschritt?.({ phase: 'download', meldung: `Suche „${kuerzel}" im Importindex …` });
  const suche = await sucheBundeseintrag(kuerzel);
  if ('fehler' in suche) return { art: 'fehler', fehler: suche.fehler };
  const { eintrag } = suche;
  if (!eintrag) {
    return {
      art: 'fehler',
      fehler: {
        grund: 'nichtImIndex',
        meldung: `„${kuerzel}" wurde im Importindex Bundesrecht nicht gefunden. Bitte Kürzel prüfen oder Importindex aktualisieren.`,
      },
    };
  }

  if (!zielpruefung) {
    const fehler = await pruefeDateibestandVorErstimport(
      { kurztitel: eintrag.kurztitel, normgeber: NORMGEBER_DE_BUND },
      meldungEmpfangen,
    );
    if (fehler) return { art: 'fehler', fehler };
  }

  return verarbeiteUndSpeichere(
    eintrag,
    fortschritt,
    eintrag.kurztitel,
    undefined,
    zielpruefung,
    kontext,
    meldungEmpfangen,
  );
}

/**
 * Lädt ein bereits importiertes Gesetz erneut von gesetze-im-internet.de herunter
 * und überschreibt die gespeicherte Datei.
 */
export async function aktualisierungVomInternet(
  gesetz: GesetzAktualisierungsBestand,
  fortschritt?: (f: ImportFortschritt) => void,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis> {
  fortschritt?.({ phase: 'download', meldung: `Suche „${gesetz.kurztitel}" im Importindex …` });
  const suche = await sucheBundeseintrag(gesetz.kurztitel);
  if ('fehler' in suche) return { art: 'fehler', fehler: suche.fehler };
  const { eintrag } = suche;
  if (!eintrag) {
    return {
      art: 'fehler',
      fehler: {
        grund: 'nichtImIndex',
        meldung: `„${gesetz.kurztitel}" wurde im Importindex Bundesrecht nicht gefunden. Bitte Importindex aktualisieren.`,
      },
    };
  }

  return verarbeiteUndSpeichere(
    eintrag,
    fortschritt,
    eintrag.kurztitel,
    gesetz,
    undefined,
    kontext,
    meldungEmpfangen,
  );
}
