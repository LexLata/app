// EinfuehrungsOverlay.teilaktionen.ts
//
// Reine Inhaltsdaten der Einführung: Haupttext (fett), optionaler
// Zusatztext (Klammertext, kleiner/sekundär) und das Ziel-Element, neben dem
// die Sprechblase positioniert wird. Getrennt von EinfuehrungsOverlay.tsx,
// weil hier ausschließlich Text/Zuordnung steht, keine Layout-Logik.
//
// `ziel` verweist auf ein data-einfuehrung-ziel-Attribut, das die
// jeweiligen Buttons tragen (siehe SeitenleistenAktionen.tsx:
// einfuehrungsZiel-Prop). `ziel: null` bedeutet: keine feste Verankerung,
// die Sprechblase wird an einer festen Bildschirmposition angezeigt
// (Teilaktion 5: allgemeiner Hinweis auf Normtitel/Überschriften, kein
// einzelnes Icon; Teilaktion 8: Abschluss).
//
// `tastenkuerzel` ist der alternative Tastenkürzel-Hinweis, plattformabhängig
// über tastenkuerzelAnzeige (siehe tastenkuerzel.index.ts) in EinfuehrungsOverlay.tsx
// eingesetzt – hier nur die Katalog-ID, damit dieselbe Formatierung wie
// überall sonst in der App verwendet wird.

export type EinfuehrungsZiel =
  'oeffnen' | 'oeffnen-eingabe' | 'favorit' | 'lesezeichen' | 'zuklappen' | 'aufklappen';

export interface EinfuehrungsTeilaktion {
  /** Fett dargestellter Haupttext – die eigentliche Anweisung. Unterstützt
   *  Inline-Tokens, die EinfuehrungsOverlay.tsx auswertet: "\n" für einen
   *  Zeilenumbruch und "{zeiger}" für eine kleine Vorschau des blauen
   *  Auswahl-Zeigers (siehe AktivZeiger in
   *  aktivZeiger.tsx). */
  haupttext: string;
  /** Kleiner, sekundär eingefärbter Zusatztext (der bisherige „[...]"-Teil). */
  zusatztext?: string;
  /** Alternatives Tastenkürzel, das im Zusatztext über "{tastenkuerzel}"
   *  eingesetzt wird. */
  tastenkuerzel?: string;
  /** Zweites alternatives Tastenkürzel (z. B. wenn sowohl Klick als auch
   *  Kurzbefehl UND ein eigenständiger Kurzbefehl für die Gegenrichtung
   *  erwähnt werden), eingesetzt über "{tastenkuerzel2}". */
  tastenkuerzel2?: string;
  /** Ziel-Element für die Positionierung, oder null für feste Position. */
  ziel: EinfuehrungsZiel | null;
  /** Breite der Sprechblase in px (Default siehe SPRECHBLASE_BREITE in
   *  EinfuehrungsOverlay.tsx). Schmaler für Teilaktion 1 (Sucheingabe), damit
   *  sie neben der schmalen Fortschrittsleiste nicht zu breit wirkt und das
   *  Suchfeld möglichst wenig verdeckt. */
  breite?: number;
}

// Teilaktion 8 (Abschluss) ist bewusst NICHT Teil dieser Liste – der Text
// enthält appName und wird daher direkt in EinfuehrungsOverlay.tsx anhand
// von useEinfuehrung().appName zusammengesetzt.
export const EINFUEHRUNGS_TEILAKTIONEN: EinfuehrungsTeilaktion[] = [
  {
    haupttext: 'Klicken Sie auf die Lupe, um ein Gesetz oder eine Norm zu öffnen.',
    zusatztext: 'Alternativ: eine Zahl eingeben oder {tastenkuerzel} drücken.',
    tastenkuerzel: 'oeffnen',
    ziel: 'oeffnen',
  },
  {
    haupttext: 'Geben Sie eine Norm ein (z.B.\u00A0„433 BGB“) und drücken Sie Enter.',
    zusatztext:
      'Fehlt das Gesetz, wird es automatisch aus dem Internet geladen. Bundes-, Landes- und Europarecht sind verfügbar.',
    ziel: 'oeffnen-eingabe',
    breite: 240,
  },
  {
    haupttext:
      'Die geöffnete Norm ist jetzt ausgewählt – zu erkennen am blauen Zeiger {zeiger}.\nKlicken Sie auf den Stern, um sie als Favorit zu speichern.',
    zusatztext:
      'Alternativ {tastenkuerzel}. Normen können auch durch Klick auf den Normtext ausgewählt werden.',
    tastenkuerzel: 'favorit-speichern',
    ziel: 'favorit',
  },
  {
    haupttext: 'Klicken Sie auf den ausgefüllten Stern, um den Favorit wieder zu löschen.',
    zusatztext: 'Der Stern ist ausgefüllt, wenn die ausgewählte Norm ein Favorit ist.',
    ziel: 'favorit',
  },
  {
    haupttext:
      'Klicken Sie auf das Lesezeichen-Symbol, um die ausgewählte Norm als Lesezeichen zu speichern.',
    zusatztext:
      'Alternativ {tastenkuerzel}. Favoriten gelten pro Gesetz, Lesezeichen gesetzesübergreifend.',
    tastenkuerzel: 'lesezeichen-speichern',
    ziel: 'lesezeichen',
  },
  {
    haupttext: 'Klicken Sie auf einen Normtitel oder eine Überschrift, um sie einzuklappen.',
    ziel: null,
  },
  {
    haupttext:
      'Eingeklappte Elemente werden blasser dargestellt. Klicken Sie auf dieses Symbol {zuklappen}, um schrittweise alles einzuklappen.',
    zusatztext:
      'Alternativ {tastenkuerzel}. Zuerst werden alle Normtitel eingeklappt, danach die unteren, zuletzt die oberen Überschriften.',
    tastenkuerzel: 'klappstufe-zuklappen',
    ziel: 'zuklappen',
  },
  {
    haupttext: 'Klicken Sie hier, um alles wieder aufzuklappen.',
    zusatztext: 'Alternativ {tastenkuerzel}.',
    tastenkuerzel: 'klappstufe-aufklappen',
    ziel: 'aufklappen',
  },
];
