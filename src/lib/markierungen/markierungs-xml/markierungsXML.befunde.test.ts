// Prüft die Eingangskontrolle innerhalb wohlgeformter Markierungsdateien.

import { expect, it } from 'vitest';
import { parseEintraege } from './markierungs-xml.index';

const gut =
  '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><kommentartext>privat</kommentartext></kommentar>';
it.each([
  [
    'ausgangsstelleFehlt',
    '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><kommentartext>privat</kommentartext></kommentar>',
  ],
  [
    'ausgangsstelleMehrfach',
    '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><bezeichnung>§ 2</bezeichnung></kommentar>',
  ],
  [
    'ausgangsstelleUngueltig',
    '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><gliederungskennzahl>01</gliederungskennzahl></kommentar>',
  ],
  ['textbezugUngueltig', '<unterstreichung><bezeichnung>§ 1</bezeichnung></unterstreichung>'],
  [
    'textbezugUngueltig',
    '<hervorhebung><bezeichnung>§ 1</bezeichnung><textstelle><zeichenbereich start="x" ende="2"/></textstelle><bezugstext>privat</bezugstext></hervorhebung>',
  ],
  ['textbezugUngueltig', '<kommentar><bezeichnung>§ 1</bezeichnung><textstelle/></kommentar>'],
  [
    'textbezugUngueltig',
    '<verweismarkierung><bezeichnung>§ 1</bezeichnung><bezugstext>privat</bezugstext></verweismarkierung>',
  ],
  [
    'verweisinhaltFehlt',
    '<verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung></verweismarkierung>',
  ],
])('meldet %s und bewahrt lesbare Einträge', (fall, defekt) => {
  const ergebnis = parseEintraege(
    `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>${gut}${defekt}${gut}</inhalt></markierungen>`,
  );
  expect(ergebnis.eintraege).toHaveLength(2);
  expect(ergebnis.befunde).toMatchObject([{ fall }]);
  expect(JSON.stringify(ergebnis.befunde)).not.toContain('privat');
});

it.each(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'])(
  'meldet jeden unvollständigen Textbezug für %s',
  (typ) => {
    for (const textbezug of [
      '<textstelle><zeichenbereich start="0" ende="1"/></textstelle>',
      '<bezugstext>privat</bezugstext>',
      '<textstelle/><bezugstext>privat</bezugstext>',
      '<textstelle><zeichenbereich start="0"/></textstelle><bezugstext>privat</bezugstext>',
      '<textstelle><zeichenbereich ende="1"/></textstelle><bezugstext>privat</bezugstext>',
    ]) {
      const xml = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>${gut}<${typ}><bezeichnung>§ 1</bezeichnung>${textbezug}</${typ}>${gut}</inhalt></markierungen>`;
      expect(parseEintraege(xml)).toMatchObject({
        eintraege: [{ typ: 'kommentar' }, { typ: 'kommentar' }],
        befunde: [{ fall: 'textbezugUngueltig', typ, ort: '§ 1' }],
      });
    }
  },
);

it.each([
  ['<bezeichnung/>', 'ausgangsstelleUngueltig'],
  ['<gliederungskennzahl praefix="§">010</gliederungskennzahl>', 'ausgangsstelleUngueltig'],
  [
    '<bezeichnung>§ 1</bezeichnung><gliederungskennzahl>010</gliederungskennzahl>',
    'ausgangsstelleMehrfach',
  ],
])('meldet die ungültige Ausgangsstelle %s', (stelle, fall) => {
  const gelesen = parseEintraege(
    `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>${gut}<kommentar><elementstand><textlaenge>0</textlaenge></elementstand>${stelle}<kommentartext>privat</kommentartext></kommentar>${gut}</inhalt></markierungen>`,
  );
  expect(gelesen.eintraege).toHaveLength(2);
  expect(gelesen.befunde).toMatchObject([{ fall, typ: 'kommentar' }]);
});

it('meldet einen fehlenden Kommentartext, erhält aber einen ausdrücklich leeren Text', () => {
  const xml = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>${gut.replace('<kommentartext>privat</kommentartext>', '')}${gut.replace('<kommentartext>privat</kommentartext>', '<kommentartext/>')}</inhalt></markierungen>`;
  expect(parseEintraege(xml)).toMatchObject({
    eintraege: [{ typ: 'kommentar', kommentarText: '' }],
    befunde: [{ fall: 'kommentarTextFehlt', typ: 'kommentar', ort: '§ 1' }],
  });
});

it.each([
  '<kommentartext>zweiter Text</kommentartext>',
  '<verweisinhalt><verweistext>x</verweistext></verweisinhalt>',
])('meldet doppelte oder typfremde Inhalte: %s', (zusatz) => {
  const defekt = gut.replace('</kommentar>', `${zusatz}</kommentar>`);
  const xml = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>${defekt}${gut}</inhalt></markierungen>`;
  expect(parseEintraege(xml)).toMatchObject({
    eintraege: [{ typ: 'kommentar', kommentarText: 'privat' }],
    befunde: [{ fall: 'markierungsinhaltUngueltig', typ: 'kommentar' }],
  });
});

it('liest einen Kommentar mit dem früheren Element <text> nicht', () => {
  const alt = gut.replace('<kommentartext>privat</kommentartext>', '<text>privat</text>');
  const xml = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>${alt}${gut}</inhalt></markierungen>`;
  expect(parseEintraege(xml)).toMatchObject({
    eintraege: [{ typ: 'kommentar', kommentarText: 'privat' }],
    befunde: [{ fall: 'kommentarTextFehlt', typ: 'kommentar' }],
  });
});

it.each(['unterstreichung', 'hervorhebung', 'verweismarkierung'])(
  'meldet <kommentartext> an %s als ungültigen Inhalt',
  (typ) => {
    const inhalt =
      typ === 'verweismarkierung'
        ? '<verweisinhalt><verweistext>x</verweistext></verweisinhalt>'
        : '';
    const xml = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><${typ}><bezeichnung>§ 1</bezeichnung><textstelle><zeichenbereich start="0" ende="1"/></textstelle><bezugstext>x</bezugstext>${inhalt}<kommentartext>x</kommentartext></${typ}>${gut}</inhalt></markierungen>`;
    expect(parseEintraege(xml).befunde).toMatchObject([
      { fall: 'markierungsinhaltUngueltig', typ },
    ]);
  },
);
