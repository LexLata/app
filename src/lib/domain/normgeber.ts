// normgeber.ts
// Zentrale Werte und Zuordnung der Normgeber und Importindex-Kategorien.
export const NORMGEBER_DE_BUND = 'de-bund';
export const NORMGEBER_DE_BW = 'de-bw';
export const NORMGEBER_EU = 'eu';
export const NORMGEBER_EUROPARAT = 'europarat';

/** Bekannte Normgeber lesbar anzeigen; eigene Codes unverändert erhalten. */
export function normgeberAnzeigename(normgeber: string): string {
  switch (normgeber) {
    case NORMGEBER_DE_BUND:
      return 'Bund'; // normgeber-anzeige: Anzeigename, kein gespeicherter Normgeber-Code.
    case NORMGEBER_DE_BW:
      return 'Baden-Württemberg';
    case NORMGEBER_EU:
      return 'EU'; // normgeber-anzeige: Anzeigename, kein gespeicherter Normgeber-Code.
    case NORMGEBER_EUROPARAT:
      return 'Europarat'; // normgeber-anzeige: Anzeigename, kein gespeicherter Normgeber-Code.
    default:
      return normgeber;
  }
}

export const IMPORTINDEX_KATEGORIEN = [NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU] as const;

export type ImportindexKategorie =
  typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW | typeof NORMGEBER_EU;

/** Nur für diese Normgeber gibt es einen Importindex. */
export function hatImportindex(normgeber: string): normgeber is ImportindexKategorie {
  return IMPORTINDEX_KATEGORIEN.some((kategorie) => kategorie === normgeber);
}

/** Offene Codes: Kleinbuchstaben und Ziffern, getrennt durch einzelne Bindestriche. */
export const NORMGEBER_MUSTER = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const NORMGEBER_MAX_LAENGE = 20;
export const NORMGEBER_FORMAT_HINWEIS =
  'Ungültiger Normgeber: erwartet wird ein kleingeschriebener Code wie de-bund, at-bund oder de-by (Kleinbuchstaben, Ziffern, Bindestrich; höchstens 20 Zeichen).';
