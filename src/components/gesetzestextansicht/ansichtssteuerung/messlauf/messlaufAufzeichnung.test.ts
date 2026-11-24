// @vitest-environment jsdom
// messlaufAufzeichnung.test.ts
// Aufzeichnung mit requestAnimationFrame- und Uhr-Attrappe: Bilder alle 20 ms; der „Nutzer“
// scrollt in den Bildern 1 bis 10 je 30 px, das Scrollereignis kommt bei t, der Commit der Ansicht
// bei t + 2 ms (in Bild 3 mit zwei neu gemessenen Elementen bei t + 6 ms), der Bildrückruf bei
// t + 7 ms. Jeder Commit meldet 1,5 ms React-Renderzeit. Jedes Bild läuft wie im Browser als eigene
// Aufgabe; Aufgaben, die ein Bildrückruf einplant, laufen nach dem Bild und vor dem nächsten.
import {
  meldeScrollDiagnose,
  schreibeScrollPosition,
} from '@/lib/utils/scrollAufzeichnungDiagnose';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { werteMesslaufAus } from '@/lib/utils/messlaufKennzahlen';
import type { MesslaufRekorder } from '@/components/gesetzestextansicht/ansichtssteuerung/scrollen/scrollen.index';
import { fuehreAufzeichnungDurch } from './messlaufAufzeichnung';

let uhr: number;
let bildnummer: number;
let schreibvorgaenge: number[];
let commits: number[];
let renders: { commitZeit: number; dauerMs: number }[];
let lagelesungen: number;
let containerLesungen: number;
let lesungenImBild: number;
let imBild: boolean;
let hoehen: {
  elementId: string;
  art: string;
  geschaetzt: number;
  gemessen: number;
  zeitpunkt: number;
}[];

beforeEach(() => {
  uhr = 0;
  bildnummer = 0;
  schreibvorgaenge = [];
  commits = [];
  renders = [];
  lagelesungen = 0;
  containerLesungen = 0;
  lesungenImBild = 0;
  imBild = false;
  hoehen = [];
  vi.spyOn(performance, 'now').mockImplementation(() => uhr);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function aufbau(vorBild?: (container: HTMLElement, nutzerbild: number) => void) {
  const el = document.createElement('div');
  let scrollTop = 0;
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTop,
    set: (wert: number) => {
      scrollTop = wert;
      schreibvorgaenge.push(wert);
    },
  });
  el.getBoundingClientRect = () => {
    containerLesungen++;
    if (imBild) lesungenImBild++;
    return DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 400 });
  };
  for (let index = 0; index < 20; index++) {
    const block = document.createElement('div');
    block.dataset.index = String(index);
    block.dataset.xmlId = `n${index}`;
    block.getBoundingClientRect = () => {
      lagelesungen++;
      if (imBild) lesungenImBild++;
      return DOMRect.fromRect({ x: 0, y: index * 100 - scrollTop, width: 800, height: 100 });
    };
    el.append(block);
  }
  document.body.append(el);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    const zeit = ++bildnummer * 20;
    setTimeout(() => {
      uhr = zeit;
      // Bilder 1–11 messen die Bildperiode, Bild 12 beginnt die Aufzeichnung.
      const nutzerbild = bildnummer - 12;
      if (nutzerbild >= 1 && nutzerbild <= 10) {
        scrollTop += 30;
        el.dispatchEvent(new Event('scroll'));
        uhr = zeit + (nutzerbild === 3 ? 6 : 2);
        if (nutzerbild === 3)
          for (const elementId of ['a', 'b'])
            hoehen.push({
              elementId,
              art: 'norm',
              geschaetzt: 100,
              gemessen: 100,
              zeitpunkt: zeit + 1,
            });
        commits.push(uhr);
        renders.push({ commitZeit: uhr, dauerMs: 1.5 });
      }
      vorBild?.(el, nutzerbild);
      uhr = zeit + 7;
      // Bis zum Ende dieser Aufgabe (Bildrückruf samt anschließender Mikroaufgaben) gilt das Bild.
      imBild = true;
      setTimeout(() => (imBild = false), 0);
      fn(zeit);
    });
    return 1;
  });
  const rohdaten = () => ({
    hoehen,
    korrekturen: [],
    gesamthoehen: [],
    aufrufe: { getItemKey: 0, estimateSize: 0 },
  });
  const rekorder: MesslaufRekorder = {
    rohdaten,
    auswerten: (optionen, bildreihen) => werteMesslaufAus(rohdaten(), optionen, bildreihen),
    zuruecksetzen: vi.fn(),
    messungenVerwerfen: vi.fn(),
  };
  return {
    container: el,
    rekorder,
    zeilenhoehe: 32,
    elementzahl: 1000,
    gesetz: 'BGB',
    einstellungen: {},
    commitZeitpunkte: () => commits,
    renderzeiten: () => renders,
  };
}

