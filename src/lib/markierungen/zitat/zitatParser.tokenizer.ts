// Reine Textzerlegung in Token mit unveränderten Eingabepositionen.
// Profilfreie §-/Artikel-Grammatik; Canon klassifiziert anschließend separat.
// Normgrenzen und Mehrdeutigkeiten bestimmt zitatParser.ts.

import { bereiteKurztitelsucheVor, type Kurztitelbestand } from './zitatParser.kurztitel';
import { normPraefixQuelle } from '@/lib/domain/basis/normPraefixe';
import { roemischZuZahl } from '@/lib/utils/roemischeZahlen';
import type { ZusatzArt } from '@/lib/domain/gesetzTypes';

export type { ZusatzArt };
/** Wie ZusatzArt, aber inkl. der Arten, die zitatParser.ts zwar für die
 *  Grenz-Erkennung braucht, aber NIE eine Existenzprüfung auslösen (siehe
 *  Ablaufkommentar in zitatParser.normgrenzen.komma.ts: Alt/Hs/Var/Gr). */
export type InterneZusatzArt = ZusatzArt | 'gruppe' | 'variante' | 'halbsatz' | 'alternative';

type TokenArt =
  | 'symbol'
  | 'zahl'
  | 'zusatz'
  | 'sonstige'
  | 'wort'
  | 'buchstabe'
  | 'komma'
  | 'semikolon'
  | 'schraegstrich';

export interface Token {
  art: TokenArt;
  /** Bekannte Originalspanne: weder Canon noch Mehrwortlesen dürfen sie umdeuten. */
  bekannterKurztitel?: true;
  start: number;
  ende: number;
  /** Roher Text wie eingegeben (Groß-/Kleinschreibung erhalten – wichtig für
   *  Kurztitel, siehe Hinweistext im Verweismarkierung-Textfeld). */
  wert: string;
  /** Normalisierter Wert für 'symbol' ('§'|'§§'|'Art'|'Artt'|'Can'|'Cann') bzw. 'zusatz'
   *  (InterneZusatzArt) – ungenutzt bei den übrigen Arten. */
  norm?: string;
  /** Nur gesetzt bei 'zusatz'-Tokens, die aus einer als Absatz erkannten
   *  römischen Zahl entstanden sind (z.B. "III" → 3) – wird für
   *  Existenzprüfung/Normauflösung gebraucht, die Dezimalzahlen erwarten
   *  (siehe normStrukturPruefung.ts: pruefeZusatzangabe). `wert` behält die
   *  römische Original-Schreibweise für Anzeige/Fehlermeldungen. */
  roemischWert?: number;
  /** Nur gesetzt bei 'zahl'-Tokens: true, wenn im Quelltext unmittelbar ein
   *  Punkt folgte (z.B. "6." statt "6") – unterscheidet eine Ordnungszahl vor
   *  Alt/Var/Gr/Hs ("6. Var" = Variante 6) von einer eigenständigen Zahl
   *  ("6 Var. 1" = Norm 6, Var. 1) bzw. einem zweiten Binnenparagraph-Teil
   *  ("Art. 229 6" ohne Punkt). Wird ausschließlich für diese Unterscheidung
   *  in zitatParser.ts gebraucht (siehe istOrdnungszahlVorAltVarGr-Prüfungen
   *  dort); der Punkt selbst wird NICHT in `wert`/`ende` aufgenommen, bleibt
   *  also ein separates (dann als "unbekanntes Zeichen" übersprungenes)
   *  Zeichen im Quelltext.
   */
  warOrdnungszahl?: boolean;
}

// Kürzel mit Punkten INNERHALB des Kürzels (z.B. "i.V.m.", "a.E.") lassen
// sich nicht über eine einfache Buchstabenkette erkennen – werden daher per
// Sonderregex VOR der generischen Wort-Erkennung geprüft.
// "iVm"/"i.V.m." wirkt wie "und" (Trennwort); die übrigen Kürzel sind ohne Normbezug.
const SONDER_MUSTER: { muster: RegExp; art: TokenArt }[] = [
  { muster: /^i\.?\s?[Vv]\.?\s?[Mm]\.?/, art: 'komma' }, // iVm / i.V.m.
  { muster: /^a\.?\s?[Ee]\.?/, art: 'sonstige' }, // aE / a.E.
  { muster: /^am\s+Ende/, art: 'sonstige' },
];

