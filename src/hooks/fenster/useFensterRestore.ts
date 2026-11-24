// useFensterRestore.ts
//
// Kapselt den Lebenszyklus dieses Tauri-Fensters in Bezug auf seinen
// Tab-Zustand und seine Geometrie (Größe/Position):
//   – initialRestore: stellt beim App-Start die zuletzt offenen Tabs und die
//     zuletzt verwendete Geometrie dieses Fensters wieder her (anhand des
//     Fenster-Labels), zeigt das Fenster danach an (siehe „Unsichtbar
//     starten" unten) und öffnet – nur im Hauptfenster – alle weiteren
//     Fenster, für die noch ein gespeicherter Zustand MIT Inhalt existiert
//   – laufendes (entprelltes) Speichern des aktuellen Tab- und
//     Geometrie-Zustands, sobald sich tabs/aktiverTabId ändern (Geometrie
//     wird bei jedem Speichervorgang frisch vom Fenster abgefragt)
//   – fensterSchliessen: bewusstes Schließen dieses Fensters (z. B. ⌘W)
//   – laufendes Speichern und Beenden-Anfrage: useFensterRestore.speichern.ts
//
// Unsichtbar starten: Jedes Fenster wird (siehe tauri.conf.json bzw.
// neues_fenster in lib.rs) zunächst UNSICHTBAR erzeugt. Erst nachdem dieser
// Hook Tabs UND Geometrie angewendet hat, ruft er show() auf – so springt
// das Fenster nicht erst in falscher Größe/Position auf und „korrigiert"
// sich dann sichtbar (Flackern), sondern erscheint sofort am richtigen Ort.
// geometrieAnwenden() und fensterAnzeigen() haben bewusst GETRENNTE
// try/catch-Blöcke: ein Fehler beim Anwenden der Geometrie darf niemals
// verhindern, dass fensterAnzeigen() noch läuft – sonst bliebe das Fenster
// dauerhaft unsichtbar.
//
// Leere Fenster werden beim Start NICHT wiederhergestellt: ein Fenster ohne
// offenes Gesetz hat keinen wiederherzustellenden Inhalt, ein zusätzliches
// leeres Fenster beim Start ist daher nur unerwünschte Bildschirm-Unordnung
// (der Nutzer kann jederzeit per ⌘N ein neues leeres Fenster öffnen). Das
// Hauptfenster ('main') übernimmt bei Bedarf den Inhalt eines anderen
// gespeicherten Fensters. Ohne wiederherstellbaren Inhalt zeigt es sich leer.
// Veraltete Einträge leerer Nicht-Hauptfenster werden dabei entfernt.
//
// tabsRef/aktiverTabIdRef liefern stets den aktuellen Tab-Stand.
import { mitGeladenemTabGesetz } from '@/lib/domain/app/tabGesetzUebergang';
import { beginneMessabschnitte, messeAsync } from '@/lib/utils/perfMessung';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  ladeFensterZustand,
  alleFensterLabels,
  uebernehmeFensterZustandNachMain,
  entferneFensterZustand,
  hauptFensterGeometrieFuerRustSpeichern,
  letzteFensterGeometrieLesen,
  letzteFensterGeometrieSpeichern,
  type FensterGeometrie,
} from '@/lib/persistenz/fenster/fenster.index';
import { geschlossenenTabPushen } from '@/lib/persistenz/fenster/fenster.index';
import { leererVerlauf } from '@/lib/domain/app/tabVerlauf';
import type { Tab, TabVerlauf } from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { ladeStartTab, ladeStartTabs, pruefeSitzungsreferenzen } from './fensterStartTabs';
import { fensterRestorePlanErstellen } from '@/lib/domain/app/fensterRestorePlan';
import { holePlattform } from '@/lib/plattform/tauriHelpers';
import { linuxTitelleistenPraeferenzLesen } from '@/hooks/einstellungen/useLinuxTitelleistenPraeferenz';

