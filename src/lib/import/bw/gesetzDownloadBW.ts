// gesetzDownloadBW.ts
// WebView-Abruf und Konvertierung ohne Erreichbarkeitsprüfung oder App-Speicherung.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { importiereGesetzHTMLBW, LANDESRECHT_BW_QUELLE } from './HTMLImporterBW';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { ImportFortschritt, ImportFehler } from '@/lib/import/importVertrag.types';
export async function ladeGesetzHTMLBW(
  eintrag: ImportindexSucheEintrag,
  fortschritt?: (f: ImportFortschritt) => void,
): Promise<{ gesamtausgabeHTML: string } | { fehler: ImportFehler }> {
  fortschritt?.({
    phase: 'download',
    meldung: `Lade Gesetz „${eintrag.kurztitel}" (WebView) …`,
  });
  try {
    const gesamtausgabeHTML = await rufeBefehl('lade_gesetz_html_bw', {
      kuerzel: eintrag.abrufkennung,
    });
    return { gesamtausgabeHTML };
  } catch (e) {
    return {
      fehler: {
        grund: 'download',
        meldung: `Gesetz „${eintrag.kurztitel}" konnte nicht von landesrecht-bw.de heruntergeladen werden: ${String(e)}`,
      },
    };
  }
}
export function parseGeladenesGesetz(
  gesamtausgabeHTML: string,
  kurztitel: string,
  fortschritt?: (f: ImportFortschritt) => void,
) {
  fortschritt?.({ phase: 'parsen', meldung: 'HTML wird importiert …' });
  return importiereGesetzHTMLBW(gesamtausgabeHTML, LANDESRECHT_BW_QUELLE, true, kurztitel);
}
