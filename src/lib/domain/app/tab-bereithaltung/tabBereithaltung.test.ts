// Prüft die Regel der Bereithaltung an durchgerechneten Beispielen (Plan Phase 5, P5-A1 bis P5-A3).
import { describe, expect, it } from 'vitest';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { bereithaltungskosten, bereitzuhaltendeAnsichten } from './tab-bereithaltung.index';
import type { BereithaltungsAnsicht } from './tabBereithaltung';

function ansicht(tabId: string, kosten: number, gueltig = true): BereithaltungsAnsicht {
  return { tabId, gesetzesreferenz: `g-${tabId}`, art: 'tab', gueltig, kosten };
}
function gehalten(
  ansichten: BereithaltungsAnsicht[],
  budget: number,
  garantieTabId: string | null = 'b',
  aktiverTabId: string | null = 'a',
) {
  return bereitzuhaltendeAnsichten({ ansichten, aktiverTabId, garantieTabId, budget }).map(
    (a) => a.tabId,
  );
}
// Aktivierungsreihenfolge: A aktiv, B zuletzt verlassen, danach C und D.
const abcd = [ansicht('a', 500), ansicht('b', 30), ansicht('c', 20), ansicht('d', 20)];

describe('Budget und Garantie', () => {
  it('rechnet die aktive Ansicht nicht an und hält bei Budget 50 B und C, nicht D', () => {
    expect(gehalten(abcd, 50)).toEqual(['a', 'b', 'c']);
  });
  it('hält bei Budget 20 oder 0 nur den garantierten zuletzt verlassenen Tab', () => {
    expect(gehalten(abcd, 20)).toEqual(['a', 'b']);
    expect(gehalten(abcd, 0)).toEqual(['a', 'b']);
  });
  it('begrenzt die Garantie nicht durch Einzelhöchstkosten', () => {
    expect(gehalten([ansicht('a', 1), ansicht('b', 100), ansicht('c', 20)], 20)).toEqual([
      'a',
      'b',
    ]);
  });
  it('beendet die Auswahl bei der ersten nicht passenden Ansicht', () => {
    expect(
      gehalten([ansicht('a', 1), ansicht('b', 10), ansicht('c', 50), ansicht('d', 5)], 30),
    ).toEqual(['a', 'b']);
  });
});

describe('keine Vererbung der Garantie', () => {
  it('hält nichts, wenn die Garantie entfallen ist und C nicht ins Budget passt', () => {
    expect(gehalten([ansicht('a', 1), ansicht('c', 20)], 10, null)).toEqual(['a']);
  });
  it('hält C regulär, wenn es ins Budget passt, ohne Garantie', () => {
    expect(gehalten([ansicht('a', 1), ansicht('c', 10)], 10, null)).toEqual(['a', 'c']);
  });
  it('garantiert keine ungültige Ansicht des zuletzt verlassenen Tabs und gibt sie nicht weiter', () => {
    expect(gehalten([ansicht('a', 1), ansicht('b', 30, false), ansicht('c', 20)], 10)).toEqual([
      'a',
    ]);
  });
  it('garantiert keine verlassene Gesetzesansicht desselben Tabs', () => {
    const verlassen: BereithaltungsAnsicht = { ...ansicht('b', 5), art: 'verlassen' };
    expect(gehalten([ansicht('a', 1), verlassen], 0)).toEqual(['a']);
  });
});

