// Fachliche Eingaberegeln: docs/doku/zitatgrammatik.md.
// Reiner Zitatparser: tokenisieren, Kurztitel zuordnen, Normgrenzen
// und Mehrdeutigkeitskandidaten bilden. Außenimporte über zitat.index.ts.
// analysiereZitatZiele liefert vorläufige Canon-Kandidaten zur Zielauswahl;
// parseZitat aktiviert Canon-Grammatik nur über die Profilabfrage des Aufrufers.
// Die Gesetzeszuordnung erfolgt rückwirkend im Normgrenzendurchlauf.
// Datei-/Importzugriffe, Gesetzesauswahl und Existenzprüfung liegen beim Aufrufer.
//
// Ein Kurztitel schließt den Gesetzesabschnitt und Zusatzanker. Neue Normsymbole und
// Semikola begrenzen die Gesetzeszuordnung; bloße Zahlen im offenen Fenster
// erhalten dessen Kurztitel. Komma und Schrägstrich können nach prüfbaren
// Zusatzangaben mehrdeutige Normkandidaten erzeugen. Bei Pluralsymbolen ist
// der letzte verbleibende Kandidat im Cluster als zweite Norm zwingend.
// Zusatzangaben ohne Normbezug ergeben Einträge ohne Ziel, bloße Kurztitel
// Verweise auf ganze Gesetze (`ganzesGesetz`). Römische Zahlen
// gelten als Absatzkurzformen, außer unmittelbar nach einem Kurztitelwort.
//
// Nichtleere Zitatlisten kacheln den Eingabetext lückenlos und ohne Überlappung;
// leere Ergebnisse sind erlaubt. Textpositionen beziehen sich auf die Eingabe.
// Führende sonstige Wörter ohne folgendes Komma gehören zur folgenden Norm.
// AmbiguerPunkt verweist auf den Kandidaten und seinen früheren Zusatzanker.
// Spätere Gesetzesangaben und Folgenummern unter Gliederungsartikeln liefern
// zusätzliche Kandidaten; deren Existenz und Vorrang prüft der Aufrufer.
// Grenzen: keine Existenzprüfung und keine Intervallauflösung. Sonderzeichen
// in unbekannten Kurztiteln bleiben ungeschützt; Wörter sind Kurztitel-Kandidaten.

import type { Kurztitelbestand } from './zitatParser.kurztitel';
export type { Kurztitelbestand } from './zitatParser.kurztitel';
import type { NormPraefixFamilie } from '@/lib/domain/basis/normPraefixe';
import { tokenisiere } from '@/lib/markierungen/zitat/zitatParser.tokenizer';
import { wendeCanonKontextAn } from '@/lib/markierungen/zitat/zitatParser.canon';
export type { ZusatzArt } from '@/lib/markierungen/zitat/zitatParser.tokenizer';
import type {
  RohNormZitat,
  AmbiguerPunkt,
  ZitatParseErgebnis,
} from '@/lib/markierungen/zitat/zitatParser.types';
export type {
  RohNormZitat,
  AmbiguerPunkt,
  ZitatParseErgebnis,
} from '@/lib/markierungen/zitat/zitatParser.types';
import { erzeugeNormState } from '@/lib/markierungen/zitat/zitatParser.normzustand';
import type { NormKontext } from '@/lib/markierungen/zitat/zitatParser.normzustand';
import {
  behandleSemikolon,
  behandleSymbol,
  behandleZahl,
  behandleBuchstabe,
  behandleZusatz,
  behandleKomma,
  behandleWort,
} from '@/lib/markierungen/zitat/zitatParser.normgrenzen';

// ---------------------------------------------------------------------------
// Grenz-Erkennung
// ---------------------------------------------------------------------------

/** Dispatch nach Tokenart; Rückgabe ist der nächste zu verarbeitende Tokenindex. */
function verarbeiteToken(ctx: NormKontext, ti: number): number {
  // Der Schleifenindex liegt im dichten Tokenarray.
  const tok = ctx.tokens[ti]!;
  // Die Zahlbehandlung liest und verwirft die Satz-Kurzform-Erwartung selbst.
  // Jedes andere Token verwirft sie unmittelbar, ohne sie auszuwerten.
  if (tok.art === 'zahl') return behandleZahl(ctx, ti);
  ctx.state.satzKurzformErwartet = false;

  if (tok.art === 'semikolon') return behandleSemikolon(ctx, ti);
  if (tok.art === 'symbol') return behandleSymbol(ctx, ti);
  if (tok.art === 'buchstabe') return behandleBuchstabe(ctx, ti);
  if (tok.art === 'zusatz') return behandleZusatz(ctx, ti);
  if (tok.art === 'sonstige') return ti + 1;
  if (tok.art === 'komma' || tok.art === 'schraegstrich') return behandleKomma(ctx, ti);
  return behandleWort(ctx, ti);
}

