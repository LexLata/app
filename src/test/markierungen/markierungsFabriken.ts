// Erzeugt vollständige Markierungsfälle für Verhaltenstests; fachliche Pflichtangaben erhalten passende Standardwerte.

import type {
  MarkierungsEintrag,
  MarkierungsTyp,
  VerweisInhalt,
} from '@/lib/markierungen/markierungen.index';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import { normAusgangsstelle } from './ausgangsstelleFabrik';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';

type Bezugstext = Extract<MarkierungsEintrag['bezug'], { typ: 'bezugstext' }>;
type Pauschal = Extract<MarkierungsEintrag['bezug'], { typ: 'pauschal' }>;
type Elementstand = Pauschal['elementstand'];

type Angaben = {
  typ?: MarkierungsTyp;
  ausgangsstelle?: Ausgangsstelle;
  bezug?: Bezugstext | Pauschal;
  kommentarText?: string;
  verweisinhalt?: VerweisInhalt;
  textstelle?: Textstelle;
  bezugstext?: string;
  elementstand?: Elementstand;
};

/** Ein vollständiger Textbezug, dessen Angaben gezielt überschrieben werden können. */
export function bezugstext(angaben: Partial<Omit<Bezugstext, 'typ'>> = {}): Bezugstext {
  return {
    typ: 'bezugstext',
    textstelle: {
      pfad: normtextPfad({ absatz: '(1)' }),
      zeichenbereichStart: 0,
      zeichenbereichEnde: 5,
    },
    bezugstext: 'Text',
    ...angaben,
  };
}

/** Pauschaler Bezug mit bewusstem Vergleichsstand. */
export function pauschal(elementstand = { textlaenge: 0 }): Pauschal {
  return { typ: 'pauschal', elementstand };
}

/** Gemeinsamer Dispatcher für Tests, die denselben Ablauf für mehrere Markierungstypen prüfen. */
export function markierungsEintrag<T extends MarkierungsTyp>(
  angaben: Angaben & { typ: T },
): Extract<MarkierungsEintrag, { typ: T }>;
export function markierungsEintrag(angaben?: Angaben): MarkierungsEintrag;
export function markierungsEintrag(angaben: Angaben = {}): MarkierungsEintrag {
  const basis = {
    ausgangsstelle: angaben.ausgangsstelle ?? normAusgangsstelle('§ 1'),
  };
  const bezug = angaben.textstelle
    ? bezugstext({ textstelle: angaben.textstelle, bezugstext: angaben.bezugstext ?? '' })
    : angaben.elementstand
      ? { typ: 'pauschal' as const, elementstand: angaben.elementstand }
      : (angaben.bezug ??
        (angaben.typ === 'kommentar' || angaben.typ === 'verweismarkierung'
          ? pauschal()
          : bezugstext()));
  switch (angaben.typ ?? 'unterstreichung') {
    case 'unterstreichung':
      if (bezug.typ !== 'bezugstext') throw new Error('Unterstreichung benötigt Bezugstext.');
      return { ...basis, typ: 'unterstreichung', bezug };
    case 'hervorhebung':
      if (bezug.typ !== 'bezugstext') throw new Error('Hervorhebung benötigt Bezugstext.');
      return { ...basis, typ: 'hervorhebung', bezug };
    case 'kommentar':
      return { ...basis, typ: 'kommentar', bezug, kommentarText: angaben.kommentarText ?? '' };
    case 'verweismarkierung':
      return {
        ...basis,
        typ: 'verweismarkierung',
        bezug,
        verweisinhalt: angaben.verweisinhalt ?? { verweistext: '', verweisziele: [] },
      };
  }
}

/** Unterstreichung mit vollständigem Textbezug. */
export function unterstreichung(
  angaben: Omit<Angaben, 'typ' | 'bezug' | 'kommentarText' | 'verweisinhalt'> & {
    bezug?: Bezugstext;
  } = {},
): Extract<MarkierungsEintrag, { typ: 'unterstreichung' }> {
  return markierungsEintrag({ ...angaben, typ: 'unterstreichung' });
}

/** Hervorhebung mit vollständigem Textbezug. */
export function hervorhebung(
  angaben: Parameters<typeof unterstreichung>[0] = {},
): Extract<MarkierungsEintrag, { typ: 'hervorhebung' }> {
  return markierungsEintrag({ ...angaben, typ: 'hervorhebung' });
}

/** Kommentar mit Textbezug oder pauschalem Bezug. */
export function kommentar(
  angaben: Omit<Angaben, 'typ' | 'verweisinhalt'> = {},
): Extract<MarkierungsEintrag, { typ: 'kommentar' }> {
  return markierungsEintrag({ ...angaben, typ: 'kommentar' });
}

/** Verweismarkierung mit Textbezug oder pauschalem Bezug. */
export function verweismarkierung(
  angaben: Omit<Angaben, 'typ' | 'kommentarText'> = {},
): Extract<MarkierungsEintrag, { typ: 'verweismarkierung' }> {
  return markierungsEintrag({ ...angaben, typ: 'verweismarkierung' });
}