it('Aufzeichnung endet nach der angegebenen Dauer und scrollt nicht selbst', async () => {
  const umgebung = aufbau();
  const { bericht, zusammenfassung } = await fuehreAufzeichnungDurch(umgebung, 1);
  // Bildperiode aus elf Bildern, Beginn in Bild 12, Ende 1 s (50 Bilder) später.
  expect(bildnummer).toBe(62);
  expect(schreibvorgaenge).toEqual([]);
  expect(umgebung.rekorder.messungenVerwerfen).not.toHaveBeenCalled();
  expect(bericht).toMatchObject({
    stufe: 2,
    erstelltAm: expect.any(String),
    umgebung: { bildperiodeMs: 20, gesetz: 'BGB', elementzahl: 1000 },
    szenarien: [{ name: 'Aufzeichnung', parameter: { dauerS: 1 } }],
    hinweise: expect.arrayContaining([expect.stringContaining('Modus C')]),
  });
  expect(zusammenfassung).toContain('Aufzeichnung');
});

it('Aufzeichnung wertet nur Bilder mit Bewegung aus, samt Arbeitszeit und Neuaufbau-Kosten', async () => {
  const { bericht } = await fuehreAufzeichnungDurch(aufbau(), 1);
  const [lauf] = bericht.szenarien[0]?.kennzahlen.wiederholungen ?? [];
  expect(lauf?.bildzeitMs).toMatchObject({ anzahl: 10, median: 20 });
  // Reines Scrollen: kein Textsprung.
  expect(lauf?.textsprung).toEqual({
    gueltigeVergleiche: 50,
    fehlendeVergleiche: 0,
    bilderUeber1px: 0,
    groesster: 0,
    summe: 0,
  });
  // Neun Bilder mit 2 ms, eines mit 6 ms.
  expect(lauf?.arbeitszeitMs).toMatchObject({ anzahl: 10, median: 2, maximum: 6 });
  // Grundlast 2 ms; (6 − 2) / 2 = 2 ms je neuem Element; Hochrechnung 1.000 × 2 ms.
  expect(bericht.neuaufbauKosten).toMatchObject({
    anzahl: 2,
    medianMs: 2,
    hochrechnungVollmessungMs: 2000,
  });
});

it('Aufzeichnung teilt die Arbeit je Bild in React-Renderzeit, übrige Zeit bis Commit und Zeit nach dem Commit', async () => {
  const { bericht, zusammenfassung } = await fuehreAufzeichnungDurch(aufbau(), 1);
  const [lauf] = bericht.szenarien[0]?.kennzahlen.wiederholungen ?? [];
  // Render je Bild 1,5 ms; übrig 2 − 1,5 = 0,5 ms (in Bild 3: 6 − 1,5 = 4,5 ms); Bildende bei
  // t + 7 ms, also nach dem Commit 5 ms (in Bild 3: 1 ms).
  expect(lauf?.bildzeitAufteilungMs).toMatchObject({
    reactRender: { anzahl: 10, median: 1.5, p95: 1.5 },
    uebrigeBisCommit: { median: 0.5, maximum: 4.5 },
    nachCommit: { median: 5, p95: 5 },
  });
  expect(
    bericht.szenarien[0]?.kennzahlen.zusammenfassung['bildzeitAufteilungMs.reactRender.median'],
  ).toEqual({
    median: 1.5,
    streuung: 0,
  });
  expect(zusammenfassung).toMatch(/React-Render p50 1\.50 .*p95 1\.50/);
  expect(zusammenfassung).toMatch(/nach Commit p50 5\.00/);
});

it('Aufzeichnung ohne Textsprung-Messung liest keine Lage der Elemente und vermerkt das im Bericht', async () => {
  const { bericht, zusammenfassung } = await fuehreAufzeichnungDurch(aufbau(), 1, {
    textsprung: false,
  });
  expect(lagelesungen).toBe(0);
  expect(bericht.szenarien[0]?.parameter).toMatchObject({ textsprungMessung: false });
  expect(zusammenfassung).toContain('Textsprung nicht gemessen');
  expect(bericht.szenarien[0]?.kennzahlen.wiederholungen[0]?.textsprung).toEqual({
    gueltigeVergleiche: 0,
    fehlendeVergleiche: 0,
    bilderUeber1px: null,
    groesster: null,
    summe: null,
  });
  const mit = await fuehreAufzeichnungDurch(aufbau(), 1);
  expect(lagelesungen).toBeGreaterThan(0);
  expect(mit.bericht.szenarien[0]?.parameter).toMatchObject({ textsprungMessung: true });
});

it('Aufzeichnung liest die Lagen je Bild höchstens einmal gebündelt nach dem Bild', async () => {
  const { bericht } = await fuehreAufzeichnungDurch(aufbau(), 1);
  // 50 Bilder der Aufzeichnung (Bild 12 bis 62); je Bild eine gebündelte Lesung nach dem Bild.
  expect(lesungenImBild).toBe(0);
  expect(containerLesungen).toBeGreaterThan(0);
  expect(containerLesungen).toBeLessThanOrEqual(51);
  const [lauf] = bericht.szenarien[0]?.kennzahlen.wiederholungen ?? [];
  expect(lauf?.textsprung).toEqual({
    gueltigeVergleiche: 50,
    fehlendeVergleiche: 0,
    bilderUeber1px: 0,
    groesster: 0,
    summe: 0,
  });
  expect(bericht.hinweise).toEqual(
    expect.arrayContaining([expect.stringContaining('nach dem Bild')]),
  );
});

