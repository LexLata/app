// Schützt gelesene Inhalte durch native Sicherung und Inhaltsvergleich.
// Der Nutzerdaten-Lader bewahrt dabei seine bisherigen Meldungen und Rückgaben.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import {
  appDatenExistiert,
  appDatenLesen,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';

import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from './persistenzMeldung';

type ArchivierungsErgebnis = {
  status: 'archiviert' | 'fehlt' | 'veraendert' | 'gesichert_aber_nicht_entfernt';
  sicherungspfad: string | null;
};

function dateiname(relativerPfad: string): string {
  return relativerPfad.split('/').at(-1) ?? relativerPfad;
}

function zeigeLesefehler(relativerPfad: string, meldungEmpfangen?: AktionsMeldungEmpfaenger): void {
  const datei = dateiname(relativerPfad);
  meldePersistenzBefund(
    {
      anlass: 'lesen',
      art: 'fehler',
      aenderungsstand: 'keine',
      typ: 'fehler',
      grund: 'nichtLesbar',
      betroffen: datei,
      text: `Die Datei ‚${datei}' konnte nicht gelesen werden. Änderungen daran werden nicht gespeichert.`,
    },
    meldungEmpfangen,
  );
}

function zeigeSicherungsfehler(
  relativerPfad: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  const datei = dateiname(relativerPfad);
  meldePersistenzBefund(
    {
      anlass: 'sicherung',
      art: 'fehler',
      aenderungsstand: 'keine',
      typ: 'fehler',
      grund: 'sicherungFehlgeschlagen',
      betroffen: datei,
      text: `Die Datei ‚${datei}' ist beschädigt und konnte nicht gesichert werden. Änderungen daran werden nicht gespeichert.`,
    },
    meldungEmpfangen,
  );
}

/** Meldet eine erfolgte Sicherung; der Sicherungspfad steht nur in der Konsole. */
function zeigeGesichert(
  relativerPfad: string,
  ergebnis: { status: 'archiviert' | 'gesichert_aber_nicht_entfernt'; sicherungspfad: string },
  erfolgstext?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  const datei = dateiname(relativerPfad);
  console.info(`${relativerPfad}: Sicherung ${ergebnis.sicherungspfad}`);
  const archiviert = ergebnis.status === 'archiviert';
  meldePersistenzBefund(
    {
      anlass: 'sicherung',
      art: 'hinweis',
      aenderungsstand: 'teilweise',
      typ: 'warnung',
      grund: archiviert ? 'imDatenordnerGesichert' : 'gesichertNichtEntfernt',
      betroffen: datei,
      sicherung: ergebnis.sicherungspfad,
      text:
        (archiviert ? erfolgstext : undefined) ??
        (archiviert
          ? `Die Datei ‚${datei}' wurde wegen Beschädigung gesichert; ihre Inhalte werden nicht mehr angezeigt.`
          : `Die Datei ‚${datei}' wurde wegen Beschädigung gesichert, aber nicht entfernt; ihre Inhalte werden derzeit nicht angezeigt.`),
    },
    meldungEmpfangen,
  );
}

function hatWurzelTag(inhalt: string, wurzelTag: string): boolean {
  return new RegExp(`<${wurzelTag}(?:\\s|>)[\\s\\S]*</${wurzelTag}>`).test(inhalt);
}

async function leseInhalt(
  relativerPfad: string,
  bannerAnzeigen = true,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  try {
    return await appDatenLesen(relativerPfad, undefined, meldungEmpfangen);
  } catch (fehler) {
    if (!(await appDatenExistiert(relativerPfad))) return null;
    if (bannerAnzeigen || meldungEmpfangen) zeigeLesefehler(relativerPfad, meldungEmpfangen);
    throw fehler;
  }
}

