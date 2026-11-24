// Einzelzugriff mit strenger Referenzauflösung und denselben Befunden wie Sammelladen.
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import {
  dateiBasis,
  normalisierteDateiBasis,
  referenzAusDateiBasis,
} from '@/lib/persistenz/kern/kern.index';
import { leseGesetzDateistempel } from './gesetzDateistempel';
import { gruppiereDateinamen } from './gesetzSpeicher.dateien';
import { leseGesetzdatei } from './gesetzSpeicher';
import { fehlertext, type GesetzLadeBefund } from './gesetzSpeicher.typen';
import { meldeGesetzBefundeAnEmpfaenger } from './gesetzSpeicher.befunde';

export type GesetzLeseErgebnis =
  | { status: 'geladen'; gesetz: GesetzDarstellung; befunde: GesetzLadeBefund[] }
  | { status: 'fehlt' | 'nicht-lesbar'; befunde: GesetzLadeBefund[] };
export async function pruefeGesetzExistenz(
  referenz: Gesetzesreferenz,
): Promise<'vorhanden' | 'fehlt' | 'unbekannt'> {
  try {
    const dateien = gruppiereDateinamen(await leseGesetzDateistempel());
    return dateien.has(normalisierteDateiBasis(referenz)) ? 'vorhanden' : 'fehlt';
  } catch {
    return 'unbekannt';
  }
}
/** `bekannteNamen`: Dateinamen dieser Referenz aus einer soeben gelesenen
 * Ordnerauflistung des Aufrufers; erspart eine weitere Auflistung. */
export async function leseGesetz(
  referenz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  bekannteNamen?: readonly string[],
): Promise<GesetzLeseErgebnis> {
  let namen: readonly string[];
  try {
    namen =
      bekannteNamen ??
      gruppiereDateinamen(await leseGesetzDateistempel()).get(normalisierteDateiBasis(referenz)) ??
      [];
  } catch (fehler) {
    const befunde: GesetzLadeBefund[] = [{ status: 'ordner_unlesbar', fehler: fehlertext(fehler) }];
    meldeGesetzBefundeAnEmpfaenger(befunde, meldungEmpfangen);
    return { status: 'nicht-lesbar', befunde };
  }
  if (!namen.length) return { status: 'fehlt', befunde: [] };
  let ergebnis: GesetzLeseErgebnis;
  if (namen.length > 1) {
    ergebnis = {
      status: 'nicht-lesbar',
      befunde: [
        {
          status: 'unlesbar',
          dateiBasis: dateiBasis(referenz),
          fehler: `Mehrere Dateien für dieselbe Gesetzesreferenz: ${namen.join(', ')}`,
        },
      ],
    };
  } else {
    const [name] = namen;
    if (!name) return { status: 'nicht-lesbar', befunde: [] };
    try {
      const geladen = await leseGesetzdatei(name.slice(0, -4), `gesetze/${name}`, meldungEmpfangen);
      ergebnis = geladen.gesetz
        ? { status: 'geladen', gesetz: geladen.gesetz, befunde: [] }
        : { status: 'nicht-lesbar', befunde: [geladen.befund] };
    } catch (fehler) {
      ergebnis = {
        status: 'nicht-lesbar',
        befunde: [
          { status: 'unlesbar', dateiBasis: name.slice(0, -4), fehler: fehlertext(fehler) },
        ],
      };
    }
  }
  meldeGesetzBefundeAnEmpfaenger(ergebnis.befunde, meldungEmpfangen);
  return ergebnis;
}

/** Frische Dateireferenzen zum Aufzählen ohne XML und ohne abgeleitetes Suchverzeichnis. */
export async function leseGesetzesreferenzen(): Promise<Gesetzesreferenz[]> {
  const dateien = gruppiereDateinamen(await leseGesetzDateistempel());
  const referenzen: Gesetzesreferenz[] = [];
  for (const namen of dateien.values()) {
    const name = namen[0];
    const referenz = name ? referenzAusDateiBasis(name.slice(0, -4)) : null;
    if (referenz) referenzen.push(referenz);
  }
  return referenzen.sort((a, b) => a.kurztitel.localeCompare(b.kurztitel, 'de'));
}
