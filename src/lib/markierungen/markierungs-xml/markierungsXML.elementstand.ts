// Prüft den gespeicherten Elementstand an Ausgangsstellen und Verweiszielen.
import { xmlKind, xmlKinder, xmlText } from '@/lib/utils/xmlVerarbeitung';
import type { Elementstand } from '@/lib/markierungen/gemeinsam/gemeinsam.index';

export function parseElementstand(block: Element): Elementstand | undefined {
  const id = xmlKind(block, 'elementstand');
  const laenge = xmlText(id, 'textlaenge');
  if (
    xmlKinder(block, 'elementstand').length !== 1 ||
    !laenge ||
    !/^\d+$/.test(laenge) ||
    !Number.isSafeInteger(Number(laenge))
  )
    return undefined;
  if (xmlKinder(id, 'textlaenge').length !== 1 || xmlKinder(id, 'titel').length > 1)
    return undefined;
  return {
    titel: xmlText(id, 'titel')?.trim(),
    textlaenge: Number(laenge),
  };
}
