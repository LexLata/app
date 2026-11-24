// formexParser.ts
// Reiner Formex-Kernparser für Artikel, Gliederungen und Erwägungsgründe.
import { normalisiereWS } from '@/lib/utils/leerraum';
import { GliederungskennzahlVergabe } from '@/lib/domain/gliederungskennzahl';
import { type GesammelteNorm, type ImpAbsatz } from '@/lib/import/basis/basis.index';
import { sinnvolleGrossKleinschreibung } from './euGemeinsam';
import { formexInlineText, leseFormexElemente } from './formexText';

function kind(element: Element, name: string): Element | undefined {
  return Array.from(element.children).find((e) => e.tagName === name);
}
function text(element: Element | undefined): string {
  return element ? normalisiereWS(formexInlineText(element)) : '';
}
function norm(absaetze: ImpAbsatz[], normBezeichnung: string): GesammelteNorm {
  return {
    type: 'paragraph',
    bez: '',
    ebene: 0,
    gliederungskennzahl: '',
    normBezeichnung,
    absaetze,
  };
}
function absatz(alineas: Element[], nummer?: string): ImpAbsatz {
  return {
    nummer,
    elemente: alineas.flatMap((alinea, index) => [
      ...(index > 0 ? [{ type: 'unterabsatz' as const }] : []),
      ...leseFormexElemente(alinea),
    ]),
  };
}
function artikel(element: Element): GesammelteNorm {
  const absaetze: ImpAbsatz[] = [];
  let direkteAlineas: Element[] = [];
  const abschliessen = () => {
    if (direkteAlineas.length) absaetze.push(absatz(direkteAlineas));
    direkteAlineas = [];
  };
  const teileLesen = (container: Element) => {
    for (const teil of Array.from(container.children)) {
      if (teil.tagName === 'TI.ART' || teil.tagName === 'STI.ART') continue;
      if (teil.tagName === 'PARAG') {
        abschliessen();
        const alineas = Array.from(teil.children).filter((e) => e.tagName !== 'NO.PARAG');
        absaetze.push(absatz(alineas, text(kind(teil, 'NO.PARAG')) || undefined));
      } else if (teil.tagName === 'SUBDIV') {
        abschliessen();
        absaetze.push({
          zwischenueberschrift: true,
          elemente: [{ type: 'texte', saetze: [text(kind(teil, 'TITLE'))] }],
        });
        teileLesen(teil);
      } else if (teil.tagName !== 'TITLE') direkteAlineas.push(teil);
    }
  };
  teileLesen(element);
  abschliessen();
  const titel = text(kind(element, 'STI.ART'));
  const istVorgaenger = titel.startsWith('(ex-');
  return {
    ...norm(absaetze, text(kind(element, 'TI.ART'))),
    titel: istVorgaenger ? undefined : titel || undefined,
    vorgaenger: istVorgaenger ? titel.slice(4).replace(/\)+$/, '').trim() : undefined,
  };
}

/** Liest nur die einfachen Präambelabsätze neben dem gewählten Haupttext. */
function lesePraeambel(haupttext: Element): GesammelteNorm[] {
  if (!['CONS.OTH', 'GENERAL'].includes(haupttext.ownerDocument.documentElement.tagName)) return [];
  const parent = haupttext.parentElement;
  const praambel = parent && (kind(parent, 'PREAMBLE') ?? kind(parent, 'PREAMBLE.GEN'));
  if (!praambel) return [];
  const absaetze: ImpAbsatz[] = [];
  const lesen = (container: Element) => {
    for (const teil of Array.from(container.children)) {
      if (teil.tagName === 'PREAMBLE.INIT') lesen(teil);
      else if (teil.tagName === 'P') {
        const inhalt = text(teil);
        if (inhalt && inhalt !== 'PRÄAMBEL')
          absaetze.push({
            absatzgrenzeErhalten: true,
            elemente: leseFormexElemente(teil),
          });
      }
    }
  };
  lesen(praambel);
  return absaetze.length ? [norm(absaetze, 'Präambel')] : [];
}

export function leseErwaegungsgruende(doc: Document): GesammelteNorm[] {
  const haupttext = Array.from(doc.getElementsByTagName('ENACTING.TERMS')).find(
    (e) => e.getElementsByTagName('ARTICLE').length,
  );
  const praambel = haupttext?.parentElement && kind(haupttext.parentElement, 'PREAMBLE');
  const gruende = Array.from(praambel?.getElementsByTagName('CONSID') ?? []);
  if (!gruende.length) return [];
  return [
    {
      type: 'gliederung',
      bez: 'Erwägungsgründe',
      ebene: 1,
      gliederungskennzahl: '000',
      absaetze: [],
    },
    ...gruende.map((grund) => {
      const np = kind(grund, 'NP') ?? grund;
      const zahl = text(kind(np, 'NO.P')).replace(/\D/g, '');
      return {
        ...norm([{ elemente: leseFormexElemente(np, new Set(['NO.P'])) }], `E${zahl}`),
        istErwaegungsgrund: true,
      };
    }),
  ];
}

export function parseFormex(xml: string): GesammelteNorm[] | { fehler: string } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { fehler: 'Ungültiges Formex-XML.' };
  const haupttext = Array.from(doc.getElementsByTagName('ENACTING.TERMS')).find(
    (e) => e.getElementsByTagName('ARTICLE').length,
  );
  if (!haupttext) return { fehler: 'Keine Artikel im Formex-Haupttext gefunden.' };
  const normen = [...lesePraeambel(haupttext), ...leseErwaegungsgruende(doc)];
  const vergabe = new GliederungskennzahlVergabe();
  const durchlaufen = (element: Element, ebene: number) => {
    for (const teil of Array.from(element.children)) {
      if (teil.tagName === 'ARTICLE') normen.push(artikel(teil));
      else if (teil.tagName === 'DIVISION') {
        const title = kind(teil, 'TITLE');
        const ti = title && kind(title, 'TI');
        const sti = title && kind(title, 'STI');
        const zeilen = Array.from(ti?.children ?? []).filter((e) => e.tagName === 'P');
        const titel = [
          ...zeilen.slice(1),
          ...Array.from(sti?.children ?? []).filter((e) => e.tagName === 'P'),
        ]
          .map((e) => text(e))
          .join(' ');
        normen.push({
          type: 'gliederung',
          bez: text(zeilen[0]),
          titel: sinnvolleGrossKleinschreibung(titel),
          ebene,
          gliederungskennzahl: vergabe.vergib(ebene),
          absaetze: [],
        });
        durchlaufen(teil, ebene + 1);
      }
    }
  };
  durchlaufen(haupttext, 1);
  return normen;
}
