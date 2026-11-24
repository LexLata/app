// importindexVorinstallation.ts
// Prüft Bundle-Standards vor jeder Installation und entscheidet unter Schreibkoordination.
import { meldeImportindexGeschrieben } from './importindexAenderung';

import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { ressourcenPfad as resolveResource } from '@/lib/plattform/dateipfade';
import {
  sicherstelleOrdner,
  appDatenLesen,
  appDatenSchreiben,
} from '@/lib/persistenz/kern/kern.index';
import { importindexAppDataPfad, setzeHerkunft } from './importindexErstellung.persistenz';
import {
  validiereImportindex,
  kategorieFuerDateiname,
  dateinameFuerKategorie,
} from './importindexValidierung';
import { mitImportindexSchreibabschnitt } from './importindexSchreibkoordination';
import type { ImportindexKategorie } from './importindexErstellungSteuerung';

export async function leseBundleImportindex(kategorie: ImportindexKategorie): Promise<string> {
  return (await leseGeprueftenBundleImportindex(kategorie)).xml;
}

async function leseGeprueftenBundleImportindex(kategorie: ImportindexKategorie) {
  const name = dateinameFuerKategorie(kategorie);
  const xml = await readTextFile(await resolveResource(`resources/importindizes/${name}`));
  return { xml, ...validiereImportindex(xml, kategorie) };
}

export async function synchronisiereStartupImportindizes(): Promise<void> {
  for (const kategorie of [NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU] as const) {
    try {
      await synchronisiereEineDatei(dateinameFuerKategorie(kategorie));
    } catch (e) {
      console.error(
        `Vorinstallierter Importindex ${kategorie} konnte nicht abgeglichen werden:`,
        e,
      );
    }
  }
}

/** Automatischer Abgleich liest den aktuellen Bestand erst unter der Koordination. */
export async function synchronisiereEineDatei(dateiname: string): Promise<void> {
  const kategorie = kategorieFuerDateiname(dateiname);
  const bundle = await leseGeprueftenBundleImportindex(kategorie);
  const bundleZeit = bundle.zeit;
  await mitImportindexSchreibabschnitt(kategorie, async () => {
    try {
      const aktuell = validiereImportindex(
        await appDatenLesen(importindexAppDataPfad(dateiname)),
        kategorie,
      );
      if (aktuell.zeit >= bundleZeit) return;
    } catch {
      /* Fehlender oder defekter Bestand wird durch den geprüften Standard ersetzt. */
    }
    await schreibeStandard(kategorie, bundle.xml);
  });
}

/** Expliziter Auftrag ersetzt bedingungslos, aber ausschließlich durch gültiges XML. */
export async function stelleStandardWieder(kategorie: ImportindexKategorie): Promise<void> {
  const bundle = await leseBundleImportindex(kategorie);
  await mitImportindexSchreibabschnitt(kategorie, () => schreibeStandard(kategorie, bundle));
}

async function schreibeStandard(kategorie: ImportindexKategorie, xml: string): Promise<void> {
  await sicherstelleOrdner('importindizes');
  await appDatenSchreiben(
    importindexAppDataPfad(dateinameFuerKategorie(kategorie)),
    setzeHerkunft(xml, 'standard'),
  );
  meldeImportindexGeschrieben(kategorie);
}