const ZUSATZ_WOERTER: Record<string, InterneZusatzArt> = {
  abs: 'absatz',
  absatz: 'absatz',
  uabs: 'unterabsatz',
  unterabsatz: 'unterabsatz',
  unterabs: 'unterabsatz',
  s: 'satz',
  satz: 'satz',
  nr: 'nummer',
  nummer: 'nummer',
  ziff: 'nummer',
  ziffer: 'nummer',
  ziffern: 'nummer',
  lit: 'litera',
  litera: 'litera',
  buchst: 'litera',
  buchstabe: 'litera',
  gr: 'gruppe',
  gruppe: 'gruppe',
  var: 'variante',
  variante: 'variante',
  hs: 'halbsatz',
  halbsatz: 'halbsatz',
  halbs: 'halbsatz',
  alt: 'alternative',
  alternative: 'alternative',
};

// Einzelner Kleinbuchstabe oder ein verdoppelter gleicher Kleinbuchstabe
// (z.B. "a", "aa", "bb") – die für Litera-Aufzählungen übliche Schreibweise
// (siehe gesetze-im-internet.de: "a)", "b)", …, "aa)", "bb)", …). Bewusst nur
// Kleinbuchstaben: echte Gesetz-Kurztitel bestehen nach der Tokenklassifizierung immer aus
// mindestens zwei UNTERSCHIEDLICHEN (meist Groß-)Buchstaben, sodass diese
// Muster nie mit einem Kurztitel kollidieren – anders als bei generischen
// mehrbuchstabigen Wörtern, die weiterhin regulär als Kurztitel-Kandidat
// gelten (siehe klassifiziereWort/Aufrufer 'wort'-Zweig).
const LITERA_BUCHSTABE_MUSTER = /^([a-z])\1?$/;
const SONSTIGE_WOERTER = new Set(['analog', 'vgl', 'sh', 'siehe', 'des']);
const TRENN_WOERTER = new Set(['und', 'sowie', 'oder', 'bzw', 'bis']);
const ARTIKEL_SINGULAR = new RegExp(`^${normPraefixQuelle('zitat', 'artikel', false)}$`, 'i');
const ARTIKEL_PLURAL = new RegExp(`^${normPraefixQuelle('zitat', 'artikel', true)}$`, 'i');

function klassifiziereWort(wortRoh: string, angehaengt: boolean): { art: TokenArt; norm?: string } {
  const w = wortRoh.toLowerCase();
  if (ARTIKEL_SINGULAR.test(w)) return { art: 'symbol', norm: 'Art' };
  if (ARTIKEL_PLURAL.test(w)) return { art: 'symbol', norm: 'Artt' };
  if (w in ZUSATZ_WOERTER) return { art: 'zusatz', norm: ZUSATZ_WOERTER[w] };
  if (TRENN_WOERTER.has(w) && !(w === 'bis' && angehaengt)) return { art: 'komma' };
  if (SONSTIGE_WOERTER.has(w)) return { art: 'sonstige' };
  return { art: 'wort' };
}

/** Einheitliches Ergebnis der Lese-Funktionen für Token und nächste Position. */
interface Lesetreffer {
  token: Token;
  naechstesI: number;
}

/**
 * Kürzel mit Punkten INNERHALB des Kürzels (z.B. "i.V.m.", "a.E.", "am
 * Ende") – siehe SONDER_MUSTER oben. Einzige der vier Lese-Funktionen, die
 * tatsächlich `null` liefern kann (keines der Muster muss an Position `i`
 * treffen); die drei übrigen (leseGanzzahl/leseSymbolzeichen/
 * leseWortOderZusatz) werden vom Aufrufer erst NACH einer bereits
 * zutreffenden Zeichenklassen-Prüfung erreicht und liefern daher immer ein
 * Token (siehe Lesetreffer-Kommentar oben).
 */
function leseSonderMuster(text: string, i: number): Lesetreffer | null {
  for (const { muster, art } of SONDER_MUSTER) {
    const m = text.slice(i).match(muster);
    if (m) {
      return {
        token: { art, start: i, ende: i + m[0].length, wert: m[0] },
        naechstesI: i + m[0].length,
      };
    }
  }
  return null;
}

/** §/§§-Zeichen. Vom Aufrufer nur bei ch === '§' erreicht (siehe Lesetreffer-Kommentar oben). */
function leseSymbolzeichen(text: string, i: number): Lesetreffer | null {
  if (text[i + 1] === '§') {
    return {
      token: { art: 'symbol', start: i, ende: i + 2, wert: '§§', norm: '§§' },
      naechstesI: i + 2,
    };
  }
  return {
    token: { art: 'symbol', start: i, ende: i + 1, wert: '§', norm: '§' },
    naechstesI: i + 1,
  };
}

