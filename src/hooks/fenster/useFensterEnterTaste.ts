// useFensterEnterTaste.ts
// Bindet die Enter-Taste eines Fensters an die aktuelle Aktion.

import { useEffect, useRef } from 'react';

/** Registriert Enter einmalig am Fenster und ruft trotzdem immer die aktuelle Aktion auf. */
export function useFensterEnterTaste(aktion: () => void) {
  const aktionRef = useRef(aktion);
  aktionRef.current = aktion;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (document.activeElement instanceof HTMLButtonElement) return;
      aktionRef.current();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
