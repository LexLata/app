// ScrollSteuerung.types.ts
// Auftrags- und Messverträge der inneren Scrollsteuerung.
import type { ElementSichtbarkeit } from './aktivesElementNachfuehren';
import type { MesslaufRekorder } from './messlaufErfassung';
import type { RefObject } from 'react';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import type { TextMessung } from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import type { VirtuelleTextListe } from '@/components/gesetzestextansicht/Gesetzestextansicht.renderTypes';

export interface ScrollPosition {
  readonly index: number;
  /** Rohposition minus Elementanfang einschließlich Scrollmargin; kann negativ sein. */
  readonly offsetInItem: number;
}

/** Messstand für die innere Kontextleistenberechnung; keine Tauri-/
 * Virtualizer-Instanz. Der Aufrufer verwaltet seinen daraus abgeleiteten Pfad. */
export interface ScrollStand {
  /** Nur Nutzerbewegungen; eigene Positionskorrekturen tragen false. */
  readonly benutzerscrollen?: boolean;
  readonly scrollTop: number;
  readonly viewportHoehe: number;
  /** Tatsächlich sichtbare Titel/Körper, ohne Polster, in Dokumentreihenfolge. */
  readonly sichtbarkeitsliste: readonly ElementSichtbarkeit[];
  readonly zeilen: readonly { index: number; start: number; size: number }[];
}

/** Anker vor einer strukturellen Änderung. Die Bildschirmposition wird vom
 * Scrollmodul erfasst und bei 'anker-halten' als Ziel verwendet. */
export interface ScrollAnker {
  readonly elementId: string;
  readonly offsetInItem: number;
  readonly bildschirmTop: number;
  readonly istFallback: boolean;
}

export type KlappAnker = ScrollAnker &
  (
    | { haltung: 'stelle' }
    | { haltung: 'sichtbar-machen'; ausrichtung?: 'oben'; animieren?: boolean }
  );

export type ScrollAuftrag =
  | {
      art: 'sichtbar-machen';
      elementId: string;
      /** Ohne Vorgabe genügt Sichtbarkeit; Überschriftenblöcke beginnen ausdrücklich oben. */
      ausrichtung?: 'oben';
      /** Der erste Aufbau zeigt nach Zielmessung unmittelbar die fertige Position. */
      animieren?: boolean;
    }
  | { art: 'wiederherstellen'; elementId: string; offsetInItem: number }
  | { art: 'anker-halten'; elementId: string; anker: ScrollAnker };

interface ScrollGeometrie {
  inhaltEinzug: number;
  satzNeuZeile: boolean;
  textAlign: 'left' | 'justify';
  hyphens: 'auto' | 'none';
  lang: string | undefined;
  schriftgroesse: number;
  zeilenabstand: number;
  randInline: number;
  maxTextBreite: number | 'none';
}

