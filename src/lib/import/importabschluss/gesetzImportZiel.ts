// gesetzImportZiel.ts
// Gemeinsame Identitätsprüfung für Reparaturabschluss und zwischenzeitlichen gültigen Bestand.
import { leseGesetz } from '@/lib/persistenz/gesetz/gesetz.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { normalisierteDateiBasis, referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { GesetzReparaturZiel, ImportFehler } from '@/lib/import/importVertrag.types';

export function pruefeReparaturreferenz(
  ziel: GesetzReparaturZiel,
  gesetz: Gesetzesreferenz,
): ImportFehler | null {
  const zielreferenz = referenzAusDateiBasis(ziel.dateiBasis);
  if (
    zielreferenz &&
    normalisierteDateiBasis(gesetz) === normalisierteDateiBasis(zielreferenz) &&
    istGleichesGesetz(gesetz, {
      kurztitel: ziel.kurztitel,
      normgeber: ziel.quelle,
    })
  )
    return null;
  return {
    grund: 'format',
    meldung: `Das geladene Gesetz passt nicht zum Reparaturziel „${ziel.kurztitel}" (${ziel.dateiBasis}).`,
  };
}

/** Prüft nur die betroffene Datei; Cache und fremde Gesetze entscheiden nicht über Erstimporte. */
export async function pruefeDateibestandVorErstimport(
  referenz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportFehler | null> {
  const gelesen = await leseGesetz(referenz, meldungEmpfangen);
  if (gelesen.status === 'nicht-lesbar')
    return {
      grund: 'laden',
      meldung: 'Das vorhandene Gesetz konnte nicht verlässlich geprüft werden.',
    };
  if (gelesen.status === 'geladen')
    return {
      grund: 'bereitsVorhanden',
      meldung: `${gelesen.gesetz.kurztitel} ist bereits auf dem Gerät.`,
    };
  return null;
}
