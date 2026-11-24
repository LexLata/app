// Gemeinsame Quellkoordination, Dateisperre, Pfade und Ergebnistypen der Markierungspersistenz.
import { MARKIERUNGEN_ORDNER } from '@/lib/persistenz/kern/kern.index';
import { MARKIERUNGEN_SUFFIX } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  merkePruefpflichtigeAenderungVor,
  schliessePruefpflichtigeQuelleAb,
  sicherstelleOrdner as sicherstelleOrdnerBasis,
  mitGesetzDateiSperre,
  ermittleGesetzDateipfad,
} from '@/lib/persistenz/kern/kern.index';
import {
  meldeMarkierungGeaendert,
  meldeMarkierungenBulkGeaendert,
} from './markierungSpeicher.ereignisse';
export type {
  VerweisInhalt,
  Elementstand,
  MarkierungsEintrag,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
export { MARKIERUNGEN_ORDNER } from '@/lib/persistenz/kern/kern.index';
/** Interne Quellkoordination: Vormerken vor der Sperre, Abschluss und Meldung
 * nach ihrer Freigabe. Auch eine erfolgreiche Archivierung ist eine Änderung. */
export async function mitMarkierungsQuelle<T>(
  gesetz: Gesetzesreferenz,
  aktion: (token: string, vorgang: string, geaendert: (schluessel?: string) => void) => Promise<T>,
  sperren?: (ausfuehren: (token: string) => Promise<T>) => Promise<T>,
  pruefungAbwarten = false,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const vorgang = await merkePruefpflichtigeAenderungVor(meldungEmpfangen);
  let veraendert = false;
  let schluessel: string | undefined;
  let bulk = false;
  let ergebnis: T;
  try {
    const ausfuehren = (token: string) =>
      aktion(token, vorgang, (neuerSchluessel) => {
        veraendert = true;
        if (neuerSchluessel === undefined) bulk = true;
        if (!bulk) schluessel = neuerSchluessel;
      });
    ergebnis = await (sperren
      ? sperren(ausfuehren)
      : mitGesetzDateiSperre(
          gesetz,
          MARKIERUNGEN_ORDNER,
          MARKIERUNGEN_SUFFIX,
          ausfuehren,
          meldungEmpfangen,
        ));
  } catch (fehler) {
    await schliessePruefpflichtigeQuelleAb(vorgang, 'fehlgeschlagen', meldungEmpfangen);
    if (veraendert) void meldeMarkierungenBulkGeaendert(gesetz, vorgang, meldungEmpfangen);
    throw fehler;
  }
  let pruefung: Promise<unknown[]> | undefined;
  let abschluss: boolean;
  try {
    abschluss = await schliessePruefpflichtigeQuelleAb(
      vorgang,
      veraendert ? 'geaendert' : 'unveraendert',
      meldungEmpfangen,
    );
  } finally {
    if (veraendert) {
      pruefung =
        bulk || schluessel === undefined
          ? meldeMarkierungenBulkGeaendert(gesetz, vorgang, meldungEmpfangen)
          : meldeMarkierungGeaendert(gesetz, schluessel, vorgang, meldungEmpfangen);
    }
  }
  if (pruefungAbwarten) {
    if (abschluss === false) throw new Error('Der Prüfabschluss konnte nicht bestätigt werden.');
    const fehler = await pruefung;
    if (fehler?.length)
      throw new AggregateError(
        fehler,
        'Die gespeicherten Markierungen konnten nicht vollständig geprüft werden.',
      );
  }
  return ergebnis;
}

/** Ergebnis der Bearbeitung: gefunden unverändert, gespeichert oder nicht gefunden. */
export type AktualisierenErgebnis = 'geaendert' | 'unveraendert' | 'nichtGefunden';

/** Interne Ordneranlage für Schreibabläufe. */
export async function sicherstelleOrdner(): Promise<void> {
  await sicherstelleOrdnerBasis(MARKIERUNGEN_ORDNER);
}

/** Interne Pfadauflösung für Markierungsdateizugriffe. */
export async function ermittleMarkierungsDateipfad(gesetz: Gesetzesreferenz): Promise<string> {
  return ermittleGesetzDateipfad(gesetz, MARKIERUNGEN_ORDNER, MARKIERUNGEN_SUFFIX);
}
/** Unveränderte Bearbeitungen schreiben und melden nichts. Die synchrone
 * fachliche Bearbeitung darf den geladenen Bestand nicht mutieren. */
export type EintragsAenderung<T> =
  | { art: 'unveraendert'; ergebnis: T }
  | { art: 'geaendert'; eintraege: readonly MarkierungsEintrag[]; ergebnis: T };

/** Ergebnis beruht auf dem Schreiben; spätere Fehler entfernen keinen Erfolg. */
export type MarkierungsSchreibErgebnis<T> =
  | {
      status: 'geaendert' | 'unveraendert';
      ergebnis: T;
      nachgelagerterFehler?: unknown;
    }
  | { status: 'fehlgeschlagen'; fehler: unknown };
