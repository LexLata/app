// xmlSerialisierung.baueText.test.ts
//
// Unit-Tests für gruppiereAbsaetze() und baueText() (xmlSerialisierung.ts)
// – Absatz-Ebene der Serialisierung. Deckt insbesondere die private
// Unterabsatz-Gruppierung (baueSaetzeEinesAbsatzes) indirekt über
// baueText() ab, da sie nicht exportiert ist.
//
// Für baueEintrag()/baueSatzInline()/baueSatzBlock() (Listeneintrags-Ebene)
// siehe xmlSerialisierung.baueEintrag.test.ts, für flattenElemente() siehe
// xmlSerialisierung.flattenElemente.test.ts.

import { describe, it, expect } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { gruppiereAbsaetze, baueText } from './xmlSerialisierung';
import type { ImpAbsatz, ImpElement } from './importTextstruktur';

describe('gruppiereAbsaetze', () => {
  it('Absätze mit nummer bleiben eigene Gruppen', () => {
    const abs: ImpAbsatz[] = [
      { nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Eins.'] }] },
      { nummer: '(2)', elemente: [{ type: 'texte', saetze: ['Zwei.'] }] },
    ];
    expect(gruppiereAbsaetze(abs)).toEqual([
      { nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Eins.'] }] },
      { nummer: '(2)', elemente: [{ type: 'texte', saetze: ['Zwei.'] }] },
    ]);
  });

  it('ein unnummerierter Absatz VOR dem ersten nummerierten bleibt eigenständig (result.length war 0)', () => {
    const abs: ImpAbsatz[] = [
      { elemente: [{ type: 'texte', saetze: ['Intro.'] }] },
      { nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Eins.'] }] },
    ];
    expect(gruppiereAbsaetze(abs)).toEqual([
      { nummer: undefined, elemente: [{ type: 'texte', saetze: ['Intro.'] }] },
      { nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Eins.'] }] },
    ]);
  });

  it('Edge-Case: ein unnummerierter Absatz NACH einem nummerierten wird an dessen elemente angehängt (Fortsetzungstext ohne eigene Nummer)', () => {
    const abs: ImpAbsatz[] = [
      { nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Eins.'] }] },
      { elemente: [{ type: 'texte', saetze: ['Fortsetzung.'] }] },
    ];
    expect(gruppiereAbsaetze(abs)).toEqual([
      {
        nummer: '(1)',
        elemente: [
          { type: 'texte', saetze: ['Eins.'] },
          { type: 'texte', saetze: ['Fortsetzung.'] },
        ],
      },
    ]);
  });

  it('Edge-Case: zwei unnummerierte Absätze direkt hintereinander (ganz ohne Nummerierung im Gesetz) werden zu EINER Gruppe zusammengeführt', () => {
    const abs: ImpAbsatz[] = [
      { elemente: [{ type: 'texte', saetze: ['A.'] }] },
      { elemente: [{ type: 'texte', saetze: ['B.'] }] },
    ];
    expect(gruppiereAbsaetze(abs)).toEqual([
      {
        nummer: undefined,
        elemente: [
          { type: 'texte', saetze: ['A.'] },
          { type: 'texte', saetze: ['B.'] },
        ],
      },
    ]);
  });

  it('leere Eingabe -> leeres Ergebnis', () => {
    expect(gruppiereAbsaetze([])).toEqual([]);
  });
});

describe('baueText – Randfälle ohne Inhalt', () => {
  it('leere Absatzliste -> keine Zeilen', () => {
    expect(baueText([], '    ')).toEqual([]);
  });

  it('einzelner Absatz mit komplett leeren elementen -> keine Zeilen (kein leeres <text/>)', () => {
    expect(baueText([{ elemente: [] }], '    ')).toEqual([]);
  });
});

describe('baueText – einzelne unnummerierte Gruppe', () => {
  it('ein Satz -> Kurzform <text>text</text> ohne <satz>-Wrapper', () => {
    expect(
      baueText([{ elemente: [{ type: 'texte', saetze: ['Nur ein Satz.'] }] }], '    '),
    ).toEqual(['    <text>Nur ein Satz.</text>']);
  });

  it('mehrere Sätze -> <text> mit <satz zahl="n">-Kindern, fortlaufend nummeriert', () => {
    expect(
      baueText([{ elemente: [{ type: 'texte', saetze: ['Satz eins.', 'Satz zwei.'] }] }], '    '),
    ).toEqual([
      '    <text>',
      '      <satz zahl="1">Satz eins.</satz>',
      '      <satz zahl="2">Satz zwei.</satz>',
      '    </text>',
    ]);
  });
});

describe('baueText – mehrere nummerierte Absätze', () => {
  it('Einzelsatz-Absätze bleiben in Kurzform, Mehrsatz-Absätze bekommen <satz>-Kinder', () => {
    expect(
      baueText(
        [
          { nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Satz A.'] }] },
          { nummer: '(2)', elemente: [{ type: 'texte', saetze: ['Satz B1.', 'Satz B2.'] }] },
        ],
        '    ',
      ),
    ).toEqual([
      '    <text>',
      '      <absatz zahl="(1)">Satz A.</absatz>',
      '      <absatz zahl="(2)">',
      '        <satz zahl="1">Satz B1.</satz>',
      '        <satz zahl="2">Satz B2.</satz>',
      '      </absatz>',
      '    </text>',
    ]);
  });

  it('Edge-Case: ein Absatz mit leeren elementen zwischen zwei gefüllten wird komplett übersprungen (kein leeres <absatz/>)', () => {
    expect(
      baueText(
        [
          { nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Satz A.'] }] },
          { nummer: '(2)', elemente: [] },
          { nummer: '(3)', elemente: [{ type: 'texte', saetze: ['Satz C.'] }] },
        ],
        '    ',
      ),
    ).toEqual([
      '    <text>',
      '      <absatz zahl="(1)">Satz A.</absatz>',
      '      <absatz zahl="(3)">Satz C.</absatz>',
      '    </text>',
    ]);
  });

  it('Absatznummer mit XML-Sonderzeichen wird escaped', () => {
    expect(
      baueText([{ nummer: '(1) & (2)', elemente: [{ type: 'texte', saetze: ['Text.'] }] }], '    '),
    ).toEqual(['    <text>', '      <absatz zahl="(1) &amp; (2)">Text.</absatz>', '    </text>']);
  });
});

describe('baueText – Unterabsatz-Gruppierung (EU-Recht, z.B. Art. 6 Abs. 1 EUV)', () => {
  it('ein Fließtext-Block mit Unterabsatz-Marker wird in <unterabsatz zahl="n">-Gruppen aufgeteilt, Satzzählung startet pro Unterabsatz neu bei 1', () => {
    expect(
      baueText(
        [
          {
            nummer: '(1)',
            elemente: [
              { type: 'texte', saetze: ['UA1 Satz1.', 'UA1 Satz2.'] },
              { type: 'unterabsatz' },
              { type: 'texte', saetze: ['UA2 Satz1.'] },
            ],
          },
        ],
        '    ',
      ),
    ).toEqual([
      '    <text>',
      '      <absatz zahl="(1)">',
      '        <unterabsatz zahl="[1]">',
      '          <satz zahl="1">UA1 Satz1.</satz>',
      '          <satz zahl="2">UA1 Satz2.</satz>',
      '        </unterabsatz>',
      '        <unterabsatz zahl="[2]">UA2 Satz1.</unterabsatz>',
      '      </absatz>',
      '    </text>',
    ]);
  });

  it('Edge-Case: ein Unterabsatz-Marker ganz am Anfang (kein Text davor) erzeugt trotzdem eine erste, leere Gruppe, die übersprungen wird – die Zählung beginnt daher bei der ersten NICHT-leeren Gruppe', () => {
    expect(
      baueText(
        [
          {
            nummer: '(1)',
            elemente: [{ type: 'unterabsatz' }, { type: 'texte', saetze: ['Einziger Satz.'] }],
          },
        ],
        '    ',
      ),
    ).toEqual([
      '    <text>',
      '      <absatz zahl="(1)">',
      '        <unterabsatz zahl="[1]">Einziger Satz.</unterabsatz>',
      '      </absatz>',
      '    </text>',
    ]);
  });
});

describe('baueText – Apostroph und Zeilenumbruch', () => {
  it('maskiert Apostrophe auf beiden Seiten eines Zeilenumbruchs', () => {
    const xml = baueText(
      [{ elemente: [{ type: 'texte', saetze: ["D'Artagnan.\nL'esprit."] }] }],
      '',
    ).join('');
    expect(xml).toContain('D&apos;Artagnan.<zeilenumbruch/>L&apos;esprit.');
  });
});

describe('baueText – einsätzige Aufzählungen', () => {
  const elemente: ImpElement[] = [
    { type: 'texte', saetze: ['Wirksam sind:'] },
    {
      type: 'liste',
      eintraege: [
        {
          bezeichnung: '1.',
          texteVor: ['Fall eins'],
          texteNach: [],
          untereintraege: [],
          unterlistenTyp: 'aufzaehlung',
        },
      ],
    },
    { type: 'texte', saetze: ['unter diesen Bedingungen.'] },
  ];

  it.each([undefined, '(1)'])(
    'Absatz %s enthält Liste und Fortsetzung direkt ohne Satz-Hülle',
    (nummer) => {
      const abs: ImpAbsatz[] = [{ nummer, elemente }];
      if (nummer === undefined)
        abs.push({ nummer: '(2)', elemente: [{ type: 'texte', saetze: ['Anderer Absatz.'] }] });
      const oeffner = nummer === undefined ? '<absatz>' : '<absatz zahl="(1)">';
      expect(baueText(abs, '').join('\n')).toContain(
        [
          `  ${oeffner}Wirksam sind:`,
          '    <nummer zahl="1.">Fall eins</nummer>',
          'unter diesen Bedingungen.',
          '  </absatz>',
        ].join('\n'),
      );
    },
  );

  it('Unterabsatz mit Liste und Fortsetzung bleibt kurz; nachfolgender Mehrsatz-Unterabsatz beginnt mit Satz 1', () => {
    expect(
      baueText(
        [
          {
            nummer: '(1)',
            elemente: [
              ...elemente,
              { type: 'unterabsatz' },
              { type: 'texte', saetze: ['Erster Satz.', 'Zweiter Satz.'] },
            ],
          },
        ],
        '',
      ),
    ).toEqual([
      '<text>',
      '  <absatz zahl="(1)">',
      '    <unterabsatz zahl="[1]">Wirksam sind:',
      '      <nummer zahl="1.">Fall eins</nummer>',
      'unter diesen Bedingungen.',
      '    </unterabsatz>',
      '    <unterabsatz zahl="[2]">',
      '      <satz zahl="1">Erster Satz.</satz>',
      '      <satz zahl="2">Zweiter Satz.</satz>',
      '    </unterabsatz>',
      '  </absatz>',
      '</text>',
    ]);
  });
});

it('erhält Unterabsatzbezeichnungen beim Rundlauf vom Import zum Darstellungsmodell', () => {
  const text = baueText(
    [
      {
        nummer: '(1)',
        elemente: [
          { type: 'unterabsatz' },
          { type: 'texte', saetze: ['Eins.'] },
          { type: 'unterabsatz' },
          { type: 'texte', saetze: ['Zwei.'] },
        ],
      },
    ],
    '',
  ).join('\n');
  const gesetz = parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><norm id="1"><bezeichnung>Art. 1</bezeichnung>${text}</norm></inhalt></gesetz>`,
  )!;
  const element = gesetz.elemente[0]!;
  expect(element.typ).toBe('norm');
  if (element.typ !== 'norm') throw Error('Norm fehlt');
  expect(element.data.absaetze[0]!.unterabsaetze?.map((u) => u.bezeichnung)).toEqual([
    '[1]',
    '[2]',
  ]);
});
