// Startdaten für Verweismarkierungs- und Kommentarfenster, einschließlich Vorher-Werten.
// Der reine Transportvertrag hängt ausschließlich von Fachtypen ab; Speicheraktionen
// und Undo-Abläufe bleiben außerhalb, damit die Plattformgrenze ihn prüfen kann.

// ---------------------------------------------------------------------------
// Verweismarkierung-Fenster (eigenständiges Fenster statt Overlay)
// ---------------------------------------------------------------------------

import type {
  Gesetzesreferenz,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import type {
  Elementstand,
  VerweisInhalt,
} from '@/lib/markierungen/gemeinsam/markierungSpeicher.types';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

interface MarkierungsAnfrageKontext {
  openerLabel: string;
  gesetz: Gesetzesreferenz;
  ausgangsstelle: Ausgangsstelle;
  /** Aufgelöster Anzeigename, etwa Art. 229 § 2, für den Fenstertitel. */
  ausgangsBezeichnung?: string;
  auswahl?: {
    textstelle: Textstelle;
    bezugstext: string;
  };
  /** Startstand für Neuanlagen/Konkurrenzbehandlung. Beim Bearbeiten werden
   * Bezugsdaten ausschließlich aus der frisch geladenen Ausgangsstelle abgeleitet. */
  aktuellesElement?: NormDarstellung | UeberschriftDarstellung;
}

interface MarkierungBearbeitenBasis {
  textbezug?: { textstelle: Textstelle; bezugstext?: string };
}

/**
 * Startdaten für das eigenständige Verweismarkierung-Fenster (siehe
 * VerweismarkierungFenster.tsx, useMarkierungen.ts: handleVerweismarkierungAnfrage).
 * Analog zu TabUebertragung wird nur ein JSON-String über die Tauri-Commands
 * verweismarkierung_kontext_ablegen/-abholen an das neue Fenster übergeben – Rust
 * behandelt den Inhalt als undurchsichtigen String.
 *
 * Bewusst EIGENES Fenster statt Overlay (siehe Absprache): ein Overlay im
 * Hauptfenster würde den Nutzer daran hindern, währenddessen frei zu
 * navigieren, um die Zielnorm nachzuschlagen.
 */
export interface VerweismarkierungKontext extends MarkierungsAnfrageKontext {
  /**
   * Norm/Überschrift der Ausgangsstelle, wie im Hauptfenster zum Zeitpunkt
   * der Anfrage geladen (nur gesetzt, wenn `auswahl` gesetzt ist) – wird
   * beim Speichern unverändert an hinzufuegenMarkierung() durchgereicht
   * (siehe dortiger Docstring: nötig, um bezugstext beim Kombinieren/
   * Aufsplitten mit einer bestehenden Unterstreichung/Hervorhebung korrekt
   * aus dem aktuellen Text abzuleiten, statt ihn zu übernehmen/schneiden).
   * Das Hilfsfenster selbst hat keine geladene GesetzDarstellung.
   */
  /**
   * Nur gesetzt beim Bearbeiten eines bestehenden Verweises (Rechtsklick
   * auf den Zitat-Text im Gesetzes-View, siehe useMarkierungen.ts:
   * handleVerweismarkierungBearbeiten). Enthält die bisherigen Eingabewerte zum
   * Vorausfüllen sowie die zur Identifikation der zu überschreibenden Stelle
   * nötigen Textpfad-Daten (siehe markierungSpeicher.ts: aktualisiereZielnorm).
   */
  bearbeiten?: MarkierungBearbeitenBasis & {
    /** Ursprünglicher Textbezug – vorhanden = Checkbox interaktiv (Umwandlung
     *  in einen allgemeinen Verweis möglich), fehlend = Checkbox ausgeblendet
     *  (Umwandlung in die andere Richtung ist laut Absprache nicht möglich,
     *  da keine Textauswahl zum Zeitpunkt des Bearbeitens vorliegt). */
    /** Rohtext zum Vorausfüllen des EINEN Zitat-Textfelds (siehe
     *  VerweisInhalt.verweistext) – wird beim Bearbeiten unverändert erneut
     *  geparst (siehe VerweismarkierungFenster.tsx: "das speichern muss jedes Mal
     *  neu gemacht werden, wenn der zitatText verändert wird"). */
    zitatText: string;
    /**
     * Vollständiger Vorher-Zustand des bearbeiteten Eintrags (verweisinhalt,
     * elementstand) – wird aus dem bestehenden
     * MarkierungsEintrag übernommen; der ursprüngliche Textbezug steht einmalig in `textbezug` (siehe useMarkierungen.ts:
     * handleVerweismarkierungBearbeiten) und dient VerweismarkierungFenster.tsx nur dazu,
     * beim Speichern eine MarkierungVerweisBearbeitenAktion für die
     * Undo-Historie des AUFRUFENDEN Fensters zu bilden (siehe
     * markierungSpeicher.ts: MarkierungsAktion).
     */
    vorher: { verweisinhalt: VerweisInhalt; elementstand?: Elementstand };
  };
}

// ---------------------------------------------------------------------------
// Kommentar-Fenster (eigenständiges Fenster, analog zum Verweismarkierung-Fenster)
// ---------------------------------------------------------------------------

/**
 * Startdaten für das eigenständige Kommentar-Fenster (siehe
 * KommentarFenster.tsx, useMarkierungen.ts: handleKommentarAnfrage).
 * Strukturell schlanker als VerweismarkierungKontext: kein Zitat-Parsing, kein
 * Ziel-Gesetz/-Norm – nur ein Freitext-Kommentar mit optionalem Textbezug.
 */
export interface KommentarKontext extends MarkierungsAnfrageKontext {
  /** Fenster-Label des AUFRUFENDEN Fensters – dorthin wird nach dem
   *  Speichern das Sync-Event geschickt (siehe KommentarFenster.tsx). */
  /** bezeichnung (Norm) bzw. gliederungskennzahl (Überschrift) der
   *  kommentierten Stelle – gleiche Konvention wie MarkierungsEintrag.bezeichnung. */
  /** Aufgelöste, präfigierte Anzeige-Bezeichnung für den nativen
   *  Fenstertitel (siehe VerweismarkierungKontext.ausgangsBezeichnung). */
  /** Nur gesetzt, wenn beim Auslösen des Tastenkürzels eine Textauswahl innerhalb
   *  eines identifizierbaren Blatts vorlag. */
  /** Norm/Überschrift der Ausgangsstelle – siehe VerweismarkierungKontext.aktuellesElement. */
  /** Nur gesetzt beim Bearbeiten eines bestehenden Kommentars (Klick auf das
   *  Infosymbol, siehe useMarkierungen.ts: handleKommentarBearbeiten). */
  bearbeiten?: MarkierungBearbeitenBasis & {
    /** Ursprünglicher Textbezug – vorhanden = Checkbox interaktiv, fehlend =
     *  Checkbox ausgeblendet (analog zu VerweismarkierungKontext.bearbeiten.textbezug). */
    /** Bisheriger Kommentartext zum Vorausfüllen. */
    kommentarText: string;
    /** Bisheriger Inhalt und Elementstand; der Textbezug steht einmalig in `textbezug`. */
    vorher: { kommentarText: string; elementstand?: Elementstand };
  };
}
