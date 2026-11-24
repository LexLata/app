// Prüft und bereinigt gespeicherte Gesetzeskurzbefehle, ohne importierte XML-Eingänge zu verändern.
import { GESETZESKURZBEFEHLE_DATEINAME } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGueltigerNormgeber, gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { liesXmlWurzel, xmlKind, xmlKinder, xmlText } from '@/lib/utils/xmlVerarbeitung';
import {
  EINSTELLUNGEN_ORDNER,
  appDatenLesenGeschuetzt,
  bereinigeXmlBestand,
  mitDateiSperre,
} from '@/lib/persistenz/kern/kern.index';
import { nutzerdatenAenderungMelden } from './nutzerdatenAenderungMelden';

export const GESETZESKURZBEFEHLE_DATEIPFAD = `${EINSTELLUNGEN_ORDNER}/${GESETZESKURZBEFEHLE_DATEINAME}`;

/** Entfernt nur Einträge, deren vollständige Gesetzesreferenz oder Taste ungültig ist. */
function bereinigeGesetzeskurzbefehleXML(
  xml: string,
  fehlt?: (gesetz: Gesetzesreferenz) => boolean,
  entfernte?: string[],
): string {
  const wurzel = liesXmlWurzel(xml, 'gesetzeskurzbefehle');
  let veraendert = false;
  for (const el of xmlKinder(xmlKind(wurzel, 'inhalt'), 'gesetzeskurzbefehl')) {
    const gesetz = xmlKind(el, 'gesetz');
    const normgeber = gesetz?.getAttribute('normgeber') ?? '';
    const kurztitel = gesetz?.textContent?.trim() ?? '';
    if (
      !istGueltigerNormgeber(normgeber) ||
      !kurztitel ||
      !xmlText(el, 'taste') ||
      fehlt?.({ normgeber, kurztitel })
    ) {
      entfernte?.push(
        kurztitel ? `${kurztitel} (${normgeber || 'ohne Normgeber'})` : 'ohne Gesetzesangabe',
      );
      el.remove();
      veraendert = true;
    }
  }
  return veraendert ? new XMLSerializer().serializeToString(wurzel.ownerDocument) : xml;
}

export async function bereinigeGesetzeskurzbefehlBestand(
  xml: string,
  token?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  fehlt?: (gesetz: Gesetzesreferenz) => boolean,
): Promise<string | null> {
  let entfernte: string[] = [];
  return bereinigeXmlBestand(
    GESETZESKURZBEFEHLE_DATEIPFAD,
    xml,
    (inhalt) => {
      entfernte = [];
      return bereinigeGesetzeskurzbefehleXML(inhalt, fehlt, entfernte);
    },
    () => nutzerdatenAenderungMelden('gesetzeskurzbefehle-geaendert', meldungEmpfangen),
    token,
    meldungEmpfangen,
    () => ({
      text: `${entfernte.length} Gesetzeskurzbefehle mit ungültigen Angaben oder fehlendem Gesetz wurden entfernt: ${entfernte.join(', ')}. Übrige gültige Gesetzeskurzbefehle bleiben erhalten.`,
      detail: `entfernt: ${entfernte.join(', ')}`,
    }),
  );
}

/** Das Prädikat darf nur die verlässlich festgestellte Abwesenheit eines Gesetzes bestätigen. */
export async function bereinigeGesetzeskurzbefehleBeimStart(
  fehlt: (gesetz: Gesetzesreferenz) => boolean | Promise<boolean>,
  abschluss?: (
    uebernehmen: (fehltWeiterhin: (gesetz: Gesetzesreferenz) => boolean) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  await mitDateiSperre(GESETZESKURZBEFEHLE_DATEIPFAD, async (token) => {
    const xml = await appDatenLesenGeschuetzt(
      GESETZESKURZBEFEHLE_DATEIPFAD,
      'gesetzeskurzbefehle',
      token,
    );
    if (xml === null) return;
    const fehlende = new Set<string>();
    const wurzel = liesXmlWurzel(xml, 'gesetzeskurzbefehle');
    for (const el of xmlKinder(xmlKind(wurzel, 'inhalt'), 'gesetzeskurzbefehl')) {
      const normgeber = xmlKind(el, 'gesetz')?.getAttribute('normgeber') ?? '';
      const kurztitel = xmlText(el, 'gesetz')?.trim() ?? '';
      if (!istGueltigerNormgeber(normgeber) || !kurztitel) continue;
      const referenz = { normgeber, kurztitel };
      if (await fehlt(referenz)) fehlende.add(gesetzesreferenzSchluessel(referenz));
    }
    const uebernehmen = async (fehltWeiterhin: (gesetz: Gesetzesreferenz) => boolean) => {
      await bereinigeGesetzeskurzbefehlBestand(
        xml,
        token,
        undefined,
        (referenz) =>
          fehlende.has(gesetzesreferenzSchluessel(referenz)) && fehltWeiterhin(referenz),
      );
    };
    if (abschluss) await abschluss(uebernehmen);
    else await uebernehmen(() => true);
  });
}
