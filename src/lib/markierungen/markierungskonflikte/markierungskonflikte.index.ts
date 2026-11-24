// markierungskonflikte.index.ts
//
// Fassade des markierungskonflikte-Submoduls. Wird ausschließlich von
// markierungen.index.ts konsumiert – kein anderer markierungen-Unterordner
// greift hierher zurück. Die Fassade bündelt die öffentlichen Einstiegspunkte.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/markierungen/markierungskonflikte/** darf ausschließlich aus DIESER
// Datei importieren, nie direkt aus den Unterdateien. Die automatische
// Prüfung wird ausdrücklich über initialisiereMarkierungen() angemeldet.

export {
  initialisiereMarkierungen,
  bereiteMarkierungsStartPruefungVor,
  pruefeMarkierungenBeimStart,
  pruefeErforderlicheVollpruefung,
  pruefeAlleMarkierungen,
  pruefeMarkierungenSelektiv,
} from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher';

export type {
  MarkierungskonfliktAnzeigeErgebnis,
  AnzeigeGesetzKonflikte,
  AnzeigeKonfliktEintrag,
} from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';
export { ladeMarkierungskonflikteFuerAnzeige } from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';

export { ermittleFehlendeGesetze } from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen';
export { importFehlenderNormen } from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.import';
export {
  loescheAusgewaehlt,
  loescheAlleMitKonflikten,
} from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.loeschen';
export {
  aktualisiereVerknuepfungMitErgebnis,
  aktualisiereAusgangsVerknuepfungMitErgebnis,
  ladeAktuelleMarkierung,
  ermittleAktuelleVerknuepfungsMoeglichkeit,
  verknuepfeMitAktuellenNormen,
} from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.verknuepfen';
export type { ImportBerichtEintrag } from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.import';
export type { MarkierungsAuswahl } from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.loeschen';
export type { VerknuepfungsBericht } from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.verknuepfen';

export type { VerknuepfungsZahlen } from './konfliktaktionen/markierungskonflikteAktionen';
