// Prüft den Pflicht-Normgeber an der externen XML-Grenze.

import { expect, it } from 'vitest';
import { parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

it('meldet fehlende Normgeber in Dateizuordnung und Zielnorm als Befund', () => {
  const kommentar =
    '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><kommentartext>privat</kommentartext></kommentar>';
  const xml = `<markierungen><infos><gesetz>BGB</gesetz></infos><inhalt>${kommentar}</inhalt></markierungen>`;
  expect(parseEintraege(xml)).toMatchObject({
    eintraege: [],
    befunde: [{ fall: 'normgeberFehlt' }],
  });
  const ziel =
    '<verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>GG</verweistext><verweisziel><gesetz>GG</gesetz><verweistextZeichenbereich start="0" ende="2"/></verweisziel></verweisinhalt></verweismarkierung>';
  expect(
    parseEintraege(
      `<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt>${kommentar}${ziel}</inhalt></markierungen>`,
    ),
  ).toMatchObject({ eintraege: [{ typ: 'kommentar' }], befunde: [{ fall: 'normgeberFehlt' }] });
});

it('benennt bei fremder Dateizuordnung erwartetes und enthaltenes Gesetz', () => {
  expect(() =>
    parseEintraege(
      '<markierungen><infos><gesetz normgeber="eu">MKH</gesetz></infos><inhalt/></markierungen>',
      { kurztitel: 'MKN', normgeber: 'de-bund' },
    ),
  ).toThrow('Erwartet: MKN (de-bund); enthalten: MKH (eu).');
});
