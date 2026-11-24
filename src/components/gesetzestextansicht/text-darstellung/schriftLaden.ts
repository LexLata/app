// schriftLaden.ts
// Lädt die gewählte Schrift und meldet, wann sie für die Canvasmessung bereit ist.

import { useEffect, useState } from 'react';

// Ein beliebiger Schriftgrad genügt: geladen wird die Schriftdatei, nicht die Größe.
const LADEGROESSE = 15;

/** Zählt hoch, sobald `schriftFamilie` (Normal und Kursiv) geladen ist. Ein Canvas misst mit
 *  einer noch nicht geladenen Schrift stillschweigend mit der Ersatzschrift; Aufrufer bauen
 *  ihre Messung daher bei jeder Änderung des Werts neu auf. Schlägt das Laden fehl, bleibt es
 *  bei der Ersatzschrift. Die Standardschrift ist eine Systemschrift und wird nicht geladen. */
export function useSchriftGeladen(schriftFamilie: string, istSystemschrift: boolean): number {
  const [zaehler, setZaehler] = useState(0);
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (istSystemschrift || !fonts) return;
    let aktiv = true;
    void Promise.all([
      fonts.load(`${LADEGROESSE}px ${schriftFamilie}`),
      fonts.load(`italic ${LADEGROESSE}px ${schriftFamilie}`),
    ]).then(
      () => {
        if (aktiv) setZaehler((alt) => alt + 1);
      },
      () => undefined,
    );
    return () => {
      aktiv = false;
    };
  }, [schriftFamilie, istSystemschrift]);
  return zaehler;
}
