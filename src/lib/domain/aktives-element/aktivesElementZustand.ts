// aktivesElementZustand.ts
// Flüchtiger fensterlokaler Stand der aktiven, eindeutig speicherbaren Norm.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGleichesGesetz, referenzVon } from '@/lib/domain/gesetzesreferenz';
export interface SpeicherbareNorm {
  gesetz: Gesetzesreferenz;
  bezeichnung: string;
  istFavorit: boolean;
}
let snapshot: SpeicherbareNorm | null = null;
const abonnenten = new Set<() => void>();
export function liesSpeicherbareNorm() {
  return snapshot;
}
export function schreibeSpeicherbareNorm(wert: SpeicherbareNorm | null) {
  if (
    snapshot === wert ||
    (snapshot &&
      wert &&
      istGleichesGesetz(snapshot.gesetz, wert.gesetz) &&
      snapshot.bezeichnung === wert.bezeichnung &&
      snapshot.istFavorit === wert.istFavorit)
  )
    return;
  snapshot = wert ? { ...wert, gesetz: referenzVon(wert.gesetz) } : null;
  abonnenten.forEach((melden) => melden());
}
export function abonniereSpeicherbareNorm(melden: () => void) {
  abonnenten.add(melden);
  return () => {
    abonnenten.delete(melden);
  };
}
