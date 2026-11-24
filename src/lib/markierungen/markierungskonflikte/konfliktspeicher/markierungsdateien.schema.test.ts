import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { bereichPfad, normtextPfad } from '@/test/gesetz/textpfadFabrik';

// markierungsdateien.schema.test.ts
// Prüft echte Markierungs- und Konfliktschreiber gegen ihre RelaxNG-Verträge.
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { describe, expect, it, vi } from 'vitest';
import { baueXML, parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import type {
  MarkierungsEintrag,
  GesetzKonflikte,
  Verweisziel,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  baueMarkierungskonflikteXML,
  liesMarkierungskonflikteXML,
  erstelleGespeicherteGesetzKonflikte,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { schreibeGesetzKonflikte } from './markierungskonflikteSpeicher.dateiZugriff';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';

let geschrieben = '';
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => undefined) }));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenSchreiben: async (_pfad: string, xml: string) => {
    geschrieben = xml;
  },
}));
const gesetz = { kurztitel: 'BGB & Sondertext', normgeber: 'de-bund' };
const text = {
  typ: 'unterstreichung',
  ausgangsstelle: normAusgangsstelle('§ & " 433'),

  bezug: {
    typ: 'bezugstext',
    textstelle: {
      pfad: normtextPfad({
        absatz: '(1)',
        unterabsatz: '[1]',
        satz: 2,
        eintraege: [
          { ebene: 'nummer', bezeichnung: '1', wiederholung: 2 },
          { ebene: 'litera', bezeichnung: 'a' },
          { ebene: 'nummer', bezeichnung: '3' },
        ],
        satzInEintrag: 4,
      }),
      zeichenbereichStart: 0,
      zeichenbereichEnde: 12,
    },
    bezugstext: 'Text & <Titel>',
  },
} satisfies MarkierungsEintrag;
const bereich: MarkierungsEintrag = {
  ...text,
  bezug: {
    typ: 'bezugstext',
    textstelle: {
      pfad: bereichPfad('nichtamtlicherTitel'),
      zeichenbereichStart: 0,
      zeichenbereichEnde: 12,
    },
    bezugstext: '',
  },
};
const verweis = {
  typ: 'verweismarkierung',
  ausgangsstelle: { typ: 'norm', bezeichnung: '§ 433' },
  bezug: { typ: 'pauschal', elementstand: { titel: 'Ausgang & Titel', textlaenge: 42 } },
  verweisinhalt: {
    verweistext: '§ 6; BGB; Abs. 3',
    verweisziele: [
      {
        typ: 'zielnorm',
        gesetz,
        bezeichnung: '§ 6',

        verweistextZeichenbereich: [0, 3],
        elementstand: { titel: 'Ziel', textlaenge: 12 },
      },
      { typ: 'ganzesGesetz', gesetz, verweistextZeichenbereich: [5, 8] },
    ],
  },
} satisfies MarkierungsEintrag;
function erstesVorkommen(xml: string, muster: RegExp): string {
  const treffer = xml.match(muster);
  if (!treffer) throw new Error(`Ausgabe enthält kein ${muster}`);
  return treffer[0];
}
async function ausgabe(format: string) {
  if (format === 'markierungen')
    return baueXML(gesetz, [
      text,
      bereich,
      { ...text, typ: 'hervorhebung' },
      verweis,
      { ...text, typ: 'verweismarkierung', verweisinhalt: verweis.verweisinhalt },
      { ...text, typ: 'kommentar', kommentarText: 'Kommentar & <Text>' },
      {
        bezug: { typ: 'pauschal', elementstand: testElementstand() },
        typ: 'kommentar',
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 434' },
        kommentarText: '',
      },
      {
        typ: 'kommentar',
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 435' },
        kommentarText: 'Stand',
        bezug: { typ: 'pauschal', elementstand: { titel: 'Titel', textlaenge: 11 } },
      },
    ]);
  const konflikte: GesetzKonflikte = {
    gesetz,
    nichtamtlicheTitelXmlFehlt: true,
    eintraege: [
      {
        eigenerKonflikt: 'pauschalerBezugFehlt',
        zielKonflikte: [],
        ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '010' },
        markierungstyp: 'kommentar',
        kommentarText: 'Überschrift',
      },
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
        ausgangsstelle: bereich.ausgangsstelle,
        markierungstyp: bereich.typ,
        textstelle: bereich.bezug.textstelle,
      },
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: (['zielGesetzFehlt', 'zielNormUnpassend', 'zielNormFehlt'] as const).map(
          (typ) => ({ typ, gesetz }),
        ),
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 433' },
        markierungstyp: 'unterstreichung',
        textstelle: text.bezug.textstelle,
      },
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 433' },
        markierungstyp: 'hervorhebung',
        textstelle: text.bezug.textstelle,
      },
      {
        eigenerKonflikt: 'pauschalerBezugFehlt',
        zielKonflikte: [],
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 434' },
        markierungstyp: 'kommentar',
        kommentarText: '',
      },
      {
        eigenerKonflikt: 'pauschalerBezugUnpassend',
        zielKonflikte: [],
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 435' },
        markierungstyp: 'verweismarkierung',
        verweistext: 'Zitat',
      },
    ],
  };
  await schreibeGesetzKonflikte(
    new Map([
      ['a', erstelleGespeicherteGesetzKonflikte(konflikte)],
      [
        'b',
        erstelleGespeicherteGesetzKonflikte({
          gesetz: { kurztitel: 'Fehlt', normgeber: 'de-bund' },
          fehlendesGesetz: true,
          eintraege: [],
        }),
      ],
    ]),
  );
  return geschrieben;
}
for (const format of ['markierungen', 'markierungskonflikte'])
  // Jede Negativprobe startet den externen WASM-Validator; alle Proben bleiben einzeln geprüft.
  describe(`${format}: RelaxNG`, { timeout: 30_000 }, () => {
    it('validiert alle Writer-Varianten und die vollständige Pfadkette', async () => {
      const xml = await ausgabe(format);
      expect(xml).toContain('<textstelle>');
      expect(xml).toContain('<zeichenbereich start="0" ende="12"/>');
      const result = await pruefeSchema(format, xml);
      expect(result.valid, JSON.stringify(result)).toBe(true);
      if (format === 'markierungskonflikte') {
        for (const tag of ['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'])
          expect(xml).toContain(`<${tag}>`);
        expect(xml).not.toContain('<markierung ');
        for (const art of [
          'gesetz-fehlt',
          'nichtamtliche-titel-xml-fehlt',
          'bezugstext-fehlt-oder-unpassend',
          'pauschaler-bezug-fehlt',
          'pauschaler-bezug-unpassend',
          'ziel-gesetz-fehlt',
          'ziel-norm-unpassend',
          'ziel-norm-fehlt',
        ])
          expect(xml).toContain(`<konflikt typ="${art}"`);
        const gelesen = [...liesMarkierungskonflikteXML(xml).gesetzKonflikte.values()];
        expect(gelesen.some((g) => g.fehlendesGesetz)).toBe(true);
        expect(gelesen.some((g) => g.nichtamtlicheTitelXmlFehlt)).toBe(true);
        const eintraege = gelesen.flatMap((g) => [...g.eintraege]);
        expect(new Set(eintraege.map((e) => e.markierungstyp))).toEqual(
          new Set(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung']),
        );
        expect(new Set(eintraege.map((e) => e.eigenerKonflikt).filter(Boolean))).toEqual(
          new Set([
            'bezugstextFehltOderUnpassend',
            'pauschalerBezugFehlt',
            'pauschalerBezugUnpassend',
          ]),
        );
        expect(new Set(eintraege.flatMap((e) => e.zielKonflikte.map((z) => z.typ)))).toEqual(
          new Set(['zielGesetzFehlt', 'zielNormUnpassend', 'zielNormFehlt']),
        );
      }
      if (format === 'markierungen')
        expect(
          parseEintraege(xml, gesetz).eintraege.find(
            (e) => e.typ === 'unterstreichung' && e.bezug.textstelle?.pfad.typ === 'normtext',
          )?.bezug.textstelle?.pfad.eintraege,
        ).toEqual(text.bezug.textstelle?.pfad.eintraege);
      for (const bereich of ['amtlicher-titel', 'bezeichnung'])
        expect(
          (
            await pruefeSchema(
              format,
              xml.replaceAll('nichtamtlicher-titel</bereich>', `${bereich}</bereich>`),
            )
          ).valid,
        ).toBe(true);
    });
    it('erlaubt einen leeren Absatz nur mit Wiederholungsindex', async () => {
      const xml = (await ausgabe(format)).replaceAll(
        '<absatz>(1)</absatz>',
        '<absatz wiederholung="2"/>',
      );
      expect((await pruefeSchema(format, xml)).valid).toBe(true);
      expect((await pruefeSchema(format, xml.replaceAll(' wiederholung="2"/>', '/>'))).valid).toBe(
        false,
      );
    });
    // Gezielte Negativfälle: alte Normgeberwerte sind keine Codes.
    it.each([
      'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
      'BW' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
      'Österreich',
    ])('lehnt alten Normgeber %s im Schema ab', async (normgeber) => {
      const xml = await ausgabe(format);
      expect(
        (
          await pruefeSchema(
            format,
            xml.replaceAll('normgeber="de-bund"', `normgeber="${normgeber}"`),
          )
        ).valid,
      ).toBe(false);
    });
    it('erlaubt neue Metadaten und Attribute ohne bekannte Pflichtfelder zu ersetzen', async () => {
      const xml = await ausgabe(format);
      const erweitert = xml
        .replace('version="1"', 'version="1" neu="ja"')
        .replace('<textstelle>', '<textstelle neu="ja"><neu><zeichenbereich/><satz/></neu>')
        .replace('<zeichenbereich ', '<zeichenbereich neu="ja" ')
        .replace('<infos>', '<infos neu="ja"><neu><gesetz/></neu>')
        .replace('<elementstand>', '<elementstand neu="ja"><neu><textlaenge/></neu>');
      expect((await pruefeSchema(format, erweitert)).valid).toBe(true);
      for (const normgeber of [
        'de-bund',
        'at-bund',
        'unbekannt',
        'at-bund',
        'de-by',
        'x1',
        '123',
        'aaaaaaaaaaaaaaaaaaaa',
      ])
        expect(
          (
            await pruefeSchema(
              format,
              xml.replaceAll('normgeber="de-bund"', `normgeber="${normgeber}"`),
            )
          ).valid,
        ).toBe(true);
      expect((await pruefeSchema(format, xml.replaceAll(' normgeber="de-bund"', ''))).valid).toBe(
        false,
      );
    });
    it('prüft die ausschließliche Überschriftenkennung ohne Präfix', async () => {
      const xml = await ausgabe(format);
      const bez = erstesVorkommen(xml, /<bezeichnung[^>]*>[^<]*<\/bezeichnung>/);
      const kennung = '<gliederungskennzahl>010020</gliederungskennzahl>';
      expect((await pruefeSchema(format, xml.replace(bez, kennung))).valid).toBe(true);
      for (const falsch of [
        bez + kennung,
        kennung + kennung,
        '<gliederungskennzahl praefix="§">010</gliederungskennzahl>',
        '<gliederungskennzahl>01</gliederungskennzahl>',
        '<gliederungskennzahl>abc</gliederungskennzahl>',
        '<gliederungskennzahl/>',
      ]) {
        expect((await pruefeSchema(format, xml.replace(bez, falsch))).valid, falsch).toBe(false);
      }
    });
    it('erlaubt volle Bezeichnungen und verbietet leere Bezeichnungen und Präfixattribute', async () => {
      const xml = await ausgabe(format);
      const bez = xml.match(/<bezeichnung[^>]*>[^<]*<\/bezeichnung>/)?.[0];
      if (!bez) throw new Error('Ausgangsstelle fehlt');
      for (const [stelle, gueltig] of [
        ['<bezeichnung>5</bezeichnung>', true],
        ['<bezeichnung>Art. 229 5</bezeichnung>', true],
        ['<bezeichnung>E25</bezeichnung>', true],
        ['<bezeichnung></bezeichnung>', false],
        ['<bezeichnung praefix="§">433</bezeichnung>', false],
      ] as const)
        expect((await pruefeSchema(format, xml.replace(bez, stelle))).valid, stelle).toBe(gueltig);
    });
    it('erlaubt volle Bezeichnungen und verbietet leere Werte und Zusatzattribute', async () => {
      const xml = await ausgabe(format);
      const ziel =
        format === 'markierungen'
          ? '<bezeichnung>§ 6</bezeichnung>'
          : '<bezeichnung>§ 433</bezeichnung>';
      expect(xml).toContain(ziel);
      for (const [bezeichnung, gueltig] of [
        ['<bezeichnung>§ 433</bezeichnung>', true],
        ['<bezeichnung>Art. 229 § 3</bezeichnung>', true],
        ['<bezeichnung></bezeichnung>', false],
        ['<bezeichnung praefix="§">6</bezeichnung>', false],
      ] as const)
        expect(
          (await pruefeSchema(format, xml.replace(ziel, bezeichnung))).valid,
          bezeichnung,
        ).toBe(gueltig);
    });
    it('weist fehlende Pflichtfelder, bekannte Duplikate und ungültige Werte zurück', async () => {
      const xml = await ausgabe(format);
      const bez = erstesVorkommen(xml, /<bezeichnung[^>]*>[^<]*<\/bezeichnung>/);
      const zeichenbereich = erstesVorkommen(xml, /<zeichenbereich[^>]*\/>/);
      const falsch = [
        xml.replace(' version="1"', ''),
        xml.replace('version="1"', 'version="2"'),
        xml.replace(bez, ''),
        xml.replace(bez, `<neu>${bez}</neu>`),
        xml.replace(bez, bez + bez),
        xml.replace(zeichenbereich, ''),
        xml.replace(zeichenbereich, zeichenbereich + zeichenbereich),
        xml.replace('start="0"', 'start="-1"'),
        xml.replace('wiederholung="2"', 'wiederholung="0"'),
        xml.replace('<bereich>nichtamtlicher-titel</bereich>', '<bereich>titel</bereich>'),
        xml.replace('<satz>2</satz>', '<satz>0</satz>'),
        xml.replace('<satz>2</satz>', '<satz>2</satz><satz>3</satz>'),
        ...['', 'a_b', 'aaaaaaaaaaaaaaaaaaaaa', '²'].map((n) =>
          xml.replace('normgeber="de-bund"', `normgeber="${n}"`),
        ),
      ];
      for (const name of [
        'textstelle',
        'absatz',
        'unterabsatz',
        'bereich',
        'verarbeitungszeit',
        'titel',
        'textlaenge',
        'verweisinhalt',
        'verweistext',
        'markierungstyp',
      ]) {
        const angabe = xml.match(new RegExp(`<${name}(?: [^>]*)?>[\\s\\S]*?</${name}>`))?.[0];
        if (angabe) falsch.push(xml.replace(angabe, angabe + angabe));
      }
      if (format === 'markierungen')
        falsch.push(
          xml.replace(/<verarbeitungszeit>[^<]+<\/verarbeitungszeit>/, ''),
          xml.replace('<textlaenge>42</textlaenge>', '<textlaenge>-1</textlaenge>'),
          xml.replace(
            '<textlaenge>42</textlaenge>',
            '<textlaenge>42</textlaenge><textlaenge>43</textlaenge>',
          ),
          xml.replace('<verweisziel>', '<zielnorm>').replace('</verweisziel>', '</zielnorm>'),
          xml.replace('<verweisziel>', '<verweisziel ohneZiel="true">'),
          xml
            .replace(/<bezeichnung>§ 6<\/bezeichnung>/, '')
            .replace('<gesetz normgeber="de-bund">BGB</gesetz>', ''),
        );
      else
        falsch.push(
          xml.replace('<konflikt typ="pauschaler-bezug-fehlt"/>', ''),
          xml.replace('typ="ziel-gesetz-fehlt"', 'typ="ungültig"'),
          xml.replace(' kurztitel="BGB &amp; Sondertext"', ''),
        );
      for (const dokument of falsch)
        expect((await pruefeSchema(format, dokument)).valid, dokument).toBe(false);
    });
  });

it('Kommentar: erlaubt Textbezug oder verpflichtenden Elementstand und verbietet ihre Kombination', async () => {
  const xml = baueXML(gesetz, [
    {
      typ: 'kommentar',
      ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
      kommentarText: 'Text',
      bezug: {
        typ: 'bezugstext',
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
        bezugstext: 'A',
      },
    },
  ]);
  const stand = '<elementstand><textlaenge>2</textlaenge></elementstand>';
  expect((await pruefeSchema('markierungen', xml)).valid).toBe(true);
  expect(
    (await pruefeSchema('markierungen', xml.replace('<kommentar>', '<kommentar>' + stand))).valid,
  ).toBe(false);
  const pauschal = baueXML(gesetz, [
    {
      typ: 'kommentar',
      ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
      kommentarText: 'Text',
      bezug: { typ: 'pauschal', elementstand: { textlaenge: 2 } },
    },
  ]);
  expect((await pruefeSchema('markierungen', pauschal)).valid).toBe(true);
  expect(
    (await pruefeSchema('markierungen', pauschal.replace('<textlaenge>2</textlaenge>', ''))).valid,
  ).toBe(false);
});

it('erlaubt veränderte und fehlende Zielnormen desselben Gesetzes in einem Konfliktblock', async () => {
  const konflikte = erstelleGespeicherteGesetzKonflikte({
    gesetz,
    eintraege: [
      {
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
        markierungstyp: 'verweismarkierung',
        verweistext: 'Art. 10, 999 GG',
        zielKonflikte: [
          { gesetz: { kurztitel: 'GG', normgeber: 'de-bund' }, typ: 'zielNormUnpassend' },
          { gesetz: { kurztitel: 'GG', normgeber: 'de-bund' }, typ: 'zielNormFehlt' },
        ],
      },
    ],
  });
  const xml = baueMarkierungskonflikteXML({
    gesetzKonflikte: new Map([['a', konflikte]]),
    pruefstatus: 'aktuell',
  });
  expect((await pruefeSchema('markierungskonflikte', xml)).valid).toBe(true);
});

it.each([
  '<kommentar><bezeichnung>§ 1</bezeichnung><kommentartext>Notiz</kommentartext></kommentar>',
  '<verweismarkierung><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>Abs. 3</verweistext></verweisinhalt></verweismarkierung>',
  '<kommentar><bezeichnung>§ 1</bezeichnung><normstand><normlaenge>1</normlaenge></normstand><kommentartext>Notiz</kommentartext></kommentar>',
])('Schema lehnt pauschale Markierung ohne gültigen Elementstand ab: %s', async (block) => {
  const xml = `<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz><verarbeitungszeit>2026-10-23T00:00:00Z</verarbeitungszeit></infos><inhalt>${block}</inhalt></markierungen>`;
  expect((await pruefeSchema('markierungen', xml)).valid).toBe(false);
});

it('Schemas weisen einen Kommentar mit dem früheren Element <text> zurück', async () => {
  const markierungen = `<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz><verarbeitungszeit>2026-10-23T00:00:00Z</verarbeitungszeit></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand>INHALT</kommentar></inhalt></markierungen>`;
  const konflikte = `<markierungskonflikte version="1" pruefstatus="aktuell"><gesetz kurztitel="BGB" normgeber="de-bund"><kommentar><konflikt typ="pauschaler-bezug-fehlt"/><bezeichnung>§ 1</bezeichnung>INHALT</kommentar></gesetz></markierungskonflikte>`;
  for (const [schema, xml] of [
    ['markierungen', markierungen],
    ['markierungskonflikte', konflikte],
  ] as const) {
    const gueltig = await pruefeSchema(
      schema,
      xml.replace('INHALT', '<kommentartext>N</kommentartext>'),
    );
    expect(gueltig.valid).toBe(true);
    expect((await pruefeSchema(schema, xml.replace('INHALT', '<text>N</text>'))).valid).toBe(false);
    const beide = xml.replace('INHALT', '<kommentartext>N</kommentartext><text>N</text>');
    expect((await pruefeSchema(schema, beide)).valid).toBe(false);
  }
});

it.each([
  ['kommentar', '<elementstand><textlaenge>0</textlaenge></elementstand>', ''],
  ['verweismarkierung', '<elementstand><textlaenge>0</textlaenge></elementstand>', ''],
  ['unterstreichung', '<elementstand><textlaenge>0</textlaenge></elementstand>', ''],
  ['hervorhebung', '<elementstand><textlaenge>0</textlaenge></elementstand>', ''],
  [
    'unterstreichung',
    '<textstelle><zeichenbereich start="0" ende="1"/></textstelle><bezugstext>x</bezugstext>',
    '<kommentartext>falsch</kommentartext>',
  ],
  [
    'kommentar',
    '<elementstand><textlaenge>0</textlaenge></elementstand>',
    '<kommentartext/><verweisinhalt><verweistext>x</verweistext></verweisinhalt>',
  ],
  [
    'verweismarkierung',
    '<elementstand><textlaenge>0</textlaenge></elementstand>',
    '<kommentartext/><verweisinhalt><verweistext>x</verweistext></verweisinhalt>',
  ],
])('erzwingt Pflichtinhalt und verbietet typfremden Inhalt bei %s', async (typ, bezug, inhalt) => {
  const xml = `<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz><verarbeitungszeit>2026-10-23T00:00:00Z</verarbeitungszeit></infos><inhalt><${typ}><bezeichnung>§ 1</bezeichnung>${bezug}${inhalt}</${typ}></inhalt></markierungen>`;
  expect((await pruefeSchema('markierungen', xml)).valid).toBe(false);
});

it.each([
  ['<absatz>1</absatz><satz>1</satz>', true, { absatz: '1', satz: 1 }],
  [
    '<absatz>1</absatz><unterabsatz>zwei</unterabsatz><nummer>2</nummer><satz>3</satz>',
    true,
    {
      absatz: '1',
      unterabsatz: 'zwei',
      eintraege: [{ ebene: 'nummer', bezeichnung: '2' }],
      satzInEintrag: 3,
    },
  ],
  ['<absatz wiederholung=" 1 ">1</absatz>', true, { absatz: '1', absatzWiederholung: 1 }],
  ['<absatz wiederholung=" +2 ">1</absatz>', true, { absatz: '1', absatzWiederholung: 2 }],
  ['<absatz wiederholung=" -0 ">1</absatz>', true, { absatz: '1' }],
  ['<absatz wiederholung="-1">1</absatz>', false, undefined],
  ['<absatz wiederholung="1.0">1</absatz>', false, undefined],
  ['<absatz wiederholung="1e1">1</absatz>', false, undefined],
  ['<absatz wiederholung="&#160;1&#160;">1</absatz>', false, undefined],
])('Schema und Leser vereinbaren Textpfad-Schreibweisen: %s', async (pfad, gueltig, erwartet) => {
  const xml = baueXML(gesetz, [text]).replace(
    /<textstelle>[\s\S]*?<\/textstelle>/,
    `<textstelle>${pfad}<zeichenbereich start="0" ende="1"/></textstelle>`,
  );
  expect((await pruefeSchema('markierungen', xml)).valid).toBe(gueltig);
  const gelesen = parseEintraege(xml);
  if (gueltig) {
    expect(gelesen.befunde).toEqual([]);
    expect(gelesen.eintraege[0]?.bezug.textstelle?.pfad).toEqual({ typ: 'normtext', ...erwartet });
  } else {
    expect(gelesen.eintraege).toEqual([]);
    expect(gelesen.befunde).toHaveLength(1);
  }
});

// Phase 1: Alle Verweiszielvarianten verwenden denselben Bereichstag.
it.each(['zielnorm', 'zielnormOhneElementstand', 'ganzesGesetz'] as const)(
  'schreibt den Verweistext-Zeichenbereich schemafähig für %s',
  async (typ) => {
    const ziel: Verweisziel =
      typ === 'ganzesGesetz'
        ? { gesetz, verweistextZeichenbereich: [1, 3], typ }
        : typ === 'zielnorm'
          ? {
              gesetz,
              verweistextZeichenbereich: [1, 3],
              typ,
              bezeichnung: '§ 6',
              elementstand: { titel: 'Ziel', textlaenge: 12 },
            }
          : { gesetz, verweistextZeichenbereich: [1, 3], typ, bezeichnung: '§ 6' };
    const xml = baueXML(gesetz, [
      { ...verweis, verweisinhalt: { verweistext: '§ 6', verweisziele: [ziel] } },
    ]);
    expect(xml).toContain('<verweistextZeichenbereich start="1" ende="3"/>');
    expect((await pruefeSchema('markierungen', xml)).valid).toBe(true);
  },
);

for (const format of ['markierungen', 'markierungskonflikte']) {
  it.each([
    ['<zeichenbereich start="0" ende="1"/><absatz>(1)</absatz>', false],
    ['<satz>1</satz><satz>2</satz><zeichenbereich start="0" ende="1"/>', false],
    [
      '<absatz>(1)</absatz><bereich>bezeichnung</bereich><zeichenbereich start="0" ende="1"/>',
      false,
    ],
    ['<satz>1</satz><nummer>2</nummer><zeichenbereich start="0" ende="1"/>', true],
    ['<nummer>2</nummer><satz>3</satz><zeichenbereich start="0" ende="1"/>', true],
    [
      '<satz>1</satz><nummer wiederholung="2">2</nummer><litera wiederholung="3">a</litera><satz>4</satz><zeichenbereich start="0" ende="1"/>',
      true,
    ],
    ['<bereich>bezeichnung</bereich><zeichenbereich start="0" ende="1"/>', true],
  ])(`${format}: feste Textstellenreihenfolge %s`, async (inhalt, gueltig) => {
    const xml = (await ausgabe(format)).replace(
      /<textstelle>[\s\S]*?<\/textstelle>/,
      `<textstelle>${inhalt}</textstelle>`,
    );
    expect((await pruefeSchema(format, xml)).valid).toBe(gueltig);
  });
}

it('Konfliktdatei gliedert Gesetz, Markierung und Gründe in der vereinbarten Reihenfolge', async () => {
  const xml = await ausgabe('markierungskonflikte');
  expect(xml).toContain('<konflikt typ="gesetz-fehlt"/>');
  expect(xml).toContain('<konflikt typ="nichtamtliche-titel-xml-fehlt"/>');
  expect(xml).toMatch(
    /<unterstreichung>\s*<konflikt typ="bezugstext-fehlt-oder-unpassend"\/>\s*<konflikt typ="ziel-gesetz-fehlt"[^>]*\/>\s*<konflikt typ="ziel-norm-unpassend"[^>]*\/>\s*<konflikt typ="ziel-norm-fehlt"[^>]*\/>\s*<bezeichnung>§ 433<\/bezeichnung>\s*<textstelle>/,
  );
  expect(xml).toMatch(
    /<kommentar>\s*<konflikt typ="pauschaler-bezug-fehlt"\/>\s*<bezeichnung>§ 434<\/bezeichnung>\s*<kommentartext><\/kommentartext>/,
  );
  expect(xml).toMatch(
    /<verweismarkierung>\s*<konflikt typ="pauschaler-bezug-unpassend"\/>\s*<bezeichnung>§ 435<\/bezeichnung>\s*<verweistext>Zitat<\/verweistext>/,
  );
  expect(xml).toContain('<gliederungskennzahl>010</gliederungskennzahl>');
  expect((await pruefeSchema('markierungskonflikte', xml)).valid).toBe(true);
  for (const falsch of [
    xml
      .replace('<konflikt typ="nichtamtliche-titel-xml-fehlt"/>', '')
      .replace(
        '</unterstreichung>',
        '</unterstreichung><konflikt typ="nichtamtliche-titel-xml-fehlt"/>',
      ),
    xml.replace(
      '<bezeichnung>§ 433</bezeichnung>',
      '<bezeichnung>§ 433</bezeichnung><konflikt typ="pauschaler-bezug-fehlt"/>',
    ),
  ])
    expect((await pruefeSchema('markierungskonflikte', falsch)).valid).toBe(false);
});

it('erlaubt Zeitstempel am Ende und geaendert nur für Kommentare und Verweise', async () => {
  const erstellt = '2026-11-05T10:00:00Z';
  const geaendert = '2026-11-05T11:00:00Z';
  const xml = baueXML(gesetz, [
    { ...text, erstellt },
    { ...text, typ: 'hervorhebung', erstellt },
    {
      typ: 'kommentar',
      ausgangsstelle: verweis.ausgangsstelle,
      bezug: verweis.bezug,
      kommentarText: 'Notiz',
      erstellt,
      geaendert,
    },
    { ...verweis, erstellt, geaendert },
  ]);
  expect((await pruefeSchema('markierungen', xml)).valid).toBe(true);
  const falsch = baueXML(gesetz, [{ ...text, erstellt }]).replace(
    '</unterstreichung>',
    `<geaendert>${geaendert}</geaendert></unterstreichung>`,
  );
  expect((await pruefeSchema('markierungen', falsch)).valid).toBe(false);
});