async function archiviereInhalt(
  relativerPfad: string,
  erwarteterInhalt: string,
  token?: string,
  bannerAnzeigen = true,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ArchivierungsErgebnis> {
  try {
    const ergebnis = await rufeBefehl('archiviere_beschaedigte_datei', {
      relativerPfad,
      erwarteterInhalt,
      ...(token === undefined ? {} : { token }),
      ...(vorgang === undefined ? {} : { vorgang }),
    });
    if (
      !ergebnis ||
      !['archiviert', 'fehlt', 'veraendert', 'gesichert_aber_nicht_entfernt'].includes(
        ergebnis.status,
      ) ||
      !(ergebnis.sicherungspfad === null || typeof ergebnis.sicherungspfad === 'string')
    )
      throw new Error('Ungültiger nativer Archivierungsvertrag');
    return ergebnis;
  } catch (fehler) {
    if (bannerAnzeigen || meldungEmpfangen) zeigeSicherungsfehler(relativerPfad, meldungEmpfangen);
    throw fehler;
  }
}

type SicherungsErgebnis =
  | { status: 'gueltig'; inhalt: string }
  | { status: 'archiviert'; sicherungspfad: string }
  | { status: 'fehlt' }
  | { status: 'leer' }
  | { status: 'gesichert_aber_nicht_entfernt'; sicherungspfad: string };

type SicherungsOptionen = {
  /** Backup-Prüfung: auch leere Inhalte gegen ihren vollständigen Vertrag prüfen. */
  leerenInhaltPruefen?: boolean;
  vorgang?: string;
  token?: string;
  bannerAnzeigen?: boolean;
  erfolgstext?: string;
  meldungEmpfangen?: AktionsMeldungEmpfaenger;
};

function sicherungsErgebnis(
  relativerPfad: string,
  ergebnis: ArchivierungsErgebnis & { status: 'archiviert' | 'gesichert_aber_nicht_entfernt' },
  optionen: SicherungsOptionen,
): SicherungsErgebnis {
  const { bannerAnzeigen = true, erfolgstext, meldungEmpfangen } = optionen;
  // Die native API garantiert für beide Sicherungszustände einen Pfad.
  if (ergebnis.sicherungspfad === null) {
    if (bannerAnzeigen || meldungEmpfangen) zeigeSicherungsfehler(relativerPfad, meldungEmpfangen);
    throw new Error(`Die Sicherung der Datei ‚${relativerPfad}' lieferte keinen Sicherungspfad.`);
  }
  const gesichert = { status: ergebnis.status, sicherungspfad: ergebnis.sicherungspfad };
  if (bannerAnzeigen || meldungEmpfangen)
    zeigeGesichert(relativerPfad, gesichert, erfolgstext, meldungEmpfangen);
  return gesichert;
}

/** Prüft bereits gelesene Inhalte und sichert ausschließlich weiterhin
 * ungültige Inhalte. Die Gültigkeitsprüfung darf keine Nebenwirkungen haben. */
export async function sichereBeiUngueltigemInhalt(
  relativerPfad: string,
  gelesenerInhalt: string | null,
  istGueltig: (inhalt: string) => boolean,
  optionen: SicherungsOptionen = {},
): Promise<SicherungsErgebnis> {
  const { token, bannerAnzeigen = true, meldungEmpfangen } = optionen;
  let inhalt = gelesenerInhalt;

  for (let versuch = 0; versuch < 3; versuch += 1) {
    if (inhalt === null) return { status: 'fehlt' };
    if (!optionen.leerenInhaltPruefen && inhalt.trim().length === 0) return { status: 'leer' };
    if (istGueltig(inhalt)) return { status: 'gueltig', inhalt };

    const ergebnis = await archiviereInhalt(
      relativerPfad,
      inhalt,
      token,
      bannerAnzeigen,
      optionen.vorgang,
      meldungEmpfangen,
    );
    if (ergebnis.status === 'fehlt') return { status: 'fehlt' };
    if (ergebnis.status !== 'veraendert') {
      return sicherungsErgebnis(relativerPfad, { ...ergebnis, status: ergebnis.status }, optionen);
    }
    if (versuch < 2) inhalt = await leseInhalt(relativerPfad, bannerAnzeigen, meldungEmpfangen);
  }

  if (bannerAnzeigen || meldungEmpfangen) zeigeLesefehler(relativerPfad, meldungEmpfangen);
  throw new Error(`Die Datei ‚${relativerPfad}' hat sich während der Sicherung dreimal verändert.`);
}

/** Liest eine Nutzerdaten-Datei und sichert nicht leere, beschädigte Inhalte
 * vor dem nächsten regulären Schreibvorgang. */
export async function appDatenLesenGeschuetzt(
  relativerPfad: string,
  wurzelTag: string,
  token?: string,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  const inhalt = await leseInhalt(relativerPfad, true, meldungEmpfangen);
  const ergebnis = await sichereBeiUngueltigemInhalt(
    relativerPfad,
    inhalt,
    (text) => hatWurzelTag(text, wurzelTag),
    { token, vorgang, meldungEmpfangen },
  );
  if (ergebnis.status === 'gesichert_aber_nicht_entfernt') {
    // Der Sicherungspfad steht nur in der Konsole (zeigeGesichert), nicht im Fehler.
    throw new Error(
      `Die beschädigte Datei ‚${dateiname(relativerPfad)}' wurde gesichert, aber nicht entfernt.`,
    );
  }
  return ergebnis.status === 'gueltig' ? ergebnis.inhalt : null;
}
