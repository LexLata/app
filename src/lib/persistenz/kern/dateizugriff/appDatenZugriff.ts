// appDatenZugriff.ts
//
// Pfadauflösung und Dateizugriffe für die AppData-Persistenz-Dateien
// (gesetzSpeicher, markierungSpeicher, favoritenSpeicher,
// nichtamtlicheTitelSpeicher, …). Der bestehende Pfadcache und die
// Nebenwirkungen der Dateizugriffe bleiben hier gebündelt.
//
// Den Datenordner selbst ermittelt appDatenBasisPfad() in
// plattform/datenordner.ts.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { appDatenBasisPfad } from '@/lib/plattform/datenordner';

import {
  mkdir,
  readTextFile,
  readDir,
  exists,
  type ReadFileOptions,
  type ReadDirOptions,
  type ExistsOptions,
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { pruefeSchemaversion } from '@/lib/persistenz/kern/schemaversionHinweis';

/** Löst einen relativen AppData-Pfad (z.B. "markierungen/BGB.xml") zum
 *  absoluten Pfad im LexLata-Datenordner auf. */
async function appDatenPfad(relativerPfad: string): Promise<string> {
  return join(await appDatenBasisPfad(), relativerPfad);
}

// ---------------------------------------------------------------------------
// Dünne Wrapper um die Standard-fs-Funktionen: ersetzen das frühere Muster
// "fsFunktion(relativerPfad, { baseDir: BaseDirectory.AppData })" – jetzt
// ohne baseDir-Option, da appDatenPfad() bereits einen absoluten Pfad liefert.
// ---------------------------------------------------------------------------

/** Rohzugriff für die Versionserkennung innerhalb eines gesperrten Schreibvorgangs. */
export async function appDatenLesenOhneHinweis(
  relativerPfad: string,
  optionen?: Omit<ReadFileOptions, 'baseDir'>,
): Promise<string> {
  return readTextFile(await appDatenPfad(relativerPfad), optionen);
}

/** Liest eine Textdatei relativ zum LexLata-AppData-Ordner. Fehler des
 * Dateisystems (insbesondere eine fehlende Datei) werden durchgereicht. */
export async function appDatenLesen(
  relativerPfad: string,
  optionen?: Omit<ReadFileOptions, 'baseDir'>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string> {
  const inhalt = await appDatenLesenOhneHinweis(relativerPfad, optionen);
  await pruefeSchemaversion(
    inhalt,
    meldungEmpfangen
      ? (meldung) => {
          // Pfad nur in der Konsole; die Anzeige nennt den Dateinamen.
          console.info(`${relativerPfad}: ${meldung.text}`);
          meldungEmpfangen({ ...meldung, betroffen: relativerPfad.split('/').at(-1) });
        }
      : undefined,
  );
  return inhalt;
}

/** Liest eine optionale AppData-Textdatei. Jeder Lesefehler wird wie eine
 * fehlende Datei behandelt; dieser Vertrag entspricht den Rohtext-Lesern
 * für den Datei-Import. */
export async function appDatenLesenOderNull(
  relativerPfad: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  try {
    return await appDatenLesen(relativerPfad, undefined, meldungEmpfangen);
  } catch {
    return null;
  }
}

/** Schreibt eine Textdatei crash-sicher relativ zum LexLata-AppData-Ordner. */
export async function appDatenSchreiben(
  relativerPfad: string,
  inhalt: string,
  token?: string,
  vorgang?: string,
): Promise<void> {
  await rufeBefehl('atomar_datei_schreiben', {
    relativerPfad,
    inhalt,
    ...(token === undefined ? {} : { token }),
    ...(vorgang === undefined ? {} : { vorgang }),
  });
}

/** Ausschließlich unveränderter Gesetzbestand mit aufgefrischter Verarbeitungszeit.
 * Native Prüfung des aktuellen Dateiinhalts erfolgt unter beiden Sperren. */
export async function appDatenVerarbeitungszeitAuffrischen(
  relativerPfad: string,
  inhalt: string,
  token: string,
): Promise<void> {
  await rufeBefehl('atomar_datei_schreiben', {
    relativerPfad,
    inhalt,
    token,
    nurVerarbeitungszeit: true,
  });
}

/** Löscht eine Datei nativ koordiniert; native Fehler werden durchgereicht. */
export async function appDatenLoeschen(
  relativerPfad: string,
  token?: string,
  vorgang?: string,
): Promise<void> {
  await rufeBefehl('app_daten_loeschen', {
    relativerPfad,
    ...(token === undefined ? {} : { token }),
    ...(vorgang === undefined ? {} : { vorgang }),
  });
}

/** Liest die Einträge eines Ordners relativ zum LexLata-AppData-Ordner. */
export async function appDatenOrdnerLesen(
  relativerPfad: string,
  optionen?: Omit<ReadDirOptions, 'baseDir'>,
) {
  return readDir(await appDatenPfad(relativerPfad), optionen);
}

/** Prüft, ob ein relativer Pfad im LexLata-AppData-Ordner existiert. */
export async function appDatenExistiert(
  relativerPfad: string,
  optionen?: Omit<ExistsOptions, 'baseDir'>,
): Promise<boolean> {
  return exists(await appDatenPfad(relativerPfad), optionen);
}

/** Gemeinsamer AppData-Unterordner für gesetzeskurzbefehle.xml und die beiden
 *  Fenstergeometrie-JSONs (haupt-/letzte-fenster-geometrie.json, siehe
 *  useFensterRestore.ts) – rein organisatorisch (Absprache), kein
 *  inhaltlicher Zusammenhang zwischen den drei Dateien. Bewusst HIER statt
 *  in gesetzeskurzbefehlSpeicher.ts oder useFensterRestore.ts definiert, da beide
 *  Dateien sich den Ordner teilen und keine der beiden die "Eigentümerin"
 *  des Ordnerkonzepts ist. Enthält auch einstellungen-backup.xml als Kopie der exportierbaren Einstellungen;
 *  deren Laufzeitquelle bleibt localStorage, siehe einstellungenBackup.ts. */
export const EINSTELLUNGEN_ORDNER = 'einstellungen';

/** Stellt sicher, dass der übergebene Ordner unter AppData existiert.
 *  Ignoriert den Fehlerfall "existiert bereits" bewusst still. */
export async function sicherstelleOrdner(ordner: string): Promise<void> {
  try {
    await mkdir(await appDatenPfad(ordner), { recursive: true });
  } catch {
    // Ordner existiert bereits
  }
}
