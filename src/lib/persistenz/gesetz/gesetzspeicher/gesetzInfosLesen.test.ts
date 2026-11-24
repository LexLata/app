// gesetzInfosLesen.test.ts
//
// Unit-Tests für leseGesetzInfos() (gesetzInfosLesen.ts): deckt die
// Feld-Extraktion aus <infos> sowie die null-Rückgabefälle ab (kaputtes XML,
// falsches Wurzelelement, fehlender <infos>-Block, fehlende Lang-/
// Kurztitel). Vitest (Node-Umgebung), DOMParser-Polyfill (linkedom)
// zentral aus src/test/setupNode.ts.
//
// Bewusst NICHT hier getestet: das volle Normen-/Überschriften-Modell (dafür
// gibt es gesetzesXMLParser.ts) – das ist genau das, was diese Funktion
// bewusst NICHT aufbaut.

import { describe, it, expect } from 'vitest';
import { leseGesetzInfos } from './gesetzInfosLesen';

function gesetz(infosInhalt: string): string {
  return `<?xml version="1.0"?>
<gesetz id="test">
  <infos>${infosInhalt}${infosInhalt.includes('<normgeber>') ? '' : '<normgeber>de-bund</normgeber>'}</infos>
  <inhalt></inhalt>
</gesetz>`;
}

