// hilfsfenster.index.ts
// Öffentlicher Zugang zur Labelzuordnung und zum Laden der Hilfsfenster.

import type { ComponentType } from 'react';
import { bestimmeFensterart } from '@/lib/plattform/fensterart';

// Statisch verfügbar, unabhängig von den dynamisch geladenen Fensterwurzeln.
export { FensterStartFehler } from './gemeinsam/FensterStartFehler';

/**
 * Lädt die Wurzelkomponente zum Hilfsfenster-Label, ohne sie zu rendern.
 * Erkennt verweismarkierung- und kommentar-Präfixe sowie markierungskonflikte und
 * einstellungen. Andere Labels liefern null, ohne eine Fensterkomponente
 * zu laden; Hauptfenster und mobile Ansicht bestimmt der Aufrufer.
 * Nur das passende Hilfsfenster wird dynamisch geladen. Ladefehler werden
 * als abgelehntes Promise weitergereicht. Plattforminitialisierung,
 * Startvorbereitung und Fehlerbehandlung bleiben beim Aufrufer.
 */
export async function ladeHilfsfensterWurzel(label: string): Promise<ComponentType | null> {
  const art = bestimmeFensterart(label);
  if (art === 'verweismarkierung') {
    const { default: VerweismarkierungFenster } =
      await import('@/components/hilfsfenster/verweismarkierung/VerweismarkierungFenster');
    return VerweismarkierungFenster;
  }
  if (art === 'kommentar') {
    const { default: KommentarFenster } =
      await import('@/components/hilfsfenster/kommentar/KommentarFenster');
    return KommentarFenster;
  }
  if (art === 'markierungskonflikte') {
    const { default: MarkierungskonfliktFenster } =
      await import('@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster');
    return MarkierungskonfliktFenster;
  }
  if (art === 'einstellungen') {
    const { EinstellungenFenster } =
      await import('@/components/hilfsfenster/einstellungsfenster/einstellungsfenster.index');
    return EinstellungenFenster;
  }
  return null;
}
