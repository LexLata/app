// praefixlaufAuftrag.ts
// Auftrag für den Entwickler-Prüflauf, unabhängig von seiner Ausführungsumgebung.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import type { PraefixlaufAuftrag } from './praefixlaufAuftrag.types';
export type { PraefixlaufAuftrag } from './praefixlaufAuftrag.types';

import { isTauri } from '@tauri-apps/api/core';
import { istMobilePlattform } from './tauriHelpers';

/** Release und normale Starts haben keinen Auftrag. Ungültige native Antworten
 * werden sichtbar protokolliert und starten keinen Prüflauf. */
export async function holePraefixlaufAuftrag(): Promise<PraefixlaufAuftrag | null> {
  if (!isTauri() || (await istMobilePlattform())) return null;
  try {
    const antwort: unknown = await rufeBefehl('praefixlauf_auftrag');
    if (antwort === null) return null;
    if (typeof antwort !== 'object') throw new Error('Ungültiger Präfixlaufauftrag.');
    const a = antwort as Partial<PraefixlaufAuftrag>;
    if (
      (a.debug !== undefined && a.debug !== true) ||
      !['praefix', 'auswerten', 'quelldateien', 'gesetzesxml'].includes(a.modus ?? '') ||
      ![NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU].includes(a.normgeber ?? '') ||
      (a.normgeber === NORMGEBER_EU && a.modus !== 'quelldateien' && a.modus !== 'gesetzesxml') ||
      (a.modus === 'auswerten'
        ? a.anzahl !== undefined
        : !Number.isSafeInteger(a.anzahl) || a.anzahl! <= 0) ||
      (a.neu !== undefined &&
        ((a.modus !== 'gesetzesxml' && a.modus !== 'quelldateien') || a.neu !== true)) ||
      (a.gescheitert !== undefined && a.modus !== 'praefix') ||
      (a.gescheitert !== undefined && (a.gescheitert !== true || a.kurztitel !== undefined)) ||
      (a.kurztitel !== undefined &&
        (!Array.isArray(a.kurztitel) ||
          a.kurztitel.length === 0 ||
          a.kurztitel.some((k) => typeof k !== 'string' || !k.trim())))
    )
      throw new Error('Ungültiger Präfixlaufauftrag.');
    return a as PraefixlaufAuftrag;
  } catch (fehler) {
    console.error('Präfixlaufauftrag konnte nicht gelesen werden:', fehler);
    return null;
  }
}
