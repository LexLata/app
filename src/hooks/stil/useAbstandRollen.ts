// useAbstandRollen.ts
// Verbindet die bestehenden Stilrollen mit der UI-Größen-Einstellung.
import { useMemo } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { erzeugeAbstandRollen, type AbstandRollen } from '@/lib/stil/abstandRollen';

export function useAbstandRollen(): AbstandRollen {
  const faktor = useUiSkalierungsFaktor();
  return useMemo(() => erzeugeAbstandRollen(faktor), [faktor]);
}
