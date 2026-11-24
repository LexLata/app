// useTextRollen.ts
// React-Anbindung für Text- und Icon-Größen; rechnet direkt aus den Rohwerten.
import { useMemo } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { erzeugeTextRollen, erzeugeIconGroessen } from '@/lib/stil/textRollen';

export function useTextRollen() {
  const faktor = useUiSkalierungsFaktor();
  return useMemo(() => erzeugeTextRollen(faktor), [faktor]);
}

export function useIconGroessen() {
  const faktor = useUiSkalierungsFaktor();
  return useMemo(() => erzeugeIconGroessen(faktor), [faktor]);
}
