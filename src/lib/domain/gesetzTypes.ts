// gesetzTypes.ts
// Domänenmodell eines Gesetzes (GesetzDarstellung) – das Ergebnis der
// Darstellungs-Pipeline (siehe gesetzesXMLParser.ts), genutzt von allen
// Components zur Anzeige. Abzugrenzen von appTypes.ts: dort liegt der
// App-/Tab-Zustand (Tab, ScrollPosition, EinklappZustand), hier das reine
// Gesetz-Domänenmodell selbst.
// Übersetzung von GesetzDarstellung.swift
// Persistenz erfolgt ausschließlich als XML-Datei – kein JSON.

import type { GesetzInfos } from './gesetzInfos';
import type { Textstelle, ListenEintragEbene } from './textpfadTypes';
export type { TextpfadEintrag, ListenEintragEbene } from './textpfadTypes';
import type { NormPraefixFamilie } from './basis/normPraefixe';

export interface GesetzDarstellung {
  kurztitel: string;
  langtitel: string;
  fundstelle?: string;
  ausfertigung?: string;
  aenderungsvermerk?: string;
  neugefasst?: string;
  fassung?: GesetzInfos['fassung'];
  datenquelle?: GesetzInfos['datenquelle'];
  normgeber: Normgeber;
  /** ISO-639-1-Code, z. B. "de"/"en"/"es". Optional, fehlt bei allen
   *  bisherigen Importquellen (Bundesrecht/Landesrecht BW sind deutsch) –
   *  nur bei manuell nachgepflegten fremdsprachigen Texten gesetzt. Steuert
   *  das lang-Attribut sowie (bei unterstützter Sprache) die automatische
   *  Silbentrennung des Gesetzestexts, siehe useTextDarstellung.ts
   *  (SILBENTRENNUNG_UNTERSTUETZTE_SPRACHEN) und Gesetzestextansicht.tsx. Fehlt
   *  das Feld, wird 'de' angenommen. */
  sprache?: string;
  /** Manuell gepflegtes Profil aus infos/normpraefix; nur canon aktiviert Canon-Grammatik. */
  normpraefix?: NormPraefixFamilie;
  verarbeitungszeit?: Date;
  letzteNeuerung?: Date;
  hatGliederungsartikel: boolean;
  elemente: DarstellungsElement[];
}

/** Kopfangaben für Aktualisierung, optional mit bereits geladenen Darstellungselementen. */
export type GesetzAktualisierungsBestand = Omit<GesetzDarstellung, 'elemente'> &
  Partial<Pick<GesetzDarstellung, 'elemente'>>;

// Diskriminierte Union statt Swift-Enum
// Hinweis: Gliederungsartikel (z.B. Art. 1 EGBGB) sind ebenfalls typ: 'norm' –
// strukturell identisch zu §-Normen, einziger Unterschied ist die Herkunft aus
// <norm gliederungskennzahl="..."> statt einem <norm> ohne dieses Attribut im
// GesetzesXML (siehe gesetzesXMLParser.ts).
export type DarstellungsElement =
  { typ: 'ueberschrift'; data: UeberschriftDarstellung } | { typ: 'norm'; data: NormDarstellung };

export interface UeberschriftDarstellung {
  id: string;
  xmlId: string;
  bezeichnung: string; // z.B. "Erster Teil"
  titel?: string;
  ebene: number;
  text?: {
    absaetze: AbsatzDarstellung[];
    zusatztexte: NormZusatztext[];
    getaggteVerweise?: GetaggterVerweis[];
  };
  gliederungskennzahl: string; // z.B. "020030"
}

interface NormBasis {
  vorgaenger?: string;
  id: string;
  xmlId: string;
  bezeichnung: string; // "§ 1", "Art. 1" …
  titel?: string;
  status?: 'weggefallen';
  absaetze: AbsatzDarstellung[];
  /** Nur gelesen; Position unabhängig von Textstellen und Absatzzählung. */
  zusatztexte?: NormZusatztext[];
  fussnoten?: string;
  /**
   * Gesetzt, wenn `titel` nicht aus dem GesetzesXML stammt,
   * sondern nachträglich aus einer nichtamtlicheTitel-XML ergänzt wurde
   * (siehe nichtamtlicheTitelSpeicher.ts, angewendet in gesetzSpeicher.ts::
   * ladeGesetz). Wird bei jedem Laden neu abgeleitet, nie persistiert – die
   * Anzeige (Gesetzestextansicht.bausteine.tsx) setzt den Titel dann in eckige
   * Klammern, um ihn optisch vom amtlichen Titel zu unterscheiden.
   */
  titelIstNichtamtlich?: true;
  /**
   * Im Quell-XML mit <verweis>-Tags getaggte Verweise innerhalb dieser
   * Norm (siehe verweisTagger.ts / gesetzesXMLParser.ts). Wird bei jedem
   * Parse-Lauf neu aus dem GesetzesXML abgeleitet (keine Persistenz,
   * kein Cache) – analog zu absaetze. Dargestellt wie manuelle
   * Verweismarkierungen (siehe Gesetzestextansicht.bausteine.tsx: Merge mit
   * markierungenNachXmlId).
   */
  getaggteVerweise?: GetaggterVerweis[];
}

