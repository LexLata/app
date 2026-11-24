// Gesetzestextansicht.helpers.ts
// Bauminterne Darstellungshilfen für Farben und Klickaktionen.

export function ermittleNormFarbe(params: {
  ueberschriftartig: boolean;
  istEingeklappt: boolean;
}): string | undefined {
  if (params.ueberschriftartig) return ermittleUeberschriftFarbe(params);
  return params.istEingeklappt ? 'var(--text-sekundaer)' : undefined;
}

export function ermittleNormFarbeWeggefallen(params: {
  ueberschriftartig: boolean;
  istEingeklappt: boolean;
}): string {
  return params.ueberschriftartig ? ermittleUeberschriftFarbe(params) : 'var(--text-sekundaer)';
}

export function ermittleUeberschriftFarbe(params: { istEingeklappt: boolean }): string {
  return params.istEingeklappt ? 'var(--aktiv-element-blass)' : 'var(--aktiv-element)';
}

// ---------------------------------------------------------------------------
// Klick-Guards gegen Text-Selektion
// ---------------------------------------------------------------------------
// Verhindert, dass das Markieren von Text (z. B. zum Kopieren) in einer
// klickbaren Zeile gleichzeitig deren Klick-Aktion auslöst. Die Selektion
// ist zum Zeitpunkt des click-Events bereits final, daher reicht eine
// einfache Prüfung von window.getSelection() ohne zusätzlichen State.
// Von UeberschriftZeile/NormBlock für Ein-/Ausklappen (klappKlick) bzw. Norm-
// Aktivierung (normTextKlick) genutzt.

export function klappKlick(id: string, onKlick: (id: string) => void) {
  if (window.getSelection()?.toString()) return;
  onKlick(id);
}

export function normTextKlick(id: string, onNormTextKlick: (id: string) => void) {
  if (window.getSelection()?.toString()) return;
  onNormTextKlick(id);
}
