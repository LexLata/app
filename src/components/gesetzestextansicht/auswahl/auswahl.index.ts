// auswahl.index.ts
//
// Öffentliche Schnittstelle des gesetzestextansicht/auswahl-Submoduls: die
// Auswahlleiste, die bei Textauswahl im Gesetzestext erscheint
// (Unterstreichen/Hervorheben/Verweismarkierung/Kommentar anlegen, Verweis
// kopieren).
//
// REGEL (dependency-cruiser, siehe scripts/automatisch/modulgrenzen.cjs,
// Regel 'nur-auswahl-index-darf-von-aussen-genutzt-werden'): Code
// außerhalb von src/components/gesetzestextansicht/auswahl/** – das schließt
// Gesetzestextansicht.tsx und die übrigen Submodule von gesetzestextansicht mit ein
// – darf ausschließlich aus DIESER Datei importieren.

/** Ermittelt Auswahl und Sichtbarkeit der Auswahlleiste.
 * Überholte Ermittlungen werden verworfen; Listener werden beim Unmount
 * aufgeräumt. Die gelieferten Funktionen steuern Ausblenden und Kopierschutz. */
export { useAuswahlleiste } from '@/components/gesetzestextansicht/auswahl/useAuswahlleiste';

/** Rendert Auswahlaktionen und ruft die übergebenen Handler auf.
 * Ein erfolgreicher Kopierabschluss zeigt kurz die bestehende Rückmeldung;
 * überholte Abschlüsse und Timer haben keine weiteren UI-Wirkungen. */
export { Auswahlleiste } from '@/components/gesetzestextansicht/auswahl/auswahlleiste';

/** Liefert die Zitieroperation für die Zwischenablage: true bei Erfolg,
 * false bei unbildbarem Zitat oder fehlgeschlagenem Schreibzugriff.
 * Bei normübergreifendem Kopierziel erscheint die bestehende Warnmeldung. */
export { useZitatKopieren } from '@/components/gesetzestextansicht/auswahl/useZitatKopieren';
