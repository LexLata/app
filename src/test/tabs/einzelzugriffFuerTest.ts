// Übersetzt bestehende Szenarioeingaben auf den Einzelzugriffsvertrag der Öffnungssteuerung.
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { type GesetzLadeabschluss } from '@/lib/persistenz/gesetz/gesetz.index';
import { istGesetzVerlaesslichPruefbar } from '@/test/tabs/gesetzBestandAbschluss';

import type { GesetzLeseErgebnis } from '@/lib/persistenz/gesetz/gesetz.index';
export function einzelzugriffFuerTest(lesen: () => Promise<GesetzLadeabschluss>) {
  return async (referenz: Gesetzesreferenz): Promise<GesetzLeseErgebnis> => {
    const abschluss = await lesen();
    if (!istGesetzVerlaesslichPruefbar(referenz, abschluss))
      return { status: 'nicht-lesbar', befunde: abschluss.befunde };
    const gesetz = abschluss.liste.find((gesetz) => istGleichesGesetz(gesetz, referenz));
    return gesetz ? { status: 'geladen', gesetz, befunde: [] } : { status: 'fehlt', befunde: [] };
  };
}
