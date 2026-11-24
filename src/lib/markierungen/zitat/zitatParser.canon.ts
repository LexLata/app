// Positionsbezogene Canon-Klassifizierung nach der profilfreien Tokenisierung.
// Der Parser liefert die Profilabfrage; Normgrenzen lesen die klassifizierten Token.

import { familieVonText, normPraefixQuelle } from '@/lib/domain/basis/normPraefixe';
import type { Token } from '@/lib/markierungen/zitat/zitatParser.tokenizer';

const CANON_PLURAL = new RegExp(
  `^${normPraefixQuelle(
    'zitat',
    // Stryker disable next-line StringLiteral : Die einzige Variante ersetzt den Familienfilter durch "" und ergänzt andere Pluralpräfixe; zuvor ist roh bereits auf die Canon-Familie begrenzt.
    'canon',
    true,
  )}$`,
  'i',
);

function klassifiziereCanonToken(tokens: Token[], i: number, text: string): void {
  const tok = tokens[i]!;
  const roh = text.slice(tok.start, tok.ende);
  if (familieVonText(roh) === 'canon' && tokens[i + 1]?.art === 'zahl') {
    tok.art = 'symbol';
    tok.norm = CANON_PLURAL.test(roh) ? 'Cann' : 'Can';
    tok.wert = roh;
    delete tok.roemischWert;
  } else if (['n.', 'nn.'].includes(tok.wert.toLowerCase()) && tokens[i - 1]?.norm !== 'litera') {
    tok.art = 'zusatz';
    tok.norm = 'nummer';
  } else if (/^(?:and|et)\.?$/i.test(tok.wert)) {
    tok.art = 'komma';
  }
}

/** Klassifiziert die frisch tokenisierte Eingabe vor dem Normgrenzendurchlauf.
 * Gesetzeswörter/Semikola/eigenständige Symbole beenden den Absatzanker. */
export function wendeCanonKontextAn(
  tokens: Token[],
  aktiv: (position: number) => boolean,
  text: string,
): Token[] {
  // Stryker disable next-line BooleanLiteral : Die einzige Variante false → true bleibt vor dem ersten Anker ungelesen: canonNorm ist undefiniert; Symbol/Normzahl setzen normzahl vor seiner Nutzung neu.
  let normzahl = false;
  let canonNorm: boolean | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const canon = aktiv(tok.start);
    if (canon && !tok.bekannterKurztitel) klassifiziereCanonToken(tokens, i, text);
    if (tok.art === 'symbol') {
      canonNorm = verarbeiteCanonSymbol(tokens, i, canon, !!canonNorm, normzahl);
      normzahl = false;
    } else if (tok.art === 'zahl') {
      if (tokens[i - 1]?.art !== 'zusatz') {
        canonNorm ??= canon;
        normzahl = true;
      }
    } else if (tok.art === 'wort' || tok.art === 'semikolon') {
      canonNorm = undefined;
      // Stryker disable next-line BooleanLiteral : Die einzige Variante false → true bleibt nach dem Ankerreset ungelesen: canonNorm ist undefiniert; Symbol/Normzahl setzen normzahl vor seiner Nutzung neu.
      normzahl = false;
    } else if (tok.art !== 'komma' && tok.art !== 'schraegstrich' && tok.art !== 'sonstige') {
      normzahl = false;
    }
  }
  return tokens;
}

function istParagraphMitZahl(tokens: Token[], index: number): boolean {
  const norm = tokens[index]!.norm;
  return (norm === '§' || norm === '§§') && tokens[index + 1]?.art === 'zahl';
}

/** Ein echtes Normsymbol setzt den Anker neu, ein Absatzsymbol erhält ihn. */
function verarbeiteCanonSymbol(
  tokens: Token[],
  index: number,
  aktiv: boolean,
  canonNorm: boolean,
  normzahl: boolean,
): boolean {
  const tok = tokens[index]!;
  if (aktiv && canonNorm && normzahl && istParagraphMitZahl(tokens, index)) {
    tok.art = 'zusatz';
    tok.norm = 'absatz';
    return canonNorm;
  }
  return tok.norm === 'Can' || tok.norm === 'Cann';
}
