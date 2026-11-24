// useAutoAktualisierungsIntervall.ts
//
// Verwaltet die Einstellung "Automatische Aktualisierung" (Einstellungen.tsx)
// inkl. localStorage-Persistenz – gleiches Muster wie
// useMarkierungenDeaktiviert.ts/useSchriftgroessen.ts. Der eigentliche
// Terminierungs-/Ausführungs-Code liegt in useHintergrundAktualisierung.ts,
// dieser Hook liefert nur den aktuellen Einstellungswert + Setter.

import { AUTO_AKTUALISIERUNGS_INTERVALL_KEY as INTERVALL_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export type AutoAktualisierungsIntervall = 'taeglich' | 'woechentlich' | 'zweiwoechentlich' | 'nie';

const STANDARD_INTERVALL: AutoAktualisierungsIntervall = 'woechentlich';

const GUELTIGE_WERTE: AutoAktualisierungsIntervall[] = [
  'taeglich',
  'woechentlich',
  'zweiwoechentlich',
  'nie',
];

/** Millisekunden je Intervall-Einstellung – 'nie' hat keinen sinnvollen
 *  Wert, wird von useHintergrundAktualisierung.ts vorher separat abgefangen. */
export const INTERVALL_MS: Record<Exclude<AutoAktualisierungsIntervall, 'nie'>, number> = {
  taeglich: 24 * 60 * 60 * 1000,
  woechentlich: 7 * 24 * 60 * 60 * 1000,
  zweiwoechentlich: 14 * 24 * 60 * 60 * 1000,
};

export function useAutoAktualisierungsIntervall() {
  const [autoAktualisierungsIntervall, setAutoAktualisierungsIntervall] =
    useLocalStorageState<AutoAktualisierungsIntervall>(INTERVALL_KEY, STANDARD_INTERVALL, {
      parse: (roh) =>
        (GUELTIGE_WERTE as string[]).includes(roh)
          ? (roh as AutoAktualisierungsIntervall)
          : STANDARD_INTERVALL,
    });

  return { autoAktualisierungsIntervall, setAutoAktualisierungsIntervall };
}

/** Liest den aktuellen Einstellungswert direkt aus localStorage, ohne
 *  React-State/Re-Render. Wird von useHintergrundAktualisierung.ts genutzt,
 *  damit der periodische Prüf-Timer immer den AKTUELLEN Wert sieht, auch
 *  wenn die Einstellung zwischenzeitlich (in diesem oder einem anderen
 *  Fenster) geändert wurde, statt einen beim Mount eingefrorenen Wert zu
 *  verwenden. */
export function leseAutoAktualisierungsIntervall(): AutoAktualisierungsIntervall {
  try {
    const gespeichert = localStorage.getItem(INTERVALL_KEY);
    return (GUELTIGE_WERTE as string[]).includes(gespeichert ?? '')
      ? (gespeichert as AutoAktualisierungsIntervall)
      : STANDARD_INTERVALL;
  } catch {
    return STANDARD_INTERVALL;
  }
}
