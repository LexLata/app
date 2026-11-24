// oeffnungsziel.ts
// Reine Zielauflösung und Fehlertexte der sofortigen Gesetzesöffnung
// (useGesetzOeffnen): Normziel im geladenen Gesetz bestimmen, Importfehler benennen.
import { TIEFENLINK_ZIEL_HINWEIS } from '@/lib/domain/app/tiefenLink';
import type { Navigationsziel } from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import {
  verweisZuXmlId,
  loeseLesezeichenOderFavoritAuf,
  findeFavoritfaehigeNorm,
} from '@/lib/domain/norm/norm.index';
import type { ImportFehlerGrund } from '@/lib/import/import.index';

export function importFehlertext(ziel: Navigationsziel, grund: ImportFehlerGrund): string {
  if (grund === 'nichtVerfuegbar')
    return ziel.tiefenlink
      ? TIEFENLINK_ZIEL_HINWEIS
      : `‚${ziel.gesetzesreferenz.kurztitel}‘ ist für den Import nicht verfügbar.`;
  if (grund === 'laden') return 'Das Gesetz konnte nicht verlässlich geladen werden.';
  if (grund === 'keineVerbindung')
    return 'Keine Internetverbindung. Das Gesetz konnte nicht importiert werden.';
  return 'Das Gesetz konnte nicht importiert werden.';
}

/** XML-ID des Normziels; null, wenn das Ziel im Gesetz fehlt; undefined ohne Ziel. */
export function normziel(
  gesetz: GesetzDarstellung,
  ziel: Navigationsziel,
): string | null | undefined {
  if (ziel.xmlId !== undefined)
    return gesetz.elemente.some((el) => el.data.xmlId === ziel.xmlId) ? ziel.xmlId : null;
  if (ziel.bezeichnung)
    return ziel.lesezeichen
      ? (loeseLesezeichenOderFavoritAuf(gesetz, ziel.bezeichnung).norm?.xmlId ?? null)
      : verweisZuXmlId(gesetz, ziel.bezeichnung);
  return undefined;
}

export function oeffnungsziel(gesetz: GesetzDarstellung, ziel: Navigationsziel) {
  const xmlId = normziel(gesetz, ziel);
  if (!ziel.favoritfaehigeStartnorm) return xmlId;
  return (
    findeFavoritfaehigeNorm(gesetz, xmlId ?? undefined) ??
    gesetz.elemente.find((element) => element.typ === 'norm')?.data.xmlId
  );
}
