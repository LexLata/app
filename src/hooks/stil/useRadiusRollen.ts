// useRadiusRollen.ts
// Verbindet die bestehenden Stilrollen mit der UI-Größen-Einstellung.
import { useMemo } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { erzeugeRadiusRollen, type RadiusRollen } from '@/lib/stil/radiusRollen';

export function useRadiusRollen(): RadiusRollen {
  const faktor = useUiSkalierungsFaktor();
  return useMemo(() => erzeugeRadiusRollen(faktor), [faktor]);
}
