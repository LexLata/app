// messeScrollStand.test.ts
// Reale Blockaufteilung mit kontrollierter Browsergeometrie, einschließlich Virtualizer-Overscan.
import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { SCROLL_MARGIN } from './virtualizer';
import { messeScrollStand } from './messeScrollStand';

function fixture(
  bloecke: { titel: [number, number]; koerper?: [number, number]; ueberschrift?: boolean }[],
  scrollTop: number,
  leisteHoehe = 40,
) {
  const { document } = parseHTML('<html><body><div id="container"></div></body></html>');
  const container = document.createElement('div');
  Object.defineProperties(container, {
    scrollTop: { value: scrollTop },
    clientHeight: { value: 400 },
  });
  Object.defineProperty(container, 'clientTop', { value: 0 });
  const containerTop = 75;
  container.getBoundingClientRect = () => rechteck(containerTop, containerTop + 400);
  const elemente: DarstellungsElement[] = [];
  const zeilen = bloecke.map((block, index) => {
    elemente.push(
      block.ueberschrift
        ? {
            typ: 'ueberschrift',
            data: {
              id: String(index),
              xmlId: 'ueberschrift:001',
              gliederungskennzahl: '001',
              ebene: 1,
              bezeichnung: 'Abschnitt 1',
              titel: 'Allgemeines',
            },
          }
        : { typ: 'norm', data: normaleNorm({ id: String(index) }) },
    );
    const dom = document.createElement('div');
    dom.setAttribute('data-index', String(index));
    function bereich(attribut: string, grenzen: [number, number]) {
      const teil = document.createElement('div');
      teil.setAttribute(attribut, attribut === 'class' ? 'gt-klapp-zeile' : '');
      teil.getBoundingClientRect = () =>
        rechteck(
          containerTop + SCROLL_MARGIN + grenzen[0] - scrollTop,
          containerTop + SCROLL_MARGIN + grenzen[1] - scrollTop,
        );
      dom.append(teil);
    }
    bereich('class', block.titel);
    if (block.koerper) bereich('data-scroll-koerper', block.koerper);
    container.append(dom);
    return {
      index,
      start: block.titel[0],
      size: (block.koerper?.[1] ?? block.titel[1]) - block.titel[0],
    };
  });
  return () =>
    messeScrollStand(
      container,
      zeilen,
      {
        sichtbareElemente: elemente,
        leisteHoehe,
      },
      false,
    ).sichtbarkeitsliste;
}

function rechteck(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    x: 0,
    y: top,
    width: 100,
    height: bottom - top,
    toJSON: () => ({}),
  };
}

describe('messeScrollStand', () => {
  it('erfasst den sichtbaren Körper einer langen Norm bei herausgescrolltem Titel', () => {
    expect(fixture([{ titel: [0, 48], koerper: [48, 1600] }], 600)()).toEqual([
      { id: '0', titelSichtbar: false, koerperSichtbar: true },
    ]);
  });

  it('erfasst viele kurze Normen in Dokumentreihenfolge und verwirft Overscan außerhalb des Viewports', () => {
    const messen = fixture(
      Array.from({ length: 12 }, (_, index) => ({
        titel: [index * 90, index * 90 + 30],
        koerper: [index * 90 + 30, index * 90 + 90],
      })),
      SCROLL_MARGIN + 180,
    );
    expect(messen()).toEqual([
      { id: '2', titelSichtbar: false, koerperSichtbar: true },
      ...['3', '4', '5'].map((id) => ({ id, titelSichtbar: true, koerperSichtbar: true })),
      { id: '6', titelSichtbar: true, koerperSichtbar: true },
    ]);
  });

  it('gibt eingeklappten Normen und Überschriften keinen Körper', () => {
    expect(
      fixture([{ titel: [0, 60] }, { titel: [60, 120], ueberschrift: true }], SCROLL_MARGIN)(),
    ).toEqual([
      { id: '0', titelSichtbar: true, koerperSichtbar: false },
      { id: '1', titelSichtbar: true, koerperSichtbar: false },
    ]);
  });

  it('erfasst auch den unteren Teil eines mehrzeiligen Titels', () => {
    expect(fixture([{ titel: [0, 100], koerper: [100, 200] }], SCROLL_MARGIN + 20)()).toEqual([
      { id: '0', titelSichtbar: true, koerperSichtbar: true },
    ]);
  });

  it('verwirft ein Element im Leistenpolster ohne sichtbaren Titel oder Körper', () => {
    expect(fixture([{ titel: [0, 35] }, { titel: [50, 85] }], SCROLL_MARGIN + 40, 40)()).toEqual([
      { id: '1', titelSichtbar: true, koerperSichtbar: false },
    ]);
  });

  it('liefert für einen leeren Bereich und für reine Randberührung keine Elemente', () => {
    expect(fixture([], 0)()).toEqual([]);
    expect(fixture([{ titel: [0, 40] }, { titel: [400, 450] }], SCROLL_MARGIN)()).toEqual([]);
  });
});
