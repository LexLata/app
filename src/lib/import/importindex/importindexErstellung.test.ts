// importindexErstellung.test.ts
//
// Tests für sortiereUndMarkiereDuplikate (bisher ungetestet), geschrieben im
// Zuge der Cognitive-Complexity-Reduktion von bearbeiteGruppe (siehe dortige
// Extraktion in entferneExakteDuplikate/wendeEGKombiRegelAn/
// versucheEGKombiMitVorhandenen/markiereUnaufgeloesteDuplikate). Deckt die
// drei Konfliktregeln ab (siehe Kopfkommentar zu bearbeiteGruppe in
// importindexErstellung.ts) sowie die BW-spezifischen Zusatz-/Kollisions- und
// Korrektur-Mechanismen von sortiereUndMarkiereDuplikate selbst.

import { SaxesParser } from 'saxes';
import { validiereImportindex, parseImportindex } from './importindexValidierung';
import fc from 'fast-check';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  sortiereUndMarkiereDuplikate,
  serialisiereImportindex,
  type ImportindexEintrag,
  type ImportindexErstellungErgebnis,
} from './importindexErstellung';

function eintrag(kurztitel: string, langtitel: string, abrufkennung: string): ImportindexEintrag {
  return { kurztitel, langtitel, abrufkennung };
}

describe('sortiereUndMarkiereDuplikate – Kurztitel-Kollisionen', () => {
  it('markiert zwei gekürzte BW-Kurztitel gegenseitig', () => {
    const result = sortiereUndMarkiereDuplikate([
      eintrag('VwG BW 2008', 'Fassung 2008', 'a'),
      eintrag('VwG BW 2010', 'Fassung 2010', 'b'),
    ]);
    expect(result.map((e) => [e.kurztitel, e.kurztitelDuplikat])).toEqual([
      ['VwG', 'b'],
      ['VwG', 'a'],
    ]);
  });

  it('vergleicht case-insensitiv und markiert nur den Eintrag mit BW-Zusatz', () => {
    const result = sortiereUndMarkiereDuplikate([
      eintrag('VwG BW 2008', 'Fassung 2008', 'a'),
      eintrag('vwg', 'Ohne Zusatz', 'b'),
    ]);
    expect(result.map((e) => e.kurztitelDuplikat)).toEqual(['b', undefined]);
  });

  it('behält verschiedene Fassungen mit gleichem Link ohne Kurztitel-Kollision', () => {
    const result = sortiereUndMarkiereDuplikate(
      [eintrag('VwG BW 2008', 'Fassung 2008', 'a'), eintrag('VwG BW 2010', 'Fassung 2010', 'a')],
      undefined,
      false,
    );
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.kurztitelDuplikat)).toEqual([undefined, undefined]);
  });

  it('wählt den ersten zulässigen Kandidaten nach der Sortierung', () => {
    const result = sortiereUndMarkiereDuplikate([
      eintrag('VwG BW 2012', 'Dritte Fassung', 'c'),
      eintrag('VwG BW 2010', 'Zweite Fassung', 'b'),
      eintrag('VwG BW 2008', 'Erste Fassung', 'a'),
    ]);
    expect(result.map((e) => [e.abrufkennung, e.kurztitelDuplikat])).toEqual([
      ['a', 'b'],
      ['b', 'a'],
      ['c', 'a'],
    ]);
  });

  it('überspringt viele Fassungen desselben Links und wählt den ersten anderen Link', () => {
    const fassungen = Array.from({ length: 100 }, (_, i) =>
      eintrag(`VwG BW ${2000 + i}`, `Fassung ${i}`, 'a'),
    );
    const ohneKollision = sortiereUndMarkiereDuplikate(fassungen, undefined, false);
    expect(ohneKollision).toHaveLength(100);
    expect(ohneKollision.every((e) => e.kurztitelDuplikat === undefined)).toBe(true);
    const mitKollision = sortiereUndMarkiereDuplikate(
      [eintrag('VwG BW 2200', 'Andere Fassung', 'b'), ...fassungen],
      undefined,
      false,
    );
    expect(mitKollision).toHaveLength(101);
    expect(mitKollision.slice(0, 100).every((e) => e.kurztitelDuplikat === 'b')).toBe(true);
    expect(mitKollision[100]!.kurztitelDuplikat).toBe('a');
  });

  it('entspricht der bisherigen find-Regel nach gleicher Sortierung und Bereinigung', () => {
    const eintraege = fc.array(
      fc.record({
        kurztitel: fc.constantFrom(
          'VwG BW 2008',
          'vwg BW 2010',
          'VwG',
          'vwg',
          'PolG BW 2009',
          'PolG',
        ),
        langtitel: fc.constantFrom('Fassung A', 'Fassung B', 'Fassung C'),
        abrufkennung: fc.constantFrom('a', 'b', 'c'),
      }),
      { maxLength: 80 },
    );
    fc.assert(
      fc.property(eintraege, fc.boolean(), (eingabe, permalinkEindeutig) => {
        const result = sortiereUndMarkiereDuplikate(eingabe, undefined, permalinkEindeutig);
        // Die unveränderte Vorverarbeitung liefert die gemeinsame Listenreihenfolge.
        // Das Oracle berechnet die Markierung unabhängig mit der bisherigen Regel.
        const erwartet = result.map((eintrag) => {
          if (eintrag.kurztitelBwZusatz === undefined) return undefined;
          return result.find(
            (andere) =>
              andere !== eintrag &&
              andere.abrufkennung !== eintrag.abrufkennung &&
              andere.kurztitel.toLowerCase() === eintrag.kurztitel.toLowerCase(),
          )?.abrufkennung;
        });
        expect(result.map((e) => e.kurztitelDuplikat)).toEqual(erwartet);
      }),
    );
  });
});

