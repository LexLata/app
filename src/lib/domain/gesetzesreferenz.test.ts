// gesetzesreferenz.test.ts
// Offene Normgeber und vollständige, schreibungsunabhängige Gesetzesidentität.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  waehleGesetzeskandidat,
  referenzVon,
  findeGesetz,
  istGesetzesreferenzSchluessel,
  istGueltigerNormgeber,
  liesNormgeber,
  istGleichesGesetz,
  gesetzesreferenzSchluessel,
} from './gesetzesreferenz';

const gueltigeCodes = [
  'bund',
  'bw',
  'de-bund',
  'de-bw',
  'eu',
  'europarat',
  'unbekannt',
  'at-bund',
  'de-by',
  'x1',
  'a'.repeat(20),
];
// Gezielte Negativfälle: alte Werte und Verletzungen des vereinbarten Codemusters.
const ungueltigeCodes = [
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'BW' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'EU' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'DE-BUND',
  'Österreich',
  'de_bund',
  'de--bund',
  '-de',
  'de-',
  '',
  'a'.repeat(21),
  'a b',
  'de-bund\n',
  'de-bund\r\n',
];
describe('Normgeber', () => {
  it.each(gueltigeCodes)('akzeptiert den Code %s unverändert', (wert) => {
    expect(istGueltigerNormgeber(wert)).toBe(true);
    expect(liesNormgeber(wert)).toBe(wert);
  });
  it.each(ungueltigeCodes)('lehnt den ungültigen Code %s mit Musterhinweis ab', (wert) => {
    expect(istGueltigerNormgeber(wert)).toBe(false);
    expect(() => liesNormgeber(wert)).toThrow('de-bund');
  });
  it('lässt fehlende Angaben unbekannt', () => expect(liesNormgeber(undefined)).toBeUndefined());
});
it('vergleicht Normgeber und Kurztitel gemeinsam ohne Beachtung der Schreibweise', () => {
  expect(
    istGleichesGesetz(
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      { kurztitel: 'bgb', normgeber: 'de-bund' },
    ),
  ).toBe(true);
  expect(
    istGleichesGesetz(
      { kurztitel: 'X', normgeber: 'de-bw' },
      { kurztitel: 'X', normgeber: 'de-bund' },
    ),
  ).toBe(false);
  expect(
    istGleichesGesetz(
      { kurztitel: 'X', normgeber: 'unbekannt' },
      { kurztitel: 'x', normgeber: 'unbekannt' },
    ),
  ).toBe(true);
  expect(
    istGleichesGesetz(
      { kurztitel: 'X', normgeber: 'unbekannt' },
      { kurztitel: 'X', normgeber: 'de-bund' },
    ),
  ).toBe(false);
});

it('bildet vollständige, normalisierte und kollisionsfreie Schlüssel', () => {
  expect(gesetzesreferenzSchluessel({ kurztitel: 'BGB', normgeber: 'de-bund' })).toBe(
    gesetzesreferenzSchluessel({ kurztitel: 'bgb', normgeber: 'de-bund' }),
  );
  const referenzen = [
    { kurztitel: 'X', normgeber: 'de-bund' },
    { kurztitel: 'X', normgeber: 'de-bw' },
    { kurztitel: 'X', normgeber: 'unbekannt' },
    { kurztitel: 'Bund_X', normgeber: 'unbekannt' },
    { kurztitel: 'X_de-bund', normgeber: 'unbekannt' },
    { kurztitel: '__proto__', normgeber: 'unbekannt' },
    { kurztitel: 'A/B', normgeber: 'de-bund' },
    { kurztitel: 'A_B', normgeber: 'de-bund' },
  ];
  expect(new Set(referenzen.map(gesetzesreferenzSchluessel)).size).toBe(referenzen.length);
});

