// Prüft gespeicherte Referenzen und ergänzt ausschließlich unveränderte Starttabs nach dem Laden.
import type { Dispatch, SetStateAction } from 'react';
import type { Tab } from '@/lib/domain/appTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { pruefeGesetzExistenz } from '@/lib/persistenz/gesetz/gesetz.index';
import type { GespeichertesFenster } from '@/lib/persistenz/fenster/fenster.index';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { startelementFuerGesetz } from '@/hooks/tabs/startelementFuerGesetz';
import type { FensterRestorePlanEingabe } from '@/lib/domain/app/fensterRestorePlan';

export async function pruefeSitzungsreferenzen(zustaende: Array<GespeichertesFenster | null>) {
  const ergebnisse = new Map<string, Awaited<ReturnType<typeof pruefeGesetzExistenz>>>();
  for (const zustand of zustaende) {
    for (const { gesetzesreferenz } of zustand?.tabs ?? []) {
      const schluessel = gesetzesreferenzSchluessel(gesetzesreferenz);
      if (!ergebnisse.has(schluessel))
        ergebnisse.set(schluessel, await pruefeGesetzExistenz(gesetzesreferenz));
    }
  }
  const existenzFuerReferenz: FensterRestorePlanEingabe['existenzFuerReferenz'] = (ref) =>
    ergebnisse.get(gesetzesreferenzSchluessel(ref)) ?? 'unbekannt';
  return existenzFuerReferenz;
}
export async function ladeStartTab(
  tab: Tab,
  ladeGesetz: ReturnType<typeof useAppTabs>['ladeGesetz'],
  setTabs: Dispatch<SetStateAction<Tab[]>>,
  uebernehmeTabGesetz: (tab: Tab, gesetz: GesetzDarstellung) => Tab,
  beiGeladen: (tab: Tab) => void,
  istAktiv: () => boolean,
) {
  if (!tab.gesetzesreferenz) return;
  const ergebnis = await ladeGesetz(tab.gesetzesreferenz);
  if (!istAktiv()) return;
  setTabs((tabs) =>
    tabs.map((aktuell) => {
      if (aktuell !== tab) return aktuell;
      if (ergebnis.status !== 'geladen') return { ...aktuell, ladezustand: ergebnis.status };
      const geladen = uebernehmeTabGesetz(
        {
          ...aktuell,
          initialNorm: startelementFuerGesetz(ergebnis.gesetz),
        },
        ergebnis.gesetz,
      );
      beiGeladen(geladen);
      return geladen;
    }),
  );
}

export async function ladeStartTabs(
  tabs: Tab[],
  aktiverIndex: number,
  laden: (tab: Tab) => Promise<void>,
  istAktiv: () => boolean,
) {
  const aktiv = tabs[aktiverIndex];
  if (aktiv) await laden(aktiv);
  if (!istAktiv()) return;
  for (const tab of tabs) {
    if (tab !== aktiv)
      void laden(tab).catch((fehler: unknown) =>
        console.error('Starttab konnte nicht geladen werden:', fehler),
      );
  }
}
