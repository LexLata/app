// Öffnet bereits geladene Gesetze in Tabs auf dem Zustand von useAppTabs.
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { OeffnenModus, Tab } from '@/lib/domain/appTypes';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { startelementFuerGesetz } from './startelementFuerGesetz';

/** Bezugspunkt einer verzögert abgeschlossenen Öffnung (siehe useGesetzOeffnen). */
export interface GesetzOeffnenOptionen {
  /** Ersetzt den aktiven Tab als Bezugstab der Modi 'aktiver-tab'/'immer-aktiver-tab'. */
  ausgangsTabId?: string;
  /** false: Zieltab wird befüllt bzw. angelegt, aber nicht aktiviert. */
  aktivieren?: boolean;
  /** Abschluss einer laufenden Verlaufsnavigation: deren Befehlsreihe bleibt gültig. */
  verlaufNavigation?: boolean;
}

export function useTabOeffnen({
  uebernehmeTabGesetz,
  tabsRef,
  aktiverTabIdRef,
  setTabs,
  setAktiverTabId,
  verlaufNavigationEntwerten,
}: {
  uebernehmeTabGesetz: (tab: Tab, gesetz: GesetzDarstellung) => Tab;
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setAktiverTabId: Dispatch<SetStateAction<string | null>>;
  verlaufNavigationEntwerten: (tabId: string) => void;
}) {
  // ---------------------------------------------------------------------------
  // Interne Bausteine
  // ---------------------------------------------------------------------------

  // Wenn kein explizites Sprungziel angegeben: zuletzt aktives Element laden,
  // damit Gesetzestextansicht beim ersten Öffnen direkt an der richtigen Stelle ist.
  // Gilt nicht beim Navigieren zu einem vorhandenen Tab (navigiereZuVorhandenem...),
  // da der Tab schon offen ist und seine Scroll-Position selbst hält.
  function normFuerNeuenTab(gesetz: GesetzDarstellung, expliziteNorm?: string): string | undefined {
    return startelementFuerGesetz(gesetz, expliziteNorm);
  }

  function erstelleUndAktiviereNeuenTab(
    gesetz: GesetzDarstellung,
    initialNorm?: string,
    aktivieren = true,
  ): string {
    const tabId = crypto.randomUUID();
    const tab: Tab = uebernehmeTabGesetz(
      { id: tabId, initialNorm: normFuerNeuenTab(gesetz, initialNorm) },
      gesetz,
    );
    // Ein expliziter Normsprung schreibt noch vor dem nächsten Render in den Verlauf.
    setTabs((prev) => [...prev, tab]);
    if (aktivieren) setAktiverTabId(tabId);
    return tabId;
  }

  function erstelleLeerenTab() {
    const tabId = crypto.randomUUID();
    setTabs((prev) => [...prev, { id: tabId }]);
    setAktiverTabId(tabId);
  }

  function navigiereZuVorhandenemTabUndAktiviere(
    tabId: string,
    gesetz: GesetzDarstellung,
    initialNorm?: string,
    aktivieren = true,
  ) {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        const erstesZeigen =
          tab.ladezustand !== 'geladen' ||
          !tab.gesetzesreferenz ||
          !istGleichesGesetz(tab.gesetzesreferenz, gesetz);
        if (!initialNorm && !erstesZeigen) return tab;
        return uebernehmeTabGesetz(
          { ...tab, initialNorm: normFuerNeuenTab(gesetz, initialNorm) },
          gesetz,
        );
      }),
    );
    if (aktivieren) setAktiverTabId(tabId);
  }

  // ---------------------------------------------------------------------------
  // Öffentliche API
  // ---------------------------------------------------------------------------

  /**
   * Öffnet ein Gesetz (ggf. zu einer Norm springend) gemäß dem gewählten Modus.
   * Einziger öffentlicher Einstiegspunkt für Tab-Operationen.
   *
   * Liest den Tab-Stand über tabsRef/aktiverTabIdRef (Refs statt State), damit
   * die Funktion stabil bleibt und aus einmalig registrierten Event-Listenern
   * (useTastenkuerzel.ts) heraus immer den aktuellen Zustand sieht.
   *
   * Modus-Semantik: siehe OeffnenModus in appTypes.ts.
   *
   * Rückgabewert: die id des Tabs, in dem das Gesetz/die Norm letztlich
   * angezeigt wird (für alle Modi, auch beim Wechsel zu einem bereits
   * vorhandenen Tab) – wird u. a. von App.tsx genutzt, um nach dem Öffnen
   * direkt einen Verlaufseintrag für den richtigen Tab anzulegen.
   * meldeStartelement liefert dazu das tatsächliche Ziel; bei bloßer
   * Aktivierung eines vorhandenen Tabs ohne Ziel bleibt es undefined.
   */
  function gesetzOeffnen(
    gesetz: GesetzDarstellung,
    normXmlId?: string,
    modus: OeffnenModus = 'bevorzugt-vorhanden',
    meldeStartelement?: (xmlId: string | undefined) => void,
    optionen: GesetzOeffnenOptionen = {},
  ): string {
    const aktivieren = optionen.aktivieren ?? true;
    const bisherigeTabs = tabsRef.current;
    const tabId = oeffnen();
    if (!optionen.verlaufNavigation) verlaufNavigationEntwerten(tabId);
    const bisher = bisherigeTabs.find((t) => t.id === tabId);
    const erstesZeigen =
      bisher?.ladezustand !== 'geladen' ||
      !bisher.gesetzesreferenz ||
      !istGleichesGesetz(bisher.gesetzesreferenz, gesetz);
    meldeStartelement?.(normXmlId ?? (erstesZeigen ? normFuerNeuenTab(gesetz) : undefined));
    return tabId;

    function oeffnen(): string {
      const aktTabs = tabsRef.current;
      const aktTabId = optionen.ausgangsTabId ?? aktiverTabIdRef.current;
      const passt = (tab: Tab) =>
        !!tab.gesetzesreferenz && istGleichesGesetz(tab.gesetzesreferenz, gesetz);
      const neuerTab = () => erstelleUndAktiviereNeuenTab(gesetz, normXmlId, aktivieren);
      const vorhandenen = (id: string) => {
        navigiereZuVorhandenemTabUndAktiviere(id, gesetz, normXmlId, aktivieren);
        return id;
      };

      if (modus === 'immer-neu') return neuerTab();

      if (modus === 'immer-aktiver-tab') {
        // Garantiert im aufrufenden Tab bleiben – anders als 'aktiver-tab'
        // KEINE Suche nach einem anderen Tab, der das Gesetz schon zeigt (siehe
        // OeffnenModus-Dokumentation in appTypes.ts). Verwendet von der
        // Verlaufs-Navigation (⌥←/⌥→) und der Tab-Wiederherstellung (⇧⌘T).
        if (!aktTabId) return neuerTab();
        return vorhandenen(aktTabId);
      }

      if (modus === 'aktiver-tab') {
        // 1. Aktiver Tab zeigt bereits dieses Gesetz → dort navigieren
        const aktuellerTab = aktTabs.find((t) => t.id === aktTabId);
        if (aktuellerTab && passt(aktuellerTab)) return vorhandenen(aktuellerTab.id);
        // 2. Gesetz in anderem Tab offen → zu dem wechseln
        const vorhandener = aktTabs.find(passt);
        if (vorhandener) return vorhandenen(vorhandener.id);
        // 3. Kein Tab mit diesem Gesetz → aktiven Tab ersetzen (auch leeren Tab befüllen)
        return aktTabId ? ersetzen(aktTabId) : neuerTab();
      }

      // 'bevorzugt-vorhanden' (Default): vorhandener Tab, sonst neuer Tab.
      const vorhandener = aktTabs.find(passt);
      if (vorhandener) return vorhandenen(vorhandener.id);
      return neuerTab();
    }

    function ersetzen(id: string): string {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id
            ? uebernehmeTabGesetz(
                { ...t, initialNorm: normFuerNeuenTab(gesetz, normXmlId) },
                gesetz,
              )
            : t,
        ),
      );
      if (aktivieren) setAktiverTabId(id);
      return id;
    }
  }

  return {
    gesetzOeffnen,
    erstelleLeerenTab,
  };
}
