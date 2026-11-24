// Liest die Kopfangaben des GesetzesXML für die Darstellungsdaten.

import { leseFassung } from '@/lib/domain/gesetzInfos';
import { familieVonText } from '@/lib/domain/basis/normPraefixe';
import { liesNormgeber } from '@/lib/domain/gesetzesreferenz';
import type { GesetzInfos } from '@/lib/domain/gesetzInfos';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { liesVerarbeitungszeitstempel } from '@/lib/utils/xmlVerarbeitung';

export function parseInfos(
  infosEl: Element,
): GesetzInfos &
  Required<Pick<GesetzInfos, 'langtitel'>> &
  Pick<GesetzDarstellung, 'sprache' | 'normpraefix'> {
  const langtitel = infosEl.querySelector(':scope > langtitel')?.textContent?.trim() ?? '';
  const kurztitel = infosEl.querySelector(':scope > kurztitel')?.textContent?.trim() ?? '';

  const fundstelle = infosEl.querySelector(':scope > fundstelle')?.textContent?.trim() || undefined;
  const ausfertigung =
    infosEl.querySelector(':scope > ausfertigung')?.textContent?.trim() || undefined;
  const datenquelleEl = infosEl.querySelector(':scope > datenquelle');
  const datenquelle = datenquelleEl
    ? {
        name: datenquelleEl.getAttribute('name')?.trim() || undefined,
        url: datenquelleEl.getAttribute('url')?.trim() || undefined,
      }
    : undefined;
  const normgeberText = infosEl.querySelector(':scope > normgeber')?.textContent ?? undefined;
  const normgeber = liesNormgeber(normgeberText);
  if (normgeber === undefined) throw new Error('Fehlender Normgeber im Gesetz-XML.');

  // Optional, standardmäßig NICHT vorhanden (Bundesrecht/Landesrecht BW sind
  // durchgehend deutsch – kein automatisches Setzen beim Import). Nur bei
  // manuell nachgepflegten fremdsprachigen Texten relevant (z. B. EU-Recht,
  // src/lib/import/eu/) – siehe Einstellungen > Silbentrennung,
  // useTextDarstellung.ts (SILBENTRENNUNG_UNTERSTUETZTE_SPRACHEN) für die
  // Verwendung. ISO-639-1-Code erwartet; fehlt das Tag, wird an
  // Verwendungsstellen 'de' angenommen.
  const sprache = infosEl.querySelector(':scope > sprache')?.textContent?.trim() || undefined;

  const normpraefixText = infosEl.querySelector(':scope > normpraefix')?.textContent?.trim();
  const normpraefix = normpraefixText === undefined ? undefined : familieVonText(normpraefixText);
  if (normpraefixText !== undefined && normpraefix === undefined) {
    console.warn(`Unbekanntes normpraefix in ${kurztitel}:`, normpraefixText);
  }

  const standEl = infosEl.querySelector(':scope > stand');
  const aenderungsvermerk =
    standEl?.querySelector(':scope > aenderungsvermerk')?.textContent?.trim() || undefined;
  const neugefasst =
    standEl?.querySelector(':scope > neugefasst')?.textContent?.trim() || undefined;

  const verarbeitungszeitText = infosEl
    .querySelector(':scope > verarbeitungszeit')
    ?.textContent?.trim();
  const verarbeitungszeit = liesVerarbeitungszeitstempel(verarbeitungszeitText);
  const letzteNeuerungText = infosEl.querySelector(':scope > letzteNeuerung')?.textContent?.trim();
  const letzteNeuerung = liesVerarbeitungszeitstempel(letzteNeuerungText);

  return {
    langtitel,
    kurztitel,
    fundstelle,
    ausfertigung,
    datenquelle,
    fassung: leseFassung(infosEl),
    normgeber,
    sprache,
    normpraefix,
    aenderungsvermerk,
    neugefasst,
    verarbeitungszeit,
    letzteNeuerung,
  };
}
