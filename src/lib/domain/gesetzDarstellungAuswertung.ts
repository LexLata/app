// gesetzDarstellungAuswertung.ts
//
// Reine Hilfsfunktionen auf dem in gesetzTypes.ts definierten Domänenmodell
// (entsprechen berechneten Properties in Swift) – ausgelagert aus
// gesetzTypes.ts, damit diese Datei eine reine Typendefinition bleibt,
// analog zu appTypes.ts (siehe Absprache im Chatverlauf). Arbeitet
// ausschließlich auf dem bereits geladenen GesetzDarstellung-Modell
// (Darstellungs-Pipeline), NICHT auf rohem XML – konsistent mit der
// Zwei-Stufen-Architektur des Projekts (siehe normStrukturPruefung.ts).

import type {
  DarstellungsElement,
  GesetzDarstellung,
  ListenEintragDarstellung,
  NormDarstellung,
  SatzDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';

/**
 * Liefert die persistierbare Suchbezeichnung eines Darstellungselements:
 * bei Normen die Bezeichnung, bei Überschriften den Titel.
 */
export function elementSuchBezeichnung(el: DarstellungsElement): string | undefined {
  return el.typ === 'norm' ? el.data.bezeichnung : el.data.titel;
}

const BLOSSER_STRICH = /^[-–—]$/;

/**
 * Die Kurzzeile für weggefallene Normen darf vorhandenen Text nicht verdecken.
 * Ein bloßer Strich (z. B. BGB §§ 2260 ff.: `<text>-</text>`) gilt nicht als
 * Text – aber nur bei Normen mit Weggefallen-Kennzeichnung.
 */
export function normWeggefallen(norm: NormDarstellung): boolean {
  return norm.status === 'weggefallen' && ohneInhalt(norm);
}

function ohneInhalt(norm: NormDarstellung): boolean {
  const inhalt = normInhaltsTexte(norm).join('').trim();
  return inhalt === '' || BLOSSER_STRICH.test(inhalt);
}

const KEIN_TEXT_VEROEFFENTLICHT = '(kein Text veröffentlicht)';

/**
 * Norm ohne Weggefallen-Kennzeichnung, deren Quelle weder Titel noch Text
 * (höchstens einen bloßen Strich) liefert, z. B. GrdstVG § 25: `<text>-</text>`.
 * Überschriftartige Gliederungsartikel tragen ihren Inhalt in den §§ darunter.
 */
function normOhneVeroeffentlichtenText(norm: NormDarstellung): boolean {
  return (
    norm.status === undefined &&
    !norm.titel?.trim() &&
    !(norm.art === 'gliederungsartikel' && norm.ueberschriftartig) &&
    ohneInhalt(norm)
  );
}

/**
 * Titel der kompakten, kursiven Kurzzeile oder undefined bei normaler
 * Darstellung. Einzige Quelle für die Wahl zwischen Kurzzeile und Normaltext.
 */
export function normKurzzeilenTitel(norm: NormDarstellung): string | undefined {
  if (normWeggefallen(norm)) return norm.titel ?? '';
  if (normOhneVeroeffentlichtenText(norm)) return KEIN_TEXT_VEROEFFENTLICHT;
  return undefined;
}

/** Sammelbezeichnungen (z. B. „§§ 27 bis 30“) adressieren ihre Einzelzahlen. */
export function normSammelbereichAufloesbar(norm: NormDarstellung): boolean {
  return (
    norm.art !== 'erwaegungsgrund' &&
    (norm.status === 'weggefallen' || normOhneVeroeffentlichtenText(norm))
  );
}

// Nur der amtliche Titel (aus dem GesetzesXML) – ein nachträglich
// aus einer nichtamtlicheTitel-XML ergänzter Titel (titelIstNichtamtlich) wird
// ignoriert. Einzige Quelle für "amtlicher Titel" bei allem, was persistiert
// wird (aktuell: elementstand in Markierungen, siehe verweismarkierungAktionen.ts
// und konfliktaktionen.ts) bzw. mit Persistiertem verglichen
// wird (markierungskonfliktPruefung.ts::elementstandPasstNochZu).
export function normAmtlicherTitel(norm: NormDarstellung): string | undefined {
  return norm.titelIstNichtamtlich ? undefined : norm.titel;
}

export function normVollTitel(norm: NormDarstellung): string {
  if (norm.titel) return `${norm.bezeichnung} ${norm.titel}`;
  return norm.bezeichnung;
}

// Einzige Quelle für das Format "Bezeichnung: Titel" einer Überschrift –
// wird sowohl im Haupt-Textfluss (UeberschriftZeile) als auch in der
// Struktur-Kontext-Leiste verwendet, damit eine Anpassung des Formats an
// einer Stelle automatisch überall greift.
export function ueberschriftVollTitel(u: UeberschriftDarstellung): string {
  if (u.titel) {
    const endeMitSatzzeichen = /[.:)]$/.test(u.bezeichnung.trim());
    const trenner = endeMitSatzzeichen ? ' ' : ': ';
    return `${u.bezeichnung}${trenner}${u.titel}`;
  }
  return u.bezeichnung;
}