import { aktuelleGeometrieLesen } from './useFensterRestore.hilfen';
import { useFensterZustandSpeichern } from './useFensterRestore.speichern';

function verlaufFuerStartelement(tab: Tab): TabVerlauf {
  if (!tab.initialNorm || !tab.gesetzesreferenz) return leererVerlauf();
  return {
    eintraege: [
      {
        gesetzesreferenz: {
          kurztitel: tab.gesetzesreferenz.kurztitel,
          normgeber: tab.gesetzesreferenz.normgeber,
        },
        xmlId: tab.initialNorm,
      },
    ],
    position: 0,
  };
}

export function useFensterRestore(
  tabs: Tab[],
  aktiverTabId: string | null,
  tabsRef: RefObject<Tab[]>,
  aktiverTabIdRef: RefObject<string | null>,
  verlaufLesen: (tabId: string) => TabVerlauf | undefined,
  verlaufSetzen: (tabId: string, verlauf: TabVerlauf) => void,
  uebernehmeTabGesetz: (tab: Tab, gesetz: GesetzDarstellung) => Tab = mitGeladenemTabGesetz,
) {
  const [restoreErledigt, setRestoreErledigt] = useState(false);
  // Sichtbar vor dem Laden der Starttabs: Ab hier darf die gespeicherte
  // Gesetzesliste gelesen werden, ohne die Anzeige des Fensters zu verzögern.
  const [fensterSichtbar, setFensterSichtbar] = useState(false);
  const gemountet = useRef(true);
  // Der native Schließhandler lebt über React-Render hinweg. Nach einem
  // Übernahmefehler darf er den erhaltenen Speicherbestand nicht aufräumen.
  const uebernahmeFehlgeschlagenRef = useRef(false);

  // Label dieses Fensters (z. B. "main" oder "fenster-…") – Schlüssel für den
  // gespeicherten Tab-/Geometrie-Zustand in fensterSpeicher.ts.
  const fensterLabelRef = useRef<string>('main');
  // Laufendes Speichern des Fensterzustands samt Beenden-Anfrage.
  const { beendeFensterSpeichern } = useFensterZustandSpeichern({
    tabs,
    aktiverTabId,
    tabsRef,
    aktiverTabIdRef,
    fensterLabelRef,
    restoreErledigt,
    gemountet,
    uebernahmeFehlgeschlagenRef,
  });

  useEffect(() => {
    gemountet.current = true;
    return () => {
      gemountet.current = false;
    };
  }, []);

  /**
   * Legt alle offenen Tabs dieses Fensters (mit gesetz) auf den
   * fensterübergreifenden Verlauf-Stapel (geschlosseneTabsSpeicher.ts),
   * bevor das Fenster tatsächlich verschwindet – unabhängig davon, ob es
   * über ⌘W oder den nativen Schließen-Knopf geschlossen wird (siehe
   * onCloseRequested in initialRestore). Reihenfolge: aktiver Tab zuletzt
   * gepusht, damit er bei ⇧⌘T als Erstes zurückgeholt wird.
   */
  function pushOffeneTabsAufVerlaufStapel() {
    const alleTabs = tabsRef.current;
    const aktiverId = aktiverTabIdRef.current;
    const geordnet = [
      ...alleTabs.filter((t) => t.id !== aktiverId),
      ...alleTabs.filter((t) => t.id === aktiverId),
    ];
    for (const tab of geordnet) {
      if (!tab.gesetzesreferenz) continue;
      geschlossenenTabPushen({
        gesetzesreferenz: {
          kurztitel: tab.gesetzesreferenz.kurztitel,
          normgeber: tab.gesetzesreferenz.normgeber,
        },
        verlauf: verlaufLesen(tab.id) ?? leererVerlauf(),
      });
    }
  }

  /** Wendet eine gespeicherte Geometrie auf dieses Fenster an, falls vorhanden. */
  async function geometrieAnwenden(geometrie: FensterGeometrie | undefined) {
    if (!geometrie) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/dpi');
      const fenster = getCurrentWindow();
      // Rust kann main bereits maximiert haben. Größe und Position heben
      // diesen Zustand nicht zuverlässig auf; erst den Zielzustand vorbereiten.
      if (!geometrie.maximiert) await fenster.unmaximize();
      await fenster.setSize(new PhysicalSize(geometrie.breite, geometrie.hoehe));
      await fenster.setPosition(new PhysicalPosition(geometrie.x, geometrie.y));
      if (geometrie.maximiert) await fenster.maximize();
      // setSize/setPosition werden zwar awaitet, das garantiert aber nur, dass
      // der Befehl angenommen wurde – nicht, dass das Betriebssystem das
      // Fenster bis hierhin auch schon tatsächlich neu gezeichnet hat. Ohne
      // diesen Lese-Rückruf könnte das direkt danach aufgerufene show() (siehe
      // fensterAnzeigen) das Fenster kurz noch in der alten Größe zeigen, bevor
      // es auf die neue „springt" – sichtbares Flackern beim Start. innerSize()
      // kehrt erst zurück, wenn die neue Größe wirklich angewendet ist, und
      // erzwingt damit die nötige Reihenfolge.
      await fenster.innerSize();
    } catch {
      /* nicht in Tauri-Umgebung, oder Geometrie ungültig – Fenster bleibt bei Default-Größe */
    }
  }

  /**
   * Zentriert dieses Fenster. NUR für main ohne gespeicherte Geometrie gedacht
   * (siehe initialRestore) – main startet (siehe tauri.conf.json) bewusst
   * außerhalb des Bildschirms, um ein Aufblitzen an der Default-Position zu
   * vermeiden; ohne dieses Zentrieren bliebe main ohne Geometrie-Eintrag dort
   * hängen. NICHT in geometrieAnwenden(), da diese auch für per ⌘N neu
   * erzeugte Fenster ohne eigenen localStorage-Eintrag aufgerufen wird – die
   * sollen ihre von Rust gesetzte Kaskaden-Position (neues_fenster in lib.rs)
   * behalten, nicht zentriert werden.
   */
  async function fensterZentrieren() {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().center();
    } catch {
      /* nicht in Tauri-Umgebung */
    }
  }

  /**
   * Setzt vor dem ersten Sichtbarwerden die passende Fensterdekoration:
   *   – macOS: unverändert (titleBarStyle/hiddenTitle in tauri.*.conf.json,
   *     kein Laufzeit-Aufruf nötig).
   *   – Windows: decorations:false ist in tauri.windows.conf.json gesetzt,
   *     ABER das gilt nur für das von Tauri automatisch erzeugte
   *     'main'-Fenster. Zusätzliche Fenster (⌘N/Strg+N, Tab in neues Fenster
   *     gezogen) werden zur Laufzeit über WebviewWindowBuilder in
   *     fenster.rs::neues_fenster() erzeugt, OHNE decorations() zu setzen
   *     (Tauri-Default dort: true) – deshalb hier für JEDES Fenster aktiv
   *     gesetzt, nicht nur zur Klarheit erwähnt. Für 'main' ist der Aufruf
   *     redundant (bereits false), aber unschädlich.
   *   – Linux: decorations startet bei true (native Titelleiste, sicherer
   *     Fallback – siehe useLinuxTitelleistenPraeferenz.ts). Nur wenn der
   *     Nutzer sich explizit für 'eigene' entschieden hat (Erstlauf-Dialog
   *     LinuxTitelleistenAbfrage.tsx oder nachträglich in Einstellungen.tsx),
   *     wird hier auf false umgeschaltet. MUSS vor show() passieren, sonst
   *     wäre kurz die native Titelleiste sichtbar, bevor sie verschwindet.
   *     Deckt nur den FENSTER-START ab; eine Präferenz-Änderung zur Laufzeit auf ein
   *     bereits sichtbares Fenster wendet linuxTitelleistenPraeferenzSofortAnwenden()
   *     (oben in dieser Datei) an, mit identischer Plattformprüfung.
   */
  async function decorationsAnwenden() {
    try {
      const plattform = await holePlattform();
      const brauchtEigeneTitelleiste =
        plattform === 'windows' ||
        (plattform === 'linux' && linuxTitelleistenPraeferenzLesen() === 'eigene');
      if (!brauchtEigeneTitelleiste) return;
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setDecorations(false);
    } catch {
      /* nicht in Tauri-Umgebung, oder Plattform nicht ermittelbar */
    }
  }

  /** Zeigt dieses Fenster an. Wird IMMER aufgerufen, unabhängig vom Ergebnis der vorigen Schritte. */
  async function fensterAnzeigen() {
    try {
      await decorationsAnwenden();
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const internAngezeigt = await rufeBefehl('interne_navigation_anzeigen');
      if (!internAngezeigt) await getCurrentWindow().show();
      // "Schließen"/"Fenster schließen" (siehe menu.rs) sollen ab hier nicht
      // mehr grau sein – der native WindowEvent-Handler (siehe lib.rs::run)
      // deckt zwar das spätere Schließen/Zerstören zuverlässig ab, aber für
      // dieses erste Sichtbarwerden gibt es kein beobachtbares WindowEvent
      // (siehe fenster_menu_status_aktualisieren-Kommentar in fenster.rs).
      await rufeBefehl('fenster_menu_status_aktualisieren');
    } catch {
      /* nicht in Tauri-Umgebung */
    }
  }

  /** Schreibt die Übernahme vor jeder Tabanwendung und schützt den Fehlerabschluss. */
  async function fensterUebernahmeSpeichern(
    quellLabel: string,
    geometrie: FensterGeometrie | undefined,
  ) {
    try {
      uebernehmeFensterZustandNachMain(quellLabel, geometrie);
    } catch (fehler) {
      uebernahmeFehlgeschlagenRef.current = true;
      // Ohne gespeicherte Hauptfenstergeometrie startet main außerhalb des
      // Bildschirms. Auch der sichtbare Fehlerabschluss muss erreichbar sein.
      await fensterZentrieren();
      throw fehler;
    }
    await hauptFensterGeometrieFuerRustSpeichern(geometrie);
  }

  async function restoreGeometrieAnwenden(
    aktion: ReturnType<typeof fensterRestorePlanErstellen>['geometrieAktion'],
  ) {
    if (aktion.typ === 'anwenden') await geometrieAnwenden(aktion.geometrie);
    else if (aktion.typ === 'zentrieren') await fensterZentrieren();
  }

  /**
   * Stellt beim App-Start die zuletzt offenen Tabs und die zuletzt verwendete
   * Geometrie dieses Fensters wieder her und zeigt das Fenster danach an.
   * Referenzen werden vor dem Laden geprüft; das Fenster zeigt bereits die Tableiste.
   *
   * Rückgabewert: ob für DIESES Fenster tatsächlich Tabs wiederhergestellt
   * wurden. Wird von App.tsx genutzt, um beim Verarbeiten eines App-Start-
   * Deep-Links zu entscheiden, ob der noch leere Initial-Tab (useAppTabs.ts)
   * befüllt werden soll (nichts wiederhergestellt) oder ein neuer Tab nötig
   * ist (es gibt bereits wiederhergestellten Inhalt, der nicht überschrieben
   * werden darf).
   */
  async function initialRestore(
    ladeGesetz: ReturnType<typeof useAppTabs>['ladeGesetz'],
    setTabs: Dispatch<SetStateAction<Tab[]>>,
    setAktiverTabId: Dispatch<SetStateAction<string | null>>,
  ): Promise<boolean> {
    const abschnitt = beginneMessabschnitte('Sitzungswiederherstellung');
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const fenster = getCurrentWindow();
      fensterLabelRef.current = fenster.label;
      // Fängt JEDES Schließen dieses Fensters ab – sowohl bewusstes ⌘W
      // (fensterSchliessen() ruft nur noch close() auf, siehe unten) als
      // auch den nativen Schließen-Knopf der Fensterdekoration, der bisher
      // komplett an diesem Hook vorbeilief und daher weder den
      // Verlauf-Stapel noch Geometrie/Fensterzustand aufräumte.
      // preventDefault() + explizites destroy() statt einfach durchlaufen
      // zu lassen, damit unser Cleanup IMMER vor dem tatsächlichen
      // Verschwinden des Fensters läuft. destroy() statt close() am Ende,
      // da close() erneut dieses Ereignis auslösen würde (Endlosschleife).
      await fenster.onCloseRequested(async (event) => {
        event.preventDefault();
        // Windows/Linux: Das letzte Hauptfenster beendet die App über die
        // Beenden-Anfrage (fenster/beenden.rs); Sitzung und Fensterzustand
        // bleiben dabei erhalten, bei Abbruch bleibt das Fenster offen.
        if (!(await hauptfensterSchliessenFreigegeben())) return;
        beendeFensterSpeichern();
        // try/finally: destroy() MUSS in jedem Fall laufen, sonst bliebe das
        // Fenster für immer offen (preventDefault() wurde ja schon
        // aufgerufen) – selbst wenn einer der Cleanup-Schritte unerwartet
        // wirft. Der Fehler wird geloggt, damit die eigentliche Ursache
        // auffindbar bleibt, statt nur lautlos zu blockieren.
        try {
          if (uebernahmeFehlgeschlagenRef.current) return;
          pushOffeneTabsAufVerlaufStapel();
          await letzteFensterGeometrieSpeichern(await aktuelleGeometrieLesen());
          entferneFensterZustand(fenster.label);
        } catch (fehler) {
          console.error('Fehler beim Aufräumen vor dem Schließen des Fensters:', fehler);
        } finally {
          await fenster.destroy();
        }
      });
    } catch {
      /* nicht in Tauri-Umgebung */
    }

    abschnitt('Anmelden fürs Schließen');
    const eigenerZustand = ladeFensterZustand(fensterLabelRef.current);
    const istMain = fensterLabelRef.current === 'main';

    // Nur main muss den Zustand ANDERER Fenster kennen (welche neu geöffnet
    // bzw. bereinigt werden). Für alle anderen Fenster bleibt dies leer, die
    // reine Plan-Funktion ignoriert es dann ohnehin (siehe fensterRestorePlan.ts).
    const andereFensterZustaende = istMain
      ? alleFensterLabels()
          .filter((label) => label !== 'main')
          .map((label) => ({ label, zustand: ladeFensterZustand(label) }))
      : [];

    // Nur main ohne eigene Geometrie braucht den (Datei-)Fallback – für alle
    // anderen Fälle würde der Lesezugriff nur unnötig verzögern.
    const letzteFensterGeometrieFallback =
      istMain && !eigenerZustand?.geometrie ? await letzteFensterGeometrieLesen() : undefined;

    const existenzFuerReferenz = await pruefeSitzungsreferenzen([
      eigenerZustand,
      ...andereFensterZustaende.map(({ zustand }) => zustand),
    ]);
    if (!gemountet.current) return false;
    const plan = fensterRestorePlanErstellen({
      fensterLabel: fensterLabelRef.current,
      eigenerZustand,
      existenzFuerReferenz,
      andereFensterZustaende,
      letzteFensterGeometrieFallback,
    });

    abschnitt('Zustände lesen und Plan');
    if (plan.uebernommenesFensterLabel !== null) {
      await fensterUebernahmeSpeichern(
        plan.uebernommenesFensterLabel,
        plan.geometrieAktion.typ === 'anwenden' ? plan.geometrieAktion.geometrie : undefined,
      );
    }

    // Ohne Inhalt bleibt der Initial-Leertab erhalten. Zufalls-IDs gehören
    // zum Hook, nicht zur reinen Plan-Funktion.
    const wiederhergestellt = plan.wiederherzustellendeTabs.length > 0;
    const neueTabs: Tab[] = plan.wiederherzustellendeTabs.map(({ gesetzesreferenz }) => ({
      id: crypto.randomUUID(),
      gesetzesreferenz,
      ladezustand: 'ladend',
    }));
    if (wiederhergestellt) {
      setTabs(neueTabs);
      setAktiverTabId(neueTabs[plan.aktiverIndex]!.id);
    }

    // Veraltete Einträge leerer anderer Fenster bereinigen (nur main betroffen).
    for (const label of plan.labelsZuBereinigen) {
      entferneFensterZustand(label);
    }

    abschnitt('Tabs setzen und Zustand bereinigen');
    await restoreGeometrieAnwenden(plan.geometrieAktion);
    abschnitt('Geometrie anwenden');
    await messeAsync('Fenster anzeigen', fensterAnzeigen);
    abschnitt('Fenster sichtbar (show bestätigt)');
    if (gemountet.current) setFensterSichtbar(true);
    if (import.meta.env.DEV)
      console.info(`[perf] Fenster sichtbar seit Navigation: ${performance.now().toFixed(1)} ms`);

    if (!gemountet.current) return wiederhergestellt;
    const laden = (tab: Tab) =>
      ladeStartTab(
        tab,
        ladeGesetz,
        setTabs,
        uebernehmeTabGesetz,
        (geladen) => verlaufSetzen(geladen.id, verlaufFuerStartelement(geladen)),
        () => gemountet.current,
      );
    await ladeStartTabs(neueTabs, plan.aktiverIndex, laden, () => gemountet.current);
    if (!gemountet.current) return wiederhergestellt;
    // Der vollständige Referenzstand steht bereits. Andere Fenster starten selbst;
    // ihr nativer Erzeugungsabschluss blockiert keine Folgearbeit dieses Fensters.
    for (const { label, geometrie } of plan.labelsZuOeffnen) {
      void messeAsync(`Weiteres Fenster öffnen: ${label}`, () =>
        rufeBefehl('fenster_oeffnen_mit_label', { label, geometrie: geometrie ?? null }),
      ).catch((fehler: unknown) =>
        console.error('Fenster konnte nicht wiederhergestellt werden:', fehler),
      );
    }

    setRestoreErledigt(true);
    return wiederhergestellt;
  }

  async function fensterSchliessen() {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      // Der eigentliche Cleanup (Verlauf-Stapel, Geometrie, Fensterzustand)
      // läuft zentral im onCloseRequested-Handler aus initialRestore –
      // close() löst genau dieses Ereignis aus, auch für diesen bewussten
      // ⌘W-Weg. So gibt es nur noch EINE Stelle, die beim Schließen
      // aufräumt, egal ob über ⌘W oder den nativen Schließen-Knopf.
      await getCurrentWindow().close();
    } catch (fehler) {
      console.error('Fenster konnte nicht geschlossen werden:', fehler);
    }
  }

  // Ladefehler sichtbar machen, ohne gespeicherte Tabs mit einem vermeintlich
  // leeren Bestand zu ersetzen oder dessen Speicherung zu aktivieren.
  return {
    restoreErledigt,
    fensterSichtbar,
    initialRestore,
    fensterSchliessen,
    beiLadefehlerAnzeigen: fensterAnzeigen,
  };
}

async function hauptfensterSchliessenFreigegeben(): Promise<boolean> {
  try {
    return (await rufeBefehl('hauptfenster_schliessen_freigeben')) !== false;
  } catch (fehler) {
    // Ohne Antwort aus Rust wie bisher schließen, damit das Fenster nicht hängen bleibt.
    console.error('Beenden-Prüfung beim Schließen fehlgeschlagen:', fehler);
    return true;
  }
}
