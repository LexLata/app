// Übersetzt vorhandene Bestands-Szenarien unverändert auf den expliziten Aktionslader.
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
export const markierungsEinzelzugriffFuerTest: GesetzLader = (referenz, meldungEmpfangen) =>
  einzelzugriffFuerTest(async () => {
    let befunde: Parameters<NonNullable<Parameters<typeof ladeAlleGesetze>[0]>>[0] = [];
    const liste = await ladeAlleGesetze((aktuelle) => {
      befunde = aktuelle;
    }, meldungEmpfangen);
    return {
      liste,
      befunde: befunde.filter(
        (befund) =>
          !('dateiBasis' in befund) ||
          befund.dateiBasis.toLowerCase() ===
            `${referenz.kurztitel}_${referenz.normgeber}`.toLowerCase(),
      ),
      ordnerLesbar: !befunde.some(
        (befund) =>
          befund.status === 'ordner_unlesbar' ||
          ('dateiBasis' in befund &&
            [
              'leer',
              'archiviert',
              'gesichert_aber_nicht_entfernt',
              'reparierbar',
              'sicherung_fehlgeschlagen',
            ].includes(befund.status) &&
            befund.dateiBasis.toLowerCase() ===
              `${referenz.kurztitel}_${referenz.normgeber}`.toLowerCase()),
      ),
    };
  })(referenz);
