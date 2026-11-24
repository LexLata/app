// Gemeinsame strukturelle Textpositionen für das Gesetzesmodell und die Textpfad-Auswertung.
// Diese Typen benötigen weder Gesetzesmodell noch DOM- oder Rekonstruktionsfunktionen.

/** Art eines Listeneintrags – der tatsächliche Herkunfts-Tag (<nummer> oder
 *  <litera>) im GesetzesXML. Wird an JEDEM Schritt einer Verschachtelung
 *  aus dem echten XML-Tag gelesen (gesetzesXMLParser.ts), nicht aus der
 *  Verschachtelungstiefe geraten – so bleibt z.B. "litera direkt unter einem
 *  Satz ohne umgebende nummer" oder "nummer unter einer litera" korrekt
 *  unterscheidbar, auch wenn beide Reihenfolgen im selben Gesetz vorkommen. */

export type ListenEintragEbene = 'nummer' | 'litera';

/** Ein Schritt der vollständigen Kette vom äußersten zum innersten Listeneintrag. */
export interface TextpfadEintrag {
  ebene: ListenEintragEbene;
  bezeichnung: string;
  /** Siehe wiederholungsIndex (satzEintragBausteine.tsx) –
   *  0-basierter Index unter Geschwistern mit identischer bezeichnung,
   *  unabhängig von deren ebene, an dieser Stelle der Kette (nicht global).
   *  undefined/0 = erstes Vorkommen. */
  wiederholung?: number;
}

type Bereich = 'amtlicherTitel' | 'nichtamtlicherTitel' | 'bezeichnung';

/** Die Kette bezeichnet mindestens einen Listeneintrag. */
export type Eintragskette = readonly [TextpfadEintrag, ...TextpfadEintrag[]];

export type NormtextBasis = {
  typ: 'normtext';
  absatz?: string;
  absatzWiederholung?: number;
  unterabsatz?: string;
  satz?: number;
  bereich?: never;
};

/** Bereich und Normtext schließen sich aus; ein innerer Satz braucht eine Kette. */
export type Textpfad =
  | {
      typ: 'bereich';
      bereich: Bereich;
      absatz?: never;
      absatzWiederholung?: never;
      unterabsatz?: never;
      satz?: never;
      eintraege?: never;
      satzInEintrag?: never;
    }
  | (NormtextBasis & { eintraege?: never; satzInEintrag?: never })
  | (NormtextBasis & { eintraege: Eintragskette; satzInEintrag?: number });

export interface Textstelle {
  pfad: Textpfad;
  zeichenbereichStart: number;
  zeichenbereichEnde: number;
}
