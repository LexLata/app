// schema-kopf-formate.test.ts
// Schema-Verträge für Datenbankindex, Grundbestand, Prüfstatus, rohe Einstellungen und gepflegte nichtamtliche Titel.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baueEinstellungenXML } from '@/lib/einstellungen/einstellungen.index';
import { pruefeNichtamtlicheTitelXML } from '@/lib/persistenz/gesetz/gesetz.index';
import { pruefeSchema } from './schema-hilfe';

const speicher = new Map<string, string>();
beforeEach(() => {
  speicher.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => speicher.get(key) ?? null });
});
async function pruefe(format: string, xml: string, gueltig = true) {
  const ergebnis = await pruefeSchema(format, xml);
  expect(ergebnis.valid, JSON.stringify(ergebnis.errors)).toBe(gueltig);
}
const zeit = '<verarbeitungszeit>2026-10-03T10:15:30Z</verarbeitungszeit>';
const titel = (infos = '<gesetz normgeber="de-bund">GG</gesetz>', inhalt = '') =>
  `<nichtamtlicheTitel version="1"><infos>${infos}</infos><inhalt>${inhalt}</inhalt></nichtamtlicheTitel>`;

describe('RelaxNG: Markierungskonflikt-Prüfstatus', () => {
  it.each(['aktuell', 'ausstehend', 'fehlgeschlagen'])(
    'erlaubt %s auch ohne Befunde und mit unbekannten Erweiterungen',
    async (status) => {
      await pruefe(
        'markierungskonflikte',
        `<markierungskonflikte version="1" pruefstatus="${status}"/>`,
      );
      await pruefe(
        'markierungskonflikte',
        `<markierungskonflikte version="1" pruefstatus="${status}" neu="ja"><neu><gesetz/></neu></markierungskonflikte>`,
      );
    },
  );
  it.each(['', 'pruefstatus=""', 'pruefstatus="unbekannt"', 'pruefstatus="Aktuell"'])(
    'weist fehlenden oder ungültigen Status %s zurück',
    async (attribut) => {
      await pruefe(
        'markierungskonflikte',
        `<markierungskonflikte version="1" ${attribut}/>`,
        false,
      );
    },
  );
});

describe('RelaxNG: Einstellungen', () => {
  it('validiert echte rohe Speicherstrings und den Export ohne explizite Werte', async () => {
    await pruefe('einstellungen', baueEinstellungenXML());
    speicher.set('lexlata.farbschema', 'dunkel');
    speicher.set('lexlata.appAkzentfarbe', '"blau & grün"');
    speicher.set('lexlata.schriftgroesse', '15');
    speicher.set('lexlata.zitatRoemischeAbsaetze', 'true');
    const xml = baueEinstellungenXML();
    expect(xml).toContain('blau &amp; grün');
    await pruefe('einstellungen', xml);
  });
  it.each(['eigene', 'nativ', 'custom', 'ungültig', ''])(
    'lässt den exportierten Linux-Titelleistenrohwert %s unverändert zu',
    async (roh) => {
      speicher.set('lexlata.linuxTitelleistenPraeferenz', roh);
      await pruefe('einstellungen', baueEinstellungenXML());
    },
  );
  it.each(['aus', 'verweise', 'saetze', 'saetze-und-verweise'])(
    'validiert den exportierten Nachbereitungsmodus %s',
    async (modus) => {
      speicher.set('lexlata.nachbereitungBeiImport', modus);
      await pruefe('einstellungen', baueEinstellungenXML());
    },
  );
  it.each(['true', 'false', 'anderer-modus'])(
    'weist den ungültigen Nachbereitungsmodus %s zurück',
    async (modus) => {
      speicher.set('lexlata.nachbereitungBeiImport', modus);
      await pruefe('einstellungen', baueEinstellungenXML(), false);
    },
  );
  it('lässt neue Werte und Attribute außerhalb bekannter Einzelangaben zu', async () => {
    await pruefe(
      'einstellungen',
      `<einstellungen version="1" neu="ja">${zeit}<neu><farbschema>kein Eintrag</farbschema></neu><farbschema extra="ja">"dunkel"</farbschema></einstellungen>`,
    );
  });
  it.each([
    `<einstellungen version="1"><farbschema>x</farbschema></einstellungen>`,
    `<einstellungen version="2">${zeit}</einstellungen>`,
    `<einstellungen version="1">${zeit}${zeit}</einstellungen>`,
    `<einstellungen version="1">${zeit}<farbschema>x</farbschema><farbschema>y</farbschema></einstellungen>`,
    '<einstellungen version="1"><verarbeitungszeit>kein Datum</verarbeitungszeit></einstellungen>',
  ])('weist fehlende, doppelte und ungültige Kopfwerte zurück', async (xml) => {
    await pruefe('einstellungen', xml, false);
  });
});

