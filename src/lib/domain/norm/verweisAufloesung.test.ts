// Prüft vollständige Verweisidentität unabhängig von toleranter Suche.

import { gleicheNormBezeichnung } from './verweisAufloesung';
import { normDarstellung, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type {
  DarstellungsElement,
  GesetzDarstellung,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import { loeseNormEindeutigAuf, verweisZuXmlId } from '@/lib/domain/norm/norm.index';

function norm(
  xmlId: string,
  bezeichnung: string,
  optionen: Partial<NormDarstellung> = {},
): Extract<DarstellungsElement, { typ: 'norm' }> {
  return {
    typ: 'norm',
    data: normDarstellung({ id: xmlId, xmlId, bezeichnung, absaetze: [], ...optionen }),
  };
}
function gesetz(elemente: DarstellungsElement[]): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel: 'G',
    langtitel: 'G',
    hatGliederungsartikel: true,
    elemente,
  });
}

describe('verweisZuXmlId', () => {
  it('löst volle Bezeichnungen gezielt und bloße Zahlen nur eindeutig auf', () => {
    const g = gesetz([norm('ohne', '5'), norm('paragraf', '§ 5'), norm('artikel', 'Art. 5')]);
    expect(verweisZuXmlId(g, '5')).toBeNull();
    expect(verweisZuXmlId(g, '§ 5')).toBe('paragraf');
    expect(verweisZuXmlId(g, 'Art. 5')).toBe('artikel');
    expect(verweisZuXmlId(g, '5')).toBeNull();
    expect(verweisZuXmlId(g, 'unbekannt 5')).toBeNull();
  });
  it('verweigert bloße Normzahlen bei mehreren passenden Normen', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999999 }), (zahl) => {
        const text = String(zahl);
        const g = gesetz([norm('ohne', text), norm('mit', `§ ${text}`)]);
        expect(verweisZuXmlId(g, text)).toBeNull();
      }),
    );
  });
  it('erhält präfixlose Normen unter einem Gliederungsartikel', () => {
    const g = gesetz([
      norm('artikel', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('ohne', '5'),
      norm('mit', '§ 5'),
    ]);
    expect(verweisZuXmlId(g, 'Art. 229 5')).toBe('ohne');
    expect(verweisZuXmlId(g, 'Art. 229 § 5')).toBe('mit');
    expect(verweisZuXmlId(gesetz([norm('ohne', '229 5')]), '229 5')).toBe('ohne');
  });
  it('vergleicht vollständige Zahlen und Buchstabenzusätze', () => {
    const g = gesetz([norm('312', '§ 312'), norm('31a', '§ 31a'), norm('31', '§ 31')]);
    expect(verweisZuXmlId(g, '§ 31')).toBe('31');
    expect(verweisZuXmlId(g, '31a')).toBe('31a');
    expect(verweisZuXmlId(gesetz(g.elemente.slice(0, 2)), '§ 31')).toBeNull();
  });
  it.each(['Art. 31', 'Art 31', 'Artikel31', '  artikel  31 '])(
    'normalisiert %s ohne Präfixverlust',
    (text) => {
      const g = gesetz([norm('p', '§ 31'), norm('a', 'Artikel 31')]);
      expect(verweisZuXmlId(g, text)).toBe('a');
      expect(verweisZuXmlId(g, '31')).toBeNull();
      expect(verweisZuXmlId(g, '§ 31')).toBe('p');
    },
  );
  it('erhält Gliederungsartikel und erkennt volle sowie kurze Bezeichnungen', () => {
    const g = gesetz([
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-3', '§ 3'),
      norm('230', 'Art. 230', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('230-3', 'Art. 230 § 3'),
    ]);
    for (const text of ['Art. 229 § 3', '229 3']) expect(verweisZuXmlId(g, text)).toBe('229-3');
    expect(verweisZuXmlId(g, 'Artikel 229 § 3')).toBe('229-3');
    expect(verweisZuXmlId(g, '3')).toBeNull();
    expect(verweisZuXmlId(g, '§ 3')).toBeNull();
    expect(verweisZuXmlId(g, 'Art. 229')).toBe('229');
  });
  it.each(['Art. 246b § 12a', 'Art 246b § 12a', 'Art.  246b  § 12a', 'Art. 246b §12a'])(
    'löst %s mit vollständigem Artikelkontext und Buchstabenzusatz auf',
    (text) => {
      const g = gesetz([
        norm('artikel', 'Art. 246b', {
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          gliederungsEbene: 0,
        }),
        norm('ziel', '§ 12a'),
      ]);
      expect(verweisZuXmlId(g, text)).toBe('ziel');
    },
  );
  it('erkennt Erwägungsgründe nur mit passendem Flag und explizitem E', () => {
    const g = gesetz([
      norm('e250', 'E250', { art: 'erwaegungsgrund' }),
      norm('e25', 'E25', { art: 'erwaegungsgrund' }),
      norm('a', 'Art. 25'),
    ]);
    expect(verweisZuXmlId(g, ' e25 ')).toBe('e25');
    expect(verweisZuXmlId(g, '25')).toBe('a');
    expect(verweisZuXmlId(gesetz([norm('falsch', 'E25')]), 'E25')).toBeNull();
  });
  it.each(['', ' ', '§', '31 extra', '§§ 31', '31 2 3', '§ 31 Abs. 1'])(
    'weist unzulässige Eingabe %j zurück',
    (text) => {
      expect(verweisZuXmlId(gesetz([norm('n', '§ 31')]), text)).toBeNull();
    },
  );
  it('weist widersprüchliche und unpassende Normbezeichnungen zurück', () => {
    const g = gesetz([norm('p', '§ 31')]);
    for (const praefix of [['Art.'], ['Art.', '§'], ['§§'], ['unbekannt']])
      expect(verweisZuXmlId(g, `${praefix.join(' ')} § 31`)).toBeNull();
    expect(verweisZuXmlId(g, '31')).toBe('p');
    expect(verweisZuXmlId(g, '§ 31')).toBe('p');
  });
  it('weist mehrdeutige Einzelziele zurück', () => {
    expect(verweisZuXmlId(gesetz([norm('a', '§ 31'), norm('b', '§ 31')]), '§ 31')).toBeNull();
  });
  it('findet nur ausdrücklich enthaltene Zahlen weggefallener Zusammenfassungen', () => {
    const g = gesetz([norm('b', '§§ 3 bis 6', { status: 'weggefallen' })]);
    expect(verweisZuXmlId(g, '§ 3')).toBe('b');
    expect(verweisZuXmlId(g, '§ 6')).toBe('b');
    for (const text of ['§ 4', '§ 36', '§ 3a', 'Art. 3'])
      expect(verweisZuXmlId(g, text)).toBeNull();
    expect(verweisZuXmlId(gesetz([norm('b', '§§ 3 bis 6', { titel: 'Titel' })]), '§ 3')).toBeNull();
  });
  it('löst Zahlen textloser Zusammenfassungen ohne Weggefallen-Kennzeichnung auf', () => {
    const strich = [{ id: 'a', saetze: [{ id: 's', text: '-', eintraege: [] }] }];
    expect(verweisZuXmlId(gesetz([norm('b', '§§ 27 bis 30')]), '§ 28')).toBeNull();
    expect(verweisZuXmlId(gesetz([norm('b', '§§ 27 bis 30')]), '§ 27')).toBe('b');
    expect(verweisZuXmlId(gesetz([norm('b', '§§ 27 bis 30', { absaetze: strich })]), '§ 30')).toBe(
      'b',
    );
    expect(verweisZuXmlId(gesetz([norm('b', '§§ 27 bis 30')]), '§§ 27 bis 30')).toBe('b');
  });
  it('bevorzugt Einzelziele und weist gleichrangige Zusammenfassungen zurück', () => {
    const b = norm('b', '§§ 3, 6 und 8', { status: 'weggefallen' });
    expect(verweisZuXmlId(gesetz([b, norm('n', '§ 6')]), '§ 6')).toBe('n');
    expect(
      verweisZuXmlId(gesetz([b, norm('c', '§§ 6 bis 9', { status: 'weggefallen' })]), '§ 6'),
    ).toBeNull();
    expect(verweisZuXmlId(gesetz([b, norm('n', '§ 6'), norm('m', '§ 6')]), '§ 6')).toBeNull();
  });
  it('prüft bei Zusammenfassungen auch Artikelkontext und Präfix', () => {
    const g = gesetz([
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('b', '§§ 3 bis 6', { status: 'weggefallen' }),
    ]);
    expect(verweisZuXmlId(g, 'Art 229 § 6')).toBe('b');
    expect(verweisZuXmlId(g, 'Art. 230 § 6')).toBeNull();
  });
  it('erhält ausgeschriebene volle Sammelbezeichnungen', () => {
    const g = gesetz([
      norm('einzel', '§ 6'),
      norm('bereich', '§§ 3 bis 6', { status: 'weggefallen' }),
    ]);
    expect(verweisZuXmlId(g, '§§ 3 bis 6')).toBe('bereich');
    expect(verweisZuXmlId(g, '§§ 3 bis 4')).toBeNull();
    expect(verweisZuXmlId(g, '§§ 3 bis 6')).toBe('bereich');
    const artikel = norm('229', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 0,
    });
    expect(verweisZuXmlId(gesetz([artikel, g.elemente[1]!]), 'Artikel 229 §§ 3 bis 6')).toBe(
      'bereich',
    );
    expect(verweisZuXmlId(gesetz([artikel, g.elemente[1]!]), 'Artikel 230 §§ 3 bis 6')).toBeNull();
    expect(
      verweisZuXmlId(
        gesetz([g.elemente[1]!, norm('zweiter', '§§ 3 bis 6', { status: 'weggefallen' })]),
        '§§ 3 bis 6',
      ),
    ).toBeNull();
  });
  it('weist widersprüchlich bezeichnete Normen im Artikelkontext zurück', () => {
    const g = gesetz([
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('falsch', 'Art. 230 § 3'),
      norm('bereich', 'Art. 230 §§ 3 bis 6', { status: 'weggefallen' }),
    ]);
    expect(verweisZuXmlId(g, 'Art. 230 § 3')).toBeNull();
    expect(verweisZuXmlId(g, 'Art. 230 §§ 3 bis 6')).toBeNull();
  });
  it('weist in fremden Text eingebettete Verweise zurück', () => {
    const g = gesetz([norm('p', '§ 5'), norm('a', 'Art. 12')]);
    fc.assert(
      fc.property(
        fc.constantFrom('Vgl. ', 'Siehe ', 'X', 'Kommentar zu '),
        fc.constantFrom('Art. 5', 'Artikel 12', 'Art. 5 § 2', '§ 5', '§§ 3'),
        (vorspann, eingebettet) => {
          expect(verweisZuXmlId(g, `${vorspann}${eingebettet}`)).toBeNull();
        },
      ),
    );
  });
  it('ist unter beliebigen Kandidatenreihenfolgen invariant', () => {
    const kandidaten = [
      norm('312', '§ 312'),
      norm('31a', '§ 31a'),
      norm('31', '§ 31'),
      norm('art', 'Art. 31'),
      norm('b', '§§ 30, 31', { status: 'weggefallen' }),
    ];
    fc.assert(
      fc.property(
        fc.shuffledSubarray(kandidaten, {
          minLength: kandidaten.length,
          maxLength: kandidaten.length,
        }),
        (elemente) => {
          expect(verweisZuXmlId(gesetz(elemente), '§ 31')).toBe('31');
          expect(verweisZuXmlId(gesetz(elemente), '31')).toBeNull();
          expect(verweisZuXmlId(gesetz(elemente), '§ 30')).toBe('b');
        },
      ),
    );
  });
});

