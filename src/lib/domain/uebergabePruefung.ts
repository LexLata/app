// Gemeinsame wertprüfende Bausteine für JSON-Übergaben, ohne Typzusagen.
export function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}
export function istText(wert: unknown): wert is string {
  return typeof wert === 'string';
}
export function istZahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isFinite(wert);
}
export function istGanzzahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isSafeInteger(wert) && wert >= 0;
}
export function istBoolean(wert: unknown): wert is boolean {
  return typeof wert === 'boolean';
}
export function istListe<T>(wert: unknown, pruefe: (wert: unknown) => wert is T): wert is T[] {
  return Array.isArray(wert) && wert.every(pruefe);
}
export function optional<T>(
  wert: unknown,
  pruefe: (wert: unknown) => wert is T,
): wert is T | undefined {
  return wert === undefined || pruefe(wert);
}
export function liesJSON<T>(json: string, pruefe: (wert: unknown) => wert is T): T | null {
  try {
    const wert: unknown = JSON.parse(json);
    if (pruefe(wert)) return wert;
  } catch {
    /* Ungültiges JSON wird wie eine fehlende Übergabe behandelt. */
  }
  console.error('Ungültige JSON-Übergabe verworfen.');
  return null;
}
