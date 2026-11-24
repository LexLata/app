// fensterart.ts
// Gemeinsamer Start-/Labelvertrag für Hilfsfenster und lokale Bannergrenze.
import { getCurrentWindow } from '@tauri-apps/api/window';

export type Fensterart =
  'hauptfenster' | 'kommentar' | 'verweismarkierung' | 'markierungskonflikte' | 'einstellungen';

/** Unbekannte Labels und die Browser-Vorschau verwenden die Haupt-/Mobile-Weiche. */
export function bestimmeFensterart(label: string | undefined): Fensterart {
  if (label?.startsWith('verweismarkierung-')) return 'verweismarkierung';
  if (label?.startsWith('kommentar-')) return 'kommentar';
  if (label === 'markierungskonflikte') return 'markierungskonflikte';
  if (label === 'einstellungen') return 'einstellungen';
  return 'hauptfenster';
}

/** Der aktuelle native Fensterkontext ist maßgeblich, kein zweiter Fensterzustand. */
export function verlangeHauptfensterFuerBanner(): void {
  let label: string | undefined;
  try {
    label = getCurrentWindow().label;
  } catch {
    // Keine Tauri-Umgebung: Browser-Vorschau bleibt Hauptansicht.
  }
  if (bestimmeFensterart(label) !== 'hauptfenster') {
    throw new Error(`Banner sind ausschließlich in Hauptfenstern zulässig (Fenster: ${label}).`);
  }
}
