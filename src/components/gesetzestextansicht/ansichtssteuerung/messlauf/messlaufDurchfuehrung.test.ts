// @vitest-environment jsdom
// messlaufDurchfuehrung.test.ts
// Schritt- und Gleitmodus mit requestAnimationFrame- und Uhr-Attrappe und kontrollierter
// Geometrie: Elemente à 100 px, Sichtbereich 400 px, Referenzelement über seine Bildschirmlage.
// Je Bild wie im Browser: zuerst das Scrollereignis (Zeit t), die Ansicht committet synchron bis
// t + 2 ms, dann der Bildrückruf (t + 3 ms). Weiches Scrollen rückt 500 px je Bild vor.
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { werteMesslaufAus } from '@/lib/utils/messlaufKennzahlen';
import type { MesslaufRekorder } from '@/components/gesetzestextansicht/ansichtssteuerung/scrollen/scrollen.index';
import { fuehreMesslaufDurch, type MesslaufUmgebung } from './messlaufDurchfuehrung';

const ELEMENTHOEHE = 100;
let jetzt: number;
let luecke: () => number;
let schreibvorgaenge: number[];
let gleitaufrufe: ScrollToOptions[];
let versatz: () => number;
let uhr: number;
let commits: number[];
let scrollAusstehend: HTMLElement | null;
let gleiten: { element: HTMLElement; ziel: number; setze: (wert: number) => void } | null;

beforeEach(() => {
  jetzt = 0;
  uhr = 0;
  luecke = () => 20;
  versatz = () => 0;
  schreibvorgaenge = [];
  gleitaufrufe = [];
  commits = [];
  scrollAusstehend = null;
  gleiten = null;
  vi.spyOn(performance, 'now').mockImplementation(() => uhr);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    const zeit = (jetzt += luecke());
    setTimeout(() => {
      uhr = zeit;
      if (gleiten) {
        const { element, ziel, setze } = gleiten;
        const rest = ziel - element.scrollTop;
        setze(element.scrollTop + Math.sign(rest) * Math.min(500, Math.abs(rest)));
        scrollAusstehend = element;
        if (element.scrollTop === ziel) gleiten = null;
      }
      if (scrollAusstehend) {
        scrollAusstehend.dispatchEvent(new Event('scroll'));
        scrollAusstehend = null;
        uhr = zeit + 2;
        commits.push(uhr);
      }
      uhr = zeit + 3;
      fn(zeit);
    });
    return 1;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function container(elementzahl: number) {
  const el = document.createElement('div');
  let scrollTop = 0;
  Object.defineProperties(el, {
    scrollTop: {
      get: () => scrollTop,
      set: (wert: number) => {
        scrollTop = wert;
        schreibvorgaenge.push(wert);
        scrollAusstehend = el;
      },
    },
    scrollHeight: { get: () => elementzahl * ELEMENTHOEHE },
    clientHeight: { get: () => 400 },
  });
  el.scrollTo = (optionen?: ScrollToOptions | number) => {
    if (typeof optionen !== 'object') return;
    gleitaufrufe.push(optionen);
    gleiten = { element: el, ziel: optionen.top ?? 0, setze: (wert) => (scrollTop = wert) };
  };
  el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 400 });
  // Nur die Elemente um den Sichtbereich, wie bei der Virtualisierung.
  for (let index = 0; index < Math.min(elementzahl, 40); index++) {
    const block = document.createElement('div');
    block.dataset.index = String(index);
    block.getBoundingClientRect = () =>
      DOMRect.fromRect({
        x: 0,
        y: index * ELEMENTHOEHE - (scrollTop % 2000) + versatz(),
        width: 800,
        height: ELEMENTHOEHE,
      });
    el.append(block);
  }
  document.body.append(el);
  return el;
}

