// gesetzesreferenz.ts
// Gesetzesidentität und offene Normgeber; Quellen bleiben interne Import-Schlüssel.
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import {
  NORMGEBER_DE_BUND,
  NORMGEBER_DE_BW,
  NORMGEBER_EU,
  NORMGEBER_MUSTER,
  NORMGEBER_MAX_LAENGE,
  NORMGEBER_FORMAT_HINWEIS,
} from '@/lib/domain/normgeber';
import type { Gesetzesreferenz, Normgeber } from './gesetzTypes';
import { kurztitelSuchformen, vergleicheKurztitel } from './kurztitelVergleich';

export function istGueltigerNormgeber(wert: string): boolean {
  return wert.length <= NORMGEBER_MAX_LAENGE && NORMGEBER_MUSTER.test(wert);
}

/** Formatfehler sind an Lesegrenzen von einer fremden Dateizuordnung unterscheidbar. */
export class UngueltigerNormgeberFehler extends Error {
  constructor() {
    super(NORMGEBER_FORMAT_HINWEIS);
    this.name = 'UngueltigerNormgeberFehler';
  }
}

/** Fehlende Normgeber liefern undefined; ungültige vorhandene Angaben sind Fehler. */
export function liesNormgeber(wert: string | undefined): Normgeber | undefined {
  if (wert === undefined) return undefined;
  if (!istGueltigerNormgeber(wert)) throw new UngueltigerNormgeberFehler();
  return wert;
}

/** Eingangskontrolle für gespeicherte vollständige Gesetzesreferenzen. */
export function liesPflichtNormgeber(wert: string | undefined): Normgeber {
  const normgeber = liesNormgeber(wert);
  if (normgeber === undefined) throw new Error('Fehlender Normgeber.');
  return normgeber;
}

export function istGleichesGesetz(a: Gesetzesreferenz, b: Gesetzesreferenz): boolean {
  return (
    a.normgeber === b.normgeber &&
    kurztitelVergleichsform(a.kurztitel) === kurztitelVergleichsform(b.kurztitel)
  );
}

/** Vollständiger Schlüssel für Maps, Sperren, Ereignisse und Aktivierungen. */
export function gesetzesreferenzSchluessel(gesetz: Gesetzesreferenz): string {
  return JSON.stringify([gesetz.normgeber, kurztitelVergleichsform(gesetz.kurztitel)]);
}

/** Kopiert ausschließlich die Referenz für Persistenz und Transport. */
export function referenzVon(gesetz: Gesetzesreferenz): Gesetzesreferenz {
  return {
    kurztitel: gesetz.kurztitel,
    normgeber: gesetz.normgeber,
  };
}

export function findeGesetz<T extends Gesetzesreferenz>(
  gesetze: readonly T[],
  referenz: Gesetzesreferenz,
): T | undefined {
  return gesetze.find((gesetz) => istGleichesGesetz(gesetz, referenz));
}

/** Akzeptiert ausschließlich kanonische Vergleichsschlüssel gültiger Referenzen. */
export function istGesetzesreferenzSchluessel(wert: unknown): wert is string {
  if (typeof wert !== 'string') return false;
  try {
    const teile: unknown = JSON.parse(wert);
    if (!Array.isArray(teile) || teile.length !== 2) return false;
    const [normgeber, kurztitel] = teile as unknown[];
    if (typeof kurztitel !== 'string' || !kurztitel) return false;
    if (typeof normgeber !== 'string') return false;
    if (!istGueltigerNormgeber(normgeber)) return false;
    return gesetzesreferenzSchluessel({ kurztitel, normgeber }) === wert;
  } catch {
    return false;
  }
}

export interface GesetzeskandidatenAuswahl<T extends Gesetzesreferenz> {
  referenz?: T;
  mehrdeutig?: true;
}

/** Normgeber-Rangfolge unabhängig von der Schreibweise der Kurztiteleingabe. */
function kandidatenNachRang<T extends Gesetzesreferenz>(
  kandidaten: readonly T[],
  ausgangsnormgeber: Normgeber | undefined,
): T[][] {
  const normgeber = ausgangsnormgeber;
  const rangfolge =
    normgeber === NORMGEBER_DE_BW
      ? [NORMGEBER_DE_BW, NORMGEBER_DE_BUND, NORMGEBER_EU]
      : normgeber === NORMGEBER_DE_BUND
        ? [NORMGEBER_DE_BUND, NORMGEBER_EU]
        : normgeber === NORMGEBER_EU
          ? [NORMGEBER_EU]
          : [NORMGEBER_DE_BUND, NORMGEBER_EU];
  const bevorzugteRaenge = rangfolge.map((rang) => kandidaten.filter((g) => g.normgeber === rang));
  // Manuelle Zitate dürfen jeden vorhandenen Normgeber erreichen. Außerhalb
  // der bisherigen Vorränge gibt es keinen Vorrang einzelner Normgeber.
  const uebrige = kandidaten.filter((g) => !rangfolge.includes(g.normgeber));
  return [...bevorzugteRaenge, uebrige];
}

function sucheKurztitelInRaengen<T extends Gesetzesreferenz>(
  kurztitel: string,
  raenge: readonly T[][],
): GesetzeskandidatenAuswahl<T> | undefined {
  for (const rang of raenge) {
    const treffer = rang.filter((g) => vergleicheKurztitel(kurztitel, g.kurztitel) !== undefined);
    const exakt = treffer.filter((g) => vergleicheKurztitel(kurztitel, g.kurztitel) === 'exakt');
    const massgeblich = exakt.length > 0 ? exakt : treffer;
    if (massgeblich.length > 1) return { mehrdeutig: true };
    if (massgeblich.length === 1) return { referenz: massgeblich[0]! };
  }
  return undefined;
}

/** Wählt eine vorhandene vollständige Referenz; gleichrangige Kollisionen bleiben mehrdeutig. */
export function waehleGesetzeskandidat<T extends Gesetzesreferenz>(
  kurztitel: string,
  ausgangsnormgeber: Normgeber | undefined,
  kandidaten: readonly T[],
): GesetzeskandidatenAuswahl<T> | undefined {
  // Sammlung und Importindex dürfen dieselbe Referenz anbieten. Identitätsvergleich
  // bleibt strikt: Whitespace-Kollisionen sind unterschiedliche Referenzen.
  const eindeutig = new Map<string, T>();
  for (const kandidat of kandidaten) {
    const schluessel = gesetzesreferenzSchluessel(kandidat);
    if (!eindeutig.has(schluessel)) eindeutig.set(schluessel, kandidat);
  }
  const raenge = kandidatenNachRang([...eindeutig.values()], ausgangsnormgeber);
  for (const suchform of kurztitelSuchformen(kurztitel)) {
    const treffer = sucheKurztitelInRaengen(suchform, raenge);
    if (treffer) return treffer;
  }
  return undefined;
}
