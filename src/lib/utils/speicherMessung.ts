// Speicheraufschlüsselung des Messmodus: Schätzungen aus den eigenen Datenstrukturen,
// DOM-Zählung und – soweit die WebView sie liefert – die Heapangabe. Dazu die Gegenprobe
// des Tab-Bereithaltungsbudgets. Nur im Entwicklungsbetrieb; Abruf in der Konsole über
// speicherbericht() und bereithaltungsbudget(n).
//
// Ablauf: Die Module bieten lesende Auskünfte über ihren Bestand an; wer sie besitzt, meldet
// sie hier einmal an (meldeSpeicherauskunft). Erst der Abruf in der Konsole fragt sie ab.

import { richteScrollMesslaufEin } from './scrollMesslaufAnmeldung';

/** Strukturelle Sicht auf ein geladenes Gesetz; technische Helfer kennen das Domänenmodell nicht. */
interface GesetzAngabe {
  kurztitel: string;
  normgeber: string;
  elemente: readonly unknown[];
}

/** Setzt die Wurzel der Gesetzestextansicht (Gesetzestextansicht.tsx) im Entwicklungsbetrieb. */
export const SPEICHERMESSUNG_ANSICHT_ATTRIBUT = 'data-speichermessung-ansicht';

/** Strukturgleich mit der Bestandsauskunft des Fensterbestands. */
type Bestandszustand = 'in Tabs' | 'vorgeladen' | 'behalten';
interface BestandsAngabe {
  fenstertyp: string;
  gesetze: ReadonlyArray<{ gesetz: GesetzAngabe; zustand: Bestandszustand }>;
}
/** Strukturgleich mit dem Messstand der Textmessung einer Gesetzestextansicht. */
interface MessstandAngabe {
  grenze: number;
  spalten: { eintraege: number; zeichen: number };
  zeilen: { eintraege: number; zeichen: number };
}
interface BereithaltungsAngabe {
  /** Wirksames Tab-Bereithaltungsbudget. */
  budget: number;
  /** Budget ohne testweise Übersteuerung. */
  vorgabe: number;
  ansichten: ReadonlyArray<{ gesetz: GesetzAngabe; kosten: number }>;
}

/** Lesende Auskunft eines Moduls über seinen Bestand. */
export type Speicherauskunft =
  | { art: 'fensterbestand'; liefere: () => BestandsAngabe }
  | { art: 'bereithaltung'; liefere: () => BereithaltungsAngabe }
  /** Weiterer Posten (z. B. Suchverzeichnis); gleiche Namen werden zusammengefasst. */
  | { art: 'posten'; name: string; liefere: () => unknown }
  /**
   * Gesetzestextansicht, angemeldet beim Rendern: Verdeckte Ansichten führen keine Effekte
   * aus. Zuordnung zum DOM beim Abruf über SPEICHERMESSUNG_ANSICHT_ATTRIBUT; Ansichten, die
   * nicht mehr im Dokument stehen, vergisst der Abruf.
   */
  | { art: 'ansicht'; id: string; gesetz: GesetzAngabe; messstand: () => MessstandAngabe };

interface Groesse {
  bytes: number;
  zeichen: number;
}
export interface Speicherbericht {
  heap:
    | { verfuegbar: false }
    | { verfuegbar: true; belegt: number; reserviert: number; grenze: number };
  fensterbestaende: Array<
    Groesse & {
      fenstertyp: string;
      anzahl: Record<Bestandszustand | 'gesamt', number>;
      gesetze: Array<Groesse & { gesetz: string; zustand: Bestandszustand; elemente: number }>;
    }
  >;
  ansichten: Array<{
    gesetz: string;
    aktiv: boolean;
    domKnoten: number;
    /** Aus der Bereithaltungsbuchhaltung; fehlt, wenn sie die Ansicht nicht führt. */
    bereithaltungskosten: number | undefined;
    messzwischenspeicher: (MessstandAngabe & { bytes: number }) | undefined;
    /** Gesetzesdaten, die nicht schon im Fensterbestand gezählt sind (sonst 0). */
    eigeneGesetzesdaten: Groesse;
  }>;
  bereithaltung: {
    kostenBereitgehalten: number;
    budget: number | undefined;
    vorgabe: number | undefined;
  };
  posten: Array<Groesse & { name: string }>;
  dom: { gesamt: number; inAnsichten: number };
  summeBytes: number;
}

