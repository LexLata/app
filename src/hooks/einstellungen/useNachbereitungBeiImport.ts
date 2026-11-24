// useNachbereitungBeiImport.ts
// Vier unabhängige Nachbereitungsmodi für GesetzesXML-Dateiimporte.
import { NACHBEREITUNG_BEI_IMPORT_KEY } from '@/lib/einstellungen/einstellungen.index';
import {
  parseNachbereitungBeiImport,
  type NachbereitungBeiImport,
} from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export function useNachbereitungBeiImport() {
  const [nachbereitungBeiImport, setNachbereitungBeiImport] =
    useLocalStorageState<NachbereitungBeiImport>(NACHBEREITUNG_BEI_IMPORT_KEY, 'aus', {
      parse: parseNachbereitungBeiImport,
    });
  return { nachbereitungBeiImport, setNachbereitungBeiImport };
}