describe('Kandidatenrangfolge', () => {
  const kandidaten = ['sachsen', 'de-bw', 'eu', 'de-bund', 'bayern'].map((normgeber) => ({
    kurztitel: 'TestG',
    normgeber,
  }));
  it.each([
    ['de-bw', 'de-bw'],
    ['de-bund', 'de-bund'],
    ['eu', 'eu'],
    ['sachsen', 'de-bund'],
    [undefined, 'de-bund'],
  ])('wählt für %s den ersten verfügbaren Rang', (ausgang, erwartet) => {
    expect(waehleGesetzeskandidat('testg', ausgang, kandidaten)?.referenz?.normgeber).toBe(
      erwartet,
    );
  });
  it('nutzt EU als nächstes Ziel für Bund und Bund als nächstes Ziel für BW', () => {
    expect(
      waehleGesetzeskandidat(
        'TestG',
        'de-bund',
        kandidaten.filter((g) => g.normgeber !== 'de-bund'),
      )?.referenz?.normgeber,
    ).toBe('eu');
    expect(
      waehleGesetzeskandidat(
        'TestG',
        'de-bw',
        kandidaten.filter((g) => g.normgeber !== 'de-bw'),
      )?.referenz?.normgeber,
    ).toBe('de-bund');
  });
  it.each(['de-bund', 'eu', 'de-bw', 'sachsen', undefined])(
    'berücksichtigt für %s auch einen sonstigen Normgeber',
    (ausgang) => {
      const ziel = { kurztitel: 'LV', normgeber: 'bayern' };
      expect(waehleGesetzeskandidat('LV', ausgang, [ziel])?.referenz).toBe(ziel);
    },
  );
  it.each(['de-bund', 'eu', 'sachsen', undefined])(
    'belässt übrige Normgeber für %s gemeinsam mehrdeutig',
    (ausgang) => {
      const rest = kandidaten.filter((g) => !['de-bund', 'eu'].includes(g.normgeber));
      expect(waehleGesetzeskandidat('TestG', ausgang, rest)).toEqual({ mehrdeutig: true });
      expect(waehleGesetzeskandidat('TestG', ausgang, [...rest].reverse())).toEqual({
        mehrdeutig: true,
      });
    },
  );
  it.each(['de-bund', 'de-bw', 'eu', undefined])(
    'behandelt unbekannte und benutzerdefinierte Normgeber für %s gleichrangig',
    (ausgang) => {
      expect(
        waehleGesetzeskandidat('G', ausgang, [
          { kurztitel: 'G', normgeber: 'unbekannt' },
          { kurztitel: 'G', normgeber: 'kirche' },
        ]),
      ).toEqual({ mehrdeutig: true });
    },
  );
  it('erfindet keinen fehlenden Kandidaten', () => {
    expect(waehleGesetzeskandidat('Unbekannt', undefined, kandidaten)).toBeUndefined();
  });
  it('bewahrt das gewählte Kandidatenobjekt samt Ressourcenlink', () => {
    const eu = { kurztitel: 'TestG', normgeber: 'eu', abrufkennung: 'TestG_resource.xml' };
    expect(waehleGesetzeskandidat('testg', 'eu', [eu])?.referenz).toBe(eu);
  });
});

