// Sichert in bestehenden Suchoberflächentests dieselbe Zielwahl nach Übergabe einer Referenz.
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
export function suchtrefferOeffnenFuerTest(
  gesetze: GesetzDarstellung[],
  oeffnen: (gesetz: GesetzDarstellung, xmlId?: string) => void,
  neuenTabOeffnen: (gesetz: GesetzDarstellung, xmlId?: string) => void,
) {
  return (referenz: Gesetzesreferenz, xmlId: string | undefined, neuerTab = false) => {
    const gesetz = gesetze.find((gesetz) => istGleichesGesetz(gesetz, referenz));
    if (!gesetz) throw new Error(`Unbekannte Testreferenz: ${referenz.kurztitel}`);
    (neuerTab ? neuenTabOeffnen : oeffnen)(gesetz, xmlId);
  };
}
