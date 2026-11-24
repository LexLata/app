// praefixstrukturXml.test.ts
// Tolerantes Lesen, kanonisches Schreiben und unveränderte Verarbeitungszeit.
import { expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { liesPraefixstrukturXml, schreibePraefixstrukturXml } from './praefixstrukturXml';
const zeit = new Date('2026-10-13T10:00:00Z');
const xml = (inhalt = '<gesetz>BGB</gesetz>', normgeber = 'de-bund') =>
  `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-13T10:00:00Z</verarbeitungszeit><normgeber>${normgeber}</normgeber></infos><inhalt>${inhalt}</inhalt></praefixstrukturen>`;
it('erhält Diagnosegründe und ändert die Zeit auch bei reiner Diagnoseänderung', () => {
  const eintraege = [
    {
      kurztitel: 'Test',
      praefixstruktur: 'unklar' as const,
      diagnosegrund: 'unbezeichnete-normen' as const,
    },
  ];
  const alt = xml('<gesetz praefixstruktur="unklar">Test</gesetz>');
  const neuzeit = new Date('2026-10-18T12:00:00Z');
  const neu = schreibePraefixstrukturXml('de-bund', eintraege, neuzeit, alt);
  expect(neu).toContain('diagnosegrund="unbezeichnete-normen"');
  expect(liesPraefixstrukturXml(neu, 'de-bund')).toMatchObject({
    eintraege,
    verarbeitungszeit: neuzeit,
  });
  expect(schreibePraefixstrukturXml('de-bund', eintraege, new Date(), neu)).toBe(neu);
});
it('verwirft Diagnosegründe an eindeutigen Einträgen beim Schreiben', () => {
  expect(() =>
    schreibePraefixstrukturXml(
      'de-bund',
      [{ kurztitel: 'G', praefixstruktur: 'paragraph', diagnosegrund: 'keine-elemente' }],
      zeit,
    ),
  ).toThrow();
});
it('meldet unbekannte oder unpassende Diagnoseangaben beim toleranten Lesen', () => {
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(
      liesPraefixstrukturXml(
        xml(
          '<gesetz praefixstruktur="unklar" diagnosegrund="neu">A</gesetz><gesetz diagnosegrund="keine-elemente">B</gesetz>',
        ),
        'de-bund',
      ).eintraege,
    ).toEqual([
      { kurztitel: 'A', praefixstruktur: 'unklar' },
      { kurztitel: 'B', praefixstruktur: 'paragraph' },
    ]);
    expect(warnung).toHaveBeenCalledTimes(2);
  } finally {
    warnung.mockRestore();
  }
});
it.each(['de-bund', 'de-bw'] as const)(
  'erhält roemisch als Dateneinordnung für %s',
  (normgeber) => {
    const eintraege = [{ kurztitel: 'Test', praefixstruktur: 'roemisch' as const }];
    const ausgabe = schreibePraefixstrukturXml(normgeber, eintraege, zeit);
    expect(ausgabe).toContain('praefixstruktur="roemisch"');
    expect(liesPraefixstrukturXml(ausgabe, normgeber).eintraege).toEqual(eintraege);
  },
);
it('schreibt sortiert, maskiert Sonderzeichen und lässt den Standard ohne Attribut', () => {
  const ausgabe = schreibePraefixstrukturXml(
    'de-bund',
    [
      { kurztitel: 'GG', praefixstruktur: 'artikel' },
      { kurztitel: 'B & <G>', praefixstruktur: 'paragraph' },
    ],
    zeit,
  );
  expect(ausgabe).toContain('<gesetz>B &amp; &lt;G&gt;</gesetz>');
  expect(ausgabe.indexOf('B &amp;')).toBeLessThan(ausgabe.indexOf('>GG<'));
  expect(liesPraefixstrukturXml(ausgabe, 'de-bund').eintraege).toEqual([
    { kurztitel: 'B & <G>', praefixstruktur: 'paragraph' },
    { kurztitel: 'GG', praefixstruktur: 'artikel' },
  ]);
});
it('erhält die Zeit nur bei gleichem Inhalt und gleichem Normgeber', () => {
  const alt = xml();
  const eintraege = liesPraefixstrukturXml(alt, 'de-bund').eintraege;
  expect(
    liesPraefixstrukturXml(
      schreibePraefixstrukturXml('de-bund', eintraege, new Date('2026-10-15T12:00:00Z'), alt),
      'de-bund',
    ).verarbeitungszeit,
  ).toEqual(zeit);
  expect(
    liesPraefixstrukturXml(
      schreibePraefixstrukturXml(
        'de-bund',
        [...eintraege, { kurztitel: 'GG', praefixstruktur: 'artikel' }],
        new Date('2026-10-15T12:00:00Z'),
        alt,
      ),
      'de-bund',
    ).verarbeitungszeit,
  ).not.toEqual(zeit);
});
it('warnt bei unbekanntem Wert und Duplikat; erster gilt, leerer Titel entfällt', () => {
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(
      liesPraefixstrukturXml(
        xml('<gesetz praefixstruktur="neu">GG</gesetz><gesetz>gg</gesetz><gesetz> </gesetz>'),
        'de-bund',
      ).eintraege,
    ).toEqual([{ kurztitel: 'GG', praefixstruktur: 'unklar' }]);
    expect(warnung).toHaveBeenCalledTimes(2);
  } finally {
    warnung.mockRestore();
  }
});
it.each([
  xml().replace('version="1"', 'version="2"'),
  xml('', 'de-bw'),
  xml().replace('<normgeber>de-bund</normgeber>', ''),
  xml().replace('2026-10-13T10:00:00Z', 'kein Datum'),
  xml('<gesetz praefixstruktur="gliederungsartikel">G</gesetz>', 'de-bw'),
  '<praefixstrukturen>',
])('verwirft ungültige Datei', (quelle) =>
  expect(() =>
    liesPraefixstrukturXml(quelle, quelle.includes('gliederungsartikel') ? 'de-bw' : 'de-bund'),
  ).toThrow(),
);
it('liest nur direkte Kinder', () => {
  expect(
    liesPraefixstrukturXml(xml('<neu><gesetz>X</gesetz></neu><gesetz>G</gesetz>'), 'de-bund')
      .eintraege,
  ).toHaveLength(1);
});
it('ist mit Sonderzeichen rundlauffähig', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('a', 'Ä', '&', '<', '>', '"', "'", 'ß'), {
        minLength: 1,
        maxLength: 30,
      }),
      (zeichen) => {
        const kurztitel = zeichen.join('');
        const ausgabe = schreibePraefixstrukturXml(
          'de-bund',
          [{ kurztitel, praefixstruktur: 'unklar' }],
          zeit,
        );
        expect(liesPraefixstrukturXml(ausgabe, 'de-bund').eintraege).toEqual([
          { kurztitel, praefixstruktur: 'unklar' },
        ]);
      },
    ),
  );
});
it('vergleicht Inhalte unabhängig von Eingabe- und Eigenschaftsreihenfolge', () => {
  const alt = schreibePraefixstrukturXml(
    'de-bund',
    [
      { kurztitel: 'GG', praefixstruktur: 'artikel' },
      { kurztitel: 'BGB', praefixstruktur: 'paragraph' },
    ],
    zeit,
  );
  const neu = schreibePraefixstrukturXml(
    'de-bund',
    [
      { praefixstruktur: 'paragraph', kurztitel: 'BGB' },
      { praefixstruktur: 'artikel', kurztitel: 'GG' },
    ],
    new Date('2026-10-15T12:00:00Z'),
    alt,
  );
  expect(neu).toBe(alt);
});

