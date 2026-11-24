// useFarbschema.ts
// Liest und ändert die vorhandene Einstellung System/Hell/Dunkel.
// Fensterübergreifende Anwendung und Systembeobachtung erfolgen beim Start
// jedes Fensters in farbschemaAnwendung.ts; der Setter aktualisiert auch
// das schreibende Fenster, das selbst kein storage-Ereignis erhält.

import { FARBSCHEMA_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';
import { farbschemaAnwenden, type Farbschema } from './farbschemaAnwendung';
export type { Farbschema } from './farbschemaAnwendung';

export function useFarbschema() {
  const [farbschema, setGespeichertesFarbschema] = useLocalStorageState<Farbschema>(
    FARBSCHEMA_KEY,
    'system',
    { parse: (roh) => (roh === 'hell' || roh === 'dunkel' ? roh : 'system') },
  );

  function setFarbschema(neu: Farbschema) {
    setGespeichertesFarbschema(neu);
    void farbschemaAnwenden(neu);
  }

  return { farbschema, setFarbschema };
}
