/** Öffentliche Schnittstelle für Identität, Auflösung und Struktur von Normen. */

export { IdVergabe, berechneId } from '@/lib/domain/norm/bezeichnungZuId';

export { vergleicheBezeichnung, sortiereBezeichnung } from '@/lib/domain/norm/bezeichnungVergleich';

// Suchoperationen erlauben teilweise ungefähre Treffer. Konkrete Normziele
// werden über verweisZuXmlId eindeutig aufgelöst. Favoriten und Lesezeichen
// verwenden die Vorrangregel in loeseLesezeichenOderFavoritAuf.
export { verweisZuXmlId, istErwaegungsgrundBezeichnung } from '@/lib/domain/norm/verweisAufloesung';

export type { SprungZiel } from '@/lib/domain/norm/normAufloesung';
export {
  istArtikelBezeichnung,
  findeEindeutigeNorm,
  loeseNormEindeutigAuf,
  xmlIdZuSprungZiel,
  mitArtikelPraefix,
  vollstaendigeBezeichnung,
} from '@/lib/domain/norm/normAufloesung';

export type { ZusatzKontext } from '@/lib/domain/norm/normStrukturPruefung';
export {
  pruefeZusatzangabe,
  pruefeZusatzangabeMitKette,
} from '@/lib/domain/norm/normStrukturPruefung';

export type { KurzformPruefung } from '@/lib/domain/norm/normKurzform';
export {
  kurzformAusBezeichnung,
  ausgangsnormKennung,
  pruefeKurzform,
  loeseLesezeichenOderFavoritAuf,
  bezeichnungFuerAktivierung,
} from '@/lib/domain/norm/normKurzform';

export { loeseNormAusgangsstelleAuf } from './normAusgangsstelle';

export { findeFavoritfaehigeNorm } from './favoritfaehigeNorm';
