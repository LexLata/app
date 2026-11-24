// @vitest-environment jsdom
// formexParser.test.ts
// Prüft portable Formex-Archive und die verlustfreie Übernahme ihrer Artikel.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { extrahiereFormexZip } from './formexZip';
import { parseFormex } from './formexParser';

const faelle = [
  ['32008R0593', 29, 46],
  ['32007R0864', 32, 40],
  ['32012R1215', 81, 41],
  ['32016R0679', 99, 173],
  ['02016R0679-20160504', 99, 0],
  ['02004L0038-20110616', 42, 31],
  ['02022R2065-20221027', 93, 0],
  ['02024R1689-20260727', 119, 0],
] as const;
for (const [celex, artikel, gruende] of faelle)
  it(`liest ${celex} vollständig`, () => {
    const archiv = extrahiereFormexZip(
      new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${celex}.fmx4`)),
    );
    if ('fehler' in archiv) throw new Error(archiv.fehler);
    const ergebnis = parseFormex(archiv.hauptdatei);
    if ('fehler' in ergebnis) throw new Error(ergebnis.fehler);
    expect(ergebnis.filter((n) => n.type === 'paragraph' && !n.istErwaegungsgrund)).toHaveLength(
      artikel,
    );
    expect(ergebnis.filter((n) => n.istErwaegungsgrund)).toHaveLength(gruende);
  });

import {
  baueGesetzesXML,
  type GesammelteNorm,
  type ImpEintrag,
} from '@/lib/import/basis/basis.index';
import { zipSync, strToU8 } from 'fflate';
import { leseErwaegungsgruende } from './formexParser';

function laden(celex: string) {
  const archiv = extrahiereFormexZip(
    new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${celex}.fmx4`)),
  );
  if ('fehler' in archiv) throw new Error(archiv.fehler);
  return archiv;
}
function normen(xml: string): GesammelteNorm[] {
  const ergebnis = parseFormex(xml);
  if ('fehler' in ergebnis) throw new Error(ergebnis.fehler);
  return ergebnis;
}
function eintragText(e: ImpEintrag): string {
  return e.texteVor.join(' ') + e.untereintraege.map(eintragText).join(' ') + e.texteNach.join(' ');
}
function normText(n: GesammelteNorm): string {
  return n.absaetze
    .filter((a) => !a.zwischenueberschrift)
    .flatMap((a) =>
      a.elemente.map((e) =>
        e.type === 'texte'
          ? e.saetze.join(' ')
          : e.type === 'liste'
            ? e.eintraege.map(eintragText).join(' ')
            : '',
      ),
    )
    .join(' ');
}
function xmlAus(n: GesammelteNorm[]): string {
  return baueGesetzesXML({ normgeber: 'eu', kurztitel: 'Test', langtitel: 'Testgesetz' }, n);
}
function artikelXML(inhalt: string): string {
  return `<ACT><ENACTING.TERMS><ARTICLE><TI.ART>Artikel 1</TI.ART>${inhalt}</ARTICLE></ENACTING.TERMS></ACT>`;
}

for (const celex of [
  ...faelle.map(([c]) => c),
  '02016E%2FTXT-20250315',
  '02016M%2FTXT-20250315',
  '12016P%2FTXT',
])
  it(`erhält jedes Textzeichen der Artikel in ${celex}`, () => {
    const { hauptdatei } = laden(celex);
    const doc = new DOMParser().parseFromString(hauptdatei, 'application/xml');
    const artikel = Array.from(
      doc.getElementsByTagName('ENACTING.TERMS')[0]!.getElementsByTagName('ARTICLE'),
    );
    const ergebnis = normen(hauptdatei).filter(
      (n) => n.type === 'paragraph' && !n.istErwaegungsgrund && n.normBezeichnung !== 'Präambel',
    );
    for (const [index, original] of artikel.entries()) {
      // Unabhängiges Orakel: Überschriften, Fußnoten und strukturelle Nummern entfernen;
      // Zeichenmarker ersetzen. Exakte Zeichenfolge statt einer bloßen Längenprüfung.
      for (const e of Array.from(
        original.querySelectorAll('NOTE, TITLE, TI\\.ART, STI\\.ART, NO\\.PARAG, NO\\.P'),
      ))
        if (e.tagName !== 'NO.PARAG' || !e.closest('QUOT\\.S')) e.remove();
      for (const e of Array.from(original.querySelectorAll('QUOT\\.START, QUOT\\.END')))
        e.replaceWith(String.fromCodePoint(Number.parseInt(e.getAttribute('CODE')!, 16)));
      expect(normText(ergebnis[index]!).replace(/\s/g, ''), `${celex}: Artikel ${index + 1}`).toBe(
        original.textContent!.replace(/\s/g, ''),
      );
    }
  });

