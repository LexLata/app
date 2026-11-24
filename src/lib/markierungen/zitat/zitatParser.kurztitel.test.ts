// Bekannte vollständige Kurztitel schützen Grammatikbestandteile und Originalspannen.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, expect, it, vi } from 'vitest';
import * as kurztitelVergleich from '@/lib/domain/kurztitelVergleich';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { kurztitelSuchformen, vergleicheKurztitel } from '@/lib/domain/kurztitelVergleich';
import type { Kurztitelbestand } from './zitatParser.kurztitel';
import { analysiereZitatZiele, parseZitat } from './zitatParser';
import { bereiteKurztitelsucheVor } from './zitatParser.kurztitel';
import { waehleGesetzeskandidat } from '@/lib/domain/gesetzesreferenz';

const leseBekanntenKurztitel = (text: string, start: number, kurztitel: Kurztitelbestand) =>
  bereiteKurztitelsucheVor(kurztitel)(text, start);

const bestand = Object.freeze([
  Object.freeze(gesetzesreferenz({ kurztitel: 'VO zu § 18 LHO' })),
  Object.freeze(gesetzesreferenz({ kurztitel: 'VO zu § 18' })),
  Object.freeze(gesetzesreferenz({ kurztitel: 'SGB\u00a0IV' })),
  Object.freeze(gesetzesreferenz({ kurztitel: 'Art. und Abs. 2 / Can. 3' })),
  Object.freeze(gesetzesreferenz({ kurztitel: 'BGB' })),
  Object.freeze(gesetzesreferenz({ kurztitel: 'EGBGB' })),
]);

