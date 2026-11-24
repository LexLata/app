// Billige Startbarriere: Dateistempel und Cache vergleichen, ohne GesetzesXML zu lesen.
import { referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  gleicherDateistempel,
  leseGesetzDateistempel,
} from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzDateistempel';
import { leseSuchverzeichnis } from './suchverzeichnisDatei';
export async function vergleicheSuchverzeichnisDateistempel() {
  const [stand, dateien] = await Promise.all([leseSuchverzeichnis(), leseGesetzDateistempel()]);
  const eintraege = new Map(
    stand.eintraege.flatMap((e) =>
      e.kurztitel && e.normgeber
        ? [
            [
              gesetzesreferenzSchluessel({ kurztitel: e.kurztitel, normgeber: e.normgeber }),
              e,
            ] as const,
          ]
        : [],
    ),
  );
  const referenzen = dateien.flatMap((datei) => {
    const ref = referenzAusDateiBasis(datei.name.slice(0, -4));
    return ref ? [ref] : [];
  });
  // Eine nicht lesbare Datei mit unverändertem Stempel gilt als geprüft; der
  // Aufrufer liest nur sie gezielt neu, um ihren Befund wieder zu melden.
  const nichtLesbar: Gesetzesreferenz[] = [];
  const aktuell =
    stand.abgeglichen &&
    eintraege.size === dateien.length &&
    new Set(referenzen.map(gesetzesreferenzSchluessel)).size === dateien.length &&
    dateien.length === stand.eintraege.length &&
    dateien.every((datei) => {
      const ref = referenzAusDateiBasis(datei.name.slice(0, -4));
      const eintrag = ref && eintraege.get(gesetzesreferenzSchluessel(ref));
      if (!ref || !eintrag || !gleicherDateistempel(eintrag.dateistempel, datei.dateistempel))
        return false;
      if (eintrag.status !== 'in-ordnung') nichtLesbar.push(ref);
      return true;
    });
  return { aktuell, referenzen, nichtLesbar: aktuell ? nichtLesbar : [] };
}
