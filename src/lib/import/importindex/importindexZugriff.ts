// importindexZugriff.ts
// Geprüfter Inhaltzugriff mit genau einem Reparaturversuch; Vorbereitung schreibt nie.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { appDatenLesen } from '@/lib/persistenz/kern/kern.index';
import { importindexAppDataPfad } from './importindexErstellung.persistenz';
import {
  validiereImportindex,
  dateinameFuerKategorie,
  ImportindexFormatFehler,
  eintraegeAusImportindex,
} from './importindexValidierung';
import { leseBundleImportindex, synchronisiereEineDatei } from './importindexVorinstallation';
import { leseKuratierteListe, legeKuratierteListeUeber } from './europaKuratiert';
import { leseEuropaVerzeichnisMitDiagnosen } from './europaVerzeichnis';
import type {
  ReferenzQuelle,
  VerzeichnisErgebnis,
  ImportindexKategorie,
  ImportindexSucheEintrag,
} from './importindexVertrag.types';

type GepruefterImportindex = ReturnType<typeof validiereImportindex> & { xml: string };

async function leseLokal(
  kategorie: ImportindexKategorie,
  vorher?: GepruefterImportindex,
): Promise<GepruefterImportindex> {
  const xml = await appDatenLesen(importindexAppDataPfad(dateinameFuerKategorie(kategorie)));
  // Nur identischen, erneut gelesenen Inhalt innerhalb dieses Zugriffs wiederverwenden.
  if (vorher?.xml === xml) return vorher;
  return { xml, ...validiereImportindex(xml, kategorie) };
}

/** Verwendet das geprüfte Dokument dieses Zugriffs direkt zur Eintragsextraktion. */
export async function leseImportindexEintraege(
  kategorie: ImportindexKategorie,
): Promise<ImportindexSucheEintrag[]> {
  return (await leseImportindexEintraegeMitDiagnosen(kategorie)).eintraege;
}

/** Bestehendes Teilfehlerverhalten, ergänzt um Diagnosen der EU-Überlagerung. */
export async function leseImportindexEintraegeMitDiagnosen(
  kategorie: ImportindexKategorie,
): Promise<VerzeichnisErgebnis> {
  const eintraege = eintraegeAusImportindex(await leseGeprueftenImportindex(kategorie));
  if (kategorie !== NORMGEBER_EU) return { eintraege, fehler: [] };
  const kuratiert = await leseKuratierteListe();
  return {
    eintraege: legeKuratierteListeUeber(
      eintraege,
      kuratiert.eintraege.map(({ abrufkennung, kurztitel, langtitel, alternativen }) => ({
        celex: abrufkennung,
        ...(alternativen === undefined ? {} : { alternativen }),
        kurztitel,
        langtitel,
      })),
    ),
    fehler: kuratiert.fehler,
  };
}

async function leseGeprueftenImportindex(
  kategorie: ImportindexKategorie,
): Promise<GepruefterImportindex> {
  let lokal: GepruefterImportindex;
  try {
    lokal = await leseLokal(kategorie);
  } catch {
    try {
      await synchronisiereEineDatei(dateinameFuerKategorie(kategorie));
      return await leseLokal(kategorie);
    } catch (e) {
      throw new ImportindexFormatFehler(
        `Importindex ${kategorie} ist auch nach Wiederherstellung nicht lesbar: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }
  try {
    await synchronisiereEineDatei(dateinameFuerKategorie(kategorie));
  } catch {
    // Optionaler Bundlefehler macht den bereits geprüften Bestand nicht unlesbar.
    return lokal;
  }
  return leseLokal(kategorie, lokal);
}

/** Rohbestand und gültige Arbeitsgrundlage gemeinsam lesen: auch defekte Bestände
 * müssen vor Speicherbeginn exakt mit dem damals gelesenen Snapshot übereinstimmen. */
export async function leseImportindexAbgleichsSnapshot(
  kategorie: ImportindexKategorie,
): Promise<{ xml: string; bestand: string | null }> {
  let bestand: string | null = null;
  try {
    bestand = await appDatenLesen(importindexAppDataPfad(dateinameFuerKategorie(kategorie)));
  } catch {
    /* fehlender oder unlesbarer Bestand */
  }
  if (bestand !== null) {
    try {
      validiereImportindex(bestand, kategorie);
      return { xml: bestand, bestand };
    } catch {
      /* Standard nur im Arbeitsspeicher verwenden */
    }
  }
  return { xml: await leseBundleImportindex(kategorie), bestand };
}

/** Liefert Quellenfehler als Diagnosen, ohne Nachbereitungsbanner anzuzeigen. */
export async function leseReferenzVerzeichnis(
  quelle: ReferenzQuelle,
): Promise<VerzeichnisErgebnis> {
  if (quelle === NORMGEBER_EU) return leseEuropaVerzeichnisMitDiagnosen();
  try {
    return { eintraege: await leseImportindexEintraege(quelle), fehler: [] };
  } catch (e) {
    return {
      eintraege: [],
      fehler: [{ quelle, meldung: e instanceof Error ? e.message : String(e) }],
    };
  }
}
