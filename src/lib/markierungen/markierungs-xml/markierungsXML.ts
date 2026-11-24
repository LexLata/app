// markierungsXML.ts
//
// Reine Serialisierung und Parsing von MarkierungsXML, ohne Datei-I/O und
// ohne Modulzustand. Teil des Submoduls markierungs-xml (Interface und
// Formatverweis: markierungs-xml.index.ts); Speicherung und Historie liegen in
// lib/markierungen/eintrag, die Typen in lib/markierungen/gemeinsam.

import { vergleicheMarkierungsposition } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { parseTextpfad, XML_BEREICH } from './markierungsXML.textpfad';
import { leseZeitstempel, baueZeitstempel } from './markierungsXML.zeitstempel';

import {
  istGleichesGesetz,
  liesPflichtNormgeber,
  UngueltigerNormgeberFehler,
} from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  escapeXML,
  isoZeitstempel,
  liesXmlWurzel,
  optionaleXmlAttribut,
  xmlKind,
  xmlKinder,
  xmlText,
} from '@/lib/utils/xmlVerarbeitung';
import type {
  MarkierungsEintrag,
  MarkierungsTyp,
  VerweisInhalt,
  Verweisziel,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { parseElementstand } from './markierungsXML.elementstand';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import { istErwaegungsgrundBezeichnung } from '@/lib/domain/norm/norm.index';
import { istGueltigeGliederungskennzahl } from '@/lib/domain/gliederungskennzahl';

/** Schreibt eine volle Normbezeichnung ohne Zusatzattribute. */
function bezeichnungTag(bezeichnung: string): string {
  return `<bezeichnung>${escapeXML(bezeichnung)}</bezeichnung>`;
}

/** Gemeinsamer Ausgangsstellenvertrag für Markierungen und Konfliktspiegel. */
export function ausgangsstelleTag(e: Pick<MarkierungsEintrag, 'ausgangsstelle'>): string {
  return e.ausgangsstelle.typ === 'ueberschrift'
    ? `<gliederungskennzahl>${escapeXML(bezeichnungAusgangsstelle(e.ausgangsstelle))}</gliederungskennzahl>`
    : bezeichnungTag(bezeichnungAusgangsstelle(e.ausgangsstelle));
}

/** Genau eine Kennung; fehlerhafte Überschriften werden niemals als Norm gelesen. */
export function liesAusgangsstelle(
  block: Element,
): Pick<MarkierungsEintrag, 'ausgangsstelle'> | undefined {
  const normen = xmlKinder(block, 'bezeichnung');
  const ueberschriften = xmlKinder(block, 'gliederungskennzahl');
  if (normen.length + ueberschriften.length !== 1) return undefined;
  if (ueberschriften.length === 1) {
    const el = ueberschriften[0]!;
    const gliederungskennzahl = el.textContent ?? '';
    if (el.hasAttribute('praefix') || !istGueltigeGliederungskennzahl(gliederungskennzahl))
      return undefined;
    return { ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl } };
  }
  const el = normen[0]!;
  const bezeichnung = (el.textContent ?? '').trim();
  if (!bezeichnung) return undefined;
  if (el.hasAttribute('praefix')) return undefined;
  return {
    ausgangsstelle: {
      typ: istErwaegungsgrundBezeichnung(bezeichnung) ? 'erwaegungsgrund' : 'norm',
      bezeichnung,
    },
  };
}

// Interner Typ und XML-Tag verwenden dieselben deutschen Formatwerte.
// Exportiert für markierungskonflikteXML.ts: EINE Quelle für die Tags der
// Markierungsarten, die auch markierungskonflikte.xml als Elementnamen verwendet.
export const TAG_VON_TYP: Record<
  MarkierungsTyp,
  'unterstreichung' | 'hervorhebung' | 'verweismarkierung' | 'kommentar'
> = {
  unterstreichung: 'unterstreichung',
  hervorhebung: 'hervorhebung',
  verweismarkierung: 'verweismarkierung',
  kommentar: 'kommentar',
};

/** Liest die beiden Bereichsattribute unabhängig von Reihenfolge und Leerraum. */
export function liesZeichenbereich(
  block: Element | undefined,
  tag: 'zeichenbereich' | 'verweistextZeichenbereich',
): [string, string, string] | null {
  if (xmlKinder(block, tag).length !== 1) return null;
  const element = xmlKind(block, tag);
  const start = element?.getAttribute('start');
  const ende = element?.getAttribute('ende');
  if (!start || !ende || !/^\d+$/.test(start) || !/^\d+$/.test(ende)) return null;
  if (
    !Number.isSafeInteger(Number(start)) ||
    !Number.isSafeInteger(Number(ende)) ||
    Number(start) > Number(ende)
  )
    return null;
  return [tag, start, ende];
}

