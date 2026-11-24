// hilfsfenster-aktionen.index.ts
//
// Fassade des hilfsfenster-aktionen-Submoduls (Schritt 6 des Umbauplans):
// Speicherlogik für die eigenständigen Hilfsfenster Verweismarkierung/Kommentar
// (Zitat-Parsing, Zielnormen-Auflösung, Persistieren, Undo-Historie-
// Meldung). Ausgelagert aus eintrag/, weil dieser Cluster – anders als der
// verbleibende "Speicher"-Cluster in eintrag/ – von KEINEM anderen
// markierungen-Unterordner gebraucht wird, nur von der obersten
// markierungen.index.ts.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/markierungen/hilfsfenster-aktionen/** darf ausschließlich aus DIESER
// Datei importieren, nie direkt aus den Unterdateien.
//
// Die Speicherwege der beiden Fenster sind zwei getrennte Funktionen:
// speichereVerweismarkierung und speichereKommentar.
import type {
  VerweismarkierungKontext,
  KommentarKontext,
} from '@/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext';
export type { VerweismarkierungKontext, KommentarKontext };
export type { ZitatFehler } from '@/lib/markierungen/hilfsfenster-aktionen/verweismarkierungAktionen.zitatAufloesung';

export {
  speichereVerweismarkierung,
  versucheFehlendeGesetzeImportieren,
} from '@/lib/markierungen/hilfsfenster-aktionen/verweismarkierungAktionen';
export type {
  SpeichernErgebnisVerweismarkierung,
  ImportVersuchErgebnis,
} from '@/lib/markierungen/hilfsfenster-aktionen/verweismarkierungAktionen';
export { speichereKommentar } from '@/lib/markierungen/hilfsfenster-aktionen/kommentarAktionen';
export type { SpeichernErgebnisKommentar } from '@/lib/markierungen/hilfsfenster-aktionen/kommentarAktionen';

export {
  registriereMarkierungsHistorienEmpfang,
  wiederholeMarkierungsUebertragung,
  verwerfeMarkierungsUebertragung,
} from './markierungsUebertragung';
export type { MarkierungsUebertragung } from './markierungsUebertragung';

export { istMarkierungsAusgangsstelleZuordenbar } from './verweismarkierungAktionen.persistieren';

export {
  kommentarKontextAbholen,
  verweismarkierungKontextAbholen,
} from './markierungen.hilfsfensterKontext.abholen';
