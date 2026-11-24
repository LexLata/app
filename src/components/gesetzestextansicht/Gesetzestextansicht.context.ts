// Gesetzestextansicht.context.ts
// Einklapp-Kontext: wird von Gesetzestextansicht bereitgestellt, damit UeberschriftZeile/NormBlock
// per Klick ein-/ausklappen können, ohne dass jede Zwischen-
// komponente (AbsatzListe, AbsatzBlock, …) die Props durchschleifen muss.

import { createContext } from 'react';

export interface EinklappState {
  eingeklappteUeberschriften: ReadonlySet<string>; // ids von UeberschriftDarstellung
  eingeklappteNormen: ReadonlySet<string>; // ids von NormDarstellung (inkl. Gliederungsartikel)
  aktivesElementId: string | null;
  /** ids von Normen, die gemäß ueberschriftartig wie Überschriften behandelt
   *  werden (Gliederungsartikel mit §§ darunter, z. B. Art. 229 EGBGB). */
  ueberschriftArtigeNormIds: ReadonlySet<string>;
  /** ids von Überschriften/überschriftsartigen Normen, vor denen ein horizontaler
   *  Trennstrich angezeigt werden soll (Wechsel von tieferer zu höherer Ebene
   *  in sichtbareElemente). Berechnet aus sichtbareElemente – berücksichtigt
   *  daher automatisch den Einklapp-Zustand. */
  trennerVorIds: ReadonlySet<string>;
  /** ids von Überschriften, die hierarchisch unter einem überschriftsartigen
   *  Gliederungsartikel liegen (z. B. Unterabschnitte in Art. 229 EGBGB).
   *  Erhalten die Schriftgröße und den Zeilenabstand des Gliederungsartikels. */
  unterArtikelIds: ReadonlySet<string>;
  onUeberschriftKlick: (id: string) => void;
  onNormKlick: (id: string) => void;
  /** Klick auf den Normtext (Absätze/Sätze): aktiviert nur, klappt nicht ein/aus
   *  – im Unterschied zu onNormKlick, das beides zugleich tut. */
  onNormTextKlick: (id: string) => void;
  /** Minimalistischer Modus (siehe useMinimalistischerModus.ts): blendet die
   *  Hover-Chevron-Spalte vor Überschriften-/Normzeilen aus (siehe
   *  UeberschriftZeile/NormBlock). */
  minimalistischerModus: boolean;
}

export const EinklappCtx = createContext<EinklappState>({
  eingeklappteUeberschriften: new Set(),
  eingeklappteNormen: new Set(),
  aktivesElementId: null,
  ueberschriftArtigeNormIds: new Set(),
  trennerVorIds: new Set(),
  unterArtikelIds: new Set(),
  onUeberschriftKlick: () => {},
  onNormKlick: () => {},
  onNormTextKlick: () => {},
  minimalistischerModus: false,
});
