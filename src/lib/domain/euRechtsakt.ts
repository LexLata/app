// euRechtsakt.ts
// Reine Einordnung europäischer Rechtsakte anhand ihres Dokumenttyps.
/** Durchführungsakte werden anhand des gespeicherten Dokumenttyps erkannt. */
export function istDurchfuehrungsakt(typ?: string): boolean {
  return typ === 'durchfuehrungsverordnung' || typ === 'durchfuehrungsrichtlinie';
}