describe('bekannte vollständige Kurztitel', () => {
  it.each([
    ['§ 5 VO zu § 18 LHO', ['5'], ['VO zu § 18 LHO']],
    ['VO zu § 18 LHO', [''], ['VO zu § 18 LHO']],
    ['VO zu § 18 LHO 6 BGB', ['', '6'], ['VO zu § 18 LHO', 'BGB']],
    ['§ 5 § 6 BGB', ['5', '6'], [undefined, 'BGB']],
    ['Art. 229 § 2 EGBGB', ['229 2'], ['EGBGB']],
    ['§ 5 VO zu, § 18 LHO', ['5', '18'], ['VO zu', 'LHO']],
    ['§ 5 VO zu; § 18 LHO', ['5', '18'], ['VO zu', 'LHO']],
    ['§ 5 VO zu § 18 LHO § 6 BGB', ['5', '6'], ['VO zu § 18 LHO', 'BGB']],
    ['§ 5 VO zu § 18 LHO 6 BGB', ['5', '6'], ['VO zu § 18 LHO', 'BGB']],
    ['§ 5 vo  zu\t§ 18\nLHO', ['5'], ['vo  zu\t§ 18\nLHO']],
    ['§ 5 SGB IV', ['5'], ['SGB IV']],
    ['§ 5 Art. und Abs. 2 / Can. 3', ['5'], ['Art. und Abs. 2 / Can. 3']],
  ])('%s', (text, zahlen, gesetze) => {
    for (const zitate of [
      parseZitat(text, undefined, bestand).zitate,
      analysiereZitatZiele(text, bestand),
    ]) {
      expect(zitate.map((z) => z.normzahlRoh)).toEqual(zahlen);
      expect(zitate.map((z) => z.gesetzRoh)).toEqual(gesetze);
      expect(zitate[0]?.textStart).toBe(0);
      expect(zitate.at(-1)?.textEnde).toBe(text.length);
      for (let i = 1; i < zitate.length; i++)
        expect(zitate[i]!.textStart).toBe(zitate[i - 1]!.textEnde);
    }
  });

  it('bloßer Kurztitel bezeichnet das ganze Gesetz', () => {
    expect(parseZitat('VO zu § 18 LHO', undefined, bestand).zitate[0]?.ganzesGesetz).toBe(true);
  });

  it('unbekannter vollständiger Titel behält gewöhnliche Normgrenzen', () => {
    expect(
      parseZitat('§ 5 VO zu § 18 LHO').zitate.map((z) => [z.normzahlRoh, z.gesetzRoh]),
    ).toEqual([
      ['5', 'VO zu'],
      ['18', 'LHO'],
    ]);
  });

  it.each(['VO zu § 18 LHOabc', 'VO zu § 18 LHO1', 'VO zu § 18 LHOä', 'VO zu § 18 LHO-abc'])(
    'erkennt keinen Wortanfang: %s',
    (text) => {
      const nurVollstaendig = [gesetzesreferenz({ kurztitel: 'VO zu § 18 LHO' })];
      expect(
        parseZitat(text, undefined, nurVollstaendig).zitate.some(
          (z) => z.gesetzRoh === 'VO zu § 18 LHO',
        ),
      ).toBe(false);
    },
  );

  it('Canon-Klassifizierung respektiert bekannte Grammatikwörter', () => {
    const titel = 'and';
    const zitate = parseZitat('can. 5 and', () => 'canon', [
      gesetzesreferenz({ kurztitel: titel }),
    ]).zitate;
    expect(zitate).toHaveLength(1);
    expect(zitate[0]).toMatchObject({ normzahlRoh: '5', gesetzRoh: titel, praefix: ['Can.'] });
  });

  it('erhält Schlusspunkt und nachfolgenden Text', () => {
    for (const titel of ['VO zu § 18 LHO', 'VO zu § 18 LHO.']) {
      const text = '§ 5 VO zu § 18 LHO. § 6 BGB';
      const zitate = parseZitat(text, undefined, [
        ...bestand,
        gesetzesreferenz({ kurztitel: titel }),
      ]).zitate;
      expect(zitate.map((z) => z.gesetzRoh)).toEqual(['VO zu § 18 LHO.', 'BGB']);
      expect(text.slice(zitate[0]!.textStart, zitate[0]!.textEnde)).toBe('§ 5 VO zu § 18 LHO. ');
    }
  });

  it.each(['VO zu, § 18 LHO', 'VO zu; § 18 LHO'])(
    'liest auch einen genau so bekannten Titel nicht über Trenner: %s',
    (titel) => {
      expect(
        leseBekanntenKurztitel(titel, 0, [gesetzesreferenz({ kurztitel: titel })]),
      ).toBeUndefined();
    },
  );

  it.each(['SGBIV', 'SGB-VI', 'SG IV'])(
    'entfernt keinen Leerraum und sucht nicht unscharf: %s',
    (titel) => {
      expect(leseBekanntenKurztitel(titel, 0, bestand)).toBeUndefined();
    },
  );

  it('bekannter Schlusspunkt erhält bei der Auflösung Vorrang vor der Form ohne Punkt', () => {
    const ohnePunkt = { kurztitel: 'VO zu § 18 LHO', normgeber: 'de-bund' };
    const mitPunkt = { kurztitel: 'VO zu § 18 LHO.', normgeber: 'de-bund' };
    const zitat = parseZitat('§ 5 vo zu § 18 lho.', undefined, [ohnePunkt, mitPunkt]).zitate[0]!;
    expect(zitat.gesetzRoh).toBe('vo zu § 18 lho.');
    expect(
      waehleGesetzeskandidat(zitat.gesetzRoh!, 'de-bund', [ohnePunkt, mitPunkt])?.referenz,
    ).toBe(mitPunkt);
    expect(waehleGesetzeskandidat(zitat.gesetzRoh!, 'de-bund', [ohnePunkt])?.referenz).toBe(
      ohnePunkt,
    );
  });
});

it('bekannter Kurztitel endet vor dem Zwischenraum zum folgenden Text', () => {
  expect(leseBekanntenKurztitel('BGB  X', 0, [gesetzesreferenz({ kurztitel: 'BGB' })])).toBe(3);
});

it.each(['', 'BGB', '§ 5 BGB', 'BGB X'])(
  'leerer Kurztitelbestand hat für %s keinen Treffer',
  (text) => {
    expect(leseBekanntenKurztitel(text, 0, [])).toBeUndefined();
  },
);

// Unveränderte Vorschau vor Phase 1 als unabhängige Verhaltensreferenz.
function alteVorschau(text: string, start: number, kandidaten: Kurztitelbestand) {
  const rest = text.slice(start).split(/[,;]/, 1)[0]!;
  let treffer: number | undefined;
  for (let ende = 1; ende <= rest.length; ende++) {
    if (/\s/.test(rest.charAt(ende - 1)) || /[\p{L}\p{N}_–—-]/u.test(rest.charAt(ende))) continue;
    if (
      kurztitelSuchformen(rest.slice(0, ende)).some((form) =>
        kandidaten.some((kandidat) => vergleicheKurztitel(form, kandidat.kurztitel) !== undefined),
      )
    )
      treffer = start + ende;
  }
  return treffer;
}

