// checkboxRolle.ts
// Einheitliche Checkbox unabhängig von der nativen Fensteraktivierung.
import type { CSSProperties } from 'react';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { erzeugeRadiusRollen } from '@/lib/stil/radiusRollen';

export function erzeugeCheckboxRolle(
  faktor: number,
  checked: boolean,
  disabled: boolean,
): CSSProperties {
  return {
    appearance: 'none',
    width: pxSkaliert(14, faktor),
    height: pxSkaliert(14, faktor),
    margin: 0,
    borderRadius: erzeugeRadiusRollen(faktor).klein,
    // Feste 1-CSS-Pixel-Haarlinie begrenzt das Kästchen; Skalierung würde die Dicke ändern.
    // Stilrollen sind zentral vom Rohpixel-Lint ausgenommen; keine lokale Unterdrückung nötig.
    border: checked ? '1px solid var(--akzent-einheitlich)' : '1px solid var(--rahmen)',
    background: checked ? 'var(--akzent-einheitlich)' : 'var(--bg-eingabe)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}
