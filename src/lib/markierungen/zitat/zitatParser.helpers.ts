// Reine Lese- und Vorschauhelfer für Normgrenzen und Kurztitel.
// Kein Zugriff auf NormState; gelesene Spannen behalten ihre Originalpositionen.

import { familieVonText, kanonischesPraefix } from '@/lib/domain/basis/normPraefixe';
import type { Token, ZusatzArt } from '@/lib/markierungen/zitat/zitatParser.tokenizer';

export interface SymbolFolge {
  /** Zahl-Teile der Normzahl direkt nach dem Symbol, siehe Aufrufer. */
  teile: string[];
  /** Tatsächlich ausgeschriebene, kanonische Einzelpräfixe. */
  praefix: string[];
  /** Token-Index direkt NACH der gelesenen Normzahl (exklusiv). */
  naechsterIndex: number;
}

/**
 * Prüft, ob eine Zahl mit Ordnungszahl-Punkt (siehe Token.warOrdnungszahl)
 * unmittelbar von einer Alt/Var/Gr/Hs-Zusatzangabe gefolgt wird (z.B. "1."
 * vor "Alt" in "812 1. Alt") – in diesem Fall gehört die Zahl zur
 * Zusatzangabe selbst und ist KEINE eigenständige Normzahl bzw. kein
 * zweiter Binnenparagraph-Teil (siehe Ablaufkommentar in
 * zitatParser.ts). Von mehreren Handlern in zitatParser.normgrenzen.ts und
 * zitatParser.normgrenzen.komma.ts genutzt – als einzige gemeinsame Quelle,
 * damit die Alt/Var/Gr/Hs-Liste nicht an mehreren Stellen synchron gehalten
 * werden muss.
 */
export function istOrdnungszahlVorAltVarGr(
  warOrdnungszahl: boolean | undefined,
  naechstesToken: Token | undefined,
): boolean {
  return (
    !!warOrdnungszahl &&
    naechstesToken?.art === 'zusatz' &&
    (naechstesToken.norm === 'alternative' ||
      naechstesToken.norm === 'variante' ||
      naechstesToken.norm === 'gruppe' ||
      naechstesToken.norm === 'halbsatz')
  );
}

/**
 * Liest die Normzahl direkt nach einem §/§§/Art./Artt.-Symbol-Token,
 * inklusive eines optionalen expliziten Gliederungsartikel-Binnenparagraphen
 * mit eigenem "§" (z.B. "Art. 229 § 2 EGBGB" – siehe Ablaufkommentar in
 * zitatParser.ts). Der Symbolhandler konsumiert die vollständige Folge;
 * enthaltene Binnenparagraphen eröffnen keinen weiteren Gesetzesabschnitt.
 *
 * Die "Zwei-Token-Kurzform ohne eigenes §" (z.B. "Art. 229 6 Var. 1", bloße
 * zweite Zahl direkt nach Symbol+Zahl) wird bewusst NICHT hier gelesen,
 * obwohl sie ebenfalls direkt an das Symbol anschließt: der Haupt-Loop
 * verarbeitet die zweite Zahl in diesem Fall stattdessen ganz regulär über
 * behandleZahlMitOffenerNorm (zitatParser.normgrenzen.ts), das denselben
 * Fall bereits – und allgemeiner, auch ganz ohne führendes Symbol, z.B.
 * bloßes "229 2" – abdecken muss. Bloße Zahlen verändern den offenen
 * Gesetzesabschnitt nicht.
 */
export function leseSymbolFolge(tokens: Token[], symbolIndex: number): SymbolFolge {
  let j = symbolIndex + 1;
  const teile: string[] = [];
  const symbol = tokens[symbolIndex]!.norm!;
  const familie = symbol === 'Can' || symbol === 'Cann' ? 'canon' : familieVonText(symbol);
  const praefix = familie
    ? [kanonischesPraefix(familie)]
    : // Nur Symboltokens erreichen diesen Helfer: §/§§, Art/Artt und Can/Cann
      // haben stets eine Familie. Der leere Fallback dient der Typabsicherung.
      // Stryker disable next-line ArrayDeclaration: unerreichbarer Fallback; nur dessen Arrayersetzung ist äquivalent.
      [];
  // Lokale Variablen statt wiederholtem tokens[j]-Zugriff: TS narrowt
  // ?.-geprüfte Variablen über Statements hinweg, einen wiederholten
  // Indexzugriff dagegen nicht (jeder Zugriff ist ein neuer Ausdruck).
  const erstesToken = tokens[j];
  if (erstesToken?.art === 'zahl') {
    teile.push(erstesToken.wert);
    j++;
  }
  const zweitesToken = tokens[j];
  const drittesToken = tokens[j + 1];
  if (
    familie === 'artikel' &&
    zweitesToken?.art === 'symbol' &&
    zweitesToken.norm === '§' &&
    drittesToken?.art === 'zahl'
  ) {
    teile.push(drittesToken.wert);
    praefix.push(kanonischesPraefix('paragraph'));
    j += 2;
  }
  return { teile, praefix, naechsterIndex: j };
}

