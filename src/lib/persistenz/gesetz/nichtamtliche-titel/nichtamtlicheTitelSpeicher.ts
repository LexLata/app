// Nichtamtliche Titel: Quellenwrapper und unverändertes Lesen für den Export.
// Prüfung, Laden mit Sicherung und Synchronisieren liegen in Begleitdateien.
import { NICHTAMTLICHE_TITEL_ORDNER } from '@/lib/persistenz/kern/kern.index';
import { NICHTAMTLICHE_TITEL_SUFFIX } from '@/lib/persistenz/kern/kern.index';

import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { meldeNichtamtlicheTitelGeschrieben } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicherEreignisse';
import {
  appDatenLesen,
  appDatenOrdnerLesen,
  merkePruefpflichtigeAenderungVor,
  mitGesetzDateiSperre,
  schliessePruefpflichtigeQuelleAb,
  sicherstelleOrdner as sicherstelleOrdnerBasis,
  type PruefpflichtigerQuellabschluss,
} from '@/lib/persistenz/kern/kern.index';

export { NICHTAMTLICHE_TITEL_ORDNER } from '@/lib/persistenz/kern/kern.index';

export async function sicherstelleOrdner(): Promise<void> {
  await sicherstelleOrdnerBasis(NICHTAMTLICHE_TITEL_ORDNER);
}

/** Nur Titelquellen: Vormerkung vor Sperren, Abschluss und Ereignis nach Freigabe. */
export async function mitTitelQuelle<T>(
  gesetz: Gesetzesreferenz,
  aktion: (
    token: string,
    vorgang: string,
    melde: (status: PruefpflichtigerQuellabschluss) => void,
  ) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const vorgang = await merkePruefpflichtigeAenderungVor(meldungEmpfangen);
  const abschluss: { status: PruefpflichtigerQuellabschluss; geaendert: boolean } = {
    status: 'unveraendert',
    geaendert: false,
  };
  let ergebnis: T;
  try {
    ergebnis = await mitGesetzDateiSperre(
      gesetz,
      NICHTAMTLICHE_TITEL_ORDNER,
      NICHTAMTLICHE_TITEL_SUFFIX,
      (token) =>
        aktion(token, vorgang, (neuerStatus) => {
          abschluss.status = neuerStatus;
          if (neuerStatus === 'geaendert') abschluss.geaendert = true;
        }),
      meldungEmpfangen,
    );
  } catch (fehler) {
    await schliessePruefpflichtigeQuelleAb(vorgang, 'fehlgeschlagen', meldungEmpfangen);
    if (abschluss.geaendert) meldeNichtamtlicheTitelGeschrieben(gesetz, vorgang, meldungEmpfangen);
    throw fehler;
  }
  await schliessePruefpflichtigeQuelleAb(vorgang, abschluss.status, meldungEmpfangen);
  if (abschluss.geaendert) meldeNichtamtlicheTitelGeschrieben(gesetz, vorgang, meldungEmpfangen);
  return ergebnis;
}

/** Liest die gespeicherten nichtamtlichen Titel als Exportdateien. Namen und
 * Rohtext bleiben unverändert; nicht lesbare Dateien werden bewusst übersprungen
 * und ein nicht lesbarer Ordner ergibt eine leere Liste. */
export async function leseNichtamtlicheTitelFuerExport(): Promise<
  { name: string; inhalt: string }[]
> {
  try {
    const eintraege = await appDatenOrdnerLesen(NICHTAMTLICHE_TITEL_ORDNER);
    const dateien: { name: string; inhalt: string }[] = [];
    for (const eintrag of eintraege) {
      if (!eintrag.name?.endsWith('.xml')) continue;
      try {
        dateien.push({
          name: eintrag.name,
          inhalt: await appDatenLesen(`${NICHTAMTLICHE_TITEL_ORDNER}/${eintrag.name}`),
        });
      } catch {
        /* einzelne Datei nicht lesbar – überspringen */
      }
    }
    return dateien;
  } catch {
    return [];
  }
}
