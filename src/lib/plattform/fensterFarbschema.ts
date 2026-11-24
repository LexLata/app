// fensterFarbschema.ts
// Synchronisiert das Erscheinungsbild und den Hintergrund dieses Desktop-Fensters.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { isTauri } from '@tauri-apps/api/core';
import { istMobilePlattform } from './tauriHelpers';

export async function fensterFarbschemaAnwenden(
  farbschema: 'system' | 'hell' | 'dunkel',
  dunkel: boolean,
): Promise<void> {
  if (!isTauri() || (await istMobilePlattform())) return;
  await rufeBefehl('fenster_farbschema_anwenden', { farbschema, dunkel });
}