// textstelle-Zeilen (absatz/eintraege/satzInEintrag/bereich/zeichenbereich) – identisch für
// unterstreichung/hervorhebung (immer) und verweis MIT Textbezug (siehe baueBlock).
// Exportiert für markierungskonflikteSpeicher.ts – dieselbe Serialisierung (Reihenfolge,
// Escaping) wird beim Speichern EINER konkreten Markierung als Identifikation
// in markierungskonflikte.xml wiederverwendet, statt sie dort ein zweites Mal
// (potenziell abweichend) nachzubauen.
export function bauTextstelleZeilen(textstelle: Textstelle): string {
  const e = textstelle.pfad;
  // Wiederholung gehört unmittelbar zum jeweiligen Schritt der Eintrags-Kette.
  const eintraegeZeilen = (e.eintraege ?? []).map(
    (schritt) =>
      `                <${schritt.ebene}${schritt.wiederholung ? ` wiederholung="${schritt.wiederholung}"` : ''}>${escapeXML(schritt.bezeichnung)}</${schritt.ebene}>`,
  );

  return [
    (e.absatz !== undefined || e.absatzWiederholung) &&
      `                <absatz${e.absatzWiederholung ? ` wiederholung="${e.absatzWiederholung}"` : ''}${e.absatz !== undefined ? `>${escapeXML(e.absatz)}</absatz>` : '/>'}`,
    e.unterabsatz !== undefined &&
      `                <unterabsatz>${escapeXML(e.unterabsatz)}</unterabsatz>`,
    // Äußerer Satz (enthält ggf. eine Aufzählung) steht VOR der Eintrags-Kette.
    e.satz !== undefined && `                <satz>${e.satz}</satz>`,
    ...eintraegeZeilen,
    // Innerer Satz (innerhalb eines Aufzählungseintrags, z.B. "Nr. 1 Satz 2")
    // steht NACH der Eintrags-Kette – gleicher Tag-Name wie satz, Position
    // kodiert die Rolle.
    e.satzInEintrag !== undefined && `                <satz>${e.satzInEintrag}</satz>`,
    e.bereich && `                <bereich>${XML_BEREICH[e.bereich]}</bereich>`,
    `                <zeichenbereich start="${textstelle.zeichenbereichStart}" ende="${textstelle.zeichenbereichEnde}"/>`,
  ]
    .filter((z): z is string => Boolean(z))
    .join('\n');
}

/** Schreibt genau einen der beiden vollständigen Bezug-Fälle. */
function baueBezug(e: MarkierungsEintrag): string[] {
  switch (e.bezug.typ) {
    case 'bezugstext':
      return [
        '            <textstelle>',
        bauTextstelleZeilen(e.bezug.textstelle),
        '            </textstelle>',
        `            <bezugstext>${escapeXML(e.bezug.bezugstext)}</bezugstext>`,
      ];
    case 'pauschal': {
      const a = e.bezug.elementstand;
      return [
        '            <elementstand>',
        ...(a.titel !== undefined ? [`                <titel>${escapeXML(a.titel)}</titel>`] : []),
        `                <textlaenge>${a.textlaenge}</textlaenge>`,
        '            </elementstand>',
      ];
    }
  }
}

/** Zielnorm, bewusst unverknüpfte Zielnorm und ganzes Gesetz haben eigene Angaben. */
function baueVerweisziel(z: Verweisziel): string[] {
  const zeilen = ['                <verweisziel>'];
  if (z.gesetz)
    zeilen.push(
      `                    <gesetz normgeber="${escapeXML(z.gesetz.normgeber)}">${escapeXML(z.gesetz.kurztitel)}</gesetz>`,
    );
  switch (z.typ) {
    case 'zielnorm':
    case 'zielnormOhneElementstand':
      zeilen.push(`                    ${bezeichnungTag(z.bezeichnung)}`);
      break;
    case 'ganzesGesetz':
      break;
  }
  zeilen.push(
    `                    <verweistextZeichenbereich start="${z.verweistextZeichenbereich[0]}" ende="${z.verweistextZeichenbereich[1]}"/>`,
  );
  if (z.typ === 'zielnorm') {
    zeilen.push('                    <elementstand>');
    if (z.elementstand.titel !== undefined)
      zeilen.push(`                        <titel>${escapeXML(z.elementstand.titel)}</titel>`);
    zeilen.push(
      `                        <textlaenge>${z.elementstand.textlaenge}</textlaenge>`,
      '                    </elementstand>',
    );
  }
  return [...zeilen, '                </verweisziel>'];
}

