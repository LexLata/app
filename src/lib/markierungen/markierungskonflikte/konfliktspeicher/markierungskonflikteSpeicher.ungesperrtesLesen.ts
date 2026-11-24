// Liest Prüfquellen bei unterbrochener Konfliktdateisperre und erkennt Zwischenänderungen.
import { meldePersistenzBefund, unterbrecheDateiSperre } from '@/lib/persistenz/kern/kern.index';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { erzeugeAktionsMeldungsWeiterleitung } from '@/lib/domain/app/aktionsMeldung';
import type { GeladenerPruefstand } from './markierungskonflikteSpeicher.dateiZugriff';
import { ladePruefstand, pruefvorgangsAktion } from './markierungskonflikteSpeicher.dateiZugriff';

/** Höchstzahl der Leseversuche ohne Konfliktdateisperre; danach wird unter der Sperre gelesen. */
const UNGESPERRTE_LESEVERSUCHE = 3;

type Lesen<T> = (meldungEmpfangen?: AktionsMeldungEmpfaenger) => Promise<T>;

/** Ein Leseversuch bei unterbrochener Sperre; Meldungen bleiben bis zur Übernahme gepuffert. */
async function liesUnterbrochen<T>(
  token: string,
  quellenAbwarten: boolean,
  lesen: Lesen<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) {
  const puffer: AktionsMeldung[] = [];
  const empfangen = erzeugeAktionsMeldungsWeiterleitung(meldungEmpfangen, (meldung) => {
    puffer.push(meldung);
  });
  const gelesen = await unterbrecheDateiSperre(token, async () => {
    if (quellenAbwarten) await rufeBefehl('pruefvorgang_quellen_abwarten', {});
    return lesen(empfangen);
  });
  return { gelesen, puffer };
}

/**
 * Liest Prüfquellen, während die gehaltene Konfliktdateisperre unterbrochen ist,
 * damit Speichern und Sichern ihren Prüfbedarf währenddessen vormerken können.
 * Nach dem Fortsetzen meldet die native Seite, ob sich Prüfvorgänge oder
 * markierungskonflikte.xml inzwischen geändert haben. Dann wird `stand` frisch
 * geladen und neu gelesen; Lesefehler und Meldungen verworfener Versuche zählen
 * nicht. Nach UNGESPERRTE_LESEVERSUCHE Änderungen wird unter der Sperre gelesen,
 * sodass nie ein Ergebnis aus überholten Quellen geschrieben wird. Eine
 * Vollprüfung verlangt zusätzlich, dass keine Quelle mehr offen ist.
 */
export async function liesQuellenOhneKonfliktsperre<T>(
  token: string,
  stand: GeladenerPruefstand,
  vollstaendig: boolean,
  lesen: Lesen<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const quellenOffen = async () =>
    vollstaendig && (await pruefvorgangsAktion('abfragen', token)).offeneQuellen > 0;
  const ladeFrisch = async () =>
    Object.assign(stand, await ladePruefstand(token, meldungEmpfangen));
  for (let versuch = 0; versuch < UNGESPERRTE_LESEVERSUCHE; versuch++) {
    const abwarten = vollstaendig && versuch > 0;
    const { gelesen, puffer } = await liesUnterbrochen(token, abwarten, lesen, meldungEmpfangen);
    if (!gelesen.unveraendert) await ladeFrisch();
    else if (!(await quellenOffen())) {
      for (const meldung of puffer) meldePersistenzBefund(meldung, meldungEmpfangen);
      if (!gelesen.erfolg) throw gelesen.fehler;
      return gelesen.wert;
    }
  }
  await warteAufQuellabschluesse(token, quellenOffen, ladeFrisch);
  return lesen(meldungEmpfangen);
}

/** Quellabschlüsse brauchen die Konfliktdateisperre: nur bei unterbrochener Sperre warten. */
async function warteAufQuellabschluesse(
  token: string,
  quellenOffen: () => Promise<boolean>,
  ladeFrisch: () => Promise<unknown>,
) {
  while (await quellenOffen()) {
    const gewartet = await unterbrecheDateiSperre(token, () =>
      rufeBefehl('pruefvorgang_quellen_abwarten', {}),
    );
    if (!gewartet.unveraendert) await ladeFrisch();
    if (!gewartet.erfolg) throw gewartet.fehler;
  }
}
