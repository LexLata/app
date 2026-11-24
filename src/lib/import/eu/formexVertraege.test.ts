// @vitest-environment jsdom
// formexVertraege.test.ts
// Prüft Vertragspräambeln, Vorgänger-Hinweise und Zwischenüberschriften.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { extrahiereFormexZip } from './formexZip';
import { parseFormex } from './formexParser';
import { baueGesetzesXML, baueText } from '@/lib/import/basis/basis.index';
import { nachbereiteGesetzesXML } from '@/lib/import/importabschluss/importabschluss.index';

function laden(celex: string) {
  const archiv = extrahiereFormexZip(
    new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${celex}.fmx4`)),
  );
  if ('fehler' in archiv) throw new Error(archiv.fehler);
  const normen = parseFormex(archiv.hauptdatei);
  if ('fehler' in normen) throw new Error(normen.fehler);
  return { normen, quelle: new DOMParser().parseFromString(archiv.hauptdatei, 'application/xml') };
}
for (const [celex, anzahl, vorgaenger] of [
  ['02016E%2FTXT-20250315', 358, 302],
  ['02016M%2FTXT-20250315', 55, 28],
  ['12016P%2FTXT', 54, 0],
] as const) {
  it(`liest Verträge und Charta vollständig: ${celex}`, async () => {
    const { normen, quelle } = laden(celex);
    expect(normen.filter((n) => n.normBezeichnung?.startsWith('Artikel '))).toHaveLength(anzahl);
    expect(normen.filter((n) => n.vorgaenger)).toHaveLength(vorgaenger);
    expect(normen[0]).toMatchObject({ normBezeichnung: 'Präambel', type: 'paragraph' });
    expect(normen.filter((n) => n.normBezeichnung === 'Präambel')).toHaveLength(1);
    expect(normen.some((n) => n.istErwaegungsgrund)).toBe(false);
    const haupttext = quelle.getElementsByTagName('ENACTING.TERMS')[0]!;
    const praambel = Array.from(haupttext.parentElement!.children).find((e) =>
      ['PREAMBLE', 'PREAMBLE.GEN'].includes(e.tagName),
    )!;
    for (const note of Array.from(praambel.getElementsByTagName('NOTE'))) note.remove();
    const original = Array.from(praambel.querySelectorAll('P')).filter(
      (p) => !p.closest('FULL\\.POWER, TITLE'),
    );
    const texte = original
      .map((p) => p.textContent!.replace(/\s+/g, ' ').trim())
      .filter((t) => t && t !== 'PRÄAMBEL');
    expect(
      normen[0]!.absaetze.map((a) =>
        a.elemente.flatMap((e) => (e.type === 'texte' ? e.saetze : [])).join(' '),
      ),
    ).toEqual(texte);
    const xml = baueGesetzesXML({ normgeber: 'eu', kurztitel: 'Test', langtitel: 'Test' }, normen);
    const nachher = new DOMParser().parseFromString(
      await nachbereiteGesetzesXML(xml, undefined, 'saetze'),
      'application/xml',
    );
    const abs = nachher.querySelector('norm[id="Präambel"]')!.querySelectorAll('absatz');
    expect(abs).toHaveLength(texte.length);
    expect(
      Array.from(abs).every((a) => !a.hasAttribute('zahl') && !a.querySelector('unterabsatz')),
    ).toBe(true);
  });
}
it('liest Vorgänger-Hinweise einschließlich unausgewogener Klammern', () => {
  const { normen } = laden('02016E%2FTXT-20250315');
  expect(normen.find((n) => n.normBezeichnung === 'Artikel 11')).toMatchObject({
    titel: undefined,
    vorgaenger: 'Artikel 6 EGV',
  });
  expect(normen.find((n) => n.normBezeichnung === 'Artikel 140')?.vorgaenger).toBe(
    'Artikel 121 Absatz 1, ex-Artikel 122 Absatz 2 Satz 2 und ex-Artikel 123 Absatz 5 EGV',
  );
});
it('erhält die Reihenfolge der Zwischenüberschriften', () => {
  for (const [celex, artikel, erwartet] of [
    [
      '02016E%2FTXT-20250315',
      'Artikel 294',
      [
        '(1)',
        '(2)',
        'Erste Lesung',
        '(3)',
        '(4)',
        '(5)',
        '(6)',
        'Zweite Lesung',
        '(7)',
        '(8)',
        '(9)',
        'Vermittlung',
        '(10)',
        '(11)',
        '(12)',
        'Dritte Lesung',
        '(13)',
        '(14)',
        'Besondere Bestimmungen',
        '(15)',
      ],
    ],
    [
      '02016M%2FTXT-20250315',
      'Artikel 48',
      [
        '(1)',
        'Ordentliches Änderungsverfahren',
        '(2)',
        '(3)',
        '(4)',
        '(5)',
        'Vereinfachte Änderungsverfahren',
        '(6)',
        '(7)',
      ],
    ],
  ] as const) {
    const norm = laden(celex).normen.find((n) => n.normBezeichnung === artikel)!;
    expect(
      norm.absaetze.map(
        (a) =>
          a.nummer ?? a.elemente.flatMap((e) => (e.type === 'texte' ? e.saetze : [])).join(' '),
      ),
    ).toEqual(erwartet);
  }
});
it('erhält auch einen einzelnen ausdrücklich getrennten Absatz', () => {
  expect(
    baueText(
      [{ absatzgrenzeErhalten: true, elemente: [{ type: 'texte', saetze: ['Ein Satz.'] }] }],
      '',
    ).join(''),
  ).toContain('<absatz>Ein Satz.</absatz>');
});

it('erhält alle 107 Artikel mit mehreren direkten ALINEA und die AEUV-Gliederung', () => {
  const celex = [
    '32008R0593',
    '32007R0864',
    '32012R1215',
    '32016R0679',
    '02016R0679-20160504',
    '02004L0038-20110616',
    '02022R2065-20221027',
    '02024R1689-20260727',
    '02016E%2FTXT-20250315',
    '02016M%2FTXT-20250315',
    '12016P%2FTXT',
  ];
  let anzahl = 0;
  for (const c of celex) {
    const { normen, quelle } = laden(c);
    const artikel = Array.from(
      quelle.getElementsByTagName('ENACTING.TERMS')[0]!.getElementsByTagName('ARTICLE'),
    );
    for (const a of artikel) {
      const alineas = Array.from(a.children).filter((e) => e.tagName === 'ALINEA');
      if (alineas.length < 2) continue;
      anzahl++;
      const bezeichnung = a.getElementsByTagName('TI.ART')[0]!.cloneNode(true) as Element;
      bezeichnung.querySelectorAll('NOTE').forEach((e) => e.remove());
      const n = normen.find(
        (n) => n.normBezeichnung === bezeichnung.textContent!.replace(/\s+/g, ' ').trim(),
      )!;
      expect(n.absaetze).toHaveLength(1);
      expect(n.absaetze[0]!.nummer).toBeUndefined();
      expect(n.absaetze[0]!.elemente.filter((e) => e.type === 'unterabsatz')).toHaveLength(
        alineas.length - 1,
      );
    }
  }
  expect(anzahl).toBe(107);
  const aeuv = laden('02016E%2FTXT-20250315').normen;
  const abschnitt = aeuv.find((n) => n.type === 'gliederung' && n.bez.startsWith('ABSCHNITT'))!;
  expect(abschnitt.ebene).toBe(4);
  expect(abschnitt.gliederungskennzahl).toHaveLength(12);
  const art18 = aeuv.find((n) => n.normBezeichnung === 'Artikel 18')!;
  const xml = baueGesetzesXML({ normgeber: 'eu', kurztitel: 'AEUV', langtitel: 'AEUV' }, [art18]);
  expect(xml).toContain('<unterabsatz zahl="[1]">');
  expect(xml).toContain('<unterabsatz zahl="[2]">');
});

it('verliert keine Absätze bei einem SUBDIV vor den direkten PARAG', () => {
  const n = parseFormex(
    '<ACT><ENACTING.TERMS><ARTICLE><TI.ART>Artikel 1<NOTE>Fußnote</NOTE></TI.ART><SUBDIV><TITLE><TI><P>Überschrift</P></TI></TITLE><PARAG><NO.PARAG>(1)</NO.PARAG><ALINEA>Innen.</ALINEA></PARAG></SUBDIV><PARAG><NO.PARAG>(2)</NO.PARAG><ALINEA>Danach.</ALINEA></PARAG></ARTICLE></ENACTING.TERMS></ACT>',
  );
  if ('fehler' in n) throw Error(n.fehler);
  expect(n[0]!.normBezeichnung).toBe('Artikel 1');
  expect(n[0]!.absaetze.map((a) => a.nummer)).toEqual([undefined, '(1)', '(2)']);
});
