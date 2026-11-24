// Gesetzestextansicht.types.ts
// Props-Interface von Gesetzestextansicht – ausgelagert, weil reine Typdefinition
// ohne Logik (siehe Gesetzestextansicht.tsx-Kopfkommentar: dort bleibt nur noch
// Verdrahtung + JSX).
import type { SpeicherbareNorm } from '@/lib/domain/aktives-element/aktives-element.index';

import type { VerweisKlickziel } from '@/lib/darstellung/darstellung.index';
import type {
  GesetzDarstellung,
  AbsatzDarstellung,
  NormZusatztext,
} from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import type { Schriftart } from '@/lib/stil/gesetzTextDarstellung';

import type { FavoritenEintrag } from '@/components/seitenleisten/seitenleisten.index';

export interface GesetzestextansichtProps {
  gesetz: GesetzDarstellung;
  /**
   * xmlId eines expliziten Sprungziels aus dem Öffnen-Overlay (oder einem
   * anderen gesetzesübergreifenden Aufrufer in App.tsx). Einmalig konsumiert,
   * dann über onInitialNormScrolled gelöscht.
   *
   * Cross-Component-Brücke: dieser Prop ist die einzige Stelle, an der
   * App.tsx eine Norm-Navigation in Gesetzestextansicht auslösen kann. Alle
   * internen Sprünge (Favoriten, Kontextleiste) laufen über normScrollen.
   */
  initialNorm?: string;
  /** Gespeicherter Index des ersten sichtbaren Elements (In-Session-Wiederherstellung) */
  initialScrollIndex?: number;
  /** Vorzeichenbehafteter Abstand der Rohposition zum Elementanfang inklusive Scrollmargin */
  initialScrollOffsetInItem?: number;
  /** Sichtbarer Index unter der Leiste und derselbe vorzeichenbehaftete Restoreabstand. */
  onScrollIndexChange?: (index: number, offsetInItem: number) => void;
  /** Meldet das ausgeführte Sprungziel, damit der Aufrufer genau dieses löscht. */
  onInitialNormScrolled?: (initialNorm: string) => void;
  /** Gespeicherter Einklapp-Zustand (In-Session-Wiederherstellung, z.B. bei Tab-Wechsel) */
  initialEingeklappteUeberschriften?: Set<string>;
  initialEingeklappteNormen?: Set<string>;
  initialAktivesElementId?: string | null;
  /** Textbedienung entwertet ausstehende Navigation auch ohne Aktivwechsel. */
  onBedienung?: () => void;
  onAktivierung?: (meldung: {
    xmlId: string;
    art: 'sprung' | 'schritt' | 'nachfuehrung' | 'vorgegeben';
  }) => void;
  onEinklappZustandChange?: (
    eingeklappteUeberschriften: Set<string>,
    eingeklappteNormen: Set<string>,
    aktivesElementId: string | null,
  ) => void;
  schriftgroesse?: number;
  /** Lokal angewendete Leseschrift; CSS und Canvas verwenden denselben Font. */
  schriftart?: Schriftart;
  /** Lokal angewendeter Zeilenabstand. */
  zeilenabstand?: number;
  /** Blocksatz der Ansicht; ohne Angabe gilt der zentrale Default. */
  blocksatz?: boolean;
  /** Globale Einstellung (Checkbox, Einstellungen.tsx). Die tatsächliche
   *  Anwendung (welche Sprache, ob überhaupt unterstützt) erfolgt HIER pro
   *  Tab über ermittleSpracheUndTrennung() (useTextDarstellung.ts), unter
   *  Einbeziehung von gesetz.sprache. */
  silbentrennungAktiviert?: boolean;
  /** Skalierungsfaktor der StrukturKontextLeiste relativ zur
   *  Haupttext-Schriftgröße (Einstellungen > "Größe der Kontextleiste",
   *  useTextDarstellung.ts: STRUKTURKONTEXTLEISTE_GROESSE_WERTE). Default 0.85
   *  entspricht dem bisherigen festen Wert. */
  strukturKontextLeisteGroesse?: number;
  /** Einstellung "Lesbare Zeilenlänge" (Einstellungen.tsx). Bei true (Default)
   *  wird die Textspalte auf maxTextSpalteBreite gedeckelt; bei false nutzt
   *  sie die volle verfügbare Breite (unmittelbar durch CSS angepasst,
   *  siehe baum/Gesetzestextansicht.bausteine.tsx). Die Höhenschätzbreite folgt
   *  nach 150 ms Resize-Ruhe unter gehaltenem Scrollanker. */
  lesbareZeilenlaenge?: boolean;
  /** Deckelwert in px bei Standardschriftgröße 15; skaliert proportional zur Schriftgröße, wenn lesbareZeilenlaenge=true (Einstellungen >
   *  Zeilenlänge: schmal/normal/breit, useTextDarstellung.ts:
   *  LESBARE_ZEILENLAENGE_BREITE_WERTE). Default 600 (TEXT_SPALTE_BREITE). */
  maxTextSpalteBreite?: number;
  satzNeuZeile?: boolean;
  /** Horizontaler Rand links/rechts der Textspalte in px, siehe
   *  VirtualisierteListe.randInline. Default = STANDARD_RAND_INLINE (virtualizer.ts). */
  randInline?: number;
  onTabBezeichnung?: (bezeichnung: string | undefined) => void;
  favoritenVersion?: number;
  /** Aktiviert die Seitenleisten-Tastenkürzel; Standard aus. */
  seitenleistenTastenkuerzel?: boolean;
  /** Dieselben Einträge, die die Hauptansicht bereits in ihre Leisten übernommen hat. */
  seitenleistenFavoriten?: FavoritenEintrag[];
  /** Anfangsladen der gesetzesübergreifenden Leiste abgeschlossen, auch wenn leer. */
  lesezeichenGeladen?: boolean;
  /** Einstellung "Markierungen deaktivieren" (siehe useMarkierungenDeaktiviert.ts)
   *  – bei true werden weder bestehende Markierungen geladen/angezeigt noch
   *  können neue hinzugefügt werden (Hinzufügen wird bereits vorher in
   *  useMarkierungen.ts blockiert). Default false, damit bestehende
   *  Verwendungsstellen ohne diesen Prop unverändert funktionieren. */
  markierungenDeaktiviert?: boolean;

