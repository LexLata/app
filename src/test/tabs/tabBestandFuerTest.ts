// Echter Gesetzesbestand für isolierte Hooktests mit explizit aufgebauten Referenztabs.
import { afterEach } from 'vitest';
import type { Tab } from '@/lib/domain/appTypes';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { tabFuerTest as referenztab } from './tabFabriken';
let bestand: ReturnType<typeof erzeugeGeladeneGesetze> | undefined;
function testbestand() {
  return (bestand ??= erzeugeGeladeneGesetze());
}
export async function beendeTabBestandFuerTest() {
  const aktuell = bestand;
  bestand = undefined;
  await aktuell?.bereit;
  aktuell?.beenden();
}
afterEach(beendeTabBestandFuerTest);
export function holeTabGesetzFuerTest(tab: Tab | null | undefined) {
  return tab?.ladezustand === 'geladen' && tab.gesetzesreferenz
    ? testbestand().holeGeladenes(tab.gesetzesreferenz)
    : undefined;
}
export const bestandszugriffFuerTest = {
  holeGeladenes: (referenz: Gesetzesreferenz) => testbestand().holeGeladenes(referenz),
  holeDatenstand: (referenz: Gesetzesreferenz) => testbestand().holeDatenstand(referenz),
};
export function tabFuerTest({ gesetz, ...tab }: Tab & { gesetz?: GesetzDarstellung }): Tab {
  if (gesetz) testbestand().uebernehmeGeladenes(gesetz);
  return referenztab({ ...tab, gesetz });
}
