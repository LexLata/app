// datenordner.ts
// Ermittelt den LexLata-Datenordner und öffnet ihn im Dateimanager (Desktop).
// Das Öffnen übernimmt der native Befehl datenordner_oeffnen: Er nimmt nur einen
// relativen Ordner an, prüft ihn und öffnet nur existierende Ordner im
// Datenordner. Die Oberfläche selbst hat keine Opener-Berechtigung.
//
// Pfad-Auflösung bewusst NICHT über Tauris BaseDirectory.AppData: das würde
// den Datenordner nach dem Identifier benennen ("org.lexlata"), wie es die
// meisten anderen macOS-Apps in Application Support nicht handhaben. Wir
// lösen daher selbst über localDataDir() (= Basisverzeichnis OHNE
// Identifier-Suffix, macOS: ~/Library/Application Support) + eigenem
// "LexLata"-Unterordner auf. Gegenstück in Rust: app_daten_basis_pfad() in
// lib.rs (dort weiterhin nötig für main.rs-Setup/fenster.rs, siehe dort).
// Der aufgelöste Pfad wird für die Laufzeit der App gecacht (ändert sich nie).
// Der Pfadhelfer wird erst beim Aufruf geladen, damit dieses früh geladene
// Modul (über die Banner) die Pfadauflösung nicht vorzeitig festlegt.
// Dateizugriffe darin bündelt persistenz/kern/dateizugriff/appDatenZugriff.ts.
import { rufeBefehl } from './tauri-befehle/tauri-befehle.index';

const APP_ORDNER_NAME = 'LexLata';

let basisPfadPromise: Promise<string> | null = null;

/** Absoluter Pfad des LexLata-Datenordners. */
export function appDatenBasisPfad(): Promise<string> {
  if (!basisPfadPromise) {
    basisPfadPromise = import('@tauri-apps/api/path').then(async ({ join, localDataDir }) =>
      join(await localDataDir(), APP_ORDNER_NAME),
    );
  }
  return basisPfadPromise;
}

/** Öffnet den Datenordner; mit einer Datei (relativ zum Datenordner) den
 * Ordner, in dem sie liegt. Ordner außerhalb des Datenordners lehnt der native
 * Befehl ab (abgelehntes Promise). */
export async function oeffneDatenordner(datei?: string): Promise<void> {
  const ordner = datei?.split(/[\\/]/).slice(0, -1).join('/');
  await rufeBefehl('datenordner_oeffnen', ordner ? { relativerOrdner: ordner } : {});
}
