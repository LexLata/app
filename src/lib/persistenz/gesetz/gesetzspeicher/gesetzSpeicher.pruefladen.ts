// Strikt lesender Prüfbestand der Gesetz- und Titelquellen.
import { NICHTAMTLICHE_TITEL_SUFFIX } from '@/lib/persistenz/kern/kern.index';
import { type AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  hatNormenOhneTitel,
  wendeNichtamtlicheTitelAn,
} from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.laden';
import { NICHTAMTLICHE_TITEL_ORDNER } from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher';
import { ladeNichtamtlicheTitelFuerPruefung } from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.pruefen';
import {
  appDatenExistiert,
  appDatenLesen,
  appDatenOrdnerLesen,
  normalisierteDateiBasis,
  ermittleGesetzDateipfad,
  referenzAusDateiBasis,
} from '@/lib/persistenz/kern/kern.index';
import { meldeStriktenGesetzbefund } from './gesetzSpeicher.befunde';
import { gruppiereDateinamen } from './gesetzSpeicher.dateien';
import { erkenneReparaturziel, parsePassendesGesetz } from './gesetzSpeicher.sicherung';
import {
  BeschaedigteGesetzdateiFehler,
  GESETZE_ORDNER,
  GesetzquellenPruefungFehler,
} from './gesetzSpeicher.typen';

