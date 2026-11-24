// Hält die prozessweite Dateisperre für den gesamten Lese-Ändern-Schreiben-Zyklus.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/persistenzMeldung';

// Nur für die Lebensdauer tatsächlich erworbener Sperren; keine fachlichen Daten.
const abschlussaktionen = new Map<string, Set<() => Promise<void>>>();

export function nachDateiSperrenFreigabe(token: string, aktion: () => Promise<void>): void {
  const aktionen = abschlussaktionen.get(token);
  if (!aktionen) throw new Error('Die Dateisperre ist nicht aktiv.');
  aktionen.add(aktion);
}

export function istDateiSperreWartefrist(fehler: unknown): boolean {
  return fehler === 'wartefrist';
}

export async function mitDateiSperre<T>(
  relativerPfad: string,
  aktion: (token: string) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  let token: string;
  try {
    token = await rufeBefehl('datei_sperre_erwerben', { relativerPfad });
  } catch (fehler) {
    if (istDateiSperreWartefrist(fehler)) {
      meldePersistenzBefund(
        {
          anlass: 'dateisperre',
          art: 'fehler',
          aenderungsstand: 'keine',
          typ: 'warnung',
          text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
        },
        meldungEmpfangen,
      );
    } else {
      meldePersistenzBefund(
        {
          anlass: 'dateisperre',
          art: 'fehler',
          aenderungsstand: 'keine',
          typ: 'fehler',
          text: 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
        },
        meldungEmpfangen,
      );
    }
    throw fehler;
  }
  const aktionen = new Set<() => Promise<void>>();
  abschlussaktionen.set(token, aktionen);
  try {
    return await aktion(token);
  } finally {
    let freigegeben = false;
    try {
      await rufeBefehl('datei_sperre_freigeben', { token });
      freigegeben = true;
    } catch (fehler) {
      console.error('Dateisperre konnte nicht freigegeben werden:', fehler);
    } finally {
      abschlussaktionen.delete(token);
    }
    if (freigegeben) await fuehreAbschlussaktionenAus(aktionen);
  }
}

export type UnterbrechungsErgebnis<T> = { unveraendert: boolean } & (
  { erfolg: true; wert: T } | { erfolg: false; fehler: unknown }
);

/** Gibt eine gehaltene Sperre für `aktion` frei und übernimmt sie danach wieder.
 * Der Token bleibt gleich, erlaubt währenddessen aber keine Zugriffe. Ein Fehler
 * der Aktion wird erst nach dem Fortsetzen zurückgegeben; scheitert das
 * Fortsetzen, ist die Sperre verloren und der Fehler wird geworfen. */
export async function unterbrecheDateiSperre<T>(
  token: string,
  aktion: () => Promise<T>,
): Promise<UnterbrechungsErgebnis<T>> {
  await rufeBefehl('datei_sperre_unterbrechen', { token });
  let ergebnis: { erfolg: true; wert: T } | { erfolg: false; fehler: unknown };
  try {
    ergebnis = { erfolg: true, wert: await aktion() };
  } catch (fehler) {
    ergebnis = { erfolg: false, fehler };
  }
  const unveraendert = await rufeBefehl('datei_sperre_fortsetzen', { token });
  if (typeof unveraendert !== 'boolean') throw new Error('Ungültiger nativer Fortsetzungsstand');
  return { unveraendert, ...ergebnis };
}

async function fuehreAbschlussaktionenAus(aktionen: Set<() => Promise<void>>) {
  for (const abschluss of aktionen) {
    try {
      await abschluss();
    } catch (fehler) {
      console.error('Abschlussmeldung nach Dateisperre fehlgeschlagen:', fehler);
    }
  }
}

/** Einheitliche Reihenfolge; bereits erworbene Sperren bleiben bis zum Ende gehalten. */
export async function mitDateiSperren<T>(
  pfade: readonly string[],
  aktion: (tokens: ReadonlyMap<string, string>) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const sortiert = [...new Set(pfade)].sort();
  const tokens = new Map<string, string>();
  const erwerben = async (index: number): Promise<T> => {
    const pfad = sortiert[index];
    if (pfad === undefined) return aktion(tokens);
    return mitDateiSperre(
      pfad,
      async (token) => {
        const ersterToken = tokens.values().next().value;
        if (ersterToken !== undefined) {
          const gemeinsameAktionen = abschlussaktionen.get(ersterToken);
          // Nur Registrierungen gehen zum äußersten Abschluss. Das lokale Set der
          // inneren Sperre bleibt leer; es läuft erst nach der letzten Freigabe.
          if (gemeinsameAktionen) abschlussaktionen.set(token, gemeinsameAktionen);
        }
        tokens.set(pfad, token);
        return erwerben(index + 1);
      },
      meldungEmpfangen,
    );
  };
  return erwerben(0);
}
