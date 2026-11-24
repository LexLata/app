// fortschritt.ts
// Kapselt Fortschrittsmeldungen, damit Callback-Fehler den Import nicht unterbrechen.

import { alsFehler } from '@/lib/utils/fehler';
export function erstelleFehlersicherenFortschritt<TArgumente extends unknown[]>(
  fortschritt?: (...argumente: TArgumente) => void,
): {
  melden: (...argumente: TArgumente) => void;
  wirfErstenFehler: () => void;
} {
  let ersterFehler: unknown;
  return {
    melden: (...argumente) => {
      try {
        fortschritt?.(...argumente);
      } catch (fehler) {
        ersterFehler ??= fehler;
      }
    },
    wirfErstenFehler: () => {
      if (ersterFehler !== undefined) throw alsFehler(ersterFehler);
    },
  };
}
