// scrollMessungHilfen.ts
// Messhilfen für den Scroll-Messlauf Stufe 1 (Vitest, ohne Layout-Engine).
//
// Begriffe (Plan „Scrollen in langen Gesetzen“, Grundlagen):
// - Textsprung: Der gelesene Text verschiebt sich sichtbar, ohne dass weitergescrollt wird.
// - Stocken: Die Scrollbewegung läuft ungleichmäßig, weil Bilder zu spät fertig werden.
// - Höhenschätzung: angenommene Höhe eines noch nicht gemessenen Elements; Gegenstück: gemessene Höhe.
// - Höhenkorrektur: Nachziehen der Scrollposition, wenn ein Element oberhalb des Sichtbereichs
//   seine Höhe ändert.
// - Neuberechnung der Positionstabelle: Die Bibliothek bestimmt nach einer Höhenänderung die
//   Positionen aller folgenden Elemente neu (U1b).
// - Messlauf Stufe 1: in Vitest ohne Layout; Stufe 2: im Entwicklungsbetrieb der App.
//
// Grenzen von Stufe 1: kein Layout (linkedom/jsdom), kein echtes Canvas (Attrappe mit
// deterministischer Breite), V8 statt JavaScriptCore. Belastbar sind Aufrufzähler, Skalierung
// mit der Gesamtzahl und Vorher/Nachher-Verhältnisse, nicht absolute Zeiten.
//
// Gezählt wird nur an Außengrenzen: an der externen Bibliothek (durchreichende Hülle), am Canvas
// (zählende Attrappe) und über den React-Profiler.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, totalmem } from 'node:os';
import type * as ReactVirtual from '@tanstack/react-virtual';
import { verteilung } from '@/lib/utils/messlaufKennzahlen';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';

export const VOLLE_MESSUNG = process.env.LEXLATA_MESSUNG === 'voll';
const BGB_PFAD = 'arbeitsdaten/gesetzesxml/de-bund/BGB.xml';

/** Echte Uhr, beim Laden festgehalten: Vitests vorgetäuschte Uhr ersetzt auch performance.now. */
const echtePerformance = performance;
const echteJetzt = performance.now.bind(echtePerformance);
export function echteZeit() {
  return echteJetzt();
}

export interface Messgesetz {
  name: '5 %' | '25 %' | '100 %';
  elemente: GesetzDarstellung['elemente'];
}

/** BGB in drei Größen (erste 5/25/100 % der Elemente); ohne Datei synthetische Gesetze. */
export function ladeMessgesetze(): { quelle: 'BGB' | 'synthetisch'; gesetze: Messgesetz[] } {
  const anteile = [
    ['5 %', 0.05],
    ['25 %', 0.25],
    ['100 %', 1],
  ] as const;
  const bgb =
    VOLLE_MESSUNG && existsSync(BGB_PFAD) ? parseGesetzesXML(readFileSync(BGB_PFAD, 'utf8')) : null;
  const alle = bgb?.elemente ?? synthetischeElemente(VOLLE_MESSUNG ? 2000 : 60);
  return {
    quelle: bgb ? 'BGB' : 'synthetisch',
    gesetze: anteile.map(([name, anteil]) => ({
      name,
      elemente: alle.slice(0, Math.max(1, Math.round(alle.length * anteil))),
    })),
  };
}

function synthetischeElemente(anzahl: number) {
  return gesetzMitNormen(
    Array.from({ length: anzahl }, (_, i) => `§ ${i + 1}`),
    {
      norm: (i) => ({
        titel: `Messnorm ${i + 1}`,
        absaetze: Array.from({ length: 1 + (i % 3) }, (_, a) => ({
          id: `a${i}-${a}`,
          saetze: [
            {
              id: `s${i}-${a}`,
              text: `Satz ${i} ${a} ${'Rechtstext mit Inhalt '.repeat(5 + ((i * 7 + a) % 20))}`,
              eintraege: [],
            },
          ],
        })),
      }),
    },
  ).elemente;
}

/** Zählende Canvas-Attrappe: `measureText` liefert 0,5·Schriftgröße je Zeichen und zählt jeden Aufruf. */
export function installiereZaehlendesCanvas(prototyp: { getContext: unknown }) {
  const zaehler = { messaufrufe: 0 };
  const kontext = {
    font: '16px sans',
    measureText(text: string) {
      zaehler.messaufrufe++;
      return { width: text.length * 0.5 * (Number.parseFloat(kontext.font) || 16) };
    },
  };
  Object.defineProperty(prototyp, 'getContext', {
    configurable: true,
    writable: true,
    value: () => kontext,
  });
  return zaehler;
}

