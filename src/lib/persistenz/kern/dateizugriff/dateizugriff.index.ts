// Interface des Dateizugriffs im Persistenzkern: AppData-Dateien lesen,
// schreiben und auflisten sowie Dateisperren. Die übrigen Kerndateien und
// kern.index.ts greifen nur über diese Datei zu; Tests ersetzen den
// Dateizugriff über dieses Interface.

export {
  EINSTELLUNGEN_ORDNER,
  appDatenExistiert,
  appDatenLesen,
  appDatenLesenOderNull,
  appDatenLesenOhneHinweis,
  appDatenLoeschen,
  appDatenOrdnerLesen,
  appDatenSchreiben,
  appDatenVerarbeitungszeitAuffrischen,
  sicherstelleOrdner,
} from './appDatenZugriff';

export {
  istDateiSperreWartefrist,
  mitDateiSperre,
  mitDateiSperren,
  unterbrecheDateiSperre,
  nachDateiSperrenFreigabe,
} from './dateiSperre';
