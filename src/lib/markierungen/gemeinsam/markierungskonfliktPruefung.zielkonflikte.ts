// Berechnet Zielkonflikte und vergleicht gespeicherte Elementstände mit der aktuellen Fassung.
import { berechneElementstand } from '@/lib/domain/gesetzDarstellungAuswertung';
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { loeseNormEindeutigAuf } from '@/lib/domain/norm/norm.index';
import type {
  MarkierungsEintrag,
  Verweisziel,
} from '@/lib/markierungen/gemeinsam/markierungSpeicher.types';

/** EIN Zielgesetz-Konflikt (Zielkonflikte) – `gesetz` bezeichnet die vollständige Referenz
 *  des betroffenen Zielgesetzes. Je Gesetz und Verweis höchstens ein Eintrag je Typ;
 *  zielGesetzFehlt schließt die beiden Normkonflikttypen aus. */
export interface ZielKonflikt {
  typ: 'zielGesetzFehlt' | 'zielNormUnpassend' | 'zielNormFehlt';
  gesetz: Gesetzesreferenz;
}

/**
 * Wie ZielKonflikt, aber zusätzlich mit den betroffenen Zielnormen
 * SELBST (volle Bezeichnung, 1:1 aus Verweisziel übernommen), die zu diesem Zielgesetz-Konflikt
 * beigetragen haben (Reihenfolge/Duplikate wie im Verweis selbst) – wird NUR
 * für die Anzeige im Markierungskonflikte-Fenster gebraucht (siehe
 * markierungskonflikteAnzeige.ts), NICHT in markierungskonflikte.xml persistiert:
 * dieselbe Trennung wie bei der "eigenen" Bezeichnung (bezeichnungAnzeige) –
 * die Rohdaten stecken bereits vollständig in der Markierungs-XML selbst
 * (verweisinhalt.verweisziele) und werden bei jeder Anzeige frisch daraus
 * abgeleitet, siehe Absprache. Strukturell kompatibel zu ZielKonflikt (ist
 * das Aufruf-Ergebnis von berechneZielKonflikte, das überall dort verwendet
 * werden kann, wo ZielKonflikt[] erwartet wird).
 */
interface ZielKonfliktBerechnet extends ZielKonflikt {
  bezeichnungen: {
    bezeichnung: string;
    befund?: Exclude<ZielnormBefund, 'passt'>;
  }[];
}

export function elementstandPasstNochZu(
  norm: NormDarstellung | UeberschriftDarstellung,
  titel: string | undefined,
  textlaenge: number,
): boolean {
  const stand = berechneElementstand(norm);
  return stand.titel === titel && stand.textlaenge === textlaenge;
}

/** Gemeinsamer Befund für Prüfung, Anzeige und Aktionen; ohne Vergleichsmaßstab kein Konflikt. */
export type ZielnormBefund = 'passt' | 'unpassend' | 'nichtEindeutig' | 'fehlt';

export function klassifiziereZielnorm(
  ziel: Verweisziel,
  zielgesetz: GesetzDarstellung,
): ZielnormBefund {
  if (ziel.typ !== 'zielnorm') return 'passt';
  const { norm, anzahlTreffer } = loeseNormEindeutigAuf(zielgesetz, ziel.bezeichnung);
  if (!norm) return anzahlTreffer > 1 ? 'nichtEindeutig' : 'fehlt';
  return elementstandPasstNochZu(norm, ziel.elementstand.titel, ziel.elementstand.textlaenge)
    ? 'passt'
    : 'unpassend';
}

/** Ergänzt ausschließlich die zum Befund gehörende Gruppe des Zielgesetzes. */
function verarbeiteZitatZiel(
  ziel: Verweisziel,
  gesetz: Gesetzesreferenz,
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  konflikte: ZielKonfliktBerechnet[],
): void {
  if (ziel.typ !== 'zielnorm') return;
  const quelle = ziel.gesetz
    ? alleGesetze.find((g) => istGleichesGesetz(g, gesetz))
    : eigenesGesetz;
  const befund = quelle ? klassifiziereZielnorm(ziel, quelle) : undefined;
  if (befund === 'passt') return;
  const typ = !quelle
    ? 'zielGesetzFehlt'
    : befund === 'unpassend'
      ? 'zielNormUnpassend'
      : 'zielNormFehlt';
  let konflikt = konflikte.find((k) => k.typ === typ);
  if (!konflikt) {
    konflikt = { gesetz, typ, bezeichnungen: [] };
    konflikte.push(konflikt);
  }
  konflikt.bezeichnungen.push({
    bezeichnung: ziel.bezeichnung,
    ...(befund ? { befund } : {}),
  });
}

/** Zielgesetze bleiben in Verweisreihenfolge, je Gesetz stehen veränderte vor fehlenden Normen.
 * `nurGesetze` beschränkt die Neuberechnung nach Aktualisierung eines Zielgesetzes. */
export function berechneZielKonflikte(
  eintrag: MarkierungsEintrag,
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  nurGesetze?: Set<string>,
): ZielKonfliktBerechnet[] {
  switch (eintrag.typ) {
    case 'unterstreichung':
    case 'hervorhebung':
    case 'kommentar':
      return [];
    case 'verweismarkierung':
      break;
  }
  const nachGesetz = new Map<string, ZielKonfliktBerechnet[]>();
  for (const ziel of eintrag.verweisinhalt.verweisziele) {
    const gesetz = ziel.gesetz ?? {
      kurztitel: eigenesGesetz.kurztitel,
      normgeber: eigenesGesetz.normgeber,
    };
    const schluessel = gesetzesreferenzSchluessel(gesetz);
    if (nurGesetze && !nurGesetze.has(schluessel)) continue;
    // Auch passende Ziele bestimmen das erste Vorkommen eines Zielgesetzes.
    const konflikte = nachGesetz.get(schluessel) ?? [];
    nachGesetz.set(schluessel, konflikte);
    verarbeiteZitatZiel(ziel, gesetz, eigenesGesetz, alleGesetze, konflikte);
  }
  return [...nachGesetz.values()].flatMap((konflikte) =>
    konflikte.sort((a, b) => Number(a.typ === 'zielNormFehlt') - Number(b.typ === 'zielNormFehlt')),
  );
}
