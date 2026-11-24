// eintrag.index.ts
//
// Fassade des eintrag-Submoduls NACH dem Split (Schritt 6 des Umbauplans):
// eintrag/ enthält nur noch den "Speicher"-Cluster (Persistenz, Undo,
// Events, direktes Hinzufügen von
// Unterstreichung/Hervorhebung). Die Hilfsfenster-Speicherlogik für
// Verweismarkierung/Kommentar liegt seit dem Split in hilfsfenster-aktionen/.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/markierungen/eintrag/** darf ausschließlich aus DIESER Datei
// importieren, nie direkt aus den Unterdateien. Das gilt auch für andere
// markierungen-Unterordner (dateiimport/, markierungskonflikte/,
// hilfsfenster-aktionen/ – letzteres inkl. der dynamischen Importe).
//
// Diese Fassade ist deutlich breiter als das, was markierungen.index.ts
// nach AUSSEN zeigt – sie deckt den
// gesamten Bedarf der Geschwister-Ordner ab, re-exportiert dafür aber
// größtenteils 1:1 die bereits bestehenden öffentlichen Exporte der
// Speicher-Dateien.

// ---------------------------------------------------------------------------
// Markierungspersistenz: Quellkoordination, Lesen, Bestandsänderungen und Einzelaktionen
// ---------------------------------------------------------------------------

export { MARKIERUNGEN_ORDNER } from '@/lib/markierungen/eintrag/markierungSpeicher';
export {
  ladeEintraege,
  ladeEintraegeFuerPruefung,
  BeschaedigteMarkierungsdateiFehler,
  leseMarkierungsXML,
  leseMarkierungsXMLFuerPruefung,
  ermittleGesetzeMitMarkierungen,
  ladeMarkierungen,
} from '@/lib/markierungen/eintrag/markierungSpeicher.lesen';
export {
  aendereEintraege,
  aendereEintraegeMitGesetzquellen,
  leseEintraegeMitGesetzquellen,
  ersetzeMarkierungsXML,
  loescheMarkierungsDatei,
} from '@/lib/markierungen/eintrag/markierungSpeicher.aendern';
export type { BearbeitungsStaende } from '@/lib/markierungen/eintrag/markierungSpeicher.aktionen';
export {
  entferneMarkierung,
  aktualisiereZielnorm,
  aktualisiereKommentar,
} from '@/lib/markierungen/eintrag/markierungSpeicher.aktionen';

// ---------------------------------------------------------------------------
// markierungSpeicher.hinzufuegen.ts – direktes Hinzufügen (Unterstreichen/
// Hervorheben ohne Hilfsfenster), inkl. Konfliktprüfung beim Einfügen.
// ---------------------------------------------------------------------------

export {
  bereichUeberlappt,
  pruefeMarkierungAnStelle,
  istIdentischeAllgemeineMarkierung,
  zeigeUeberlappungsBanner,
  hinzufuegenMarkierung,
} from '@/lib/markierungen/eintrag/markierungSpeicher.hinzufuegen';
export type { HinzufuegenErgebnis } from '@/lib/markierungen/eintrag/markierungSpeicher.hinzufuegen';

// ---------------------------------------------------------------------------
// markierungSpeicher.ereignisse.ts – Änderungs-Benachrichtigungen
// ---------------------------------------------------------------------------

export {
  beiMarkierungGeaendert,
  beiMarkierungenBulkGeaendert,
} from '@/lib/markierungen/eintrag/markierungSpeicher.ereignisse';

// ---------------------------------------------------------------------------
// markierungSpeicher.undo.ts – Undo/Redo
// ---------------------------------------------------------------------------

export type {
  VerweisBearbeitenWerte,
  KommentarBearbeitenWerte,
  MarkierungsAktion,
} from '@/lib/markierungen/eintrag/markierungSpeicher.undo';
export {
  fuehreRueckgaengigAus,
  fuehreWiederholenAus,
} from '@/lib/markierungen/eintrag/markierungSpeicher.undo';

export type {
  EintragsAenderung,
  MarkierungsSchreibErgebnis,
} from '@/lib/markierungen/eintrag/markierungSpeicher';

export type { AktualisierenErgebnis } from './markierungSpeicher';

export { gemeinsameBearbeitungsWerte } from '@/lib/markierungen/eintrag/markierungSpeicher.undo';
