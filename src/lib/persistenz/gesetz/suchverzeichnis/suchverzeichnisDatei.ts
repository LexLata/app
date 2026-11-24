// Versioniertes abgeleitetes JSON; jeder Schreibzyklus liest frisch unter Dateisperre.
import type { Suchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  appDatenLesen,
  appDatenSchreiben,
  istRecord,
  mitDateiSperre,
  sicherstelleOrdner,
} from '@/lib/persistenz/kern/kern.index';
import { istSuchverzeichniseintrag } from './suchverzeichnisValidierung';

const PFAD = 'cache/suchverzeichnis.json';
export interface Suchverzeichnis {
  abgeglichen: boolean;
  eintraege: Suchverzeichniseintrag[];
}
function leer(): Suchverzeichnis {
  return { abgeglichen: false, eintraege: [] };
}
async function leseDatei(): Promise<Suchverzeichnis | null> {
  try {
    const wert: unknown = JSON.parse(await appDatenLesen(PFAD));
    if (
      !istRecord(wert) ||
      wert.version !== 1 ||
      typeof wert.abgeglichen !== 'boolean' ||
      !Array.isArray(wert.eintraege) ||
      !wert.eintraege.every(istSuchverzeichniseintrag)
    )
      return null;
    return { abgeglichen: wert.abgeglichen, eintraege: wert.eintraege };
  } catch {
    return null;
  }
}
/** Ein unvollständiges Verzeichnis bestätigt niemals Abwesenheit. */
export async function leseSuchverzeichnis(): Promise<Suchverzeichnis> {
  return (await leseDatei()) ?? leer();
}
export async function aendereSuchverzeichnis(
  anlegen: boolean,
  aendern: (stand: Suchverzeichnis) => void | Promise<void>,
): Promise<Suchverzeichnis | null> {
  return mitDateiSperre(PFAD, async (token) => {
    const vorhanden = await leseDatei();
    if (!vorhanden && !anlegen) return null;
    const stand = vorhanden ?? leer();
    await aendern(stand);
    await sicherstelleOrdner('cache');
    await appDatenSchreiben(PFAD, JSON.stringify({ version: 1, ...stand }), token);
    return stand;
  });
}
/** Pflegefehler lassen Gesetzesoperationen erfolgreich; Entwertung wird unter Sperre versucht. */
export async function entwerteSuchverzeichnis(): Promise<void> {
  try {
    await aendereSuchverzeichnis(false, (stand) => {
      stand.abgeglichen = false;
    });
  } catch {
    /* Bei weiterhin unerreichbarer Sperre kann nur der nächste Abgleich korrigieren. */
  }
}

/** Abschluss der Kurzbefehlsbereinigung: frischer Stand bleibt bis nach der Schreibübernahme geschützt.
 * Der Aufrufer hält bereits die Kurzbefehlsdatei gesperrt; diese Funktion gibt keine Tokens heraus. */
export async function mitSuchverzeichnisFuerKurzbefehlsbereinigung(
  bereinigen: (stand: Suchverzeichnis) => Promise<void>,
): Promise<void> {
  await mitDateiSperre(PFAD, async () => {
    await bereinigen(await leseSuchverzeichnis());
  });
}
