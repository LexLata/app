// useLeistenTauschen.ts
// Speichert die Anordnung der Favoritenleiste und Lesezeichenleiste.
import { LEISTEN_TAUSCHEN_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export function useLeistenTauschen() {
  const [leistenTauschen, setLeistenTauschen] = useLocalStorageState<boolean>(
    LEISTEN_TAUSCHEN_KEY,
    false,
    { parse: (roh) => roh === 'true' },
  );
  return { leistenTauschen, setLeistenTauschen };
}
