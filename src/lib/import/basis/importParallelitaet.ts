// importParallelitaet.ts
// Gemeinsame Gleichzeitigkeitsgrenze für Importe, Aktualisierungen und Quellenläufe.

import { NORMGEBER_DE_BW } from '@/lib/domain/normgeber';

/** Gleichzeitigkeitsgrenze für HTTP-Abrufe beziehungsweise BW-Fenster. */
export function berechneImportParallelitaet(quellenwahl?: string): number {
  return quellenwahl === NORMGEBER_DE_BW
    ? Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4))
    : 10;
}
