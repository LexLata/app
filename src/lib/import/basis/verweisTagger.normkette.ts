// Erkennt Normmuster und zerlegt Normketten in einzelne Verweisziele.
import { familieVonText, normPraefixQuelle } from '@/lib/domain/basis/normPraefixe';
// ---------------------------------------------------------------------------
// Regex-Muster für Verweise
// ---------------------------------------------------------------------------

// Zahl-Muster: Ziffern mit optionalem Buchstabensuffix ("280", "327a", "246a")
const Z = String.raw`\d+[a-zA-Z]*`;

const ARTIKEL_QUELLE = normPraefixQuelle('tagger', 'artikel');
const PARA_QUELLE = normPraefixQuelle('tagger', 'paragraph');
const CANON_QUELLE = normPraefixQuelle('tagger', 'canon');

// Canon-Schreibweisen ignorieren Großschreibung, ohne die bisherigen Muster
// für Paragraphen und Artikel zu verändern. Keine Lookbehind-Ausdrücke.
function ohneGrossschreibung(quelle: string): string {
  return quelle.replace(
    /[a-z]/gi,
    (buchstabe) => `[${buchstabe.toLowerCase()}${buchstabe.toUpperCase()}]`,
  );
}

// Primärmuster – in Prioritätsreihenfolge (längstes zuerst)
const ARTIKEL_MIT_PARA = String.raw`${ARTIKEL_QUELLE}\s+${Z}\s+${PARA_QUELLE}\s+${Z}`;
const ARTIKEL_ALLEIN = String.raw`${ARTIKEL_QUELLE}\s+${Z}`;
const PARA_ZEICHEN = String.raw`${PARA_QUELLE}\s+${Z}`;

// Konnektoren zwischen Kettengliedern einer Normkette ("§§ 5 und 6" /
// "§§ 5 bis 9" / "§§ 5 oder 6" / "§§ 5, 6") – EINZIGE Quelle für diese Wörter
// im gesamten Modul. Sowohl QUALI (Haupt-Regex: wie weit ein Treffer reicht)
// als auch KETTEN_GLIED_MUSTER (zerlegeNormkette: wie ein Treffer in Glieder
// zerlegt wird) werden daraus gebaut. Ohne diese gemeinsame Quelle könnten
// beide Stellen auseinanderlaufen: ein Konnektor, der nur in einer der beiden
// Stellen steht, würde entweder gar nicht erst mitgematcht (fehlt in QUALI)
// oder nicht mehr in Kettenglieder aufgeteilt (fehlt in KETTEN_GLIED_MUSTER) –
// beides ein stiller Fehler ohne Absturz. Bei einem neuen Konnektor genügt es
// daher, ihn hier EINMAL zu ergänzen.
const KETTEN_KONNEKTOR_WOERTER = String.raw`und|bis|oder`;

// Qualifizierer: Absatz/Satz/Nummer und Zahlen-Fortsetzungen (Konnektor/Komma)
// "Nr." ist die Abkürzung von "Nummer".
const QUALI_QUELLE = String.raw`\s+(?:Absatz|Abs\.)\s+${Z}|\s+Satz\s+${Z}|\s+(?:Nummer|Nr\.)\s+${Z}|\s+(?:${KETTEN_KONNEKTOR_WOERTER})\s+${Z}|,\s*${Z}`;
const QUALI = `(?:${QUALI_QUELLE})*`;

// Vollständiges Muster: Primär + beliebig viele Qualifizierer
const NORM_MUSTER = `(?:${ARTIKEL_MIT_PARA}|${ARTIKEL_ALLEIN}|${PARA_ZEICHEN})${QUALI}`;
// Nur mit matchAll verwenden: es klont die Regex, ihr lastIndex bleibt 0.
// Kein exec/test auf dieser Konstante.
export const NORM_RE = new RegExp(NORM_MUSTER, 'g');
const CANON_KONNEKTOREN = ohneGrossschreibung(`${KETTEN_KONNEKTOR_WOERTER}|and|or|to|et`);
const CANON_TRENNER = String.raw`(?:,\s*(?:(?:${CANON_KONNEKTOREN})\s+)?|\s+(?:${CANON_KONNEKTOREN})\s+)`;
const CANON_QUALI = String.raw`(?:(?:\s+|,\s*)(?:${PARA_QUELLE}|[nN][nN]?\.)\s*${Z}|${QUALI_QUELLE}|${CANON_TRENNER}${Z})*`;
const CANON_MUSTER = String.raw`\b${ohneGrossschreibung(CANON_QUELLE)}\s*${Z}${CANON_QUALI}`;
export const CANON_NORM_RE = new RegExp(`(?:${CANON_MUSTER}|${NORM_MUSTER})`, 'g');
const CANON_PRAEFIX_RE = new RegExp(`^(${CANON_QUELLE})\\s*(${Z})`, 'i');

