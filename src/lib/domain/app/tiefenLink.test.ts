// tiefenLink.test.ts
//
// Tests für tiefenLink.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// URL-Parsing-Logik – deckt die drei dokumentierten Formate, die defensiven
// Normalisierungen (trailing Slashes, Groß-/Kleinschreibung, Whitespace)
// und die Ablehnung von Queries ab.

import { describe, it, expect } from 'vitest';
import { parseTiefenLink } from './tiefenLink';
import vertraege from '@/test/plattform/native-vertraege.json';
import type { TiefenLinkZiel } from './tiefenLink';

describe('parseTiefenLink – die drei dokumentierten Formate', () => {
  it('Format 1: nur Gesetz ("lexlata://de-bund/BGB")', () => {
    expect(parseTiefenLink('lexlata://de-bund/BGB')).toEqual({
      kurztitel: 'BGB',
      normgeber: 'de-bund',
      bezeichnung: undefined,
    });
  });

  it('Format 2: Gesetz + Norm ("lexlata://de-bund/BGB/398")', () => {
    expect(parseTiefenLink('lexlata://de-bund/BGB/398')).toEqual({
      kurztitel: 'BGB',
      normgeber: 'de-bund',
      bezeichnung: '398',
    });
  });

  it('die richtige BGB-Adresse benennt Bund, BGB und Norm 1', () => {
    expect(parseTiefenLink('lexlata://de-bund/bgb/1')).toEqual({
      normgeber: 'de-bund',
      kurztitel: 'bgb',
      bezeichnung: '1',
    });
  });

  it('Format 3: Gliederungsartikel-Gesetz, zwei Segmente werden mit Leerzeichen verbunden ("lexlata://de-bund/EGBGB/249/3" → "249 3")', () => {
    expect(parseTiefenLink('lexlata://de-bund/EGBGB/249/3')).toEqual({
      kurztitel: 'EGBGB',
      normgeber: 'de-bund',
      bezeichnung: '249 3',
    });
  });
});

describe('parseTiefenLink – defensive Normalisierung', () => {
  it('toleriert einen einzelnen trailing Slash', () => {
    expect(parseTiefenLink('lexlata://de-bund/BGB/')).toEqual(
      expect.objectContaining({ kurztitel: 'BGB', bezeichnung: undefined }),
    );
  });

  it('toleriert MEHRERE trailing Slashes', () => {
    expect(parseTiefenLink('lexlata://de-bund/BGB///')).toEqual(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'de-bund' }),
    );
  });

  it('toleriert einen doppelten Slash MITTEN im Pfad ("bund//BGB")', () => {
    expect(parseTiefenLink('lexlata://de-bund//BGB')).toEqual(
      expect.objectContaining({ kurztitel: 'BGB', bezeichnung: undefined }),
    );
  });

  it('toleriert führenden/nachgestellten Whitespace um die gesamte URL', () => {
    expect(parseTiefenLink('  lexlata://de-bund/BGB  ')).toEqual(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'de-bund' }),
    );
  });

  it('Schema ist case-insensitiv ("LEXLATA://...")', () => {
    expect(parseTiefenLink('LEXLATA://de-bund/BGB')).toEqual(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'de-bund' }),
    );
  });

  it('das Normgeber ist ebenfalls case-insensitiv ("lexlata://Bund/BGB")', () => {
    expect(parseTiefenLink('lexlata://DE-Bund/BGB')).toEqual(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'de-bund' }),
    );
  });

  it('die Kurztitel selbst bleibt in ihrer ORIGINAL-Schreibung erhalten (keine Normalisierung dort)', () => {
    expect(parseTiefenLink('lexlata://de-bund/bgb')).toEqual(
      expect.objectContaining({ kurztitel: 'bgb', normgeber: 'de-bund' }),
    );
  });
});

describe('parseTiefenLink – ungültige/unvollständige URLs → null', () => {
  it('unzulässiger Normgeber → null', () => {
    expect(parseTiefenLink('lexlata://nicht_zulaessig/BGB')).toBeNull();
  });

  it('fehlende Kurztitel → null', () => {
    expect(parseTiefenLink('lexlata://bund')).toBeNull();
    expect(parseTiefenLink('lexlata://de-bund/')).toBeNull();
  });

  it('falsches Schema → null', () => {
    expect(parseTiefenLink('http://bund/BGB')).toBeNull();
  });

  it('weist auch ein um ein Zeichen verlängertes Schema zurück', () => {
    // Der Schema-Check muss vor der Aufteilung in Normgeber und Kurztitel greifen.
    expect(parseTiefenLink('xlexlata://de-bund/BGB')).toBeNull();
  });

  it('leerer String → null', () => {
    expect(parseTiefenLink('')).toBeNull();
  });

  it('nur Whitespace → null', () => {
    expect(parseTiefenLink('   ')).toBeNull();
  });
});

