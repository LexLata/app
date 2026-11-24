// Abgeleitete Konfliktkennungen werden bei ungültiger Struktur ohne Fehler verworfen.

import { expect, it } from 'vitest';
import { parseKonfliktEintraege } from './markierungskonflikteXML';

const gut =
  '<kommentar><konflikt typ="pauschaler-bezug-fehlt"/><bezeichnung>§ 1</bezeichnung><kommentartext>Notiz</kommentartext></kommentar>';
it.each([
  ['kommentar', ''],
  ['kommentar', '<bezeichnung>§ 2</bezeichnung><gliederungskennzahl>010</gliederungskennzahl>'],
  ['kommentar', '<gliederungskennzahl>01</gliederungskennzahl>'],
  ['kommentar', '<bezeichnung>§ 2</bezeichnung><textstelle/>'],
  ['unterstreichung', '<bezeichnung>§ 2</bezeichnung>'],
  [
    'hervorhebung',
    '<bezeichnung>§ 2</bezeichnung><textstelle><zeichenbereich start="x" ende="1"/></textstelle>',
  ],
  ['unbekannt', '<bezeichnung>§ 2</bezeichnung>'],
])('lädt lesbare Konflikte und verwirft nicht passende Kennungen: %s', (typ, inhalt) => {
  const xml = `<gesetz kurztitel="BGB" normgeber="de-bund">${gut}<${typ}>${inhalt}</${typ}>${gut}</gesetz>`;
  expect(() => parseKonfliktEintraege(xml)).not.toThrow();
  expect(parseKonfliktEintraege(xml)).toHaveLength(2);
});
