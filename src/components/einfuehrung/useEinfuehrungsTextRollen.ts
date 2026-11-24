// Lokale Schriftvergrößerung der Einführung; UI-Skalierung und Faktor werden einmal gerundet.
import { erzeugeTextRollen } from '@/lib/stil/textRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';

export function useEinfuehrungsTextRollen() {
  const uiFaktor = useUiSkalierungsFaktor();
  return erzeugeTextRollen(uiFaktor * 1.15);
}