export interface ScrollSteuerungOptionen {
  containerRef: RefObject<HTMLDivElement | null>;
  sichtbareElemente: readonly DarstellungsElement[];
  eingeklappteUeberschriften: ReadonlySet<string>;
  eingeklappteNormen: ReadonlySet<string>;
  unterArtikelIds: ReadonlySet<string>;
  messung: TextMessung;
  geometrie: ScrollGeometrie;
  /** Höhe der tatsächlich gerenderten Leiste, anfangs noch unbekannt. */
  leisteHoehe: number | null;
  /** Tatsächlich abgedeckte Höhe einschließlich bestehendem Leistenpolster. */
  effektiveLeisteHoehe: number;
  initialLayoutBereit?: boolean;
  initialPosition?: ScrollPosition;
  initialZielId?: string;
  /** Kontextvorbereitung nur für rohe Wiederherstellung; Normnavigation übernimmt bei Landung. */
  onZielVorbereiten(elementId: string): void;
  /** Messdarstellung bleibt unsichtbar, bis die Landung übernommen wird. */
  schaetzeZielLeiste?(this: void, elementId: string): number;
  onZielMessen?(this: void, elementId: string, bestaetigen: (hoehe: number) => void): () => void;
  onZielUebernehmen?(this: void, elementId: string, hoehe: number): void;
  /** Entfernt nach Übernahme des erreichten Positionskontexts altes Navigationspolster. */
  onPositionsKontextUebernehmen?(): void;
  /** Entwertet auch eine vor einem inzwischen abgeschlossenen Vorgang vorgemerkte Nachführung. */
  onNachfuehrungEntwerten?(): void;
  /** Nutzerbewegung, unabhängig vom Aktivwechsel; eigene Korrekturen bleiben ausgenommen. */
  onBenutzerscrollen?(): void;
  /** Innerer Anschluss für Kontextpfad/Polster, vor der stabilen Positionsmeldung. */
  onScrollStandGeaendert(stand: ScrollStand): void;
  /** Meldet aktuelle Position nach gültiger Korrektur bzw. Benutzerscrollen.
   * Überholte Zwischenstände dürfen nicht die Tab-Restoreposition ersetzen. */
  onPositionGeaendert(position: ScrollPosition): void;
}

export interface ScrollSteuerung {
  readonly bereit: boolean;
  /** Misst den aktuellen Ausschnitt ohne Positionsänderung oder Nutzerscrollmeldung. */
  messeStand(): ScrollStand | null;
  /** Entwertet vorgemerkte Nachführung einschließlich noch ausstehendem Scrollframe. */
  entwerteNachfuehrung(): void;
  /** Schließt bei Aktivierung einer zuvor verdeckten, bereiten Ansicht das Anzeigetor,
   * wenn das Ziel weit entfernt ist; liefert, ob es geschlossen wurde. Vor dem ersten Bild aufrufen. */
  verdeckeBeiWeitemSprung(elementId: string): boolean;
  /** Reserviert einen neuen Auftrag vor dem strukturellen Renderabwarten. */
  bereiteAuftragVor(): void;
  /** Storniert Fortsetzungen ohne die Reservierung eines Nachfolgeauftrags zu lösen. */
  storniereFortsetzungen(): void;
  /** Beendet eine strukturelle Aktion ohne Scrollziel. */
  beendeAuftragOhneZiel(): void;
  readonly textListe: VirtuelleTextListe;
  /** Erfasst die oberste sichtbare Lesestelle für die Positionssicherung des Messlaufs. */
  erfasseAnker(): ScrollAnker | null;
  /** Erfasst ohne Positionsänderung den aktiven Klappanker, bevorzugt aus passendem laufenden Auftrag.
   * Ist das aktive Element nicht messbar, Rückfall auf die oberste sichtbare Lesestelle;
   * null, wenn auch diese fehlt.
   * Vor bereiteAuftragVor aufrufen, das laufende Aufträge storniert. */
  erfasseKlappAnker(aktivesId: string | null, richtung: 'auf' | 'zu'): KlappAnker | null;
  /** Bildet ohne Nebenwirkungen den Klappauftrag für das strukturelle Ziel.
   * Ohne Ziel-ID bleibt der Auftrag beim Ankerelement. */
  erstelleKlappAuftrag(
    anker: KlappAnker,
    ziel: { zielId?: string | null; offsetInItem?: number },
    richtung: 'auf' | 'zu',
  ): ScrollAuftrag;
  /** true: Auftrag für ein vorhandenes Ziel angenommen; false: Ziel fehlt.
   * Ein neuer Auftrag ersetzt alle Fortsetzungen des vorherigen Auftrags.
   * Der aktuelle erfolgreiche Auftrag meldet Abschluss genau einmal. */
  starteAuftrag(auftrag: ScrollAuftrag, nachAbschluss?: () => void): boolean;
  /** Rohdaten für den Messlauf; nur im Entwicklungsbetrieb, im Produktionsbau undefined. */
  readonly messlauf?: MesslaufRekorder;
}
