// markierungen.index.ts
//
// Öffentliche Schnittstelle des lib/markierungen-Moduls (Deep Module nach
// Ousterhout). Re-exportiert
// AUSSCHLIESSLICH aus den sechs Unter-Fassaden, ohne eigene Logik, analog zu
// lib/import/import.index.ts.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/markierungen/** darf ausschließlich aus DIESER Datei
// importieren, nie direkt aus den Unterordnern.

// ---------------------------------------------------------------------------
// eintrag/ – Markierung erstellen/bearbeiten/löschen (Unterstreichen/
// Hervorheben direkt), Undo/Redo-Ausführung, Anzeige-Laden.
// ---------------------------------------------------------------------------

export type { MarkierungsSchreibErgebnis } from '@/lib/markierungen/eintrag/eintrag.index';
export type {
  Verweisziel,
  VerweisInhalt,
  MarkierungsEintrag,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';

export {
  MARKIERUNGEN_ORDNER,
  ladeMarkierungen,
  entferneMarkierung,
} from '@/lib/markierungen/eintrag/eintrag.index';

export {
  pruefeMarkierungAnStelle,
  hinzufuegenMarkierung,
  zeigeUeberlappungsBanner,
} from '@/lib/markierungen/eintrag/eintrag.index';
export type { HinzufuegenErgebnis } from '@/lib/markierungen/eintrag/eintrag.index';

export type { MarkierungsAktion } from '@/lib/markierungen/eintrag/eintrag.index';
export {
  fuehreRueckgaengigAus,
  fuehreWiederholenAus,
} from '@/lib/markierungen/eintrag/eintrag.index';

// ---------------------------------------------------------------------------
// hilfsfenster-aktionen/ – Verweismarkierung-/Kommentar-Fenster (Hilfsfenster, eigenständiges
// Fenster statt Overlay).
// ---------------------------------------------------------------------------

export type {
  VerweismarkierungKontext,
  KommentarKontext,
  ZitatFehler,
  SpeichernErgebnisVerweismarkierung,
  ImportVersuchErgebnis,
  SpeichernErgebnisKommentar,
  MarkierungsUebertragung,
} from '@/lib/markierungen/hilfsfenster-aktionen/hilfsfenster-aktionen.index';
export {
  speichereVerweismarkierung,
  speichereKommentar,
  registriereMarkierungsHistorienEmpfang,
  wiederholeMarkierungsUebertragung,
  verwerfeMarkierungsUebertragung,
  versucheFehlendeGesetzeImportieren,
  kommentarKontextAbholen,
  verweismarkierungKontextAbholen,
} from '@/lib/markierungen/hilfsfenster-aktionen/hilfsfenster-aktionen.index';

// ---------------------------------------------------------------------------
// gemeinsam/ – von eintrag/ UND markierungskonflikte/ genutzt.
// ---------------------------------------------------------------------------

export type { MarkierungsTyp } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
export {
  findeElementZuBezeichnung,
  ausgangsstelleNichtEindeutigMeldung,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';

// ---------------------------------------------------------------------------
// markierungskonflikte/ (Submodul) – Fenster bleibt außerhalb, ruft nur hier
// rein.
// ---------------------------------------------------------------------------

export {
  initialisiereMarkierungen,
  bereiteMarkierungsStartPruefungVor,
  pruefeMarkierungenBeimStart,
  pruefeErforderlicheVollpruefung,
  pruefeAlleMarkierungen,
} from '@/lib/markierungen/markierungskonflikte/markierungskonflikte.index';

export type {
  MarkierungskonfliktAnzeigeErgebnis,
  AnzeigeGesetzKonflikte,
  AnzeigeKonfliktEintrag,
} from '@/lib/markierungen/markierungskonflikte/markierungskonflikte.index';
export {
  ladeMarkierungskonflikteFuerAnzeige,
  ermittleFehlendeGesetze,
  importFehlenderNormen,
  loescheAusgewaehlt,
  loescheAlleMitKonflikten,
  aktualisiereVerknuepfungMitErgebnis,
  aktualisiereAusgangsVerknuepfungMitErgebnis,
  ladeAktuelleMarkierung,
  ermittleAktuelleVerknuepfungsMoeglichkeit,
  verknuepfeMitAktuellenNormen,
} from '@/lib/markierungen/markierungskonflikte/markierungskonflikte.index';
export type {
  ImportBerichtEintrag,
  MarkierungsAuswahl,
  VerknuepfungsBericht,
  VerknuepfungsZahlen,
} from '@/lib/markierungen/markierungskonflikte/markierungskonflikte.index';

// ---------------------------------------------------------------------------
// dateiimport/ – Bausteine für den Sammel-Dateiimport.
// ---------------------------------------------------------------------------

export {
  beurteileMarkierungsImport,
  istMarkierungsImportUnveraendert,
  zusammenfuehrenMarkierungen,
  ersetzeMarkierungenDatei,
  leseMarkierungenRohtext,
} from '@/lib/markierungen/dateiimport/dateiimport.index';
/** Gesetzesreferenz einer MarkierungsXML; wirft bei fehlender Referenz oder ungültigem Normgeber. */
export { liesMarkierungsGesetz } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

// ---------------------------------------------------------------------------
// zitat/ – Zitierformatierung für die Auswahlleiste.
// parseZitat bleibt außerhalb von markierungen/ unsichtbar.
// ---------------------------------------------------------------------------

export type { ZitatEinstellungenWerte } from '@/lib/markierungen/zitat/zitat.index';
export { formatiereZitat, formatiereFundstelle } from '@/lib/markierungen/zitat/zitat.index';

export { istMarkierungsAusgangsstelleZuordenbar } from './hilfsfenster-aktionen/hilfsfenster-aktionen.index';
