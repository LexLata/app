// appTypes.ts
//
// Zentrale Typen für den App-weiten Tab-Zustand – werden von App.tsx,
// Tableiste.tsx und den App-Hooks (useAppTabs.ts, useFensterRestore.ts,
// useTastenkuerzel.ts) gemeinsam genutzt. Abzugrenzen von gesetzTypes.ts:
// dort liegt das reine Gesetz-Domänenmodell (GesetzDarstellung), hier nur
// der App-seitige Zustand darum herum (welcher Tab, welche Scroll-Position …).

import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

export interface Tab {
  id: string;
  /** Nur ohne Referenz leer (Willkommensansicht), unabhängig vom Ladeergebnis. */
  gesetzesreferenz?: Gesetzesreferenz;
  ladezustand?: 'ladend' | 'geladen' | 'fehlt' | 'nicht-lesbar';
  /** Übertragene XML-Stellen bis zum Laden im Zielfenster. */
  ausstehendeAnsicht?: Pick<TabUebertragung, 'scrollPosition' | 'einklappZustand' | 'verlauf'>;
  /** xmlId eines expliziten Sprungziels (Treffer aus dem Öffnen-Overlay) – siehe Gesetzestextansicht.tsx: initialNorm. */
  initialNorm?: string;
  /** Erhöht bei Neuladung nach Aktualisierung – zwingt Gesetzestextansicht zum Remount. */
  reloadVersion?: number;
}

/** Präzise In-Session-Scroll-Position eines Tabs (Index + Offset im virtualisierten Item). */
export interface ScrollPosition {
  index: number;
  offset: number;
}

/** Einklapp-Zustand (Gliederung/Normen) eines Tabs – siehe useAppTabs.ts: einklappZustandRef. */
export interface EinklappZustand {
  ueberschriften: Set<string>;
  normen: Set<string>;
  aktivesElementId: string | null;
}

// ---------------------------------------------------------------------------
// Overlay-Zustand
// ---------------------------------------------------------------------------

/**
 * Genau ein Overlay kann gleichzeitig sichtbar sein.
 * null → kein Overlay offen.
 */
export type AktivesOverlay =
  | 'tastenkuerzel'
  | 'uebersicht'
  | 'aktualisieren'
  | 'gesetzInfo'
  | 'oeffnen'
  | 'volltextSuche'
  | 'volltextAlle'
  | 'favoritenHinzufuegen'
  | 'verlauf'
  | 'export'
  | 'dateiImport'
  | 'importindizes'
  | 'datenschutz'
  | 'ueber';

// ---------------------------------------------------------------------------
// Öffnen-API
// ---------------------------------------------------------------------------

/**
 * Steuert, welcher Tab beim Öffnen eines Gesetzes verwendet wird.
 *
 * 'bevorzugt-vorhanden' (Default): springt zu vorhandenem Tab; sonst neuer Tab.
 *   → Gesetzesübersicht, Import, Lesezeichen, Alle-Volltextsuche
 *
 * 'aktiver-tab': aktiver Tab bevorzugt → vorhandener Tab → aktiven ersetzen;
 *   erstellt NIE einen neuen Tab.
 *   → Öffnen-Overlay, Einzel-Volltextsuche, Lesezeichen, Gesetzeskurzbefehle
 *
 * 'immer-neu': immer neuer Tab.
 *   → Öffnen-Overlay ⌘+Enter
 *
 * 'immer-aktiver-tab': ersetzt IMMER den aktiven Tab mit diesem Gesetz/dieser
 *   Norm – unabhängig davon, ob das Gesetz bereits in einem ANDEREN Tab
 *   offen ist (anders als 'aktiver-tab', das in diesem Fall zu jenem Tab
 *   wechseln würde). Erstellt NIE einen neuen Tab, wechselt NIE den Tab.
 *   → Verlaufsnavigation (⌥←/⌥→, Overlay), Tab-Wiederherstellung (⇧⌘T) – diese
 *   müssen garantiert im aufrufenden Tab bleiben, siehe tabVerlauf.ts.
 */
export type OeffnenModus =
  'bevorzugt-vorhanden' | 'aktiver-tab' | 'immer-neu' | 'immer-aktiver-tab';

/** Vollständiges flüchtiges Ziel einer sofortigen Öffnung, unabhängig von
 * Fenster-/Tab-Laufzeitidentitäten. Der Tab wird erst nach erfolgreichem Laden gewählt. */
export interface Navigationsziel {
  /** Installierter Treffer: fehlende Dateien lösen keinen Import aus. */
  nurInstalliert?: true;
  /** Die Einführung beginnt an einer für Favoriten geeigneten Norm. */
  favoritfaehigeStartnorm?: true;
  /** Öffentlicher Link: fehlende Ziele erhalten den öffentlichen Formathinweis. */
  tiefenlink?: true;
  /** Lesezeichen: bloße Nummern bevorzugen Paragraphen und Artikel. */
  lesezeichen?: true;
  gesetzesreferenz: Gesetzesreferenz;
  bezeichnung?: string;
  /** Identität eines beliebigen Darstellungselements: Norm oder Überschrift. */
  xmlId?: string;
  ohneVerlauf?: boolean;
  /** Ausgangsnorm bzw. Ausgangsüberschrift erst nach erfolgreicher Zielprüfung nachtragen. */
  ausgangsVerlaufEintrag?: VerlaufEintrag;
}

