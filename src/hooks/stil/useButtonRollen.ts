// useButtonRollen.ts
// React-Anbindung für Buttons mit denselben Text-, Radius- und Skalierungswerten.
import { useMemo } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useTextRollen } from './useTextRollen';
import { useRadiusRollen } from './useRadiusRollen';
import { erzeugeButtonRollen, type ButtonRollen } from '@/lib/stil/buttonRollen';

export function useButtonRollen(): ButtonRollen {
  const faktor = useUiSkalierungsFaktor();
  const textRollen = useTextRollen();
  const radiusRollen = useRadiusRollen();
  return useMemo(
    () => erzeugeButtonRollen(faktor, textRollen, radiusRollen),
    [faktor, textRollen, radiusRollen],
  );
}