/** Normarten; nur Gliederungsartikel tragen eine Gliederungsebene. */
export type NormDarstellung =
  | (NormBasis & { art: 'normal' })
  | (NormBasis & {
      art: 'gliederungsartikel';
      gliederungsEbene: number;
      ueberschriftartig: boolean;
    })
  | (NormBasis & { art: 'erwaegungsgrund' });

/** Strukturebene innerhalb einer Norm (Absatz/Unterabsatz/Satz/Nummer/
 *  Litera) – ursprünglich in zitatParser.tokenizer.ts definiert, hierher
 *  verschoben: sowohl das Zitat-Parsing (markierungen) als auch
 *  normStrukturPruefung.ts (domain, siehe dort) brauchen dieselbe
 *  Vokabel für "welche Ebene einer Norm ist gemeint" – rein strukturelle
 *  Domain-Vokabular wie ListenEintragEbene, keine markierungen-
 *  spezifische Logik. zitatParser.tokenizer.ts importiert diesen Typ jetzt
 *  von hier (Re-Export über markierungen.index.ts bleibt für externe
 *  Konsumenten unverändert bestehen). */
export type ZusatzArt = 'absatz' | 'unterabsatz' | 'satz' | 'nummer' | 'litera';

/** Ein aus dem Gesetz-XML abgeleiteter Verweis mit Position und unverändertem Zieltext. */
export interface GetaggterVerweis {
  textstelle: Textstelle;
  bezugstext: string;
  /** Zusammengesetzte Zielangabe aus dem norm-Attribut, z. B. „§ 312d“
   *  oder „Art. 246b § 1“. Die Navigation löst diesen Text unverändert auf. */
  zielBezeichnung: string;
  /** Fehlt das Zielgesetz, gilt das eigene Gesetz. Die lange Form eines
   *  Eigenverweises mit vollständiger Gesetzesreferenz wird weiter gelesen. */
  zielgesetz?: Gesetzesreferenz;
}

export interface NormZusatztext {
  text: string;
  /** 0 = vor dem ersten Absatz, sonst nach dem n-ten Absatz. */
  nachAbsatz: number;
}

export interface AbsatzDarstellung {
  zwischenueberschrift?: boolean;
  id: string;
  bezeichnung?: string; // "(1)", oder undefined wenn unnummeriert
  saetze: SatzDarstellung[]; // leer, wenn unterabsaetze gesetzt ist
  /**
   * Nur gesetzt, wenn der Absatz in Unterabsätze gegliedert ist (siehe
   * xmlSerialisierung.ts/formexParser.ts – bisher nur bei EU-Recht,
   * z.B. Art. 1 und Art. 6 EUV). In dem Fall ist `saetze` leer: die Sätze
   * liegen stattdessen in den jeweiligen UnterabsatzDarstellung.saetze, da
   * die Satz-Zählung pro Unterabsatz neu bei 1 beginnt (zitierfähig als
   * "Art. 6 Abs. 1 UAbs. 2 Satz 1").
   */
  unterabsaetze?: UnterabsatzDarstellung[];
}

/**
 * Ein einzelner Unterabsatz (siehe AbsatzDarstellung.unterabsaetze). `saetze`
 * kann auch bei einem einsätzigen Unterabsatz mehrere Einträge enthalten,
 * wenn juris.de/EUR-Lex mehrere <satz>-Elemente serialisiert hat – ebenso
 * wie bei AbsatzDarstellung.saetze gilt: min. 1 Eintrag.
 */
export interface UnterabsatzDarstellung {
  id: string;
  bezeichnung: string; // Bezeichnung samt Klammern, z. B. „[2]“
  saetze: SatzDarstellung[];
}

export interface SatzDarstellung {
  id: string;
  zahl?: number; // undefined = kein explizites <satz>-Tag
  text: string;
  eintraege: ListenEintragDarstellung[];
  fortsetzung?: string;
}

export interface ListenEintragDarstellung {
  id: string;
  bezeichnung: string; // "1.", "a)", "i." …
  /** Herkunfts-Tag dieses Eintrags im GesetzesXML (<nummer> oder
   *  <litera>) – vom Parser aus dem echten Tag-Namen gesetzt (siehe
   *  gesetzesXMLParser.ts::parseListenEintrag), NICHT aus der
   *  Verschachtelungstiefe abgeleitet. Einzige Quelle dafür, ob ein Eintrag
   *  (und seine untereintraege) als Nummer oder Litera dargestellt bzw. in
   *  einem Textpfad adressiert wird (siehe TextpfadEintrag oben). */
  ebene: ListenEintragEbene;
  text: string;
  saetze?: SatzDarstellung[]; // ausdrücklich vorhandene Satzkinder, auch ein einzelnes
  untereintraege: ListenEintragDarstellung[];
  fortsetzung?: string;
}

// Hilfsfunktionen, die auf diesen Typen arbeiten (normWeggefallen,
// normAmtlicherTitel, normVollTitel, ueberschriftVollTitel, normTextLaenge,
// gesetzNormen), liegen bewusst NICHT hier, sondern in
// gesetzDarstellungAuswertung.ts – diese Datei bleibt reine Typendefinition,
// analog zu appTypes.ts (siehe Absprache im Chatverlauf).

/** Offener Name; gültige Werte prüft istGueltigerNormgeber. */
export type Normgeber = string;

export interface Gesetzesreferenz {
  normgeber: Normgeber;
  kurztitel: string;
}
