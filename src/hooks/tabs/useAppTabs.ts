// Verwaltet Tab-Zustand und bindet den alleinigen Verlaufsbesitzer useVerlaufSteuerung ein.
// Öffnen, Schließen und Übertragen nutzen dessen schmale Funktionen in Teil-Hooks.
//
// Verwaltet den kompletten Tab-Zustand: welche Gesetze in welchen Tabs offen
// sind, welcher Tab aktiv ist, sowie die Sitzungs-Zustände (Scroll-Position,
// Einklapp-Zustand je Tab), die beim Tab-Wechsel erhalten bleiben müssen,
// aber NICHT über App-Neustarts hinaus gespeichert werden.
//
// tabsRef/aktiverTabIdRef werden hier als „immer aktuelle" Spiegel der
// jeweiligen States gepflegt, damit andere Hooks (useFensterRestore.ts,
// useTastenkuerzel.ts), die ihre Event-Listener nur einmal registrieren,
// trotzdem den aktuellen Tab-Stand lesen können.
//
// Öffentliche API: gesetzOeffnen(gesetz, normXmlId?, modus?)
// Aufrufer mit höherem Abstraktionsbedarf (Kurztitel, Bezeichnung-String)
// nutzen elementOeffnen in App.tsx, das intern gesetzOeffnen delegiert.
import { starteTabwechselMessung } from '@/lib/utils/perfMessung';

import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import { useTabGesetzBestand } from './useTabGesetzBestand';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { EinklappZustand, ScrollPosition, Tab } from '@/lib/domain/appTypes';
import { useVerlaufSteuerung } from './useVerlaufSteuerung';
import { geschlosseneTabsMenuStatusSynchronisieren } from '@/lib/persistenz/fenster/fenster.index';
import { useTabOeffnen } from './useTabOeffnen';
import { useTabSchliessen } from './useTabSchliessen';
import { useTabAktualisierungUndUebertragung } from './useTabAktualisierungUndUebertragung';

