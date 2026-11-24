// markierung.index.ts
//
// Öffentliche Schnittstelle des gesetzestextansicht/markierung-Submoduls:
// Markierungs-Kontext (Unterstreichung/Hervorhebung/Verweismarkierung/
// Kommentar) sowie deren Anzeige-Bausteine.
//
// REGEL (dependency-cruiser, siehe scripts/automatisch/modulgrenzen.cjs,
// Regel 'nur-markierung-index-darf-von-aussen-genutzt-werden'): Code
// außerhalb von src/components/gesetzestextansicht/markierung/** – das
// schließt Gesetzestextansicht.tsx und die übrigen Submodule von
// gesetzestextansicht mit ein – darf ausschließlich aus DIESER Datei
// importieren. Betrifft insbesondere baum/ (Consumer von MarkierungCtx,
// VerweisAnzeige, KommentarSymbol usw., s.u.).
//
// VORAUSSETZUNG für diese Fassade (siehe Umbauplan Abschnitt 6.1):
// VerweisAnzeige/KommentarSymbol müssen vorher aus
// textBlatt.tsx (künftig baum/) hierher verschoben werden
// (neue Datei markierungsBausteine.tsx) – sonst entsteht
// ein Modul-Zyklus baum ⇄ markierung, da markierungsAnzeige.tsx
// umgekehrt schon MarkierungCtx aus diesem Submodul braucht.

// ---------------------------------------------------------------------------
// Markierungs-Kontext
// ---------------------------------------------------------------------------

/** React-Context mit den Markierungs-Callbacks (onVerweisKlick,
 *  onMarkierungRechtsklick, onKommentarKlick) + markierungenNachXmlId.
 *  Aufrufer: Gesetzestextansicht.tsx (Provider), baum/ (Consumer in
 *  normBlock/textBlatt/ueberschriftZeile). */
export { MarkierungCtx } from '@/components/gesetzestextansicht/markierung/markierungContext';

/** Form von MarkierungCtx. Aufrufer: baum/ (Prop-Typisierung der
 *  Segment-Renderer in textBlatt.tsx). */
export type { MarkierungState } from '@/components/gesetzestextansicht/markierung/markierungContext';

/** Baut den MarkierungCtx-Wert (inkl. Kontextmenü-Aufruf bei Rechtsklick).
 *  Aufrufer: Gesetzestextansicht.tsx. */
export { useMarkierungCtxValue } from '@/components/gesetzestextansicht/markierung/useMarkierungCtxValue';

/** Lädt/aktualisiert markierungenNachXmlId aus dem Markierungsspeicher.
 *  Aufrufer: Gesetzestextansicht.tsx. */
export { useMarkierungenAnzeige } from '@/components/gesetzestextansicht/markierung/useMarkierungenAnzeige';

// ---------------------------------------------------------------------------
// Getaggte Verweise (aus dem Quell-XML, nicht persistiert)
// ---------------------------------------------------------------------------

/** Kennzeichnet die Quellenverweise einer Norm als Textauszeichnungen für baum/. */
export { getaggteVerweiseAlsTextauszeichnungen } from '@/components/gesetzestextansicht/markierung/getaggteVerweise';

// ---------------------------------------------------------------------------
// Anzeige-Bausteine (allgemein, ohne Textbezug – hinter Normzeile/
// Überschrift)
// ---------------------------------------------------------------------------

/** Rendert allgemeine Verweise (ohne Textbezug) hinter der
 *  Normzeile/Überschrift. Aufrufer: baum/normBlock.tsx,
 *  baum/ueberschriftZeile.tsx. */
export { VerweisSuperscript } from '@/components/gesetzestextansicht/markierung/markierungsAnzeige';

/** Rendert allgemeine Kommentare (ohne Textbezug) hinter der
 *  Normzeile/Überschrift. Aufrufer: baum/normBlock.tsx,
 *  baum/ueberschriftZeile.tsx. */
export { KommentarSuperscript } from '@/components/gesetzestextansicht/markierung/markierungsAnzeige';

// ---------------------------------------------------------------------------
// Anzeige-Bausteine (textbezogen – inline im Fließtext)
// ---------------------------------------------------------------------------
// NEU an diesem Ort (verschoben aus textBlatt.tsx, siehe
// Kopfkommentar) – Datei: markierungsBausteine.tsx.

/** Rendert den (ggf. anklickbaren) Zitat-Text eines Verweises –
 *  sowohl inline im Fließtext direkt hinter der unterstrichenen
 *  Textstelle als auch im Superscript (VerweisSuperscript, s.o.).
 *  Aufrufer: baum/textBlatt.tsx (inline), intern
 *  (VerweisSuperscript). */
export { VerweisAnzeige } from '@/components/gesetzestextansicht/markierung/markierungsBausteine';

/** Rendert das klickbare Kommentar-Infosymbol (ⓘ). Aufrufer:
 *  baum/textBlatt.tsx (inline), intern
 *  (KommentarSuperscript). */
export { KommentarSymbol } from '@/components/gesetzestextansicht/markierung/markierungsBausteine';

/** Packt jedes geschützte Leerzeichen (\u00A0) in eine eigene inline-block-
 *  Box, damit Blocksatz es nicht auseinanderzieht (siehe Kopfkommentar in
 *  markierungsBausteine.tsx). Reine Rendering-Hilfsfunktion,
 *  kein Markierungsbezug – liegt hier nur, weil VerweisAnzeige sie
 *  ebenfalls braucht. Aufrufer: baum/textBlatt.tsx (4
 *  weitere Stellen außerhalb von VerweisAnzeige), intern (VerweisAnzeige). */
export { mitFixierterLeerzeichenbreite } from '@/components/gesetzestextansicht/markierung/mitFixierterLeerzeichenbreite';

/** Getaggtes Klickziel innerhalb einer zusammenhängenden Nutzer-Markierung. */
export { GetaggterVerweisText } from '@/components/gesetzestextansicht/markierung/markierungsBausteine';

/** Gruppiert vollständig geschützten Text vor dekorativer Aufteilung; render
 * erhält den Gruppentext und seinen UTF-16-Start im ursprünglichen Blatt. */
export { mitUmbruchschutz } from '@/components/gesetzestextansicht/markierung/umbruchschutz';

/** Schützt vollständigen Blatttext vor der Segmentierung; erzeugt keinen persistenten Zustand. */
export {
  geschuetzterBlatttext,
  segmentiereDarstellungstext,
  teileDarstellungssegment,
} from './darstellungstext';

/** Geschützter Text für Renderereingänge und erhaltene Segmentmetadaten. */
export type { GeschuetztesDarstellungssegment } from './darstellungstext';
