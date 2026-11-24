// fensterRestorePlan.ts
//
// Reine Entscheidungslogik für useFensterRestore.ts::initialRestore: berechnet
// AUS dem gespeicherten Zustand (dieses Fenster + ggf. andere Fenster, falls
// main), OHNE jeden Tauri-Seiteneffekt, welche Tabs wiederhergestellt werden
// sollen, welche Geometrie-Aktion
// nötig ist und – nur für main – welche anderen Fenster neu geöffnet bzw.
// deren veralteter Speicher-Eintrag bereinigt werden soll.
//
// Ausgelagert aus initialRestore, um die Verzweigungslogik (Cognitive
// Complexity) isoliert und ohne Tauri-Mocking testbar zu machen. Enthält
// bewusst KEINE Zufalls-IDs (crypto.randomUUID()) und KEINE Lese-Zugriffe auf
// Persistenz/Tauri – beides bleibt Aufgabe des Hooks, der aus diesem Plan die
// tatsächlichen Tab-Objekte konstruiert und die Seiteneffekte ausführt.

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type {
  FensterGeometrie,
  GespeichertesFenster,
} from '@/lib/persistenz/fenster/fenster.index';

/** Wie die Geometrie DIESES Fensters behandelt werden soll, bevor es gezeigt wird. */
type GeometrieAktion =
  { typ: 'anwenden'; geometrie: FensterGeometrie } | { typ: 'zentrieren' } | { typ: 'keine' };

interface WiederherzustellenderTab {
  gesetzesreferenz: Gesetzesreferenz;
}

export interface FensterRestorePlan {
  /** Tabs, die für DIESES Fenster wiederhergestellt werden sollen. Leer = nichts
   *  wiederherzustellen, der Initial-Leertab aus useAppTabs.ts bleibt bestehen. */
  wiederherzustellendeTabs: WiederherzustellenderTab[];
  /** Index in wiederherzustellendeTabs, der aktiv sein soll. Nur relevant, wenn
   *  wiederherzustellendeTabs nicht leer ist. */
  aktiverIndex: number;
  /** Bisherige Speicherkennung des von main übernommenen Zustands; null ohne Übernahme. */
  uebernommenesFensterLabel: string | null;
  geometrieAktion: GeometrieAktion;
  /** Nur für main: Labels anderer Fenster mit Inhalt, die neu geöffnet werden
   *  sollen, samt ihrer zuletzt gespeicherten Geometrie. */
  labelsZuOeffnen: Array<{ label: string; geometrie: FensterGeometrie | undefined }>;
  /** Nur für main: Labels anderer (leerer) Fenster, deren veralteter
   *  Speicher-Eintrag entfernt werden soll. */
  labelsZuBereinigen: string[];
}

export interface FensterRestorePlanEingabe {
  fensterLabel: string;
  eigenerZustand: GespeichertesFenster | null;
  existenzFuerReferenz: (referenz: Gesetzesreferenz) => 'vorhanden' | 'fehlt' | 'unbekannt';
  /** Nur für main relevant: Zustand jedes anderen Fenster-Labels (bereits
   *  geladen, siehe Kommentar in useFensterRestore.ts warum vorab statt
   *  lazy pro Label). */
  andereFensterZustaende: Array<{ label: string; zustand: GespeichertesFenster | null }>;
  /** Nur relevant, wenn main keine eigene Geometrie hat.
   *  Bereits gelesen (siehe letzteFensterGeometrieLesen in useFensterRestore.ts). */
  letzteFensterGeometrieFallback: FensterGeometrie | undefined;
}

function wiederherzustellendeTabsErmitteln(
  eigenerZustand: GespeichertesFenster,
  existenzFuerReferenz: FensterRestorePlanEingabe['existenzFuerReferenz'],
): WiederherzustellenderTab[] {
  const treffer: WiederherzustellenderTab[] = [];
  for (const { gesetzesreferenz } of eigenerZustand.tabs) {
    if (existenzFuerReferenz(gesetzesreferenz) === 'fehlt') continue;
    treffer.push({ gesetzesreferenz });
  }
  return treffer;
}

/** Teilt die anderen Fenster-Labels in "mit Inhalt" (neu zu öffnen) und "leer"
 *  (veralteter Eintrag, zu bereinigen) auf. Siehe Dateikopf-Kommentar in
 *  useFensterRestore.ts: leere Nicht-main-Fenster werden nie wiederhergestellt. */
function andereFensterAufteilen(
  andereFensterZustaende: Array<{ label: string; zustand: GespeichertesFenster | null }>,
): {
  mitInhalt: Array<{ label: string; geometrie: FensterGeometrie | undefined }>;
  leer: string[];
} {
  const mitInhalt: Array<{ label: string; geometrie: FensterGeometrie | undefined }> = [];
  const leer: string[] = [];
  for (const { label, zustand } of andereFensterZustaende) {
    if (zustand && zustand.tabs.length > 0) {
      mitInhalt.push({ label, geometrie: zustand.geometrie });
    } else {
      leer.push(label);
    }
  }
  return { mitInhalt, leer };
}

function mainGeometrieAktionErmitteln(
  eigenerZustand: GespeichertesFenster | null,
  letzteFensterGeometrieFallback: FensterGeometrie | undefined,
): GeometrieAktion {
  if (eigenerZustand?.geometrie) return { typ: 'anwenden', geometrie: eigenerZustand.geometrie };
  if (letzteFensterGeometrieFallback) {
    return { typ: 'anwenden', geometrie: letzteFensterGeometrieFallback };
  }
  return { typ: 'zentrieren' };
}

