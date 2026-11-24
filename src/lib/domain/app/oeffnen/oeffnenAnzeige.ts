// oeffnenAnzeige.ts
// Anzeigezeitpunkte und stabile Rangfolge installierter Gesetze.
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

export type Anzeigezeitpunkte = ReadonlyMap<string, number>;

export function vergleicheNachAnzeige(zeitpunkte: Anzeigezeitpunkte = new Map()) {
  if (!zeitpunkte.size) return () => 0;
  return (a: Gesetzesreferenz, b: Gesetzesreferenz): number =>
    (zeitpunkte.get(gesetzesreferenzSchluessel(b)) ?? 0) -
    (zeitpunkte.get(gesetzesreferenzSchluessel(a)) ?? 0);
}

export function sortiereNachAnzeige<T extends Gesetzesreferenz>(
  liste: readonly T[],
  zeitpunkte?: Anzeigezeitpunkte,
): T[] {
  if (!zeitpunkte?.size) return [...liste];
  return [...liste].sort(vergleicheNachAnzeige(zeitpunkte));
}
