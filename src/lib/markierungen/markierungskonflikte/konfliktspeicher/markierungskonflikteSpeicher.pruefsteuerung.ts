// Reiht Vollprüfungen und die begrenzte Wiederholung in die gemeinsame Prüfkette ein.
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { erfasseAktionsFolgelauf } from '@/lib/domain/app/aktionsMeldung';

import {
  fuehrePruefungMitFehlerabschluss,
  fuehreVollpruefungAus,
  istVollpruefungErforderlich,
  meldePruefungsfehler,
} from './markierungskonflikteSpeicher.pruefdurchlauf';
import { erhalteVollbedarf, ladePruefstand } from './markierungskonflikteSpeicher.dateiZugriff';
import { reiheInPruefungsKetteEin } from './markierungskonflikteSpeicher.pruefkette';

/**
 * Berechnet markierungskonflikte.xml komplett neu (alle installierten Gesetze
 * PLUS alle vorhandenen Markierungs-XMLs, auch zu bereits gelöschten
 * Gesetzen). Kein automatischer Auslöser (siehe Datei-Kopfkommentar) – für
 * eine spätere manuelle "Neu prüfen"-Aktion bzw. den einmaligen Nachtrag bei
 * Einführung dieser Prüfung auf einem Bestand ohne markierungskonflikte.xml.
 */
export async function pruefeAlleMarkierungen(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const fehlerMeldungen: AktionsMeldung[] = [];
  await reiheInPruefungsKetteEin(
    async (token, empfangen) => {
      await fuehrePruefungMitFehlerabschluss(
        token,
        (stand) => fuehreVollpruefungAus(token, stand, empfangen),
        empfangen,
      );
    },
    true,
    true,
    true,
    false,
    meldungEmpfangen,
    fehlerMeldungen,
  ).catch(async (fehler: unknown) => {
    if (!(await pruefeEinmaligeVollwiederholung(fehler, meldungEmpfangen, fehlerMeldungen)))
      throw fehler;
  });
}

/** Nach jedem Quellenwarten frisch entscheiden: ein anderes Fenster kann schon fertig sein. */
export async function pruefeErforderlicheVollpruefung(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const fehlerMeldungen: AktionsMeldung[] = [];
  await reiheInPruefungsKetteEin(
    (token, empfangen) =>
      fuehrePruefungMitFehlerabschluss(
        token,
        async (stand) => {
          if (await istVollpruefungErforderlich(token, stand))
            await fuehreVollpruefungAus(token, stand, empfangen);
        },
        empfangen,
      ),
    true,
    'bei-vollbedarf',
    'automatisch',
    false,
    meldungEmpfangen,
    fehlerMeldungen,
  ).catch(async (fehler: unknown) => {
    if (!(await pruefeEinmaligeVollwiederholung(fehler, meldungEmpfangen, fehlerMeldungen)))
      throw fehler;
  });
}

/** Einziger automatischer Versuch: native Übernahme erst nach Quellenwarten,
 * anschließend volle Berechnung unter derselben Sperre. Dieser Auftrag stößt
 * bei eigenem Fehler keine weitere Wiederholung an. Das Ergebnis bestätigt
 * den endgültigen Erfolg; false erhält den Fehlervertrag des ursprünglichen Auftrags.
 */
export function pruefeEinmaligeVollwiederholung(
  ausloesenderFehler?: unknown,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  fehlerMeldungen: readonly AktionsMeldung[] = [],
): Promise<boolean> {
  let erfolgreich = true;
  const folgelauf = reiheInPruefungsKetteEin(
    (token, empfangen) =>
      fuehrePruefungMitFehlerabschluss(
        token,
        async (stand) => {
          if (await rufeBefehl('pruefvorgang_wiederholung_uebernehmen', { konfliktToken: token }))
            await fuehreVollpruefungAus(token, stand, empfangen);
          else if (
            ausloesenderFehler !== undefined &&
            (await erhalteVollbedarf(token, await ladePruefstand(token, empfangen))).vollbedarf
          ) {
            erfolgreich = false;
            // Keine erneute Heilung eröffnen, wenn das native Budget verbraucht ist.
            // Auch ein gescheitertes Schreiben kann einen alten aktuellen Stand hinterlassen.
            if (fehlerMeldungen.length > 0)
              for (const meldung of fehlerMeldungen)
                meldePersistenzBefund(meldung, meldungEmpfangen);
            else if (stand.pruefstatus === 'fehlgeschlagen')
              meldePruefungsfehler(ausloesenderFehler, meldungEmpfangen);
          }
        },
        empfangen,
      ),
    true,
    true,
    'uebernommen',
    false,
    meldungEmpfangen,
  ).then(
    () => erfolgreich,
    (wiederholungsfehler: unknown) => {
      console.error('Vollwiederholung fehlgeschlagen:', {
        ausloesenderFehler,
        wiederholungsfehler,
      });
      return false;
    },
  );
  erfasseAktionsFolgelauf(meldungEmpfangen, folgelauf);
  return folgelauf;
}