describe('Canon-Klickauflösung', () => {
  it.each([
    'Can. 8',
    'canon 8',
    'c. 8',
    'CAN.8',
    'Kan. 8',
    'Kanon 8',
    'cann. 8',
    'canons 8',
    'canones 8',
    'cc.8',
    'Kanones 8',
  ])('öffnet %s exakt', (text) => {
    const g = gesetz([norm('c8', 'Can.8'), norm('c90', 'Can. 90')]);
    expect(verweisZuXmlId(g, text)).toBe('c8');
    expect(verweisZuXmlId(g, 'Can. 8')).toBe('c8');
    expect(verweisZuXmlId(g, '8')).toBe('c8');
    expect(verweisZuXmlId(g, 'Can. 9')).toBeNull();
    expect(verweisZuXmlId(g, 'can 8')).toBeNull();
  });
  it('trennt Canon und Paragraph bei gleicher Zahl', () => {
    const g = gesetz([norm('p8', '§ 8'), norm('c8', 'Can. 8')]);
    expect(verweisZuXmlId(g, '8')).toBeNull();
    expect(verweisZuXmlId(g, 'Can. 8')).toBe('c8');
    expect(verweisZuXmlId(g, '§ 8')).toBe('p8');
  });
  it('ergänzt ein nur teilweise ausgeschriebenes Artikelpräfix anhand der Zielstruktur', () => {
    const g = gesetz([
      norm('a229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('p6', '§ 6'),
    ]);
    expect(verweisZuXmlId(g, 'Art. 229 § 6')).toBe('p6');
    expect(verweisZuXmlId(g, '§ 229 6')).toBeNull();
  });
});

it.each(['Artt', 'Artikels', 'Artikeln'])(
  'erweitert die Klickauflösung nicht um Artikel-Flexion %s',
  (praefix) => {
    expect(verweisZuXmlId(gesetz([norm('a8', 'Art. 8')]), `${praefix} 8`)).toBeNull();
  },
);

describe('gemeinsame strikte Zuordnung mit Trefferzählung', () => {
  it('erhält ausgeschriebene Sammelzahlen und ergänzt keine Zwischenzahlen', () => {
    const g = gesetz([norm('bereich', '§§ 3 bis 6', { status: 'weggefallen' })]);
    for (const bezeichnung of ['3', '6'])
      expect(loeseNormEindeutigAuf(g, `§ ${bezeichnung}`)).toMatchObject({
        norm: { xmlId: 'bereich' },
        anzahlTreffer: 1,
      });
    for (const bezeichnung of ['4', '5', '30'])
      expect(loeseNormEindeutigAuf(g, `§ ${bezeichnung}`)).toEqual({
        norm: undefined,
        anzahlTreffer: 0,
      });
    expect(loeseNormEindeutigAuf(g, '§§ 3 bis 6').norm?.xmlId).toBe('bereich');
    expect(loeseNormEindeutigAuf(g, '§§ 3 bis 6').norm?.xmlId).toBe('bereich');
  });
  it('zählt alle Kandidaten derselben maßgeblichen Verweisform, auch gleiche XML-IDs', () => {
    const n = norm('gleich', '§§ 3 bis 6', { status: 'weggefallen' });
    const g = gesetz([n, { ...n, data: { ...n.data } }]);
    expect(loeseNormEindeutigAuf(g, '§ 3')).toEqual({ norm: undefined, anzahlTreffer: 2 });
    expect(loeseNormEindeutigAuf(g, '§§ 3 bis 6')).toEqual({
      norm: undefined,
      anzahlTreffer: 2,
    });
    expect(loeseNormEindeutigAuf(gesetz([norm('p1', '§ 3'), norm('p2', '§ 3'), n]), '§ 3')).toEqual(
      { norm: undefined, anzahlTreffer: 2 },
    );
    expect(loeseNormEindeutigAuf(gesetz([norm('p1', '§ 3'), n]), '§ 3')).toMatchObject({
      norm: { xmlId: 'p1' },
      anzahlTreffer: 1,
    });
  });
  it('verwendet E-Flag und kanonische Artikel-/Canon-Präfixe auch für gespeicherte Normen', () => {
    expect(loeseNormEindeutigAuf(gesetz([norm('keinE', 'E25')]), 'E25').anzahlTreffer).toBe(0);
    const g = gesetz([
      norm('e', 'E25', { art: 'erwaegungsgrund' }),
      norm('a', 'Artikel 1'),
      norm('c', 'Can. 1'),
    ]);
    expect(loeseNormEindeutigAuf(g, 'E25').norm?.xmlId).toBe('e');
    for (const praefix of ['Art', 'Art.', 'Artikel'])
      expect(loeseNormEindeutigAuf(g, `${praefix} 1`).norm?.xmlId).toBe('a');
    for (const praefix of ['Can.', 'canon', 'c.', 'Kanon'])
      expect(loeseNormEindeutigAuf(g, `${praefix} 1`).norm?.xmlId).toBe('c');
    expect(loeseNormEindeutigAuf(g, '§ 1').anzahlTreffer).toBe(0);
    expect(loeseNormEindeutigAuf(g, '1').anzahlTreffer).toBe(2);
  });
});

it('ermittelt den Artikelkontext jedes konkreten Kandidaten auch bei gleichen XML-IDs', () => {
  const g = gesetz([
    norm('a229', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 0,
    }),
    norm('gleich', '§ 3'),
    norm('a230', 'Art. 230', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 0,
    }),
    norm('gleich', '§ 3'),
  ]);
  expect(loeseNormEindeutigAuf(g, 'Art. 229 § 3')).toMatchObject({ anzahlTreffer: 1 });
  expect(loeseNormEindeutigAuf(g, 'Art. 230 § 3')).toMatchObject({
    norm: g.elemente[3]!.data,
    anzahlTreffer: 1,
  });
});

