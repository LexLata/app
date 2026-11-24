// Einzelnes GesetzesXML lesen, Titel ergänzen und ungültige Dateien sichern.
import {
  type AktionsMeldung,
  type AktionsMeldungEmpfaenger,
  erzeugeAktionsMeldungsWeiterleitung,
} from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  hatNormenOhneTitel,
  ladeNichtamtlicheTitel,
  wendeNichtamtlicheTitelAn,
} from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.laden';
import {
  appDatenLesen,
  ermittleGesetzDateipfad,
  meldePersistenzBefund,
} from '@/lib/persistenz/kern/kern.index';
import { meldeGesetzLesebefund } from './gesetzSpeicher.befunde';
import { dateiname } from './gesetzSpeicher.dateien';
import {
  erkenneReparaturziel,
  parsePassendesGesetz,
  pruefeDatei,
  sichereUngueltigeGesetzDatei,
} from './gesetzSpeicher.sicherung';
import {
  fehlertext,
  GESETZE_ORDNER,
  type GesetzLadeBefund,
  type LadeErgebnis,
} from './gesetzSpeicher.typen';

async function ergaenzeTitel(
  gesetz: GesetzDarstellung,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<LadeErgebnis> {
  try {
    if (hatNormenOhneTitel(gesetz)) {
      const titelMap = await ladeNichtamtlicheTitel(gesetz, meldungEmpfangen);
      if (titelMap) wendeNichtamtlicheTitelAn(gesetz, titelMap);
    }
  } catch {
    // Optionale Titel dürfen ein gültiges Gesetz nicht aus dem Bestand entfernen.
  }
  return { gesetz };
}

export async function leseGesetzdatei(
  dateiBasis: string,
  pfad = dateiname(dateiBasis),
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<LadeErgebnis> {
  const pruefung = await pruefeDatei(dateiBasis, pfad, meldungEmpfangen);
  if (pruefung.status === 'gueltig') return ergaenzeTitel(pruefung.gesetz, meldungEmpfangen);
  if (pruefung.status !== 'ungueltig') return { befund: pruefung };
  const reparaturziel = erkenneReparaturziel(dateiBasis, pruefung.inhalt);
  if (reparaturziel) return { befund: reparaturziel };
  return ladeUngueltigesGesetz(dateiBasis, pfad, pruefung.inhalt, meldungEmpfangen);
}

function istSicherungsfehler(meldung: AktionsMeldung): boolean {
  return meldung.anlass === 'sicherung' && meldung.art === 'fehler';
}

async function ladeUngueltigesGesetz(
  dateiBasis: string,
  pfad: string,
  inhalt: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<LadeErgebnis> {
  let sicherungsfehlerGemeldet = false;
  const empfangen = erzeugeAktionsMeldungsWeiterleitung(meldungEmpfangen, (meldung) => {
    sicherungsfehlerGemeldet ||= istSicherungsfehler(meldung);
    meldePersistenzBefund(meldung, meldungEmpfangen);
  });
  try {
    // pruefeDatei hat genau diesen Inhalt bereits als ungültig erkannt.
    const ergebnis = await sichereUngueltigeGesetzDatei(dateiBasis, inhalt, {
      meldungEmpfangen: empfangen,
      alsUngueltigGeprueft: true,
    });
    if (ergebnis.status !== 'gueltig') return { befund: { ...ergebnis, dateiBasis } };
    const gesetz = parsePassendesGesetz(dateiBasis, ergebnis.inhalt);
    if (!gesetz)
      throw new Error('Der zwischenzeitlich geprüfte Gesetzinhalt ist nicht mehr gültig.');
    return ergaenzeTitel(gesetz, meldungEmpfangen);
  } catch (fehler) {
    return ladeGesetzNachSicherungsfehler(dateiBasis, pfad, fehler, {
      meldungEmpfangen,
      sicherungsfehlerGemeldet,
    });
  }
}

/** Nach einem Sicherungsfehler kann eine inzwischen gültige Datei weiter geladen werden. */
async function ladeGesetzNachSicherungsfehler(
  dateiBasis: string,
  pfad: string,
  fehler: unknown,
  {
    meldungEmpfangen,
    sicherungsfehlerGemeldet,
  }: {
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
    sicherungsfehlerGemeldet: boolean;
  },
): Promise<LadeErgebnis> {
  const aktuell = await pruefeDatei(dateiBasis, pfad, meldungEmpfangen);
  if (aktuell.status === 'gueltig') return ergaenzeTitel(aktuell.gesetz, meldungEmpfangen);
  if (aktuell.status !== 'ungueltig') return { befund: aktuell };
  const befund: GesetzLadeBefund = {
    status: 'sicherung_fehlgeschlagen',
    dateiBasis,
    fehler: fehlertext(fehler),
  };
  if (meldungEmpfangen && !sicherungsfehlerGemeldet)
    meldeGesetzLesebefund(befund, meldungEmpfangen);
  return { befund };
}

/** Gibt das rohe XML eines Gesetzes für den Export zurück, oder null, wenn es
 * nicht gelesen werden kann. */
export async function ladeGesetzesXML(
  referenz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  const pfad = await ermittleGesetzDateipfad(referenz, GESETZE_ORDNER);
  try {
    return await appDatenLesen(pfad, undefined, meldungEmpfangen);
  } catch {
    return null;
  }
}
