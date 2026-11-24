// importindex.schema.test.ts
// Schema-Vertrag des Importindex: Ausgabe des Indexschreibers und gebündelte Ressourcen gegen RelaxNG.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serialisiereImportindex } from '@/lib/import/importindex/importindex.index';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';

async function pruefe(format: string, xml: string, gueltig = true) {
  const ergebnis = await pruefeSchema(format, xml);
  expect(ergebnis.valid, JSON.stringify(ergebnis.errors)).toBe(gueltig);
}

describe('RelaxNG: Importindex', () => {
  it.each(['de-by', 'abcdefghijklmnopqrst'])(
    'erlaubt gültige Normgeber-Codes wie %s',
    async (normgeber) => {
      await pruefe(
        'importindex',
        serialisiereImportindex([], 'de-bund').replace('de-bund', normgeber),
      );
    },
  );
  it.each([
    'Foo Bar!',
    'Bund' /* normgeber-negativ: Alter Normgeber-Code wird zurückgewiesen. */,
    'de--by',
    '-de',
    'de-',
    'abcdefghijklmnopqrstu',
    '',
  ])('weist ungültigen Normgeber-Code %s zurück', async (normgeber) => {
    await pruefe(
      'importindex',
      serialisiereImportindex([], 'de-bund').replace('de-bund', normgeber),
      false,
    );
  });
  const ressourcen = new URL('../../../../src-tauri/resources/importindizes/', import.meta.url);
  it.each(readdirSync(ressourcen).filter((name) => name.endsWith('.xml')))(
    'validiert den vollständigen gebündelten Importindex %s',
    async (name) => {
      await pruefe('importindex', readFileSync(new URL(name, ressourcen), 'utf8'));
    },
  );
  it('validiert die tatsächliche Ausgabe des gemeinsamen Indexschreibers', async () => {
    await pruefe(
      'importindex',
      serialisiereImportindex(
        [
          {
            kurztitel: 'G & A',
            langtitel: 'Gesetz <A>',
            abrufkennung: 'g',
            duplikatArt: 'eg',
            duplikatVon: 'G',
            kurztitelArt: 'nummeriert',
            kurztitelBwZusatz: 'BW 2000',
          },
          { kurztitel: 'X', langtitel: '', abrufkennung: 'x', permalinkArt: 'schlecht' },
        ],
        'de-bw',
        'standard',
      ),
    );
  });
  it('erlaubt Metadaten und Attribute, ohne verschachtelte bekannte Felder mitzuzählen', async () => {
    await pruefe(
      'importindex',
      serialisiereImportindex([], 'de-bund')
        .replace(
          '<infos>',
          '<infos neu="ja"><zukunft><normgeber>kein echtes Feld</normgeber></zukunft>',
        )
        .replace('<inhalt>', '<inhalt neu="ja"><zukunft><gesetz/></zukunft>'),
    );
  });
  it.each([
    (xml: string) => xml.replace(/<infos>[\s\S]*?<\/infos>/, ''),
    (xml: string) => xml.replace('<normgeber>', '<normgeber>unbekannt</normgeber><normgeber>'),
    (xml: string) => xml.replace('<normgeber>de-bund</normgeber>', ''),
    (xml: string) => xml.replace(/<datenquelle[^>]*\/>/, ''),
    (xml: string) => xml.replace('<datenquelle ', '<datenquelle/><datenquelle '),
    (xml: string) => xml.replace('herkunft="nutzer"', 'herkunft="falsch"'),
    (xml: string) =>
      xml.replace(/<verarbeitungszeit([^>]*)>[^<]+/, '<verarbeitungszeit$1>kein Datum'),
    (xml: string) =>
      xml.replace(
        '<abrufkennung>g</abrufkennung>',
        '<abrufkennung>g</abrufkennung><abrufkennung>x</abrufkennung>',
      ),
    (xml: string) => xml.replace('<kurztitel>G</kurztitel>', ''),
    (xml: string) => xml.replace('version="1"', 'version="2"'),
  ])('weist ungültige bekannte Angaben und fehlende Pflichtfelder zurück', async (aendere) => {
    await pruefe(
      'importindex',
      aendere(
        serialisiereImportindex(
          [{ kurztitel: 'G', langtitel: 'Gesetz', abrufkennung: 'g' }],
          'de-bund',
        ),
      ),
      false,
    );
  });
});

it('weist den früheren link-Tag zurück', async () => {
  const xml = serialisiereImportindex(
    [{ kurztitel: 'G', langtitel: 'Gesetz', abrufkennung: 'g' }],
    'de-bund',
  );
  await pruefe('importindex', xml.replaceAll('abrufkennung', 'link'), false);
});
