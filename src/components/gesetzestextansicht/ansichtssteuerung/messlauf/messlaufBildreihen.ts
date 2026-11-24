// messlaufBildreihen.ts
// Bildreihen eines Messlaufs Stufe 2 (nur Entwicklungsbetrieb): Bildzeiten, Aufrufe je Bild,
// Lage des Referenzelements (Textsprung), Arbeitszeit je Bild und Neuaufbau-Kosten. Gemeinsam für
// Schrittmodus, Gleitmodus und Aufzeichnung.
//
// Begriffe (Plan „Scrollen in langen Gesetzen“, Grundlagen):
// - Textsprung: Restverschiebung des Referenzelements (oberstes sichtbares Element) je Bild.
//   Scrollt das Skript selbst, zählt der geschriebene Schritt; scrollt der Browser oder der
//   Nutzer, die gelesene Änderung der Scrollposition ohne die Höhenkorrekturen des Programms.
// - Arbeitszeit je Bild: Scroll-Verarbeitung bis Ende des folgenden Commits. Scrollereignisse
//   werden in der Erfassungsphase am Dokument erfasst, also vor der Bibliothek; Commits meldet
//   die Ansicht (useMesslauf.ts). Bildgrenze ist der Aufruf des Bildrückrufs.
// - Neuaufbau-Kosten: Render und Messung je neu erscheinendem Element, aus Arbeitszeit und den
//   im Fenster erstmals gemessenen Elementen genähert (messlaufKennzahlen.ts).
// - Bildzeit-Aufteilung: React-Renderzeit (Profiler der Ansicht), übrige Zeit bis Commit-Ende und
//   Zeit nach dem Commit bis Bildende je Arbeitsfenster (messlaufKennzahlen.ts).
import {
  erstelleLayoutDiagnose,
  meldeScrollDiagnose,
} from '@/lib/utils/scrollAufzeichnungDiagnose';
import {
  arbeitsfensterJeBild,
  bildzeitAufteilung,
  neuaufbauKostenJeElement,
  type Bildverschiebung,
  type MesslaufBildreihen,
  type Renderzeit,
} from '@/lib/utils/messlaufKennzahlen';
import type { MesslaufRekorder } from '@/components/gesetzestextansicht/ansichtssteuerung/scrollen/scrollen.index';

export const bild = () => new Promise<number>((weiter) => requestAnimationFrame(weiter));

interface BildreihenQuellen {
  readonly container: HTMLElement;
  readonly rekorder: MesslaufRekorder;
  /** Commit-Enden der Ansicht seit Beginn des Laufs (performance.now()). */
  commitZeitpunkte(): readonly number[];
  /** React-Renderzeiten der Ansicht seit Beginn des Laufs (Profiler). */
  renderzeiten(): readonly Renderzeit[];
}

/** Erfasst ab sofort; `beenden()` löst die Beobachtung und liefert die Reihen. `nurBeiBewegung`:
 * Bildzeiten nur für Bilder mit Scrollereignis (Aufzeichnung mit Ruhephasen). `textsprung`:
 * false liest keine Lage des Referenzelements; Textsprung-Kennzahlen bleiben dann leer. */
