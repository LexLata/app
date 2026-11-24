// praefixstrukturXml.ts
// Interner Formatvertrag: tolerantes Lesen und deterministisches Schreiben.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import {
  praefixstrukturDiagnosegruende,
  type Praefixstruktur,
  type PraefixstrukturDiagnosegrund,
} from '@/lib/domain/praefixstruktur';
import {
  escapeXML,
  isoZeitstempel,
  liesVerarbeitungszeitstempel,
  liesXmlWurzel,
  xmlKinder,
  xmlText,
} from '@/lib/utils/xmlVerarbeitung';

type PraefixlaufFehlerart =
  'identifikation' | 'tablink-zeitueberschreitung' | 'keine-normen' | 'gesetz-laden';
const fehlerarten: readonly string[] = [
  'identifikation',
  'tablink-zeitueberschreitung',
  'keine-normen',
  'gesetz-laden',
];
export type PraefixstrukturEintrag =
  | {
      kurztitel: string;
      ermittlungsstatus: 'leer';
      praefixstruktur?: never;
      diagnosegrund?: never;
      fehlerart?: never;
    }
  | {
      kurztitel: string;
      ermittlungsstatus: 'gescheitert';
      fehlerart: PraefixlaufFehlerart;
      praefixstruktur?: never;
      diagnosegrund?: never;
    }
  | {
      ermittlungsstatus?: never;
      fehlerart?: never;
      kurztitel: string;
      praefixstruktur: Praefixstruktur;
      diagnosegrund?: PraefixstrukturDiagnosegrund;
    };
export interface PraefixstrukturListe {
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW;
  verarbeitungszeit: Date;
  eintraege: PraefixstrukturEintrag[];
}

export function vergleicheKurztitel(a: string, b: string): number {
  const kleinA = a.toLowerCase();
  const kleinB = b.toLowerCase();
  return kleinA < kleinB ? -1 : kleinA > kleinB ? 1 : a < b ? -1 : a > b ? 1 : 0;
}
function einzelkind(el: Element, name: string): Element {
  const kinder = xmlKinder(el, name);
  if (kinder.length !== 1) throw new Error(`PräfixstrukturXML: genau ein ${name} erforderlich`);
  return kinder[0]!;
}
function liesDiagnosegrund(gesetz: Element, praefixstruktur: Praefixstruktur) {
  const grund = gesetz.getAttribute('diagnosegrund');
  if (grund === null) return undefined;
  if (praefixstruktur === 'unklar' && Object.hasOwn(praefixstrukturDiagnosegruende, grund))
    return grund as PraefixstrukturDiagnosegrund;
  console.warn(
    `PräfixstrukturXML: unpassender Diagnosegrund ${grund} bei ${gesetz.textContent ?? ''}`,
  );
  return undefined;
}
function liesPraefixstrukturAttribut(gesetz: Element, kurztitel: string): Praefixstruktur {
  const wert = gesetz.getAttribute('praefixstruktur');
  if (wert === null) return 'paragraph';
  if (
    wert === 'regel' ||
    wert === 'nummer' ||
    wert === 'ohne-praefix' ||
    wert === 'artikel-und-paragraphen' ||
    wert === 'artikel' ||
    wert === 'gliederungsartikel' ||
    wert === 'roemisch' ||
    wert === 'arabisch' ||
    wert === 'alphabetisch' ||
    wert === 'unklar'
  )
    return wert;
  console.warn(`PräfixstrukturXML: unbekannter Wert ${wert} bei ${kurztitel}`);
  return 'unklar';
}
function liesEintrag(
  gesetz: Element,
  kurztitel: string,
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
): PraefixstrukturEintrag {
  const status = gesetz.getAttribute('ermittlungsstatus');
  if (
    status === 'leer' &&
    !gesetz.hasAttribute('praefixstruktur') &&
    !gesetz.hasAttribute('diagnosegrund') &&
    !gesetz.hasAttribute('fehlerart')
  )
    return { kurztitel, ermittlungsstatus: 'leer' };
  if (status !== null) {
    const fehlerart = gesetz.getAttribute('fehlerart');
    if (
      status !== 'gescheitert' ||
      !fehlerart ||
      !fehlerarten.includes(fehlerart) ||
      gesetz.hasAttribute('praefixstruktur') ||
      gesetz.hasAttribute('diagnosegrund')
    )
      throw new Error('PräfixstrukturXML: ungültiger Fehlerzustand');
    return {
      kurztitel,
      ermittlungsstatus: 'gescheitert',
      fehlerart: fehlerart as PraefixlaufFehlerart,
    };
  }
  if (gesetz.hasAttribute('fehlerart'))
    throw new Error('PräfixstrukturXML: Fehlerart ohne Fehlerstatus');
  const praefixstruktur = liesPraefixstrukturAttribut(gesetz, kurztitel);
  if (normgeber === NORMGEBER_DE_BW && praefixstruktur === 'gliederungsartikel')
    throw new Error('PräfixstrukturXML: BW enthält Gliederungsartikel');
  const diagnosegrund = liesDiagnosegrund(gesetz, praefixstruktur);
  return { kurztitel, praefixstruktur, ...(diagnosegrund ? { diagnosegrund } : {}) };
}

