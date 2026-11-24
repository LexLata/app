// scrollMesslaufAnmeldung.ts
// Anmeldestelle und Konsolenbefehle für den Messlauf Stufe 2, nur im Entwicklungsbetrieb:
// lexlataScrollMesslauf(optionen?) (Schritt- und Gleitmodus unter Messlauf-Sperre) und
// lexlataScrollAufzeichnung(sekunden = 30, optionen?) (der Nutzer scrollt selbst, ohne Sperre). Sichtbare
// Gesetzestextansichten melden ihr Messziel an; jeder Befehl misst die größte sichtbare und gibt
// Zusammenfassung und JSON in der Konsole aus. Das Ergebnis liegt danach unter
// window.__lexlataMessergebnis. Bereitgestellt über
// richteMesskonsoleEin (speicherMessung.ts), keinen zweiten Einstiegsweg.
//
// Messlauf: Messung von Stocken und Textsprüngen in Zahlen; Stufe 2 im Entwicklungsbetrieb der
// App im echten WebView (Plan „Scrollen in langen Gesetzen“, Grundlagen).

export interface ScrollMesslaufOptionen {
  /** Namen der Szenarien (ohne Angabe: alle der Modi A und B). */
  readonly szenarien?: readonly string[];
  /** Wiederholungen je Szenario (ohne Angabe: 5). */
  readonly wiederholungen?: number;
  /** Dauer zeitbegrenzter Szenarien in Sekunden (ohne Angabe: Vorgabe je Szenario). */
  readonly dauerSekunden?: number;
  /** false: ohne Textsprung-Messung; deren Lesen der Elementlage erzwingt Layout und verfälscht
   * die Bildzeit (ohne Angabe: true). */
  readonly textsprung?: boolean;
}

/** Optionen der Aufzeichnung. */
interface ScrollAufzeichnungOptionen {
  /** Wie bei ScrollMesslaufOptionen. */
  readonly textsprung?: boolean;
}

/** Messziel einer Gesetzestextansicht; technische Helfer kennen die Ansicht nicht. */
export interface ScrollMessziel {
  /** Sichtbare Fläche in px²; 0 für verdeckte Ansichten. */
  sichtbareFlaeche(): number;
  fuehreDurch(optionen: ScrollMesslaufOptionen): Promise<Messergebnis>;
  /** Aufzeichnung: zeichnet `sekunden` lang auf, ohne selbst zu scrollen. */
  zeichneAuf(sekunden: number, optionen?: ScrollAufzeichnungOptionen): Promise<Messergebnis>;
}

interface Messergebnis {
  bericht: unknown;
  zusammenfassung: string;
}

declare global {
  /** Nur Entwicklungsbetrieb: Messlauf Stufe 2 (Modi A und B) der größten sichtbaren Ansicht. */
  var lexlataScrollMesslauf: ((optionen?: ScrollMesslaufOptionen) => Promise<unknown>) | undefined;
  /** Nur Entwicklungsbetrieb: Aufzeichnung (Modus C) der größten sichtbaren Ansicht. */
  var lexlataScrollAufzeichnung:
    ((sekunden?: number, optionen?: ScrollAufzeichnungOptionen) => Promise<unknown>) | undefined;
  /** Nur Entwicklungsbetrieb: Ergebnis des letzten Messlaufs. */
  var __lexlataMessergebnis: unknown;
}

// Ausschließlich Diagnosezustand; niemals Grundlage für Darstellung oder Bedienung.
const messziele = new Set<ScrollMessziel>();

/** Meldet ein Messziel an; liefert die Abmeldung. Im Produktionsbau ohne Wirkung. */
export function meldeScrollMessziel(ziel: ScrollMessziel): () => void {
  if (!import.meta.env.DEV) return () => {};
  messziele.add(ziel);
  return () => messziele.delete(ziel);
}

async function miss(durchfuehren: (ziel: ScrollMessziel) => Promise<Messergebnis>) {
  const ziel = [...messziele]
    .map((kandidat) => ({ kandidat, flaeche: kandidat.sichtbareFlaeche() }))
    .filter(({ flaeche }) => flaeche > 0)
    .sort((a, b) => b.flaeche - a.flaeche)[0]?.kandidat;
  if (!ziel) {
    console.warn('[messlauf] keine sichtbare Gesetzestextansicht angemeldet; Messlauf entfällt');
    return undefined;
  }
  try {
    const { bericht, zusammenfassung } = await durchfuehren(ziel);
    console.info(zusammenfassung);
    console.log(JSON.stringify(bericht, null, 2));
    globalThis.__lexlataMessergebnis = bericht;
    return bericht;
  } catch (fehler) {
    console.error('[messlauf] Messlauf abgebrochen:', fehler);
    return undefined;
  }
}

/** Von richteMesskonsoleEin aufgerufen; stellt lexlataScrollMesslauf() und
 * lexlataScrollAufzeichnung() bereit. */
export function richteScrollMesslaufEin(): void {
  if (!import.meta.env.DEV) return;
  globalThis.lexlataScrollMesslauf = (optionen: ScrollMesslaufOptionen = {}) =>
    miss((ziel) => ziel.fuehreDurch(optionen));
  globalThis.lexlataScrollAufzeichnung = (sekunden = 30, optionen = {}) => {
    console.info(`[messlauf] Aufzeichnung läuft ${sekunden} s; jetzt selbst scrollen.`);
    return miss((ziel) => ziel.zeichneAuf(sekunden, optionen));
  };
}
