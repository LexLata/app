// roemischeZahlen.ts
//
// Reine Umwandlung Zahl ↔ römische Zahl, OHNE jede fachliche Kenntnis von
// Absätzen/Zitaten – genutzt von zitatParser.tokenizer.ts (Parsen: "III" →
// 3, für Existenzprüfung/Normauflösung) UND zitatFormatierung.ts (Formatieren:
// 1 → "I", für die Zitat-Anzeige bei aktivierter Option "Absätze als römische
// Zahlen"). War vorher an beiden Stellen wortgleich dupliziert.

const ROEMISCH_STELLENWERTE: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};
const ROEMISCH_STELLEN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function zahlZuRoemisch(n: number): string {
  let rest = n;
  let ergebnis = '';
  for (const [wert, zeichen] of ROEMISCH_STELLEN) {
    while (rest >= wert) {
      ergebnis += zeichen;
      rest -= wert;
    }
  }
  return ergebnis;
}

/**
 * Wandelt eine (bereits als reine Großbuchstabenfolge aus I/V/X/L/C/D/M
 * geprüfte) Zeichenkette in ihren Dezimalwert um – null, wenn sie zwar aus
 * gültigen römischen Ziffern besteht, aber keine gültige römische Zahl
 * ergibt (z.B. "IIII" oder "VX"). Validierung über Rückumwandlung, da eine
 * reine Regex für alle Sonderfälle unübersichtlich würde.
 */
export function roemischZuZahl(text: string): number | null {
  let ergebnis = 0;
  for (let i = 0; i < text.length; i++) {
    // charAt() statt Bracket-Zugriff: text[i] ist durch die Schleifen-
    // Invariante (i < text.length) ohnehin immer ein echtes Zeichen;
    // text[i+1] kann am Ende der Zeichenkette regulär "kein nächstes
    // Zeichen" bedeuten – charAt liefert dafür '' statt undefined, der
    // anschließende Objekt-Lookup verhält sich damit identisch zu vorher
    // (Ergebnis weiterhin undefined), nur ohne den Indextyp-Fehler unter
    // noUncheckedIndexedAccess.
    const wert = ROEMISCH_STELLENWERTE[text.charAt(i)];
    const naechsterWert = ROEMISCH_STELLENWERTE[text.charAt(i + 1)];
    // wert beweisbar sicher: laut Funktionskopf-Kommentar ruft der Aufrufer
    // nur mit bereits geprüften I/V/X/L/C/D/M-Zeichenketten auf (siehe
    // Ausschluss fremder Zeichen vor roemischZuZahl im Tokenizer).
    ergebnis += naechsterWert && wert! < naechsterWert ? -wert! : wert!;
  }
  return ergebnis > 0 && zahlZuRoemisch(ergebnis) === text ? ergebnis : null;
}
