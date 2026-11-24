// useEuFassung.ts
// Synchronisiert die EU-Einstellung über den bestehenden localStorage-Hook.
import { EU_FASSUNG_KEY } from '@/lib/einstellungen/einstellungen.index';
import { parseEuFassung } from '@/lib/einstellungen/einstellungen.index';
import { STANDARD_EU_FASSUNG, type EuFassung } from '@/lib/domain/euFassungsvertrag';
import { useLocalStorageState } from './useLocalStorageState';
export function useEuFassung() {
  const [euFassung, setEuFassung] = useLocalStorageState<EuFassung>(
    EU_FASSUNG_KEY,
    STANDARD_EU_FASSUNG,
    { parse: parseEuFassung },
  );
  return { euFassung, setEuFassung };
}