it('entspricht der alten Vorschau auch mit Kollisionen, Unicode und wechselndem Leerraum', () => {
  const zeichen = fc.constantFrom(
    'A',
    'a',
    'B',
    'b',
    'İ',
    'Σ',
    'Ο',
    'ß',
    'ä',
    '1',
    '_',
    '-',
    '–',
    '—',
    '.',
    '/',
    '§',
    ',',
    ';',
    ' ',
    '\t',
    '\n',
    '\u00a0',
  );
  const text = fc.array(zeichen, { maxLength: 35 }).map((teile) => teile.join(''));
  fc.assert(
    fc.property(text, fc.array(text, { maxLength: 8 }), fc.nat(), (eingabe, titel, position) => {
      const start = position % (eingabe.length + 1);
      const kandidaten = Object.freeze(
        [
          ...titel,
          eingabe.slice(start),
          eingabe.slice(start).trim(),
          eingabe.slice(start, start + 3),
        ].map((kurztitel) => Object.freeze({ kurztitel })),
      );
      expect(leseBekanntenKurztitel(eingabe, start, kandidaten)).toBe(
        alteVorschau(eingabe, start, kandidaten),
      );
    }),
    { seed: 20261011, numRuns: 1000 },
  );
});

it.each(['BGB .', 'BGB\t.', 'BGB\u00a0.'])(
  'erhält den Schlusspunktfallback mit Leerraum vor dem Punkt: %j',
  (text) => {
    expect(leseBekanntenKurztitel(text, 0, [gesetzesreferenz({ kurztitel: 'BGB' })])).toBe(
      text.length,
    );
  },
);

function ressourcenbestand() {
  return Object.freeze(
    ['de-bund.xml', 'de-bw.xml'].flatMap((datei) => {
      const xml = readFileSync(`src-tauri/resources/importindizes/${datei}`, 'utf8');
      return Array.from(
        new DOMParser()
          .parseFromString(xml, 'text/xml')
          .querySelectorAll('importindex > inhalt > gesetz > kurztitel'),
      ).map((el) => Object.freeze(gesetzesreferenz({ kurztitel: el.textContent!.trim() })));
    }),
  );
}

it.each([5, 10])(
  'analysiert %i Wiederholungen mit vollständigem Bestand und Profilabfrage zügig',
  (wiederholungen) => {
    const kandidaten = ressourcenbestand();
    expect(kandidaten.length).toBeGreaterThan(0);
    const text = Array<string>(wiederholungen).fill('§ 5 Abs. 1 und 2 BGB').join(' und ');
    expect(text.length).toBe(wiederholungen === 5 ? 120 : 245);
    const start = performance.now();
    const ergebnis = parseZitat(text, () => 'paragraph', kandidaten);
    const dauer = performance.now() - start;
    console.info(
      `Kurztitelsuche: ${text.length} Zeichen, ${kandidaten.length} Titel, ${dauer.toFixed(2)} ms`,
    );
    expect(ergebnis.zitate.map((z) => z.gesetzRoh)).toEqual(
      Array<string>(wiederholungen * 2).fill('BGB'),
    );
    expect(dauer).toBeLessThan(2000);
  },
  30000,
);

it('liest den Bestand je Analyselauf einmal, auch mit Profilabfrage und vielen Wortanfängen', () => {
  let gelesen = 0;
  const kandidaten = Object.freeze([
    Object.freeze({
      get kurztitel() {
        gelesen++;
        return 'BGB';
      },
    }),
    Object.freeze({
      get kurztitel() {
        gelesen++;
        return 'SGB IV';
      },
    }),
  ]);
  const text = Array<string>(10).fill('§ 5 Abs. 1 und 2 BGB').join(' und ');
  parseZitat(text, () => 'paragraph', kandidaten);
  expect(gelesen).toBe(2);
});

it('begrenzt die Sucharbeit auch vor einem sehr langen unbekannten Wort', () => {
  const normalisierung = vi.spyOn(kurztitelVergleich, 'normalisiereKurztitelSuchform');
  try {
    const text = `BGB ${'X'.repeat(20000)}`;
    expect(leseBekanntenKurztitel(text, 0, [gesetzesreferenz({ kurztitel: 'BGB' })])).toBe(3);
    // Ein kurzer Bestand benötigt nur eine kurze Vorschau, unabhängig von
    // der Länge des unbekannten Folgeworts. Großzügiges Arbeitsbudget.
    expect(normalisierung.mock.calls.length).toBeLessThan(12);
  } finally {
    normalisierung.mockRestore();
  }
});