it.each([
  'lexlata://de-bund/BGB?keinFallback',
  'lexlata://de-bund/BGB/398?keinFallback',
  'lexlata://de-bund/BGB/?keinFallback',
])('weist Query-Marker zurück: %s', (url) => {
  expect(parseTiefenLink(url)).toBeNull();
});

describe('vollständige Referenz und URL-Segmente', () => {
  it('dekodiert jeden Abschnitt einzeln einschließlich Slash im Kurztitel', () => {
    expect(parseTiefenLink('lexlata://EU/A%2FB/%C2%A7%201')).toEqual({
      kurztitel: 'A/B',
      normgeber: 'eu',
      bezeichnung: '§ 1',
    });
  });
  it('erhält unbekannt als gewöhnlichen Normgeber', () => {
    expect((parseTiefenLink('lexlata://Unbekannt/BGB') as TiefenLinkZiel)?.normgeber).toBe(
      'unbekannt',
    );
  });
  it.each([
    'lexlata://de-bund/BGB/%XX',
    'lexlata://de-bund/BGB/1/2/3',
    'lexlata://de-bund/BGB?foo',
    'lexlata://de-bund/BGB#1',
  ])('lehnt unzulässige Segmente ab: %s', (url) => {
    expect(parseTiefenLink(url)).toBeNull();
  });
});

describe('öffentlicher Öffnen-Link', () => {
  it.each([
    ['433%20BGB', '433 BGB'],
    ['%C2%A7%201%20%C3%84%C3%96%C3%BC', '§ 1 ÄÖü'],
    ['A%2BB%2FC', 'A+B/C'],
    ['%2520', '%20'],
  ])('liest ein kodiertes Segment %s als genau einen Suchtext', (segment, suchtext) => {
    expect(parseTiefenLink(`lexlata://oeffnen/${segment}`)).toEqual({ type: 'oeffnen', suchtext });
  });
  it('erhält Schreibung, Pluszeichen und einmalige Dekodierung', () => {
    expect(parseTiefenLink('LEXLATA://OeFFnEn/433 BGB')).toEqual({
      type: 'oeffnen',
      suchtext: '433 BGB',
    });
    expect(parseTiefenLink('lexlata://oeffnen/A+B')).toEqual({ type: 'oeffnen', suchtext: 'A+B' });
    expect(parseTiefenLink('lexlata://oeffnen/%2520')).toEqual({
      type: 'oeffnen',
      suchtext: '%20',
    });
  });
  it.each([
    'lexlata://oeffnen',
    'lexlata://oeffnen/',
    'lexlata://oeffnen/%20',
    'lexlata://oeffnen/%XX',
    'lexlata://oeffnen/BGB/433',
    'lexlata://oeffnen/BGB/',
    'lexlata://oeffnen//BGB',
    'lexlata://oeffnen/BGB?keinFallback',
    'lexlata://oeffnen/BGB#x',
  ])('weist ungültigen Öffnen-Link zurück: %s', (url) => {
    expect(parseTiefenLink(url)).toBeNull();
  });
});

it('prüft den Parservertrag gemeinsam mit dem nativen OS-Empfänger', () => {
  for (const fall of vertraege.oeffnenLink.parser) {
    expect(parseTiefenLink(fall.url)).toEqual(
      fall.suchtext === null ? null : { type: 'oeffnen', suchtext: fall.suchtext },
    );
  }
});

it.each([
  'de-bund',
  'DE-Bund',
  'bund',
  'Bund' /* normgeber-link: Großschreibung ausschließlich in der Linkeingabe. */,
])('liest den Linkcode %s ohne Alias', (code) => {
  expect(parseTiefenLink(`lexlata://${code}/bgb/433`)).toMatchObject({
    normgeber: code.toLowerCase(),
    kurztitel: 'bgb',
    bezeichnung: '433',
  });
});
it.each(['de_bund', 'İ'])('lehnt den ungültigen Linkcode %s trotz Kleinschreibung ab', (code) => {
  expect(parseTiefenLink(`lexlata://${code}/bgb/433`)).toBeNull();
});
it('liest de-bw aus dem Link', () => {
  expect(parseTiefenLink('lexlata://de-bw/bgb/433')).toEqual({
    normgeber: 'de-bw',
    kurztitel: 'bgb',
    bezeichnung: '433',
  });
});

it('behandelt den früheren Befehl wie einen unbekannten Normgeber', () => {
  expect(parseTiefenLink('lexlata://suche/433%20BGB')).toEqual({
    normgeber: 'suche',
    kurztitel: '433 BGB',
    bezeichnung: undefined,
  });
});
