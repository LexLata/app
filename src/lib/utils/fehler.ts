// fehler.ts
// Bewahrt Fehleridentität und Meldung; Rohwerte bleiben als Ursache zugänglich.
export function alsFehler(ursache: unknown): Error {
  return ursache instanceof Error ? ursache : new Error(String(ursache), { cause: ursache });
}
