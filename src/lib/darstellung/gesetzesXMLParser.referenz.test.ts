// gesetzesXMLParser.referenz.test.ts
// Feste Text- und UTF-16-Positionen sichern das Markierungsformat.
import { describe, it, expect, vi } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';
import { normTextLaenge } from '@/lib/domain/gesetzDarstellungAuswertung';
import { aktuellerTextAnPfad } from '@/lib/domain/textpfad/textpfad.index';
import { schuetzeLeerzeichen } from '@/lib/domain/basis/textNachbearbeitung';

function norm(inhalt: string) {
  const gesetz = parseGesetzesXML(
    `<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text>${inhalt}</text></norm></inhalt></gesetz>`,
  );
  const el = gesetz?.elemente[0];
  if (!el || el.typ !== 'norm') throw new Error('Norm fehlt');
  return el.data;
}
describe('eingefrorene Textaufbereitung', () => {
  it.each([
    [' \tA  \r\n<verweis norm="2"> B\n C </verweis>  D ', 'A B C D', 2, 5, 'B C'],
    [
      '&#160;A <verweis norm="2">😀 &amp; B</verweis>&#160;',
      '\u00a0A 😀 & B\u00a0',
      3,
      9,
      '😀 & B',
    ],
    [
      '<zeilenumbruch/><zeilenumbruch/>A<zeilenumbruch/><zeilenumbruch/><verweis norm="2">B</verweis><zeilenumbruch/><zeilenumbruch/>',
      'A\n\nB',
      3,
      4,
      'B',
    ],
    [
      'Die <verweis norm="2">Willenserklärung\n wird</verweis> wirksam.',
      'Die Willenserklärung wird wirksam.',
      4,
      25,
      'Willenserklärung wird',
    ],
  ])('erhält Text und Positionen für %s', (xml, text, start, ende, bezugstext) => {
    const n = norm(`<absatz zahl="(1)"><satz zahl="1">${xml}</satz></absatz>`);
    expect(n.absaetze[0]?.saetze[0]?.text).toBe(text);
    expect(n.getaggteVerweise?.[0]).toMatchObject({
      bezugstext,
      textstelle: {
        pfad: { absatz: '(1)', satz: 1 },
        zeichenbereichStart: start,
        zeichenbereichEnde: ende,
      },
    });
  });
  it('behält die Satzliste und Satzpfade trotz eines leeren Zusatzkindes', () => {
    const n = norm(
      '<absatz><satz zahl="1">Liste:<nummer zahl="1"><satz zahl="1">A.</satz><neu/><satz zahl="2">Siehe <verweis norm="2">B</verweis>.</satz></nummer></satz></absatz>',
    );
    const eintrag = n.absaetze[0]?.saetze[0]?.eintraege[0];
    expect(eintrag?.saetze?.map((s) => s.text)).toEqual(['A.', 'Siehe B.']);
    expect(n.getaggteVerweise?.[0]).toMatchObject({
      bezugstext: 'B',
      textstelle: {
        pfad: { satz: 1, eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 2 },
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      },
    });
  });
  it('meldet unbekannte Rumpfkinder und ignoriert versteckte Normen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = parseGesetzesXML(
      '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><neu><norm id="1"/></neu></inhalt></gesetz>',
    );
    expect(g?.elemente).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('BGB'), 'neu');
    warn.mockRestore();
  });
  it('lehnt beschädigtes XML tatsächlich ab', () => {
    expect(
      parseGesetzesXML(
        '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt></gesetz>',
      ),
    ).toBeNull();
  });
  it('erhält unbekannte Inlinehüllen und ignoriert Metadaten an Strukturpositionen', () => {
    const n = norm(
      '<neu><absatz>Metadaten</absatz></neu><absatz x="y"><neu/><satz zahl="1">A <hülle>B</hülle> C.</satz></absatz>',
    );
    expect(n.absaetze[0]?.saetze[0]?.text).toBe('A B C.');
    expect(n.absaetze).toHaveLength(1);
  });
});

it('erhält den Satz aus der Formatreferenz mit festen Verweispositionen', () => {
  const n = norm(`<absatz><satz zahl="1">
    Es gelten
    <verweis>die allgemeinen
        Vorschriften</verweis>
    entsprechend.<zeilenumbruch/>
    Weitere Angaben folgen.
</satz></absatz>`);
  expect(n.absaetze[0]?.saetze[0]?.text).toBe(
    'Es gelten die allgemeinen Vorschriften entsprechend.\nWeitere Angaben folgen.',
  );
  expect(n.getaggteVerweise?.[0]).toMatchObject({
    bezugstext: 'die allgemeinen Vorschriften',
    textstelle: { zeichenbereichStart: 10, zeichenbereichEnde: 38 },
  });
});
it('ignoriert Metadaten eines Listeneintrags auch mit bekanntem Satz darin', () => {
  const n = norm(
    '<absatz><satz zahl="1"><nummer zahl="1"><satz zahl="1">A.</satz><metadaten><satz zahl="9">Fremder Text.</satz></metadaten><satz zahl="2">B.</satz></nummer></satz></absatz>',
  );
  expect(n.absaetze[0]?.saetze[0]?.eintraege[0]?.saetze?.map((s) => s.text)).toEqual(['A.', 'B.']);
});
it('erhält Verweispositionen und ausdrückliche Umbrüche innerhalb neuer Inlinehüllen', () => {
  const n = norm(
    '<absatz><satz zahl="1">A <huelle><verweis norm="2">B<huelle><zeilenumbruch/>C</huelle></verweis></huelle> D.</satz></absatz>',
  );
  expect(n.absaetze[0]?.saetze[0]?.text).toBe('A B\nC D.');
  expect(n.getaggteVerweise?.[0]).toMatchObject({
    bezugstext: 'B\nC',
    textstelle: { zeichenbereichStart: 2, zeichenbereichEnde: 5 },
  });
});

