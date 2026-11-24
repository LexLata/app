// kandidaten.ts
// Gemeinsame Eindeutigkeitsprüfung vor jeder Verarbeitung eines Kurztitels.
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { LaufBericht } from './laufBericht';

export function eindeutigeKandidaten(
  alle: ImportindexSucheEintrag[],
  ausgewaehlt: ImportindexSucheEintrag[],
  bericht: LaufBericht,
  meldeFehler?: (text: string) => void,
): ImportindexSucheEintrag[] {
  const haeufigkeit = new Map<string, number>();
  alle.forEach((e) => {
    const k = e.kurztitel.toLowerCase();
    haeufigkeit.set(k, (haeufigkeit.get(k) ?? 0) + 1);
  });
  const gesehen = new Set<string>();
  return ausgewaehlt.filter((e) => {
    const k = e.kurztitel.toLowerCase();
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    if ((haeufigkeit.get(k) ?? 0) > 1) {
      bericht.fehlgeschlagen.push({ kurztitel: e.kurztitel, meldung: 'Kurztitel nicht eindeutig' });
      meldeFehler?.(`${e.kurztitel}: Kurztitel nicht eindeutig`);
      return false;
    }
    return true;
  });
}
