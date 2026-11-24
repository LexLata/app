// gesetzFabriken.test.ts
// Prüft gültige, unabhängig überschreibbare Gesetz-Testdaten.
import { describe, expect, it } from 'vitest';
import {
  gesetzesreferenz,
  gesetzInfos,
  gesetzDarstellung,
  gesetzMitNormen,
  kleinesGesetz,
} from './gesetzFabriken';

describe('Gesetz-Testdatenfabriken', () => {
  for (const fabrik of [gesetzesreferenz, gesetzInfos, gesetzDarstellung]) {
    it(`${fabrik.name}: Standard und einzelne Überschreibungen`, () => {
      expect(fabrik()).toMatchObject({ normgeber: 'de-bund', kurztitel: 'BGB' });
      expect(fabrik({ kurztitel: 'GG' })).toMatchObject({ normgeber: 'de-bund', kurztitel: 'GG' });
      for (const normgeber of ['de-bund', 'de-bw', 'eu']) {
        expect(fabrik({ normgeber }).normgeber).toBe(normgeber);
      }
      expect(fabrik({ normgeber: undefined }).normgeber).toBe('de-bund');
    });
  }
  it('liefert kleine Gesetze mit und ohne Gliederungsartikel unabhängig', () => {
    expect(kleinesGesetz().hatGliederungsartikel).toBe(false);
    expect(kleinesGesetz(true).hatGliederungsartikel).toBe(true);
    expect(kleinesGesetz().elemente).toHaveLength(1);
    expect(kleinesGesetz(true).elemente).toHaveLength(2);
    expect(kleinesGesetz().elemente).not.toBe(kleinesGesetz().elemente);
  });
  it('liefert ein Testgesetz mit normalen Normen in Reihenfolge, nummeriert ab 0', () => {
    const gesetz = gesetzMitNormen(['§ 9', 'Art. 9']);
    expect(gesetz).toMatchObject({ kurztitel: 'TestG', langtitel: 'Test', normgeber: 'de-bund' });
    expect(gesetz.elemente).toEqual([
      {
        typ: 'norm',
        data: { art: 'normal', id: '0', xmlId: '0', bezeichnung: '§ 9', absaetze: [] },
      },
      {
        typ: 'norm',
        data: { art: 'normal', id: '1', xmlId: '1', bezeichnung: 'Art. 9', absaetze: [] },
      },
    ]);
  });
  it('übernimmt beim Testgesetz aus Normen Titel, Normgeber, Kennungsmuster und Normart', () => {
    const gesetz = gesetzMitNormen(['E1', 'E2'], {
      kurztitel: 'LBO',
      langtitel: 'Landesbauordnung',
      normgeber: 'de-bw',
      kennung: (i) => `n-${i}`,
      norm: { art: 'erwaegungsgrund' },
    });
    expect(gesetz).toMatchObject({
      kurztitel: 'LBO',
      langtitel: 'Landesbauordnung',
      normgeber: 'de-bw',
      hatGliederungsartikel: false,
    });
    expect(gesetz.elemente).toEqual([
      {
        typ: 'norm',
        data: { art: 'erwaegungsgrund', id: 'n-0', xmlId: 'n-0', bezeichnung: 'E1', absaetze: [] },
      },
      {
        typ: 'norm',
        data: { art: 'erwaegungsgrund', id: 'n-1', xmlId: 'n-1', bezeichnung: 'E2', absaetze: [] },
      },
    ]);
  });
  it('übernimmt beim Testgesetz aus Normen je Norm abweichende Werte nach Position', () => {
    const gesetz = gesetzMitNormen(['§ 1', '§ 2'], {
      norm: (i) => ({ xmlId: `xml-${i}`, absaetze: [{ id: `abs-${i}`, saetze: [] }] }),
    });
    expect(gesetz.elemente).toEqual([
      {
        typ: 'norm',
        data: {
          art: 'normal',
          id: '0',
          xmlId: 'xml-0',
          bezeichnung: '§ 1',
          absaetze: [{ id: 'abs-0', saetze: [] }],
        },
      },
      {
        typ: 'norm',
        data: {
          art: 'normal',
          id: '1',
          xmlId: 'xml-1',
          bezeichnung: '§ 2',
          absaetze: [{ id: 'abs-1', saetze: [] }],
        },
      },
    ]);
  });
  it('vergibt beim Testgesetz aus Normen Kennungen aus einer ausdrücklichen Liste', () => {
    const gesetz = gesetzMitNormen(['§ 280', 'Anlage 280'], { kennung: ['280', 'anlage'] });
    expect(gesetz.elemente.map(({ data }) => [data.id, data.xmlId])).toEqual([
      ['280', '280'],
      ['anlage', 'anlage'],
    ]);
  });
});
