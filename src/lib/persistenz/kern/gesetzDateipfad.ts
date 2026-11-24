// gesetzDateipfad.ts
// Referenzen finden vorhandene AppData-Dateien unabhängig von der Schreibweise.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import {
  appDatenExistiert,
  appDatenOrdnerLesen,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';
import {
  mitDateiSperre,
  mitDateiSperren,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';
import { dateiBasis, referenzAusDateiBasis, normalisierteDateiBasis } from './gesetzDateiname';

export {
  GESETZE_ORDNER,
  MARKIERUNGEN_ORDNER,
  FAVORITEN_ORDNER,
  NICHTAMTLICHE_TITEL_ORDNER,
} from './gesetzDateiname';

export { normalisierteDateiBasis } from './gesetzDateiname';

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

/** Vorhandene Datei in tatsächlicher Schreibweise, sonst der neue kanonische Pfad.
 * Mehrere Dateien derselben Referenz und Zugriffsfehler werden durchgereicht. */
export async function ermittleGesetzDateipfad(
  ref: Gesetzesreferenz,
  ordner: string,
  suffix = '.xml',
): Promise<string> {
  const neuerPfad = `${ordner}/${dateiBasis(ref)}${suffix}`;
  const schluessel = normalisierteDateiBasis(ref);
  let eintraege;
  try {
    eintraege = await appDatenOrdnerLesen(ordner);
  } catch (fehler) {
    if (!(await appDatenExistiert(ordner))) return neuerPfad;
    throw fehler;
  }
  const treffer = eintraege.filter((eintrag) => {
    if (eintrag.isDirectory || !eintrag.name.toLowerCase().endsWith(suffix.toLowerCase()))
      return false;
    const vorhandeneRef = referenzAusDateiBasis(eintrag.name.slice(0, -suffix.length));
    return vorhandeneRef !== null && normalisierteDateiBasis(vorhandeneRef) === schluessel;
  });
  if (treffer.length > 1) {
    throw new Error(
      `Mehrere Dateien für dieselbe Gesetzesreferenz: ${treffer.map((eintrag) => `${ordner}/${eintrag.name}`).join(', ')}`,
    );
  }
  return treffer.length === 1 ? `${ordner}/${treffer[0]!.name}` : neuerPfad;
}

/** Sperrt die Referenz vor der Pfadermittlung und anschließend die tatsächliche Datei.
 * Die Referenzsperre verhindert parallele Neuanlagen bei unterschiedlich kodierten
 * Schreibweisen; nur der Token der tatsächlichen Datei wird für I/O weitergereicht,
 * zusammen mit dem unter der Referenzsperre ermittelten Pfad. */
export async function mitGesetzDateiSperre<T>(
  ref: Gesetzesreferenz,
  ordner: string,
  suffix: string,
  aktion: (token: string, pfad: string) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const referenzSperrpfad = `${ordner}/${normalisierteDateiBasis(ref)}${suffix}.referenz-sperre`;
  return mitDateiSperre(
    referenzSperrpfad,
    async () => {
      const pfad = await ermittleGesetzDateipfad(ref, ordner, suffix);
      return mitDateiSperre(
        pfad,
        (token) => aktion(token, pfad),
        ...(meldungEmpfangen ? [meldungEmpfangen] : []),
      );
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
}

export interface GesetzDateiQuelle {
  gesetz: Gesetzesreferenz;
  ordner: string;
  suffix: string;
}

/** Referenzsperren zuerst: schützt auch Neuanlagen und abweichende Schreibweisen.
 * Beide Stufen sind dedupliziert und sortiert, wie der einzelne Schreibpfad. */
export async function mitGesetzDateiSperren<T>(
  quellen: readonly GesetzDateiQuelle[],
  aktion: (tokens: ReadonlyMap<string, string>) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const referenzen = quellen.map(
    ({ gesetz, ordner, suffix }) =>
      `${ordner}/${normalisierteDateiBasis(gesetz)}${suffix}.referenz-sperre`,
  );
  return mitDateiSperren(
    referenzen,
    async () => {
      const pfade = await Promise.all(
        quellen.map(({ gesetz, ordner, suffix }) =>
          ermittleGesetzDateipfad(gesetz, ordner, suffix),
        ),
      );
      return mitDateiSperren(pfade, aktion, ...(meldungEmpfangen ? [meldungEmpfangen] : []));
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
}