it('berichtet entfernte Referenzelemente als fehlende Vergleiche neben gültigen Messungen ohne Sprung', async () => {
  const umgebung = aufbau((container, nutzerbild) => {
    if (nutzerbild === 2) container.querySelector('[data-index="0"]')?.remove();
  });
  const { bericht, zusammenfassung } = await fuehreAufzeichnungDurch(umgebung, 1);
  const [lauf] = bericht.szenarien[0]?.kennzahlen.wiederholungen ?? [];
  expect(lauf?.textsprung).toEqual({
    gueltigeVergleiche: 49,
    fehlendeVergleiche: 1,
    bilderUeber1px: 0,
    groesster: 0,
    summe: 0,
  });
  expect(zusammenfassung).toContain('Vergleiche gültig 49');
  expect(zusammenfassung).toContain('fehlend 1');
});

it('meldet Textsprung ohne überlebendes Referenzelement als nicht messbar statt als null Sprünge', async () => {
  const umgebung = aufbau((container, nutzerbild) => {
    if (nutzerbild < 1) return;
    // Dieselben Lagen, aber zwischen allen Bildern neue DOM-Elemente: kein gültiger Vergleich.
    for (const element of [...container.children]) {
      const ersatz = element.cloneNode();
      if (!(ersatz instanceof Element)) throw new Error('Geklontes Referenzelement fehlt');
      ersatz.getBoundingClientRect = element.getBoundingClientRect;
      element.replaceWith(ersatz);
    }
  });
  const { bericht, zusammenfassung } = await fuehreAufzeichnungDurch(umgebung, 1);
  // JSON muss fehlende Messbarkeit ausdrücklich erhalten.
  const json = JSON.parse(JSON.stringify(bericht));
  expect(json.szenarien[0].kennzahlen.wiederholungen[0].textsprung).toEqual({
    gueltigeVergleiche: 0,
    fehlendeVergleiche: 50,
    bilderUeber1px: null,
    groesster: null,
    summe: null,
  });
  expect(json.szenarien[0].kennzahlen.zusammenfassung['textsprung.groesster']).toBeNull();
  expect(zusammenfassung).toContain('Textsprung nicht messbar');
  expect(zusammenfassung).toContain('Vergleiche gültig 0');
  expect(zusammenfassung).toContain('fehlend 50');
  expect(zusammenfassung).not.toContain('Textsprung Bilder über 1 px 0');
});

it('ordnet Löschen, Layoutänderung, feste XML-ID und begrenzte Schreibpositionen zeitlich im JSON zu', async () => {
  let versatz = 0;
  const umgebung = aufbau((container, nutzerbild) => {
    if (nutzerbild !== 3) return;
    meldeScrollDiagnose({ art: 'lesezeichen-geloescht' });
    meldeScrollDiagnose({ art: 'seitenleisten-geaendert', zustand: 'ausgeblendet' });
    versatz = 80;
    schreibeScrollPosition(container, 200, 'resize-anker');
  });
  const referenz = umgebung.container.querySelector<HTMLElement>('[data-xml-id="n0"]');
  assert(referenz);
  referenz.getBoundingClientRect = () =>
    DOMRect.fromRect({
      y: versatz - umgebung.container.scrollTop,
      width: 800 + versatz,
      height: 100,
    });
  const { bericht } = await fuehreAufzeichnungDurch(umgebung, 1);
  const json = JSON.parse(JSON.stringify(bericht));
  const ereignisse = json.diagnose.ereignisse;
  const geloescht = ereignisse.findIndex((e: { art: string }) => e.art === 'lesezeichen-geloescht');
  expect(geloescht).toBeGreaterThan(0);
  expect(ereignisse.slice(geloescht, geloescht + 3)).toEqual([
    expect.objectContaining({ art: 'lesezeichen-geloescht' }),
    expect.objectContaining({ art: 'seitenleisten-geaendert' }),
    expect.objectContaining({
      art: 'scroll-schreiben',
      vorher: 90,
      angefordert: 200,
      erreicht: 200,
      anlass: 'resize-anker',
    }),
  ]);
  expect(ereignisse).toContainEqual(
    expect.objectContaining({ art: 'layout', xmlId: 'n0', bildschirmTop: 0, textBreite: 800 }),
  );
  expect(ereignisse).toContainEqual(
    expect.objectContaining({ art: 'layout', xmlId: 'n0', bildschirmTop: -120, textBreite: 880 }),
  );
  expect(
    ereignisse.every(
      (e: { zeitMs: number }, i: number) => i === 0 || e.zeitMs >= ereignisse[i - 1].zeitMs,
    ),
  ).toBe(true);
});