/** Alle Markierungstypen werden ausdrücklich und vollständig geschrieben. */
function baueBlock(e: MarkierungsEintrag): string {
  const tag = TAG_VON_TYP[e.typ];
  const zeilen = [`        <${tag}>`, `            ${ausgangsstelleTag(e)}`, ...baueBezug(e)];
  switch (e.typ) {
    case 'unterstreichung':
    case 'hervorhebung':
      break;
    case 'kommentar':
      zeilen.push(`            <kommentartext>${escapeXML(e.kommentarText)}</kommentartext>`);
      break;
    case 'verweismarkierung':
      zeilen.push(
        '            <verweisinhalt>',
        `                <verweistext>${escapeXML(e.verweisinhalt.verweistext)}</verweistext>`,
        ...e.verweisinhalt.verweisziele.flatMap(baueVerweisziel),
        '            </verweisinhalt>',
      );
      break;
  }
  zeilen.push(...baueZeitstempel(e));
  return [...zeilen, `        </${tag}>`].join('\n');
}

/** Baut das vollständige XML-Dokument für alle Einträge eines Gesetzes. */
export function baueXML(
  gesetz: Gesetzesreferenz,
  eintraege: MarkierungsEintrag[],
  verarbeitungszeit = new Date(),
): string {
  const bloecke = [...eintraege]
    .sort((a, b) =>
      vergleicheMarkierungsposition(
        { ausgangsstelle: a.ausgangsstelle, textstelle: a.bezug.textstelle },
        { ausgangsstelle: b.ausgangsstelle, textstelle: b.bezug.textstelle },
      ),
    )
    .map(baueBlock)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<markierungen version="1">',
    '    <infos>',
    `        <gesetz${optionaleXmlAttribut('normgeber', gesetz.normgeber)}>${escapeXML(gesetz.kurztitel)}</gesetz>`,
    `        <verarbeitungszeit>${isoZeitstempel(verarbeitungszeit)}</verarbeitungszeit>`,
    '    </infos>',
    '    <inhalt>',
    bloecke,
    '    </inhalt>',
    '</markierungen>',
  ].join('\n');
}

function parseEinzelnesVerweisziel(block: Element): Verweisziel | undefined {
  if (xmlKinder(block, 'bezeichnung').length > 1 || xmlKinder(block, 'gesetz').length > 1)
    return undefined;
  const zeichenbereich = liesZeichenbereich(block, 'verweistextZeichenbereich');
  if (!zeichenbereich) return undefined;
  const bezeichnung = xmlKind(block, 'bezeichnung');
  const gesetzText = xmlText(block, 'gesetz');
  const gesetz =
    gesetzText === undefined
      ? undefined
      : {
          kurztitel: gesetzText.trim(),
          normgeber: liesPflichtNormgeber(
            xmlKind(block, 'gesetz')?.getAttribute('normgeber') ?? undefined,
          ),
        };
  if ((gesetz && !gesetz.kurztitel) || (bezeichnung && !bezeichnung.textContent?.trim()))
    return undefined;
  const verweistextZeichenbereich: [number, number] = [
    Number(zeichenbereich[1]),
    Number(zeichenbereich[2]),
  ];
  if (!bezeichnung)
    return gesetz ? { typ: 'ganzesGesetz', gesetz, verweistextZeichenbereich } : undefined;
  if (bezeichnung.hasAttribute('praefix')) return undefined;
  const kennung = {
    gesetz,
    bezeichnung: bezeichnung.textContent?.trim() ?? '',
    verweistextZeichenbereich,
  };
  const elementstand = parseElementstand(block);
  if (!elementstand) return { typ: 'zielnormOhneElementstand', ...kennung };
  return { typ: 'zielnorm', ...kennung, elementstand };
}

function parseVerweisinhalt(block: Element): VerweisInhalt | undefined {
  const inhalt = xmlKind(block, 'verweisinhalt');
  const verweistext = xmlText(inhalt, 'verweistext');
  if (verweistext === undefined) return undefined;
  const verweisziele = xmlKinder(inhalt, 'verweisziel')
    .map(parseEinzelnesVerweisziel)
    .filter((z): z is Verweisziel => z !== undefined);
  return { verweistext, verweisziele };
}