describe('Grenzfälle', () => {
  it('hält bei aufgebrauchtem Budget auch keine Ansicht ohne Kosten mehr', () => {
    // Budget 50: B garantiert (30), C (20) verbraucht den Rest; D ohne Kosten bleibt außen vor.
    expect(gehalten([...abcd.slice(0, 3), ansicht('d', 0)], 50)).toEqual(['a', 'b', 'c']);
  });
  it('liefert bei leerer Tabliste nichts', () => {
    expect(gehalten([], 50, null, null)).toEqual([]);
  });
  it('hält bei Budget 0 ohne Garantie nur die aktive Ansicht', () => {
    expect(gehalten(abcd, 0, null)).toEqual(['a']);
  });
  it('hält nur den aktiven Tab, auch wenn er das Budget allein überschreitet', () => {
    expect(gehalten([ansicht('a', 999)], 0, null)).toEqual(['a']);
  });
  it('hält ungültige Ansichten nicht und rechnet sie nicht an', () => {
    expect(
      gehalten([ansicht('a', 1), ansicht('c', 20, false), ansicht('d', 20)], 20, null),
    ).toEqual(['a', 'd']);
  });
  it('zählt dasselbe Gesetz in zwei Tabs doppelt', () => {
    const c = { ...ansicht('c', 20), gesetzesreferenz: 'g-x' };
    const d = { ...ansicht('d', 20), gesetzesreferenz: 'g-x' };
    expect(gehalten([ansicht('a', 1), c, d], 30, null)).toEqual(['a', 'c']);
  });
  it('gewährt ohne zuletzt aktiven Tab keine Garantie', () => {
    expect(gehalten([ansicht('a', 1), ansicht('b', 30)], 20, null)).toEqual(['a']);
  });
});

describe('Verlauf-Bereithaltung aus dem Restbudget', () => {
  const verlassen = (name: string, kosten: number): BereithaltungsAnsicht => ({
    tabId: 'a',
    gesetzesreferenz: `g-${name}`,
    art: 'verlassen',
    gueltig: true,
    kosten,
  });
  const gesetzeVon = (eingabe: BereithaltungsAnsicht[], budget: number) =>
    bereitzuhaltendeAnsichten({
      ansichten: eingabe,
      aktiverTabId: 'a',
      garantieTabId: 'b',
      budget,
    }).map((a) => a.gesetzesreferenz);
  const offene = [ansicht('a', 1), ansicht('b', 30), ansicht('c', 10)];

  it('hält bei Budget 50 nach offenen Tabs zu 40 die jüngsten verlassenen A=6 und B=4, nicht C=3', () => {
    const eingabe = [...offene, verlassen('A', 6), verlassen('B', 4), verlassen('C', 3)];
    expect(gesetzeVon(eingabe, 50)).toEqual(['g-a', 'g-b', 'g-c', 'g-A', 'g-B']);
  });
  it('hält bei Budget 80 vier verlassene Ansichten zu je 10 ohne feste Zahlgrenze', () => {
    const eingabe = [...offene, ...['A', 'B', 'C', 'D'].map((n) => verlassen(n, 10))];
    expect(gesetzeVon(eingabe, 80)).toEqual(['g-a', 'g-b', 'g-c', 'g-A', 'g-B', 'g-C', 'g-D']);
  });
  it('hält bei Budget 0 nur den garantierten offenen Tab und keine verlassene Ansicht', () => {
    const eingabe = [...offene, verlassen('A', 6)];
    expect(gesetzeVon(eingabe, 0)).toEqual(['g-a', 'g-b']);
  });
  it('lässt verlassene Ansichten keine Ansichten offener Tabs verdrängen', () => {
    const eingabe = [verlassen('A', 5), ...offene];
    expect(gesetzeVon(eingabe, 40)).toEqual(['g-a', 'g-b', 'g-c']);
  });
  it('hält keine ungültige verlassene Ansicht und rechnet sie nicht an', () => {
    const eingabe = [...offene, { ...verlassen('A', 6), gueltig: false }, verlassen('B', 10)];
    expect(gesetzeVon(eingabe, 50)).toEqual(['g-a', 'g-b', 'g-c', 'g-B']);
  });
});

describe('Bereithaltungskosten', () => {
  it('entsprechen der Elementzahl des Gesetzes, ohne Gesetz null', () => {
    const gesetz = gesetzMitNormen(['p1', 'p2'], { kennung: (i) => `p${i + 1}` });
    expect(bereithaltungskosten(gesetz)).toBe(2);
    expect(bereithaltungskosten(undefined)).toBe(0);
  });
});
