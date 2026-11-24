// gesetzReferenzen.ts
// Referenzgrundlage ausschließlich aus den für den Normgeber erlaubten Verzeichnissen.
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import {
  NORMGEBER_DE_BUND,
  NORMGEBER_DE_BW,
  NORMGEBER_EU,
  NORMGEBER_EUROPARAT,
} from '@/lib/domain/normgeber';
import { leseReferenzVerzeichnis } from '@/lib/import/importindex/importindex.index';
import type { VerzeichnisFehler } from '@/lib/import/importindex/importindex.index';
import type { GesetzesreferenzMitLangtitel } from '@/lib/import/basis/basis.index';
import { leseAbgeglichenesSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
import type { Normgeber } from '@/lib/domain/gesetzTypes';

export async function ermittleGesetzRefs(
  normgeber: Normgeber,
  leseInstallierte = leseInstallierteGesetzRefs,
): Promise<{
  referenzen: GesetzesreferenzMitLangtitel[];
  fehler: VerzeichnisFehler[];
}> {
  const normgeberVergleich = normgeber;
  // Erst an der Verzeichnisgrenze entstehen technische Kategorien.
  const quellen =
    normgeberVergleich === NORMGEBER_DE_BW
      ? ([NORMGEBER_DE_BW, NORMGEBER_DE_BUND, NORMGEBER_EU] as const)
      : normgeberVergleich === NORMGEBER_DE_BUND
        ? ([NORMGEBER_DE_BUND, NORMGEBER_EU] as const)
        : normgeberVergleich === NORMGEBER_EU || normgeberVergleich === NORMGEBER_EUROPARAT
          ? ([NORMGEBER_EU] as const)
          : [];
  if (!quellen.length) return { referenzen: [], fehler: [] };
  const installierte = await leseInstallierte();
  const verzeichnisse = await Promise.all(quellen.map((quelle) => leseReferenzVerzeichnis(quelle)));
  const nachKurztitel = new Map<string, GesetzesreferenzMitLangtitel>();
  for (const [index, verzeichnis] of verzeichnisse.entries()) {
    for (const eintrag of verzeichnis.eintraege) {
      const key = kurztitelVergleichsform(eintrag.kurztitel).trim();
      if (!nachKurztitel.has(key)) {
        nachKurztitel.set(key, {
          kurztitel: eintrag.kurztitel,
          langtitel: eintrag.langtitel,
          normgeber: eintrag.normgeber ?? quellen[index]!,
        });
      }
    }
  }
  ergaenzeInstallierteReferenzen(nachKurztitel, installierte, quellen);
  return {
    referenzen: [...nachKurztitel.values()],
    fehler: verzeichnisse.flatMap((v) => v.fehler),
  };
}

function ergaenzeInstallierteReferenzen(
  referenzen: Map<string, GesetzesreferenzMitLangtitel>,
  eintraege: readonly GesetzesreferenzMitLangtitel[],
  quellen: readonly string[],
): void {
  for (const eintrag of eintraege) {
    const quelle = eintrag.normgeber === NORMGEBER_EUROPARAT ? NORMGEBER_EU : eintrag.normgeber;
    if (!quellen.includes(quelle)) continue;
    const key = kurztitelVergleichsform(eintrag.kurztitel).trim();
    if (!referenzen.has(key))
      referenzen.set(key, {
        kurztitel: eintrag.kurztitel,
        normgeber: eintrag.normgeber,
        langtitel: eintrag.langtitel,
      });
  }
}

/** Nur bestätigte Kopfangaben aus dem abgeglichenen Verzeichnis; keine Schreibautorität. */
export async function leseInstallierteGesetzRefs(): Promise<GesetzesreferenzMitLangtitel[]> {
  const stand = await leseAbgeglichenesSuchverzeichnis();
  return stand.eintraege
    .filter((e) => e.status === 'in-ordnung')
    .map((e) => ({ kurztitel: e.kurztitel, normgeber: e.normgeber, langtitel: e.langtitel }));
}
