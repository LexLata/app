// leerraum.ts
// Reine Leerraum-Normalisierung für Quelltexte beim Import.

/** Fasst jeden Leerraum (JavaScript-`\s`, auch U+00A0) zu einem Leerzeichen zusammen und trimmt außen. */
export function normalisiereWS(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