/**
 * Ganzzahl, inkl. alphanumerischer Listen-Nummer und Ordnungszahl-Punkt
 * (siehe Token.warOrdnungszahl). Vom Aufrufer nur bei /\d/.test(ch) erreicht
 * (siehe Lesetreffer-Kommentar oben).
 */
function leseGanzzahl(text: string, i: number): Lesetreffer | null {
  let j = i + 1;
  while (/\d/.test(text.charAt(j))) j++;
  // Nur ein vollständiger ASCII-Buchstabenlauf mit einem oder zwei
  // Kleinbuchstaben gehört zur Zahl. Längere oder gemischte Läufe bleiben
  // ungekürzt eigenes Wort; ff bleibt die Folgeangabe.
  // Stryker disable next-line StringLiteral : Der einzige StringLiteral-Mutant ersetzt den leeren Fallback durch "Stryker was here!"; der vollständige Kleinbuchstabenfilter verwirft beide. Ein vorhandener Buchstabenlauf umgeht den Fallback.
  const buchstabenlauf = text.slice(j).match(/^[A-Za-z]+/)?.[0] ?? '';
  const buchstabenSuffix =
    /^[a-z]{1,2}$/.test(buchstabenlauf) && buchstabenlauf !== 'ff' ? buchstabenlauf : '';
  const zahlEnde = j + buchstabenSuffix.length;
  // Ordnungszahl-Punkt (siehe Token.warOrdnungszahl) gilt nur für reine
  // Zahlen OHNE Buchstaben-Suffix – "1a. Alt" ist keine bekannte
  // Zitierform, daher hier bewusst ausgeschlossen.
  const warOrdnungszahl = buchstabenSuffix === '' && text[zahlEnde] === '.';
  return {
    token: {
      art: 'zahl',
      start: i,
      ende: zahlEnde,
      wert: text.slice(i, zahlEnde),
      warOrdnungszahl,
    },
    naechstesI: zahlEnde,
  };
}

/** Liest Symbol/Zusatz/Sonstiges/Litera oder Kurztitel-Kandidat.
 * Das vorherige Token unterscheidet römische Absatzkurzformen von Kurztiteln. */
function leseWortOderZusatz(text: string, i: number, tokens: Token[]): Lesetreffer | null {
  let j = i + 1;
  while (/[A-Za-zÄÖÜäöüß]/.test(text.charAt(j))) j++;
  let ende = j;
  // Ein unmittelbar folgender Punkt gehört zur Abkürzung, nicht zum Wort.
  if (text[j] === '.') ende = j + 1;
  const roh = text.slice(i, ende);
  const wortOhnePunkt = text.slice(i, j);

  // Römische Zahl als Absatz-Kurzform: überall dort, wo sie NICHT
  // unmittelbar auf ein Wort-Token folgt (siehe Ablaufkommentar oben in
  // zitatParser.ts) – das schließt insbesondere Kurztitel wie "SGB IV" aus
  // (davor steht dort das Wort-Token "SGB"), erlaubt aber sowohl die
  // Fortsetzung nach Zahl/Komma/Schrägstrich als auch einen alleine
  // stehenden römischen Absatz als GESAMTEN Zitat-Text (z.B. nur "III",
  // ohne jede vorangehende Norm: Zusatzinformation ohne Ziel).
  const vorheriges = tokens[tokens.length - 1];
  const kannRoemischSein = vorheriges === undefined || vorheriges.art !== 'wort';
  // Fremde Zeichen schließen eine römische Absatzangabe aus. Die Umwandlung
  // prüft anschließend die vollständige Schreibweise durch Rückumwandlung.
  const roemischerWert =
    kannRoemischSein && !/[^IVXLCDM]/.test(wortOhnePunkt) ? roemischZuZahl(wortOhnePunkt) : null;
  if (roemischerWert !== null) {
    return {
      token: {
        art: 'zusatz',
        start: i,
        ende,
        wert: wortOhnePunkt,
        norm: 'absatz',
        roemischWert: roemischerWert,
      },
      naechstesI: ende,
    };
  }

  const klassifiziert = klassifiziereWort(wortOhnePunkt, /\d/.test(text.charAt(i - 1)));
  // Litera-Buchstabe (siehe LITERA_BUCHSTABE_MUSTER oben): NUR wenn
  // klassifiziereWort das Wort nicht bereits als bekanntes Symbol/
  // Zusatzwort/Sonstiges erkannt hat (z.B. bleibt "s" weiterhin die
  // Satz-Abkürzung, kein Litera-Buchstabe) – deckt zugleich lit-Werte wie
  // "i"/"ii" ab, die sonst fälschlich als römische Zahl oder als
  // generisches Wort (→ Kurztitel) eingeordnet würden.
  const istLiteraBuchstabe =
    klassifiziert.art === 'wort' && LITERA_BUCHSTABE_MUSTER.test(wortOhnePunkt);
  return {
    token: {
      art: istLiteraBuchstabe ? 'buchstabe' : klassifiziert.art,
      start: i,
      ende,
      wert: roh,
      norm: klassifiziert.norm,
    },
    naechstesI: ende,
  };
}

