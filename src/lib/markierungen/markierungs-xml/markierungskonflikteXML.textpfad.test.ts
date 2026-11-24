// Verwirft abgeleitete Konflikte mit widersprüchlichen oder ungültigen Textpositionen.
import { expect, it } from 'vitest';
import { parseKonfliktEintraege } from './markierungskonflikteXML';

it.each([
  '<bereich>amtlicher-titel</bereich><absatz>1</absatz><zeichenbereich start="0" ende="1"/>',
  '<satz>1</satz><satz>2</satz><zeichenbereich start="0" ende="1"/>',
  '<zeichenbereich start="2" ende="1"/>',
  '<zeichenbereich start="-1" ende="1"/>',
])('verwirft abgeleitete Konflikte mit unzulässiger Textposition: %s', (pfad) => {
  const xml = `<gesetz normgeber="de-bund" kurztitel="G"><unterstreichung><bezeichnung>§ 1</bezeichnung><textstelle>${pfad}</textstelle><konflikt typ="bezugstext-fehlt-oder-unpassend"/></unterstreichung></gesetz>`;
  const gueltig = xml.replace(pfad, '<zeichenbereich start="0" ende="1"/>');
  expect(parseKonfliktEintraege(gueltig)).toHaveLength(1);
  expect(parseKonfliktEintraege(xml)).toEqual([]);
});
