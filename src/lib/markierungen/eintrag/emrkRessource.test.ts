// Prüft die fachlichen Adressen und Verweisziele der gebündelten EMRK.
import { readFileSync } from 'node:fs';
import { assert, describe, expect, it } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { loeseNormEindeutigAuf } from '@/lib/domain/norm/norm.index';
import { loeseAusgangsstelleAuf } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
const xml = readFileSync('src-tauri/resources/europa/EMRK_europarat.xml', 'utf8');
const dom = new DOMParser().parseFromString(xml, 'text/xml');
const gesetz = parseGesetzesXML(xml);
assert(gesetz);
const vorher = [
  '5',
  '2',
  '3',
  '4',
  '7',
  null,
  '22',
  '26',
  '43',
  '34',
  '34',
  '27',
  '28',
  '34',
  '33',
  '33',
  '34',
  '30',
  '43',
  '46',
  '47',
  null,
  '34',
  '34',
  '44',
  '43',
  '47',
  '40',
  '34',
  '56',
  '56',
  null,
  '1',
  '56',
  '2',
  '34',
  '1',
  '1',
  '15',
  '57',
  '1',
  '7',
  '5',
  '15',
  '56',
  '1',
  '34',
  '1',
  '1',
  '8',
  '6',
  '56',
  '34',
  '1',
  '1',
  '4',
  '2',
  '15',
  '57',
  '1',
  '6',
  '4',
  '19',
  '10',
  '1',
  '1',
  '7',
  '7',
  '57',
  '1',
  '8',
  '10',
];
const erwartet = [
  '5',
  '2',
  '3',
  '4',
  '7',
  '10',
  '22',
  '26',
  '43',
  '34',
  '34',
  '27',
  '28',
  '34',
  '33',
  '33',
  '34',
  '30',
  '43',
  '46',
  '47',
  '33',
  '34',
  '34',
  '44',
  '43',
  '47',
  '40',
  '34',
  '56',
  '56',
  '1P1',
  '1P1',
  '56',
  '2P4',
  '34',
  '1P4',
  '1P4',
  '15',
  '57',
  '1P6',
  '7P6',
  '5P6',
  '15',
  '56',
  '1P7',
  '34',
  '1P7',
  '1P7',
  '8P7',
  '6P7',
  '56',
  '34',
  '1P12',
  '1P12',
  '4P12',
  '2P12',
  '15',
  '57',
  '1P13',
  '6P13',
  '4P13',
  '19',
  '10P16',
  '1P16',
  '1P16',
  '7P16',
  '7P16',
  '57',
  '1P16',
  '8P16',
  '10P16',
];
const geaendert = [
  5, 21, 31, 32, 34, 36, 37, 40, 41, 42, 45, 47, 48, 49, 50, 53, 54, 55, 56, 59, 60, 61, 63, 64, 65,
  66, 67, 69, 70, 71,
];
describe('gebündelte EMRK', () => {
  it('adressiert jede der 124 Normen eindeutig', () => {
    const normen = gesetz.elemente.filter((e) => e.typ === 'norm');
    expect(normen).toHaveLength(124);
    for (const n of normen)
      expect(
        loeseAusgangsstelleAuf(gesetz, { typ: 'norm', bezeichnung: n.data.bezeichnung }),
      ).toMatchObject({ anzahlTreffer: 1 });
  });
  it('gliedert acht eindeutig bezeichnete Präambeln in unnummerierte Absätze', () => {
    const normen = [...dom.querySelectorAll('norm')].filter((n) =>
      n.querySelector('bezeichnung')?.textContent?.startsWith('Präambel'),
    );
    expect(normen.map((n) => n.querySelector('bezeichnung')?.textContent)).toEqual([
      'Präambel',
      'Präambel P1',
      'Präambel P4',
      'Präambel P6',
      'Präambel P7',
      'Präambel P12',
      'Präambel P13',
      'Präambel P16',
    ]);
    for (const n of normen) {
      const absaetze = [...n.querySelectorAll('text > absatz')];
      expect(absaetze.length).toBeGreaterThanOrEqual(2);
      for (const a of absaetze) expect(a.hasAttribute('zahl')).toBe(false);
    }
    expect(dom.querySelector('zeilenumbruch')).toBeNull();
  });
  it('schreibt 72 kurze Eigenverweise und löst genau die 30 korrigierten Ziele anders auf', () => {
    const verweise = [...dom.querySelectorAll('verweis')];
    expect(verweise).toHaveLength(72);
    const ziele = verweise.map((v) => {
      expect(v.hasAttribute('gesetz')).toBe(false);
      expect(v.hasAttribute('normgeber')).toBe(false);
      const norm = v.getAttribute('norm');
      assert(norm);
      expect(norm.endsWith(',')).toBe(false);
      const ziel = loeseNormEindeutigAuf(gesetz, norm);
      expect(ziel.anzahlTreffer).toBe(1);
      return ziel.norm?.xmlId;
    });
    expect(ziele).toEqual(erwartet);
    expect(ziele.flatMap((z, i) => (z === vorher[i] ? [] : [i]))).toEqual(geaendert);
    expect(geaendert).toHaveLength(30);
  });
});