/**
 * Einzelzeichen-Satzzeichen-Token (Komma/Semikolon/Schrägstrich), die immer
 * genau ein Zeichen verbrauchen. Kein Lesetreffer-Rückgabetyp: `naechstesI`
 * ist hier immer `i + 1`, der Aufrufer inkrementiert selbst.
 */
function leseEinzelzeichenToken(ch: string, i: number): Token | null {
  if (ch === ',') return { art: 'komma', start: i, ende: i + 1, wert: ',' };
  if (ch === ';') return { art: 'semikolon', start: i, ende: i + 1, wert: ';' };
  if (ch === '/') return { art: 'schraegstrich', start: i, ende: i + 1, wert: '/' };
  return null;
}

/**
 * Dispatch an die vier mehrzeichigen Lese-Funktionen oben, für EIN Zeichen an
 * Position `i` (kein Leerzeichen/Einzelzeichen-Satzzeichen, siehe Aufrufer) –
 * Priorität: Zahl vor Sonder-Muster vor Symbol vor Wort (siehe die jeweiligen
 * Kommentare der vier Funktionen für die Begründung der Priorität).
 */
function leseMehrzeichenToken(
  text: string,
  i: number,
  ch: string,
  tokens: Token[],
): Lesetreffer | null {
  if (/\d/.test(ch)) return leseGanzzahl(text, i);
  const sonderTreffer = leseSonderMuster(text, i);
  if (sonderTreffer !== null) return sonderTreffer;
  if (ch === '§') return leseSymbolzeichen(text, i);
  if (/[A-Za-zÄÖÜäöüß]/.test(ch)) return leseWortOderZusatz(text, i, tokens);
  return null;
}

/** Striche trennen ausschließlich Zahl und folgende Ziffer; Titel bleiben unberührt. */
function istBereichsstrich(text: string, i: number, tokens: Token[]): boolean {
  const vorheriges = tokens.at(-1);
  return (
    /[-–—]/.test(text.charAt(i)) &&
    vorheriges?.art === 'zahl' &&
    /^\s*$/.test(text.slice(vorheriges.ende, i)) &&
    /^\s*\d/.test(text.slice(i + 1))
  );
}

export function tokenisiere(text: string, bestand: Kurztitelbestand = []): Token[] {
  const tokens: Token[] = [];
  const leseKurztitel = bereiteKurztitelsucheVor(bestand);
  let i = 0;
  // charAt liefert am Textende den leeren String; unbekannte Zeichen
  // durchlaufen denselben Fallback wie Whitespace.
  while (text.charAt(i) !== '') {
    const ch = text.charAt(i);

    const einzelzeichen = istBereichsstrich(text, i, tokens)
      ? { art: 'komma' as const, start: i, ende: i + 1, wert: ch }
      : leseEinzelzeichenToken(ch, i);
    if (einzelzeichen !== null) {
      tokens.push(einzelzeichen);
      i++;
      continue;
    }

    const kurztitelEnde = /[A-Za-zÄÖÜäöüß]/.test(ch) ? leseKurztitel(text, i) : undefined;
    if (kurztitelEnde !== undefined) {
      tokens.push({
        art: 'wort',
        start: i,
        ende: kurztitelEnde,
        wert: text.slice(i, kurztitelEnde),
        bekannterKurztitel: true,
      });
      i = kurztitelEnde;
      continue;
    }

    const treffer = leseMehrzeichenToken(text, i, ch, tokens);
    if (treffer !== null) {
      tokens.push(treffer.token);
      i = treffer.naechstesI;
      continue;
    }

    // Unbekanntes Zeichen (Klammer, sonstiges Satzzeichen) – überspringen.
    i++;
  }

  return tokens;
}
