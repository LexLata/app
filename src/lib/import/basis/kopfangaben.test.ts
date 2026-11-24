// @vitest-environment jsdom
// kopfangaben.test.ts
// Kopfangaben bleiben über die öffentlichen XML-Schnittstellen erhalten.
import { expect, it } from 'vitest';
import { baueGesetzesXML } from './basis.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetz.index';
import type { GesetzInfos } from '@/lib/domain/gesetzInfos';
import { formatAusfertigung } from '@/lib/utils/datumFormat';

it.each<NonNullable<GesetzInfos['fassung']>>([
  { art: 'konsolidiert' },
  { art: 'konsolidiert', stichtag: '2016-05-04', erwaegungsgruendeErgaenzt: true },
  { art: 'original' },
])('schreibt und liest die Fassung $art mit Stichtag $stichtag', (fassung) => {
  const xml = baueGesetzesXML(
    { kurztitel: 'G', langtitel: 'Gesetz', normgeber: 'eu', fassung },
    [],
  );
  expect(leseGesetzInfos(xml)?.fassung).toEqual(fassung);
  expect(parseGesetzesXML(xml)?.fassung).toEqual(fassung);
  expect(xml.includes('erwaegungsgruendeErgaenzt="true"')).toBe(
    !!fassung.erwaegungsgruendeErgaenzt,
  );
});
it('schreibt bei ausdrücklich falscher Ergänzung kein Attribut', () => {
  const xml = baueGesetzesXML(
    {
      kurztitel: 'G',
      langtitel: 'Gesetz',
      normgeber: 'eu',
      fassung: { art: 'original', erwaegungsgruendeErgaenzt: false },
    },
    [],
  );
  expect(xml).not.toContain('erwaegungsgruendeErgaenzt');
});
it.each([
  ['2002-01-01', '2002-01-01'],
  ['1. Januar 2002', '2002-01-01'],
  ['01.01.2002', '2002-01-01'],
  ['1949', '1949'],
  ['Mai 1949', '1949-05'],
  ['31.02.2002', undefined],
  ['ohne Datum', undefined],
])(
  'schreibt für Ausfertigung %s ausschließlich das vereinbarte Datum',
  (ausfertigung, erwartet) => {
    const xml = baueGesetzesXML(
      { kurztitel: 'G', langtitel: 'Gesetz', normgeber: 'de-bund', ausfertigung },
      [],
    );
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.querySelector('ausfertigung')?.textContent).toBe(erwartet);
  },
);
it('zeigt verkürzte und vollständige Ausfertigungsdaten deutsch', () => {
  expect(formatAusfertigung('1949')).toBe('1949');
  expect(formatAusfertigung('1949-05')).toBe('Mai 1949');
  expect(formatAusfertigung('2002-01-01')).toBe('1. Januar 2002');
});

it.each(['0000', '0000-05', '0000-05-01', 'Mai 0000', '1. Januar 0000', '01.01.0000'])(
  'lässt die schemawidrige Ausfertigung %s mit Jahr null vollständig weg',
  (ausfertigung) => {
    const xml = baueGesetzesXML(
      { kurztitel: 'G', langtitel: 'Gesetz', normgeber: 'de-bund', ausfertigung },
      [],
    );
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.querySelector('ausfertigung')).toBeNull();
  },
);
