// aktualisierungsKandidaten.ts
// Ermittelt aktualisierbare Gesetze und den frühesten Verarbeitungszeitpunkt.

import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import { hatImportindex, type ImportindexKategorie } from '@/lib/domain/normgeber';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { alleImportindexEintraege } from '@/lib/import/importindex/importindex.index';
import type { AktualisierbareGesetzeErgebnis } from '@/lib/import/importVertrag.types';

function filtereUnterstuetzteNormgeber(
  gesetze: LesbarerSuchverzeichniseintrag[],
): (LesbarerSuchverzeichniseintrag & { normgeber: ImportindexKategorie })[] {
  return gesetze.filter(
    (gesetz): gesetz is LesbarerSuchverzeichniseintrag & { normgeber: ImportindexKategorie } =>
      hatImportindex(gesetz.normgeber),
  );
}

/** Reine Auswahl: nie geprüfte Gesetze und erreichte Intervallgrenzen sind fällig. */
export function ermittleFaelligeGesetze(
  gesetze: LesbarerSuchverzeichniseintrag[],
  intervallMs: number,
  jetzt: number,
): LesbarerSuchverzeichniseintrag[] {
  return filtereUnterstuetzteNormgeber(gesetze).filter(
    (gesetz) =>
      !gesetz.verarbeitungszeit || gesetz.verarbeitungszeit.getTime() + intervallMs <= jetzt,
  );
}

/** Liest jeden benötigten Importindex einmal; ein Lesefehler verwirft die gesamte Auswahl. */
export async function ermittleAktualisierbareGesetze(
  gesetze: LesbarerSuchverzeichniseintrag[],
): Promise<AktualisierbareGesetzeErgebnis> {
  const unterstuetzte = filtereUnterstuetzteNormgeber(gesetze);
  const titelJeNormgeber = new Map<string, Set<string>>();
  try {
    for (const normgeber of new Set(unterstuetzte.map((gesetz) => gesetz.normgeber))) {
      const eintraege = await alleImportindexEintraege(normgeber);
      titelJeNormgeber.set(
        normgeber,
        new Set(eintraege.map((eintrag) => kurztitelVergleichsform(eintrag.kurztitel).trim())),
      );
    }
  } catch {
    return { art: 'importindexNichtLesbar' };
  }
  const kandidaten: LesbarerSuchverzeichniseintrag[] = [];
  const nichtImImportindex: LesbarerSuchverzeichniseintrag[] = [];
  for (const gesetz of unterstuetzte) {
    const ziel = titelJeNormgeber
      .get(gesetz.normgeber)
      ?.has(kurztitelVergleichsform(gesetz.kurztitel).trim())
      ? kandidaten
      : nichtImImportindex;
    ziel.push(gesetz);
  }
  return { art: 'ermittelt', kandidaten, nichtImImportindex };
}

export function ermittleFruehesteVerarbeitungszeit(
  kandidaten: { verarbeitungszeit?: Date }[],
): Date | null {
  const zeiten = kandidaten
    .map((gesetz) => gesetz.verarbeitungszeit)
    .filter((zeit): zeit is Date => !!zeit);
  return zeiten.length === 0 ? null : new Date(Math.min(...zeiten.map((zeit) => zeit.getTime())));
}
