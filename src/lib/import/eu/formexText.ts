// formexText.ts
// Übernimmt Formex-Text und Listen in Dokumentreihenfolge; Fußnoten bleiben außerhalb des Rechtstexts.
import { normalisiereWS } from '@/lib/utils/leerraum';
import { tokenize, type ImpElement, type ImpEintrag } from '@/lib/import/basis/basis.index';

export function formexInlineText(knoten: Node): string {
  if (knoten.nodeType === 3) return knoten.textContent ?? '';
  if (knoten.nodeName === 'NOTE') return '';
  if (knoten.nodeName === 'QUOT.START' || knoten.nodeName === 'QUOT.END') {
    const code = Number.parseInt((knoten as Element).getAttribute('CODE') ?? '', 16);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }
  return Array.from(knoten.childNodes).map(formexInlineText).join('');
}

function leseEintrag(item: Element): ImpEintrag {
  const np = Array.from(item.children).find((e) => e.tagName === 'NP');
  const nummer = np && Array.from(np.children).find((e) => e.tagName === 'NO.P');
  const elemente = leseFormexElemente(np ?? item, new Set(['NO.P']));
  const eintrag: ImpEintrag = {
    bezeichnung: nummer ? normalisiereWS(formexInlineText(nummer)) : '-',
    texteVor: [],
    untereintraege: [],
    unterlistenTyp: 'other',
    texteNach: [],
  };
  let nachListe = false;
  for (const element of elemente) {
    if (element.type === 'liste') {
      eintrag.untereintraege.push(...element.eintraege);
      nachListe = true;
    } else if (element.type === 'texte') {
      (nachListe ? eintrag.texteNach : eintrag.texteVor).push(...element.saetze);
    }
  }
  return eintrag;
}

export function leseFormexElemente(wurzel: Element, ignoriert = new Set<string>()): ImpElement[] {
  const ergebnis: ImpElement[] = [];
  let text = '';
  const abschliessen = () => {
    const normalisiert = normalisiereWS(text);
    if (normalisiert) ergebnis.push({ type: 'texte', saetze: tokenize(normalisiert) });
    text = '';
  };
  const besuche = (knoten: Node) => {
    if (ignoriert.has(knoten.nodeName) || knoten.nodeName === 'NOTE') return;
    if (knoten.nodeName === 'LIST') {
      abschliessen();
      ergebnis.push({
        type: 'liste',
        eintraege: Array.from((knoten as Element).children)
          .filter((e) => e.tagName === 'ITEM')
          .map(leseEintrag),
      });
    } else if (knoten.nodeType === 3 || ['QUOT.START', 'QUOT.END'].includes(knoten.nodeName)) {
      text += formexInlineText(knoten);
    } else {
      const block = ['P', 'ALINEA', 'PARAG'].includes(knoten.nodeName);
      if (block) text += ' ';
      for (const kind of Array.from(knoten.childNodes)) besuche(kind);
      if (block) text += ' ';
    }
  };
  for (const kind of Array.from(wurzel.childNodes)) besuche(kind);
  abschliessen();
  return ergebnis;
}
