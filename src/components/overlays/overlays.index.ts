// overlays.index.ts
//
// Öffentliche Schnittstelle des components/overlays-Moduls.
//
// Anders als etwa bei lib/import oder lib/markierungen gibt es hier KEINE
// funktionale Verdichtung (keine Overloads, keine zusammengelegten
// Funktionen) – die Overlay-Komponenten sind fachlich bereits unabhängig,
// jede mit eigenem, schlankem Props-Interface. Die Deep-Module-Leistung
// dieser Datei ist rein strukturell: sie versteckt
//   (a) die Aufteilung in standard/ und suche/,
//   (b) die gemeinsamen Bausteine (OverlayRahmen, OverlayKopfzeile,
//       OverlaySchliessenButton, OverlayTrennlinie, KurzbefehlChip),
//   (c) overlay-interne Helfer (Gesetzesuebersicht.tastatur.ts,
//       SuchleisteKopf, VolltextSucheOverlay.helpers.ts).
// Kein Fall hier hat einen Grund für eine Ausnahme von der Fassade (anders
// als z. B. dynamische Importe wegen Zirkelbezug bei lib/markierungen).
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/components/overlays/** darf ausschließlich aus DIESER Datei
// importieren, nie direkt aus standard/ oder suche/. components/overlays
// selbst darf weiterhin frei aus jedem anderen Bereich importieren
// (lib/domain, lib/persistenz, …) – die Beschränkung gilt nur in
// Zugriffsrichtung "von außen nach rein".

/** Verwaltung der installierten Gesetze; schließt vor Navigation. */
export { Gesetzesuebersicht } from '@/components/overlays/standard/Gesetzesuebersicht';
/** Aktualisiert Gesetze und zeigt Ergebnisse je Gesetz; sperrt lokales Schließen während Arbeit. */
export { AktualisierenOverlay } from '@/components/overlays/standard/AktualisierenOverlay';
/** Zeigt Informationen zum übergebenen Gesetz. */
export { GesetzInfoOverlay } from '@/components/overlays/standard/GesetzInfoOverlay';
/** Legt Favoriten anhand eingegebener Normbezeichnungen an und zeigt das Ergebnis. */
export { FavoritenHinzufuegenOverlay } from '@/components/overlays/standard/FavoritenHinzufuegenOverlay';
/** Zeigt den Tabverlauf; schließt vor Navigation im aktuellen oder neuen Tab. */
export { VerlaufOverlay } from '@/components/overlays/standard/VerlaufOverlay';
/** Exportiert ausgewählte Kategorien; Fehler und Dialogabbruch lassen das Overlay offen. */
export { ExportOverlay } from '@/components/overlays/standard/ExportOverlay';
/** Zeigt Importbericht und löst Konflikte einzeln oder gesammelt; sperrt lokales Schließen während Arbeit. */
export { DateiImportOverlay } from '@/components/overlays/standard/DateiImportOverlay';
/** Zeigt und verwaltet die Importindizes; ihre Verarbeitung liegt im Importmodul. */
export { ImportindexOverlay } from '@/components/overlays/standard/ImportindexOverlay';
/** Sucht Gesetze/Normen, importiert gewählte Importindextreffer und schließt vor Navigation. */
export { OeffnenOverlay } from '@/components/overlays/suche/OeffnenOverlay';
/** Sucht in genau einem Gesetz oder einer Gesetzeliste; schließt vor Treffer-Navigation. */
export { VolltextSucheOverlay } from '@/components/overlays/suche/VolltextSucheOverlay';
/** Nicht überspringbare Linux-Titelleistenauswahl; meldet Auswahl an die Anwendung. */
export { LinuxTitelleistenAbfrage } from '@/components/overlays/standard/LinuxTitelleistenAbfrage';

/** Präsentiert einen Treffer; Navigation und Auswahl verbleiben beim Aufrufer. */
export { TrefferZeile } from '@/components/overlays/suche/OeffnenTrefferZeile';

/** Zeigt den eingebetteten Datenschutzhinweis ohne Internetabruf. */
export { DatenschutzOverlay } from '@/components/overlays/standard/DatenschutzOverlay';

/** Zeigt den eingebetteten Text „Über LexLata“ mit Version und aufklappbaren Drittlizenzen. */
export { UeberOverlay } from '@/components/overlays/standard/UeberOverlay';

/** Zeigt die festen Tastenkürzel aus dem gemeinsamen Katalog. */
export { TastenkuerzelOverlay } from '@/components/overlays/standard/TastenkuerzelOverlay';

/** Zeigt einen leeren Zustand der Suchleiste mit dem übergebenen Hinweistext. */
export { SuchleisteKeinErgebnis } from '@/components/overlays/suche/SuchleisteKeinErgebnis';

/** Fensterlokale Vorbereitung und flüchtiger Suchtext der Alle-Gesetze-Volltextsuche. */
export { useVolltextSuchtext } from '@/components/overlays/suche/useVolltextSuchtext';
