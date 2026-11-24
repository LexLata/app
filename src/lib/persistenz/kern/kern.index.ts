// Fassade des technischen Persistenzkerns: AppData-Dateien und validiertes
// JSON im localStorage. Die fachlichen Module gesetz, fenster und nutzerdaten
// hängen nur von dieser Infrastruktur ab, nicht voneinander. Äußerer Code
// importiert die Kernfunktionen ausschließlich aus dieser Datei; eine
// persistenz-Sammelfassade gibt es bewusst nicht.

export {
  EINSTELLUNGEN_ORDNER,
  appDatenExistiert,
  appDatenLesen,
  appDatenLesenOderNull,
  appDatenLoeschen,
  appDatenOrdnerLesen,
  appDatenSchreiben,
  appDatenVerarbeitungszeitAuffrischen,
  sicherstelleOrdner,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';

export {
  appDatenLesenGeschuetzt,
  sichereBeiUngueltigemInhalt,
} from '@/lib/persistenz/kern/appDatenLesenGeschuetzt';
export {
  pruefeSchemaversion,
  SCHEMAVERSION_EREIGNIS,
} from '@/lib/persistenz/kern/schemaversionHinweis';

export {
  ladeJSON,
  speichereJSON,
  istRecord,
  ohneObjectPrototype,
} from '@/lib/persistenz/kern/localStorageJSON';

export { meldePersistenzBefund } from '@/lib/persistenz/kern/persistenzMeldung';

export {
  mitDateiSperre,
  mitDateiSperren,
  unterbrecheDateiSperre,
  istDateiSperreWartefrist,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';

export {
  registrierePruefpflichtigeAenderung,
  merkePruefpflichtigeAenderungVor,
  schliessePruefpflichtigeQuelleAb,
} from '@/lib/persistenz/kern/pruefpflichtigeAenderung';
export type { PruefpflichtigerQuellabschluss } from '@/lib/persistenz/kern/pruefpflichtigeAenderung';

export {
  LESEZEICHEN_DATEINAME,
  GESETZESKURZBEFEHLE_DATEINAME,
  MARKIERUNGEN_SUFFIX,
  FAVORITEN_SUFFIX,
  NICHTAMTLICHE_TITEL_SUFFIX,
  dateiBasis,
  referenzAusDateiBasis,
  nichtamtlicheTitelRessourcenPfad,
} from '@/lib/persistenz/kern/gesetzDateiname';

export {
  GESETZE_ORDNER,
  MARKIERUNGEN_ORDNER,
  FAVORITEN_ORDNER,
  NICHTAMTLICHE_TITEL_ORDNER,
  normalisierteDateiBasis,
  ermittleGesetzDateipfad,
  mitGesetzDateiSperre,
  mitGesetzDateiSperren,
} from '@/lib/persistenz/kern/gesetzDateipfad';

export { bereinigeXmlBestand } from './xmlBestandBereinigen';

export { nutzerdatenSchreiben, sichereNutzerdatenVorAenderung } from './nutzerdatenSchreiben';
