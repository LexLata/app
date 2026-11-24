// gemeinsam.index.ts
//
// Fassade des gemeinsam-Submoduls. gemeinsam/ ist die Basis-Schicht von
// markierungen/: enthält seit Schritt 1 des Umbauplans auch die reinen
// Domäntypen (markierungSpeicher.types.ts, hierher verschoben aus eintrag/,
// weil sie bereits vorher breiter von hier UND von markierungskonflikte/
// gebraucht wurden als von eintrag/ selbst – kein schmaler Ausschnitt,
// siehe Plan Abschnitt 1) sowie die Markierungskonflikt-Prüflogik, die sowohl
// eintrag/ als auch markierungskonflikte/ braucht.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/markierungen/gemeinsam/** darf ausschließlich aus DIESER Datei
// importieren, nie direkt aus markierungskonfliktPruefung.ts/
// markierungSpeicher.types.ts.
//
// Diese Fassade ist breiter als das, was markierungen.index.ts nach AUSSEN
// zeigt (dort MarkierungsTyp und findeElementZuBezeichnung) – die übrigen
// Funktionen/Typen werden intern von eintrag/, markierungskonflikte/ und
// hilfsfenster-aktionen/ gebraucht.

// ---------------------------------------------------------------------------
// Domäntypen (verschoben aus eintrag/markierungSpeicher.types.ts)
// ---------------------------------------------------------------------------

export type {
  Elementstand,
  Verweisziel,
  VerweisInhalt,
  MarkierungsEintrag,
  MarkierungsTyp,
} from '@/lib/markierungen/gemeinsam/markierungSpeicher.types';

// ---------------------------------------------------------------------------
// Markierungskonflikt-Prüflogik
// ---------------------------------------------------------------------------

export type {
  EigenerKonflikt,
  ZielKonflikt,
  ZielnormBefund,
  KonfliktEintrag,
  GesetzKonflikte,
} from '@/lib/markierungen/gemeinsam/markierungskonfliktPruefung';

export {
  findeElementZuBezeichnung,
  ausgangsstelleNichtEindeutigMeldung,
  loeseAusgangsstelleAuf,
  bestimmeIdentifizierendeFelder,
  berechneZielKonflikte,
  klassifiziereZielnorm,
  identitaetsSchluessel,
  ausgangsnormSchluessel,
  pruefeEigenenKonflikt,
  pruefeNichtamtlicheTitelXmlFehlt,
  pruefeMarkierung,
  pruefeMarkierungenEinesGesetzes,
} from '@/lib/markierungen/gemeinsam/markierungskonfliktPruefung';

export { markierungsBezug } from './markierungsBezug';

export { vergleicheMarkierungsposition } from './markierungsReihenfolge';
