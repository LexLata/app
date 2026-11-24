import { korrigiereLeerzeichenFehler } from './importindexErstellungBW.nachbearbeitung';
import { describe, it, expect } from 'vitest';
import { wendeErsetzungenAn } from './importindexErstellungBW.abgleich';
import type { ImportindexEintrag } from '@/lib/import/importindex/importindex.index';

// Erwartete Outputs wurden gegen die Implementierung VOR der
// cognitive-complexity-Refaktorierung (Extraktion von
// ermittleAktualisierungsArt/ermittleAktualisierteAttrs aus
// wendeErsetzungenAn) verifiziert – siehe Absprache: neue Tests werden
// gegen echte Funktionsoutputs geschrieben, nicht analytisch hergeleitet.

function eintrag(kurztitel: string, langtitel: string, abrufkennung: string): ImportindexEintrag {
  return { kurztitel, langtitel, abrufkennung };
}

const xmlBlock = (langtitel: string, kurztitel: string, abrufkennung: string, attrs = '') =>
  `<gesetz${attrs}>\n` +
  `            <langtitel>${langtitel}</langtitel>\n` +
  `            <kurztitel>${kurztitel}</kurztitel>\n` +
  `            <abrufkennung>${abrufkennung}</abrufkennung>\n` +
  `        </gesetz>`;

describe('wendeErsetzungenAn', () => {
  it('markiert nur das geänderte Feld (Kurztitel) mit aktualisierung', () => {
    const rawXml = xmlBlock('Altes Gesetz über irgendwas', 'AltG', 'https://a');
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('AltG', 'Altes Gesetz über irgendwas', 'https://a'),
        neu: eintrag('NeuG', 'Altes Gesetz über irgendwas', 'https://a'),
      },
    ]);
    expect(ergebnis).toEqual({
      xml:
        '<gesetz>\n' +
        '            <langtitel>Altes Gesetz über irgendwas</langtitel>\n' +
        '            <kurztitel aktualisierung="kurztitel">NeuG</kurztitel>\n' +
        '            <abrufkennung>https://a</abrufkennung>\n' +
        '        </gesetz>',
      anzahl: 1,
    });
  });

  it('markiert nur das geänderte Feld (Langtitel) mit aktualisierung', () => {
    const rawXml = xmlBlock('Altes Gesetz über irgendwas', 'AltG', 'https://a');
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('AltG', 'Altes Gesetz über irgendwas', 'https://a'),
        neu: eintrag('AltG', 'Neues Gesetz über irgendwas', 'https://a'),
      },
    ]);
    expect(ergebnis).toEqual({
      xml:
        '<gesetz>\n' +
        '            <langtitel aktualisierung="langtitel">Neues Gesetz über irgendwas</langtitel>\n' +
        '            <kurztitel>AltG</kurztitel>\n' +
        '            <abrufkennung>https://a</abrufkennung>\n' +
        '        </gesetz>',
      anzahl: 1,
    });
  });

  it('markiert beide Felder mit aktualisierung="beide", wenn beide geändert sind', () => {
    const rawXml = xmlBlock('Altes Gesetz über irgendwas', 'AltG', 'https://a');
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('AltG', 'Altes Gesetz über irgendwas', 'https://a'),
        neu: eintrag('NeuG', 'Neues Gesetz über irgendwas', 'https://a'),
      },
    ]);
    expect(ergebnis).toEqual({
      xml:
        '<gesetz>\n' +
        '            <langtitel aktualisierung="beide">Neues Gesetz über irgendwas</langtitel>\n' +
        '            <kurztitel aktualisierung="beide">NeuG</kurztitel>\n' +
        '            <abrufkennung>https://a</abrufkennung>\n' +
        '        </gesetz>',
      anzahl: 1,
    });
  });

  it('überspringt eine Ersetzung ohne (whitespace-/case-insensitiv) echte Änderung', () => {
    const rawXml = xmlBlock('Altes Gesetz', 'AltG', 'https://a');
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('AltG', 'Altes Gesetz', 'https://a'),
        neu: eintrag('altg', 'Altes   Gesetz', 'https://a'),
      },
    ]);
    expect(ergebnis).toEqual({ xml: rawXml, anzahl: 0 });
  });

  it('ersetzt ein bereits vorhandenes aktualisierung-Attribut, statt es zu verdoppeln', () => {
    const rawXml = xmlBlock('Altes Gesetz', 'AltG', 'https://a', ' aktualisierung="beide"');
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('AltG', 'Altes Gesetz', 'https://a'),
        neu: eintrag('NeuG', 'Altes Gesetz', 'https://a'),
      },
    ]);
    expect(ergebnis).toEqual({
      xml:
        '<gesetz aktualisierung="beide">\n' +
        '            <langtitel>Altes Gesetz</langtitel>\n' +
        '            <kurztitel aktualisierung="kurztitel">NeuG</kurztitel>\n' +
        '            <abrufkennung>https://a</abrufkennung>\n' +
        '        </gesetz>',
      anzahl: 1,
    });
  });

  it('entfernt ein evtl. vorhandenes moeglicherweiseEntfernt-Attribut', () => {
    const rawXml = xmlBlock(
      'Altes Gesetz',
      'AltG',
      'https://a',
      ' moeglicherweiseEntfernt="2024-01-01"',
    );
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('AltG', 'Altes Gesetz', 'https://a'),
        neu: eintrag('NeuG', 'Altes Gesetz', 'https://a'),
      },
    ]);
    expect(ergebnis).toEqual({
      xml:
        '<gesetz>\n' +
        '            <langtitel>Altes Gesetz</langtitel>\n' +
        '            <kurztitel aktualisierung="kurztitel">NeuG</kurztitel>\n' +
        '            <abrufkennung>https://a</abrufkennung>\n' +
        '        </gesetz>',
      anzahl: 1,
    });
  });

  it('überspringt eine Ersetzung, deren alt-Eintrag nicht im XML gefunden wird', () => {
    const rawXml = xmlBlock('Ganz anderes Gesetz', 'XyzG', 'https://a');
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('AltG', 'Altes Gesetz', 'https://a'),
        neu: eintrag('NeuG', 'Neues Gesetz', 'https://a'),
      },
    ]);
    expect(ergebnis).toEqual({ xml: rawXml, anzahl: 0 });
  });

  it('wendet mehrere Ersetzungen in einem Durchlauf an', () => {
    const rawXml =
      xmlBlock('Erstes Gesetz', 'ErstG', 'https://a') +
      '\n' +
      xmlBlock('Zweites Gesetz', 'ZweitG', 'https://b');
    const ergebnis = wendeErsetzungenAn(rawXml, [
      {
        alt: eintrag('ErstG', 'Erstes Gesetz', 'https://a'),
        neu: eintrag('Erst2G', 'Erstes Gesetz', 'https://a'),
      },
      {
        alt: eintrag('ZweitG', 'Zweites Gesetz', 'https://b'),
        neu: eintrag('ZweitG', 'Zweites Gesetz neu', 'https://b'),
      },
    ]);
    expect(ergebnis).toEqual({
      xml:
        '<gesetz>\n' +
        '            <langtitel>Erstes Gesetz</langtitel>\n' +
        '            <kurztitel aktualisierung="kurztitel">Erst2G</kurztitel>\n' +
        '            <abrufkennung>https://a</abrufkennung>\n' +
        '        </gesetz>\n' +
        '<gesetz>\n' +
        '            <langtitel aktualisierung="langtitel">Zweites Gesetz neu</langtitel>\n' +
        '            <kurztitel>ZweitG</kurztitel>\n' +
        '            <abrufkennung>https://b</abrufkennung>\n' +
        '        </gesetz>',
      anzahl: 2,
    });
  });
});

