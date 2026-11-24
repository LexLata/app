// Regressionen für texttragende Quellnormen ohne amtliche Bezeichnung.
// Echte Quellstruktur mit Dokumentkopf und getrennten Text-/Fußnotenbereichen.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { importiereBundXML } from './XMLImporterBund';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';

function quelle(inhalt: string, kopftext = '', kopffussnote = ''): string {
  return `<dokumente doknr="G001"><norm doknr="G001"><metadaten>
    <jurabk>TestG</jurabk><langue>Testgesetz</langue></metadaten><textdaten>
    <text><Content>${kopftext}</Content></text><fussnoten><Content><P>${kopffussnote}</P></Content></fussnoten>
    </textdaten></norm>${inhalt}</dokumente>`;
}

function quellnorm(bezeichnung: string, text: string, doknr = 'G001-1'): string {
  return `<norm doknr="${doknr}"><metadaten>${bezeichnung}</metadaten><textdaten>
    <text><Content>${text}</Content></text></textdaten></norm>`;
}

function ergebnis(xml: string): Document {
  const importiert = importiereBundXML(xml);
  expect(importiert.fehler).toBeUndefined();
  return new DOMParser().parseFromString(importiert.xmlString!, 'text/xml');
}

describe('Bundesimport unbezeichneter Texte', () => {
  it.each(['', '<enbez>(XXXX)</enbez>'])(
    'erhält Fließtext bei %j ohne erfundene Bezeichnung',
    (bez) => {
      const xml = quelle(quellnorm(bez, '<P>Der Zuständigkeitsbereich wird übertragen.</P>'));
      const doc = ergebnis(xml);
      const norm = doc.querySelector('inhalt > norm')!;
      expect(norm).not.toBeNull();
      expect(norm.querySelector('bezeichnung')?.textContent).toBe('');
      expect(norm.querySelector('text')?.textContent).toContain('Zuständigkeitsbereich');
      expect(norm.getAttribute('id')).toBe('G001-1');
      expect(ergebnis(xml).querySelector('inhalt > norm')?.getAttribute('id')).toBe('G001-1');
      const dargestellt = parseGesetzesXML(importiereBundXML(xml).xmlString!);
      expect(dargestellt?.elemente[0]?.data).toMatchObject({
        bezeichnung: '',
        xmlId: 'G001-1',
      });
    },
  );

  it('erhält Listen, Tabelleninhalt und Fußnoten mit der bestehenden Textübersetzung', () => {
    const text =
      '<P>Es gilt:<DL><DT>1.</DT><DD><LA>Erster Eintrag.</LA></DD></DL></P>' +
      '<P><table><tgroup cols="1"><tbody><row><entry>Tabellenwert</entry></row></tbody></tgroup></table></P>';
    const xml = quelle(
      quellnorm('<enbez>(XXXX)</enbez>', text).replace(
        '</textdaten>',
        '<fussnoten><Content><P>Fußnote zum Text.</P></Content></fussnoten></textdaten>',
      ),
    );
    const norm = ergebnis(xml).querySelector('inhalt > norm')!;
    expect(norm).not.toBeNull();
    expect(norm.querySelector('text')?.textContent).toContain('Erster Eintrag.');
    expect(norm.querySelector('text')?.textContent).toContain('Tabellenwert');
    expect(norm.querySelector('fussnoten')?.textContent).toBe('Fußnote zum Text.');
  });

  it('übernimmt den Dokumentkopf weder als Textnorm noch als Fußnotenduplikat', () => {
    const doc = ergebnis(
      quelle(
        quellnorm('<enbez>(XXXX)</enbez>', '<P>Einziger Regelungstext.</P>'),
        '<P>Im Kopf wiederholte Angabe.</P>',
        'Redaktioneller Kopfhinweis.',
      ),
    );
    expect(doc.querySelectorAll('inhalt > norm')).toHaveLength(1);
    expect(doc.querySelector('inhalt')?.textContent).not.toContain('Kopf');
  });

  it.each(['<P> </P>', null])(
    'erzeugt für textleere Quellen (%j) und reine Fußnoten keine Textnorm',
    (text) => {
      const xml = quelle(
        quellnorm('<enbez>(XXXX)</enbez>', text ?? '')
          .replace('<text><Content></Content></text>', '<text/>')
          .replace(
            '</textdaten>',
            '<fussnoten><Content><P>Nur eine Fußnote.</P></Content></fussnoten></textdaten>',
          ),
        '',
        'Nur Überschrift aufgenommen.',
      );
      expect(ergebnis(xml).querySelectorAll('inhalt > norm')).toHaveLength(0);
    },
  );

  it('erhält Eingangs- und Schlussformel mit ihrem bisherigen Namen neben dem Text', () => {
    const doc = ergebnis(
      quelle(
        quellnorm('<enbez>Eingangsformel</enbez>', '<P>Auf Grund des Gesetzes.</P>', 'G001-0') +
          quellnorm('<enbez>(XXXX)</enbez>', '<P>Regelungstext.</P>') +
          quellnorm('<enbez>Schlussformel</enbez>', '<P>Ausgefertigt.</P>', 'G001-2'),
      ),
    );
    expect(
      [...doc.querySelectorAll('inhalt > norm > bezeichnung')].map((n) => n.textContent),
    ).toEqual(['Eingangsformel', '', 'Schlussformel']);
  });

  it('vergibt auch bei kollidierenden oder fehlenden Quellenkennungen nichtleere eindeutige IDs', () => {
    const doc = ergebnis(
      quelle(
        quellnorm('<enbez>G001-1</enbez>', '<P>Benannter Text.</P>', 'G001-2') +
          quellnorm('<enbez>(XXXX)</enbez>', '<P>Unbenannter Text.</P>') +
          quellnorm('', '<P>Text ohne Quellenkennung.</P>', ''),
      ),
    );
    const ids = [...doc.querySelectorAll('inhalt > norm')].map((n) => n.getAttribute('id'));
    expect(ids).toHaveLength(3);
    expect(ids.every((id) => Boolean(id?.trim()))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

it('erhält den Regelungstext des einzigen Dokumentkopfs einmal als unbezeichnete Norm', () => {
  const doc = ergebnis(
    quelle('', '<P>Diese Bekanntmachung tritt heute in Kraft.</P>', 'Redaktioneller Hinweis.'),
  );
  expect(doc.querySelectorAll('inhalt > norm')).toHaveLength(1);
  expect(doc.querySelector('inhalt > norm > bezeichnung')?.textContent).toBe('');
  expect(doc.querySelector('inhalt > norm > text')?.textContent).toContain('tritt heute in Kraft');
});
it.each(['', '<P> </P>'])('erzeugt bei reinem Metadaten-/Fußnotenkopf (%j) keine Norm', (text) => {
  expect(ergebnis(quelle('', text, 'Nur Fußnote.')).querySelectorAll('inhalt > norm')).toHaveLength(
    0,
  );
});

it.each([
  ['fzulbv-inkrafttreten.xml', 'FZulBVInkrbek', '1. August 2020'],
  ['grenzaenderung-bekanntmachung.xml', 'GrÄndStVtrBB/ST2024Bek', '12. Oktober 2024'],
])('erhält den einzigen Textkopf der Originalquelle %s', (datei, kurztitel, text) => {
  const xml = readFileSync(new URL(`./testdaten/${datei}`, import.meta.url), 'utf8');
  const doc = ergebnis(xml);
  expect(doc.querySelector('infos > kurztitel')?.textContent).toBe(kurztitel);
  expect(doc.querySelectorAll('inhalt > norm')).toHaveLength(1);
  expect(doc.querySelector('inhalt > norm > bezeichnung')?.textContent).toBe('');
  expect(doc.querySelector('inhalt > norm > text')?.textContent).toContain(text);
});
