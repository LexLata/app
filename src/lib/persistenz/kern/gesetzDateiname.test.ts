// Prüft die umkehrbare Dateinamenbildung für vollständige Gesetzesreferenzen.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  dateiBasis,
  kurztitelDateiname,
  referenzAusDateiBasis,
  nichtamtlicheTitelRessourcenPfad,
} from './gesetzDateiname';

describe('Gesetzesdateinamen', () => {
  it.each([
    ['BGB', 'de-bund', 'BGB_de-bund'],
    ['A_B', 'de-bw', 'A_B_de-bw'],
    ['A/B', 'eu', 'A%2FB_eu'],
    ['%<>:"/\\|?*', 'de-bund', '%25%3C%3E%3A%22%2F%5C%7C%3F%2A_de-bund'],
    ['Ä漢😀. . ', 'de-by', 'Ä漢😀%2E%20%2E%20_de-by'],
    ['X', 'unbekannt', 'X_unbekannt'],
    ['\u0000\u001f', 'x1', '%00%1F_x1'],
  ])('bildet und liest %s', (kurztitel, normgeber, basis) => {
    const ref = { kurztitel, normgeber };
    expect(dateiBasis(ref)).toBe(basis);
    expect(referenzAusDateiBasis(basis)).toEqual(ref);
  });

  it('erhält Unicode, Unterstriche und die Schreibweise im Rundlauf', () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc.integer({ min: 0, max: 0x10ffff }).filter((n) => n < 0xd800 || n > 0xdfff),
            { minLength: 1, maxLength: 40 },
          )
          .map((werte) => String.fromCodePoint(...werte)),
        fc.constantFrom(
          'unbekannt',
          'de-bund',
          'de-bund',
          'x1',
          'at-bund',
          '1234567890',
          'de-by',
          'x1',
        ),
        (kurztitel, normgeber) => {
          const ref = { kurztitel, normgeber };
          expect(referenzAusDateiBasis(dateiBasis(ref))).toEqual(ref);
        },
      ),
    );
  });

  it.each(['', 'a_b', 'a b', 'aaaaaaaaaaaaaaaaaaaaa', 'Bund!', '½', '²', 'i\u0307'])(
    'verwirft ungültigen Normgeber %s',
    (normgeber) => {
      expect(() => dateiBasis({ kurztitel: 'X', normgeber })).toThrow();
    },
  );

  it.each([
    'BGB',
    '_de-bund',
    'X%_de-bund',
    'X%2_de-bund',
    'X%GG_de-bund',
    'X%FF_de-bund',
    'A/B_de-bund',
    'A._de-bund',
    'A _de-bund',
    'A%41_de-bund',
  ])('verwirft nicht kanonische Dateibasis %s', (basis) => {
    expect(referenzAusDateiBasis(basis)).toBeNull();
  });

  it.each(['', 'a b', 'aaaaaaaaaaaaaaaaaaaaa', 'Bund!', '½', '²', 'i\u0307'])(
    'verwirft ungültige Suffixe %s',
    (suffix) => {
      expect(referenzAusDateiBasis(`X_${suffix}`)).toBeNull();
    },
  );

  it('deutet OHNE nicht als unbekannten Normgeber', () => {
    expect(referenzAusDateiBasis(dateiBasis({ kurztitel: 'BGB', normgeber: 'ohne' }))).toEqual({
      kurztitel: 'BGB',
      normgeber: 'ohne',
    });
  });

  it('lehnt Großschreibung im Dateisuffix ab', () => {
    expect(referenzAusDateiBasis('X_UnBeKaNnT')).toBeNull();
  });

  it.each(['CON.foo', 'COM1.x', 'LPT9.x'])('kodiert reservierte Windows-Namen %s', (kurztitel) => {
    const ref = { kurztitel, normgeber: 'de-bund' };
    expect(dateiBasis(ref)).toMatch(/^%[34][0-9A-F]/);
    expect(referenzAusDateiBasis(dateiBasis(ref))).toEqual(ref);
  });

  it('berücksichtigt das Suffix und die Erweiterung bei Windows-Namen', () => {
    expect(dateiBasis({ kurztitel: 'CON', normgeber: 'de-bund' })).toBe('CON_de-bund');
    expect(dateiBasis({ kurztitel: 'AUX.', normgeber: 'de-bund' })).toBe('AUX%2E_de-bund');
    expect(nichtamtlicheTitelRessourcenPfad({ kurztitel: 'CON', normgeber: 'de-bund' })).toBe(
      'resources/nichtamtliche-titel/de-bund/%43ON.xml',
    );
    expect(referenzAusDateiBasis('A%2fB_de-bund')).toEqual({
      kurztitel: 'A/B',
      normgeber: 'de-bund',
    });
  });

  it('unterscheidet Schrägstrich und Unterstrich', () => {
    expect(dateiBasis({ kurztitel: 'A/B', normgeber: 'de-bund' })).not.toBe(
      dateiBasis({ kurztitel: 'A_B', normgeber: 'de-bund' }),
    );
  });

  it('bildet den Ressourcenpfad mit kleinem Normgeber und kodiertem Titel', () => {
    expect(nichtamtlicheTitelRessourcenPfad({ kurztitel: 'A/B', normgeber: 'de-bund' })).toBe(
      'resources/nichtamtliche-titel/de-bund/A%2FB.xml',
    );
    expect(nichtamtlicheTitelRessourcenPfad({ kurztitel: 'X', normgeber: 'unbekannt' })).toBe(
      'resources/nichtamtliche-titel/unbekannt/X.xml',
    );
  });
});

describe('Kurztiteldateiname ohne Normgeber-Suffix', () => {
  it.each([
    ['BGB', 'BGB.xml'],
    ['2004/38/EG', '2004%2F38%2FEG.xml'],
    ['A:?*', 'A%3A%3F%2A.xml'],
    ['CON', '%43ON.xml'],
    ['G.', 'G%2E.xml'],
    ['G ', 'G%20.xml'],
  ])('kodiert %s plattformübergreifend', (kurztitel, erwartet) => {
    expect(kurztitelDateiname(kurztitel)).toBe(erwartet);
    expect(nichtamtlicheTitelRessourcenPfad({ kurztitel, normgeber: 'de-bund' })).toBe(
      `resources/nichtamtliche-titel/de-bund/${erwartet}`,
    );
  });

  it('weist einen leeren Kurztitel mit derselben Meldung wie die Referenzprüfung zurück', () => {
    expect(() => kurztitelDateiname('')).toThrow('Der Kurztitel darf nicht leer sein.');
  });
});