it('erhält feste Duplikatattribute und Pflegeattribute beim BW-Abgleich', () => {
  const attrs =
    ' duplikatArt="eg" duplikatVon="EGBGB" kurztitelArt="amtlich" permalinkArt="dokument" pflege="behalten"';
  const xml = xmlBlock('Titel', 'Alt', 'L1', attrs);
  const result = wendeErsetzungenAn(xml, [
    { alt: eintrag('Alt', 'Titel', 'L1'), neu: eintrag('Neu', 'Titel', 'L1') },
  ]);
  expect(result.anzahl).toBe(1);
  expect(result.xml).toContain(`<gesetz${attrs}>`);
});

describe('korrigiereLeerzeichenFehler – Grenzfälle', () => {
  it('entfernt mehrere zusätzliche Leerzeichen innerhalb eines Wortes', () => {
    const alt = eintrag('ZG', 'Zust ändig keitsgesetz', 'https://a');
    const neu = eintrag('ZG', 'Zuständigkeitsgesetz', 'https://a');
    expect(
      korrigiereLeerzeichenFehler([neu], [alt], xmlBlock(alt.langtitel, 'ZG', alt.abrufkennung)),
    ).toEqual({
      xml: xmlBlock(neu.langtitel, 'ZG', alt.abrufkennung).replace(
        '<langtitel>',
        '<langtitel aktualisierung="leerzeichen-entfernt">',
      ),
      anzahl: 1,
    });
  });
});
