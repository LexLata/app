// useZeigerHoehe.ts
//
// Misst die tatsächlich gerenderte Höhe der Titel-Zeile (UeberschriftZeile/
// NormBlock) per ResizeObserver, damit der AktivZeiger (siehe
// aktivZeiger.tsx) bei mehrzeiligem Umbruch mitwächst.
// Anders als beim Chevron (KlappChevron, siehe dortiger Kommentar), das an
// GENAU einem Glyphen sitzt und daher ohne Messung mit "vertical-align:
// middle" auskommt, kann die Gesamthöhe eines ggf. umbrechenden mehrzeiligen
// Titels nicht vorab berechnet werden – sie hängt von der tatsächlichen
// Fensterbreite und dem realen Zeilenumbruch ab.
//
// Beobachtet wird bewusst nur, wenn "aktiv" true ist: aktiv ist zu jedem
// Zeitpunkt höchstens EIN Element im gesamten (virtualisierten) Dokument,
// der Overhead ist daher vernachlässigbar (siehe Kommentar zu bewusst
// reinem CSS-Hover statt State in KlappChevron für dieselbe Überlegung bei
// potenziell hunderten gemounteten Zeilen).
//
// Rückgabewert ist die volle offsetHeight der beobachteten Zeile (inkl.
// padding) – die Umrechnung auf die reine Zeiger-Höhe (Abzug von
// paddingTop/-Bottom) erfolgt am Aufrufer, da diese Werte dort bereits
// bekannt sind.

import { useEffect, useState, type RefObject } from 'react';

export function useZeigerHoehe(ref: RefObject<HTMLElement | null>, aktiv: boolean): number | null {
  const [hoehe, setHoehe] = useState<number | null>(null);

  useEffect(() => {
    if (!aktiv || !ref.current) {
      setHoehe(null);
      return;
    }
    const el = ref.current;
    setHoehe(el.offsetHeight);
    const beobachter = new ResizeObserver(() => setHoehe(el.offsetHeight));
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [aktiv, ref]);

  return hoehe;
}
