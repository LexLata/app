// meldungsgliederung.test.ts
// P1-A1: Gliederung nach Kategorie und Gruppe, Schwelle, Anzahl, Hinweise, Detail.
import { describe, expect, it } from 'vitest';
import {
  gliedereMeldungen,
  type Gliederungseintrag,
  type Gliederungskategorie,
} from './meldungsgliederung';

const kategorien: Gliederungskategorie[] = [
  {
    schluessel: 'k',
    ueberschrift: 'Kategorie',
    gruppen: [
      { schluessel: 'a', ueberschrift: (n) => (n === 1 ? 'Eins' : 'Mehrere') },
      { schluessel: 'b', ueberschrift: (n) => (n === 1 ? 'B-Eins' : 'B-Mehrere') },
    ],
  },
];

function namen(gruppe: string, anzahl: number): Gliederungseintrag[] {
  return Array.from({ length: anzahl }, (_, i) => ({
    kategorie: 'k',
    gruppe,
    name: `${gruppe}${i}`,
  }));
}

function gliedere(eintraege: Gliederungseintrag[]) {
  return gliedereMeldungen(eintraege, { schwelle: 5, kategorien });
}

/** Gruppen der einzigen Kategorie. */
function gruppenVon(eintraege: Gliederungseintrag[]) {
  return gliedere(eintraege).kategorien.flatMap((k) => k.gruppen);
}

describe('gliedereMeldungen', () => {
  it('Schwelle: 5 sichtbare Einträge -> Satzform, 6 -> Gliederungsform', () => {
    expect(gliedere(namen('a', 5)).form).toBe('saetze');
    expect(gliedere(namen('a', 6)).form).toBe('gliederung');
  });

  it('allgemeine und Kategoriesätze zählen als Einträge', () => {
    const g = gliedere([...namen('a', 4), { satz: 'Allgemein' }, { kategorie: 'k', satz: 'S' }]);
    expect(g.anzahl).toBe(6);
    expect(g.form).toBe('gliederung');
    expect(g.allgemein).toEqual(['Allgemein']);
    expect(g.kategorien.map((k) => k.saetze)).toEqual([['S']]);
  });

  it('Gruppen in festgelegter Reihenfolge mit Anzahl und allen Namen; Singular bei 1', () => {
    const eintraege = [...namen('b', 1), ...namen('a', 3)];
    expect(gliedere(eintraege).anzahl).toBe(4);
    expect(
      gruppenVon(eintraege).map((x) => ({
        schluessel: x.schluessel,
        ueberschrift: x.ueberschrift,
        anzahl: x.anzahl,
        namen: x.namen.map((n) => n.name),
      })),
    ).toEqual([
      { schluessel: 'a', ueberschrift: 'Mehrere', anzahl: 3, namen: ['a0', 'a1', 'a2'] },
      { schluessel: 'b', ueberschrift: 'B-Eins', anzahl: 1, namen: ['b0'] },
    ]);
  });

  it('Duplikate erscheinen einmal; unbekannte Gruppen werden ignoriert', () => {
    const eintraege = [
      ...namen('a', 1),
      ...namen('a', 1),
      { kategorie: 'k', gruppe: 'x', name: 'X' },
    ];
    expect(gruppenVon(eintraege).map((x) => x.namen.length)).toEqual([1]);
    expect(gliedere(eintraege).anzahl).toBe(1);
  });

  it('Hinweise stehen am richtigen Namen', () => {
    const gruppen = gruppenVon([
      { kategorie: 'k', gruppe: 'a', name: 'A' },
      { kategorie: 'k', gruppe: 'a', name: 'B', hinweise: ['h'] },
    ]);
    expect(gruppen.map((x) => x.namen)).toEqual([
      [
        { name: 'A', hinweise: [] },
        { name: 'B', hinweise: ['h'] },
      ],
    ]);
  });

  it('Detail nur bei einer Gruppe mit genau einem Eintrag', () => {
    const allein = gruppenVon([{ kategorie: 'k', gruppe: 'a', name: 'A', detail: 'd' }]);
    expect(allein.flatMap((x) => x.namen.map((n) => n.detail))).toEqual(['d']);
    const mehrere = gruppenVon([
      { kategorie: 'k', gruppe: 'a', name: 'A', detail: 'd' },
      { kategorie: 'k', gruppe: 'a', name: 'B', detail: 'e' },
    ]);
    expect(mehrere.flatMap((x) => x.namen.map((n) => n.detail))).toEqual([undefined, undefined]);
  });
});
