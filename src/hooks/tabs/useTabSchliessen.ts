// Schließt Tabs einschließlich Stapel der geschlossenen Tabs und Ansichtsbereinigung.
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { EinklappZustand, ScrollPosition, Tab, TabVerlauf } from '@/lib/domain/appTypes';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { naechsteAktiveTabIdNachSchliessen } from '@/lib/domain/app/tabAktivierung';
import { leererVerlauf, verlaufOhneAktivierung } from '@/lib/domain/app/tabVerlauf';
import {
  geschlossenenTabPushen,
  type GeschlossenerTab,
} from '@/lib/persistenz/fenster/fenster.index';

export function useTabSchliessen({
  tabsRef,
  aktiverTabIdRef,
  setTabs,
  setAktiverTabId,
  scrollPositionenRef,
  einklappZustandRef,
  verlaufLesen,
  verlaufEntfernen,
  setTabTitel,
}: {
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setAktiverTabId: Dispatch<SetStateAction<string | null>>;
  scrollPositionenRef: RefObject<Record<string, ScrollPosition>>;
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>;
  verlaufLesen: (tabId: string) => TabVerlauf | undefined;
  verlaufEntfernen: (tabId: string) => void;
  setTabTitel: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  function entferneTabAusListe(prev: Tab[], tabId: string): Tab[] {
    const neu = prev.filter((t) => t.id !== tabId);
    if (neu.length === 0) {
      const leererTab: Tab = { id: crypto.randomUUID() };
      aktiverTabIdRef.current = leererTab.id;
      setAktiverTabId(leererTab.id);
      return [leererTab];
    }
    if (aktiverTabIdRef.current === tabId) {
      aktiverTabIdRef.current = naechsteAktiveTabIdNachSchliessen(prev, neu, tabId);
      setAktiverTabId(aktiverTabIdRef.current);
    }
    return neu;
  }

  function tabSchliessen(tabId: string) {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.gesetzesreferenz) {
      const geschlossenerTab: GeschlossenerTab = {
        gesetzesreferenz: {
          kurztitel: tab.gesetzesreferenz.kurztitel,
          normgeber: tab.gesetzesreferenz.normgeber,
        },
        verlauf: verlaufOhneAktivierung(verlaufLesen(tabId) ?? leererVerlauf()),
      };
      geschlossenenTabPushen(geschlossenerTab);
    }
    verlaufEntfernen(tabId);

    // Wie bei Gesetzeslöschungen gilt die Entfernung bereits vor dem nächsten Render.
    const verbleibende = entferneTabAusListe(tabsRef.current, tabId);
    tabsRef.current = verbleibende;
    setTabs(verbleibende);
    setTabTitel((prev) => {
      const n = { ...prev };
      delete n[tabId];
      return n;
    });
    bereinigeTabAnsichtsRefs(tabId);
  }

  function bereinigeTabAnsichtsRefs(tabId: string) {
    for (const ref of [scrollPositionenRef, einklappZustandRef]) {
      for (const key of Object.keys(ref.current)) {
        if (key.startsWith(tabId + '-')) delete ref.current[key];
      }
    }
  }

  /** Entfernt alle Tabs bestätigter Löschungen atomar. Dieselbe Operation
   * wird lokal und beim globalen Ereignis verwendet; Wiederholung ist folgenlos. */
  function gesetzeTabsSchliessen(referenzen: Gesetzesreferenz[]) {
    const vorher = tabsRef.current;
    const schliessen = vorher.filter(
      (tab) =>
        tab.gesetzesreferenz &&
        referenzen.some((referenz) => istGleichesGesetz(referenz, tab.gesetzesreferenz!)),
    );
    if (schliessen.length === 0) return;
    let verbleibende = vorher;
    let aktiv = aktiverTabIdRef.current;
    for (const tab of schliessen) {
      const neu = verbleibende.filter((vorhanden) => vorhanden.id !== tab.id);
      if (aktiv === tab.id && neu.length > 0) {
        aktiv = naechsteAktiveTabIdNachSchliessen(verbleibende, neu, tab.id);
      }
      verbleibende = neu;
      // Gleiche Hilfszustandsbereinigung und Stapelregel wie beim manuellen Schließen.
      if (tab.gesetzesreferenz)
        geschlossenenTabPushen({
          gesetzesreferenz: {
            kurztitel: tab.gesetzesreferenz.kurztitel,
            normgeber: tab.gesetzesreferenz.normgeber,
          },
          verlauf: verlaufOhneAktivierung(verlaufLesen(tab.id) ?? leererVerlauf()),
        });
      verlaufEntfernen(tab.id);
      bereinigeTabAnsichtsRefs(tab.id);
    }
    if (verbleibende.length === 0) {
      verbleibende = [{ id: crypto.randomUUID() }];
      aktiv = verbleibende[0]!.id;
    }
    // Sofortige Spiegel verhindern doppelte Stapel-/Tabänderungen vor dem nächsten Render.
    tabsRef.current = verbleibende;
    aktiverTabIdRef.current = aktiv;
    setTabs(verbleibende);
    setAktiverTabId(aktiv);
    setTabTitel((bisher) =>
      Object.fromEntries(
        Object.entries(bisher).filter(([id]) => !schliessen.some((tab) => tab.id === id)),
      ),
    );
  }

  return {
    entferneTabAusListe,
    bereinigeTabAnsichtsRefs,
    tabSchliessen,
    gesetzeTabsSchliessen,
  };
}