// Ausschließlich Diagnosezustand; niemals Grundlage für Darstellung oder Bedienung.
const auskuenfte = new Set<Exclude<Speicherauskunft, { art: 'ansicht' }>>();
// Schwache Verweise, damit die Messung kein entladenes Gesetz am Leben hält.
const ansichten = new Map<
  string,
  { gesetz: WeakRef<GesetzAngabe>; messstand: WeakRef<() => MessstandAngabe> }
>();
// Testweises Tab-Bereithaltungsbudget dieses Fensters; gilt bis zum Neuladen.
let testbudget: number | undefined;
const testbudgetBeobachter = new Set<() => void>();

declare global {
  /** Nur Entwicklungsbetrieb: Speicherbericht in der Konsole des Web-Inspectors. */
  var speicherbericht: (() => Speicherbericht | undefined) | undefined;
  /** Nur Entwicklungsbetrieb: testweises Tab-Bereithaltungsbudget; ohne Wert zurücksetzen. */
  var bereithaltungsbudget: ((budget?: number) => void) | undefined;
}

/** Einzige Anmeldestelle des Messmodus; liefert die Abmeldung. Im Produktionsbau ohne Wirkung. */
export function meldeSpeicherauskunft(auskunft: Speicherauskunft): () => void {
  if (!import.meta.env.DEV) return () => {};
  if (auskunft.art === 'ansicht') {
    const { id, gesetz, messstand } = auskunft;
    ansichten.set(id, { gesetz: new WeakRef(gesetz), messstand: new WeakRef(messstand) });
    return () => ansichten.delete(id);
  }
  auskuenfte.add(auskunft);
  return () => auskuenfte.delete(auskunft);
}

function auskuenfteDerArt<A extends Exclude<Speicherauskunft, { art: 'ansicht' }>['art']>(art: A) {
  return [...auskuenfte].filter((a): a is Extract<Speicherauskunft, { art: A }> => a.art === art);
}

/** Testweises Tab-Bereithaltungsbudget, falls in der Konsole gesetzt; im Produktionsbau nie. */
export function holeTestweisesBereithaltungsbudget(): number | undefined {
  return import.meta.env.DEV ? testbudget : undefined;
}

/** Meldet Änderungen des testweisen Budgets (für useSyncExternalStore). */
export function beobachteTestweisesBereithaltungsbudget(beobachter: () => void): () => void {
  if (!import.meta.env.DEV) return () => {};
  testbudgetBeobachter.add(beobachter);
  return () => testbudgetBeobachter.delete(beobachter);
}

function setzeTestweisesBereithaltungsbudget(...argumente: unknown[]) {
  const [wert] = argumente;
  const info = (text: string) => console.info(`[speicher] ${text}`);
  const vorgabe = auskuenfteDerArt('bereithaltung')[0]?.liefere().vorgabe ?? 'unbekannt';
  if (argumente.length && (typeof wert !== 'number' || !Number.isFinite(wert) || wert < 0)) {
    console.warn(
      '[speicher] bereithaltungsbudget(n) erwartet eine Zahl ab 0; ohne Wert gilt wieder die Vorgabe',
    );
    return;
  }
  testbudget = typeof wert === 'number' ? wert : undefined;
  for (const beobachter of testbudgetBeobachter) beobachter();
  info(
    testbudget === undefined
      ? `Tab-Bereithaltungsbudget zurückgesetzt auf die Vorgabe ${vorgabe}`
      : `Tab-Bereithaltungsbudget testweise ${testbudget} (Vorgabe ${vorgabe}); gilt in diesem Fenster bis bereithaltungsbudget() oder Neuladen`,
  );
}

// Richtwerte für JavaScriptCore (64 Bit): Objektkopf mit Feldern, Listenkopf mit Plätzen,
// Zeichenketten mit Kopf und 1 Byte je Latin-1-Zeichen bzw. sonst 2 Byte. Grobe Schätzung
// ohne Strukturtabellen, Speicherverschnitt und gemeinsam genutzte Zeichenkettenkonstanten.
const OBJEKTKOPF = 24;
const FELD = 8;
const ZEICHENKETTENKOPF = 24;
const MAP_EINTRAG = 3 * FELD;
/** Je Eintrag eines Messzwischenspeichers: Map-Eintrag, Zahlwert und Zeichenkettenkopf. */
const ZWISCHENSPEICHER_EINTRAG = 64;

