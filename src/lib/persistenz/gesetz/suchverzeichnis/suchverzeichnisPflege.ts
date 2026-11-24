// Geschriebene XML-Inhalte bis zum bestehenden Batchabschluss sammeln; keine anderen Gesetze lesen.
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  leiteSuchverzeichniseintragAb,
  type Dateistempel,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { normalisierteDateiBasis, referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';
import { aendereSuchverzeichnis, entwerteSuchverzeichnis } from './suchverzeichnisDatei';
import {
  gleicherDateistempel,
  leseGesetzDateistempel,
} from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzDateistempel';

type Pflege = { referenz: Gesetzesreferenz; xml: string | null; dateistempel?: Dateistempel };
const ausstehend = new Map<string, Pflege>();
export async function merkeSuchverzeichnisPflege(
  referenz: Gesetzesreferenz,
  xml: string | null,
): Promise<void> {
  const schluessel = normalisierteDateiBasis(referenz);
  const pflege: Pflege = { referenz, xml };
  ausstehend.set(schluessel, pflege);
  if (xml === null) return;
  try {
    const dateien = await leseGesetzDateistempel();
    const datei = dateien.find((d) => {
      const ref = referenzAusDateiBasis(d.name.slice(0, -4));
      return ref && normalisierteDateiBasis(ref) === schluessel;
    });
    pflege.dateistempel = datei?.dateistempel;
  } catch {
    /* Batchabschluss entwertet, falls der Stempel nicht ermittelt werden konnte. */
  }
}
export async function pflegeSuchverzeichnis(): Promise<boolean> {
  const pflegen = [...ausstehend.values()];
  ausstehend.clear();
  if (!pflegen.length) return false;
  try {
    await aendereSuchverzeichnis(false, async (stand) => {
      const dateien = await leseGesetzDateistempel();
      for (const pflege of pflegen) {
        const key = normalisierteDateiBasis(pflege.referenz);
        const aktuell = dateien.filter((d) => {
          const ref = referenzAusDateiBasis(d.name.slice(0, -4));
          return ref && normalisierteDateiBasis(ref) === key;
        });
        if (pflege.xml === null && aktuell.length === 0) {
          stand.eintraege = stand.eintraege.filter(
            (e) =>
              !(
                e.kurztitel &&
                e.normgeber &&
                normalisierteDateiBasis({ kurztitel: e.kurztitel, normgeber: e.normgeber }) === key
              ),
          );
          continue;
        }
        const [datei] = aktuell;
        if (
          !datei ||
          aktuell.length !== 1 ||
          !pflege.dateistempel ||
          !gleicherDateistempel(datei.dateistempel, pflege.dateistempel) ||
          pflege.xml === null
        ) {
          stand.abgeglichen = false;
          continue;
        }
        const gesetz = parseGesetzesXML(pflege.xml);
        if (!gesetz) {
          stand.abgeglichen = false;
          continue;
        }
        const eintrag = leiteSuchverzeichniseintragAb(gesetz, datei.dateistempel);
        stand.eintraege = stand.eintraege.filter(
          (e) =>
            !(
              e.kurztitel &&
              e.normgeber &&
              normalisierteDateiBasis({ kurztitel: e.kurztitel, normgeber: e.normgeber }) === key
            ),
        );
        stand.eintraege.push(eintrag);
      }
    });
  } catch {
    await entwerteSuchverzeichnis();
  }
  return true;
}
