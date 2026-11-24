// StrukturZustand.types.ts
// DOM-freier Vertrag für strukturelle Bedienoperationen.
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';

/** IDs sind die bisherigen IDs des geparsten Ansichtsmodells.
 * Keine zweite persistierte Identität; Momentaufnahmen dienen Tab-Restore. */
export interface StrukturMomentaufnahme {
  readonly eingeklappteUeberschriften: ReadonlySet<string>;
  readonly eingeklappteNormen: ReadonlySet<string>;
  readonly aktivesElementId: string | null;
}

interface StrukturSperren {
  ueberschriftenGesperrt: boolean;
  einklappenGesperrt: boolean;
  normAuswahlGesperrt: boolean;
}

export interface StrukturZustandOptionen {
  elemente: DarstellungsElement[];
  initial?: StrukturMomentaufnahme;
  initialNormAktiv: boolean;
  sperren?: StrukturSperren;
}

export type ZielVorbereitung =
  | { status: 'sichtbar'; elementId: string; index: number }
  | { status: 'aufklappen'; elementId: string }
  | { status: 'nicht-gefunden' };

export interface KlappschrittErgebnis {
  /** Strukturelles Ziel, das nach dem Rendern als Scrollanker dienen soll. */
  readonly zielId: string | null;
  readonly offsetInItem?: number;
}

export interface StrukturZustand {
  readonly momentaufnahme: StrukturMomentaufnahme;
  readonly sichtbareElemente: readonly DarstellungsElement[];
  readonly unterArtikelIds: ReadonlySet<string>;
  readonly ueberschriftArtigeNormIds: ReadonlySet<string>;
  readonly trennerVorIds: ReadonlySet<string>;
  readonly kannAufklappen: boolean;
  readonly kannZuklappen: boolean;
  schalteUeberschrift(id: string): void;
  schalteNorm(id: string): void;
  waehleNormText(id: string): void;
  /** Aktiviert das Ziel und öffnet bei Erlaubnis notwendige Vorfahren.
   * 'aufklappen' verlangt einen neuen Renderstand vor der Scrollausführung. */
  bereiteZielVor(xmlId: string, vorfahrenAufklappen: boolean): ZielVorbereitung;
  /** Übernimmt bestehende Pfeilregeln; liefert das strukturelle Scrollziel.
   * Die Tastaturregistrierung und DOM-Ausführung liegen außerhalb. */
  fuehrePfeilaktionAus(
    richtung: 'hoch' | 'runter' | 'links' | 'rechts',
    optionen?: { shift?: boolean; alt?: boolean; meta?: boolean },
  ): KlappschrittErgebnis;
  /** Ändert die Klappstufe nach bestehenden Regeln. Der Aufrufer erfasst
   * vorher den geometrischen Anker und hält anschließend das Ziel stabil. */
  klappeStufe(richtung: 'auf' | 'zu', ankerId: string | null): KlappschrittErgebnis;
}