function zeichenkettenBytes(text: string) {
  let breit = false;
  for (let i = 0; i < text.length && !breit; i++) breit = text.charCodeAt(i) > 0xff;
  return ZEICHENKETTENKOPF + text.length * (breit ? 2 : 1);
}

/** Eigene Bytes eines Objekts und die von ihm aus erreichbaren Werte. */
function zerlege(objekt: object): { bytes: number; inhalte: Iterable<unknown> } {
  if (objekt instanceof Map)
    return { bytes: OBJEKTKOPF * 2 + objekt.size * MAP_EINTRAG, inhalte: [...objekt].flat() };
  if (objekt instanceof Set)
    return { bytes: OBJEKTKOPF * 2 + objekt.size * MAP_EINTRAG, inhalte: objekt };
  // DOM gehört nicht zu den Datenstrukturen.
  if (typeof Node !== 'undefined' && objekt instanceof Node) return { bytes: 0, inhalte: [] };
  const inhalte: unknown[] = Array.isArray(objekt) ? objekt : Object.values(objekt);
  return { bytes: OBJEKTKOPF + inhalte.length * FELD, inhalte };
}

function schaetze(wert: unknown, gesehen: WeakSet<object>): Groesse {
  const summe = { bytes: 0, zeichen: 0 };
  const offen: unknown[] = [wert];
  while (offen.length) {
    const naechster = offen.pop();
    if (typeof naechster === 'string') {
      summe.zeichen += naechster.length;
      summe.bytes += zeichenkettenBytes(naechster);
    } else if (naechster && typeof naechster === 'object' && !gesehen.has(naechster)) {
      gesehen.add(naechster);
      const { bytes, inhalte } = zerlege(naechster);
      summe.bytes += bytes;
      for (const inhalt of inhalte) offen.push(inhalt);
    }
  }
  return summe;
}

function bezeichnung(gesetz: GesetzAngabe) {
  return `${gesetz.kurztitel} (${gesetz.normgeber})`;
}

function istVerdeckt(element: Element) {
  for (let e: Element | null = element; e; e = e.parentElement)
    if (e instanceof HTMLElement && e.style.display === 'none') return true;
  return false;
}

function istHeapangabe(
  wert: unknown,
): wert is { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } {
  return (
    typeof wert === 'object' &&
    wert !== null &&
    'usedJSHeapSize' in wert &&
    typeof wert.usedJSHeapSize === 'number' &&
    'totalJSHeapSize' in wert &&
    typeof wert.totalJSHeapSize === 'number' &&
    'jsHeapSizeLimit' in wert &&
    typeof wert.jsHeapSizeLimit === 'number'
  );
}

function leseHeap(): Speicherbericht['heap'] {
  // Nur Chromium-WebViews (z. B. WebView2 unter Windows) bieten performance.memory an.
  const memory: unknown = Reflect.get(performance, 'memory');
  if (!istHeapangabe(memory)) return { verfuegbar: false };
  return {
    verfuegbar: true,
    belegt: memory.usedJSHeapSize,
    reserviert: memory.totalJSHeapSize,
    grenze: memory.jsHeapSizeLimit,
  };
}

/** Ordnet die gemeldeten Ansichten ihren Wurzeln im Dokument zu, in Dokumentreihenfolge. */
function berichteAnsichten(gesehen: WeakSet<object>, bereithaltung?: BereithaltungsAngabe) {
  const kosten = new Map(
    (bereithaltung?.ansichten ?? []).map((a) => [a.gesetz, a.kosten] as const),
  );
  const ansichtsBerichte: Speicherbericht['ansichten'] = [];
  let inAnsichten = 0;
  const imDokument = new Set<string>();
  for (const wurzel of document.querySelectorAll(`[${SPEICHERMESSUNG_ANSICHT_ATTRIBUT}]`)) {
    const id = wurzel.getAttribute(SPEICHERMESSUNG_ANSICHT_ATTRIBUT) ?? '';
    imDokument.add(id);
    const gemeldet = ansichten.get(id);
    const gesetz = gemeldet?.gesetz.deref();
    if (!gesetz) continue;
    const domKnoten = 1 + wurzel.getElementsByTagName('*').length;
    inAnsichten += domKnoten;
    const stand = gemeldet?.messstand.deref()?.();
    ansichtsBerichte.push({
      gesetz: bezeichnung(gesetz),
      aktiv: !istVerdeckt(wurzel),
      domKnoten,
      bereithaltungskosten: kosten.get(gesetz),
      messzwischenspeicher: stand && {
        ...stand,
        // Zeichen der Schlüssel als Obergrenze mit 2 Byte; Werte sind Zahlen.
        bytes:
          (stand.spalten.zeichen + stand.zeilen.zeichen) * 2 +
          (stand.spalten.eintraege + stand.zeilen.eintraege) * ZWISCHENSPEICHER_EINTRAG,
      },
      eigeneGesetzesdaten: schaetze(gesetz, gesehen),
    });
  }
  for (const id of ansichten.keys()) if (!imDokument.has(id)) ansichten.delete(id);
  return { ansichtsBerichte, inAnsichten };
}