// ---------------------------------------------------------------------------
// Norm-Bezeichnung aus Match-Text extrahieren (für norm-Attribut)
// ---------------------------------------------------------------------------

// Zahl-Token einer Norm einfangen, aber ein direkt anhängendes Komma NICHT
// mit aufnehmen (Sicherheitsnetz gegen z.B. "§§ 5, 6 Absatz 2" – ein
// gemischter Fall aus Normkette + Qualifizierer, den zerlegeNormkette()
// bewusst nicht aufteilt, siehe dort). Reine Ketten wie "§§ 206, 210, 211"
// werden nicht hier, sondern in zerlegeNormkette() behandelt.
const ZAHL_OHNE_KOMMA = String.raw`[^\s,]+`;
const ARTIKEL_MIT_PARAGRAPH_RE = new RegExp(
  `^${ARTIKEL_QUELLE}\\s+(${ZAHL_OHNE_KOMMA})\\s+(${PARA_QUELLE}\\s+\\S+)`,
);
const ARTIKEL_RE = new RegExp(`^${ARTIKEL_QUELLE}\\s+(${ZAHL_OHNE_KOMMA})`);
const PARAGRAPH_RE = new RegExp(`^${PARA_QUELLE}\\s+(${ZAHL_OHNE_KOMMA})`);

export function extrahiereNorm(matchText: string): string {
  const canon = matchText.match(CANON_PRAEFIX_RE);
  if (canon) return `Can. ${canon[2]}`;
  // Artikel + §: "Artikels 246a § 1 Absatz 2" → "Art. 246a § 1"
  const m1 = matchText.match(ARTIKEL_MIT_PARAGRAPH_RE);
  if (m1) return `Art. ${m1[1]} ${m1[2]!.replace(/^§§/, '§')}`;

  // Artikel allein: "Artikel 3 Absatz 1" → "Art. 3"
  const m2 = matchText.match(ARTIKEL_RE);
  if (m2) return `Art. ${m2[1]}`;

  // § oder §§: "§§ 280 Absatz 1" → "§ 280"
  const m3 = matchText.match(PARAGRAPH_RE);
  if (m3) return `§ ${m3[1]}`;

  return matchText;
}

// ---------------------------------------------------------------------------
// Normketten aufteilen ("§§ 206, 210, 211" / "§§ 260 und 261" /
// "Artikel 1, 2, 3" → mehrere Einzelnormen)
// ---------------------------------------------------------------------------

interface NormKettenGlied {
  // Original-Teilstring des Match-Texts für dieses Kettenglied – Aneinander-
  // reihung aller Glieder ergibt exakt wieder matchText (Originaltext bleibt
  // unverändert, es wird nur vertaggt).
  text: string;
  norm: string;
}

// Trenner + Zahl eines weiteren Kettenglieds: ", 210" / " und 211" / " bis 211" / " oder 211".
// Aus KETTEN_KONNEKTOR_WOERTER gebaut (siehe dort) statt eigener Wortliste,
// damit Haupt-Regex (QUALI) und Kettenaufteilung nicht auseinanderlaufen
// können. Wird in zerlegeNormkette() lokal instanziiert (siehe dort) statt
// modul-weit als 'g'-Regex mit manuellem lastIndex-Reset gehalten – analog
// zum Aufbau von NORM_MUSTER in ersetzeVerweise().
const KETTEN_GLIED_MUSTER = String.raw`(,\s*|\s+(?:${KETTEN_KONNEKTOR_WOERTER})\s+)(\d+[a-zA-Z]*)`;

