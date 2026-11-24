// useMinimalistischerModus.ts
//
// Verwaltet die Einstellung "Minimalistischer Modus" (Einstellungen.tsx)
// inkl. localStorage-Persistenz über useLocalStorageState.ts. Bei
// aktiviert: UI-Elemente, die zusätzlich zu bereits bestehenden
// Tastenkürzeln eingeblendet werden (z. B. die Verlaufs-Pfeile links der
// Tableiste, siehe Tableiste.tsx), werden ausgeblendet – die Tastenkürzel
// selbst bleiben davon unberührt.

import { MINIMALISTISCHER_MODUS_KEY as AKTIVIERT_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export function useMinimalistischerModus() {
  const [minimalistischerModus, setMinimalistischerModus] = useLocalStorageState<boolean>(
    AKTIVIERT_KEY,
    false,
    {
      parse: (roh) => roh === 'true',
    },
  );

  return { minimalistischerModus, setMinimalistischerModus };
}
