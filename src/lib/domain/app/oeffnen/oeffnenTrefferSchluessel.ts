// oeffnenTrefferSchluessel.ts
// Eindeutige Listenschlüssel für Trefferlisten (Desktop-Overlay und mobile Ansicht).
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { SucheTreffer } from './oeffnen';

/** Je Treffer ein in der Liste eindeutiger Schlüssel; gleiche Treffer werden durchgezählt. */
export function trefferSchluessel(treffer: readonly SucheTreffer[]): string[] {
  const vergeben = new Map<string, number>();
  return treffer.map((t) => {
    const basis =
      t.art === 'installiert'
        ? `${gesetzesreferenzSchluessel(t.gesetzesreferenz)}:${t.norm?.xmlId ?? ''}`
        : `index-${t.quelle}-${t.eintrag.normgeber ?? ''}-${t.eintrag.kurztitel}-${t.eintrag.abrufkennung}`;
    const n = vergeben.get(basis) ?? 0;
    vergeben.set(basis, n + 1);
    return n === 0 ? basis : `${basis}#${n}`;
  });
}