export function useAppTabs() {
  // Invariante: ein Fenster hat NIE 0 Tabs. Startzustand ist daher immer ein
  // einzelner Leertab (zeigt die Willkommensansicht) statt eines leeren
  // Arrays – useFensterRestore.initialRestore() ersetzt ihn per setTabs(),
  // sobald/falls für dieses Fenster-Label tatsächlich etwas wiederherzustellen
  // ist; ansonsten bleibt er einfach stehen. Siehe auch useTabSchliessen,
  // das dieselbe Invariante beim Schließen des letzten Tabs wahrt.
  const [tabs, setTabsState] = useState<Tab[]>(() => [{ id: crypto.randomUUID() }]);
  const [aktiverTabId, setAktiverTabIdState] = useState<string | null>(() => tabs[0]!.id);
  const [tabTitel, setTabTitel] = useState<Record<string, string>>({});

  const tabsRef = useRef<Tab[]>(tabs);
  const bestandszugang = useTabGesetzBestand(tabsRef);
  const { bestandRef, synchronisiereTabs } = bestandszugang;
  function holeTabGesetz(tab: Tab | null | undefined) {
    return tab?.ladezustand === 'geladen' && tab.gesetzesreferenz
      ? bestandRef.current?.holeGeladenes(tab.gesetzesreferenz)
      : undefined;
  }
  function uebernehmeTabGesetz(tab: Tab, gesetz: GesetzDarstellung): Tab {
    bestandRef.current?.uebernehmeGeladenes(gesetz);
    return {
      ...tab,
      gesetzesreferenz: referenzVon(gesetz),
      ladezustand: 'geladen',
      ausstehendeAnsicht: undefined,
    };
  }
  const aktiverTabIdRef = useRef<string | null>(aktiverTabId);
  const verlaufSteuerung = useVerlaufSteuerung(tabsRef);
  // Die Funktion liest ausschließlich langlebige Refs; auch der einmal
  // registrierte Tabsetter meldet Sichtbarkeit synchron vor dem nächsten Render.
  const sichtbarkeitRef = useRef(verlaufSteuerung.verlaufSichtbarkeit);
  // Alle Änderungen gelten vor dem nächsten Render: unmittelbar folgende
  // Klicks und asynchrone Abschlüsse prüfen denselben aktuellen Tabzustand.
  const setTabs: Dispatch<SetStateAction<Tab[]>> = useCallback(
    (aenderung) => {
      const neu = typeof aenderung === 'function' ? aenderung(tabsRef.current) : aenderung;
      tabsRef.current = neu;
      synchronisiereTabs();
      setTabsState(neu);
    },
    [synchronisiereTabs],
  );
  const setAktiverTabId: Dispatch<SetStateAction<string | null>> = useCallback((aenderung) => {
    const neu = typeof aenderung === 'function' ? aenderung(aktiverTabIdRef.current) : aenderung;
    if (import.meta.env.DEV && neu !== aktiverTabIdRef.current) starteTabwechselMessung();
    sichtbarkeitRef.current(neu);
    aktiverTabIdRef.current = neu;
    setAktiverTabIdState(neu);
  }, []);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    const bestand = bestandszugang.bestand;
    if (!bestand) return;
    let beendet = false;
    for (const tab of tabs) {
      if (
        tab.ladezustand !== 'geladen' ||
        !tab.gesetzesreferenz ||
        bestand.holeGeladenes(tab.gesetzesreferenz)
      )
        continue;
      const referenz = tab.gesetzesreferenz;
      void bestand.ladeGesetz(referenz).then((ergebnis) => {
        if (beendet || ergebnis.status === 'geladen') return;
        setTabs((vorher) =>
          vorher.map((aktuell) =>
            aktuell === tab ? { ...aktuell, ladezustand: ergebnis.status } : aktuell,
          ),
        );
      });
    }
    return () => {
      beendet = true;
    };
  }, [tabs, bestandszugang.bestand, setTabs]);

  // Einmalig beim Mount: "Zuletzt geschlossenen Tab öffnen" (menu.rs:
  // "letzter-tab") ist im nativen Menü zunächst hart auf aktiv gesetzt (Rust
  // kennt den Stapel-Inhalt beim Menüaufbau noch nicht, siehe menu.rs). Ohne
  // diesen Sync bliebe der Punkt bei einem frischen Start – bevor je ein Tab
  // geschlossen wurde – fälschlich aktiv, weil geschlossenenTabPushen/-Poppen
  // (siehe geschlosseneTabsSpeicher.ts) erst bei der ERSTEN Änderung syncen.
  useEffect(() => {
    geschlosseneTabsMenuStatusSynchronisieren();
  }, []);
  useEffect(() => {
    sichtbarkeitRef.current(aktiverTabId);
    aktiverTabIdRef.current = aktiverTabId;
  }, [aktiverTabId]);

  // Präzise In-Session-Scroll-Position je Tab (tabId-Referenzschlüssel → index + offset).
  const scrollPositionenRef = useRef<Record<string, ScrollPosition>>({});
  // Einklapp-Zustand (Gliederung/Normen) je Tab – bleibt beim Tab-Wechsel
  // erhalten, wird aber NICHT über App-Neustarts gespeichert.
  const einklappZustandRef = useRef<Record<string, EinklappZustand>>({});
  const { verlaufLesen, verlaufSetzen, verlaufEntfernen } = verlaufSteuerung;

  // Der Tabzustand bleibt hier; Teil-Hooks führen die zugehörigen Aktionen aus.
  // Die verzögerte Bereinigung verbindet Öffnen und Schließen, ohne Zustand zu duplizieren.
  const oeffnen = useTabOeffnen({
    uebernehmeTabGesetz,
    tabsRef,
    aktiverTabIdRef,
    setTabs,
    setAktiverTabId,
    verlaufNavigationEntwerten: verlaufSteuerung.verlaufNavigationEntwerten,
  });
  const schliessen = useTabSchliessen({
    tabsRef,
    aktiverTabIdRef,
    setTabs,
    setAktiverTabId,
    scrollPositionenRef,
    einklappZustandRef,
    verlaufLesen,
    verlaufEntfernen,
    setTabTitel,
  });
  const aktualisierungUndUebertragung = useTabAktualisierungUndUebertragung({
    ladeGesetz: bestandszugang.ladeGesetz,
    holeTabGesetz,
    uebernehmeTabGesetz,
    tabsRef,
    setTabs,
    setAktiverTabId,
    scrollPositionenRef,
    einklappZustandRef,
    verlaufLesen,
    verlaufSetzen,
    verlaufEntfernen,
    setTabTitel,
    entferneTabAusListe: schliessen.entferneTabAusListe,
  });

  const { bereiteBestandsaustauschVor, uebernehmeAusstehendeAnsichten } =
    aktualisierungUndUebertragung;
  useEffect(
    () =>
      bestandszugang.bestand?.abonnieren((aenderung) => {
        if (aenderung?.geladen) uebernehmeAusstehendeAnsichten(aenderung.geladen);
        if (aenderung?.geloescht) schliessen.gesetzeTabsSchliessen(aenderung.geloescht);
      }),
    [bestandszugang.bestand, uebernehmeAusstehendeAnsichten, schliessen],
  );
  useEffect(
    () => bestandszugang.bestand?.vorAustauschAbonnieren(bereiteBestandsaustauschVor),
    [bestandszugang.bestand, bereiteBestandsaustauschVor],
  );

  return {
    holeTabGesetz,
    holeGeladenes: (referenz: Gesetzesreferenz) => bestandRef.current?.holeGeladenes(referenz),
    holeDatenstand: (referenz: Gesetzesreferenz) => bestandRef.current?.holeDatenstand(referenz),
    uebernehmeTabGesetz,
    ladeGesetz: bestandszugang.ladeGesetz,
    vorladen: bestandszugang.vorladen,
    tabs,
    setTabs,
    aktiverTabId,
    setAktiverTabId,
    tabTitel,
    setTabTitel,
    tabsRef,
    aktiverTabIdRef,
    scrollPositionenRef,
    einklappZustandRef,
    gesetzOeffnen: oeffnen.gesetzOeffnen,
    erstelleLeerenTab: oeffnen.erstelleLeerenTab,
    tabSchliessen: schliessen.tabSchliessen,
    gesetzeTabsSchliessen: (referenzen: Gesetzesreferenz[]) => {
      bestandRef.current?.entferneGesetze(referenzen);
      schliessen.gesetzeTabsSchliessen(referenzen);
    },
    ...verlaufSteuerung,
    gesetzeAktualisierenInTabs: aktualisierungUndUebertragung.gesetzeAktualisierenInTabs,
    gesetzInfoInTabsPatchen: aktualisierungUndUebertragung.gesetzInfoInTabsPatchen,
    tabFuerUebertragungKopieren: aktualisierungUndUebertragung.tabFuerUebertragungKopieren,
    tabUebertragungAbschliessen: aktualisierungUndUebertragung.tabUebertragungAbschliessen,
    tabAusUebertragungUebernehmen: aktualisierungUndUebertragung.tabAusUebertragungUebernehmen,
  };
}
