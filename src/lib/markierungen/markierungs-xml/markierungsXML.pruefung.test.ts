// markierungsXML.pruefung.test.ts
// Wurzelprüfung und Verweiszielgesetze einer MarkierungsXML.

import { describe, expect, it } from 'vitest';
import {
  istMarkierungsXML,
  liesMarkierungsGesetz,
  liesVerweiszielGesetze,
} from './markierungs-xml.index';

describe('istMarkierungsXML', () => {
  it.each([
    '<markierungen></markierungen>',
    '<?xml version="1.0"?>\n<markierungen version="1">\n<inhalt/>\n</markierungen>',
    '<markierungen\nversion="1"><infos/></markierungen>',
  ])('erkennt eine Markierungswurzel: %s', (inhalt) => {
    expect(istMarkierungsXML(inhalt)).toBe(true);
  });

  it.each([
    '',
    '<markierungen>',
    '<markierungenX></markierungenX>',
    '<markierungskonflikte></markierungskonflikte>',
    'irgendein Text',
  ])('weist Inhalte ohne vollständige Markierungswurzel ab: %s', (inhalt) => {
    expect(istMarkierungsXML(inhalt)).toBe(false);
  });
});

const markierungen = (verweise: string) =>
  `<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt>${verweise}</inhalt></markierungen>`;
const verweis = (ziele: string) =>
  `<verweismarkierung><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>x</verweistext>${ziele}</verweisinhalt></verweismarkierung>`;

describe('liesVerweiszielGesetze', () => {
  it('liefert die ausdrücklich genannten Zielgesetze aller Verweismarkierungen', () => {
    expect(
      liesVerweiszielGesetze(
        markierungen(
          verweis(
            '<verweisziel><gesetz normgeber="de-bund"> GG </gesetz></verweisziel><verweisziel><bezeichnung>§ 3</bezeichnung></verweisziel>',
          ) + verweis('<verweisziel><gesetz normgeber="de-bw">PolG</gesetz></verweisziel>'),
        ),
      ),
    ).toEqual([
      { kurztitel: 'GG', normgeber: 'de-bund' },
      { kurztitel: 'PolG', normgeber: 'de-bw' },
    ]);
  });

  it('übergeht Ziele ohne Gesetzesangabe, Kommentare und andere Markierungen', () => {
    expect(
      liesVerweiszielGesetze(
        markierungen(
          '<kommentar><bezeichnung>§ 1</bezeichnung><kommentartext>GG</kommentartext></kommentar>' +
            '<!-- <verweismarkierung><verweisinhalt><verweisziel><gesetz normgeber="de-bund">GG</gesetz></verweisziel></verweisinhalt></verweismarkierung> -->' +
            verweis('<verweisziel><gesetz normgeber="de-bund">  </gesetz></verweisziel>'),
        ),
      ),
    ).toEqual([]);
  });

  it('wirft bei fehlendem Normgeber eines Zielgesetzes', () => {
    expect(() =>
      liesVerweiszielGesetze(
        markierungen(verweis('<verweisziel><gesetz>GG</gesetz></verweisziel>')),
      ),
    ).toThrow('Normgeber');
  });

  it('wirft bei einer anderen Wurzel', () => {
    expect(() => liesVerweiszielGesetze('<markierungskonflikte/>')).toThrow();
  });
});

describe('liesMarkierungsGesetz', () => {
  it('liest getrimmten Kurztitel und Normgeber des Gesetzes unter infos', () => {
    expect(
      liesMarkierungsGesetz(
        '<markierungen><infos><gesetz normgeber="de-bw"><!--x-->  BGB  </gesetz></infos><inhalt/></markierungen>',
      ),
    ).toEqual({ kurztitel: 'BGB', normgeber: 'de-bw' });
  });

  it('wirft ohne Gesetzesreferenz unter infos, auch wenn das Inhaltselement ein Gesetz nennt', () => {
    expect(() =>
      liesMarkierungsGesetz(
        '<markierungen><infos/><inhalt><gesetz normgeber="de-bund">ZPO</gesetz></inhalt></markierungen>',
      ),
    ).toThrow('Datei ungültig: Gesetzesreferenz fehlt.');
  });

  it('wirft bei ungültigem Normgeber', () => {
    expect(() =>
      liesMarkierungsGesetz(
        '<markierungen><infos><gesetz normgeber="A_B">ZPO</gesetz></infos></markierungen>',
      ),
    ).toThrow('Normgeber');
  });
});
