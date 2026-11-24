// basis.index.ts
// Interface der gemeinsamen Importbasis aller Quellen: reine Konvertierungs- und
// Normalisierungsbausteine (ohne Netz- und Dateizugriffe) sowie gemeinsame
// Bausteine für Verbindungsprüfung, Drosselung und Parallelität von Abrufen.

/** Gliederungsebenen aus quellspezifisch gesammelten Gliederungskennzahlen bestimmen. */
export {
  GliederungsebenenErmittler,
  ebeneAusGliederungskennzahl,
} from '@/lib/import/basis/gliederungsebenenErmittler';
export type {
  ImpAbsatz,
  ImpElement,
  ImpEintrag,
  ListenZustand,
} from '@/lib/import/basis/importTextstruktur';
/** Reine Normalisierung und Absatznummernerkennung ohne Nebenwirkungen. */
export {
  normalisiereBezeichnung,
  extrahiereAbsatznummer,
} from '@/lib/import/basis/importTextstruktur';
/** Tokenisiert Text in Sätze; aktiv:false erhält ungeteilten Text. */
export { tokenize } from '@/lib/import/basis/satzTokenizer';
/** Baut Inhalts-XML aus gesammelten Absätzen, ohne Nachbereitung/Speichern. */
export { baueText } from '@/lib/import/basis/xmlSerialisierung';
/** Baut GesetzesXML aus GesetzInfos/Normen; kein Dateizugriff. */
export { baueGesetzesXML } from '@/lib/import/basis/gesetzesXMLBauer';
export type { GesammelteNorm } from '@/lib/import/basis/gesetzesXMLBauer';
/** Taggt idempotent mit der ausdrücklich übergebenen Referenzliste, auch leer.
 * Unbekannte Gesetzesnamen behalten die bisherige Eigenverweis-Zuordnung.
 * Reine XML-Verarbeitung; keine eigene Referenzbeschaffung oder Fehlerbanner.
 */
export { taggeVerweise } from '@/lib/import/basis/verweisTagger';
/** Entfernt alte Verweis-Hüllen vor erneutem Satzaufbau und Verweistagging. */
export { entferneBestehendeVerweise } from '@/lib/import/basis/verweisTagger';
export type { GesetzesreferenzMitLangtitel } from '@/lib/import/basis/verweisTagger';
/** Eindeutiger Parsererfolg mit XML oder Parserfehler. */
export type { ImportErgebnis } from '@/lib/import/basis/importErgebnis.types';

/** Führt Arbeiten mit begrenzter Gleichzeitigkeit aus; Ergebnisse in Abschlussreihenfolge. */
export { parallelMitLimit } from '@/lib/import/basis/parallelMitLimit';
/** Gleichzeitigkeitsgrenze für HTTP-Abrufe beziehungsweise BW-Fenster. */
export { berechneImportParallelitaet } from '@/lib/import/basis/importParallelitaet';
/** Drosselung für Serien von Abrufen an dieselbe Website. */
export { berechneVerzoegerungMs, warte } from '@/lib/import/basis/ladeDrosselung';
/** Verbindungsfehler erkennen und formulieren, Erreichbarkeit prüfen. */
export {
  FEHLERTEXT_KEINE_VERBINDUNG,
  formuliereVerbindungsFehler,
  istBerechtigungsFehler,
  istVerbindungsFehler,
  pruefeErreichbarkeit,
  timeoutSignal,
  type ImportFehlerKategorie,
} from '@/lib/import/basis/internetVerbindung';
/** Erreichbarkeitsprüfung der Quelle eines Normgebers (Bund, BW, EU) mit einheitlicher Adresse. */
export { pruefeQuelleErreichbar } from '@/lib/import/basis/quellenErreichbarkeit';
