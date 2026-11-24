// Liest tolerante Zeitangaben und schreibt die letzten Kinder einer Markierung.
import { escapeXML, isoZeitstempel, xmlText } from '@/lib/utils/xmlVerarbeitung';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';

export function baueZeitstempel(e: MarkierungsEintrag): string[] {
  const zeilen: string[] = [];
  if (e.erstellt !== undefined)
    zeilen.push(`            <erstellt>${escapeXML(e.erstellt)}</erstellt>`);
  if ((e.typ === 'kommentar' || e.typ === 'verweismarkierung') && e.geaendert !== undefined)
    zeilen.push(`            <geaendert>${escapeXML(e.geaendert)}</geaendert>`);
  return zeilen;
}

/** Zeitfelder sind ergänzende Angaben; ungültige Werte beschädigen keinen Eintrag. */
function liesZeitstempel(block: Element, tag: 'erstellt' | 'geaendert'): string | undefined {
  const wert = xmlText(block, tag);
  if (!wert || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(wert)) return undefined;
  const datum = new Date(wert);
  return Number.isFinite(datum.getTime()) && isoZeitstempel(datum) === wert ? wert : undefined;
}

export function leseZeitstempel(eintrag: MarkierungsEintrag, block: Element): MarkierungsEintrag {
  const erstellt = liesZeitstempel(block, 'erstellt');
  if (erstellt !== undefined) eintrag.erstellt = erstellt;
  if (eintrag.typ === 'kommentar' || eintrag.typ === 'verweismarkierung') {
    const geaendert = liesZeitstempel(block, 'geaendert');
    if (geaendert !== undefined) eintrag.geaendert = geaendert;
  }
  return eintrag;
}
