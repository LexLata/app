// Holt flüchtige Fensterübergaben ab und prüft ihre JSON-Nutzlast vor der Übernahme;
// native Fehler behalten den bisherigen Null-Fallback.
import { rufeBefehl } from './tauri-befehle/tauri-befehle.index';
import { liesJSON } from '@/lib/domain/uebergabePruefung';
import { istTabUebertragung } from '@/lib/domain/appUebertragungPruefung';

type UebergabeBefehl =
  'tab_uebertragung_abholen' | 'verweismarkierung_kontext_abholen' | 'kommentar_kontext_abholen';

export async function holeFensterUebergabe<T>(
  befehl: UebergabeBefehl,
  lesen: (json: string) => T | null,
): Promise<T | null> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: diese drei Befehle holen ausschließlich serialisierte Kontextdaten; die anschließende Eingangskontrolle prüft jeden Fachfall.
    const json = await rufeBefehl(befehl, { label: getCurrentWindow().label });
    return json === null ? null : lesen(json);
  } catch {
    return null;
  }
}

export function liesTabUebertragung(json: string) {
  return liesJSON(json, istTabUebertragung);
}

export function tabUebertragungAbholen() {
  return holeFensterUebergabe('tab_uebertragung_abholen', liesTabUebertragung);
}
