// wellenlauf.ts
// Gemeinsame Kandidatenwellen mit Erfolgsziel und Abbruch bei Dateifehlern.
import type { LaufFortschritt } from './laufMeldung';
import { parallelMitLimit } from '@/lib/import/basis/basis.index';

export type WellenlaufErgebnis = 'erfolg' | 'teilerfolg' | 'fehler' | 'uebersprungen';

export async function fuehreWellenlaufAus<T>(
  kandidaten: T[],
  anzahl: number,
  parallelitaet: number,
  verarbeite: (kandidat: T) => Promise<WellenlaufErgebnis>,
  meldeFortschritt?: (stand: LaufFortschritt) => void,
): Promise<void> {
  const stand: LaufFortschritt = {
    erfolgreich: 0,
    teilerfolge: 0,
    fehlgeschlagen: 0,
    uebersprungen: 0,
    aktiv: 0,
  };
  const melden = () => meldeFortschritt?.({ ...stand });
  melden();
  let index = 0;
  let erfolge = 0;
  let abgebrochen = false;
  let abbruchgrund: unknown;
  while (index < kandidaten.length && erfolge < anzahl) {
    const welle = kandidaten.slice(index, index + anzahl - erfolge);
    index += welle.length;
    await parallelMitLimit(welle, parallelitaet, async (kandidat) => {
      if (abgebrochen) return;
      stand.aktiv++;
      melden();
      try {
        const ergebnis = await verarbeite(kandidat);
        if (ergebnis === 'erfolg') stand.erfolgreich++;
        else if (ergebnis === 'teilerfolg') stand.teilerfolge++;
        else if (ergebnis === 'fehler') stand.fehlgeschlagen++;
        else stand.uebersprungen++;
        if (ergebnis === 'erfolg' || ergebnis === 'teilerfolg') erfolge++;
      } catch (fehler) {
        stand.fehlgeschlagen++;
        if (!abgebrochen) abbruchgrund = fehler;
        abgebrochen = true;
      } finally {
        stand.aktiv--;
        melden();
      }
    });
    if (abgebrochen) throw abbruchgrund;
  }
}
