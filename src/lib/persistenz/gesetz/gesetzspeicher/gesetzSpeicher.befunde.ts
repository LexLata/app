// Befunde aus lesenden Gesetzvorgängen an Aktionsaufrufer melden.
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { type GesetzLadeBefund, fehlertext } from './gesetzSpeicher.typen';

/** Strikte Quellen melden nur bei ausdrücklichem Auftrag; keine Standardbanner. */
export function meldeStriktenGesetzbefund(
  text: string,
  fehler: unknown,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  if (!meldungEmpfangen) return;
  meldePersistenzBefund(
    {
      typ: 'fehler',
      art: 'fehler',
      anlass: 'lesen',
      aenderungsstand: 'keine',
      text: `${text}: ${fehlertext(fehler)}`,
    },
    meldungEmpfangen,
  );
}

/** Gesetz-Ladebefund ohne Reparaturmöglichkeit. */
export type GesetzZustandsBefund = Exclude<GesetzLadeBefund, { status: 'reparierbar' }>;

/** Einzige Zuordnung eines Gesetz-Ladebefunds zu einer gegliederten Meldung:
 * Grund, betroffene Datei (Dateiname), Ursache als Detail, Sicherung (relativer
 * Pfad, nie im Text). Der Text ist ein vollständiger Satz ohne Pfad. */
export function gesetzBefundAlsMeldung(
  befund: GesetzZustandsBefund,
): Pick<AktionsMeldung, 'text' | 'typ' | 'grund' | 'betroffen' | 'detail' | 'sicherung'> {
  if (befund.status === 'ordner_unlesbar')
    return {
      typ: 'warnung',
      grund: 'nichtLesbar',
      betroffen: 'Gesetzordner',
      detail: befund.fehler,
      text: `Der Gesetzordner konnte nicht gelesen werden (${befund.fehler}).`,
    };
  const datei = `${befund.dateiBasis}.xml`;
  switch (befund.status) {
    case 'archiviert':
      return {
        typ: 'warnung',
        grund: 'imDatenordnerGesichert',
        betroffen: datei,
        sicherung: befund.sicherungspfad,
        text: `${datei} wurde wegen Beschädigung gesichert.`,
      };
    case 'gesichert_aber_nicht_entfernt':
      return {
        typ: 'warnung',
        grund: 'gesichertNichtEntfernt',
        betroffen: datei,
        sicherung: befund.sicherungspfad,
        text: `${datei} wurde wegen Beschädigung gesichert, aber nicht entfernt.`,
      };
    case 'fehlt':
      return { typ: 'warnung', grund: 'dateiFehlt', betroffen: datei, text: `${datei} fehlt.` };
    case 'leer':
      return { typ: 'warnung', grund: 'dateiLeer', betroffen: datei, text: `${datei} ist leer.` };
    case 'unlesbar':
      return {
        typ: 'warnung',
        grund: 'nichtLesbar',
        betroffen: datei,
        detail: befund.fehler,
        text: `${datei} konnte nicht gelesen werden (${befund.fehler}).`,
      };
    case 'sicherung_fehlgeschlagen':
      return {
        typ: 'warnung',
        grund: 'sicherungFehlgeschlagen',
        betroffen: datei,
        detail: befund.fehler,
        text: `${datei} konnte nicht gesichert werden (${befund.fehler}).`,
      };
  }
}

/** Zusätzliche Befunde für Aktionsaufrufer; Hauptfenster behalten ihren Sammelbanner-Callback. */
export function meldeGesetzLesebefund(
  befund: GesetzLadeBefund,
  empfangen: AktionsMeldungEmpfaenger,
): void {
  // Sicherungserfolge meldet bereits der geschützte Sicherungsweg.
  if (befund.status === 'archiviert' || befund.status === 'gesichert_aber_nicht_entfernt') return;
  const meldung =
    befund.status === 'reparierbar'
      ? {
          typ: 'warnung' as const,
          text: `Die Gesetzdatei „${befund.dateiBasis}“ konnte nicht geladen werden. Sie kann aus ihrer bekannten Internet-Quelle erneut geladen werden.`,
        }
      : gesetzBefundAlsMeldung(befund);
  meldePersistenzBefund(
    {
      ...meldung,
      art: 'fehler',
      anlass: befund.status === 'sicherung_fehlgeschlagen' ? 'sicherung' : 'lesen',
      aenderungsstand: 'keine',
    },
    empfangen,
  );
}

/** Sicherungsbefunde wurden bereits am Sicherungsort gemeldet. */
export function meldeGesetzBefundeAnEmpfaenger(
  befunde: GesetzLadeBefund[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  if (!meldungEmpfangen) return;
  for (const befund of befunde) {
    if (
      !['archiviert', 'gesichert_aber_nicht_entfernt', 'sicherung_fehlgeschlagen'].includes(
        befund.status,
      )
    )
      meldeGesetzLesebefund(befund, meldungEmpfangen);
  }
}