/** Kein altes Format und kein unbemerktes Verwerfen einzelner Ziele. */
function pruefeVerweisziele(block: Element): boolean {
  const inhalt = xmlKind(block, 'verweisinhalt');
  if (xmlKinder(inhalt, 'verweistext').length !== 1 || xmlKinder(inhalt, 'zielnorm').length > 0)
    return false;
  const text = xmlText(inhalt, 'verweistext') ?? '';
  const bereiche: [number, number][] = [];
  for (const ziel of xmlKinder(inhalt, 'verweisziel')) {
    if (ziel.hasAttribute('ohneZiel') || xmlKinder(ziel, 'normstand').length > 0) return false;
    if (
      xmlKinder(ziel, 'elementstand').length > 0 &&
      (!parseElementstand(ziel) || !xmlKind(ziel, 'bezeichnung'))
    )
      return false;
    const parsed = parseEinzelnesVerweisziel(ziel);
    if (!parsed) return false;
    const [start, ende] = parsed.verweistextZeichenbereich;
    if (start >= ende || ende > text.length) return false;
    if (bereiche.some(([s, e]) => start < e && s < ende)) return false;
    bereiche.push([start, ende]);
  }
  return true;
}

export const TYP_VON_TAG: Record<string, MarkierungsTyp> = {
  unterstreichung: 'unterstreichung',
  hervorhebung: 'hervorhebung',
  verweismarkierung: 'verweismarkierung',
  kommentar: 'kommentar',
};

export type MarkierungsBefund = {
  fall:
    | 'ausgangsstelleFehlt'
    | 'ausgangsstelleMehrfach'
    | 'ausgangsstelleUngueltig'
    | 'textbezugUngueltig'
    | 'textpfadUngueltig'
    | 'verweisinhaltFehlt'
    | 'normgeberFehlt'
    | 'verweiszielUngueltig'
    | 'elementstandUngueltig'
    | 'kommentarTextFehlt'
    | 'markierungsinhaltUngueltig';
  typ: MarkierungsTyp;
  ort?: string;
};

/** Liest ausschließlich Einträge direkt im Inhalt der Markierungsdatei. */
export function parseEintraege(
  xml: string,
  gesetz?: Gesetzesreferenz,
): { eintraege: MarkierungsEintrag[]; befunde: MarkierungsBefund[] } {
  if (xml === '') return { eintraege: [], befunde: [] };
  const wurzel = liesXmlWurzel(xml, 'markierungen');
  const el = xmlKind(xmlKind(wurzel, 'infos'), 'gesetz');
  const normgeberFehlt = !el?.hasAttribute('normgeber');
  const referenz = normgeberFehlt
    ? undefined
    : {
        kurztitel: el?.textContent?.trim() ?? '',
        normgeber: liesPflichtNormgeber(el?.getAttribute('normgeber') ?? undefined),
      };
  if (gesetz && referenz && !istGleichesGesetz(referenz, gesetz))
    throw new Error(
      `Die Markierungsdatei ist einem anderen Gesetz zugeordnet. Erwartet: ${gesetz.kurztitel} (${gesetz.normgeber}); enthalten: ${referenz.kurztitel} (${referenz.normgeber}).`,
    );
  const inhalt = xmlKind(wurzel, 'inhalt');
  const ergebnis: MarkierungsEintrag[] = [];
  const befunde: MarkierungsBefund[] = [];
  for (const block of Array.from(inhalt?.children ?? [])) {
    const typ = Object.hasOwn(TYP_VON_TAG, block.tagName) ? TYP_VON_TAG[block.tagName] : undefined;
    if (!typ) continue;
    const gelesen = liesGeprueftenEintrag(typ, block, normgeberFehlt);
    if (gelesen.eintrag) ergebnis.push(gelesen.eintrag);
    if (gelesen.fall)
      befunde.push({
        fall: gelesen.fall,
        typ,
        ort: xmlText(block, 'bezeichnung') ?? xmlText(block, 'gliederungskennzahl'),
      });
  }
  return { eintraege: ergebnis, befunde };
}

/** Einzelne fehlerhafte Verweisziele beschädigen keine lesbaren Nachbareinträge. */
function liesGeprueftenEintrag(
  typ: MarkierungsTyp,
  block: Element,
  normgeberFehlt: boolean,
): { eintrag?: MarkierungsEintrag; fall?: MarkierungsBefund['fall'] } {
  const zielOhneNormgeber = xmlKinder(xmlKind(block, 'verweisinhalt'), 'verweisziel').some((ziel) =>
    xmlKinder(ziel, 'gesetz').some((gesetz) => !gesetz.hasAttribute('normgeber')),
  );
  try {
    const fall = normgeberFehlt || zielOhneNormgeber ? 'normgeberFehlt' : pruefeEintrag(typ, block);
    if (fall) return { fall };
    const eintrag = parseEinenEintrag(typ, block);
    return { eintrag: eintrag ? leseZeitstempel(eintrag, block) : undefined };
  } catch (fehler) {
    if (!(fehler instanceof UngueltigerNormgeberFehler)) throw fehler;
    return { fall: 'verweiszielUngueltig' };
  }
}

