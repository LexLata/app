// Misst ausgewählte Entwicklungsabläufe, ohne den Produktionspfad zu verändern.

/** Stoppt vor der Detailberechnung und protokolliert auch abgebrochene Abläufe. */
function beginneFunktionsmessung<T>(name: string) {
  const start = performance.now();
  let ende: number | undefined;
  let zusatz = '';
  return {
    beende(ergebnis: T, detail?: (wert: T) => string): T {
      ende = performance.now();
      if (detail) zusatz = ` (${detail(ergebnis)})`;
      return ergebnis;
    },
    melde() {
      console.info(
        `[perf] ${name}: ${((ende ?? performance.now()) - start).toFixed(1)} ms${zusatz}`,
      );
    },
  };
}

/** Misst fn() synchron; im Produktionsbau ein reiner Durchreicher. */
export function messeSync<T>(name: string, fn: () => T, detail?: (ergebnis: T) => string): T {
  if (!import.meta.env.DEV) return fn();
  const messung = beginneFunktionsmessung<T>(name);
  try {
    return messung.beende(fn(), detail);
  } finally {
    messung.melde();
  }
}

/** Wie messeSync, für Promises. */
export async function messeAsync<T>(
  name: string,
  fn: () => Promise<T>,
  detail?: (ergebnis: T) => string,
): Promise<T> {
  if (!import.meta.env.DEV) return fn();
  const messung = beginneFunktionsmessung<T>(name);
  try {
    return messung.beende(await fn(), detail);
  } finally {
    messung.melde();
  }
}

/** Abschnittszeiten ohne zusätzliche Wartepunkte oder dauerhaften Messzustand. */
export function beginneMessabschnitte(name: string): (abschnitt: string) => void {
  let start = import.meta.env.DEV ? performance.now() : 0;
  return (abschnitt) => {
    if (!import.meta.env.DEV) return;
    const ende = performance.now();
    console.info(`[perf] ${name}: ${abschnitt}: ${(ende - start).toFixed(1)} ms`);
    start = ende;
  };
}

/** Long Tasks sind Aufgaben ab 50 ms; ohne WebView-Unterstützung kein Ersatzwert. */
export async function messeMitHauptfaden<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!import.meta.env.DEV) return fn();
  if (
    typeof PerformanceObserver === 'undefined' ||
    !PerformanceObserver.supportedEntryTypes?.includes('longtask')
  ) {
    console.info(`[perf] Hauptfaden ${name}: Long-Task-API nicht verfügbar; WebView-Profil nötig`);
    return messeAsync(name, fn);
  }
  let maximum = 0;
  const erfasse = (eintraege: PerformanceEntry[]) => {
    for (const eintrag of eintraege) maximum = Math.max(maximum, eintrag.duration);
  };
  let beobachter: PerformanceObserver;
  try {
    beobachter = new PerformanceObserver((liste) => erfasse(liste.getEntries()));
    beobachter.observe({ type: 'longtask' });
  } catch {
    console.info(`[perf] Hauptfaden ${name}: Beobachtung fehlgeschlagen; WebView-Profil nötig`);
    return messeAsync(name, fn);
  }
  try {
    return await messeAsync(name, fn);
  } finally {
    try {
      erfasse(beobachter.takeRecords());
      beobachter.disconnect();
      console.info(
        `[perf] Hauptfaden ${name}: längste erfasste Aufgabe ab 50 ms: ${maximum.toFixed(1)} ms`,
      );
    } catch {
      console.info(`[perf] Hauptfaden ${name}: Auswertung fehlgeschlagen; WebView-Profil nötig`);
    }
  }
}

/** Ereignisspanne: einmaliger Abschluss; im Produktionsbau ohne Zeitabfrage. */
export function beginneMessspanne(name: string): (detail?: string | (() => string)) => void {
  if (!import.meta.env.DEV) return () => {};
  const start = performance.now();
  let beendet = false;
  return (detail) => {
    if (beendet) return;
    beendet = true;
    const dauer = performance.now() - start;
    const zusatz = typeof detail === 'function' ? detail() : detail;
    console.info(`[perf] ${name}: ${dauer.toFixed(1)} ms${zusatz ? ` (${zusatz})` : ''}`);
  };
}

// Ausschließlich Diagnosezustand; niemals Grundlage für Darstellung oder Bedienung.
let tabwechsel:
  | {
      ende: (detail?: string | (() => string)) => void;
      bild: number;
      letzterZeitpunkt: number;
      groessterAbstand: number;
    }
  | undefined;
const aufrufe = new Map<string, { anzahl: number; dauer: number }>();

/** Summiert häufige Aufrufe, ohne jede Höhenschätzung einzeln auszugeben. */
export function messeAufruf<T>(name: string, fn: () => T): T {
  if (!import.meta.env.DEV) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    const stand = aufrufe.get(name) ?? { anzahl: 0, dauer: 0 };
    stand.anzahl++;
    stand.dauer += performance.now() - start;
    aufrufe.set(name, stand);
  }
}

/** Beginnt vor der Zustandsänderung und beobachtet Bildabstände bis zur Sichtbarkeit. */
export function starteTabwechselMessung(): void {
  if (
    !import.meta.env.DEV ||
    typeof requestAnimationFrame === 'undefined' ||
    typeof cancelAnimationFrame === 'undefined'
  )
    return;
  if (tabwechsel) {
    cancelAnimationFrame(tabwechsel.bild);
    tabwechsel.ende('abgebrochen durch nächsten Tabwechsel');
  }
  aufrufe.clear();
  const messung = {
    ende: beginneMessspanne('Tabwechsel gesamt'),
    bild: 0,
    letzterZeitpunkt: performance.now(),
    groessterAbstand: 0,
  };
  tabwechsel = messung;
  const bild = (zeit: number) => {
    messung.groessterAbstand = Math.max(messung.groessterAbstand, zeit - messung.letzterZeitpunkt);
    messung.letzterZeitpunkt = zeit;
    messung.bild = requestAnimationFrame(bild);
  };
  messung.bild = requestAnimationFrame(bild);
}

/** Zwei Bildwechsel nach bereit; Abbau storniert ausschließlich die Messung. */
export function messeSichtbareDarstellung(detail: () => string): () => void {
  if (!import.meta.env.DEV || !tabwechsel) return () => {};
  const messung = tabwechsel;
  let bild = requestAnimationFrame(() => {
    bild = requestAnimationFrame(() => {
      if (tabwechsel !== messung) return;
      cancelAnimationFrame(messung.bild);
      messung.ende(
        () => `${detail()}; größter Bildabstand ${messung.groessterAbstand.toFixed(1)} ms`,
      );
      for (const [name, stand] of aufrufe) {
        console.info(`[perf] ${name}: ${stand.dauer.toFixed(1)} ms; ${stand.anzahl} Aufrufe`);
      }
      tabwechsel = undefined;
    });
  });
  return () => cancelAnimationFrame(bild);
}
