// @vitest-environment jsdom
// scrollAufzeichnungDiagnose.test.ts
// Prüft die öffentliche Diagnose: zeitliche Zuordnung, Filterung und begrenzte Sammlung.
import { afterEach, expect, it, vi } from 'vitest';
import {
  beginneScrollDiagnose,
  meldeScrollDiagnose,
  schreibeScrollPosition,
} from './scrollAufzeichnungDiagnose';
afterEach(() => vi.restoreAllMocks());
it('zeichnet nur während einer Sitzung und nur die gewählte Ansicht sowie Hauptansichtsereignisse auf', () => {
  const container = document.createElement('div');
  const fremd = document.createElement('div');
  let zeit = 100;
  vi.spyOn(performance, 'now').mockImplementation(() => zeit);
  meldeScrollDiagnose({ art: 'lesezeichen-geloescht' });
  const diagnose = beginneScrollDiagnose(container);
  zeit = 125;
  meldeScrollDiagnose({ art: 'lesezeichen-geloescht' });
  meldeScrollDiagnose({ art: 'container-breite', breite: 900 }, fremd);
  meldeScrollDiagnose({ art: 'container-breite', breite: 700 }, container);
  const bericht = diagnose.beenden();
  meldeScrollDiagnose({ art: 'lesezeichen-geloescht' });
  expect(bericht.ereignisse).toEqual([
    { art: 'lesezeichen-geloescht', zeitMs: 25, nummer: 1 },
    { art: 'container-breite', breite: 700, zeitMs: 25, nummer: 2 },
  ]);
});
it('unterscheidet gewünschte und vom Browser begrenzte Scrollpositionen', () => {
  const container = document.createElement('div');
  let position = 10;
  Object.defineProperty(container, 'scrollTop', {
    get: () => position,
    set: (wert: number) => {
      position = Math.min(200, wert);
    },
  });
  const diagnose = beginneScrollDiagnose(container);
  schreibeScrollPosition(container, 300, 'resize-anker');
  expect(container.scrollTop).toBe(200);
  expect(diagnose.beenden().ereignisse).toEqual([
    expect.objectContaining({
      art: 'scroll-schreiben',
      anlass: 'resize-anker',
      vorher: 10,
      angefordert: 300,
      erreicht: 200,
    }),
  ]);
});
it('begrenzt die Datenmenge und nennt verworfene Ereignisse ausdrücklich', () => {
  const diagnose = beginneScrollDiagnose(document.createElement('div'));
  for (let i = 0; i < 20005; i++) meldeScrollDiagnose({ art: 'lesezeichen-geloescht' });
  const bericht = diagnose.beenden();
  expect(bericht.ereignisse).toHaveLength(20000);
  expect(bericht.verworfen).toBe(5);
});

it('verfolgt dieselbe XML-ID über weitere Auslöser hinweg und benennt fehlende Referenzen', async () => {
  const { erstelleLayoutDiagnose } = await import('./scrollAufzeichnungDiagnose');
  const container = document.createElement('div');
  const a = document.createElement('div');
  const b = document.createElement('div');
  a.dataset.xmlId = 'a';
  b.dataset.xmlId = 'b';
  let aTop = 0;
  a.getBoundingClientRect = () => DOMRect.fromRect({ y: aTop, height: 100 });
  b.getBoundingClientRect = () => DOMRect.fromRect({ y: 100 + aTop, height: 100 });
  container.append(a, b);
  const diagnose = beginneScrollDiagnose(container);
  const probe = erstelleLayoutDiagnose(container);
  const rahmen = DOMRect.fromRect({ width: 800, height: 400 });
  probe(rahmen);
  aTop = -150;
  probe(rahmen);
  meldeScrollDiagnose({ art: 'lesezeichen-geloescht' });
  probe(rahmen);
  a.remove();
  meldeScrollDiagnose({ art: 'seitenleisten-geaendert' });
  probe(rahmen);
  expect(diagnose.beenden().ereignisse.at(-1)).toMatchObject({
    art: 'layout',
    xmlId: 'b',
    referenzen: [
      { xmlId: 'a', vorhanden: false, bildschirmTop: null },
      { xmlId: 'b', vorhanden: true, bildschirmTop: -50 },
    ],
  });
});

it('schreibt außerhalb einer Aufzeichnung ohne zusätzliche Positionslesungen', () => {
  const container = document.createElement('div');
  const schreiben = vi.fn();
  Object.defineProperty(container, 'scrollTop', {
    get: () => {
      throw new Error('Zusätzliche Positionslesung ohne Aufzeichnung');
    },
    set: schreiben,
  });
  schreibeScrollPosition(container, 120, 'resize-anker');
  expect(schreiben).toHaveBeenCalledWith(120);
});
