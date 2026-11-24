// Übergang für Referenztabs aus der bisherigen Sitzungs- und Fensterübertragung.
import type { Tab, TabUebertragung } from '@/lib/domain/appTypes';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';

export function mitGeladenemTabGesetz(tab: Tab, gesetz: GesetzDarstellung): Tab {
  return { ...tab, gesetzesreferenz: referenzVon(gesetz), ladezustand: 'geladen' };
}

function tabMitLadereferenz(id: string, gesetzesreferenz?: Gesetzesreferenz): Tab {
  return { id, gesetzesreferenz, ladezustand: gesetzesreferenz ? 'ladend' : undefined };
}

/** Übernimmt die Referenz; die Ansicht folgt nach dem Einzelzugriff. */
export function tabAusUebertragungsdaten(id: string, uebertragung: TabUebertragung): Tab {
  return {
    ...tabMitLadereferenz(id, uebertragung.gesetzesreferenz),
    initialNorm: uebertragung.initialNorm,
  };
}
