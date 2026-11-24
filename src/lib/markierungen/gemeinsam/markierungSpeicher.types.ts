// markierungSpeicher.types.ts
//
// Reine Domänentypen für Markierungen (Unterstreichung, Hervorhebung,
// Verweismarkierung, Kommentar) – ausgelagert aus markierungSpeicher.ts (500-
// Zeilen-Richtwert), analog zu zitatParser.types.ts. Enthält bewusst KEINE
// Logik, nur die Typdefinitionen; werden von markierungSpeicher.ts für
// bestehende Importe (`from '@/lib/markierungen/eintrag/eintrag.index'`)
// re-exportiert, damit sich für Aufrufer nichts ändert.

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

/** Vier fachliche Arten einer Markierung. */
export type MarkierungsTyp = 'unterstreichung' | 'hervorhebung' | 'verweismarkierung' | 'kommentar';

/**
 * elementstand eines Verweises (siehe Verweisziel unten): erfasst Titel
 * (falls vorhanden) und Zeichenlänge der Zielnorm zum Zeitpunkt des
 * Verweisens – dient künftig zur Erkennung, ob sich die Zielnorm seither
 * inhaltlich verändert hat. textlaenge kommt aus normTextLaenge()
 * (gesetzDarstellungAuswertung.ts).
 */
export interface Elementstand {
  titel?: string;
  textlaenge: number;
}

/** Ein klickbares Ziel im Verweistext; übrige Textbereiche bleiben einfacher Text. */
export type Verweisziel =
  | {
      typ: 'zielnorm';
      gesetz?: Gesetzesreferenz;
      bezeichnung: string;
      verweistextZeichenbereich: [number, number];
      elementstand: Elementstand;
    }
  | {
      typ: 'zielnormOhneElementstand';
      elementstand?: never;
      gesetz?: Gesetzesreferenz;
      bezeichnung: string;
      verweistextZeichenbereich: [number, number];
    }
  | {
      typ: 'ganzesGesetz';
      bezeichnung?: never;
      elementstand?: never;
      gesetz: Gesetzesreferenz;
      verweistextZeichenbereich: [number, number];
    };

/** Vollständiger Verweistext mit null oder mehr klickbaren Verweiszielen. */
export interface VerweisInhalt {
  verweistext: string;
  verweisziele: Verweisziel[];
}

/** Ein vollständiger Textbezug; ein Elementstand gehört ausschließlich zum pauschalen Fall. */
export type Bezugstext = {
  typ: 'bezugstext';
  textstelle: Textstelle;
  bezugstext: string;
  elementstand?: never;
};

/** Eine Markierung an der gesamten Ausgangsstelle. */
export type Pauschal = {
  typ: 'pauschal';
  elementstand: Elementstand;
  textstelle?: never;
  bezugstext?: never;
};

type MarkierungsBasis = {
  erstellt?: string;
  ausgangsstelle: Ausgangsstelle;
};

/** Die vier Markierungstypen mit ihren jeweils vollständigen Angaben. */
export type MarkierungsEintrag = MarkierungsBasis &
  (
    | {
        typ: 'unterstreichung';
        geaendert?: never;
        bezug: Bezugstext;
        kommentarText?: never;
        verweisinhalt?: never;
      }
    | {
        typ: 'hervorhebung';
        geaendert?: never;
        bezug: Bezugstext;
        kommentarText?: never;
        verweisinhalt?: never;
      }
    | {
        typ: 'kommentar';
        geaendert?: string;
        bezug: Bezugstext | Pauschal;
        kommentarText: string;
        verweisinhalt?: never;
      }
    | {
        typ: 'verweismarkierung';
        geaendert?: string;
        bezug: Bezugstext | Pauschal;
        verweisinhalt: VerweisInhalt;
        kommentarText?: never;
      }
  );
