// importVorgang.ts
// Registriert und beendet Importvorgänge für die fensterübergreifende Koordination.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';

type VorgangsArt = 'manuell' | 'automatisch';

async function registriereVorgang(art: VorgangsArt): Promise<string | null> {
  try {
    if (art === 'automatisch') {
      return await rufeBefehl('import_aktualisierung_automatisch_starten');
    }
    return await rufeBefehl('import_aktualisierung_starten');
  } catch {
    // Manuelle Vorgänge bleiben in Web-Vorschau und bei fehlendem Tauri-
    // Kontext ausführbar. Automatische Vorgänge dürfen ohne atomare
    // Registrierung nicht unkoordiniert starten.
    return null;
  }
}

async function beendeVorgang(vorgangskennung: string): Promise<void> {
  try {
    await rufeBefehl('import_aktualisierung_beenden', { vorgangskennung });
  } catch {
    // Koordination darf einen bereits abgeschlossenen Import nicht nachträglich
    // in einen Fehler verwandeln. Veraltete Registrierungen werden in Rust
    // nach der bestehenden Stundenfrist entfernt.
  }
}

export async function mitManuellemImportVorgang<T>(arbeit: () => Promise<T>): Promise<T> {
  const kennung = await registriereVorgang('manuell');
  try {
    return await arbeit();
  } finally {
    if (kennung) await beendeVorgang(kennung);
  }
}

export async function mitAutomatischemImportVorgang<T>(
  arbeit: () => Promise<T>,
): Promise<{ gestartet: false } | { gestartet: true; ergebnis: T }> {
  const kennung = await registriereVorgang('automatisch');
  if (!kennung) return { gestartet: false };
  try {
    return { gestartet: true, ergebnis: await arbeit() };
  } finally {
    await beendeVorgang(kennung);
  }
}

export async function versucheGesetzSperreZuErhalten(gesetz: Gesetzesreferenz): Promise<boolean> {
  try {
    return await rufeBefehl('gesetz_import_sperre_versuchen_zu_erhalten', {
      kurztitel: gesetzesreferenzSchluessel(gesetz),
    });
  } catch {
    return true;
  }
}

export async function gibGesetzSperreFrei(gesetz: Gesetzesreferenz): Promise<void> {
  try {
    await rufeBefehl('gesetz_import_sperre_freigeben', {
      kurztitel: gesetzesreferenzSchluessel(gesetz),
    });
  } catch {
    // Web-Vorschau: keine fensterübergreifende Sperre vorhanden.
  }
}

/** Nach einem beschaeftigt-Ergebnis auf die bestehende native Sperre warten.
 * Die kurz erworbene Sperre bestätigt den Abschluss; hier startet kein Import.
 * Mit Höchstdauer endet das Warten danach ohne Sperrfreigabe mit false.
 * IPC-Fehler werden durchgereicht, niemals als freie Sperre gewertet.
 */
export async function warteAufGesetzImport(
  gesetz: Gesetzesreferenz,
  hoechstdauerMs?: number,
): Promise<boolean> {
  const args = { kurztitel: gesetzesreferenzSchluessel(gesetz) };
  const ende = hoechstdauerMs === undefined ? undefined : Date.now() + hoechstdauerMs;
  while (!(await rufeBefehl('gesetz_import_sperre_versuchen_zu_erhalten', args))) {
    if (ende !== undefined && Date.now() >= ende) return false;
    await new Promise((fertig) => setTimeout(fertig, 100));
  }
  await rufeBefehl('gesetz_import_sperre_freigeben', args);
  return true;
}