describe('Kurztiteleingaben', () => {
  it.each([' ', '\u00a0', '\u202f', '  ', '\t', '\n'])(
    'vereinheitlicht Whitespace %j auf beiden Seiten, ohne ihn zu entfernen',
    (abstand) => {
      const standard = { kurztitel: 'SGB IV', normgeber: 'de-bund' };
      const abweichend = { kurztitel: `SGB${abstand}IV`, normgeber: 'de-bund' };
      expect(waehleGesetzeskandidat(`sgb${abstand}iv`, 'de-bund', [standard])?.referenz).toBe(
        standard,
      );
      expect(waehleGesetzeskandidat('sgb iv', 'de-bund', [abweichend])?.referenz).toBe(abweichend);
      expect(waehleGesetzeskandidat('SGBIV', 'de-bund', [abweichend])).toBeUndefined();
    },
  );
  it('bevorzugt innerhalb des maßgeblichen Rangs exakt vor Whitespace', () => {
    const exakt = { kurztitel: 'SGB IV', normgeber: 'de-bund' };
    const anders = { kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' };
    expect(waehleGesetzeskandidat('sgb iv', 'de-bund', [anders, exakt])?.referenz).toBe(exakt);
    expect(waehleGesetzeskandidat('sgb iv', 'de-bund', [exakt, anders])?.referenz).toBe(exakt);
  });
  it('belässt den höheren Normgeberrang vor einem exakten Treffer im niedrigeren Rang', () => {
    const bw = { kurztitel: 'SGB\u00a0IV', normgeber: 'de-bw' };
    const bund = { kurztitel: 'SGB IV', normgeber: 'de-bund' };
    expect(waehleGesetzeskandidat('SGB IV', 'de-bw', [bund, bw])?.referenz).toBe(bw);
  });
  it.each(['BGB', 'GG'])('sucht %s erst mit, danach ohne genau einen Schlusspunkt', (kurztitel) => {
    const ohne = { kurztitel, normgeber: 'de-bund' };
    const mit = { kurztitel: `${kurztitel}.`, normgeber: 'eu' };
    expect(waehleGesetzeskandidat(`${kurztitel}.`, 'de-bund', [ohne])?.referenz).toBe(ohne);
    expect(waehleGesetzeskandidat(`${kurztitel}.`, 'de-bund', [ohne, mit])?.referenz).toBe(mit);
    expect(waehleGesetzeskandidat(`${kurztitel}..`, 'de-bund', [ohne])).toBeUndefined();
  });
  it('dedupliziert vollständige Referenzen, ohne ihre Identität zu vereinheitlichen', () => {
    const original = { kurztitel: 'SGB IV', normgeber: 'de-bund', abrufkennung: 'index' };
    const schluessel = gesetzesreferenzSchluessel(original);
    const ergebnis = waehleGesetzeskandidat('sgb\tiv', 'de-bund', [
      original,
      { kurztitel: 'sgb iv', normgeber: 'de-bund' },
    ]);
    expect(ergebnis?.referenz).toBe(original);
    expect(gesetzesreferenzSchluessel(original)).toBe(schluessel);
    expect(istGleichesGesetz(original, { kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' })).toBe(
      false,
    );
    expect(gesetzesreferenzSchluessel(original)).not.toBe(
      gesetzesreferenzSchluessel({ kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' }),
    );
  });
  it('meldet gleichrangige Kollisionen in jeder Reihenfolge statt eine Referenz zu raten', () => {
    const kandidaten = [
      { kurztitel: 'SGB\u00a0IV', normgeber: 'de-bund' },
      { kurztitel: 'SGB\u202fIV', normgeber: 'de-bund' },
    ];
    expect(waehleGesetzeskandidat('SGB IV', 'de-bund', kandidaten)).toEqual({ mehrdeutig: true });
    expect(waehleGesetzeskandidat('SGB IV', 'de-bund', [...kandidaten].reverse())).toEqual({
      mehrdeutig: true,
    });
    expect(waehleGesetzeskandidat('SGB IV.', 'de-bund', kandidaten)).toEqual({ mehrdeutig: true });
  });
});

describe('reine Referenzen und gespeicherte Schlüssel', () => {
  it('kopiert ausschließlich die unveränderte Referenz', () => {
    const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund', elemente: [] };
    expect(referenzVon(gesetz)).toEqual({ kurztitel: 'BGB', normgeber: 'de-bund' });
    expect(referenzVon({ kurztitel: 'X', normgeber: 'unbekannt' })).toEqual({
      kurztitel: 'X',
      normgeber: 'unbekannt',
    });
    expect(referenzVon(gesetz)).not.toBe(gesetz);
  });
  it('findet das erste gleiche Gesetz anhand beider Referenzfelder', () => {
    const bund = { kurztitel: 'BGB', normgeber: 'de-bund' };
    const unbekannt = { kurztitel: 'BGB', normgeber: 'unbekannt' };
    const gesetze = [bund, unbekannt, { ...bund }];
    expect(findeGesetz(gesetze, { kurztitel: 'Bgb', normgeber: 'de-bund' })).toBe(bund);
    expect(findeGesetz(gesetze, { kurztitel: 'bgb', normgeber: 'unbekannt' })).toBe(unbekannt);
    expect(findeGesetz([bund], { kurztitel: 'BGB', normgeber: 'unbekannt' })).toBeUndefined();
    expect(findeGesetz(gesetze, { kurztitel: 'BGB', normgeber: 'de-bw' })).toBeUndefined();
    expect(findeGesetz(gesetze, { kurztitel: 'ZPO', normgeber: 'unbekannt' })).toBeUndefined();
  });
  it('erkennt die Schlüssel gültiger Referenzen', () => {
    const normgeber = fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstulmnopqrstuvwxyz0123456789'), {
        minLength: 1,
        maxLength: 20,
      })
      .map((teile) => teile.join(''));
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), normgeber, (kurztitel, normgeber) => {
        expect(
          istGesetzesreferenzSchluessel(gesetzesreferenzSchluessel({ kurztitel, normgeber })),
        ).toBe(true);
      }),
    );
  });
  it.each([
    'BGB_de-bund',
    'kein JSON',
    '["Bund","bgb"]', // normgeber-negativ: gezielte Ablehnung des alten Codeformats.
    '[null,"BGB"]',
    '[null]',
    '[null,"g",0]',
    '[null,""]',
    '["a_b","g"]',
    '["abcdefghijklmnopqrstu","g"]',
    '[null, "g"]',
    ' [null,"g"]',
    '{}',
    'null',
    1,
    null,
  ])('verwirft ungültige Schlüssel %j', (wert) => {
    expect(istGesetzesreferenzSchluessel(wert)).toBe(false);
  });
});