/** Stellt die Aufschlüsselung zusammen; geteilte Daten werden nur beim ersten Fund gezählt. */
export function erstelleSpeicherbericht(): Speicherbericht {
  const gesehen = new WeakSet<object>();
  const bestandsBerichte: Speicherbericht['fensterbestaende'] = auskuenfteDerArt(
    'fensterbestand',
  ).map(({ liefere }) => {
    const { fenstertyp, gesetze: bestand } = liefere();
    const gesetze = bestand.map(({ gesetz, zustand }) => ({
      gesetz: bezeichnung(gesetz),
      zustand,
      elemente: gesetz.elemente.length,
      ...schaetze(gesetz, gesehen),
    }));
    const zaehle = (zustand: Bestandszustand) =>
      gesetze.filter((g) => g.zustand === zustand).length;
    return {
      fenstertyp,
      anzahl: {
        gesamt: gesetze.length,
        'in Tabs': zaehle('in Tabs'),
        vorgeladen: zaehle('vorgeladen'),
        behalten: zaehle('behalten'),
      },
      gesetze,
      bytes: gesetze.reduce((s, g) => s + g.bytes, 0),
      zeichen: gesetze.reduce((s, g) => s + g.zeichen, 0),
    };
  });

  const bereithaltung = auskuenfteDerArt('bereithaltung')[0]?.liefere();
  const { ansichtsBerichte, inAnsichten } = berichteAnsichten(gesehen, bereithaltung);

  const postenNachName = new Map<string, Groesse>();
  for (const { name, liefere } of auskuenfteDerArt('posten')) {
    const bisher = postenNachName.get(name) ?? { bytes: 0, zeichen: 0 };
    const neu = schaetze(liefere(), gesehen);
    postenNachName.set(name, {
      bytes: bisher.bytes + neu.bytes,
      zeichen: bisher.zeichen + neu.zeichen,
    });
  }
  const postenBerichte = [...postenNachName].map(([name, groesse]) => ({ name, ...groesse }));

  const summeBytes =
    bestandsBerichte.reduce((s, b) => s + b.bytes, 0) +
    ansichtsBerichte.reduce(
      (s, a) => s + (a.messzwischenspeicher?.bytes ?? 0) + a.eigeneGesetzesdaten.bytes,
      0,
    ) +
    postenBerichte.reduce((s, p) => s + p.bytes, 0);

  return {
    heap: leseHeap(),
    fensterbestaende: bestandsBerichte,
    ansichten: ansichtsBerichte,
    bereithaltung: {
      kostenBereitgehalten: ansichtsBerichte
        .filter((a) => !a.aktiv)
        .reduce((s, a) => s + (a.bereithaltungskosten ?? 0), 0),
      budget: bereithaltung?.budget,
      vorgabe: bereithaltung?.vorgabe,
    },
    posten: postenBerichte,
    dom: { gesamt: document.getElementsByTagName('*').length, inAnsichten },
    summeBytes,
  };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function budgetText({ budget, vorgabe }: Speicherbericht['bereithaltung']) {
  if (budget === undefined) return 'unbekannt (Tab-Bereithaltungsbudget)';
  return budget === vorgabe
    ? `${budget} (Tab-Bereithaltungsbudget)`
    : `${budget} (Tab-Bereithaltungsbudget, testweise; Vorgabe ${vorgabe ?? 'unbekannt'})`;
}

/** Gibt den Bericht lesbar in der Konsole aus und liefert ihn zum Aufklappen zurück. */
export function gibSpeicherberichtAus(): Speicherbericht | undefined {
  if (!import.meta.env.DEV) return undefined;
  const bericht = erstelleSpeicherbericht();
  const info = (text: string) => console.info(`[speicher] ${text}`);
  info(
    'Speicherbericht: Schätzungen aus den Datenstrukturen der App, nicht der Prozesswert der Aktivitätsanzeige',
  );
  const { heap } = bericht;
  info(
    heap.verfuegbar
      ? `JS-Heap (gemessen): ${mb(heap.belegt)} belegt, ${mb(heap.reserviert)} reserviert, Grenze ${mb(heap.grenze)}`
      : 'JS-Heap: von dieser WebView nicht bereitgestellt (WebKit); genaue Werte nur über den Web-Inspector (Timelines › JavaScript-Speicher, Heap-Snapshot)',
  );
  for (const bestand of bericht.fensterbestaende) {
    const { anzahl } = bestand;
    info(
      `Fensterbestand ${bestand.fenstertyp}: ${anzahl.gesamt} Gesetze geladen (${anzahl['in Tabs']} in Tabs, ${anzahl.vorgeladen} vorgeladen, ${anzahl.behalten} behalten); Schätzung ${mb(bestand.bytes)}, ${bestand.zeichen} Zeichen`,
    );
    if (bestand.gesetze.length)
      console.table(
        bestand.gesetze.map((g) => ({
          Gesetz: g.gesetz,
          Zustand: g.zustand,
          Elemente: g.elemente,
          Zeichen: g.zeichen,
          'Schätzung MB': Number((g.bytes / 1024 / 1024).toFixed(2)),
        })),
      );
  }
  const verdeckt = bericht.ansichten.filter((a) => !a.aktiv).length;
  info(
    `Gesetzestextansichten: ${bericht.ansichten.length} aufgebaut (${bericht.ansichten.length - verdeckt} sichtbar, ${verdeckt} bereitgehalten); DOM-Knoten (gezählt) ${bericht.dom.inAnsichten} von ${bericht.dom.gesamt} im Dokument; Bereithaltungskosten der bereitgehaltenen ${bericht.bereithaltung.kostenBereitgehalten} von ${budgetText(bericht.bereithaltung)}`,
  );
  if (bericht.ansichten.length)
    console.table(
      bericht.ansichten.map((a) => ({
        Gesetz: a.gesetz,
        sichtbar: a.aktiv,
        'DOM-Knoten': a.domKnoten,
        Bereithaltungskosten: a.bereithaltungskosten ?? 'unbekannt',
        'Spalten-Zwischenspeicher': a.messzwischenspeicher
          ? `${a.messzwischenspeicher.spalten.eintraege}/${a.messzwischenspeicher.grenze}`
          : 'unbekannt',
        'Zeilen-Zwischenspeicher': a.messzwischenspeicher
          ? `${a.messzwischenspeicher.zeilen.eintraege}/${a.messzwischenspeicher.grenze}`
          : 'unbekannt',
        'Zwischenspeicher Schätzung MB': Number(
          ((a.messzwischenspeicher?.bytes ?? 0) / 1024 / 1024).toFixed(2),
        ),
        'Gesetzesdaten außerhalb des Fensterbestands MB': Number(
          (a.eigeneGesetzesdaten.bytes / 1024 / 1024).toFixed(2),
        ),
      })),
    );
  for (const p of bericht.posten) info(`${p.name}: Schätzung ${mb(p.bytes)}, ${p.zeichen} Zeichen`);
  info(
    `Summe der Schätzungen: ${mb(bericht.summeBytes)} (ohne DOM, Layout, Programmcode, Entwicklungswerkzeuge und WebKit-Eigenbedarf)`,
  );
  return bericht;
}

/** Stellt speicherbericht(), bereithaltungsbudget(n), lexlataScrollMesslauf(optionen?) und
 * lexlataScrollAufzeichnung(sekunden?) in der Konsole des Web-Inspectors bereit. */
export function richteMesskonsoleEin(): void {
  if (!import.meta.env.DEV) return;
  globalThis.speicherbericht = gibSpeicherberichtAus;
  globalThis.bereithaltungsbudget = setzeTestweisesBereithaltungsbudget;
  richteScrollMesslaufEin();
}
