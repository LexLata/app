// gesetzInfosLesen.ts
//
// Liest aus einem bereits GesetzesXML nur die Handvoll Felder aus
// <infos>, die für Klassifizierung/Vergleich (Import-Pipeline, siehe
// gesetzesXMLNachbereiten.ts/dateiImport.ts) gebraucht werden, OHNE dafür
// den vollen Aufbau der Darstellungs-Pipeline (gesetzesXMLParser.ts:
// parseGesetzesXML, baut zusätzlich das komplette Normen-/Überschriften-Modell)
// zu durchlaufen.
//
// Beide bisherigen Aufrufer von parseGesetzesXML() an diesen Stellen wollten
// nie "validieren" oder die Darstellung, sondern nur kurztitel
// (gesetzesXMLNachbereiten.ts, für taggeVerweise) bzw.
// kurztitel/datenquelle/verarbeitungszeit (dateiImport.ts, für den
// Neu/Unverändert/Konflikt-Vergleich) – siehe Absprache. Die
// dependency-cruiser-Regel 'import-pipeline-importiert-nicht-aus-darstellung'
// entfällt dadurch, da kein Modul unter src/lib/import mehr aus
// src/lib/darstellung importiert.
//
// Liest bewusst dieselben <infos>-Felder mit denselben Bedingungen wie
// parseGesetzesXML() (siehe dort), damit sich das Verhalten (insbesondere der
// null-Rückgabefall) nicht unterscheidet. Seit dem lib/import-Modul-Umbau
// (import-modul-umbau-plan.md, Abschnitt 2.3) zusätzlich um
// ausfertigung/aenderungsvermerk/neugefasst erweitert – dieselben drei
// Felder, die parseInfos() in gesetzesXMLParser.ts aus <ausfertigung> bzw.
// <stand><aenderungsvermerk>/<neugefasst> liest, hier für die
// Aktualisierungs-Kategorisierung (verarbeiteGesetzDatei/vergleicheMitBestand)
// ohne vollen Parse-Aufbau.

import { leseFassung } from '@/lib/domain/gesetzInfos';
import { liesNormgeber } from '@/lib/domain/gesetzesreferenz';
import type { GesetzInfos } from '@/lib/domain/gesetzInfos';
import type { Normgeber } from '@/lib/domain/gesetzTypes';
import { liesVerarbeitungszeitstempel } from '@/lib/utils/xmlVerarbeitung';

/**
 * Liest kurztitel/datenquelle/verarbeitungszeit aus einem GesetzesXML.
 * Gibt null zurück, wenn das XML nicht parsbar ist, kein <gesetz>-Wurzelement
 * hat, kein <infos>-Block vorhanden ist, oder Kurztitel fehlt (analog zu parseGesetzesXML()).
 *
 * Bewusst KEINE separate `doc.querySelector('parsererror')`-Prüfung mehr:
 * die documentElement/tagName-Prüfung direkt darunter fängt sowohl "gar
 * nicht parsbar" (documentElement dann null) als auch "parsbar, aber falsches
 * Wurzelelement" (inkl. eines von manchen Browsern als Wurzelelement
 * eingesetzten <parsererror>) bereits ab – ohne von einem 'parsererror'-
 * Element abhängig zu sein, das z. B. linkedom (Test-Setup, siehe
 * gesetzInfosLesen.test.ts) bei kaputtem XML gar nicht erzeugt (es heilt
 * still oder liefert direkt documentElement === null).
 */
export function leseGesetzInfos(xmlString: string): GesetzInfos | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const gesetzEl = doc.documentElement;
  if (!gesetzEl || gesetzEl.tagName !== 'gesetz') return null;

  const infosEl = gesetzEl.querySelector(':scope > infos');
  if (!infosEl) return null;

  // Stryker disable next-line OptionalChaining: das zweite "?." (vor .trim())
  // ist ein geprüft äquivalenter Mutant – JS' Optional-Chaining-Kurzschluss
  // propagiert innerhalb EINER Kettenausdruck-Anweisung ab dem ersten "?."
  // bereits durch die gesamte restliche Kette (auch über ".trim()" ohne
  // eigenes "?."), verifiziert per `x?.toString().trim()` mit x=null ->
  // undefined statt Exception. Das erste "?." (nach querySelector) bleibt
  // dadurch zwar auch von der Mutation ausgenommen, ist aber weiterhin
  // beispielbasiert über die "<infos>-Block ohne diesen Tag"-Fälle unten
  // abgedeckt.
  // Stryker disable next-line OptionalChaining: geprüfter äquivalenter Kurzschluss, siehe oben.
  const kurztitel = infosEl.querySelector(':scope > kurztitel')?.textContent?.trim() ?? '';
  if (!kurztitel) return null;

  const datenquelleEl = infosEl.querySelector(':scope > datenquelle');
  const datenquelle = datenquelleEl
    ? {
        name: datenquelleEl.getAttribute('name')?.trim() || undefined,
        url: datenquelleEl.getAttribute('url')?.trim() || undefined,
      }
    : undefined;
  const normgeberText = infosEl.querySelector(':scope > normgeber')?.textContent ?? undefined;
  let normgeber: Normgeber | undefined;
  try {
    normgeber = liesNormgeber(normgeberText);
  } catch {
    return null;
  }
  if (normgeber === undefined) return null;
  // Stryker disable next-line OptionalChaining: s. Begründung an kurztitel oben.
  const verarbeitungszeitText = infosEl
    .querySelector(':scope > verarbeitungszeit')
    ?.textContent?.trim();
  const verarbeitungszeit = liesVerarbeitungszeitstempel(verarbeitungszeitText);

  // Stryker disable next-line OptionalChaining: s. Begründung an kurztitel oben.
  const ausfertigung =
    infosEl.querySelector(':scope > ausfertigung')?.textContent?.trim() || undefined;

  const standEl = infosEl.querySelector(':scope > stand');
  const aenderungsvermerk =
    standEl?.querySelector(':scope > aenderungsvermerk')?.textContent?.trim() || undefined;
  const neugefasst =
    standEl?.querySelector(':scope > neugefasst')?.textContent?.trim() || undefined;

  return {
    kurztitel,
    datenquelle,
    fassung: leseFassung(infosEl),
    normgeber,
    verarbeitungszeit,
    ausfertigung,
    aenderungsvermerk,
    neugefasst,
  };
}