export function liesPraefixstrukturXml(
  xml: string,
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
): PraefixstrukturListe {
  const wurzel = liesXmlWurzel(xml, 'praefixstrukturen');
  if (wurzel.getAttribute('version') !== '1') throw new Error('PräfixstrukturXML: falsche Version');
  const infos = einzelkind(wurzel, 'infos');
  if (einzelkind(infos, 'normgeber').textContent !== normgeber)
    throw new Error('PräfixstrukturXML: falscher Normgeber');
  einzelkind(infos, 'verarbeitungszeit');
  const rohzeit = xmlText(infos, 'verarbeitungszeit');
  const verarbeitungszeit = liesVerarbeitungszeitstempel(rohzeit);
  if (!verarbeitungszeit || isoZeitstempel(verarbeitungszeit) !== rohzeit)
    throw new Error('PräfixstrukturXML: ungültige Verarbeitungszeit');
  const eintraege: PraefixstrukturEintrag[] = [];
  const gesehen = new Set<string>();
  for (const gesetz of xmlKinder(einzelkind(wurzel, 'inhalt'), 'gesetz')) {
    const kurztitel = (gesetz.textContent ?? '').trim();
    if (!kurztitel) continue;
    const schluessel = kurztitel.toLowerCase();
    if (gesehen.has(schluessel)) {
      console.warn(`PräfixstrukturXML: doppelter Kurztitel ${kurztitel}`);
      continue;
    }
    gesehen.add(schluessel);
    eintraege.push(liesEintrag(gesetz, kurztitel, normgeber));
  }
  return { normgeber, verarbeitungszeit, eintraege };
}

export function schreibePraefixstrukturXml(
  normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW,
  eintraege: readonly PraefixstrukturEintrag[],
  jetzt: Date,
  bisher?: string,
): string {
  const sortiert = [...eintraege].sort((a, b) => vergleicheKurztitel(a.kurztitel, b.kurztitel));
  const gesehen = new Set<string>();
  for (const eintrag of sortiert) {
    const schluessel = eintrag.kurztitel.toLowerCase();
    if (
      (eintrag.ermittlungsstatus === 'leer' &&
        (eintrag.fehlerart !== undefined ||
          eintrag.praefixstruktur !== undefined ||
          eintrag.diagnosegrund !== undefined)) ||
      (eintrag.ermittlungsstatus === 'gescheitert' &&
        (!fehlerarten.includes(eintrag.fehlerart) ||
          eintrag.praefixstruktur !== undefined ||
          eintrag.diagnosegrund !== undefined)) ||
      !eintrag.kurztitel.trim() ||
      gesehen.has(schluessel) ||
      (eintrag.diagnosegrund !== undefined &&
        (eintrag.praefixstruktur !== 'unklar' ||
          !Object.hasOwn(praefixstrukturDiagnosegruende, eintrag.diagnosegrund))) ||
      (normgeber === NORMGEBER_DE_BW && eintrag.praefixstruktur === 'gliederungsartikel')
    )
      throw new Error('PräfixstrukturXML: ungültiger Eintrag');
    gesehen.add(schluessel);
  }
  let zeit = jetzt;
  if (bisher !== undefined) {
    const alt = liesPraefixstrukturXml(bisher, normgeber);
    const altSortiert = [...alt.eintraege].sort((a, b) =>
      vergleicheKurztitel(a.kurztitel, b.kurztitel),
    );
    if (
      altSortiert.length === sortiert.length &&
      altSortiert.every((eintrag, index) => {
        const neu = sortiert[index]!;
        return (
          eintrag.kurztitel === neu.kurztitel &&
          eintrag.praefixstruktur === neu.praefixstruktur &&
          eintrag.diagnosegrund === neu.diagnosegrund &&
          eintrag.ermittlungsstatus === neu.ermittlungsstatus &&
          eintrag.fehlerart === neu.fehlerart
        );
      })
    )
      zeit = alt.verarbeitungszeit;
  }
  const gesetze = sortiert
    .map(({ kurztitel, praefixstruktur, diagnosegrund, ermittlungsstatus, fehlerart }) =>
      ermittlungsstatus === 'leer'
        ? `        <gesetz ermittlungsstatus="leer">${escapeXML(kurztitel)}</gesetz>`
        : ermittlungsstatus === 'gescheitert'
          ? `        <gesetz ermittlungsstatus="gescheitert" fehlerart="${fehlerart}">${escapeXML(kurztitel)}</gesetz>`
          : `        <gesetz${praefixstruktur === 'paragraph' ? '' : ` praefixstruktur="${escapeXML(praefixstruktur)}"`}${diagnosegrund ? ` diagnosegrund="${escapeXML(diagnosegrund)}"` : ''}>${escapeXML(kurztitel)}</gesetz>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<praefixstrukturen version="1">\n    <infos>\n        <verarbeitungszeit>${escapeXML(isoZeitstempel(zeit))}</verarbeitungszeit>\n        <normgeber>${escapeXML(normgeber)}</normgeber>\n    </infos>\n    <inhalt>\n${gesetze}\n    </inhalt>\n</praefixstrukturen>\n`;
}
