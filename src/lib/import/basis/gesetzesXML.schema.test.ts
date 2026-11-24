// gesetzesXML.schema.test.ts
// Prüft Gesetzesressourcen, echte Schreiber-Ausgaben und geschützte Erweiterungsstellen.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baueGesetzesXML } from '@/lib/import/basis/basis.index';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';

const ordner = new URL('../../../../src-tauri/resources/europa/', import.meta.url);
const dateien = readdirSync(ordner).filter((name) => name.endsWith('.xml'));
const gesetz = (infos = '<kurztitel>G</kurztitel>', inhalt = '') =>
  `<gesetz version="1"><infos>${infos}${infos.includes('<normgeber>') ? '' : '<normgeber>de-bund</normgeber>'}</infos>${inhalt}</gesetz>`;
const norm = (attribute = '', kinder = '<bezeichnung>§ 1</bezeichnung>') =>
  `<inhalt><norm id="1" ${attribute}>${kinder}</norm></inhalt>`;

async function erwarteGueltig(xml: string, gueltig = true) {
  const ergebnis = await pruefeSchema('gesetz', xml);
  expect(ergebnis.valid, JSON.stringify(ergebnis.errors)).toBe(gueltig);
}

describe('RelaxNG: Gesetz', () => {
  it('erlaubt offene Typ- und Statuswerte an Norm und Absatz', async () => {
    await erwarteGueltig(
      gesetz(
        '<kurztitel>G</kurztitel>',
        norm(
          'typ="anlage" status="zukuenftig"',
          '<bezeichnung>§ 1</bezeichnung><text><absatz typ="neu">A</absatz><absatz typ="zwischenueberschrift">B</absatz></text>',
        ),
      ),
    );
  });

  it('erlaubt Zwischenüberschrift und Vorgänger-Hinweis', async () => {
    await erwarteGueltig(
      gesetz(
        '<kurztitel>G</kurztitel>',
        norm(
          'vorgaenger="ex-Artikel 6 EGV &amp; Alt"',
          '<bezeichnung>Art. 1</bezeichnung><text><absatz typ="zwischenueberschrift">Erste Lesung</absatz><absatz zahl="(1)">Inhalt.</absatz></text>',
        ),
      ),
    );
  });

  it('prüft die mitgelieferte EMRK', async () => {
    expect(dateien).toEqual(['EMRK_europarat.xml']);
    for (const datei of dateien) {
      await erwarteGueltig(readFileSync(new URL(encodeURIComponent(datei), ordner), 'utf8'));
    }
  }, 30_000);

  it('prüft die Ausgabe des GesetzesXML-Bauers', async () => {
    await erwarteGueltig(
      baueGesetzesXML({ kurztitel: 'G', langtitel: 'Gesetz & Recht', normgeber: 'de-bund' }, [
        {
          type: 'gliederung',
          bez: 'Teil 1',
          titel: 'Allgemeines',
          ebene: 1,
          gliederungskennzahl: '001',
          absaetze: [],
        },
        {
          type: 'paragraph',
          bez: '',
          normBezeichnung: '§ 1',
          ebene: 1,
          gliederungskennzahl: '',
          absaetze: [
            {
              nummer: '(1)',
              elemente: [
                { type: 'texte', saetze: ['Erster Satz.', 'Zweiter Satz.'] },
                { type: 'unterabsatz' },
                { type: 'texte', saetze: ['Weiterer Text.'] },
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          bez: '',
          normBezeichnung: '§ 2',
          titel: '(weggefallen)',
          ebene: 1,
          gliederungskennzahl: '',
          absaetze: [],
        },
        {
          type: 'paragraph',
          bez: '',
          normBezeichnung: 'E1',
          istErwaegungsgrund: true,
          ebene: 1,
          gliederungskennzahl: '',
          absaetze: [],
        },
      ]),
    );
  });

  it('erlaubt minimale Infos und offene Normgeber-Codes', async () => {
    await erwarteGueltig(gesetz());
    for (const name of [
      'unbekannt',
      'at-bund',
      'de-bund',
      'de-bw',
      'eu',
      'sachsen',
      'de-by',
      'de-by',
    ]) {
      await erwarteGueltig(gesetz(`<kurztitel>G</kurztitel><normgeber>${name}</normgeber>`));
    }
  });

  it.each(['Can.', 'canon', 'c.', '§', 'Art.', 'unbekannt', ''])(
    'erlaubt optionales Normpräfix %s',
    async (text) => {
      await erwarteGueltig(gesetz(`<kurztitel>G</kurztitel><normpraefix>${text}</normpraefix>`));
    },
  );

  it('weist doppelte Normpräfix-Felder zurück', async () => {
    await erwarteGueltig(
      gesetz(
        '<kurztitel>G</kurztitel><normpraefix>Can.</normpraefix><normpraefix>Art.</normpraefix>',
      ),
      false,
    );
  });

  describe.each(['satz'])('Positionszahlen an <%s>', (element) => {
    const mitZahl = (attribute: string) =>
      gesetz(
        '<kurztitel>G</kurztitel>',
        norm(
          '',
          `<bezeichnung>§ 1</bezeichnung><text><${element}${attribute}>Text.</${element}></text>`,
        ),
      );

    it.each(['', 'falsch', '-2', '0', '1.5', '01', '+1', ' 1 ', '١'])(
      'weist zahl="%s" zurück',
      async (zahl) => {
        await erwarteGueltig(mitZahl(` zahl="${zahl}"`), false);
      },
    );

    it.each(['1', '2', '123'])('erlaubt zahl="%s"', async (zahl) => {
      await erwarteGueltig(mitZahl(` zahl="${zahl}"`));
    });

    it('erlaubt ein ausgelassenes Attribut', async () => {
      await erwarteGueltig(mitZahl(''));
    });
  });

  it.each(['[1]', '1', '', 'freie Bezeichnung'])(
    'erlaubt Unterabsatzbezeichnung %j',
    async (zahl) => {
      await erwarteGueltig(
        gesetz(
          '<kurztitel>G</kurztitel>',
          norm(
            '',
            `<bezeichnung>§ 1</bezeichnung><text><unterabsatz zahl="${zahl}">Text.</unterabsatz></text>`,
          ),
        ),
      );
    },
  );

  it('erlaubt Metadaten, Inline-Hüllen und zusätzliche Attribute', async () => {
    await erwarteGueltig(
      `<gesetz version="1" zusatz="ja"><metadaten><infos/></metadaten><infos neu="ja"><kurztitel neu="ja">G</kurztitel><normgeber>de-bund</normgeber><zukunft><kurztitel>kein Eintrag</kurztitel></zukunft></infos><inhalt neu="ja"><zukunft/><norm id="1" neu="ja"><bezeichnung>§ 1</bezeichnung><metadaten><titel>kein Titel</titel></metadaten><text neu="ja"><absatz zahl="(1)"><satz zahl="1"><hervorhebung neu="ja">Text <verweis gesetz="G" normgeber="de-bund" norm="§ 1" neu="ja">§ 1</verweis><zeilenumbruch/>weiter</hervorhebung><nummer zahl="1."><litera buchstabe="a)">Liste</litera></nummer></satz></absatz></text></norm></inhalt></gesetz>`,
    );
  });

  it.each([
    gesetz(''),
    gesetz('<kurztitel> </kurztitel>'),
    gesetz('<kurztitel>G</kurztitel><kurztitel>H</kurztitel>'),
    gesetz('<kurztitel>G</kurztitel><langtitel>A</langtitel><langtitel>B</langtitel>'),
    gesetz(
      '<kurztitel>G</kurztitel><stand><neugefasst>A</neugefasst><neugefasst>B</neugefasst></stand>',
    ),
    gesetz().replace('version="1"', 'version="2"'),
    gesetz().replace(' version="1"', ''),
    gesetz('<kurztitel>G</kurztitel>', norm('gliederungskennzahl="01"')),
    gesetz(
      '<kurztitel>G</kurztitel>',
      '<inhalt><gliederung gliederungskennzahl="001x"><bezeichnung>Teil</bezeichnung></gliederung></inhalt>',
    ),
    gesetz(
      '<kurztitel>G</kurztitel>',
      norm('', '<bezeichnung>A</bezeichnung><bezeichnung>B</bezeichnung>'),
    ),
    gesetz('<kurztitel>G</kurztitel>', norm('', '<bezeichnung>A</bezeichnung><text/><text/>')),
    ...['', 'Bund Land', 'Bund_Land', 'aaaaaaaaaaaaaaaaaaaaa', 'A²'].map((name) =>
      gesetz(`<kurztitel>G</kurztitel><normgeber>${name}</normgeber>`),
    ),
    gesetz(
      '<kurztitel>G</kurztitel>',
      norm(
        '',
        '<bezeichnung>A</bezeichnung><text><neu><verweis normgeber="A_B">X</verweis></neu></text>',
      ),
    ),
  ])('weist ungültige bekannte Angaben zurück: %s', async (xml) => {
    await erwarteGueltig(xml, false);
  });
});

it('weist fehlenden Normgeber zurück und erhält optionale Normgeber an getaggten Verweisen', async () => {
  await erwarteGueltig(
    '<gesetz version="1"><infos><kurztitel>G</kurztitel></infos><inhalt/></gesetz>',
    false,
  );
  await erwarteGueltig(
    gesetz(
      '<kurztitel>G</kurztitel>',
      norm('', '<bezeichnung>§ 1</bezeichnung><text><verweis gesetz="X">X</verweis></text>'),
    ),
  );
});

// Gezielte Negativfälle: alte Normgeberwerte dürfen nicht als Codes gelesen werden.
it.each([
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'BW' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'Österreich',
])('Schema lehnt alten Normgeber %s ab', async (name) => {
  expect(
    (await pruefeSchema('gesetz', gesetz(`<kurztitel>G</kurztitel><normgeber>${name}</normgeber>`)))
      .valid,
  ).toBe(false);
});

it('erlaubt optionale Datenquellenattribute und schließt Textinhalt aus', async () => {
  for (const datenquelle of [
    '<datenquelle/>',
    '<datenquelle name="Quelle"/>',
    '<datenquelle url="https://test/"/>',
    '<datenquelle name="Quelle" url="https://test/"/>',
  ]) {
    await erwarteGueltig(gesetz('<kurztitel>G</kurztitel>' + datenquelle));
  }
  await erwarteGueltig(gesetz('<kurztitel>G</kurztitel><datenquelle>Text</datenquelle>'), false);
});

it.each(['1949', '1949-05', '2002-01-01'])('erlaubt Ausfertigung %s', async (datum) => {
  await erwarteGueltig(gesetz(`<kurztitel>G</kurztitel><ausfertigung>${datum}</ausfertigung>`));
});
it.each(['ohne Datum', '31.02.2002', '2002-02-31', '1949-13'])(
  'verwirft ungültige Ausfertigung %s',
  async (datum) => {
    await erwarteGueltig(
      gesetz(`<kurztitel>G</kurztitel><ausfertigung>${datum}</ausfertigung>`),
      false,
    );
  },
);
it.each([
  '<fassung art="konsolidiert"/>',
  '<fassung art="konsolidiert" stichtag="2016-05-04" erwaegungsgruendeErgaenzt="true"/>',
  '<fassung art="original"/>',
])('erlaubt strukturierte Fassung %s', async (fassung) => {
  await erwarteGueltig(gesetz(`<kurztitel>G</kurztitel>${fassung}`));
});
it.each([
  '<fassung/>',
  '<fassung art="unbekannt"/>',
  '<fassung art="original" stichtag="ohne Datum"/>',
  '<fassung art="konsolidiert" erwaegungsgruendeErgaenzt="false"/>',
])('verwirft ungültige Fassung %s', async (fassung) => {
  await erwarteGueltig(gesetz(`<kurztitel>G</kurztitel>${fassung}`), false);
});
