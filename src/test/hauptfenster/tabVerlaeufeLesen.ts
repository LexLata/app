// Liest die Verläufe vorhandener Tabs für übergreifende Zustandsvergleiche in Tests.
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import type { TabVerlauf } from '@/lib/domain/appTypes';

export function tabVerlaeufeLesen(
  tabs: Pick<ReturnType<typeof useAppTabs>, 'tabsRef' | 'verlaufLesen'>,
): Record<string, TabVerlauf> {
  const verlaeufe: Record<string, TabVerlauf> = {};
  for (const tab of tabs.tabsRef.current) {
    const verlauf = tabs.verlaufLesen(tab.id);
    if (verlauf) verlaeufe[tab.id] = verlauf;
  }
  return verlaeufe;
}