it('erhält typografische Anführungszeichen in DSGVO Artikel 4', () => {
  const artikel = normen(laden('32016R0679').hauptdatei).find(
    (n) => n.normBezeichnung === 'Artikel 4',
  )!;
  expect(normText(artikel)).toContain('„personenbezogene Daten“');
});
it('erhält Listen, verschachtelte Listen und nachfolgenden Text', () => {
  const n = normen(
    artikelXML(
      '<ALINEA><P>Vorher:</P><LIST TYPE="DASH"><ITEM><P>Eintrag<LIST><ITEM><NP><NO.P>a)</NO.P><TXT>Innen.</TXT></NP></ITEM></LIST>Danach innen.</P></ITEM></LIST><P>Danach außen.</P></ALINEA>',
    ),
  )[0]!;
  const liste = n.absaetze[0]!.elemente.find((e) => e.type === 'liste')!;
  expect(liste.type).toBe('liste');
  if (liste.type !== 'liste') throw new Error('Liste fehlt');
  expect(liste.eintraege[0]).toMatchObject({
    bezeichnung: '-',
    texteVor: ['Eintrag'],
    texteNach: ['Danach innen.'],
    unterlistenTyp: 'other',
    untereintraege: [{ bezeichnung: 'a)', texteVor: ['Innen.'] }],
  });
  expect(normText(n)).toContain('Danach außen.');
});
it('erhält verschachtelte Listen in DSGVO und Richtlinie', () => {
  for (const celex of ['32016R0679', '02004L0038-20110616']) {
    const n = normen(laden(celex).hauptdatei);
    expect(JSON.stringify(n)).toContain('"untereintraege":[{');
  }
});
it('übernimmt Gliederungstitel und hierarchische Kennzahlen', () => {
  const dsgvo = normen(laden('32016R0679').hauptdatei).filter(
    (n) => n.type === 'gliederung' && n.bez !== 'Erwägungsgründe',
  );
  expect(dsgvo[0]).toMatchObject({ ebene: 1, gliederungskennzahl: '010' });
  const abschnitt = dsgvo.find((n) => n.ebene === 2)!;
  expect(abschnitt.gliederungskennzahl).toHaveLength(6);
  expect(abschnitt.titel).toBeTruthy();
  const rl = normen(laden('02004L0038-20110616').hauptdatei).filter(
    (n) => n.type === 'gliederung' && n.bez !== 'Erwägungsgründe',
  );
  expect(rl.every((n) => !!n.titel)).toBe(true);
});
it('bildet direkte ALINEA als einen unnummerierten Absatz mit Unterabsätzen ab', () => {
  const zwei = normen(artikelXML('<ALINEA>Erster.</ALINEA><ALINEA>Zweiter.</ALINEA>'));
  expect(zwei[0]!.absaetze).toHaveLength(1);
  expect(xmlAus(zwei)).toContain('<unterabsatz zahl="[1]">');
  expect(xmlAus(zwei)).toContain('<unterabsatz zahl="[2]">');
  expect(xmlAus(zwei)).not.toContain('<absatz zahl=');
  expect(xmlAus(normen(artikelXML('<ALINEA>Einziger.</ALINEA>')))).not.toContain('unterabsatz');
});
it('übernimmt Unterabsätze nummerierter Absätze und Absatzbezeichnungen unverändert', () => {
  const n = normen(
    artikelXML(
      '<PARAG><NO.PARAG> (1a) </NO.PARAG><ALINEA>Erster.</ALINEA><ALINEA>Zweiter.</ALINEA></PARAG><PARAG><NO.PARAG>(1)</NO.PARAG><ALINEA>Dritter.</ALINEA></PARAG>',
    ),
  );
  expect(n[0]!.absaetze.map((a) => a.nummer)).toEqual(['(1a)', '(1)']);
  expect(xmlAus(n)).toContain('<absatz zahl="(1a)">');
  expect(xmlAus(n)).toContain('<unterabsatz zahl="[2]">');
  const dsgvo = normen(laden('32016R0679').hauptdatei).find(
    (n) => n.normBezeichnung === 'Artikel 6',
  )!;
  expect(dsgvo.absaetze[0]!.elemente.filter((e) => e.type === 'unterabsatz')).toHaveLength(1);
});
it('liest genau einen Erwägungsgrundblock und erkennt fehlende Artikel', () => {
  const n = normen(laden('32007R0864').hauptdatei);
  expect(n[0]).toMatchObject({ bez: 'Erwägungsgründe', gliederungskennzahl: '000' });
  expect(n.filter((e) => e.bez === 'Erwägungsgründe')).toHaveLength(1);
  expect(n[1]).toMatchObject({ normBezeichnung: 'E1', istErwaegungsgrund: true });
  expect(
    leseErwaegungsgruende(new DOMParser().parseFromString('<ACT/>', 'application/xml')),
  ).toEqual([]);
  expect(parseFormex('<ACT/>')).toEqual({ fehler: expect.stringContaining('Keine Artikel') });
  expect(extrahiereFormexZip(zipSync({ 'test.doc.xml': strToU8('<DOC/>') }))).toEqual({
    fehler: expect.stringContaining('Keine Artikel'),
  });
});

