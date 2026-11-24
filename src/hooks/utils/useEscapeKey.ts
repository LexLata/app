// useEscapeKey.ts
// Zentraler Hook für Escape-Taste in Overlays.
// Registriert einen keydown-Listener auf window und ruft onSchliessen bei Escape auf,
// sofern deaktiviert nicht true ist (z. B. während ein Ladevorgang läuft).

import { useEffect } from 'react';

export function useEscapeKey(onSchliessen: () => void, deaktiviert = false): void {
  useEffect(() => {
    if (deaktiviert) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSchliessen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSchliessen, deaktiviert]);
}
