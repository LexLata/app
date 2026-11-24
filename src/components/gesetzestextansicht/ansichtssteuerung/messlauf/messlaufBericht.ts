// messlaufBericht.ts
// Berichtsformat des Messlaufs Stufe 2 (nur Entwicklungsbetrieb): Kennzahlen eines Durchlaufs,
// Zusammenfassung über Wiederholungen nach Median und Streuung, Textzusammenfassung und die
// gemessene Bildperiode. Gemeinsam für Schrittmodus, Gleitmodus und Aufzeichnung.
import {
  hochrechnungVollmessung,
  medianUndStreuung,
  verteilung,
  type MesslaufBildreihen,
} from '@/lib/utils/messlaufKennzahlen';
import type { MesslaufRekorder } from '@/components/gesetzestextansicht/ansichtssteuerung/scrollen/scrollen.index';
import { bild } from './messlaufBildreihen';

/** Zusammengefasste Kennzahlen (Pfad in den Kennzahlen einer Wiederholung). */
const ZUSAMMENGEFASST = [
  'bildzeitMs.median',
  'bildzeitMs.p95',
  'bildzeitMs.p99',
  'bildzeitMs.maximum',
  'bildzeitMs.anteilUeber1_5',
  'bildzeitMs.anteilUeber3',
  'arbeitszeitMs.median',
  'arbeitszeitMs.p95',
  'arbeitszeitMs.maximum',
  'bildzeitAufteilungMs.reactRender.median',
  'bildzeitAufteilungMs.reactRender.p95',
  'bildzeitAufteilungMs.uebrigeBisCommit.median',
  'bildzeitAufteilungMs.uebrigeBisCommit.p95',
  'bildzeitAufteilungMs.nachCommit.median',
  'bildzeitAufteilungMs.nachCommit.p95',
  'textsprung.gueltigeVergleiche',
  'textsprung.fehlendeVergleiche',
  'textsprung.bilderUeber1px',
  'textsprung.groesster',
  'textsprung.summe',
  'korrekturen.anzahl',
  'korrekturen.summe',
  'korrekturen.groesste',
  'schaetzfehler.gesamt.mittel',
  'schaetzfehlerUrsachen.anteile.exakt',
  'schaetzfehlerUrsachen.anteile.zeilenumbruch',
  'schaetzfehlerUrsachen.anteile.sonstige',
  'aufrufeJeBild.getItemKey.mittel',
  'aufrufeJeBild.estimateSize.mittel',
  'neuaufbauKostenMs.median',
] as const;

export const BILDZEIT_AUFTEILUNG_HINWEIS =
  'Bildzeit-Aufteilung je Arbeitsfenster: React-Render = Renderzeit der Commits (React-Profiler um die Gesetzestextansicht, ohne deren eigene Renderlogik; im Entwicklungsbetrieb doppelt gerendert); übrige bis Commit = Scrollverarbeitung, Bibliothek, eigene Renderlogik der Ansicht, Commit und Layout-Effekte; nach Commit = Layout, Zeichnen, ResizeObserver-Messungen und Warten bis zum nächsten Bild.';

export type Kennzahlen = ReturnType<typeof werteDurchlaufAus>;

export interface SzenarioErgebnis {
  readonly name: string;
  readonly parameter: Record<string, unknown>;
  readonly kennzahlen: {
    readonly wiederholungen: Kennzahlen[];
    readonly zusammenfassung: Zusammenfassung;
  };
}

export interface MesslaufBericht {
  readonly diagnose?: ReturnType<
    ReturnType<
      typeof import('@/lib/utils/scrollAufzeichnungDiagnose').beginneScrollDiagnose
    >['beenden']
  >;
  readonly stufe: 2;
  readonly erstelltAm: string;
  readonly umgebung: Record<string, unknown>;
  readonly szenarien: SzenarioErgebnis[];
  /** Über alle Durchläufe zusammengefasst; Hochrechnung, keine Messung einer Vollmessung. */
  readonly neuaufbauKosten?: ReturnType<typeof neuaufbauUeberAlle>;
  readonly hinweise: string[];
}

/** Neuaufbau-Kosten aller Durchläufe zusammen und Hochrechnung der Vollmessung. */
export function neuaufbauUeberAlle(werteMs: readonly number[], elementzahl: number) {
  const { anzahl, median, p95 } = verteilung(werteMs);
  return {
    anzahl,
    medianMs: median,
    p95Ms: p95,
    hochrechnungVollmessungMs: hochrechnungVollmessung(elementzahl, werteMs),
    hinweis: 'Hochrechnung: Elementzahl mal Median; keine gemessene Vollmessung.',
  };
}

