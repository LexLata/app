// oeffnenNamen.ts
// Suchnamen eines EU-Angebots bleiben mit dessen Gesetzesidentität verbunden.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import type { ImportindexSucheEintrag } from '@/lib/domain/importindexSucheEintrag';

export interface Suchname {
  name: string;
  gefundenUeber?: string;
}

export function suchnamenFuerEintrag(
  eintrag: ImportindexSucheEintrag,
  quelle: ImportindexKategorie,
): Suchname[] {
  return [
    { name: eintrag.kurztitel },
    ...(quelle === NORMGEBER_EU
      ? [
          ...(eintrag.alternativen ?? []).map((name) => ({ name, gefundenUeber: name })),
          ...(eintrag.abgeleiteterKurztitel ? [{ name: eintrag.abgeleiteterKurztitel }] : []),
        ]
      : []),
  ];
}