describe('RelaxNG: nichtamtliche Titel', () => {
  it('validiert den tatsächlich gepflegten Bestand mit derselben vollständigen Referenz wie der Parser', async () => {
    const xml = readFileSync(
      new URL('../../src-tauri/resources/nichtamtliche-titel/de-bund/GG.xml', import.meta.url),
      'utf8',
    );
    await pruefe('nichtamtliche-titel', xml);
    expect(pruefeNichtamtlicheTitelXML(xml, { kurztitel: 'GG', normgeber: 'de-bund' }).status).toBe(
      'gueltig',
    );
  });
  it('erlaubt unbekannte Angaben und alle gültigen Normgeber-Codes', async () => {
    for (const normgeber of ['de-bund', 'de-by', 'x1', 'unbekannt']) {
      await pruefe(
        'nichtamtliche-titel',
        titel(
          `<gesetz${normgeber === undefined ? '' : ` normgeber="${normgeber}"`} neu="ja">G</gesetz><neu><gesetz normgeber="de-bund">kein Eintrag</gesetz></neu>`,
          '<norm neu="ja"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><neu><titel>kein Eintrag</titel></neu></norm>',
        ),
      );
    }
  });
  it.each([
    titel(''),
    titel('<gesetz/>'),
    titel('<gesetz normgeber="de-bund">G</gesetz><gesetz normgeber="de-bund">H</gesetz>'),
    titel('<gesetz>G</gesetz>'),
    titel('<gesetz normgeber="😀">G</gesetz>'),
    titel('<gesetz normgeber="abcdefghijklmnopqrstu">G</gesetz>'),
    titel('<gesetz normgeber="de-bund">G</gesetz>', '<norm><titel>Titel</titel></norm>'),
    titel(
      '<gesetz normgeber="de-bund">G</gesetz>',
      '<norm><bezeichnung>§ 1</bezeichnung><titel>A</titel><titel>B</titel></norm>',
    ),
    titel('<gesetz normgeber="de-bund">G</gesetz><geaendert>falsch</geaendert>'),
    titel().replace('version="1"', 'version="2"'),
  ])('weist unzulässige bekannte Angaben zurück', async (xml) => {
    await pruefe('nichtamtliche-titel', xml, false);
  });
});

describe('RelaxNG: Datenbankindex', () => {
  const zeitpunkt = '2026-10-05T04:12:00Z';
  const eintrag =
    '<gesetz><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber><letzteNeuerung>2026-08-14T09:00:00Z</letzteNeuerung></gesetz>';
  const index = (inhalt = eintrag) =>
    `<datenbankindex version="1"><infos><verarbeitungszeit>${zeitpunkt}</verarbeitungszeit></infos><inhalt>${inhalt}</inhalt></datenbankindex>`;

  it('validiert den vereinbarten Vertrag mit keinem, einem oder mehreren Gesetzen', async () => {
    for (const inhalt of ['', eintrag, eintrag + eintrag.replace('BGB', 'GG')]) {
      await pruefe('datenbankindex', index(inhalt));
    }
  });

  it('erlaubt unbekannte Attribute und verschachtelte Zusatzangaben auf allen Ebenen', async () => {
    let xml = index().replace('<datenbankindex ', '<datenbankindex neu="ja" ');
    for (const name of ['infos', 'inhalt', 'gesetz']) {
      xml = xml.replace(
        `<${name}>`,
        `<${name} neu="ja"><zukunft extra="ja">Text<${name}/></zukunft>`,
      );
    }
    for (const name of ['verarbeitungszeit', 'kurztitel', 'normgeber', 'letzteNeuerung']) {
      xml = xml.replace(`<${name}>`, `<${name} neu="ja">`);
    }
    await pruefe(
      'datenbankindex',
      xml.replace('</datenbankindex>', '<zukunft><infos/></zukunft></datenbankindex>'),
    );
  });

  it.each([
    'unbekannt',
    'at-bund',
    'de-bund',
    'de-bw',
    'de-by',
    'de-by',
    'x1',
    'aaaaaaaaaaaaaaaaaaaa',
  ])('erlaubt den offenen Normgeber %s', async (normgeber) => {
    await pruefe('datenbankindex', index().replace('de-bund', normgeber));
  });
  it.each(['', '😀', 'aaaaaaaaaaaaaaaaaaaaa', 'Bund!', 'a b', '²'])(
    'weist ungültigen Normgeber %s zurück',
    async (normgeber) => {
      await pruefe('datenbankindex', index().replace('de-bund', normgeber), false);
    },
  );

  it.each(['infos', 'inhalt', 'verarbeitungszeit', 'kurztitel', 'normgeber', 'letzteNeuerung'])(
    'weist fehlendes oder doppeltes Pflichtfeld %s zurück',
    async (name) => {
      const feld = index().match(new RegExp(`<${name}>[\\s\\S]*?</${name}>`))?.[0];
      expect(feld).toBeDefined();
      await pruefe('datenbankindex', index().replace(feld!, ''), false);
      await pruefe('datenbankindex', index().replace(feld!, feld! + feld!), false);
      await pruefe('datenbankindex', index().replace(feld!, `<zukunft>${feld}</zukunft>`), false);
    },
  );

  it.each(['', '2'])('weist fehlende oder falsche Version %s zurück', async (version) => {
    await pruefe(
      'datenbankindex',
      index().replace(' version="1"', version ? ` version="${version}"` : ''),
      false,
    );
  });
  it.each(['', '   '])('weist leeren Kurztitel zurück', async (kurztitel) => {
    await pruefe('datenbankindex', index().replace('BGB', kurztitel), false);
  });
  it.each(['verarbeitungszeit', 'letzteNeuerung'])(
    'erzwingt UTC-Z ohne Sekundenbruchteile für %s',
    async (name) => {
      for (const wert of [
        '2026-10-05T04:12:00+00:00',
        '2026-10-05T06:12:00+02:00',
        '2026-10-05T04:12:00',
        '2026-10-05T04:12:00.000Z',
        '2026-10-05T04:12:00.1Z',
        '2026-02-30T04:12:00Z',
        'kein Datum',
      ]) {
        await pruefe(
          'datenbankindex',
          index().replace(new RegExp(`<${name}>[^<]+`), `<${name}>${wert}`),
          false,
        );
      }
    },
  );
});

