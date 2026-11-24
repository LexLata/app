// markierungskonflikteAktionen.ts
//
// Konfliktaktionen des Markierungskonflikte-Fensters (siehe
// konfliktaktionen.ts), ausgelagert aus markierungSpeicher.ts
// (500-Zeilen-Richtwert) – nur von dort genutzt, daher fachlich klar
// abgegrenzt von der übrigen, allgemeinen Markierungs-Persistenz-API.

import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { findeEindeutigeNorm, vollstaendigeBezeichnung } from '@/lib/domain/norm/norm.index';
import { berechneElementstand as berechneStand } from '@/lib/domain/gesetzDarstellungAuswertung';
import {
  findeElementZuBezeichnung,
  identitaetsSchluessel,
  klassifiziereZielnorm,
  pruefeEigenenKonflikt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type {
  Elementstand,
  MarkierungsEintrag,
  Verweisziel,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { loescheMarkierungsDatei } from '@/lib/markierungen/eintrag/eintrag.index';

export { loescheMarkierungsDatei };

/**
 * Reine Berechnung für Einzel- und Bulkpfade aus dem frisch gelesenen Eintrag.
 * Betroffen sind alle verweisziele, deren Zielgesetz `zielgesetz` entspricht
 * (Selbstverweise eingeschlossen: `z.gesetz ?? gesetz`);
 * `berechneNeuenElementstand` entscheidet je Verweisziel: neue elementstand
 * (verknüpfen), undefined (Verknüpfung entfernen) oder 'unveraendert'.
 * Entfernte Verknüpfungen werden nicht neu angelegt.
 */
export function berechneZielelementstaende(
  gesetz: Gesetzesreferenz,
  eintrag: Readonly<MarkierungsEintrag>,
  zielgesetz: Gesetzesreferenz,
  berechneNeuenElementstand: (
    z: Verweisziel,
  ) => { elementstand: Elementstand; bezeichnung: string } | undefined | 'unveraendert',
): MarkierungsEintrag {
  if (eintrag.typ !== 'verweismarkierung' || !eintrag.verweisinhalt) return eintrag;
  const neueZielnormen = eintrag.verweisinhalt.verweisziele.map((z) => {
    if (z.typ !== 'zielnorm' || !istGleichesGesetz(z.gesetz ?? gesetz, zielgesetz)) return z;
    const ergebnis = berechneNeuenElementstand(z);
    if (ergebnis === 'unveraendert') return z;
    const { elementstand: _stand, ...kennung } = z;
    const neu: Verweisziel = ergebnis
      ? {
          ...z,
          elementstand: ergebnis.elementstand,
          bezeichnung: ergebnis.bezeichnung,
        }
      : { ...kennung, typ: 'zielnormOhneElementstand' };
    if (
      JSON.stringify(neu.elementstand) === JSON.stringify(z.elementstand) &&
      neu.bezeichnung === z.bezeichnung
    )
      return z;
    return neu;
  });
  if (neueZielnormen.every((z, index) => z === eintrag.verweisinhalt.verweisziele[index]))
    return eintrag;
  return { ...eintrag, verweisinhalt: { ...eintrag.verweisinhalt, verweisziele: neueZielnormen } };
}

/** Nur ein bestehender, frisch abweichender pauschaler Ausgangsstand ist aktualisierbar. */
export function berechneElementstand(
  eintrag: Readonly<MarkierungsEintrag>,
  gesetz: GesetzDarstellung | null | undefined,
): MarkierungsEintrag {
  if (
    !gesetz ||
    (eintrag.typ !== 'kommentar' && eintrag.typ !== 'verweismarkierung') ||
    pruefeEigenenKonflikt(eintrag, gesetz) !== 'pauschalerBezugUnpassend'
  )
    return eintrag;
  const norm = findeElementZuBezeichnung(gesetz, eintrag.ausgangsstelle);
  if (!norm) return eintrag;
  return {
    ...eintrag,
    bezug: { typ: 'pauschal', elementstand: berechneStand(norm) },
  };
}

/** Gemeinsamer fachlicher Maßstab für Anzeige, Einzel- und Sammelaktionen. */
export function aktuellerElementstand(
  ziel: Verweisziel,
  gesetz: GesetzDarstellung | null | undefined,
) {
  if (ziel.typ !== 'zielnorm' || !gesetz || klassifiziereZielnorm(ziel, gesetz) !== 'unpassend')
    return 'unveraendert' as const;
  const norm = findeEindeutigeNorm(gesetz, ziel.bezeichnung);
  return norm
    ? {
        elementstand: berechneStand(norm),
        bezeichnung: vollstaendigeBezeichnung(gesetz, norm.xmlId) ?? norm.bezeichnung,
      }
    : ('unveraendert' as const);
}

export interface VerknuepfungsZahlen {
  elementstaende: number;
  verweisziele: number;
  markierungen: number;
}

export interface VerknuepfungsUmfang {
  ausgang: boolean;
  zielgesetze: Gesetzesreferenz[];
}

/** Nur die Identität und die betroffenen Gruppen kommen aus dem Fenster; Inhalte stets live. */
export function ermittleVerknuepfungsQuellen(
  gesetz: Gesetzesreferenz,
  alle: readonly MarkierungsEintrag[],
  umfang: ReadonlyMap<string, VerknuepfungsUmfang>,
): Gesetzesreferenz[] {
  const quellen = new Map<string, Gesetzesreferenz>();
  const merke = (g: Gesetzesreferenz) => quellen.set(gesetzesreferenzSchluessel(g), g);
  for (const e of alle) {
    const u = umfang.get(identitaetsSchluessel(e));
    if (!u) continue;
    if (u.ausgang && e.bezug.elementstand) merke(gesetz);
    for (const g of u.zielgesetze)
      if (
        e.verweisinhalt?.verweisziele.some(
          (z) => z.typ === 'zielnorm' && istGleichesGesetz(z.gesetz ?? gesetz, g),
        )
      )
        merke(g);
  }
  return [...quellen.values()];
}

export function berechneAktuelleVerknuepfungen(
  gesetz: Gesetzesreferenz,
  alle: readonly MarkierungsEintrag[],
  umfang: ReadonlyMap<string, VerknuepfungsUmfang>,
  quellen: ReadonlyMap<string, GesetzDarstellung | null>,
): { eintraege: MarkierungsEintrag[]; zahlen: VerknuepfungsZahlen } {
  const zahlen: VerknuepfungsZahlen = { elementstaende: 0, verweisziele: 0, markierungen: 0 };
  const eintraege = alle.map((e) => {
    const u = umfang.get(identitaetsSchluessel(e));
    if (!u) return e;
    let neu = u.ausgang
      ? berechneElementstand(e, quellen.get(gesetzesreferenzSchluessel(gesetz)))
      : e;
    if (neu !== e) zahlen.elementstaende++;
    for (const g of u.zielgesetze) {
      neu = berechneZielelementstaende(gesetz, neu, g, (z) => {
        const stand = aktuellerElementstand(z, quellen.get(gesetzesreferenzSchluessel(g)));
        if (stand !== 'unveraendert') zahlen.verweisziele++;
        return stand;
      });
    }
    if (neu !== e) zahlen.markierungen++;
    return neu;
  });
  return { eintraege, zahlen };
}