/**
 * Parameter für elementOeffnen (App.tsx) – einheitlicher Einstiegspunkt für
 * Öffnen-Aktionen mit bereits geladenem Gesetz; die Norm wird intern aufgelöst.
 */
export interface ElementOeffnenParams {
  /** Bereits geladenes Gesetz. */
  gesetz: GesetzDarstellung;
  /** Bezeichnung-String zur Norm (z.B. „433" oder „229 3") – wird intern zu xmlId aufgelöst. */
  bezeichnung?: string;
  /** xmlId direkt (z.B. aus Volltextsuche, wo sie bereits bekannt ist). */
  xmlId?: string;
  /** Tab-Modus. Default: 'bevorzugt-vorhanden'. */
  modus?: OeffnenModus;
  /** Unterdrückt den regulären Ziel-Eintrag bei Verlaufsnavigation und Wiederherstellung (Standard: Eintrag). */
  ohneVerlauf?: boolean;
}

// ---------------------------------------------------------------------------
// Verlauf
// ---------------------------------------------------------------------------

/** Ein einzelner Verlaufseintrag: identifiziert ein Element eindeutig und stabil
 *  (Gesetzesreferenz + XML-ID; keine Laufzeit- oder Dateiidentität). */
export interface VerlaufEintrag {
  gesetzesreferenz: Gesetzesreferenz;
  xmlId: string;
}

/** Verlauf eines einzelnen Tabs: Liste zuletzt besuchter Elemente (Index 0 =
 *  neueste, höchstens 100) plus Zeiger, aktives Element und Rückkehrmarke.
 *  Besitzer: useVerlaufSteuerung.ts; fensterlokal im Arbeitsspeicher. Nur Liste
 *  und Zeiger werden mit geschlossenen Tabs gespeichert oder übertragen. */
export interface TabVerlauf {
  aktivesElement?: VerlaufEintrag;
  rueckkehrmarke?: { eintrag: VerlaufEintrag; position: number };
  eintraege: VerlaufEintrag[];
  position: number;
}

// ---------------------------------------------------------------------------
// Fensterübergreifende Tab-Übertragung (Herausziehen aus der Tableiste)
// ---------------------------------------------------------------------------

/**
 * Kompletter Session-Zustand eines Tabs, der per Drag aus der Tableiste in
 * ein neues Fenster gezogen wurde (siehe Tableiste.tsx: onTabHerausziehen,
 * useAppTabs.ts: tabFuerUebertragungKopieren / tabAusUebertragungUebernehmen).
 * Wird als JSON-String über die Tauri-Commands tab_uebertragung_ablegen /
 * tab_uebertragung_abholen an das neue Fenster übergeben – Rust behandelt
 * den Inhalt als undurchsichtigen String (reine Weiterleitung).
 *
 * Gesetzesreferenz statt GesetzDarstellung: analog zu fensterSpeicher.ts wird nur
 * die Referenz übertragen, das neue Fenster löst sie gegen seine eigene, frisch
 * geladene gesetze-Liste auf (Single Source of Truth bleibt das kanonische
 * XML, nicht ein über Fenstergrenzen kopiertes Laufzeitobjekt). Fehlt
 * die Gesetzesreferenz, war der herausgezogene Tab ein Leertab.
 */
export interface TabUebertragung {
  /** Flüchtiger Transport; weder Tabidentität noch gespeicherter Fensterzustand. */
  transport?: { kennung: string; quellLabel: string; gueltigBis: number };
  gesetzesreferenz?: Gesetzesreferenz;
  initialNorm?: string;
  scrollPosition?: ScrollPosition;
  /**
   * EinklappZustand mit id→xmlId übersetzten Referenzen (JSON kennt kein Set,
   * UND die `id`-Felder der Elemente sind pro Parse-Lauf zufällig neu –
   * siehe Projektgrundsatz "id-Felder dürfen nie persistiert werden". Das
   * Zielfenster führt einen eigenen, unabhängigen Parse-Lauf durch
   * (Einzelzugriff), dessen `id`s nie mit denen des Quellfensters
   * übereinstimmen würden. XmlId ist der stabile, aus dem XML stammende
   * Bezug – genau wie bei aktivierungSpeicher.ts/tabVerlauf.ts.
   */
  einklappZustand?: {
    ueberschriftenXmlId: string[];
    normenXmlId: string[];
    aktivesElementXmlId: string | null;
  };
  verlauf?: TabVerlauf;
}

/** Kurzlebige Vorbelegung einer Suchöffnung; normaler Aufruf bleibt ein Text. */
export type SuchOverlayVorbelegung =
  | string
  | {
      suchtext: string;
      meldung: string;
      ohneAktivesGesetz: true;
    };
