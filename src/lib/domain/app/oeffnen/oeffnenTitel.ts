// oeffnenTitel.ts
// Gemeinsamer Titelabgleich und Relevanzsortierung für installierte und angebotene Gesetze.

import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';

// Ausnahmen gelten für die vollständige Gesetzesangabe nach dem Anfrage-Parsing.
const NORMGEBER_VORRANG: ReadonlyMap<string, readonly string[]> = new Map([
  ['euv', [NORMGEBER_EU, NORMGEBER_DE_BUND, NORMGEBER_DE_BW]],
]);

/** Gemeinsame Rangfolge namensgleicher Treffer mit kuratierten Ausnahmen nach Gesetzesangabe. */
export function vergleicheSuchNormgeber(a: string, b: string, gesetzQuery = ''): number {
  const rangfolge = NORMGEBER_VORRANG.get(gesetzQuery.trim().toLowerCase()) ?? [
    NORMGEBER_DE_BUND,
    NORMGEBER_EU,
    NORMGEBER_DE_BW,
  ];
  const rang = (n: string) => {
    const i = rangfolge.indexOf(n);
    return i < 0 ? rangfolge.length : i;
  };
  return rang(a) - rang(b) || a.localeCompare(b, 'de', { sensitivity: 'base' });
}

// Titel-Filter + Sortierung (gemeinsam für installierte Gesetze und Importindex)

/** Drei Relevanz-Stufen, wie gewünscht: 0 = Kurztitel beginnt mit der
 *  Eingabe, 1 = Kurztitel enthält die Eingabe sonst (nur wenn Stufe 0 nicht
 *  zutrifft), 2 = nur der Langtitel enthält die Eingabe.
 *  Sortierschlüssel: bei Stufe 0/1 der Kurztitel, bei Stufe 2 der Langtitel –
 *  jeweils alphabetisch (de). */
function tierUndSchluessel(
  gesetzQ: string,
  kurz: string,
  lang: string,
): { tier: 0 | 1 | 2; schluessel: string } {
  if (kurz.startsWith(gesetzQ)) return { tier: 0, schluessel: kurz };
  if (kurz.includes(gesetzQ)) return { tier: 1, schluessel: kurz };
  return { tier: 2, schluessel: lang };
}

/** Titel-Filter + Relevanz-Sortierung – identisch anwendbar auf installierte
 *  Gesetze und auf Importindex-Einträge (gleiche Score-Logik für beide Fälle).
 *  `tieBreak` wird nur herangezogen, wenn Stufe UND Sortierschlüssel exakt
 *  gleich sind (z. B. Bund-/BW-Gesetz mit identischem Kurztitel) – normale
 *  Relevanz-Unterschiede werden davon nicht überschrieben. */
export function filtereUndSortiereNachTitel<T>(
  liste: T[],
  gesetzQ: string,
  titel: (t: T) => { kurz: string; lang: string },
  tieBreak?: (a: T, b: T) => number,
  anzeige?: (a: T, b: T) => number,
): T[] {
  // EG-Prefix/-Suffix normalisieren (z. B. „egstgb" ↔ „stgbeg")
  let egVariante: string | null = null;
  if (gesetzQ.startsWith('eg') && gesetzQ.length > 2) {
    egVariante = gesetzQ.slice(2) + 'eg';
  } else if (gesetzQ.endsWith('eg') && gesetzQ.length > 2) {
    egVariante = 'eg' + gesetzQ.slice(0, -2);
  }

  const kandidaten = liste.filter((t) => {
    const { kurz, lang } = titel(t);
    if (kurz.includes(gesetzQ) || lang.includes(gesetzQ)) return true;
    if (egVariante && (kurz.includes(egVariante) || lang.includes(egVariante))) return true;
    return false;
  });

  return [...kandidaten].sort((a, b) => {
    const ta = titel(a);
    const tb = titel(b);
    const sa = tierUndSchluessel(gesetzQ, ta.kurz, ta.lang);
    const sb = tierUndSchluessel(gesetzQ, tb.kurz, tb.lang);
    if (sa.tier !== sb.tier) return sa.tier - sb.tier;
    const anzeigeVergleich = anzeige?.(a, b) ?? 0;
    if (anzeigeVergleich !== 0) return anzeigeVergleich;
    const schluesselVergleich = sa.schluessel.localeCompare(sb.schluessel, 'de');
    if (schluesselVergleich !== 0) return schluesselVergleich;
    return tieBreak ? tieBreak(a, b) : 0;
  });
}