/** Aufrufzähler der Bibliothekshülle; Zeiten in ms (Summe der Aufrufdauern). */
export interface VirtualizerZaehler {
  getItemKey: number;
  estimateSize: number;
  zeitGetItemKeyMs: number;
  zeitEstimateSizeMs: number;
  /** Höhenmessungen (`measureElement`) insgesamt und mit geänderter Höhe. */
  hoehenmessungen: number;
  hoehenmessungenMitAenderung: number;
  /** Erkannte Neuberechnungsläufe: fortlaufende `getItemKey`-Aufrufe bis zum letzten Index. */
  neuberechnungen: number;
  getItemKeyInNeuberechnungen: number;
  estimateSizeInNeuberechnungen: number;
}

function leereZaehler(): VirtualizerZaehler {
  return {
    getItemKey: 0,
    estimateSize: 0,
    zeitGetItemKeyMs: 0,
    zeitEstimateSizeMs: 0,
    hoehenmessungen: 0,
    hoehenmessungenMitAenderung: 0,
    neuberechnungen: 0,
    getItemKeyInNeuberechnungen: 0,
    estimateSizeInNeuberechnungen: 0,
  };
}

export const virtualizerZaehler: VirtualizerZaehler = leereZaehler();
export function setzeVirtualizerZaehlerZurueck() {
  Object.assign(virtualizerZaehler, leereZaehler());
}

type Bibliothek = typeof ReactVirtual;
type Schluessel = ReturnType<
  NonNullable<ReactVirtual.VirtualizerOptions<Element, Element>['getItemKey']>
>;

function einmal<K extends object, V>(huellen: WeakMap<K, V>, original: K, bauen: () => V): V {
  const vorhanden = huellen.get(original);
  if (vorhanden !== undefined) return vorhanden;
  const neu = bauen();
  huellen.set(original, neu);
  return neu;
}

/**
 * Durchreichende Hülle um die echte Bibliothek für `vi.mock('@tanstack/react-virtual', …)`.
 * Die Hüllfunktionen für `getItemKey` und `estimateSize` sind je Originalfunktion
 * zwischengespeichert, damit die Identität von `getItemKey` (Memo-Abhängigkeit der
 * Positionstabelle) unverändert stabil bleibt.
 */
export function umhuellteBibliothek(echt: Bibliothek): Bibliothek {
  const z = virtualizerZaehler;
  const keyHuellen = new WeakMap<(i: number) => Schluessel, (i: number) => Schluessel>();
  const schaetzHuellen = new WeakMap<(i: number) => number, (i: number) => number>();
  let anzahl = 0;
  let lauf = { letzterIndex: -2, keys: 0, schaetzungen: 0 };
  const umhuelleKey = (original: (i: number) => Schluessel) =>
    einmal(keyHuellen, original, () => (i: number) => {
      const start = echteZeit();
      const key = original(i);
      z.zeitGetItemKeyMs += echteZeit() - start;
      z.getItemKey++;
      lauf =
        i === lauf.letzterIndex + 1
          ? { ...lauf, letzterIndex: i, keys: lauf.keys + 1 }
          : { letzterIndex: i, keys: 1, schaetzungen: 0 };
      if (i === anzahl - 1 && lauf.keys > 1) {
        z.neuberechnungen++;
        z.getItemKeyInNeuberechnungen += lauf.keys;
        // Die Schätzung des letzten Elements folgt erst nach diesem Aufruf; sie zählt die Schätzhülle.
        z.estimateSizeInNeuberechnungen += lauf.schaetzungen;
      }
      return key;
    });
  const umhuelleSchaetzung = (original: (i: number) => number) =>
    einmal(schaetzHuellen, original, () => (i: number) => {
      const start = echteZeit();
      const groesse = original(i);
      z.zeitEstimateSizeMs += echteZeit() - start;
      z.estimateSize++;
      if (i === lauf.letzterIndex) {
        lauf.schaetzungen++;
        if (i === anzahl - 1 && lauf.keys > 1) z.estimateSizeInNeuberechnungen++;
      }
      return groesse;
    });
  function useUmhuellterVirtualizer<S extends Element, I extends Element>(
    optionen: Parameters<typeof echt.useVirtualizer<S, I>>[0],
  ) {
    anzahl = optionen.count;
    const messen = optionen.measureElement ?? echt.measureElement;
    return echt.useVirtualizer<S, I>({
      ...optionen,
      getItemKey: optionen.getItemKey && umhuelleKey(optionen.getItemKey),
      estimateSize: umhuelleSchaetzung(optionen.estimateSize),
      measureElement: (element, eintrag, instanz) => {
        const bisher = instanz.measurementsCache[instanz.indexFromElement(element)];
        const vorher = bisher ? (instanz.itemSizeCache.get(bisher.key) ?? bisher.size) : undefined;
        const hoehe = messen(element, eintrag, instanz);
        z.hoehenmessungen++;
        if (hoehe !== vorher) z.hoehenmessungenMitAenderung++;
        return hoehe;
      },
    });
  }
  return { ...echt, useVirtualizer: useUmhuellterVirtualizer };
}