it('erhält Absatz-, Satz- und Verweispositionen trotz Erweiterungen auf allen Strukturebenen', () => {
  const g =
    parseGesetzesXML(`<gesetz extra='x'><infos extra='x'><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><neu><titel>FALSCH</titel></neu></infos><inhalt extra='x'>
    <!-- <norm id='9'><bezeichnung>§ 9</bezeichnung></norm> -->
    <norm id='1' extra='x'><neu><bezeichnung>FALSCH</bezeichnung><text>FALSCH</text></neu><bezeichnung extra='x'>§ 1</bezeichnung><text>
      <neu><absatz>FALSCH</absatz></neu><absatz zahl='(1)' extra='x'><neu><satz>FALSCH</satz></neu>
      <satz zahl='1'>Liste:<nummer zahl='1' extra='x'><satz zahl='1'>A.</satz><neu/><satz zahl='2'>Siehe <verweis extra='x' norm='2'>B</verweis>.</satz></nummer></satz>
    </absatz></text></norm></inhalt></gesetz>`);
  const el = g?.elemente[0];
  expect(g?.elemente).toHaveLength(1);
  expect(el?.typ).toBe('norm');
  if (!el || el.typ !== 'norm') throw Error('Norm fehlt');
  expect(el.data.bezeichnung).toBe('§ 1');
  expect(el.data.absaetze[0]?.saetze[0]?.eintraege[0]?.saetze?.map((s) => s.text)).toEqual([
    'A.',
    'Siehe B.',
  ]);
  expect(el.data.getaggteVerweise?.[0]).toMatchObject({
    bezugstext: 'B',
    textstelle: {
      pfad: { absatz: '(1)', satzInEintrag: 2, eintraege: [{ ebene: 'nummer', bezeichnung: '1' }] },
      zeichenbereichStart: 6,
      zeichenbereichEnde: 7,
    },
  });
});

it.each([' zahl="1"', ''])('erhält ein einzelnes Satzkind auch ohne zahl (%s)', (zahl) => {
  const n = norm(
    `<absatz><satz zahl="1"><nummer zahl="1"><neu/><satz${zahl}>Siehe <verweis norm="2">B</verweis>.</satz><neu/></nummer></satz></absatz>`,
  );
  const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
  expect(eintrag.saetze).toHaveLength(1);
  expect(eintrag.saetze![0]).toMatchObject({ zahl: 1, text: 'Siehe B.' });
  expect(n.getaggteVerweise![0]).toMatchObject({
    textstelle: {
      pfad: { satz: 1, satzInEintrag: 1 },
      zeichenbereichStart: 6,
      zeichenbereichEnde: 7,
    },
  });
});
it('erfindet für direkten Eintragstext kein Satzkind', () => {
  const n = norm('<absatz><nummer zahl="1">Siehe <verweis norm="2">B</verweis>.</nummer></absatz>');
  expect(n.absaetze[0]!.saetze[0]!.eintraege[0]!.saetze).toBeUndefined();
  expect(n.getaggteVerweise![0]!.textstelle.pfad.satzInEintrag).toBeUndefined();
  expect(n.getaggteVerweise![0]).toMatchObject({
    textstelle: { zeichenbereichStart: 6, zeichenbereichEnde: 7 },
  });
});