function rekorder(roh: Partial<ReturnType<MesslaufRekorder['rohdaten']>> = {}): MesslaufRekorder {
  const rohdaten = () => ({
    hoehen: [],
    korrekturen: [],
    gesamthoehen: [],
    aufrufe: { getItemKey: 0, estimateSize: 0 },
    ...roh,
  });
  return {
    rohdaten,
    auswerten: (optionen, bildreihen) => werteMesslaufAus(rohdaten(), optionen, bildreihen),
    zuruecksetzen: vi.fn(),
    messungenVerwerfen: vi.fn(),
  };
}

function umgebung(elementzahl: number, rek = rekorder()): MesslaufUmgebung {
  return {
    container: container(elementzahl),
    rekorder: rek,
    zeilenhoehe: 32,
    elementzahl,
    gesetz: 'BGB',
    einstellungen: { schriftgroesse: 16 },
    commitZeitpunkte: () => commits,
    renderzeiten: () => [],
    sperren: async () => async () => {},
  };
}

/** Schreibvorgänge des eigentlichen Laufs: ab dem Ansetzen an die Startposition. */
function schritte(start: number) {
  const ab = schreibvorgaenge.indexOf(start);
  const lauf = schreibvorgaenge.slice(ab);
  return lauf.slice(1).map((wert, i) => wert - (lauf[i] ?? Number.NaN));
}

it('Schrittmodus verschiebt scrollTop je Bild um Geschwindigkeit mal gemessene Bildperiode', async () => {
  await fuehreMesslaufDurch(umgebung(200), {
    szenarien: ['S2'],
    wiederholungen: 1,
    dauerSekunden: 0.2,
  });
  // 2.000 px/s bei 20 ms Bildperiode: 40 px je Bild, zehn Bilder in 200 ms.
  expect(schritte(0)).toEqual(Array.from({ length: 10 }, () => 40));
});

it('Richtungswechsel kehren die Scrollrichtung alle 5 Sekunden um', async () => {
  await fuehreMesslaufDurch(umgebung(100_000), {
    szenarien: ['Richtungswechsel'],
    wiederholungen: 1,
    dauerSekunden: 12,
  });
  const lauf = schritte((100_000 * ELEMENTHOEHE - 400) / 2);
  expect(lauf).toHaveLength(600);
  expect(lauf.slice(0, 250).every((s: number) => s === 40)).toBe(true);
  expect(lauf.slice(250, 500).every((s) => s === -40)).toBe(true);
  expect(lauf.slice(500).every((s) => s === 40)).toBe(true);
});

it('Ergebnis im Berichtsformat mit Kennzahlen einer durchgerechneten Beispielreihe', async () => {
  // Bildabstände im Lauf 20, 50, 20, 20 ms; ab scrollTop 120 liegt der Text 6 px tiefer, ohne
  // dass gescrollt wurde: genau ein Textsprung von 6 px.
  luecke = () => (schreibvorgaenge.at(-1) === 80 ? 50 : 20);
  const el = umgebung(200, rekorder({ korrekturen: [{ betrag: 3, zeitpunkt: 1 }] }));
  versatz = () => (el.container.scrollTop >= 120 ? 6 : 0);
  const { bericht, zusammenfassung } = await fuehreMesslaufDurch(el, {
    szenarien: ['S2'],
    wiederholungen: 1,
    dauerSekunden: 0.1,
  });
  expect(bericht).toMatchObject({
    stufe: 2,
    erstelltAm: expect.any(String),
    umgebung: { bildperiodeMs: 20, elementzahl: 200 },
    hinweise: expect.arrayContaining([expect.stringContaining('Referenzelement')]),
  });
  expect(bericht.szenarien).toHaveLength(1);
  const [szenario] = bericht.szenarien;
  assert(szenario);
  expect(szenario).toMatchObject({
    name: 'S2 Überfliegen',
    parameter: { geschwindigkeitPxS: 2000, richtung: 'runter', start: 'anfang', wiederholungen: 1 },
  });
  const [lauf] = szenario.kennzahlen.wiederholungen;
  expect(lauf).toMatchObject({
    bildzeitMs: { anzahl: 4, median: 20, maximum: 50, anteilUeber1_5: 0.25, anteilUeber3: 0 },
    textsprung: { bilderUeber1px: 1, groesster: 6, summe: 6 },
    korrekturen: { anzahl: 1, summe: 3, groesste: 3 },
  });
  expect(szenario.kennzahlen.zusammenfassung['bildzeitMs.median']).toEqual({
    median: 20,
    streuung: 0,
  });
  expect(zusammenfassung).toContain('S2 Überfliegen');
});

