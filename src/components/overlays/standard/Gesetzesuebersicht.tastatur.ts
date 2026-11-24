// Gesetzesuebersicht.tastatur.ts
//
// Reine Entscheidungslogik für den globalen keydown-Handler in
// Gesetzesuebersicht.tsx: "welche Aktion soll bei welcher Taste/welchem
// Zustand ausgelöst werden" – getrennt von den eigentlichen Seiteneffekten
// (State-Setter, Prop-Callback-Aufrufe, e.preventDefault()), die weiterhin
// im Handler selbst liegen. Ausgelagert, um dessen Cognitive Complexity zu
// senken (siehe Absprache) – keine React-Abhängigkeit, daher hier testbar
// ohne DOM/Rendering (siehe kolokierter Test).

export interface TastaturKontext {
  /** e.key des KeyboardEvent. */
  taste: string;
  metaKey: boolean;
  ctrlKey: boolean;
  /** true, wenn e.target ein <input>-Element ist (Suchfeld). */
  zielIstInput: boolean;
  auswahlSchluessel: string | null;
  /** ids der aktuell (nach Suche) gefilterten Liste, in Anzeigereihenfolge. */
  gefilterteSchluessel: string[];
  /** true, während ein KurzbefehlChip gerade eine Tastenkombination aufnimmt –
   *  dessen eigener Capture-Listener übernimmt dann alle Tasten. */
  recordingAktiv: boolean;
}

export type TastaturAktion =
  | { typ: 'keine' }
  | { typ: 'loeschen'; schluessel: string }
  | { typ: 'oeffnen'; schluessel: string }
  // neuerSchluessel ist null, wenn die gefilterte Liste leer ist (kein Navigationsziel)
  // – e.preventDefault() muss trotzdem ausgelöst werden (siehe Handler),
  // daher weiterhin typ 'navigieren' statt 'keine'.
  | { typ: 'navigieren'; neuerSchluessel: string | null };

// Berechnet das Navigationsziel für ArrowUp/ArrowDown – ausgelagert aus
// bestimmeTastaturAktion, damit dessen eigene Cognitive Complexity (durch
// die zusätzliche Verschachtelung von Längen-Check + Index-Berechnung +
// Clamping) unter dem erlaubten Schwellwert bleibt. null = gefilterteSchluessel
// ist leer, kein Navigationsziel vorhanden.
function navigationsZiel(
  taste: 'ArrowDown' | 'ArrowUp',
  auswahlSchluessel: string | null,
  gefilterteSchluessel: string[],
): string | null {
  if (!gefilterteSchluessel.length) return null;
  const idx = auswahlSchluessel ? gefilterteSchluessel.indexOf(auswahlSchluessel) : -1;
  const next =
    taste === 'ArrowDown'
      ? Math.min(idx + 1, gefilterteSchluessel.length - 1)
      : Math.max(idx - 1, 0);
  return gefilterteSchluessel[next < 0 ? 0 : next]!;
}

export function bestimmeTastaturAktion(kontext: TastaturKontext): TastaturAktion {
  if (kontext.recordingAktiv) return { typ: 'keine' };
  const { taste, auswahlSchluessel, zielIstInput } = kontext;

  if ((taste === 'Delete' || taste === 'Backspace') && auswahlSchluessel && !zielIstInput) {
    return { typ: 'loeschen', schluessel: auswahlSchluessel };
  }

  if (taste === 'Enter' && auswahlSchluessel) {
    return { typ: 'oeffnen', schluessel: auswahlSchluessel };
  }

  if ((taste === 'ArrowDown' || taste === 'ArrowUp') && !zielIstInput) {
    return {
      typ: 'navigieren',
      neuerSchluessel: navigationsZiel(taste, auswahlSchluessel, kontext.gefilterteSchluessel),
    };
  }

  return { typ: 'keine' };
}
