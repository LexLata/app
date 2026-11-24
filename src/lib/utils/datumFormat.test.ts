// datumFormat.test.ts
//
// Tests für formatDatumLang. Bewusst KEINE hartcodierten Vergleichsstrings
// wie "15. Juli 2026, 14:32": Intl.DateTimeFormat('de-DE', {dateStyle:
// 'long', timeStyle: 'short'}) liefert je nach ICU-Version des Laufzeit-
// Node.js unterschiedliche Verbindungswörter zwischen Datum und Uhrzeit
// (beobachtet u.a. "15. Juli 2026 um 14:32" mit Node 22 / vollem ICU statt
// eines Kommas) – ein exakter String-Vergleich wäre bei einem
// Node-Versionswechsel oder je nach Betriebssystem (macOS-Entwicklung vs.
// Linux/Windows-CI) unnötig brüchig. Stattdessen wird die Struktur
// (Tag/Monatsname/Jahr/Uhrzeit in der erwarteten Reihenfolge und mit
// 2-stelliger Uhrzeit) sowie die inhaltliche Korrektheit anhand der
// Datumskomponenten geprüft.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatDatumLang, formatAusfertigung } from './datumFormat';

// Tag, Monatsname (dt.), Jahr, dann irgendein Trenntext, dann HH:MM.
const FORMAT_REGEX = /^(\d{1,2})\. ([A-ZÄÖÜ][a-zäöüß]+) (\d{4}).*(\d{2}):(\d{2})$/u;

describe('formatDatumLang', () => {
  it('formatiert ein bekanntes Datum in der erwarteten Grundstruktur (Tag. Monat Jahr ... HH:MM)', () => {
    const ergebnis = formatDatumLang(new Date(2026, 6, 15, 14, 32));
    expect(ergebnis).toMatch(FORMAT_REGEX);
    expect(ergebnis).toContain('15. Juli 2026');
    expect(ergebnis).toContain('14:32');
  });

  it('Uhrzeit wird mit führender Null zweistellig ausgegeben (Minute/Stunde < 10)', () => {
    const ergebnis = formatDatumLang(new Date(2026, 0, 1, 0, 5));
    const match = ergebnis.match(FORMAT_REGEX);
    expect(match).not.toBeNull();
    expect(match![4]).toBe('00');
    expect(match![5]).toBe('05');
  });

  it('Tag wird OHNE führende Null ausgegeben (deutsches Langformat, Tag < 10)', () => {
    const ergebnis = formatDatumLang(new Date(2026, 2, 3, 9, 0));
    expect(ergebnis.startsWith('3. März')).toBe(true);
  });

  it('alle zwölf Monatsnamen werden korrekt (deutsch, ausgeschrieben) verwendet', () => {
    const erwarteteMonate = [
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
    erwarteteMonate.forEach((monat, index) => {
      const ergebnis = formatDatumLang(new Date(2026, index, 10, 12, 0));
      expect(ergebnis).toContain(monat);
    });
  });

  it('Jahreswechsel/Jahrtausendgrenze: vierstelliges Jahr wird korrekt ausgegeben', () => {
    expect(formatDatumLang(new Date(2000, 0, 1, 0, 0))).toContain('2000');
    expect(formatDatumLang(new Date(1999, 11, 31, 23, 59))).toContain('1999');
  });

  it('Property: für beliebige gültige Daten enthält das Ergebnis exakt Jahr, Tag und zweistellige Uhrzeit passend zu den lokalen Datumskomponenten', () => {
    fc.assert(
      fc.property(
        // noInvalidDate: fc.date() würde sonst auch Invalid Date (NaN)
        // generieren – dafür ist formatDatumLang nicht ausgelegt (Aufrufer
        // übergeben stets valide Date-Objekte, siehe Verwendungsstellen),
        // das ist also kein zu testender Fall, sondern ein Test-Artefakt.
        fc.date({ min: new Date(1970, 0, 1), max: new Date(2100, 11, 31), noInvalidDate: true }),
        (d) => {
          const ergebnis = formatDatumLang(d);
          const match = ergebnis.match(FORMAT_REGEX);
          expect(match).not.toBeNull();
          // getFullYear/getDate/getHours/getMinutes verwenden dieselbe lokale
          // Zeitzone wie Intl.DateTimeFormat ohne explizite timeZone-Angabe
          // (Systemzeitzone) – daher hier direkt vergleichbar, unabhängig
          // davon, in welcher Zeitzone der Testlauf tatsächlich passiert.
          expect(match![1]).toBe(String(d.getDate()));
          expect(match![3]).toBe(String(d.getFullYear()));
          expect(match![4]).toBe(String(d.getHours()).padStart(2, '0'));
          expect(match![5]).toBe(String(d.getMinutes()).padStart(2, '0'));
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('formatAusfertigung', () => {
  it.each([
    ['2008-10-14', '14. Oktober 2008'],
    ['2000-02-29', '29. Februar 2000'],
    ['0001-01-01', '1. Januar 1'],
    ['0099-03-01', '1. März 99'],
    ['1900-02-29', '1900-02-29'],
    ['2020-02-31', '2020-02-31'],
    ['2024-00-01', '2024-00-01'],
    ['2024-13-01', '2024-13-01'],
    ['2024-01-00', '2024-01-00'],
    ['2024-04-31', '2024-04-31'],
    ['2008-1-14', '2008-1-14'],
    [' 2008-10-14 ', ' 2008-10-14 '],
    ['1896', '1896'],
    ['14. Oktober 2008', '14. Oktober 2008'],
    ['', ''],
  ])('%s → %s', (wert, erwartet) => expect(formatAusfertigung(wert)).toBe(erwartet));
});
