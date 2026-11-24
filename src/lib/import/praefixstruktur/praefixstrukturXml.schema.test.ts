// praefixstrukturXml.schema.test.ts
// Schema und Pflegevertrag für Fixtures und sämtliche ausgelieferten Listen.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  liesPraefixstrukturXml,
  schreibePraefixstrukturXml,
  vergleicheKurztitel,
} from './praefixstrukturXml';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';
const zeit = new Date('2026-10-13T10:00:00Z');
const gueltig = schreibePraefixstrukturXml(
  'de-bund',
  [
    { kurztitel: 'BGB', praefixstruktur: 'paragraph' },
    { kurztitel: 'GG', praefixstruktur: 'artikel' },
  ],
  zeit,
);
async function pruefeDatei(name: string, xml: string) {
  expect((await pruefeSchema('praefixstrukturen', xml)).valid).toBe(true);
  expect(['de-bund.xml', 'de-bw.xml']).toContain(name);
  const normgeber = name === 'de-bund.xml' ? 'de-bund' : 'de-bw';
  const liste = liesPraefixstrukturXml(xml, normgeber);
  // Toleranter Leser darf Pflegefehler hier nicht verbergen.
  const wurzel = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  const inhalt = Array.from(wurzel.children).find((kind) => kind.tagName === 'inhalt');
  if (!inhalt) throw new Error(`${name} enthält kein <inhalt>`);
  const titel = Array.from(inhalt.children)
    .filter((kind) => kind.tagName === 'gesetz')
    .map((kind) => kind.textContent ?? '');
  expect(new Set(titel.map((titel) => titel.toLowerCase())).size).toBe(titel.length);
  expect(titel).toEqual([...titel].sort(vergleicheKurztitel));
  expect(liste.eintraege).toHaveLength(titel.length);
  expect(liste.eintraege.filter((e) => e.praefixstruktur === 'unklar' && !e.diagnosegrund)).toEqual(
    [],
  );
}
it('validiert die tatsächliche Ausgabe und beide Normgeber', async () => {
  await pruefeDatei('de-bund.xml', gueltig);
  await pruefeDatei('de-bw.xml', schreibePraefixstrukturXml('de-bw', [], zeit));
});
it('validiert Diagnosegründe an unklaren Gesetzen', async () => {
  const quelle = schreibePraefixstrukturXml(
    'de-bund',
    [{ kurztitel: 'Text', praefixstruktur: 'unklar', diagnosegrund: 'unbezeichnete-normen' }],
    zeit,
  );
  expect((await pruefeSchema('praefixstrukturen', quelle)).valid).toBe(true);
  expect(
    (await pruefeSchema('praefixstrukturen', quelle.replace('unbezeichnete-normen', 'unbekannt')))
      .valid,
  ).toBe(false);
  expect(
    (
      await pruefeSchema(
        'praefixstrukturen',
        quelle.replace('praefixstruktur="unklar"', 'praefixstruktur="artikel"'),
      )
    ).valid,
  ).toBe(false);
});
it.each(['de-bund', 'de-bw'] as const)('erlaubt roemisch im Schema für %s', async (normgeber) => {
  const quelle = schreibePraefixstrukturXml(
    normgeber,
    [{ kurztitel: 'Test', praefixstruktur: 'roemisch' }],
    zeit,
  );
  expect((await pruefeSchema('praefixstrukturen', quelle)).valid).toBe(true);
});
it('erlaubt unbekannte Metadaten an den vorgesehenen Erweiterungsstellen', async () => {
  const xml = gueltig
    .replace('<praefixstrukturen ', '<praefixstrukturen neu="ja" ')
    .replace('<infos>', '<infos extra="ja"><neu><normgeber>eu</normgeber></neu>')
    .replace('<inhalt>', '<inhalt><neu><gesetz>kein Eintrag</gesetz></neu>')
    .replace('<gesetz>BGB', '<gesetz extra="ja">BGB');
  await pruefeDatei('de-bund.xml', xml);
});
it.each([
  (xml: string) => xml.replace('version="1"', 'version="2"'),
  (xml: string) => xml.replace('<gesetz>BGB</gesetz>', '<gesetz/>'),
  (xml: string) => xml.replace('praefixstruktur="artikel"', 'praefixstruktur="paragraph"'),
  (xml: string) => xml.replace('praefixstruktur="artikel"', 'praefixstruktur="neu"'),
  (xml: string) => xml.replace('2026-10-13T10:00:00Z', 'kein Datum'),
  (xml: string) => xml.replace('<normgeber>de-bund</normgeber>', ''),
])('weist ungültige Schema-Fixtures zurück', async (aendere) => {
  expect((await pruefeSchema('praefixstrukturen', aendere(gueltig))).valid).toBe(false);
});
it.each([
  ['de-bund.xml', gueltig.replace('de-bund', 'de-bw')],
  ['de-bund.xml', gueltig.replace('praefixstruktur="artikel"', 'praefixstruktur="unklar"')],
  ['de-bw.xml', gueltig.replace('de-bund', 'de-bw').replace('artikel', 'gliederungsartikel')],
  [
    'de-bund.xml',
    gueltig.replace('<gesetz>BGB</gesetz>', '<gesetz>BGB</gesetz><gesetz>bgb</gesetz>'),
  ],
  ['de-bund.xml', gueltig.replace('<gesetz>BGB</gesetz>', '<gesetz>z</gesetz>')],
  ['eu.xml', gueltig],
])('erkennt Pflegeverstöße in %s', async (name, xml) => {
  await expect(pruefeDatei(name, xml)).rejects.toThrow();
});
it('prüft alle vorhandenen PräfixstrukturXML; fehlender Bestand ist erlaubt', async () => {
  const ordner = new URL('../../../../src-tauri/resources/praefixstrukturen/', import.meta.url);
  if (!existsSync(ordner)) return;
  async function pruefeOrdner(basis: URL, davor = ''): Promise<void> {
    for (const datei of readdirSync(basis, { withFileTypes: true })) {
      const pfad = new URL(encodeURIComponent(datei.name), basis);
      if (datei.isDirectory())
        await pruefeOrdner(
          new URL(`${encodeURIComponent(datei.name)}/`, basis),
          `${davor}${datei.name}/`,
        );
      else if (datei.isFile() && datei.name.endsWith('.xml'))
        await pruefeDatei(`${davor}${datei.name}`, readFileSync(pfad, 'utf8'));
    }
  }
  await pruefeOrdner(ordner);
});