describe('Unicode-Normalform NFC', () => {
  // „ä“ zerlegt: a + U+0308 (zwei UTF-16-Einheiten), zusammengesetzt: U+00E4 (eine).
  const zerlegt = (s: string) => s.replaceAll('\u00e4', 'a\u0308');
  const satz = 'Die <verweis norm="2">Erklärung</verweis> ist wählbar.';

  it('liest einen zerlegt geschriebenen Satz als NFC mit gleichen Positionen', () => {
    const nfc = norm(`<absatz zahl="(1)"><satz zahl="1">${satz}</satz></absatz>`);
    const zer = norm(`<absatz zahl="(1)"><satz zahl="1">${zerlegt(satz)}</satz></absatz>`);
    expect(zer.absaetze[0]?.saetze[0]?.text).toBe('Die Erklärung ist wählbar.');
    expect(normTextLaenge(zer)).toBe(26);
    expect(normTextLaenge(zer)).toBe(normTextLaenge(nfc));
    expect(zer.getaggteVerweise?.[0]).toMatchObject({
      bezugstext: 'Erklärung',
      textstelle: { zeichenbereichStart: 4, zeichenbereichEnde: 13 },
    });
    expect(zer.getaggteVerweise).toEqual(nfc.getaggteVerweise);
  });

  it('liest Normtitel, Normbezeichnung und Gliederungstitel zerlegt als NFC', () => {
    const g = parseGesetzesXML(
      zerlegt(
        '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><gliederung gliederungskennzahl="1"><bezeichnung>Teil 1</bezeichnung><titel>Präambel</titel></gliederung><norm id="1"><bezeichnung>Präambel</bezeichnung><titel>Präambel</titel><text><absatz><satz zahl="1">A.</satz></absatz></text></norm></inhalt></gesetz>',
      ),
    );
    const [gliederung, n] = g?.elemente ?? [];
    if (gliederung?.typ !== 'ueberschrift' || n?.typ !== 'norm') throw new Error('Elemente fehlen');
    expect(gliederung.data.titel).toBe('Präambel');
    expect(n.data.bezeichnung).toBe('Präambel');
    expect(n.data.titel).toBe('Präambel');
  });
});

describe('Verweis-Tags beeinflussen weder Text noch Zählung', () => {
  // „gilt § 434 BGB entsprechend“: 27 UTF-16-Einheiten; „§ 434“ 5–10, „§ 434 BGB“ 5–14.
  const varianten: [string, string, { start: number; ende: number } | undefined][] = [
    [
      'Tag um § 434',
      'gilt <verweis norm="§ 434">§ 434</verweis> BGB entsprechend',
      { start: 5, ende: 10 },
    ],
    [
      'Tag um § 434 BGB',
      'gilt <verweis norm="§ 434">§ 434 BGB</verweis> entsprechend',
      { start: 5, ende: 14 },
    ],
    ['ohne Tag', 'gilt § 434 BGB entsprechend', undefined],
    [
      'mehrere Attribute',
      'gilt <verweis norm="§ 434" gesetz="BGB" normgeber="de-bund">§ 434</verweis> BGB entsprechend',
      { start: 5, ende: 10 },
    ],
    [
      'Einrückung und Umbruch um das Tag',
      '\n      gilt\n      <verweis norm="§ 434">§ 434</verweis>\n      BGB entsprechend\n    ',
      { start: 5, ende: 10 },
    ],
  ];
  const textstelle = (start: number, ende: number) => ({
    pfad: { typ: 'normtext' as const, absatz: '(1)', satz: 1 },
    zeichenbereichStart: start,
    zeichenbereichEnde: ende,
  });

  it.each(varianten)('liefert dieselbe Zeichenfolge und Zählung: %s', (_name, satz, verweis) => {
    const n = norm(
      `<absatz zahl="(1)"><satz zahl="1">${satz}</satz><satz zahl="2">Weiteres folgt.</satz></absatz>`,
    );
    expect(n.absaetze[0]?.saetze.map((s) => s.text)).toEqual([
      'gilt § 434 BGB entsprechend',
      'Weiteres folgt.',
    ]);
    expect(normTextLaenge(n)).toBe(42);
    expect(aktuellerTextAnPfad(n, textstelle(11, 27))).toBe('BGB entsprechend');
    // Der Bezugstext folgt dem dargestellten Text mit längengleichem Umbruchschutz.
    expect(aktuellerTextAnPfad(n, textstelle(0, 27))).toBe(
      schuetzeLeerzeichen('gilt § 434 BGB entsprechend'),
    );
    expect(n.getaggteVerweise?.[0]?.textstelle).toMatchObject(
      verweis ? { zeichenbereichStart: verweis.start, zeichenbereichEnde: verweis.ende } : {},
    );
    expect(n.getaggteVerweise ?? []).toHaveLength(verweis ? 1 : 0);
  });

  it.each([
    'Es gilt § 434 entsprechend.',
    'Es gilt <verweis norm="§ 434">§ 434</verweis> entsprechend.',
    'Es gilt <verweis norm="§ 434" gesetz="BGB" normgeber="de-bund">§ 434</verweis> entsprechend.',
    'Es gilt <verweis norm="§ 434">§ 434 entsprechend</verweis>.',
    'Es gilt\n  <verweis norm="§ 434">\n    § 434\n  </verweis>\n  entsprechend.',
  ])('zählt „Es gilt § 434 entsprechend.“ mit 27 Zeichen: %s', (satz) => {
    const n = norm(`<absatz><satz zahl="1">${satz}</satz></absatz>`);
    expect(n.absaetze[0]?.saetze[0]?.text).toBe('Es gilt § 434 entsprechend.');
    expect(normTextLaenge(n)).toBe(27);
  });
});
