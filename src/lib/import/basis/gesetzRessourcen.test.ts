// gesetzRessourcen.test.ts
// Gebündelte Gesetze und Titel: striktes XML, historische Zeitpunkte und reguläre Leser.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { pruefeNichtamtlicheTitelXML } from '@/lib/persistenz/gesetz/gesetz.index';
import { leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetz.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';

const europa = new URL('../../../../src-tauri/resources/europa/', import.meta.url);
describe('gebündelte GesetzesXML', () => {
  it('liest EMRK mit Normgeber Europarat und erhält ihren fachlichen Stand', () => {
    expect(readdirSync(europa).filter((name) => name.endsWith('.xml'))).toEqual([
      'EMRK_europarat.xml',
    ]);
    const xml = readFileSync(new URL('EMRK_europarat.xml', europa), 'utf8');
    pruefeXmlWohlgeformtheit(xml);
    expect(xml).not.toContain('<importzeit>');
    expect(xml).toContain('<letzteNeuerung>');
    expect(xml).not.toContain('<verarbeitungszeit>');
    const infos = leseGesetzInfos(xml);
    const darstellung = parseGesetzesXML(xml);
    expect(infos?.kurztitel).toBe('EMRK');
    expect(infos?.normgeber).toBe('europarat');
    expect(darstellung?.normgeber).toBe('europarat');
    expect(darstellung?.letzteNeuerung?.toISOString()).toBe('2026-11-05T16:12:28.000Z');
    expect(infos?.datenquelle).toEqual({
      name: 'European Court of Human Rights',
      url: 'https://www.echr.coe.int/documents/d/echr/convention_DEU',
    });
    expect(infos?.verarbeitungszeit).toBeUndefined();
    expect(darstellung?.verarbeitungszeit).toBeUndefined();
    const fachlicherStand = xml.match(
      /<stand>[\s\S]*?<aenderungsvermerk>([^<]*)<\/aenderungsvermerk>/,
    )?.[1];
    expect(fachlicherStand).toBeTruthy();
    expect(infos?.aenderungsvermerk).toBe(fachlicherStand);
    expect(darstellung?.aenderungsvermerk).toBe(fachlicherStand);
  });
  it('erhält den historischen Inhalts-Bearbeitungszeitpunkt nichtamtlicher Titel', () => {
    const xml = readFileSync(
      new URL(
        '../../../../src-tauri/resources/nichtamtliche-titel/de-bund/GG.xml',
        import.meta.url,
      ),
      'utf8',
    );
    pruefeXmlWohlgeformtheit(xml);
    expect(xml).toContain('<geaendert>2026-05-26T00:00:00Z</geaendert>');
    expect(xml).not.toContain('<verarbeitungszeit>');
    expect(pruefeNichtamtlicheTitelXML(xml, { kurztitel: 'GG', normgeber: 'de-bund' }).status).toBe(
      'gueltig',
    );
  });
});