/**
 * Erkennt reine Normketten – mehrere durch Komma/"und"/"bis"/"oder" verbundene
 * Zahlen direkt hinter "§§" oder "Artikel" – und teilt sie in einzelne
 * Kettenglieder auf. Jedes Glied bekommt seine eigene Normbezeichnung; das
 * Original-Zeichenmaterial (inkl. Trennzeichen) wird dabei nicht verändert,
 * nur auf die Glieder verteilt (Trenner gehört jeweils zum VORANGEHENDEN
 * Glied, siehe Aufteilungs-Beispiel in den Tests).
 *
 * Folgt der Zahlenkette noch ein Absatz/Satz/Nummer-Qualifizierer (z.B.
 * "§§ 5, 6 Absatz 2"), wird dieser komplett dem LETZTEN Kettenglied
 * zugeschlagen ("§ 5" / "§ 6 Absatz 2") – nicht allen Gliedern, da die
 * Reichweite eines nachgestellten Qualifizierers über mehrere Normen hinweg
 * im Normtext nicht eindeutig ist (Absprache: § 5 wird dabei vollständig
 * zitiert, der Qualifizierer gilt nur für die zuletzt genannte Norm).
 *
 * Liefert null, wenn keine (aufteilbare) Kette vorliegt – z.B. bei genau
 * einer Zahl, oder wenn zwischen zwei erkannten Kettengliedern eine Lücke
 * liegt (z.B. weil dort schon ein Qualifizierer steht, der NICHT am Ende
 * der Kette, sondern mittendrin auftaucht – ein Muster, das hier bewusst
 * nicht interpretiert wird).
 *
 * Der Präfix ist "§", "§§" oder "Artikel"/"Artikels"/"Artikeln" (keine
 * Singular/Plural-Unterscheidung bei Artikel möglich, daher ohne
 * zusätzliches Signal zugelassen) + erste Zahl. Ein einzelnes "§" wird
 * dabei genauso zugelassen wie "§§" (Absprache: auch "§ 206, 210, 211" soll
 * aufgeteilt werden) – das ist unproblematisch, weil die Lücken-Prüfung
 * unten ("glied.index !== pos") einen Fall wie "§ 5 Abs. 3, 4" trotzdem
 * NICHT als Kette erkennt: das Komma dort folgt nicht direkt auf die Zahl,
 * sondern erst nach "Abs. 3", also bricht die Lückenprüfung schon beim
 * ersten Kettenglied-Versuch ab.
 */
export function zerlegeNormkette(matchText: string): NormKettenGlied[] | null {
  const istCanon = CANON_PRAEFIX_RE.test(matchText);
  const praefixMatch = matchText.match(
    new RegExp(
      `^(${istCanon ? CANON_QUELLE : `${PARA_QUELLE}|${ARTIKEL_QUELLE}`})(\\s*)(${Z})`,
      istCanon ? 'i' : '',
    ),
  );
  if (!praefixMatch) return null;

  const [praefixVoll, symbol, , ersteZahl] = praefixMatch as unknown as [
    string,
    string,
    string,
    string,
  ];
  const normPraefix =
    familieVonText(symbol) === 'canon' ? 'Can.' : symbol.startsWith('§') ? '§' : 'Art.';

  const zahlen: string[] = [ersteZahl];
  const grenzen: number[] = []; // Positionen NACH jedem Trenner (= Start der jeweils nächsten Zahl)

  // Lokal instanziiert (siehe Kommentar bei KETTEN_GLIED_MUSTER) statt
  // modul-weit gehalten – kein lastIndex-Zustand, den man zurücksetzen müsste.
  const ketteRe = new RegExp(
    istCanon ? `(${CANON_TRENNER})(${Z})` : KETTEN_GLIED_MUSTER,
    istCanon ? 'gi' : 'g',
  );
  ketteRe.lastIndex = praefixVoll.length;
  let pos = praefixVoll.length;
  let glied: RegExpExecArray | null;
  while ((glied = ketteRe.exec(matchText)) !== null) {
    // Lücke zwischen den Kettengliedern (z.B. ein Qualifizierer MITTEN in
    // der Kette statt erst am Ende) -> nicht interpretierbar, nicht aufteilen.
    if (glied.index !== pos) return null;
    const [gliedVoll, trenner, zahl] = glied as unknown as [string, string, string];
    grenzen.push(glied.index + trenner.length);
    zahlen.push(zahl);
    pos = glied.index + gliedVoll.length;
  }

  // Weniger als zwei Zahlen (nur die erste) -> keine Kette.
  if (zahlen.length < 2) return null;

  // Alles ab der letzten erkannten Zahl bis zum Ende von matchText (leer bei
  // reiner Kette, sonst ein nachgestellter Qualifizierer) gehört komplett
  // zum letzten Kettenglied.
  const segmentEnden = [...grenzen, matchText.length];
  const segmente: NormKettenGlied[] = [];
  let start = 0;
  for (let i = 0; i < segmentEnden.length; i++) {
    // Schleifen-Invariante: i < segmentEnden.length. segmentEnden.length ===
    // zahlen.length (beide haben genau ein Element mehr als grenzen bzw.
    // genau ein Element pro Kettenglied), daher ist auch zahlen[i] sicher.
    const ende = segmentEnden[i]!;
    segmente.push({ text: matchText.slice(start, ende), norm: `${normPraefix} ${zahlen[i]!}` });
    start = ende;
  }

  return segmente;
}
