// useSeitenleistenButtonHoehe.ts
// Gemeinsames Padding und skalierte Höhe der Seitenleistenbuttons.

import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useIconGroessen } from './useTextRollen';
import { pxSkaliert } from '@/lib/stil/paddingRollen';

// Gemeinsame Quelle für Button-Stil und Höhenberechnung.
export const BUTTON_PADDING_VERTIKAL_ROH = 7;

/** Höhe eines Buttons in px (vertikales Padding × 2 + skalierte Icon-Größe)
 *  – als Hook (nicht mehr feste Konstante), da beide Anteile mit der
 *  UI-Größe skalieren: Lesezeichenleiste.tsx/
 *  Favoritenleiste.tsx nutzen ihn, um beim adaptiven
 *  Höhen-Layout (useAdaptivesLeistenLayout.ts) korrekt Platz zu
 *  reservieren, wenn die Buttons als letzte Zeilen einer Spalte gerendert
 *  werden. Vorher eine feste Konstante (30), obwohl das enthaltene Icon
 *  bereits über useIconGroessen() skalierte – bei großer UI-Größe war der
 *  reservierte Platz dadurch zu knapp (Bugfix, siehe Absprache). */
export function useSeitenleistenButtonHoehe(): number {
  const faktor = useUiSkalierungsFaktor();
  const iconGroessen = useIconGroessen();
  return pxSkaliert(BUTTON_PADDING_VERTIKAL_ROH, faktor) * 2 + iconGroessen.standard;
}