it('liest Fehlerstatus vor dem impliziten Paragraphenstandard und schreibt ihn ohne Befund', () => {
  const fehler = {
    kurztitel: 'G',
    ermittlungsstatus: 'gescheitert' as const,
    fehlerart: 'identifikation' as const,
  };
  const gespeichert = schreibePraefixstrukturXml('de-bund', [fehler], zeit);
  expect(gespeichert).not.toContain('praefixstruktur=');
  expect(liesPraefixstrukturXml(gespeichert, 'de-bund').eintraege).toEqual([fehler]);
  expect(() =>
    liesPraefixstrukturXml(xml('<gesetz ermittlungsstatus="gescheitert">G</gesetz>'), 'de-bund'),
  ).toThrow();
});

it.each(['ohne-praefix', 'artikel-und-paragraphen'] as const)(
  'erhält %s beim Lesen und Schreiben',
  (praefixstruktur) => {
    const eintraege = [{ kurztitel: 'G', praefixstruktur }];
    expect(
      liesPraefixstrukturXml(schreibePraefixstrukturXml('de-bw', eintraege, zeit), 'de-bw')
        .eintraege,
    ).toEqual(eintraege);
  },
);

it('liest und schreibt den geprüften Leerbefund ohne Präfixstruktur oder Fehlerart', () => {
  const eintraege = [{ kurztitel: 'Leer', ermittlungsstatus: 'leer' as const }];
  const ausgabe = schreibePraefixstrukturXml('de-bund', eintraege, zeit);
  expect(ausgabe).toContain('<gesetz ermittlungsstatus="leer">Leer</gesetz>');
  expect(liesPraefixstrukturXml(ausgabe, 'de-bund').eintraege).toEqual(eintraege);
  for (const attribut of [
    'praefixstruktur="artikel"',
    'fehlerart="gesetz-laden"',
    'diagnosegrund="keine-elemente"',
  ]) {
    expect(() =>
      liesPraefixstrukturXml(
        xml(`<gesetz ermittlungsstatus="leer" ${attribut}>Leer</gesetz>`),
        'de-bund',
      ),
    ).toThrow();
  }
});

it.each(['arabisch', 'alphabetisch'] as const)(
  'erhält %s beim Schreiben und Lesen für beide Normgeber',
  (praefixstruktur) => {
    for (const normgeber of ['de-bund', 'de-bw'] as const) {
      const eintraege = [{ kurztitel: 'Test', praefixstruktur }];
      const ausgabe = schreibePraefixstrukturXml(
        normgeber,
        eintraege,
        new Date('2026-10-18T00:00:00Z'),
      );
      expect(liesPraefixstrukturXml(ausgabe, normgeber).eintraege).toEqual(eintraege);
    }
  },
);

it('lehnt alten Normgeber in einer Präfixliste ab', () => {
  const xml =
    '<praefixstrukturen version="1"><infos><normgeber>Bund</normgeber><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit></infos><inhalt/></praefixstrukturen>'; // normgeber-negativ: alter Code in Präfixliste.
  expect(() => liesPraefixstrukturXml(xml, 'de-bund')).toThrow('Normgeber');
});

it('liest ohne-praefix und behandelt den früheren Wert wie einen unbekannten Wert', () => {
  expect(
    liesPraefixstrukturXml(xml('<gesetz praefixstruktur="ohne-praefix">G</gesetz>'), 'de-bund')
      .eintraege,
  ).toEqual([{ kurztitel: 'G', praefixstruktur: 'ohne-praefix' }]);
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(
      liesPraefixstrukturXml(xml('<gesetz praefixstruktur="ohnepraefix">G</gesetz>'), 'de-bund')
        .eintraege,
    ).toEqual([{ kurztitel: 'G', praefixstruktur: 'unklar' }]);
    expect(warnung).toHaveBeenCalledOnce();
  } finally {
    warnung.mockRestore();
  }
});