/** Kennzahlen eines Durchlaufs aus Rekorder und Bildreihen. */
export function werteDurchlaufAus(
  { rekorder, zeilenhoehe }: { rekorder: MesslaufRekorder; zeilenhoehe: number },
  reihen: MesslaufBildreihen & { aufrufeJeBild: { getItemKey: number[]; estimateSize: number[] } },
) {
  return {
    ...rekorder.auswerten({ zeilenhoehe }, reihen),
    aufrufeJeBild: {
      getItemKey: verteilung(reihen.aufrufeJeBild.getItemKey),
      estimateSize: verteilung(reihen.aufrufeJeBild.estimateSize),
    },
  };
}

export async function messeBildperiode() {
  const abstaende: number[] = [];
  let zuletzt = await bild();
  for (let i = 0; i < 10; i++) {
    const zeit = await bild();
    abstaende.push(zeit - zuletzt);
    zuletzt = zeit;
  }
  return verteilung(abstaende).median;
}

export function fasseZusammen(reihe: readonly Kennzahlen[]): Zusammenfassung {
  const lies = (kennzahlen: Kennzahlen, pfad: string) =>
    pfad
      .split('.')
      .reduce<unknown>(
        (wert, teil) =>
          typeof wert === 'object' && wert !== null ? Reflect.get(wert, teil) : undefined,
        kennzahlen,
      );
  return Object.fromEntries(
    ZUSAMMENGEFASST.map((pfad) => {
      const werte = reihe
        .map((k) => lies(k, pfad))
        .filter((wert): wert is number => typeof wert === 'number' && Number.isFinite(wert));
      return [pfad, werte.length ? medianUndStreuung(werte) : null];
    }),
  );
}

type Zusammenfassung = Record<string, { median: number; streuung: number } | null>;

export function textzusammenfassung(bericht: MesslaufBericht) {
  const z = (wert: { median: number; streuung: number } | null | undefined, stellen = 2) =>
    wert ? `${wert.median.toFixed(stellen)} (±${wert.streuung.toFixed(stellen)})` : '–';
  const zeilen = bericht.szenarien.map(({ name, parameter, kennzahlen: { zusammenfassung: k } }) =>
    [
      `[messlauf] ${name}:`,
      `Bildzeit Median ${z(k['bildzeitMs.median'])} ms, p95 ${z(k['bildzeitMs.p95'])} ms, p99 ${z(k['bildzeitMs.p99'])} ms;`,
      `Arbeitszeit p50 ${z(k['arbeitszeitMs.median'])} ms, p95 ${z(k['arbeitszeitMs.p95'])} ms, Maximum ${z(k['arbeitszeitMs.maximum'])} ms;`,
      `davon React-Render p50 ${z(k['bildzeitAufteilungMs.reactRender.median'])} ms, p95 ${z(k['bildzeitAufteilungMs.reactRender.p95'])} ms; übrige bis Commit p50 ${z(k['bildzeitAufteilungMs.uebrigeBisCommit.median'])} ms, p95 ${z(k['bildzeitAufteilungMs.uebrigeBisCommit.p95'])} ms; nach Commit p50 ${z(k['bildzeitAufteilungMs.nachCommit.median'])} ms, p95 ${z(k['bildzeitAufteilungMs.nachCommit.p95'])} ms;`,
      parameter.textsprungMessung === false
        ? 'Textsprung nicht gemessen;'
        : [
            k['textsprung.groesster'] === null
              ? 'Textsprung nicht messbar;'
              : `Textsprung Bilder über 1 px ${z(k['textsprung.bilderUeber1px'], 0)}, größter ${z(k['textsprung.groesster'])} px;`,
            `Vergleiche gültig ${z(k['textsprung.gueltigeVergleiche'], 0)}, fehlend ${z(k['textsprung.fehlendeVergleiche'], 0)};`,
          ].join(' '),
      `Korrekturen ${z(k['korrekturen.anzahl'], 0)}, größte ${z(k['korrekturen.groesste'])} px;`,
      `Schätzung exakt ${z(k['schaetzfehlerUrsachen.anteile.exakt'])}, Zeilenumbruch ${z(k['schaetzfehlerUrsachen.anteile.zeilenumbruch'])}, sonstige ${z(k['schaetzfehlerUrsachen.anteile.sonstige'])};`,
      `Aufrufe je Bild getItemKey ${z(k['aufrufeJeBild.getItemKey.mittel'], 0)}, estimateSize ${z(k['aufrufeJeBild.estimateSize.mittel'], 0)}`,
    ].join(' '),
  );
  const n = bericht.neuaufbauKosten;
  return [
    `[messlauf] Bildperiode ${String(bericht.umgebung.bildperiodeMs)} ms, ${String(bericht.umgebung.elementzahl)} Elemente; Median (±Streuung) über die Wiederholungen`,
    ...zeilen,
    ...(n
      ? [
          `[messlauf] Neuaufbau-Kosten je Element Median ${n.medianMs.toFixed(3)} ms, p95 ${n.p95Ms.toFixed(3)} ms (${n.anzahl} Elemente); Hochrechnung Vollmessung ${n.hochrechnungVollmessungMs.toFixed(0)} ms`,
        ]
      : []),
  ].join('\n');
}