/**
 * Zeichenlänge des reinen Norminhalts (OHNE Normbezeichnung und Titel) – zählt alle Absatz-/
 * Satz-/Eintrags-Texte inkl. Fortsetzungen und Zusatztexte zusammen. Einzige Verwendung
 * aktuell: elementstand eines Verweises (siehe Elementstand in
 * markierungSpeicher.ts), um künftig erkennen zu können, ob sich eine
 * Zielnorm seit dem Verweisen inhaltlich verändert hat. Zählt rohen
 * Text ohne schuetzeLeerzeichen-Ersetzung (Darstellungs-Detail, siehe
 * lib/domain/basis/textNachbearbeitung.ts) – für eine reine Längen-Gliederungskennzahl unerheblich,
 * ob geschützte oder normale Leerzeichen gezählt werden.
 */
export function normTextLaenge(norm: NormDarstellung): number {
  return normInhaltsTexte(norm).reduce((summe, text) => summe + text.length, 0);
}

/** Alle Absatz-/Satz-/Eintrags-Texte inkl. Fortsetzungen und Zusatztexte einer Norm. */
function normInhaltsTexte(norm: NormDarstellung): string[] {
  const texte: string[] = [];
  const sammleEintraege = (eintraege: ListenEintragDarstellung[]) => {
    for (const e of eintraege) {
      if (e.saetze) sammleSaetze(e.saetze);
      else texte.push(e.text ?? '');
      texte.push(e.fortsetzung ?? '');
      sammleEintraege(e.untereintraege);
    }
  };
  const sammleSaetze = (saetze: SatzDarstellung[]) => {
    for (const s of saetze) {
      texte.push(s.text, s.fortsetzung ?? '');
      sammleEintraege(s.eintraege);
    }
  };
  for (const abs of norm.absaetze) {
    if (abs.unterabsaetze) for (const ua of abs.unterabsaetze) sammleSaetze(ua.saetze);
    else sammleSaetze(abs.saetze);
  }
  for (const zusatztext of norm.zusatztexte ?? []) texte.push(zusatztext.text);
  return texte;
}

/**
 * Flache Liste aller Normen eines Gesetzes (für Navigation/Suche/Statistik),
 * inklusive Gliederungsartikel (z.B. Art. 229 EGBGB), die ebenfalls type:
 * 'norm' sind. Wird aus elemente abgeleitet statt als eigenes Feld
 * dauerhaft gespeichert – entspricht exakt elemente.filter(el => el.typ
 * === 'norm').map(el => el.data), da der Parser beide ursprünglich in
 * exakt diesem Zusammenhang befüllt hat (siehe gesetzesXMLParser.ts).
 */
export function gesetzNormen(gesetz: GesetzDarstellung): NormDarstellung[] {
  const result: NormDarstellung[] = [];
  for (const el of gesetz.elemente) {
    if (el.typ === 'norm') result.push(el.data);
  }
  return result;
}

/** Amtlicher Titel und rohe Zeichenlänge einer Ausgangsstelle oder Zielnorm. */
export function berechneElementstand(element: NormDarstellung | UeberschriftDarstellung): {
  titel?: string;
  textlaenge: number;
} {
  return 'absaetze' in element
    ? { titel: normAmtlicherTitel(element), textlaenge: normTextLaenge(element) }
    : {
        titel: element.titel,
        textlaenge: element.bezeichnung.length + (element.titel?.length ?? 0),
      };
}

/** Teil eines Fließtextblocks bei fortlaufenden Sätzen: Satzanfang mit Satztext
 *  oder Fortsetzung des Satzes nach seiner Aufzählung. nummer zählt ab 1. */
export interface FortlaufenderTeil {
  art: 'satz' | 'fortsetzung';
  satz: SatzDarstellung;
  nummer: number;
}

/** Block bei fortlaufenden Sätzen: Fließtext oder die Aufzählung eines Satzes. */
export type FortlaufenderBlock =
  { art: 'fliesstext'; teile: FortlaufenderTeil[] } | { art: 'aufzaehlung'; satz: SatzDarstellung };

/**
 * Gliedert Sätze für die Einstellung „Neue Zeile für jeden Satz“ = aus: Sätze
 * laufen als Fließtext; eine Aufzählung beendet den laufenden Block, die
 * Fortsetzung danach beginnt den nächsten, in dem die Folgesätze weiterlaufen.
 * Gemeinsame Grundlage von Darstellung (SaetzeListe) und Höhenschätzung.
 */
export function gliedereFortlaufendeSaetze(saetze: SatzDarstellung[]): FortlaufenderBlock[] {
  const bloecke: FortlaufenderBlock[] = [];
  let teile: FortlaufenderTeil[] = [];
  saetze.forEach((satz, index) => {
    teile.push({ art: 'satz', satz, nummer: index + 1 });
    if (satz.eintraege.length > 0) {
      bloecke.push({ art: 'fliesstext', teile });
      bloecke.push({ art: 'aufzaehlung', satz });
      teile = [];
    }
    if (satz.fortsetzung) teile.push({ art: 'fortsetzung', satz, nummer: index + 1 });
  });
  if (teile.length > 0) bloecke.push({ art: 'fliesstext', teile });
  return bloecke;
}
