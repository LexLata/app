// useMobileEinstellungen.ts
//
// Verwaltet die vier auf Mobile einstellbaren Anzeige-Werte (Schriftgröße
// Text, Schriftgröße Seitenleiste, Rand neben dem Text, Seitenleistengröße)
// inkl. localStorage-Persistenz. Gleiches Muster wie useSchriftgroessen.ts
// (Desktop), aber eigene Datei/eigener Key-Namespace „gesetze.mobile.*":
// Mobile-Code liegt konsequent getrennt in src/mobile/ (siehe mobile.css),
// und die Desktop-Defaults (15pt/11pt) passen nicht zu den hier gewünschten
// Skalen, deren aktueller Wert bewusst am oberen Ende steht.

import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';
import { useViewportBreite } from './useViewportBreite';

const SCHRIFT_KEY = 'lexlata.mobile.schriftgroesse';
const RAND_KEY = 'lexlata.mobile.randInline';
const LEISTEN_GROESSE_KEY = 'lexlata.mobile.seitenleistenGroesse';
const CUSTOM_TASTATUR_KEY = 'lexlata.mobile.customTastaturAktiv';

// Wertebereiche für die Slider im Einstellungen-Overlay. Der aktuelle
// bisherige Fixwert (16) liegt bewusst nahe MAX, damit deutlich kleinere
// Schrift eingestellt werden kann, ohne den bisherigen Standard-Look zu
// verändern.
export const SCHRIFT_MIN = 10;
export const SCHRIFT_MAX = 18;
export const RAND_MIN = 8;
export const RAND_MAX = 48;
export const SEITENLEISTEN_GROESSE_MIN = 30;
export const SEITENLEISTEN_GROESSE_MAX = 60;

export function useMobileEinstellungen() {
  const { istTablet } = useViewportBreite();
  const [schriftgroesse, setSchriftgroesse] = useLocalStorageState<number>(SCHRIFT_KEY, 16, {
    parse: Number,
  });
  const [randInline, setRandInline] = useLocalStorageState<number>(RAND_KEY, 16, { parse: Number });
  const [seitenleistenGroesse, setSeitenleistenGroesse] = useLocalStorageState<number>(
    LEISTEN_GROESSE_KEY,
    44,
    { parse: Number },
  );
  // Standard: aktiv auf Handys (primäre Eingabemethode für das
  // Öffnen-Overlay), aber aus auf Tablets (mehr Bildschirmfläche, native
  // Tastatur stört dort weniger und eigene Tastatur nimmt unnötig Platz
  // weg) – nutzt dieselbe Tablet-Erkennung wie die Querformat-Freigabe
  // (useViewportBreite). Betrifft nur den Erststart; einmal gespeicherte
  // Nutzerwahl (localStorage) hat immer Vorrang.
  const [customTastaturAktiv, setCustomTastaturAktiv] = useLocalStorageState<boolean>(
    CUSTOM_TASTATUR_KEY,
    !istTablet,
    { parse: (roh) => roh === 'true' },
  );

  return {
    schriftgroesse,
    setSchriftgroesse,
    randInline,
    setRandInline,
    seitenleistenGroesse,
    setSeitenleistenGroesse,
    customTastaturAktiv,
    setCustomTastaturAktiv,
  };
}