describe('RelaxNG: Grundbestand', () => {
  const geaendert = '<geaendert>2026-11-18T12:00:30Z</geaendert>';
  const liste = (inhalt = '<bund><gesetz>BGB</gesetz></bund>', version = ' version="1"') =>
    `<grundbestand${version}><infos>${geaendert}</infos><inhalt>${inhalt}</inhalt></grundbestand>`;

  it('P1-A1: validiert die mitgelieferte Liste', async () => {
    await pruefe(
      'grundbestand',
      readFileSync(
        new URL('../../docs/doku/testdaten/wichtigste-gesetze.xml', import.meta.url),
        'utf8',
      ),
    );
  });
  it('erlaubt fehlende Normgeber, leere Gruppen und Zusatzangaben in infos', async () => {
    await pruefe('grundbestand', liste(''));
    await pruefe('grundbestand', liste('<eu/><bw><gesetz>LBO</gesetz></bw>'));
    await pruefe('grundbestand', liste().replace('</infos>', '<quelle>Sartorius</quelle></infos>'));
  });
  it.each([
    ['unbekannten Normgeber', liste('<by><gesetz>X</gesetz></by>')],
    ['doppelten Normgeber', liste('<bund/><bund/>')],
    ['leeren Kurztitel', liste('<bund><gesetz> </gesetz></bund>')],
    ['fehlende Version', liste(undefined, '')],
    ['falsche Version', liste(undefined, ' version="2"')],
    ['fehlendes inhalt', `<grundbestand version="1"><infos>${geaendert}</infos></grundbestand>`],
    ['fehlendes geaendert', '<grundbestand version="1"><infos/><inhalt/></grundbestand>'],
    ['verarbeitungszeit statt geaendert', liste().replace(/geaendert/g, 'verarbeitungszeit')],
    ['zonenloses geaendert', liste().replace('30Z', '30')],
  ])('weist %s zurück', async (_fall, xml) => {
    await pruefe('grundbestand', xml, false);
  });
});

it('validiert die vier neuen Einstellungstags als bekannte Felder mit rohen Werten', async () => {
  for (const [tag, wert] of Object.entries({
    markierungenDeaktiviert: 'true',
    strukturKontextLeisteGroesse: 'klein',
    gesetzestextAkzentfarbe: 'orange',
    lesbareZeilenlaengeBreite: 'breit',
  }))
    speicher.set(`lexlata.${tag}`, wert);
  const xml = baueEinstellungenXML();
  for (const tag of [
    'markierungenDeaktiviert',
    'strukturKontextLeisteGroesse',
    'gesetzestextAkzentfarbe',
    'lesbareZeilenlaengeBreite',
  ])
    expect(xml).toContain(`<${tag}>`);
  await pruefe('einstellungen', xml);
});
it.each([
  'markierungenDeaktiviert',
  'strukturKontextLeisteGroesse',
  'gesetzestextAkzentfarbe',
  'lesbareZeilenlaengeBreite',
])('weist doppelte bekannte Einstellung %s zurück', async (tag) => {
  await pruefe(
    'einstellungen',
    `<einstellungen version="1">${zeit}<${tag}>true</${tag}><${tag}>false</${tag}></einstellungen>`,
    false,
  );
});

// Gezielte Negativfälle: alte Normgeberwerte sind keine Codes.
it.each([
  'de-bund',
  'at-bund',
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'BW' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'Österreich',
])('prüft Normgebercode %s in Titel und Datenbankindex', async (normgeber) => {
  const gueltig = normgeber === 'de-bund' || normgeber === 'at-bund';
  await pruefe(
    'nichtamtliche-titel',
    titel(`<gesetz normgeber="${normgeber}">G</gesetz>`),
    gueltig,
  );
  const xml = `<datenbankindex version="1"><infos>${zeit}</infos><inhalt><gesetz><kurztitel>G</kurztitel><normgeber>${normgeber}</normgeber><letzteNeuerung>2026-08-14T09:00:00Z</letzteNeuerung></gesetz></inhalt></datenbankindex>`;
  await pruefe('datenbankindex', xml, gueltig);
});
