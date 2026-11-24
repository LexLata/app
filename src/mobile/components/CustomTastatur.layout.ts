// CustomTastatur.layout.ts
//
// Reine Layout-Daten der Custom-Tastatur (keine Logik): welche Zeichen in
// welcher Reihe, Long-Press-Alternativen, sowie alle Abstands-/Zeit-
// Konstanten. Ausgelagert aus CustomTastatur.tsx, damit das Layout auf
// einen Blick änderbar ist, ohne durch Komponenten-Code zu scrollen.

export const ZAHLENREIHE = ['§', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

// Normales deutsches QWERTZ-Layout: ü direkt nach p, ö und ä nach l.
export const REIHE_1 = ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'];
export const REIHE_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'];
export const REIHE_3 = ['y', 'x', 'c', 'v', 'b', 'n', 'm'];

// Long-Press-Alternativen je Basis-Zeichen (aktuell nur ß auf s).
export const ALTERNATIVEN: Record<string, string[]> = {
  s: ['ß'],
};

// Sonderzeichen-Ansicht (über #+= erreichbar): erste Zeile zeigt bewusst
// NICHT nochmal §1234567890 (das ist schon auf der Hauptansicht sichtbar),
// sondern Klammer-/Programmierzeichen, die sonst nirgends erreichbar wären.
// Zweite/dritte Zeile: gängige Satz-/Klammerzeichen.
export const SONDERZEICHEN_REIHEN = [
  ['[', ']', '{', '}', '#', '%', '^', '<', '>', '~'],
  ['-', '/', ':', ';', '(', ')', '€', '&', '@', '"'],
  ['.', ',', '?', '!', "'", '*', '+', '=', '_'],
];

// Zeitfenster für Doppelklick-Erkennung auf ⇧ (→ Caps Lock).
export const DOPPELKLICK_SCHWELLE_MS = 300;

export const LANGDRUCK_SCHWELLE_MS = 450;

// Tastenwiederholung (z. B. ⌫ gedrückt halten): Verzögerung bis die
// Wiederholung einsetzt, danach Intervall zwischen den Wiederholungen.
export const WIEDERHOLUNG_START_MS = 450;
export const WIEDERHOLUNG_INTERVALL_MS = 70;

// Wie lange die Feedback-Bubble nach dem Loslassen noch sichtbar bleibt,
// bevor sie ausgeblendet wird. Zum Anpassen einfach diesen Wert ändern.
export const BUBBLE_NACHLEUCHT_MS = 90;

export const REIHEN_GAP = 6;
export const ZEILEN_GAP = 12;
// Etwas größerer Zwischenraum zwischen ⇧/y bzw. m/⌫.
export const RAND_TASTEN_GAP = 14;

// Wie weit unterhalb einer Taste der Finger sein darf, bevor eine
// Long-Press-Auswahl (z. B. s→ß) abgebrochen wird (Popup verschwindet).
export const ABBRUCH_ABSTAND_PX = 50;
