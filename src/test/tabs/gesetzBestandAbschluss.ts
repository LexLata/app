// Bestehende Szenarioergebnisse aus öffentlichen Einzelzugriffen samt Befunden bündeln.
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';
import type { GesetzLadeBefund, GesetzLadeabschluss } from '@/lib/persistenz/gesetz/gesetz.index';
type GesetzBestandLeser = (
  melde?: (befunde: GesetzLadeBefund[]) => void,
  empfangen?: AktionsMeldungEmpfaenger,
) => Promise<GesetzDarstellung[]>;
function istReferenzVerlaesslichPruefbar(
  referenz: Gesetzesreferenz,
  abschluss: GesetzLadeabschluss,
) {
  if (!abschluss.ordnerLesbar) return false;
  return !abschluss.befunde.some((b) => {
    if (
      b.status !== 'unlesbar' &&
      b.status !== 'sicherung_fehlgeschlagen' &&
      b.status !== 'reparierbar' &&
      b.status !== 'gesichert_aber_nicht_entfernt'
    )
      return false;
    const betroffen = referenzAusDateiBasis(b.dateiBasis);
    return !betroffen || istGleichesGesetz(betroffen, referenz);
  });
}
async function ladeBestandMitBefunden(
  lesen: GesetzBestandLeser,
  meldeBefunde?: (befunde: GesetzLadeBefund[]) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzLadeabschluss> {
  let befunde: GesetzLadeBefund[] = [];
  try {
    const liste = await lesen((aktuelle) => {
      befunde = aktuelle;
      meldeBefunde?.(aktuelle);
    }, meldungEmpfangen);
    return { liste, befunde, ordnerLesbar: !befunde.some((b) => b.status === 'ordner_unlesbar') };
  } catch (fehler) {
    console.error('Gesetzesbestand konnte nicht geladen werden:', fehler);
    const liste: GesetzDarstellung[] = [];
    return { liste, befunde, ordnerLesbar: false };
  }
}

/** Testbindung für vorhandene Bestands-/Befundszenarien. */
function bindeGesetzBestand(holeLeser: () => GesetzBestandLeser) {
  return {
    ladeGesetzBestand: (
      melde?: (befunde: GesetzLadeBefund[]) => void,
      empfangen?: AktionsMeldungEmpfaenger,
    ) => ladeBestandMitBefunden(holeLeser(), melde, empfangen),
    istGesetzVerlaesslichPruefbar: istReferenzVerlaesslichPruefbar,
  };
}

import { ladeAlleGesetze } from './gesetzSpeicherTestzugang';
export const { ladeGesetzBestand, istGesetzVerlaesslichPruefbar } = bindeGesetzBestand(
  () => ladeAlleGesetze,
);