  /** Klick auf einen (getaggten oder manuell markierten) Verweis – siehe
   *  MarkierungCtx.onVerweisKlick / App.tsx: handleVerweisKlick. */
  onVerweisKlick?: (ausgangsXmlId: string, zielnorm: VerweisKlickziel, neuerTab: boolean) => void;
  /** "Verweis bearbeiten" im Rechtsklick-Kontextmenü eines
   *  'verweismarkierung'-Eintrags (siehe MarkierungCtx.onMarkierungRechtsklick /
   *  useMarkierungen.ts: handleVerweismarkierungBearbeiten). Das
   *  Zusammenstellen/Öffnen des Menüs selbst lebt lokal in dieser Komponente
   *  (markierungValue unten) – dieser Prop wird erst beim tatsächlichen
   *  Klick auf "Bearbeiten" aufgerufen. */
  onVerweisBearbeiten?: (ausgangsXmlId: string, eintrag: MarkierungsEintrag) => void;
  /** Klick auf das Infosymbol (ⓘ) eines Kommentars – öffnet SOFORT das
   *  Kommentar-Hilfsfenster im Bearbeiten-Modus (siehe MarkierungCtx.onKommentarKlick
   *  / useMarkierungen.ts: handleKommentarBearbeiten). Anders als bei
   *  Verweismarkierungen zusätzlich (nicht statt) zum Rechtsklick-Kontextmenü. */
  onKommentarKlick?: (ausgangsXmlId: string, eintrag: MarkierungsEintrag) => void;
  /** "Markierung löschen" im Rechtsklick-Kontextmenü – für ALLE
   *  Markierungstypen (siehe MarkierungCtx.onMarkierungRechtsklick /
   *  useMarkierungen.ts: handleMarkierungLoeschen). */
  onMarkierungLoeschen?: (ausgangsXmlId: string, eintrag: MarkierungsEintrag) => void;
  /** Symbol "U" in der Auswahlleiste (siehe
   *  auswahlleiste.tsx / useAuswahlleiste.ts)
   *  – identischer Handler wie bei ⌘U (useMarkierungen.ts: handleUnterstreichen). */
  onUnterstreichen?: () => void;
  /** Symbol "H" in der Auswahlleiste – identisch zu ⇧⌘U
   *  (useMarkierungen.ts: handleHervorheben). */
  onHervorheben?: () => void;
  /** Symbol "§" in der Auswahlleiste – identisch zu ⌘K
   *  (useVerweismarkierungUndKommentarHilfsfenster.ts: handleVerweismarkierungAnfrage). */
  onVerweismarkierungAnfrage?: () => void;
  /** Sprechblasen-Symbol in der Auswahlleiste – identisch zu ⇧⌘K
   *  (useVerweismarkierungUndKommentarHilfsfenster.ts: handleKommentarAnfrage). */
  onKommentarAnfrage?: () => void;
  /** Reduziert Einzüge und Bedienelemente der Gesetzestextansicht. */
  minimalistischerModus?: boolean;
  /** Meldet die speicherbare aktive Norm; beim Verdecken oder Abbau folgt null. */
  onSpeicherbareNormAendern?: (norm: SpeicherbareNorm | null) => void;
  /** Meldet der Hauptansicht Favoriten, Aktivzustand und stabile Sprungfunktion.
   * Beim Abbau folgt ein leerer Stand mit wirkungsloser Sprungfunktion. */
  onFavoritenStatusAendern?: (status: {
    istAktuellFavorit: boolean;
    favoritenleisteSichtbar: boolean;
    favoritenEintraege: FavoritenEintrag[];
    favoritAufrufen: (xmlId: string) => void;
  }) => void;
  /** Meldet App.tsx bei jeder Änderung die ⌘→/⌘←-Auslöser + ob bereits
   *  alles auf-/zugeklappt ist (siehe useKlappstufenNavigation.ts) – für die
   *  Auf-/Zuklapp-Buttons in Lesezeichenleiste.tsx. */
  onKlappstufenStatusAendern?: (status: {
    zuklappen: () => void;
    aufklappen: () => void;
    kannZuklappen: boolean;
    kannAufklappen: boolean;
  }) => void;
  /** Sperr-Zustand während der Einführung (useEinfuehrung.ts) – blockiert
   *  gezielt Überschriften-Auswahl/-Einklappen bzw. Normwechsel, damit der
   *  Nutzer nicht versehentlich von dem im aktuellen Schritt erklärten
   *  Element abweicht. undefined außerhalb der Einführung (keine Sperre). */
  einfuehrungSperren?: {
    ueberschriftenGesperrt: boolean;
    einklappenGesperrt: boolean;
    normAuswahlGesperrt: boolean;
  };
}

/** Eigenständiger Norminhalt mit lokal angewendeten Textwerten. */
export interface AbsatzListeProps {
  zusatztexte?: NormZusatztext[];
  absaetze: AbsatzDarstellung[];
  schrift: number;
  satzNeuZeile: boolean;
  markierungen?: MarkierungsEintrag[];
  ausgangsXmlId?: string;
  schriftart?: Schriftart;
  zeilenabstand?: number;
  blocksatz?: boolean;
  silbentrennungAktiviert?: boolean;
  sprache?: string;
}
