// Gemeinsame Tabzugriffe für Integrationstests der echten Öffnungssteuerung.
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';

export function gesetzOeffnenFixture(
  tabs: ReturnType<typeof useAppTabs>,
  geladen: GesetzDarstellung[] = [],
) {
  for (const gesetz of geladen)
    if (!tabs.holeGeladenes(gesetz)) tabs.uebernehmeTabGesetz({ id: 'bestandseingabe' }, gesetz);
  return {
    holeTabGesetz: tabs.holeTabGesetz,
    ladeGesetz: tabs.ladeGesetz,
    tabs: tabs.tabs,
    tabsRef: tabs.tabsRef,
    aktiverTabIdRef: tabs.aktiverTabIdRef,
    gesetzOeffnen: tabs.gesetzOeffnen,
    erstelleLeerenTab: tabs.erstelleLeerenTab,
    sprung: tabs.sprung,
    verlaufHinzufuegen: tabs.verlaufHinzufuegen,
    verlaufSetzen: tabs.verlaufSetzen,
    verlaufFristStoppen: tabs.verlaufFristStoppen,
  };
}
