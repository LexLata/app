// Fassade der Gesetz-Persistenz: Gesetz-XML, Speicherereignisse und
// nichtamtliche Titel. Import- und Download-Fachlogik liegen in lib/import.
// Externe Aufrufer verwenden ausschließlich diese Datei; die Rohtext- und
// Ersetzen-Operationen bleiben hier öffentlich, weil der Datei-Import sie
// zum Vergleichen und Ersetzen gespeicherter Dateien benötigt.

export { leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzInfosLesen';
export type { GesetzLadeBefund } from './gesetzspeicher/gesetzSpeicher.typen';
export {
  LANDESRECHT_BW_QUELLE,
  BeschaedigteGesetzdateiFehler,
  GesetzSpeicherFolgefehler,
  type GesetzLoeschErgebnis,
} from './gesetzspeicher/gesetzSpeicher.typen';
export { ladeGesetzesXML } from './gesetzspeicher/gesetzSpeicher';
export {
  ladeAlleGesetzeFuerPruefung,
  ladeGesetzeFuerPruefung,
  ladeGesetzFuerVerknuepfung,
} from './gesetzspeicher/gesetzSpeicher.pruefladen';
export {
  pruefeGesetzDatei,
  sichereUngueltigeGesetzDatei,
} from './gesetzspeicher/gesetzSpeicher.sicherung';
export { speichereGesetz, loescheGesetz } from './gesetzspeicher/gesetzSpeicher.schreiben';
export {
  beiNichtamtlicheTitelGeschrieben,
  beiSpeicherBatchAbgeschlossen,
  istSpeicherBatchRuhig,
  mitSpeicherSammelbatch,
  type SpeicherSammelbatch,
  warteAufSpeicherBatchAbschluss,
  beendenVorbereiten,
} from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicherEreignisse';
export {
  pruefeNichtamtlicheTitelXML,
  existierenNichtamtlicheTitelFuerPruefung,
  ladeNichtamtlicheTitelFuerPruefung,
  BeschaedigteTiteldateiFehler,
} from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.pruefen';
export {
  ladeNichtamtlicheTitel,
  hatNormenOhneTitel,
} from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.laden';
export {
  synchronisiereNichtamtlicheTitelFuerGesetze,
  synchronisiereEinNichtamtlicheTitel,
  ersetzeNichtamtlicheTitelDatei,
  leseNichtamtlicheTitelRohtext,
} from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.synchronisieren';
export { leseNichtamtlicheTitelFuerExport } from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher';

/** Abgeleitetes Verzeichnis; ohne Abgleich keine Bestätigung fehlender Gesetze. */
export {
  leseSuchverzeichnis,
  mitSuchverzeichnisFuerKurzbefehlsbereinigung,
} from './suchverzeichnis/suchverzeichnisDatei';
export type { Suchverzeichnis } from './suchverzeichnis/suchverzeichnisDatei';
export {
  gleicheSuchverzeichnisAb,
  leseAbgeglichenesSuchverzeichnis,
} from './suchverzeichnis/suchverzeichnisAbgleich';
export type {
  SuchverzeichnisAbgleichErgebnis,
  SuchverzeichnisFortschritt,
} from './suchverzeichnis/suchverzeichnisAbgleich';
export {
  leseGesetz,
  leseGesetzesreferenzen,
  pruefeGesetzExistenz,
} from './gesetzspeicher/gesetzSpeicher.einzelweg';
export type { GesetzLeseErgebnis } from './gesetzspeicher/gesetzSpeicher.einzelweg';

export { istSuchverzeichniseintragAktuell } from './gesetzspeicher/gesetzDateistempel';

export { wendeNichtamtlicheTitelAn } from './nichtamtliche-titel/nichtamtlicheTitelSpeicher.laden';
export type { GesetzLadeabschluss } from './gesetzspeicher/gesetzSpeicher.typen';

/** meldeGesetzBefundeAnEmpfaenger meldet Ladebefunde an einen Vorgangsempfänger;
 *  gesetzBefundAlsMeldung bildet einen nicht reparierbaren Ladebefund auf die
 *  gegliederte Meldung ab (Grund, Datei, Ursache, Sicherung) – für alle Anzeigen. */
export {
  gesetzBefundAlsMeldung,
  meldeGesetzBefundeAnEmpfaenger,
} from './gesetzspeicher/gesetzSpeicher.befunde';
export type { GesetzZustandsBefund } from './gesetzspeicher/gesetzSpeicher.befunde';

export { vergleicheSuchverzeichnisDateistempel } from './suchverzeichnis/suchverzeichnisStempelvergleich';