async function leseGesetzFuerPruefung(
  dateiBasis: string,
  pfad: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung | null> {
  let inhalt: string;
  try {
    inhalt = await appDatenLesen(pfad, undefined, meldungEmpfangen);
  } catch (lesefehler) {
    try {
      if (!(await appDatenExistiert(pfad))) return null;
    } catch (existenzfehler) {
      throw new AggregateError(
        [lesefehler, existenzfehler],
        'Gesetzdatei konnte weder gelesen noch auf Existenz geprüft werden.',
        { cause: existenzfehler },
      );
    }
    throw lesefehler;
  }
  const gesetz = parsePassendesGesetz(dateiBasis, inhalt);
  if (!gesetz) {
    const grund = !inhalt.trim()
      ? 'leer'
      : erkenneReparaturziel(dateiBasis, inhalt)
        ? 'reparierbar'
        : 'beschaedigt';
    throw new BeschaedigteGesetzdateiFehler(
      referenzAusDateiBasis(dateiBasis),
      dateiBasis,
      inhalt,
      grund,
    );
  }
  return gesetz;
}

/** Strikt lesende amtliche Gesetzquelle unter einer bereits gehaltenen Sperre.
 * Der Besitzer gibt die Sperren frei; keine Reparatur. Ohne Titelquelle bleibt
 * das Ergebnis amtlich. Eine mit Pfad und Token übergebene gehaltene Titelquelle
 * wird strikt ergänzt; Beschädigung und Ladefehler werden weitergegeben. */
export async function ladeGesetzFuerVerknuepfung(
  ref: Gesetzesreferenz,
  quelle: { pfad: string; token: string },
  titelquelle?: { pfad: string; token: string },
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung | null> {
  if (!quelle.token) throw new Error('Für die Gesetzquelle fehlt der Sperr-Token.');
  const dateiBasis = quelle.pfad.slice(GESETZE_ORDNER.length + 1, -4);
  const dateiRef = referenzAusDateiBasis(dateiBasis);
  if (
    !quelle.pfad.startsWith(`${GESETZE_ORDNER}/`) ||
    !quelle.pfad.toLowerCase().endsWith('.xml') ||
    !dateiRef ||
    normalisierteDateiBasis(dateiRef) !== normalisierteDateiBasis(ref)
  )
    throw new Error('Die gesperrte Quelle gehört nicht zur Gesetzesreferenz.');
  const gesetz = await leseGesetzFuerPruefung(dateiBasis, quelle.pfad, meldungEmpfangen);
  if (titelquelle) {
    const erwartet = await ermittleGesetzDateipfad(
      ref,
      NICHTAMTLICHE_TITEL_ORDNER,
      NICHTAMTLICHE_TITEL_SUFFIX,
    );
    if (!titelquelle.token || titelquelle.pfad !== erwartet)
      throw new Error('Die gesperrte Titelquelle gehört nicht zur Gesetzesreferenz.');
    const fehler: unknown[] = [];
    await ergaenzeTitelFuerPruefung(ref, gesetz, fehler, meldungEmpfangen);
    if (fehler.length) throw new GesetzquellenPruefungFehler(fehler);
  }
  return gesetz;
}

async function ergaenzeTitelFuerPruefung(
  ref: Gesetzesreferenz,
  gesetz: GesetzDarstellung | null,
  fehler: unknown[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  // Auch für beschädigte Gesetze und Gesetze mit amtlichen Titeln prüfen.
  try {
    const titel = await ladeNichtamtlicheTitelFuerPruefung(ref, meldungEmpfangen);
    if (gesetz && titel && hatNormenOhneTitel(gesetz)) wendeNichtamtlicheTitelAn(gesetz, titel);
  } catch (befund) {
    fehler.push(befund);
  }
}

function istGesetzdatei(eintrag: { name: string; isDirectory?: boolean }): boolean {
  return !eintrag.isDirectory && !!eintrag.name?.toLowerCase().endsWith('.xml');
}

async function leseGesetzordnerFuerPruefung() {
  try {
    return await appDatenOrdnerLesen(GESETZE_ORDNER);
  } catch (fehler) {
    if (!(await appDatenExistiert(GESETZE_ORDNER))) return [];
    throw fehler;
  }
}

/** Frischer vollständiger Prüfbestand. Kein Schreiben, Heilen oder Teilbestand. */
export async function ladeAlleGesetzeFuerPruefung(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung[]> {
  return ladePruefgesetze(undefined, meldungEmpfangen);
}

/** Frische Quellen ausschließlich für die vollständigen angeforderten Referenzen.
 * Fehlende Gesetze fehlen im Ergebnis; relevante Ladefehler bleiben strikt.
 * Der Ordner wird weiterhin auf konkurrierende Schreibweisen dieser Referenzen geprüft. */
export async function ladeGesetzeFuerPruefung(
  referenzen: readonly Gesetzesreferenz[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung[]> {
  if (referenzen.length === 0) return [];
  return ladePruefgesetze(new Set(referenzen.map(normalisierteDateiBasis)), meldungEmpfangen);
}

function istAngeforderteReferenz(
  ref: Gesetzesreferenz | null,
  umfang: ReadonlySet<string> | undefined,
): boolean {
  return umfang === undefined || (ref !== null && umfang.has(normalisierteDateiBasis(ref)));
}

async function ladePruefgesetze(
  umfang: ReadonlySet<string> | undefined,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung[]> {
  let eintraege;
  try {
    eintraege = await leseGesetzordnerFuerPruefung();
  } catch (fehler) {
    meldeStriktenGesetzbefund(
      'Der Gesetzordner konnte nicht geprüft werden',
      fehler,
      meldungEmpfangen,
    );
    throw fehler;
  }
  const dateienJeReferenz = gruppiereDateinamen(eintraege);
  const dateien = eintraege.filter(
    (eintrag) =>
      istGesetzdatei(eintrag) &&
      istAngeforderteReferenz(referenzAusDateiBasis(eintrag.name.slice(0, -4)), umfang),
  );
  const gesetze: GesetzDarstellung[] = [];
  const fehler: unknown[] = [];
  for (const eintrag of dateien) {
    const dateiBasis = eintrag.name.slice(0, -4);
    const ref = referenzAusDateiBasis(dateiBasis);
    const konkurrenten = ref ? dateienJeReferenz.get(normalisierteDateiBasis(ref)) : undefined;
    if (konkurrenten && konkurrenten.length > 1) {
      const befund = new Error(
        `Mehrere Dateien für dieselbe Gesetzesreferenz: ${konkurrenten.join(', ')}`,
      );
      fehler.push(befund);
      meldeStriktenGesetzbefund(
        'Die Gesetzdatei konnte nicht eindeutig zugeordnet werden',
        befund,
        meldungEmpfangen,
      );
    }
    let gesetz: GesetzDarstellung | null = null;
    try {
      gesetz = await leseGesetzFuerPruefung(
        dateiBasis,
        `${GESETZE_ORDNER}/${eintrag.name}`,
        meldungEmpfangen,
      );
    } catch (befund) {
      fehler.push(befund);
      meldeStriktenGesetzbefund(
        `Die Gesetzdatei „${eintrag.name}“ konnte nicht geprüft werden`,
        befund,
        meldungEmpfangen,
      );
    }
    if (ref) await ergaenzeTitelFuerPruefung(ref, gesetz, fehler, meldungEmpfangen);
    if (gesetz) gesetze.push(gesetz);
  }
  if (fehler.length) throw new GesetzquellenPruefungFehler(fehler);
  return gesetze.sort((a, b) => a.kurztitel.localeCompare(b.kurztitel, 'de'));
}