/** Prüft nur die bereits geltenden Fälle; weitere Formatregeln folgen phasenweise. */
function pruefeEintrag(typ: MarkierungsTyp, block: Element): MarkierungsBefund['fall'] | undefined {
  const anzahl =
    xmlKinder(block, 'bezeichnung').length + xmlKinder(block, 'gliederungskennzahl').length;
  if (anzahl === 0) return 'ausgangsstelleFehlt';
  if (anzahl !== 1) return 'ausgangsstelleMehrfach';
  if (!liesAusgangsstelle(block)) return 'ausgangsstelleUngueltig';
  const textstelle = xmlKind(block, 'textstelle');
  const bezugstext = xmlText(block, 'bezugstext');
  const brauchtTextbezug =
    typ === 'unterstreichung' ||
    typ === 'hervorhebung' ||
    textstelle !== undefined ||
    bezugstext !== undefined;
  if (
    brauchtTextbezug &&
    (!textstelle || !liesZeichenbereich(textstelle, 'zeichenbereich') || bezugstext === undefined)
  )
    return 'textbezugUngueltig';
  if (textstelle && !parseTextpfad(textstelle)) return 'textpfadUngueltig';
  if (xmlKinder(block, 'normstand').length > 0) return 'elementstandUngueltig';
  const hatStand = xmlKinder(block, 'elementstand').length > 0;
  if (brauchtTextbezug ? hatStand : !parseElementstand(block)) return 'elementstandUngueltig';
  return pruefeMarkierungsinhalt(typ, block);
}

/** Prüft Pflichtinhalt, Mehrfachangaben und für den Markierungstyp verbotene Inhalte. */
function pruefeMarkierungsinhalt(
  typ: MarkierungsTyp,
  block: Element,
): MarkierungsBefund['fall'] | undefined {
  if (typ === 'verweismarkierung' && !parseVerweisinhalt(block)) return 'verweisinhaltFehlt';
  if (typ === 'verweismarkierung' && !pruefeVerweisziele(block)) return 'verweiszielUngueltig';
  if (typ === 'kommentar' && xmlText(block, 'kommentartext') === undefined)
    return 'kommentarTextFehlt';
  if (
    ['textstelle', 'bezugstext', 'kommentartext', 'verweisinhalt'].some(
      (tag) => xmlKinder(block, tag).length > 1,
    )
  )
    return 'markierungsinhaltUngueltig';
  if (
    (typ !== 'kommentar' && xmlKinder(block, 'kommentartext').length > 0) ||
    (typ !== 'verweismarkierung' && xmlKinder(block, 'verweisinhalt').length > 0)
  )
    return 'markierungsinhaltUngueltig';
  return undefined;
}

function parseEinenEintrag(typ: MarkierungsTyp, block: Element): MarkierungsEintrag | undefined {
  const kennung = liesAusgangsstelle(block);
  if (!kennung) return undefined;
  const textstelle = xmlKind(block, 'textstelle');
  const zeichenbereich = liesZeichenbereich(textstelle, 'zeichenbereich');
  const bezugstext = xmlText(block, 'bezugstext');
  const pfad = parseTextpfad(textstelle);
  const elementstand = parseElementstand(block);
  const bezug =
    zeichenbereich && pfad && bezugstext !== undefined
      ? {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad,
            zeichenbereichStart: Number(zeichenbereich[1]),
            zeichenbereichEnde: Number(zeichenbereich[2]),
          },
          bezugstext,
        }
      : elementstand
        ? { typ: 'pauschal' as const, elementstand }
        : undefined;
  if (!bezug) return undefined;
  switch (typ) {
    case 'unterstreichung':
    case 'hervorhebung':
      return bezug.typ === 'bezugstext' ? { typ, ...kennung, bezug } : undefined;
    case 'kommentar': {
      const kommentarText = xmlText(block, 'kommentartext');
      return kommentarText !== undefined ? { typ, ...kennung, bezug, kommentarText } : undefined;
    }
    case 'verweismarkierung': {
      const verweisinhalt = parseVerweisinhalt(block);
      return verweisinhalt ? { typ, ...kennung, bezug, verweisinhalt } : undefined;
    }
  }
}
