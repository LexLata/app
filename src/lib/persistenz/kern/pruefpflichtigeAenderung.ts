// Verpflichtender technischer Vorab-/Abschlusskanal für prüfrelevante Quell-I/O.
// Der Empfänger verantwortet dauerhaften Bedarf und native Vorgangskoordination;
// dieser Kanal kennt weder fachliche Quellen noch deren Persistenzformate.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from './persistenzMeldung';

export type PruefpflichtigerQuellabschluss = 'geaendert' | 'unveraendert' | 'fehlgeschlagen';

export interface PruefpflichtigeAenderungEmpfaenger {
  /** Registriert nativ und schreibt den Bedarf dauerhaft, bevor die Quelle gesperrt wird. */
  vormerken: (meldungEmpfangen?: AktionsMeldungEmpfaenger) => Promise<string>;
  /** Nach Freigabe der Quellsperre. Bei Änderung bleibt die Prüfung separat ausstehend. */
  abschliessen: (
    vorgang: string,
    ergebnis: PruefpflichtigerQuellabschluss,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ) => Promise<void>;
}

let empfaenger: PruefpflichtigeAenderungEmpfaenger | undefined;

/** Synchron und ohne I/O anmelden. Derselbe Empfänger darf wiederholt angemeldet werden. */
export function registrierePruefpflichtigeAenderung(
  neuerEmpfaenger: PruefpflichtigeAenderungEmpfaenger,
): void {
  if (empfaenger && empfaenger !== neuerEmpfaenger)
    throw new Error('Der Empfänger für prüfpflichtige Änderungen ist bereits angemeldet.');
  empfaenger = neuerEmpfaenger;
}

/** Vor Quelldateisperre aufrufen; ohne erfolgreichen Empfang keinerlei Quell-I/O. */
export async function merkePruefpflichtigeAenderungVor(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string> {
  try {
    if (!empfaenger)
      throw new Error('Der Empfänger für prüfpflichtige Änderungen ist nicht initialisiert.');
    return await (meldungEmpfangen
      ? empfaenger.vormerken(meldungEmpfangen)
      : empfaenger.vormerken());
  } catch (fehler) {
    meldePersistenzBefund(
      {
        typ: 'fehler',
        art: 'fehler',
        anlass: 'pruefbedarf',
        aenderungsstand: 'keine',
        text: 'Der Prüfbedarf konnte nicht vorgemerkt werden. Die Änderung wird nicht gespeichert.',
      },
      meldungEmpfangen,
    );
    throw fehler;
  }
}

/** Meldet den Quellabschluss nach Quellfreigabe. Transportfehler werden angezeigt,
 * aber nicht als Quelldaten-Speicherfehler weitergegeben. false bedeutet, dass der
 * Abschluss nicht bestätigt ist; der vorgemerkte Bedarf bleibt bestehen.
 */
export async function schliessePruefpflichtigeQuelleAb(
  vorgang: string,
  ergebnis: PruefpflichtigerQuellabschluss,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  try {
    if (!empfaenger)
      throw new Error('Der Empfänger für prüfpflichtige Änderungen ist nicht initialisiert.');
    if (meldungEmpfangen) await empfaenger.abschliessen(vorgang, ergebnis, meldungEmpfangen);
    else await empfaenger.abschliessen(vorgang, ergebnis);
    return true;
  } catch (fehler) {
    console.error('Prüfpflichtiger Quellabschluss fehlgeschlagen:', fehler);
    meldePersistenzBefund(
      {
        typ: 'fehler',
        art: 'hinweis',
        anlass: 'pruefabschluss',
        aenderungsstand: ergebnis === 'geaendert' ? 'vollstaendig' : 'keine',
        text:
          ergebnis === 'geaendert'
            ? 'Die Änderung wurde gespeichert. Der Prüfabschluss konnte nicht bestätigt werden; bitte vollständig neu prüfen.'
            : 'Der Prüfabschluss konnte nicht bestätigt werden; bitte vollständig neu prüfen.',
      },
      meldungEmpfangen,
    );
    return false;
  }
}
