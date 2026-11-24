// Gemeinsame Dateipfade und Referenzgruppierung der Gesetzpersistenz.
import {
  ermittleGesetzDateipfad,
  normalisierteDateiBasis,
  referenzAusDateiBasis,
  sicherstelleOrdner as sicherstelleOrdnerBasis,
} from '@/lib/persistenz/kern/kern.index';
import { GESETZE_ORDNER } from './gesetzSpeicher.typen';

export async function sicherstelleOrdner(): Promise<void> {
  await sicherstelleOrdnerBasis(GESETZE_ORDNER);
}

export function dateiname(dateiBasis: string): string {
  return `${GESETZE_ORDNER}/${dateiBasis}.xml`;
}

export async function vorhandenerPfad(dateiBasis: string): Promise<string> {
  const ref = referenzAusDateiBasis(dateiBasis);
  return ref ? ermittleGesetzDateipfad(ref, GESETZE_ORDNER) : dateiname(dateiBasis);
}

/** Mehrere Schreibweisen derselben vollständigen Referenz dürfen nicht konkurrieren. */
export function gruppiereDateinamen(
  eintraege: { name: string; isDirectory?: boolean }[],
): Map<string, string[]> {
  const dateienJeReferenz = new Map<string, string[]>();
  for (const eintrag of eintraege) {
    if (eintrag.isDirectory || !eintrag.name?.toLowerCase().endsWith('.xml')) continue;
    const ref = referenzAusDateiBasis(eintrag.name.slice(0, -4));
    if (!ref) continue;
    const schluessel = normalisierteDateiBasis(ref);
    const namen = dateienJeReferenz.get(schluessel) ?? [];
    namen.push(eintrag.name);
    dateienJeReferenz.set(schluessel, namen);
  }
  return dateienJeReferenz;
}
