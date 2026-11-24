// pfeilNavigation.test.ts
// Prüft Elternsprünge und Überschriftenblöcke unabhängig von DOM und Tastaturhandler.
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { berechnePfeilaktion } from './pfeilNavigation';
const element = (id: number, ueberschrift: boolean): DarstellungsElement =>
  ueberschrift
    ? {
        typ: 'ueberschrift',
        data: {
          id: String(id),
          xmlId: String(id),
          bezeichnung: '',
          ebene: id + 1,
          gliederungskennzahl: '000',
        },
      }
    : {
        typ: 'norm',
        data: normaleNorm({ id: String(id), xmlId: String(id), bezeichnung: '', absaetze: [] }),
      };
function aktion(
  elemente: DarstellungsElement[],
  index: number,
  richtung: 'hoch' | 'runter' | 'links' | 'rechts',
  optionen = {},
  eingeklappt = false,
) {
  return berechnePfeilaktion(
    elemente,
    elemente,
    {
      aktivesElementId: elemente[index]?.data.id ?? null,
      eingeklappteUeberschriften: new Set<string>(),
      eingeklappteNormen: new Set(
        eingeklappt ? elemente.filter((e) => e.typ === 'norm').map((e) => e.data.id) : [],
      ),
    },
    richtung,
    optionen,
  );
}
describe('Pfeilregeln', () => {
  it.each([false, true])(
    'links springt ohne Klappänderung, Shift-links klappt den Elternteil ein (Norm eingeklappt: %s)',
    (eingeklappt) => {
      const liste = [element(0, true), element(1, false)];
      const links = aktion(liste, 1, 'links', {}, eingeklappt);
      expect(links.zielId).toBe('0');
      expect(links.momentaufnahme.aktivesElementId).toBe('0');
      expect(links.momentaufnahme.eingeklappteUeberschriften.size).toBe(0);
      expect(links.momentaufnahme.eingeklappteNormen).toEqual(new Set(eingeklappt ? ['1'] : []));
      expect(
        aktion(liste, 1, 'links', { shift: true }, eingeklappt).momentaufnahme
          .eingeklappteUeberschriften,
      ).toEqual(new Set(['0']));
      expect(aktion(liste, 0, 'links').zielId).toBeNull();
      expect(aktion(liste, 0, 'links', { shift: true }).zielId).toBeNull();
    },
  );
  it.each([false, true])('rechts öffnet Normtexte mit unveränderter Shift-Regel (%s)', (shift) => {
    const liste = [element(0, true), element(1, false), element(2, false)];
    const result = aktion(liste, 1, 'rechts', { shift }, true);
    expect(result.zielId).toBeNull();
    expect(result.momentaufnahme.eingeklappteNormen).toEqual(new Set(shift ? ['2'] : []));
  });
  it.each([false, true])('links behandelt auch eingeklappte aktive Überschriften (%s)', (shift) => {
    const liste = [element(0, true), element(1, true)];
    const result = berechnePfeilaktion(
      liste,
      liste,
      {
        aktivesElementId: '1',
        eingeklappteUeberschriften: new Set(['1']),
        eingeklappteNormen: new Set(),
      },
      'links',
      { shift },
    );
    expect(result.zielId).toBe('0');
    expect(result.momentaufnahme.eingeklappteUeberschriften).toEqual(
      new Set(shift ? ['1', '0'] : ['1']),
    );
  });
  it('Shift-links klappt einen Gliederungsartikel als Elternteil ein', () => {
    const parent = element(0, false);
    if (parent.typ === 'norm')
      Object.assign(parent.data, {
        art: 'gliederungsartikel',
        gliederungsEbene: 1,
        ueberschriftartig: true,
      });
    const result = aktion([parent, element(1, false)], 1, 'links', { shift: true });
    expect(result.zielId).toBe('0');
    expect(result.momentaufnahme.eingeklappteNormen).toEqual(new Set(['0']));
  });
  it.each(['hoch', 'runter'] as const)(
    'Alt-%s geht genau einen Schritt und klemmt an den Rändern',
    (richtung) => {
      const liste = Array.from({ length: 8 }, (_, i) => element(i, false));
      expect(aktion(liste, 3, richtung, { alt: true }).zielId).toBe(
        richtung === 'hoch' ? '2' : '4',
      );
      expect(aktion(liste, -1, richtung, { alt: true }).zielId).toBe('0');
      expect(aktion(liste, richtung === 'hoch' ? 0 : 7, richtung, { alt: true }).zielId).toBeNull();
    },
  );
  it('springt gemäß Beispiel über Überschriftenblöcke und trennt auch eingeklappte Normen', () => {
    const liste = [true, true, true, false, false, true, false, true, false].map((h, i) =>
      element(i, h),
    );
    for (const [von, nach] of [
      [0, 5],
      [5, 7],
      [7, 8],
      [-1, 0],
    ])
      expect(aktion(liste, von!, 'runter', { meta: true }, true).zielId).toBe(String(nach));
    for (const [von, nach] of [
      [5, 0],
      [6, 5],
      [1, 0],
      [-1, 0],
    ])
      expect(aktion(liste, von!, 'hoch', { meta: true }).zielId).toBe(String(nach));
    expect(aktion(liste, 0, 'hoch', { meta: true }).zielId).toBeNull();
    const geschlossen = liste.filter((e) => e.typ === 'ueberschrift');
    expect(aktion(geschlossen, 0, 'runter', { meta: true }).zielId).toBe('7');
    expect(aktion(geschlossen, 3, 'hoch', { meta: true }).zielId).toBe('0');
    expect(aktion([element(0, false), element(1, true)], -1, 'runter', { meta: true }).zielId).toBe(
      '1',
    );
  });
  it('erreicht bei führenden Normen und ganz ohne Überschrift das Listenende', () => {
    const liste = [element(0, false), element(1, true), element(2, false)];
    expect(aktion(liste, 0, 'runter', { meta: true }).zielId).toBe('1');
    expect(aktion(liste, 1, 'runter', { meta: true }).zielId).toBe('2');
    const normen = [element(0, false), element(1, false), element(2, false)];
    expect(aktion(normen, 0, 'runter', { meta: true }).zielId).toBe('2');
  });
  it('behandelt keine Mehrfachmodifier', () => {
    expect(
      aktion([element(0, true), element(1, false)], 0, 'runter', { alt: true, meta: true }).zielId,
    ).toBeNull();
  });
  it('bewahrt Richtung, Blockanfänge und endliche Erreichbarkeit für beliebige sichtbare Listen', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 80 }),
        fc.nat(),
        (typen, zufall) => {
          const liste = typen.map((h, i) => element(i, h));
          const index = zufall % liste.length;
          const starts = typen.flatMap((h, i) => (h && !typen[i - 1] ? [i] : []));
          for (const richtung of ['hoch', 'runter'] as const) {
            const id = aktion(liste, index, richtung, { meta: true }).zielId;
            const ziel = id === null ? index : Number(id);
            expect(richtung === 'runter' ? ziel >= index : ziel <= index).toBe(true);
            if (id !== null && ziel !== 0 && ziel !== liste.length - 1)
              expect(starts).toContain(ziel);
          }
          let position = 0;
          for (let schritt = 0; schritt < starts.length + (typen[0] ? 0 : 1); schritt++) {
            const id = aktion(liste, position, 'runter', { meta: true }).zielId;
            if (id !== null) position = Number(id);
          }
          expect(position).toBe(liste.length - 1);
        },
      ),
    );
  });
});
