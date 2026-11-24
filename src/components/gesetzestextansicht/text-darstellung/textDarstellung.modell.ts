// textDarstellung.modell.ts
// Lokaler Darstellungsrahmen und identische Schriftgrundlage für CSS und Canvas.

import { createContext, useContext, useMemo, type CSSProperties } from 'react';
import {
  SCHRIFTART_STACKS,
  satzNummerSchriftStil,
  UI_SCHRIFT_FALLBACK,
  SCHRIFTART_DEFAULT,
  ZEILENABSTAND_DEFAULT,
  BLOCKSATZ_DEFAULT,
  SILBENTRENNUNG_DEFAULT,
  ermittleSpracheUndTrennung,
  type Schriftart,
} from '@/lib/stil/gesetzTextDarstellung';
import { erstelleTextMessung } from './textMessung';
import { useSchriftGeladen } from './schriftLaden';

export interface TextDarstellungsWerte {
  schriftart?: Schriftart;
  zeilenabstand?: number;
  blocksatz?: boolean;
  silbentrennungAktiviert?: boolean;
  sprache?: string;
}

function loeseSchriftFamilie(schriftart: Schriftart): string {
  if (schriftart !== 'sans') return SCHRIFTART_STACKS[schriftart];
  if (typeof document === 'undefined') return UI_SCHRIFT_FALLBACK;
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--schrift').trim() ||
    UI_SCHRIFT_FALLBACK
  );
}

export function useTextDarstellungsModell({
  schriftart = SCHRIFTART_DEFAULT,
  zeilenabstand = ZEILENABSTAND_DEFAULT,
  blocksatz = BLOCKSATZ_DEFAULT,
  silbentrennungAktiviert = SILBENTRENNUNG_DEFAULT,
  sprache,
}: TextDarstellungsWerte) {
  const schriftFamilie = loeseSchriftFamilie(schriftart);
  const schriftGeladen = useSchriftGeladen(schriftFamilie, schriftart === 'sans');
  const messung = useMemo(() => {
    // Neuaufbau nach dem Laden der Schrift verwirft Messwerte der Ersatzschrift.
    void schriftGeladen;
    return erstelleTextMessung(schriftFamilie);
  }, [schriftFamilie, schriftGeladen]);
  const { lang, hyphens } = ermittleSpracheUndTrennung(sprache, silbentrennungAktiviert);
  return useMemo(
    () => ({
      messung,
      satzNummerStil: (schrift: number) => satzNummerSchriftStil(schriftart, schrift),
      lang,
      hyphens,
      textAlign: blocksatz ? ('justify' as const) : ('left' as const),
      stil: {
        fontFamily: schriftFamilie,
        '--schrift-text': schriftFamilie,
        '--zeilen-abstand': zeilenabstand,
        '--text-align': blocksatz ? 'justify' : 'left',
        '--hyphens': hyphens,
      } as CSSProperties,
    }),
    [messung, schriftart, lang, schriftFamilie, zeilenabstand, blocksatz, hyphens],
  );
}

export type TextDarstellungsModell = ReturnType<typeof useTextDarstellungsModell>;
export const TextDarstellungsCtx = createContext<TextDarstellungsModell | null>(null);

export function useTextMessung() {
  const modell = useContext(TextDarstellungsCtx);
  if (!modell) throw new Error('Textbaum benötigt einen TextDarstellungsRahmen.');
  return modell.messung;
}

/** Schriftgröße und Hochstellung der Satznummer passend zur gewählten Schrift. */
export function useSatzNummerStil() {
  const modell = useContext(TextDarstellungsCtx);
  if (!modell) throw new Error('Textbaum benötigt einen TextDarstellungsRahmen.');
  return modell.satzNummerStil;
}
