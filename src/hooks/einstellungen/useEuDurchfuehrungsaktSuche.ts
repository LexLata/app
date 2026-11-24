// useEuDurchfuehrungsaktSuche.ts
// Synchronisiert die EU-Einstellung über den bestehenden localStorage-Hook.
import { EU_DURCHFUEHRUNGSAKT_SUCHE_KEY } from '@/lib/einstellungen/einstellungen.index';
import {
  parseEuDurchfuehrungsaktSuche,
  type EuDurchfuehrungsaktSuche,
} from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from './useLocalStorageState';
export function useEuDurchfuehrungsaktSuche() {
  const [euDurchfuehrungsaktSuche, setEuDurchfuehrungsaktSuche] =
    useLocalStorageState<EuDurchfuehrungsaktSuche>(EU_DURCHFUEHRUNGSAKT_SUCHE_KEY, false, {
      parse: parseEuDurchfuehrungsaktSuche,
    });
  return { euDurchfuehrungsaktSuche, setEuDurchfuehrungsaktSuche };
}
