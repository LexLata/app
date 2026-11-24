// Referenztabs für Testaufbauten; Gesetzesdaten liegen ausschließlich im übergebenen Bestand.
import type { Tab } from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
export function tabFuerTest(
  { gesetz, ...tab }: Tab & { gesetz?: GesetzDarstellung },
  steuerung?: Pick<ReturnType<typeof useAppTabs>, 'uebernehmeTabGesetz'>,
): Tab {
  return gesetz
    ? (steuerung?.uebernehmeTabGesetz(tab, gesetz) ?? {
        ...tab,
        gesetzesreferenz: referenzVon(gesetz),
        ladezustand: 'geladen',
      })
    : tab;
}

/** Prüft geladene Testvoraussetzungen zur Laufzeit statt sie dem Typsystem zuzusichern. */
export function geladenesTabGesetz(
  steuerung: Pick<ReturnType<typeof useAppTabs>, 'holeTabGesetz'>,
  tab: Tab | null | undefined,
): GesetzDarstellung {
  const gesetz = steuerung.holeTabGesetz(tab);
  if (!gesetz) throw new Error('Der Test erwartet einen geladenen Referenztab.');
  return gesetz;
}