it('erlaubt ausschließlich Fehlerstatus mit Fehlerart ohne Strukturbehauptung', async () => {
  const xml = schreibePraefixstrukturXml(
    'de-bund',
    [{ kurztitel: 'G', ermittlungsstatus: 'gescheitert', fehlerart: 'identifikation' }],
    zeit,
  );
  expect((await pruefeSchema('praefixstrukturen', xml)).valid).toBe(true);
  for (const ungueltig of [
    xml.replace(' fehlerart="identifikation"', ''),
    xml.replace('ermittlungsstatus="gescheitert"', 'praefixstruktur="artikel"'),
    xml.replace('fehlerart="identifikation"', 'fehlerart="unbekannt"'),
    xml.replace(
      'ermittlungsstatus="gescheitert"',
      'ermittlungsstatus="gescheitert" praefixstruktur="artikel"',
    ),
  ]) {
    expect((await pruefeSchema('praefixstrukturen', ungueltig)).valid).toBe(false);
  }
});

it.each(['regel', 'nummer'] as const)(
  'validiert die geschlossene Familie %s',
  async (praefixstruktur) => {
    const xml = schreibePraefixstrukturXml(
      'de-bund',
      [{ kurztitel: 'G', praefixstruktur }],
      new Date(),
    );
    expect((await pruefeSchema('praefixstrukturen', xml)).valid).toBe(true);
  },
);
it('validiert leer ausschließlich ohne Struktur-, Diagnose- oder Fehlerbehauptung', async () => {
  const xml = schreibePraefixstrukturXml(
    'de-bund',
    [{ kurztitel: 'G', ermittlungsstatus: 'leer' }],
    new Date(),
  );
  expect((await pruefeSchema('praefixstrukturen', xml)).valid).toBe(true);
  for (const attribut of [
    'praefixstruktur="artikel"',
    'diagnosegrund="keine-elemente"',
    'fehlerart="gesetz-laden"',
  ]) {
    expect(
      (
        await pruefeSchema(
          'praefixstrukturen',
          xml.replace('ermittlungsstatus="leer"', `ermittlungsstatus="leer" ${attribut}`),
        )
      ).valid,
    ).toBe(false);
  }
});

it.each(['arabisch', 'alphabetisch'] as const)(
  'validiert die neue Familie %s',
  async (praefixstruktur) => {
    for (const normgeber of ['de-bund', 'de-bw'] as const) {
      const quelle = schreibePraefixstrukturXml(
        normgeber,
        [{ kurztitel: 'Test', praefixstruktur }],
        zeit,
      );
      expect((await pruefeSchema('praefixstrukturen', quelle)).valid).toBe(true);
    }
  },
);

it.each(['de-by', 'at-bund', 'eu', 'europarat', 'abcdefghijklmnopqrst'])(
  'erlaubt gültigen Normgeber-Code %s im Schema unabhängig von der App-Unterstützung',
  async (normgeber) => {
    expect(
      (await pruefeSchema('praefixstrukturen', gueltig.replace('de-bund', normgeber))).valid,
    ).toBe(true);
  },
);
it.each([
  'Foo Bar!',
  'Bund' /* normgeber-negativ: Alter Normgeber-Code wird zurückgewiesen. */,
  'BW' /* normgeber-negativ: Alter Normgeber-Code wird zurückgewiesen. */,
  'Österreich',
  'de--by',
  '-de',
  'de-',
  'abcdefghijklmnopqrstu',
  '',
])('weist ungültigen Normgeber-Code %s im Schema zurück', async (normgeber) => {
  expect(
    (await pruefeSchema('praefixstrukturen', gueltig.replace('de-bund', normgeber))).valid,
  ).toBe(false);
});
