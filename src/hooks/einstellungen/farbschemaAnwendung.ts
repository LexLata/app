// farbschemaAnwendung.ts
// Wendet die bestehende Farbschema-Einstellung vor dem Rendern in jedem Fenster an.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { isTauri } from '@tauri-apps/api/core';
import { FARBSCHEMA_KEY } from '@/lib/einstellungen/einstellungen.index';
import { fensterFarbschemaAnwenden } from '@/lib/plattform/fensterFarbschema';
import { istMobilePlattform } from '@/lib/plattform/tauriHelpers';
export type Farbschema = 'system' | 'hell' | 'dunkel';

// Serialisiert native Aktualisierungen, damit ein langsamer vorheriger Aufruf
// einen schnellen Hell-/Dunkel-Wechsel nicht nachträglich überschreibt.
let nativeAnwendung: Promise<void> = Promise.resolve();
// Spiegel der zuletzt angewendeten Einstellung für Sitzungen ohne localStorage.
let angewendetesSchema: Farbschema = 'system';

function gespeichertesSchema(): Farbschema {
  try {
    const wert = localStorage.getItem(FARBSCHEMA_KEY);
    return wert === 'hell' || wert === 'dunkel' ? wert : 'system';
  } catch {
    return 'system';
  }
}

export function farbschemaAnwenden(farbschema: Farbschema): Promise<void> {
  angewendetesSchema = farbschema;
  const dunkel =
    farbschema === 'dunkel' ||
    (farbschema === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-farbschema', dunkel ? 'dunkel' : 'hell');
  nativeAnwendung = nativeAnwendung
    .then(() => fensterFarbschemaAnwenden(farbschema, dunkel))
    .catch((fehler: unknown) => {
      console.error('Fenster-Farbschema konnte nicht angewendet werden:', fehler);
    });
  return nativeAnwendung;
}

/** Einmal pro Webview, auch für Hilfsfenster und deren Fehleransicht.
 * Das native Erscheinungsbild ist fertig, bevor main.tsx die Wurzel rendert. */
export async function initialisiereFensterFarbschema(): Promise<() => void> {
  const medienabfrage = window.matchMedia('(prefers-color-scheme: dark)');
  const systemMelden = async () => {
    if (!isTauri() || (await istMobilePlattform())) return;
    try {
      await rufeBefehl('system_theme_melden', { dunkel: medienabfrage.matches });
    } catch (fehler) {
      console.error('System-Farbschema konnte nicht gemeldet werden:', fehler);
    }
  };
  const systemWechsel = () => {
    if (angewendetesSchema === 'system') void farbschemaAnwenden('system');
    void systemMelden();
  };
  const einstellungsWechsel = (ereignis: StorageEvent) => {
    if (ereignis.key === FARBSCHEMA_KEY || ereignis.key === null) {
      void farbschemaAnwenden(gespeichertesSchema());
    }
  };
  medienabfrage.addEventListener('change', systemWechsel);
  window.addEventListener('storage', einstellungsWechsel);
  await farbschemaAnwenden(gespeichertesSchema());
  await systemMelden();
  return () => {
    medienabfrage.removeEventListener('change', systemWechsel);
    window.removeEventListener('storage', einstellungsWechsel);
  };
}
