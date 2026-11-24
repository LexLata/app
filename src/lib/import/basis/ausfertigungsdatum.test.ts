// ausfertigungsdatum.test.ts
// Vollständige Quelldaten normalisieren; unklare Angaben erhalten.
import { describe, expect, it } from 'vitest';
import { normalisiereAusfertigungsdatum } from './ausfertigungsdatum';

describe('normalisiereAusfertigungsdatum', () => {
  it.each([
    ['14. Oktober 2008', '2008-10-14'],
    ['1. März 1990', '1990-03-01'],
    [' 1.1.2024 ', '2024-01-01'],
    ['29. Februar 2000', '2000-02-29'],
    ['29. Februar 1900', undefined],
    ['31. Februar 2020', undefined],
    ['31.4.2020', undefined],
    ['1. März 0001', '0001-03-01'],
    ['1. Januar 0099', '0099-01-01'],
    [' 1896 ', '1896'],
    ['vom 14. Oktober 2008', undefined],
    ['14. Oktober 2008 Zusatz', undefined],
    ['2008-10-14', '2008-10-14'],
    ['2020-02-31', undefined],
    ['1949', '1949'],
    ['Mai 1949', '1949-05'],
    ['1949-05', '1949-05'],
    ['31.02.2002', undefined],
    ['ohne Datum', undefined],
    ['', undefined],
    ['  ', undefined],
  ])('%s → %s', (text, erwartet) => {
    expect(normalisiereAusfertigungsdatum(text)).toBe(erwartet);
  });
  it.each([
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ])('erkennt %s', (monat) => {
    const monate = [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ];
    expect(normalisiereAusfertigungsdatum(`1. ${monat} 2024`)).toBe(
      `2024-${String(monate.indexOf(monat) + 1).padStart(2, '0')}-01`,
    );
  });
});