/** Vorläufige Kandidaten, ausschließlich für Zielauswahl und Profilladen.
 * Die angenommene Canon-Grammatik ist noch keine Speicherentscheidung. */
export function analysiereZitatZiele(text: string, bestand?: Kurztitelbestand): RohNormZitat[] {
  return parseTokenZitat(
    text,
    wendeCanonKontextAn(tokenisiere(text, bestand), () => true, text),
  ).zitate;
}

export type ZitatProfilAbfrage = (
  kontext: Pick<RohNormZitat, 'gesetzRoh' | 'textStart'>,
) => NormPraefixFamilie | undefined;

export function parseZitat(
  text: string,
  profil?: ZitatProfilAbfrage,
  bestand?: Kurztitelbestand,
): ZitatParseErgebnis {
  const tokens = tokenisiere(text, bestand);
  if (!profil) return parseTokenZitat(text, tokens);
  // Canon klassifiziert Token in-place; die vorläufige Analyse erhält deshalb
  // eigene Tokenobjekte. Die vorbereitete Kurztitelsuche bleibt ein Analyselauf.
  const kandidaten = parseTokenZitat(
    text,
    wendeCanonKontextAn(
      tokens.map((token) => ({ ...token })),
      () => true,
      text,
    ),
  ).zitate;
  const anPosition = (position: number) => {
    // Die Kandidaten kacheln den Text ab 0. Für die nichtnegativen
    // Tokenpositionen ist der erste Kandidat mit einem späteren Ende zuständig;
    // sein Start folgt unmittelbar auf die bereits ausgeschlossenen Kandidaten.
    const kandidat = kandidaten.find((z) => position < z.textEnde);
    return kandidat ? profil(kandidat) : undefined;
  };
  return parseTokenZitat(
    text,
    wendeCanonKontextAn(tokens, (position) => anPosition(position) === 'canon', text),
  );
}

function parseTokenZitat(text: string, tokens: ReturnType<typeof tokenisiere>): ZitatParseErgebnis {
  const zitate: RohNormZitat[] = [];
  const ambiguitaeten: AmbiguerPunkt[] = [];
  const ctx: NormKontext = { text, tokens, zitate, ambiguitaeten, state: erzeugeNormState() };

  let ti = 0;
  while (ti < tokens.length) {
    ti = verarbeiteToken(ctx, ti);
  }

  // Vor der Textkachelung prüfen: ein führendes Semikolon liegt vor der
  // ersten Norm und begrenzt deren spätere Gesetzesangabe nicht.
  ergaenzeSpaetereGesetzesangaben(zitate, tokens);

  // Dokumentierte Invariante (siehe RohNormZitat.textStart/textEnde): der
  // erste Eintrag beginnt immer bei 0 – jeder führende Text VOR der
  // erkannten ersten Norm (z.B. unbekannte/nicht klassifizierte Wörter,
  // überzählige Leerzeichen) gehört damit textlich zum ersten Zitat, statt
  // in einer nirgends erfassten und damit bei der Anzeige (siehe
  // VerweisAnzeige in textBlatt.tsx, die NUR die erfassten
  // Bereiche rendert) stillschweigend verschwindenden Lücke zu landen.
  if (zitate.length > 0) zitate[0]!.textStart = 0; // beweisbar sicher durch length > 0

  return { zitate, ambiguitaeten };
}

/** Rückwärts nur bis zur nächsten Gesetzesangabe; Semikola begrenzen die
 * Ausnahme unabhängig vom offenen Gesetzesabschnitt der Normgrenzenhandler. */
function ergaenzeSpaetereGesetzesangaben(
  zitate: RohNormZitat[],
  tokens: ReturnType<typeof tokenisiere>,
): void {
  let spaetere: RohNormZitat['spaetereGesetzesangabe'];
  let tokenIndex = tokens.length - 1;
  for (let index = zitate.length - 1; index >= 0; index--) {
    const zitat = zitate[index]!;
    while (tokenIndex >= 0 && tokens[tokenIndex]!.start >= zitat.textStart) {
      if (tokens[tokenIndex]!.art === 'semikolon') spaetere = undefined;
      tokenIndex--;
    }
    if (zitat.gesetzRoh !== undefined) {
      spaetere = { gesetzRoh: zitat.gesetzRoh, textStart: zitat.textStart };
    } else if (spaetere && !zitat.ohneZiel) {
      zitat.spaetereGesetzesangabe = spaetere;
    }
  }
}