describe('leseGesetzInfos', () => {
  it('liest nur gültige Normgeber und errät keinen aus datenquelle', () => {
    expect(
      leseGesetzInfos(
        gesetz(
          '<langtitel>T</langtitel><kurztitel>K</kurztitel><datenquelle name="EU-Recht"/><normgeber>eu</normgeber>',
        ),
      )?.normgeber,
    ).toBe('eu');
    expect(
      leseGesetzInfos(
        gesetz(
          '<langtitel>T</langtitel><kurztitel>K</kurztitel><datenquelle name="EU-Recht"/><normgeber>fremd</normgeber>',
        ),
      )?.normgeber,
    ).toBe('fremd');
  });
  it('liest kurztitel, datenquelle und verarbeitungszeit aus einem vollständigen <infos><normgeber>de-bund</normgeber>-Block', () => {
    const result = leseGesetzInfos(
      gesetz(
        '<langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel><datenquelle name="https://example.test"/><verarbeitungszeit>2026-01-15T10:00:00.000Z</verarbeitungszeit>',
      ),
    );
    expect(result).not.toBeNull();
    expect(result?.kurztitel).toBe('TestG');
    expect(result?.datenquelle?.name).toBe('https://example.test');
    expect(result?.verarbeitungszeit?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('datenquelle und verarbeitungszeit sind undefined, wenn die jeweiligen Tags fehlen', () => {
    const result = leseGesetzInfos(
      gesetz('<langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel>'),
    );
    expect(result?.kurztitel).toBe('TestG');
    expect(result?.datenquelle).toBeUndefined();
    expect(result?.verarbeitungszeit).toBeUndefined();
  });

  it('liest ausfertigung, aenderungsvermerk und neugefasst aus <ausfertigung>/<stand>', () => {
    const result = leseGesetzInfos(
      gesetz(
        '<langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel>' +
          '<ausfertigung>2020-01-01</ausfertigung>' +
          '<stand><aenderungsvermerk>2024-06-01</aenderungsvermerk><neugefasst>2022-03-01</neugefasst></stand>',
      ),
    );
    expect(result?.ausfertigung).toBe('2020-01-01');
    expect(result?.aenderungsvermerk).toBe('2024-06-01');
    expect(result?.neugefasst).toBe('2022-03-01');
  });

  it('ausfertigung, aenderungsvermerk und neugefasst sind undefined, wenn <ausfertigung>/<stand> fehlen', () => {
    const result = leseGesetzInfos(
      gesetz('<langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel>'),
    );
    expect(result?.ausfertigung).toBeUndefined();
    expect(result?.aenderungsvermerk).toBeUndefined();
    expect(result?.neugefasst).toBeUndefined();
  });

  it('weist fehlenden kurztitel auch mit vorhandenem langtitel zurück', () => {
    const result = leseGesetzInfos(gesetz('<langtitel>Nur Langbezeichnung</langtitel>'));
    expect(result).toBeNull();
  });

  it('trimmt Whitespace um alle Feldinhalte (kurztitel, datenquelle, verarbeitungszeit, ausfertigung, stand; titel indirekt über die kurztitel-Leerstring-Prüfung)', () => {
    const result = leseGesetzInfos(
      gesetz(
        '<langtitel>  Testgesetz  </langtitel><kurztitel>  TestG  </kurztitel><datenquelle name="  https://example.test  "/><verarbeitungszeit>  2026-01-15T10:00:00.000Z  </verarbeitungszeit>' +
          '<ausfertigung>  2020-01-01  </ausfertigung><stand><aenderungsvermerk>  2024-06-01  </aenderungsvermerk><neugefasst>  2022-03-01  </neugefasst></stand>',
      ),
    );
    expect(result?.kurztitel).toBe('TestG');
    expect(result?.datenquelle?.name).toBe('https://example.test');
    expect(result?.verarbeitungszeit?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(result?.ausfertigung).toBe('2020-01-01');
    expect(result?.aenderungsvermerk).toBe('2024-06-01');
    expect(result?.neugefasst).toBe('2022-03-01');
  });

  it('gibt null zurück, wenn sowohl Lang- als auch Kurztitel fehlen', () => {
    const result = leseGesetzInfos(gesetz('<datenquelle name="https://example.test"/>'));
    expect(result).toBeNull();
  });

  it('gibt null zurück, wenn kein <infos>-Block vorhanden ist', () => {
    const result = leseGesetzInfos(
      '<?xml version="1.0"?><gesetz id="test"><inhalt></inhalt></gesetz>',
    );
    expect(result).toBeNull();
  });

  it('gibt null zurück, wenn das Wurzelelement nicht <kurztitel> ist', () => {
    const result = leseGesetzInfos(
      '<?xml version="1.0"?><anderesWurzelelement><infos><gesetz>TestG</kurztitel></infos></anderesWurzelelement>',
    );
    expect(result).toBeNull();
  });

  it('gibt null zurück, wenn das XML komplett unparsbar ist (kein documentElement)', () => {
    const result = leseGesetzInfos('nicht einmal XML {{{');
    expect(result).toBeNull();
  });
});

it.each([
  ['2024-01-01T10:00:00', '2024-01-01T10:00:00.000Z'],
  ['2024-07-01T12:00:00+02:00', '2024-07-01T10:00:00.000Z'],
  ['kein-datum', undefined],
  ['', undefined],
])('liest Verarbeitungszeit %s mit UTC-Annahme', (wert, erwartung) => {
  expect(
    leseGesetzInfos(
      gesetz(
        `<langtitel>T</langtitel><kurztitel>K</kurztitel><verarbeitungszeit>${wert}</verarbeitungszeit>`,
      ),
    )?.verarbeitungszeit?.toISOString(),
  ).toBe(erwartung);
});
it('unterstützt den alten Zeitstempel-Tag nicht zusätzlich', () => {
  expect(
    leseGesetzInfos(
      gesetz(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel><importzeit>2024-01-01T10:00:00Z</importzeit>',
      ),
    )?.verarbeitungszeit,
  ).toBeUndefined();
});

it('liest Standangaben nur direkt, ohne gleichnamige Metadatenfelder', () => {
  const gelesen = leseGesetzInfos(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><stand><neu><aenderungsvermerk>falsch</aenderungsvermerk><neugefasst>falsch</neugefasst></neu><aenderungsvermerk extra="x">richtig</aenderungsvermerk><neugefasst>2026-01-01</neugefasst></stand></infos></gesetz>',
  );
  expect(gelesen).toMatchObject({ aenderungsvermerk: 'richtig', neugefasst: '2026-01-01' });
});

it('erhält offene Normgeber und lehnt ungültige Angaben ausdrücklich ab', () => {
  expect(
    leseGesetzInfos(gesetz('<kurztitel>X</kurztitel><normgeber>de-sn</normgeber>'))?.normgeber,
  ).toBe('de-sn');
  expect(leseGesetzInfos(gesetz('<kurztitel>X</kurztitel>'))?.normgeber).toBe('de-bund');
  expect(leseGesetzInfos(gesetz('<kurztitel>X</kurztitel><normgeber>A_B</normgeber>'))).toBeNull();
});

it.each([
  ['<datenquelle name="Quelle"/>', { name: 'Quelle', url: undefined }],
  ['<datenquelle url="https://test/"/>', { name: undefined, url: 'https://test/' }],
  ['<datenquelle name="Quelle" url="https://test/"/>', { name: 'Quelle', url: 'https://test/' }],
])('liest Datenquellenattribute auch ohne vollständige Darstellung: %s', (xml, erwartet) => {
  expect(leseGesetzInfos(gesetz('<kurztitel>G</kurztitel>' + xml))?.datenquelle).toEqual(erwartet);
});
