// Einziger fensterlokaler Zustand der Markierungskonfliktprüfung; keine fachliche Zustandsquelle.
let initialisiert = false;
let startVorbereitung: Promise<boolean> | undefined;
let startAbschluss: Promise<void> | undefined;
let pruefungsKette: Promise<void> = Promise.resolve();

export function istInitialisiert(): boolean {
  return initialisiert;
}
export function setzeInitialisiert(): void {
  initialisiert = true;
}
export function liesStartVorbereitung(): Promise<boolean> | undefined {
  return startVorbereitung;
}
export function erhalteStartVorbereitung(start: () => Promise<boolean>): Promise<boolean> {
  return (startVorbereitung ??= start());
}
export function erhalteStartAbschluss(start: () => Promise<void>): Promise<void> {
  return (startAbschluss ??= start());
}
export function liesPruefungsKette(): Promise<void> {
  return pruefungsKette;
}
export function setzePruefungsKette(kette: Promise<void>): void {
  pruefungsKette = kette;
}