export function erstelleBildreihen(
  quellen: BildreihenQuellen,
  { nurBeiBewegung = false, textsprung = true } = {},
) {
  const { container, rekorder } = quellen;
  const bildzeitenMs: number[] = [];
  const bildgrenzen: number[] = [];
  const scrollZeitpunkte: number[] = [];
  const bildverschiebungen: Bildverschiebung[] = [];
  let textsprungFehlendeVergleiche = 0;
  let hatteLesung = false;
  const aufrufeJeBild: { getItemKey: number[]; estimateSize: number[] } = {
    getItemKey: [],
    estimateSize: [],
  };
  const beginn = performance.now();
  const beimScrollen = (ereignis: Event) => {
    if (ereignis.target === container) {
      scrollZeitpunkte.push(performance.now());
      meldeScrollDiagnose({ art: 'scroll-ereignis', erreicht: container.scrollTop }, container);
    }
  };
  document.addEventListener('scroll', beimScrollen, { capture: true, passive: true });
  let aufrufe = rekorder.rohdaten().aufrufe;
  let zuletzt: number | null = null;
  let scrollsVorher = 0;
  // Textsprung: Die Lagen werden je Bild einmal gebündelt gelesen, in einer Aufgabe, die der
  // Bildrückruf einplant. Sie läuft nach dem Zeichnen des Bilds, wenn das Layout bereits berechnet
  // ist; so erzwingt die Messung kein zusätzliches Layout innerhalb des gemessenen Bilds. Verglichen
  // wird jeweils mit der Lesung nach dem vorigen Bild.
  let referenz: {
    element: Element;
    top: number;
    scrollTop: number;
    korrekturen: number;
  } | null = null;
  // Selbst geschriebene Schritte seit der letzten Lesung (Schrittmodus).
  let schritteSeitLesung: number | undefined;
  let lesungAusstehend: ReturnType<typeof setTimeout> | undefined;
  const korrektursumme = () =>
    rekorder.rohdaten().korrekturen.reduce((summe, k) => summe + k.betrag, 0);
  const leseDiagnoseLayout = erstelleLayoutDiagnose(container);
  function leseLagen() {
    lesungAusstehend = undefined;
    const rechteck = container.getBoundingClientRect();
    leseDiagnoseLayout(rechteck);
    const oben = rechteck.top;
    const korrekturen = korrektursumme();
    if (referenz?.element.isConnected && container.contains(referenz.element))
      bildverschiebungen.push({
        scrollAenderung:
          schritteSeitLesung ??
          container.scrollTop - referenz.scrollTop - (korrekturen - referenz.korrekturen),
        bildschirmVerschiebung: referenz.element.getBoundingClientRect().top - oben - referenz.top,
      });
    else if (hatteLesung) textsprungFehlendeVergleiche++;
    // Die erste Lesung ist nur die Ausgangslage und noch kein Vergleich.
    hatteLesung = true;
    schritteSeitLesung = undefined;
    const element = obersterSichtbarer(container, oben);
    referenz = element && {
      element,
      top: element.getBoundingClientRect().top - oben,
      scrollTop: container.scrollTop,
      korrekturen,
    };
  }
  return {
    aufrufeJeBild,
    erfasse(zeit: number) {
      bildgrenzen.push(performance.now());
      const bewegt = scrollZeitpunkte.length > scrollsVorher;
      scrollsVorher = scrollZeitpunkte.length;
      if (zuletzt !== null && (bewegt || !nurBeiBewegung)) {
        bildzeitenMs.push(zeit - zuletzt);
        const jetzt = rekorder.rohdaten().aufrufe;
        aufrufeJeBild.getItemKey.push(jetzt.getItemKey - aufrufe.getItemKey);
        aufrufeJeBild.estimateSize.push(jetzt.estimateSize - aufrufe.estimateSize);
      }
      aufrufe = rekorder.rohdaten().aufrufe;
      zuletzt = zeit;
      if (textsprung && lesungAusstehend === undefined) lesungAusstehend = setTimeout(leseLagen, 0);
    },
    /** Beim Schreiben eines Schritts (Schrittmodus): Die Schritte seit der letzten Lesung ersetzen
     * die gelesene Scrolländerung. Ohne Schritt (Browser oder Nutzer scrollt) zählt die gelesene
     * Änderung der Scrollposition ohne die Höhenkorrekturen des Programms. Beim reinen Scrollen
     * verschiebt sich das Element genau um die Scrolländerung (Restverschiebung 0). */
    merkeSchritt(schritt: number) {
      if (!textsprung) return;
      schritteSeitLesung = (schritteSeitLesung ?? 0) + schritt;
    },
    async beenden(
      bildperiodeMs: number,
      elementzahl: number,
    ): Promise<MesslaufBildreihen & { aufrufeJeBild: typeof aufrufeJeBild }> {
      document.removeEventListener('scroll', beimScrollen, { capture: true });
      // Die Lesung nach dem letzten Bild abwarten; Aufgaben gleicher Verzögerung laufen in
      // Reihenfolge ihrer Einplanung.
      if (lesungAusstehend !== undefined) await new Promise((weiter) => setTimeout(weiter, 0));
      const commits = quellen.commitZeitpunkte().filter((zeit) => zeit >= beginn);
      const fenster = arbeitsfensterJeBild(scrollZeitpunkte, commits, bildgrenzen);
      const messungen = rekorder.rohdaten().hoehen.map((paar) => paar.zeitpunkt);
      const renderzeiten = quellen.renderzeiten().filter(({ commitZeit }) => commitZeit >= beginn);
      return {
        bildperiodeMs,
        bildzeitenMs,
        bildverschiebungen,
        textsprungFehlendeVergleiche,
        arbeitszeitenMs: fenster.map(({ beginn: von, ende }) => ende - von),
        neuaufbauKostenMs: neuaufbauKostenJeElement(fenster, messungen),
        aufteilung: bildzeitAufteilung(fenster, renderzeiten),
        elementzahl,
        aufrufeJeBild,
      };
    },
  };
}

function obersterSichtbarer(container: HTMLElement, oben: number) {
  return (
    [...container.querySelectorAll('[data-index]')].find(
      (element) => element.getBoundingClientRect().bottom > oben,
    ) ?? null
  );
}