it('löst mehrbuchstabige Normnummern weiterhin ausschließlich vollständig auf', () => {
  const g = gesetz([norm('ab', '§ 5ab'), norm('abc', '§ 5abc')]);
  expect(verweisZuXmlId(g, '§ 5ab')).toBe('ab');
  expect(verweisZuXmlId(g, '§ 5abc')).toBe('abc');
  expect(verweisZuXmlId(g, '§ 5a')).toBeNull();
  expect(verweisZuXmlId(g, '§ 5')).toBeNull();
  expect(verweisZuXmlId(gesetz([norm('abc', '§ 5abc')]), '§ 5ab')).toBeNull();
});

it('löst ein loses Ziel 6 nur eindeutig und die volle Bezeichnung § 6 gezielt auf', () => {
  const eindeutig = gesetz([norm('p6', '§ 6')]);
  const mehrdeutig = gesetz([norm('p6', '§ 6'), norm('a6', 'Art. 6')]);
  expect(verweisZuXmlId(eindeutig, '6')).toBe('p6');
  expect(verweisZuXmlId(mehrdeutig, '6')).toBeNull();
  expect(verweisZuXmlId(mehrdeutig, '§ 6')).toBe('p6');
});
it('öffnet weder Teiltreffer noch mehrfache exakte Treffer und erhält Präfixe wie Anhang', () => {
  const g = gesetz([
    norm('1010', '§ 1010'),
    norm('p', '§ 1'),
    norm('a', 'Anhang 1'),
    norm('p-doppelt', '§ 1'),
  ]);
  expect(verweisZuXmlId(g, '§ 1010')).toBe('1010');
  expect(verweisZuXmlId(g, 'Anhang 1')).toBe('a');
  expect(verweisZuXmlId(g, '101')).toBeNull();
  expect(verweisZuXmlId(g, '§ 1')).toBeNull();
  expect(verweisZuXmlId(g, '999')).toBeNull();
});

it('löst Protokollartikel vollständig auf und trennt sie von Konventionsartikeln', () => {
  const g = gesetz([
    norm('1', 'Artikel 1'),
    norm('1P1', 'Artikel 1P1'),
    norm('1P4', 'Artikel 1P4'),
  ]);
  expect(verweisZuXmlId(g, 'Art. 1P4')).toBe('1P4');
  expect(gleicheNormBezeichnung('Artikel 1P4', 'Art. 1P4')).toBe(true);
  expect(verweisZuXmlId(g, 'Art. 1')).toBe('1');
  expect(verweisZuXmlId(g, 'Art. 1,')).toBeNull();
});
