// Wählt für die Einführung ein eindeutig speicherbares Normziel im Gesetz.
import type { GesetzDarstellung, DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { pruefeKurzform } from './normKurzform';

/** Bevorzugtes gültiges Ziel, sonst erste favoritenfähige Norm in Dokumentreihenfolge. */
export function findeFavoritfaehigeNorm(
  gesetz: GesetzDarstellung,
  bevorzugteXmlId?: string,
): string | undefined {
  const istFavoritfaehig = (element: DarstellungsElement) =>
    element.typ === 'norm' && pruefeKurzform(gesetz, element)?.ok === true;
  const bevorzugt = gesetz.elemente.find((element) => element.data.xmlId === bevorzugteXmlId);
  if (bevorzugt && istFavoritfaehig(bevorzugt)) return bevorzugt.data.xmlId;
  return gesetz.elemente.find(istFavoritfaehig)?.data.xmlId;
}
