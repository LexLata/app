// parallelMitLimit.ts
// Führt fn(item) für alle items aus, aber maximal `limit` gleichzeitig
// (Worker-Pool-Muster: `limit` Worker ziehen sich fortlaufend das nächste
// Item aus der gemeinsamen Warteschlange). Ergebnisse/State-Updates erfolgen
// innerhalb von fn selbst, in Abschluss-Reihenfolge, nicht Eingabereihenfolge.
//
// Gemeinsame Begrenzung für Import, Aktualisierung und Import fehlender Zielgesetze.
import { alsFehler } from '@/lib/utils/fehler';
export async function parallelMitLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let naechsterIndex = 0;
  let ersterFehler: unknown;

  async function worker(): Promise<void> {
    while (naechsterIndex < items.length) {
      const index = naechsterIndex++;
      // items[index] beweisbar sicher: index wurde gerade gegen items.length
      // geprüft, JS ist zwischen den synchronen Schritten hier nicht
      // nebenläufig (kein Race zwischen Prüfung und Increment).
      try {
        await fn(items[index]!);
      } catch (fehler) {
        ersterFehler ??= fehler;
      }
    }
  }

  const workerAnzahl = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerAnzahl }, () => worker()));
  if (ersterFehler !== undefined) throw alsFehler(ersterFehler);
}