export interface MehrwortKurztitel {
  kurztitel: string;
  /** Token-Index direkt NACH dem gelesenen (ggf. mehrteiligen) Kürzel (exklusiv). */
  naechsterIndex: number;
}

/**
 * Fasst ein Gesetzeskürzel-Wort mit direkt folgenden Wort-/Zahl-Token
 * zusammen (mehrteilige Kurztitel wie "SGB IV"). Der Worthandler verwendet
 * die Spanne sowohl für wartende Ziele als auch für ganze Gesetze.
 */
export function leseMehrwortKurztitel(
  tokens: Token[],
  wortToken: Token,
  wortIndex: number,
  text: string,
): MehrwortKurztitel {
  if (wortToken.bekannterKurztitel) {
    return { kurztitel: wortToken.wert, naechsterIndex: wortIndex + 1 };
  }
  let ende = wortToken.ende;
  let j = wortIndex + 1;
  let folgeToken = tokens[j];
  while (folgeToken !== undefined && (folgeToken.art === 'wort' || folgeToken.art === 'zahl')) {
    ende = folgeToken.ende;
    j++;
    folgeToken = tokens[j];
  }
  return { kurztitel: text.slice(wortToken.start, ende), naechsterIndex: j };
}

/**
 * Reihenfolge der Ebenen absatz < satz < nummer < litera (siehe ZusatzArt) –
 * jede Ebene kann strukturell nur von einer ECHT TIEFEREN Ebene präzisiert
 * werden (ein Absatz hat z.B. keinen Absatz). Für die Prüfung von
 * Verfeinerungsketten (siehe sammleVerfeinerungskette).
 */
export const VERFEINERUNGS_EBENE: Record<ZusatzArt, number> = {
  absatz: 0,
  unterabsatz: 1,
  satz: 2,
  nummer: 3,
  litera: 4,
};

/**
 * Sammelt eine direkt auf einen Komma-Kandidaten folgende Abs/S/Nr/lit-Kette
 * bis zum nächsten Komma (bzw. Textende) – z.B. für "434 Abs 1, 2 Abs 3" ab
 * dem Token nach der "2" die Kette [{art:'absatz', wert:'3'}]. Nur
 * unmittelbar aufeinanderfolgende Zusatzwort+Wert-Paare zählen; andere Token
 * dazwischen (z.B. "analog") werden übersprungen, ohne die Kette
 * abzubrechen – die Grenze bildet ausschließlich das nächste Komma
 * und begrenzt die für die Existenzprüfung relevante Präzisierung.
 */
interface VerfeinerungsSchritt {
  eintrag: { art: ZusatzArt; wert: string };
  /** Token-Index direkt NACH dem gelesenen Schritt (exklusiv). */
  naechstesI: number;
}

/**
 * Liest EINEN Verfeinerungsschritt ab Position `i` (entweder eine römische
 * Absatzzahl als Zusatz-Token selbst, oder ein Zusatzwort+Wert-Token-Paar
 * wie "Abs 3") – Teilschritt von sammleVerfeinerungskette.
 * `null` = an Position `i` steht kein gültiger Schritt
 * (weder Zusatz-Token noch passendes Wert-Token danach) – der Aufrufer rückt
 * dann selbst nur um ein Token weiter.
 */
function leseVerfeinerungsSchritt(
  tokens: Token[],
  i: number,
  t: Token,
): VerfeinerungsSchritt | null {
  // Der Aufrufer übergibt das vorhandene Token. Nur Zusatz-Token tragen
  // die unten geprüften Zusatzarten; roemischWert impliziert norm='absatz'.
  // Der Tokenizer setzt beides gemeinsam, die Canon-Klassifizierung
  // entfernt roemischWert bei einem Wechsel der Tokenart.
  if (t.roemischWert !== undefined) {
    return { eintrag: { art: 'absatz', wert: String(t.roemischWert) }, naechstesI: i + 1 };
  }

  if (
    t.norm === 'absatz' ||
    t.norm === 'unterabsatz' ||
    t.norm === 'satz' ||
    t.norm === 'nummer' ||
    t.norm === 'litera'
  ) {
    const wertToken = tokens[i + 1];
    if (wertToken && (wertToken.art === 'zahl' || wertToken.art === 'buchstabe')) {
      return { eintrag: { art: t.norm, wert: wertToken.wert }, naechstesI: i + 2 };
    }
  }
  return null;
}