function mainPlanErstellen(
  eingabe: FensterRestorePlanEingabe,
  wiederherzustellendeTabs: WiederherzustellenderTab[],
): FensterRestorePlan {
  const { eigenerZustand, andereFensterZustaende, letzteFensterGeometrieFallback } = eingabe;
  const { mitInhalt, leer: labelsZuBereinigen } = andereFensterAufteilen(andereFensterZustaende);
  // Nur darstellbarer Inhalt verhindert die Übernahme. Die übrigen Öffnungs-
  // und Bereinigungsregeln bleiben unverändert, auch bei fehlenden Gesetzen.
  const quelle =
    wiederherzustellendeTabs.length === 0
      ? [...andereFensterZustaende]
          .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
          .find(({ zustand }) =>
            zustand?.tabs.some(
              (tab) => eingabe.existenzFuerReferenz(tab.gesetzesreferenz) !== 'fehlt',
            ),
          )
      : undefined;
  const zustand = quelle?.zustand ?? eigenerZustand;
  const tabs = quelle?.zustand
    ? wiederherzustellendeTabsErmitteln(quelle.zustand, eingabe.existenzFuerReferenz)
    : wiederherzustellendeTabs;
  const geometrieZustand = quelle?.zustand?.geometrie ? quelle.zustand : eigenerZustand;

  return {
    wiederherzustellendeTabs: tabs,
    aktiverIndex: aktiverIndexErmitteln(zustand, tabs.length, eingabe.existenzFuerReferenz),
    uebernommenesFensterLabel: quelle?.label ?? null,
    geometrieAktion: mainGeometrieAktionErmitteln(geometrieZustand, letzteFensterGeometrieFallback),
    labelsZuOeffnen: mitInhalt.filter(({ label }) => label !== quelle?.label),
    labelsZuBereinigen,
  };
}

function aktiverIndexErmitteln(
  eigenerZustand: GespeichertesFenster | null,
  anzahlWiederherzustellenderTabs: number,
  existenzFuerReferenz: FensterRestorePlanEingabe['existenzFuerReferenz'],
): number {
  // ACHTUNG, GEKOPPELTE geprüft-äquivalente Mutanten (Mutation-Testing-
  // Analyse, siehe Chatverlauf) – NICHT unabhängig voneinander verändern:
  //
  // 1. Der frühe Return hier ist mathematisch redundant: für
  //    anzahlWiederherzustellenderTabs === 0 liefert die Formel unten
  //    Math.min(Math.max(x, 0), -1) für JEDES x bereits -1.
  // 2. Das Optional Chaining unten (eigenerZustand?.aktiverIndex) wird bei
  //    eigenerZustand === null NUR wegen dieses frühen Returns nie mit
  //    null erreicht: die Invariante "eigenerZustand === null ⟹ anzahl
  //    === 0" (siehe fensterRestorePlanErstellen) sorgt dafür, dass Zeile
  //    darunter bei null-Zustand nie ausgeführt wird.
  //
  // Würde jemand Punkt 1 als "redundant" entfernen, OHNE das zu wissen,
  // wäre das Optional Chaining darunter plötzlich scharf (echter
  // Nullpointer-Schutz) – bitte beide Zeilen nur GEMEINSAM anfassen.
  // Stryker disable next-line ConditionalExpression
  if (anzahlWiederherzustellenderTabs === 0) return -1;
  // Stryker disable next-line OptionalChaining
  const eigenerIndex = eigenerZustand?.aktiverIndex ?? 0;
  const aktiverTab = eigenerZustand?.tabs[eigenerIndex];
  if (eigenerZustand && aktiverTab && existenzFuerReferenz(aktiverTab.gesetzesreferenz) !== 'fehlt')
    return eigenerZustand.tabs
      .slice(0, eigenerIndex)
      .filter(({ gesetzesreferenz }) => existenzFuerReferenz(gesetzesreferenz) !== 'fehlt').length;
  // Fällt der aktive Tab selbst weg, bleibt die bisherige Begrenzungsregel.
  return Math.min(Math.max(eigenerIndex, 0), anzahlWiederherzustellenderTabs - 1);
}

/**
 * Berechnet den vollständigen Wiederherstellungs-Plan für dieses Fenster.
 * Reine Funktion: kein Tauri-Zugriff, kein Persistenz-Lesezugriff, keine
 * Zufalls-IDs – initialRestore() in useFensterRestore.ts führt anhand des
 * Ergebnisses nur noch die Seiteneffekte aus.
 */
export function fensterRestorePlanErstellen(
  eingabe: FensterRestorePlanEingabe,
): FensterRestorePlan {
  const { fensterLabel, eigenerZustand, existenzFuerReferenz } = eingabe;
  const wiederherzustellendeTabs = eigenerZustand
    ? wiederherzustellendeTabsErmitteln(eigenerZustand, existenzFuerReferenz)
    : [];

  if (fensterLabel === 'main') {
    return mainPlanErstellen(eingabe, wiederherzustellendeTabs);
  }

  return {
    wiederherzustellendeTabs,
    aktiverIndex: aktiverIndexErmitteln(
      eigenerZustand,
      wiederherzustellendeTabs.length,
      existenzFuerReferenz,
    ),
    uebernommenesFensterLabel: null,
    geometrieAktion: eigenerZustand?.geometrie
      ? { typ: 'anwenden', geometrie: eigenerZustand.geometrie }
      : { typ: 'keine' },
    labelsZuOeffnen: [],
    labelsZuBereinigen: [],
  };
}