/** Kennzahlen der Bibliothekshülle und des Canvas für eine Reihe von Bildern. */
export function bildKennzahlen(
  bilder: readonly { zeitMs: number; zaehler: VirtualizerZaehler; canvas: number }[],
) {
  const summe = (f: (b: (typeof bilder)[number]) => number) => bilder.reduce((a, b) => a + f(b), 0);
  const neuberechnungen = summe((b) => b.zaehler.neuberechnungen);
  const huellenZeit = (b: (typeof bilder)[number]) =>
    b.zaehler.zeitGetItemKeyMs + b.zaehler.zeitEstimateSizeMs;
  return {
    bilder: bilder.length,
    bildzeitMs: verteilung(bilder.map((b) => b.zeitMs)),
    getItemKeyJeBild: verteilung(bilder.map((b) => b.zaehler.getItemKey)),
    estimateSizeJeBild: verteilung(bilder.map((b) => b.zaehler.estimateSize)),
    canvasMessaufrufeJeBild: verteilung(bilder.map((b) => b.canvas)),
    canvasMessaufrufeSumme: summe((b) => b.canvas),
    neuberechnung: {
      hoehenmessungenJeBild: verteilung(bilder.map((b) => b.zaehler.hoehenmessungen)),
      hoehenmessungenMitAenderungJeBild: verteilung(
        bilder.map((b) => b.zaehler.hoehenmessungenMitAenderung),
      ),
      neuberechnungsLaeufeJeBild: verteilung(bilder.map((b) => b.zaehler.neuberechnungen)),
      getItemKeyJeNeuberechnung: neuberechnungen
        ? summe((b) => b.zaehler.getItemKeyInNeuberechnungen) / neuberechnungen
        : 0,
      estimateSizeJeNeuberechnung: neuberechnungen
        ? summe((b) => b.zaehler.estimateSizeInNeuberechnungen) / neuberechnungen
        : 0,
      zeitGetItemKeyMsJeBild: verteilung(bilder.map((b) => b.zaehler.zeitGetItemKeyMs)),
      zeitEstimateSizeMsJeBild: verteilung(bilder.map((b) => b.zaehler.zeitEstimateSizeMs)),
      verbleibendeBildzeitMs: verteilung(bilder.map((b) => b.zeitMs - huellenZeit(b))),
    },
  };
}

/** Repräsentativer Lauf mehrerer Wiederholungen: der Lauf mit dem mittleren Wert (Medianlauf). */
export function medianLauf<T>(laeufe: readonly T[], wert: (lauf: T) => number): T {
  const sortiert = [...laeufe].sort((a, b) => wert(a) - wert(b));
  const lauf = sortiert.at(Math.floor((sortiert.length - 1) / 2));
  if (lauf === undefined) throw new Error('Keine Wiederholung gemessen.');
  return lauf;
}

export interface Messbericht {
  stufe: 1;
  erstelltAm: string;
  umgebung: Record<string, unknown>;
  szenarien: { name: string; parameter: Record<string, unknown>; kennzahlen: unknown }[];
  hinweise: string[];
}

export function messumgebung(quelle: string) {
  return {
    system: platform(),
    architektur: arch(),
    prozessor: cpus()[0]?.model,
    kerne: cpus().length,
    arbeitsspeicherGB: Math.round(totalmem() / 1024 ** 3),
    node: process.version,
    gesetzesquelle: quelle,
  };
}

/** Schreibt JSON und lesbare Zusammenfassung nach `.reports/`. */
export async function schreibeBericht(
  datei: string,
  bericht: Messbericht,
  zusammenfassung: string,
) {
  await mkdir('.reports', { recursive: true });
  await writeFile(`.reports/${datei}.json`, `${JSON.stringify(bericht, null, 2)}\n`);
  await writeFile(`.reports/${datei}.txt`, `${zusammenfassung}\n`);
}

/** Verhältnis der Mittelwerte zwischen den Gesetzesgrößen (gewünscht: nahe 1). */
export function skalierung(mittelJeGroesse: Record<string, number>) {
  const basis = mittelJeGroesse['5 %'] || Number.NaN;
  return {
    '25 % / 5 %': (mittelJeGroesse['25 %'] ?? Number.NaN) / basis,
    '100 % / 5 %': (mittelJeGroesse['100 %'] ?? Number.NaN) / basis,
  };
}
