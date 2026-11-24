// gesetzFabriken.ts
// Zentrale gültige Testdaten für Gesetzesreferenzen, Kopfangaben und Darstellung.
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { GesetzInfos } from '@/lib/domain/gesetzInfos';

type MitNormgeber<T> = T & { normgeber: string };

export function gesetzesreferenz(
  werte: Partial<Gesetzesreferenz> = {},
): MitNormgeber<Gesetzesreferenz> {
  return { kurztitel: 'BGB', ...werte, normgeber: werte.normgeber ?? 'de-bund' };
}

export function gesetzInfos(werte: Partial<GesetzInfos> = {}): MitNormgeber<GesetzInfos> {
  return {
    langtitel: 'Bürgerliches Gesetzbuch',
    ...gesetzesreferenz(werte),
    ...werte,
    normgeber: werte.normgeber ?? 'de-bund',
  };
}

export function gesetzDarstellung(
  werte: Partial<GesetzDarstellung> = {},
): MitNormgeber<GesetzDarstellung> {
  return {
    kurztitel: 'BGB',
    langtitel: 'Bürgerliches Gesetzbuch',
    hatGliederungsartikel: false,
    elemente: [],
    ...werte,
    normgeber: werte.normgeber ?? 'de-bund',
  };
}

export function kleinesGesetz(mitGliederungsartikel = false): MitNormgeber<GesetzDarstellung> {
  const norm = {
    typ: 'norm',
    data: normaleNorm({ id: 'p1', xmlId: 'p1', bezeichnung: '§ 1', absaetze: [] }),
  } satisfies GesetzDarstellung['elemente'][number];
  return gesetzDarstellung({
    hatGliederungsartikel: mitGliederungsartikel,
    elemente: mitGliederungsartikel
      ? [
          {
            typ: 'norm',
            data: gliederungsartikel({
              id: 'art1',
              xmlId: 'art1',
              bezeichnung: 'Art. 1',
              gliederungsEbene: 1,
              ueberschriftartig: true,
              absaetze: [],
            }),
          },
          norm,
        ]
      : [norm],
  });
}

/**
 * Überschreibungen für {@link gesetzMitNormen}; `norm` gilt für alle Normen (z. B. Normart)
 * oder wird je Position berechnet.
 */
export interface GesetzMitNormenWerte extends Partial<Omit<GesetzDarstellung, 'elemente'>> {
  /** Kennung (id und xmlId) je Position, als Funktion oder Liste in Normreihenfolge. */
  kennung?: ((index: number) => string) | readonly string[];
  norm?: Partial<NormDarstellung> | ((index: number) => Partial<NormDarstellung>);
}

/** Testgesetz „TestG“ aus Normen mit den Bezeichnungen in Reihenfolge; Kennungen standardmäßig ab 0. */
export function gesetzMitNormen(
  bezeichnungen: readonly string[],
  { kennung = String, norm = {}, ...werte }: GesetzMitNormenWerte = {},
): MitNormgeber<GesetzDarstellung> {
  return gesetzDarstellung({
    kurztitel: 'TestG',
    langtitel: 'Test',
    ...werte,
    elemente: bezeichnungen.map((bezeichnung, i) => ({
      typ: 'norm',
      data: normDarstellung({
        id: kennungAn(kennung, i),
        xmlId: kennungAn(kennung, i),
        bezeichnung,
        absaetze: [],
        ...(typeof norm === 'function' ? norm(i) : norm),
      }),
    })),
  });
}

function kennungAn(kennung: NonNullable<GesetzMitNormenWerte['kennung']>, i: number): string {
  if (typeof kennung === 'function') return kennung(i);
  const wert = kennung[i];
  if (wert === undefined) throw new Error(`Keine Kennung für Norm ${i}`);
  return wert;
}

/** Gültige normale Norm; Status und Inhalt können überschrieben werden. */
export function normaleNorm(
  werte: Partial<Extract<NormDarstellung, { art: 'normal' }>> = {},
): Extract<NormDarstellung, { art: 'normal' }> {
  return { id: 'n1', xmlId: 'n1', bezeichnung: '§ 1', absaetze: [], ...werte, art: 'normal' };
}

/** Gliederungsartikel mit ausdrücklich festgelegtem Darstellungsverhalten. */
export function gliederungsartikel(
  werte: Partial<Extract<NormDarstellung, { art: 'gliederungsartikel' }>> = {},
): Extract<NormDarstellung, { art: 'gliederungsartikel' }> {
  return {
    ...normaleNorm(),
    gliederungsEbene: 1,
    ueberschriftartig: false,
    ...werte,
    art: 'gliederungsartikel',
  };
}

/** Erwägungsgrund ohne Gliederungsebene. */
export function erwaegungsgrund(
  werte: Partial<Extract<NormDarstellung, { art: 'erwaegungsgrund' }>> = {},
): Extract<NormDarstellung, { art: 'erwaegungsgrund' }> {
  return { ...normaleNorm(), bezeichnung: 'E1', ...werte, art: 'erwaegungsgrund' };
}

/** Wählt bei gemeinsamen Testhelfern die ausdrücklich angegebene Normart. */
export function normDarstellung(werte: Partial<NormDarstellung> = {}): NormDarstellung {
  switch (werte.art) {
    case 'gliederungsartikel':
      return gliederungsartikel(werte);
    case 'erwaegungsgrund':
      return erwaegungsgrund(werte);
    default:
      return normaleNorm({ ...werte, art: 'normal' });
  }
}
