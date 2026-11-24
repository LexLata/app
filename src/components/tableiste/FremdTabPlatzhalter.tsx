// FremdTabPlatzhalter.tsx
//
// Rein visueller Platzhalter für einen Tab, der gerade aus einem ANDEREN
// Fenster hierhergezogen wird (siehe useTabDragUeberFenster.ts: fremdVorschau).
// Bewusst nicht interaktiv (pointerEvents: 'none') – der Tab ist erst nach
// dem tatsächlichen Drop (tab-uebertragung-eingefuegt) wirklich vorhanden.
//
// Blendet sich beim Erscheinen sanft ein (Opacity + Breite via transform:
// scaleX, transformOrigin links) statt abrupt zu springen. sichtbar startet
// bewusst als false und wird erst NACH dem ersten Commit (requestAnimationFrame)
// auf true gesetzt – sonst würde der Browser Start- und Endzustand im selben
// Frame anwenden und die CSS-transition hätte nichts zu animieren.

import { useEffect, useState } from 'react';
import { basisTabStil } from '@/components/tableiste/tableisteStil';
import { TabBeschriftung } from '@/components/tableiste/TabBeschriftung';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';

interface FremdTabPlatzhalterProps {
  zeile1: string;
  zeile2?: string;
}

export function FremdTabPlatzhalter({ zeile1, zeile2 }: FremdTabPlatzhalterProps) {
  const uiFaktor = useUiSkalierungsFaktor();
  const [sichtbar, setSichtbar] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSichtbar(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      style={{
        ...basisTabStil(uiFaktor),
        background: 'transparent',
        pointerEvents: 'none',
        transformOrigin: 'left center',
        transform: sichtbar ? 'scaleX(1)' : 'scaleX(0.85)',
        opacity: sichtbar ? 1 : 0,
        transition: 'transform 0.12s ease-out, opacity 0.12s ease-out',
      }}
    >
      <TabBeschriftung titel={zeile1} untertitel={zeile2} />
    </div>
  );
}
