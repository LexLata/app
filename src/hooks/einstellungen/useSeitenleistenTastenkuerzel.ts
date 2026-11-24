// Verwaltet die positive Einstellung für Seitenleisten-Tastenkürzel; Standard: aus.
import { SEITENLEISTEN_TASTENKUERZEL_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export function useSeitenleistenTastenkuerzel() {
  const [seitenleistenTastenkuerzel, setSeitenleistenTastenkuerzel] = useLocalStorageState<boolean>(
    SEITENLEISTEN_TASTENKUERZEL_KEY,
    false,
    {
      parse: (roh) => roh === 'true',
    },
  );

  return { seitenleistenTastenkuerzel, setSeitenleistenTastenkuerzel };
}