it('Messlauf ohne Textsprung-Messung erfasst den Textsprung nicht und vermerkt das je Szenario', async () => {
  // Wie oben: ab scrollTop 120 liegt der Text 6 px tiefer; ohne Messung bleibt das unerfasst.
  const el = umgebung(200);
  versatz = () => (el.container.scrollTop >= 120 ? 6 : 0);
  const { bericht, zusammenfassung } = await fuehreMesslaufDurch(el, {
    szenarien: ['S2'],
    wiederholungen: 1,
    dauerSekunden: 0.1,
    textsprung: false,
  });
  const [szenario] = bericht.szenarien;
  expect(szenario?.parameter).toMatchObject({ textsprungMessung: false });
  expect(szenario?.kennzahlen.wiederholungen[0]?.textsprung).toEqual({
    gueltigeVergleiche: 0,
    fehlendeVergleiche: 0,
    bilderUeber1px: null,
    groesster: null,
    summe: null,
  });
  expect(schritte(0)).toEqual([40, 40, 40, 40, 40]);
  expect(zusammenfassung).toContain('Textsprung nicht gemessen');
});

it('S4 stellt den ungemessenen Zustand am Ende her und setzt die Rohdaten je Wiederholung zurück', async () => {
  const rek = rekorder();
  await fuehreMesslaufDurch(umgebung(200, rek), {
    szenarien: ['S4'],
    wiederholungen: 2,
    dauerSekunden: 0.1,
  });
  expect(rek.messungenVerwerfen).toHaveBeenCalledTimes(2);
  expect(rek.zuruecksetzen).toHaveBeenCalledTimes(2);
  expect(schritte(200 * ELEMENTHOEHE - 400).slice(0, 5)).toEqual([-40, -40, -40, -40, -40]);
});

it('S3 weist den zweiten Durchlauf getrennt aus und endet am Gesetzesende', async () => {
  const { bericht } = await fuehreMesslaufDurch(umgebung(50), {
    szenarien: ['S3'],
    wiederholungen: 1,
  });
  expect(bericht.szenarien.map((s) => s.name)).toEqual(['S3 Durchlauf 1', 'S3 Durchlauf 2']);
  expect(schreibvorgaenge.at(-1)).toBe(50 * ELEMENTHOEHE - 400);
});

it('unbekannte Szenarien werden abgelehnt, ohne zu scrollen', async () => {
  await expect(
    fuehreMesslaufDurch(umgebung(10), { szenarien: ['S9'], wiederholungen: 1 }),
  ).rejects.toThrow('S9');
  expect(schreibvorgaenge).toEqual([]);
});

it('Arbeitszeit je Bild reicht vom Scrollereignis bis zum Ende des folgenden Commits', async () => {
  const { bericht } = await fuehreMesslaufDurch(umgebung(200), {
    szenarien: ['S2'],
    wiederholungen: 1,
    dauerSekunden: 0.2,
  });
  const [lauf] = bericht.szenarien[0]?.kennzahlen.wiederholungen ?? [];
  // Zehn Schritte, je Bild Scrollereignis bei t und Commit bei t + 2 ms.
  expect(lauf?.arbeitszeitMs).toMatchObject({ anzahl: 10, median: 2, p95: 2, maximum: 2 });
});