import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { pruefeZusatzangabe } from '@/lib/domain/norm/norm.index';
it('erhält AI Act Absatz 1b. bis zur Darstellung und Zitatstrukturprüfung', () => {
  const n = normen(laden('02024R1689-20260727').hauptdatei).find(
    (n) => n.normBezeichnung === 'Artikel 5',
  )!;
  const index = n.absaetze.findIndex((a) => a.nummer === '1b.');
  expect(index).toBeGreaterThan(0);
  expect(n.absaetze[index - 1]!.nummer).toBe('(1a)');
  expect(n.absaetze[index + 1]!.nummer).toBe('(2)');
  const xml = xmlAus([n]);
  expect(xml).toContain('<absatz zahl="1b.">');
  const gesetz = parseGesetzesXML(xml)!;
  const element = gesetz.elemente.find((e) => e.typ === 'norm');
  if (element?.typ !== 'norm') throw new Error('Norm fehlt');
  expect(element.data.absaetze[index]!.bezeichnung).toBe('1b.');
  expect(pruefeZusatzangabe(element.data, 'absatz', '1b')).toBe(true);
});

it('liest auch hinter einem Titelblatt den Haupttext und meldet beschädigte Archive', () => {
  const charta = laden('12016P%2FTXT');
  expect(charta.hauptdatei).toContain('<ARTICLE');
  expect(charta.docXml).toContain('REF.PHYS');
  expect(extrahiereFormexZip(new Uint8Array([1, 2, 3]))).toHaveProperty('fehler');
  expect(extrahiereFormexZip(zipSync({ 'titel.xml': strToU8('<ACT/>') }))).toHaveProperty('fehler');
  expect(parseFormex('<ACT>')).toEqual({ fehler: 'Ungültiges Formex-XML.' });
});
it('erhält unbekannte Blockelemente und lässt Fußnoten vollständig aus', () => {
  const n = normen(
    artikelXML(
      '<ALINEA><P>Vorher.</P><QUOT.S><PARAG><NO.PARAG>(5)</NO.PARAG><ALINEA>Änderung<NOTE>Fußnote</NOTE>.</ALINEA></PARAG></QUOT.S><FREMD><P>Weiter.</P></FREMD></ALINEA>',
    ),
  )[0]!;
  expect(normText(n)).toContain('(5) Änderung.');
  expect(normText(n)).toContain('Weiter.');
  expect(normText(n)).not.toContain('Fußnote');
});

it('weist hundert Gliederungen derselben Ebene beim Formex-Import zurück', () => {
  const gliederungen = '<DIVISION><TITLE><TI><P>Abschnitt</P></TI></TITLE></DIVISION>'.repeat(100);
  expect(() =>
    parseFormex(`<ACT><ENACTING.TERMS>${gliederungen}<ARTICLE/></ENACTING.TERMS></ACT>`),
  ).toThrow('Zu viele Gliederungen auf derselben Ebene.');
});
