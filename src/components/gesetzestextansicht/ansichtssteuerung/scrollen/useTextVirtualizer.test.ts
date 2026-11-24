// useTextVirtualizer.test.ts
// Gesamthöhe der Schätzung über useScrollSteuerung: Änderungen der Schätzungseingänge wirken
// genauso wie bei einer frisch aufgebauten Ansicht; unveränderte Eingänge ändern nichts.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, assert, expect, it, vi } from 'vitest';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import { useScrollSteuerung } from './useScrollSteuerung';
import type { ScrollSteuerung, ScrollSteuerungOptionen } from './ScrollSteuerung.types';

const wurzeln: Root[] = [];
afterEach(async () => {
  for (const root of wurzeln.splice(0)) await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

function umgebung() {
  const { window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.ResizeObserver = observer;
  vi.stubGlobal('ResizeObserver', observer);
}

// Zehn Normen mit je einem Satz unterschiedlicher Länge; so hängt die Schätzung von Breite und
// Schriftgröße ab.
const ELEMENTE: DarstellungsElement[] = Array.from({ length: 10 }, (_, i) => ({
  typ: 'norm',
  data: normaleNorm({
    id: `n${i}`,
    xmlId: `n${i}`,
    bezeichnung: `§ ${i}`,
    absaetze: [
      {
        id: `a${i}`,
        saetze: [{ id: `s${i}`, text: 'Wort '.repeat(40 + 30 * i), eintraege: [] }],
      },
    ],
  }),
}));

function optionenFuer(werte: {
  schriftgroesse?: number;
  maxTextBreite?: number;
  eingeklappteNormen?: ReadonlySet<string>;
}): ScrollSteuerungOptionen {
  const container = document.createElement('div');
  document.body.append(container);
  Object.defineProperties(container, {
    scrollHeight: { value: 100_000 },
    offsetHeight: { value: 100 },
    offsetWidth: { value: 1000 },
    clientWidth: { value: 1000 },
    clientHeight: { value: 100 },
  });
  container.scrollTo = () => {};
  return {
    containerRef: { current: container },
    sichtbareElemente: ELEMENTE,
    eingeklappteUeberschriften: new Set(),
    eingeklappteNormen: werte.eingeklappteNormen ?? new Set(),
    unterArtikelIds: new Set(),
    messung: erstelleTestTextMessung(),
    geometrie: {
      schriftgroesse: werte.schriftgroesse ?? 16,
      zeilenabstand: 1.6,
      randInline: 52,
      maxTextBreite: werte.maxTextBreite ?? 600,
      inhaltEinzug: 12,
      satzNeuZeile: true,
      textAlign: 'left',
      hyphens: 'auto',
      lang: 'de',
    },
    leisteHoehe: 0,
    effektiveLeisteHoehe: 0,
    onZielVorbereiten() {},
    onScrollStandGeaendert() {},
    onPositionGeaendert() {},
  };
}

async function ansicht(optionen: ScrollSteuerungOptionen) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  const stand: { optionen: ScrollSteuerungOptionen; steuerung?: ScrollSteuerung } = { optionen };
  function Probe() {
    stand.steuerung = useScrollSteuerung(stand.optionen);
    return null;
  }
  const rendern = () => act(async () => root.render(createElement(Probe)));
  await rendern();
  return {
    gesamtHoehe: () => stand.steuerung?.textListe.gesamtHoehe,
    async aendere(neu: Partial<ScrollSteuerungOptionen>) {
      stand.optionen = { ...stand.optionen, ...neu };
      await rendern();
    },
    rendern,
  };
}

async function frischeGesamthoehe(werte: Parameters<typeof optionenFuer>[0]) {
  return (await ansicht(optionenFuer(werte))).gesamtHoehe();
}

it.each([
  ['Schriftgröße', { schriftgroesse: 22 }],
  ['Breite', { maxTextBreite: 400 }],
  ['Einklappzustand', { eingeklappteNormen: new Set(['n3', 'n7']) }],
] as const)('schätzt nach Änderung von %s wie eine frisch aufgebaute Ansicht', async (_, neu) => {
  umgebung();
  const a = await ansicht(optionenFuer({}));
  const vorher = a.gesamtHoehe();
  const erwartet = await frischeGesamthoehe(neu);
  expect(erwartet).not.toBe(vorher);
  const basis = optionenFuer({});
  await a.aendere(
    'eingeklappteNormen' in neu
      ? { eingeklappteNormen: neu.eingeklappteNormen }
      : { geometrie: { ...basis.geometrie, ...neu } },
  );
  expect(a.gesamtHoehe()).toBe(erwartet);
});

it('behält bei unveränderten Eingängen dieselbe Gesamthöhe', async () => {
  umgebung();
  const a = await ansicht(optionenFuer({}));
  const vorher = a.gesamtHoehe();
  await a.rendern();
  await a.aendere({ eingeklappteNormen: new Set() });
  expect(a.gesamtHoehe()).toBe(vorher);
  expect(vorher).toBe(await frischeGesamthoehe({}));
});

it('rendert unter dem sichtbaren Bereich ganze Elemente bis etwa eine Sichthöhe weiter', async () => {
  umgebung();
  // Sechzig gleich hohe Normen; Sichthöhe des Containers 100 px, Scrollstand 0.
  const gleiche: DarstellungsElement[] = Array.from({ length: 60 }, (_, i) => ({
    typ: 'norm',
    data: normaleNorm({
      id: `g${i}`,
      xmlId: `g${i}`,
      bezeichnung: `§ ${i}`,
      absaetze: [{ id: `ga${i}`, saetze: [{ id: `gs${i}`, text: 'Wort', eintraege: [] }] }],
    }),
  }));
  const optionen = { ...optionenFuer({}), sichtbareElemente: gleiche };
  const stand: { steuerung?: ScrollSteuerung } = {};
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  function Probe() {
    stand.steuerung = useScrollSteuerung(optionen);
    return null;
  }
  await act(async () => root.render(createElement(Probe)));
  const liste = stand.steuerung?.textListe;
  assert(liste);
  const hoehe = liste.gesamtHoehe / 60;
  // Sichtbereich [0, 100) und Vorlauf [100, 200): alle Elemente, die vor 200 px beginnen.
  const erwartet = Array.from({ length: Math.ceil(200 / hoehe) }, (_, i) => i);
  // Unterscheidet sich vom früheren festen Vorlauf von acht Elementen.
  expect(erwartet.length).toBeLessThan(8);
  expect(liste.zeilen.map((zeile) => zeile.index)).toEqual(erwartet);
});