it('Gleitmodus scrollt weich über die ganze Länge, ohne selbst Schritte zu schreiben', async () => {
  const sperren = vi.fn(async () => async () => {});
  const el = { ...umgebung(23), sperren };
  const { bericht } = await fuehreMesslaufDurch(el, {
    szenarien: ['S2', 'G1', 'G2'],
    wiederholungen: 1,
  });
  expect(sperren).toHaveBeenCalledTimes(1);
  expect(gleitaufrufe).toEqual([
    { top: 23 * ELEMENTHOEHE - 400, behavior: 'smooth' },
    { top: 0, behavior: 'smooth' },
  ]);
  const [, runter, hoch] = bericht.szenarien;
  expect(runter).toMatchObject({ name: 'G1 Gleiten runter', parameter: { modus: 'B Gleitmodus' } });
  expect(hoch).toMatchObject({ name: 'G2 Gleiten hoch', parameter: { ungemessenerZustand: true } });
  // 1.900 px in Schritten zu 500 px: vier Bilder bis zum Ziel, ohne Textsprung.
  const [lauf] = runter?.kennzahlen.wiederholungen ?? [];
  expect(lauf?.bildzeitMs?.anzahl).toBe(4);
  expect(lauf?.textsprung).toMatchObject({
    fehlendeVergleiche: 0,
    bilderUeber1px: 0,
    groesster: 0,
    summe: 0,
  });
  expect(lauf?.arbeitszeitMs).toMatchObject({ median: 2, maximum: 2 });
});

it('ohne Optionen laufen die Modi A und B mit Umgebungsprotokoll und Neuaufbau-Kosten', async () => {
  const { bericht } = await fuehreMesslaufDurch(umgebung(50), { wiederholungen: 1 });
  expect(bericht.szenarien.map((s) => s.name)).toEqual([
    'S1 Lesen',
    'S2 Überfliegen',
    'S3 Durchlauf 1',
    'S3 Durchlauf 2',
    'S4 Hochscrollen',
    'Richtungswechsel',
    'G1 Gleiten runter',
    'G2 Gleiten hoch',
  ]);
  expect(bericht.umgebung).toMatchObject({
    bildperiodeMs: 20,
    bildwiederholrateHz: 50,
    gesetz: 'BGB',
    elementzahl: 50,
    einstellungen: { schriftgroesse: 16 },
    verankerungsprobe: { auto: 'unbekannt', none: 'unbekannt' },
  });
  expect(bericht.neuaufbauKosten).toMatchObject({ anzahl: 0, hochrechnungVollmessungMs: 0 });
});

it('fasst Textsprünge nur aus messbaren Wiederholungen zusammen und zählt fehlende Vergleiche gesondert', async () => {
  const rek = rekorder();
  const el = umgebung(200, rek);
  versatz = () => (el.container.scrollTop >= 120 ? 6 : 0);
  let wiederholung = 0;
  vi.mocked(rek.zuruecksetzen).mockImplementation(() => {
    if (++wiederholung === 2) el.container.replaceChildren();
  });
  const { bericht, zusammenfassung } = await fuehreMesslaufDurch(el, {
    szenarien: ['S2'],
    wiederholungen: 2,
    dauerSekunden: 0.1,
  });
  const szenario = bericht.szenarien[0];
  expect(szenario?.kennzahlen.wiederholungen[0]?.textsprung?.groesster).toBe(6);
  expect(szenario?.kennzahlen.wiederholungen[1]?.textsprung).toMatchObject({
    gueltigeVergleiche: 0,
    fehlendeVergleiche: 5,
    groesster: null,
  });
  // Die unmessbare Wiederholung darf den gemessenen Sprung nicht als vermeintliche 0 halbieren.
  expect(szenario?.kennzahlen.zusammenfassung['textsprung.groesster']).toEqual({
    median: 6,
    streuung: 0,
  });
  expect(zusammenfassung).toContain('größter 6.00');
});
