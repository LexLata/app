// markierungsXML.pruefung.ts
// Wurzelprüfung einer MarkierungsXML und Lesen ihrer Verweiszielgesetze für
// die Markierungskonfliktprüfung; Lesen ihrer Gesetzesreferenz für den Import.

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { liesPflichtNormgeber } from '@/lib/domain/gesetzesreferenz';
import { liesXmlWurzel, xmlKind, xmlKinder, xmlText } from '@/lib/utils/xmlVerarbeitung';

/** Enthält der Inhalt eine vollständige Markierungswurzel? Prüft nicht den Inhalt. */
export function istMarkierungsXML(inhalt: string): boolean {
  return /<markierungen(?:\s|>)[\s\S]*<\/markierungen>/.test(inhalt);
}

/** Gesetzesreferenz unter infos/gesetz (Kurztitel getrimmt). Wirft, wenn sie
 * fehlt oder der Normgeber ungültig ist. Prüft die Wurzel nicht. */
export function liesMarkierungsGesetz(xml: string): Gesetzesreferenz {
  const el = xmlKind(xmlKind(liesXmlWurzel(xml), 'infos'), 'gesetz');
  const kurztitel = el?.textContent?.trim();
  if (!kurztitel) throw new Error('Datei ungültig: Gesetzesreferenz fehlt.');
  return { kurztitel, normgeber: liesPflichtNormgeber(el?.getAttribute('normgeber') ?? undefined) };
}

/**
 * Ausdrücklich genannte Zielgesetze aller Verweismarkierungen (direkte
 * Angaben unter inhalt/verweismarkierung/verweisinhalt/verweisziel/gesetz).
 * Ein Verweisziel ohne Gesetzesangabe verweist auf das eigene Gesetz und wird
 * hier nicht genannt. Wirft bei anderer Wurzel oder fehlendem Normgeber.
 */
export function liesVerweiszielGesetze(xml: string): Gesetzesreferenz[] {
  const inhalt = xmlKind(liesXmlWurzel(xml, 'markierungen'), 'inhalt');
  return xmlKinder(inhalt, 'verweismarkierung').flatMap((el) =>
    xmlKinder(xmlKind(el, 'verweisinhalt'), 'verweisziel').flatMap((ziel) => {
      const kurztitel = xmlText(ziel, 'gesetz')?.trim();
      if (!kurztitel) return [];
      return [
        {
          kurztitel,
          normgeber: liesPflichtNormgeber(
            xmlKind(ziel, 'gesetz')?.getAttribute('normgeber') ?? undefined,
          ),
        },
      ];
    }),
  );
}