export function sammleVerfeinerungskette(
  tokens: Token[],
  startIndex: number,
): Array<{ art: ZusatzArt; wert: string }> {
  const kette: Array<{ art: ZusatzArt; wert: string }> = [];
  let i = startIndex;
  while (i < tokens.length) {
    // tokenisiere erzeugt ein dichtes Array; alle Aufrufer übergeben
    // nichtnegative Folgeindizes. Jeder Schritt erhöht i um mindestens 1.
    const t = tokens[i]!;
    if (t.art === 'komma' || t.art === 'schraegstrich') break;
    const schritt = leseVerfeinerungsSchritt(tokens, i, t);
    if (schritt !== null) {
      kette.push(schritt.eintrag);
      i = schritt.naechstesI;
      continue;
    }
    i++;
  }
  return kette;
}

/**
 * "analog"/"vgl"/"sh"/"siehe" (alle SONSTIGE_WOERTER) beziehen sich, wenn
 * danach KEIN Komma steht, immer auf die DANACH kommende Norm (z.B.
 * "§ 241, analog § 280" → "analog" gehört zu § 280, nicht zu § 241; "vgl §
 * 280" ganz am Textanfang → "vgl" gehört zu § 280) – daher wird beim
 * Eröffnen einer neuen Norm der Textbereich-Start rückwärts über direkt
 * angrenzende 'sonstige'-Token gezogen. Steht davor stattdessen ein Komma
 * (z.B. "..., vgl," – bezieht sich dann auf die VORHERGEHENDE Norm), bricht
 * der Rückwärtslauf sofort ab, da tokens[j] in dem Fall kein
 * 'sonstige'-Token mehr ist – das Wort bleibt dann unverändert Teil der
 * vorherigen Norm.
 */
export function fuehrendeSonstigeVerschieben(
  tokens: Token[],
  ti: number,
  startOffset: number,
): number {
  let start = startOffset;
  let j = ti - 1;
  while (j >= 0) {
    // j liegt im dichten Tokenarray zwischen 0 und ti - 1.
    const tok = tokens[j]!;
    if (tok.art !== 'sonstige') break;
    start = tok.start;
    j--;
  }
  return start;
}

export function istZahlOderRoemischerAbsatz(tok: Token | undefined): boolean {
  // roemischWert kennzeichnet ausschließlich römische Absatz-Token;
  // die Canon-Klassifizierung entfernt ihn bei einer Umklassifizierung.
  return tok?.art === 'zahl' || tok?.roemischWert !== undefined;
}

/**
 * Scannt ab `abIndex` (direkt HINTER dem gerade verarbeiteten Zahl-/
 * Römisch-Token) innerhalb desselben §§/Artt.-Clusters – also bis zum
 * nächsten §/§§/Art./Artt.-Symbol oder ';' – nach einem weiteren
 * Komma-eingeleiteten Zahl- oder römischen Kandidaten. Siehe
 * Ablaufkommentar in zitatParser.ts: nur wenn KEIN weiterer Kandidat
 * mehr folgt, ist der aktuelle durch "§§ verlangt mindestens zwei Normen"
 * zwingend und damit ohne Prüfung sicher.
 */
export function hatWeiterenKandidatenImCluster(tokens: Token[], abIndex: number): boolean {
  for (let i = abIndex; i < tokens.length; i++) {
    // Nichtnegativer Folgeindex im dichten Tokenarray, wie bei der Kettensuche.
    const t = tokens[i]!;
    if (t.art === 'symbol' || t.art === 'semikolon') return false;
    const folge = nachTrennern(tokens, i + 1);
    if (
      (t.art === 'komma' || t.art === 'schraegstrich') &&
      istZahlOderRoemischerAbsatz(tokens[folge])
    )
      return true;
  }
  return false;
}

/** Gemeinsame Komma-Vorschau für Normgrenzen und Pluralprüfung. */
export function nachTrennern(tokens: Token[], index: number): number {
  while (tokens[index]?.art === 'komma' || tokens[index]?.art === 'schraegstrich') index++;
  return index;
}