describe('serialisiereImportindex', () => {
  it('schreibt version="1" am Wurzel-Tag', () => {
    expect(serialisiereImportindex([], 'de-bund')).toContain('<importindex version="1">');
  });
});

describe('ImportindexErstellungErgebnis', () => {
  it('bildet Erfolg und Fehler als eindeutige Varianten ab', () => {
    const erfolg: ImportindexErstellungErgebnis = { erfolg: true, anzahl: 3 };
    const fehler: ImportindexErstellungErgebnis = { erfolg: false, fehler: 'Abgebrochen.' };

    expect(erfolg).toEqual({ erfolg: true, anzahl: 3 });
    expect(fehler).toEqual({ erfolg: false, fehler: 'Abgebrochen.' });
    expectTypeOf<{ erfolg: true }>().not.toMatchTypeOf<ImportindexErstellungErgebnis>();
    expectTypeOf<{ erfolg: false }>().not.toMatchTypeOf<ImportindexErstellungErgebnis>();
  });
});

describe('sortiereUndMarkiereDuplikate – Regel 1 (exakte Duplikate)', () => {
  it('entfernt einen exakten Duplikat-Eintrag (gleicher kurztitel + langtitel + abrufkennung) ersatzlos', () => {
    const result = sortiereUndMarkiereDuplikate([
      eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1'),
      eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1'),
    ]);
    expect(result).toEqual([eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1')]);
  });

  it('lässt Einträge mit identischem abrufkennung aber unterschiedlichem kurztitel/langtitel unangetastet stehen (kein exaktes Duplikat)', () => {
    const result = sortiereUndMarkiereDuplikate([
      eintrag('StGB', 'Strafgesetzbuch', 'L1'),
      eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1'),
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('sortiereUndMarkiereDuplikate – Regel 2 (EG-Kombination)', () => {
  it('permalinkEindeutig=true: die "EG..."-Variante bleibt erhalten und trägt duplikatVon/duplikatArt="eg", die andere verschwindet', () => {
    const result = sortiereUndMarkiereDuplikate(
      [eintrag('EGBGB', 'X', 'L2'), eintrag('BGBEG', 'X', 'L2')],
      undefined,
      true,
    );
    expect(result).toEqual([
      {
        kurztitel: 'EGBGB',
        langtitel: 'X',
        abrufkennung: 'L2',
        duplikatVon: 'BGBEG',
        duplikatArt: 'eg',
      },
    ]);
  });

  it('permalinkEindeutig=false (BW): Regel 2 wird übersprungen, beide Einträge bleiben – Fallback markiert stattdessen unaufgeloest', () => {
    const result = sortiereUndMarkiereDuplikate(
      [eintrag('EGBGB', 'X', 'L2'), eintrag('BGBEG', 'X', 'L2')],
      undefined,
      false,
    );
    expect(result).toEqual([
      { kurztitel: 'BGBEG', langtitel: 'X', abrufkennung: 'L2' },
      {
        kurztitel: 'EGBGB',
        langtitel: 'X',
        abrufkennung: 'L2',
        duplikatVon: 'BGBEG',
        duplikatArt: 'unaufgeloest',
      },
    ]);
  });

  it('greift NICHT, wenn der langtitel unterschiedlich ist (auch bei EG-Präfix/-Suffix)', () => {
    const result = sortiereUndMarkiereDuplikate(
      [eintrag('EGBGB', 'X', 'L2'), eintrag('BGBEG', 'Y', 'L2')],
      undefined,
      true,
    );
    // kein eg-Match -> Fallback greift stattdessen (siehe nächste Gruppe)
    expect(result.map((e) => e.duplikatArt)).toEqual([undefined, 'unaufgeloest']);
  });
});

describe('sortiereUndMarkiereDuplikate – Fallback (unaufgeloest)', () => {
  it('markiert verbleibende Mehrfacheinträge einer Gruppe pauschal auf den ersten (alphabetisch sortierten) Eintrag bezogen', () => {
    const result = sortiereUndMarkiereDuplikate(
      [eintrag('B', 'Y', 'L3'), eintrag('A', 'X', 'L3')],
      undefined,
      true,
    );
    expect(result).toEqual([
      eintrag('A', 'X', 'L3'),
      {
        kurztitel: 'B',
        langtitel: 'Y',
        abrufkennung: 'L3',
        duplikatVon: 'A',
        duplikatArt: 'unaufgeloest',
      },
    ]);
  });

  it('mehr als zwei Einträge in einer Gruppe: alle außer dem ersten werden markiert', () => {
    const result = sortiereUndMarkiereDuplikate(
      [eintrag('C', 'Z', 'L4'), eintrag('A', 'X', 'L4'), eintrag('B', 'Y', 'L4')],
      undefined,
      true,
    );
    expect(result.map((e) => e.kurztitel)).toEqual(['A', 'B', 'C']);
    expect(result[0]!.duplikatVon).toBeUndefined();
    expect(result[1]).toMatchObject({ duplikatVon: 'A', duplikatArt: 'unaufgeloest' });
    expect(result[2]).toMatchObject({ duplikatVon: 'A', duplikatArt: 'unaufgeloest' });
  });
});

describe('sortiereUndMarkiereDuplikate – Sortierung und mehrere Gruppen', () => {
  it('sortiert das Gesamtergebnis primär nach abrufkennung, sekundär nach kurztitel', () => {
    const result = sortiereUndMarkiereDuplikate([
      eintrag('Z', 'Z-Gesetz', 'L9'),
      eintrag('A', 'A-Gesetz', 'L1'),
    ]);
    expect(result.map((e) => e.kurztitel)).toEqual(['A', 'Z']);
  });

  it('verarbeitet mehrere unabhängige Link-Gruppen getrennt', () => {
    const result = sortiereUndMarkiereDuplikate([
      eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1'),
      eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1'), // exaktes Duplikat in Gruppe L1
      eintrag('StGB', 'Strafgesetzbuch', 'L2'),
    ]);
    expect(result).toEqual([
      eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1'),
      eintrag('StGB', 'Strafgesetzbuch', 'L2'),
    ]);
  });
});

it('serialisiert wohlgeformte Index-XML mit UTC-Verarbeitungszeit', () => {
  const xml = serialisiereImportindex([eintrag('BGB', 'Bürgerliches Gesetzbuch', 'L1')], 'de-bund');
  pruefeXmlWohlgeformtheit(xml);
  expect(xml).toMatch(
    /<verarbeitungszeit herkunft="nutzer">\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>/,
  );
});

it.each(['eg', 'unaufgeloest'] as const)('serialisiert feste Duplikatattribute für %s', (art) => {
  const xml = serialisiereImportindex(
    [{ ...eintrag('EG', 'Titel', 'L1'), duplikatArt: art, duplikatVon: 'A&B' }],
    'de-bund',
  );
  pruefeXmlWohlgeformtheit(xml);
  const gesetz = new DOMParser().parseFromString(xml, 'text/xml').querySelector('gesetz')!;
  expect(gesetz.getAttribute('duplikatArt')).toBe(art);
  const parser = new SaxesParser();
  parser.on('opentag', (tag) => {
    if (tag.name === 'gesetz') expect(tag.attributes.duplikatVon).toBe('A&B');
  });
  parser.write(xml).close();
  expect(gesetz.hasAttribute('duplikat')).toBe(false);
  expect(gesetz.hasAttribute('duplikatEG')).toBe(false);
});

it('erhält einen ausdrücklich gesetzten leeren Duplikatverweis', () => {
  const xml = serialisiereImportindex(
    [{ ...eintrag('BGB', 'Titel', 'L1'), duplikatVon: '' }],
    'de-bund',
  );
  expect(xml).toContain('duplikatArt="unaufgeloest" duplikatVon=""');
});

it.each(['nutzer', 'standard'] as const)(
  'schreibt Infos und unveränderte Einträge mit Herkunft %s',
  (herkunft) => {
    const eintraege = [
      eintrag('BGB', 'Bürgerliches Gesetzbuch', 'https://example.test/bgb?a=1&b=2'),
    ];
    const xml = serialisiereImportindex(eintraege, 'de-bund', herkunft);
    const { doc, kategorie } = validiereImportindex(xml);
    const root = doc.documentElement;
    expect(Array.from(root.children).map((el) => el.tagName)).toEqual(['infos', 'inhalt']);
    const infos = root.children[0]!;
    expect(Array.from(infos.children).map((el) => el.tagName)).toEqual([
      'verarbeitungszeit',
      'normgeber',
      'datenquelle',
    ]);
    expect(infos.children[0]!.getAttribute('herkunft')).toBe(herkunft);
    expect(infos.querySelector('datenquelle')?.getAttribute('name')).toBe('Gesetze im Internet');
    expect(kategorie).toBe('de-bund');
    expect(parseImportindex(xml)).toEqual(eintraege);
  },
);
