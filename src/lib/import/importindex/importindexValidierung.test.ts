// importindexValidierung.test.ts
// Echte defekte XML-Dokumente und verbindliche Installationsprüfung.
import { describe, expect, it } from 'vitest';
import { validiereImportindex, parseImportindex } from './importindexValidierung';
const xml =
  '<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt/></importindex>';
describe('Indexvalidierung', () => {
  it.each([
    xml.slice(0, -14),
    xml.replace('<inhalt/>', '<inhalt><gesetz></inhalt></gesetz>'),
    xml.replace('version="1"', 'version="2"'),
    xml.replace('importindex', 'gesetz'),
    xml.replace('de-bund', 'unbekannt <!-- de-bw -->'),
    xml.replace('2026-01-01', '2026-02-30'),
    xml
      .replace('<normgeber>', '<inhalt><normgeber>')
      .replace('</normgeber>', '</normgeber></inhalt>'),
  ])('weist ungültige Dokumente zurück', (inhalt) => {
    expect(() => validiereImportindex(inhalt)).toThrow();
  });
  it('bestimmt Normgeber unabhängig von Kommentar und lässt leere Listen zu', () => {
    expect(
      validiereImportindex(xml.replace('<inhalt/>', '<!-- landesrecht-bw.de --><inhalt/>'))
        .kategorie,
    ).toBe('de-bund');
  });
  it('weist Bestand anderer Kategorie zurück', () => {
    expect(() => validiereImportindex(xml, 'de-bw')).toThrow();
  });
});

it('ignoriert zusätzliche Metadaten, Attribute und auskommentierte Indexeinträge', () => {
  const erweitert = `<importindex version='1' extra='x'><infos extra='x'><neu><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2030-01-01T00:00:00Z</verarbeitungszeit></neu><verarbeitungszeit extra='x'>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber extra='x'>de-bund</normgeber><datenquelle/></infos><neu><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/></neu><inhalt>
    <gesetz extra='x'><neu><kurztitel>FALSCH</kurztitel><abrufkennung>falsch</abrufkennung></neu><kurztitel extra='x'>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung extra='x'>https://example.test/bgb</abrufkennung></gesetz>
    <neu><gesetz><kurztitel>FALSCH</kurztitel><abrufkennung>falsch</abrufkennung></gesetz></neu>
    <!-- <gesetz><kurztitel>KOMMENTAR</kurztitel><abrufkennung>falsch</abrufkennung></gesetz> -->
  </inhalt></importindex>`;
  expect(validiereImportindex(erweitert).kategorie).toBe('de-bund');
  expect(parseImportindex(erweitert)).toEqual([
    {
      kurztitel: 'BGB',
      langtitel: 'Bürgerliches Gesetzbuch',
      abrufkennung: 'https://example.test/bgb',
    },
  ]);
});

it('liest keinen Importindex innerhalb unbekannter Metadaten', () => {
  const erweitert = xml.replace(
    '<inhalt/>',
    '<inhalt/><metadaten><importindex><inhalt><gesetz><kurztitel>FALSCH</kurztitel><abrufkennung>falsch</abrufkennung></gesetz></inhalt></importindex></metadaten>',
  );
  expect(parseImportindex(erweitert)).toEqual([]);
});

it('weist alte Root-Metadaten sowie fehlende und doppelte bekannte Infos zurück', () => {
  const alt = xml.replace('<infos>', '').replace('</infos>', '');
  for (const ungueltig of [
    alt,
    xml.replace('<infos>', '<metadaten><infos>').replace('</infos>', '</infos></metadaten>'),
    xml.replace('</infos>', '</infos><infos/>'),
    xml.replace(
      '</normgeber>',
      '</normgeber><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/>',
    ),
    xml.replace(
      '</verarbeitungszeit>',
      '</verarbeitungszeit><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit>',
    ),
  ])
    expect(() => validiereImportindex(ungueltig)).toThrow();
});

it('liest EU-Normgeber und Typ nach dem Serialisieren unverändert zurück', async () => {
  const { serialisiereImportindex } = await import('./importindexErstellung');
  const eintrag = {
    kurztitel: 'VO (EU) 2016/679',
    langtitel: 'Datenschutz',
    abrufkennung: '32016R0679',
    typ: 'durchfuehrungsverordnung',
  };
  const inhalt = serialisiereImportindex([eintrag], 'eu');
  expect(validiereImportindex(inhalt).kategorie).toBe('eu');
  expect(parseImportindex(inhalt)).toEqual([eintrag]);
});

it.each(['de-bund', 'de-bw', 'eu'] as const)(
  'ordnet Importindex-Kategorie %s und ihren Dateinamen umkehrbar zu',
  async (kategorie) => {
    const { dateinameFuerKategorie, kategorieFuerDateiname } =
      await import('./importindexValidierung');
    expect(dateinameFuerKategorie(kategorie)).toBe(`${kategorie}.xml`);
    expect(kategorieFuerDateiname(`${kategorie}.xml`)).toBe(kategorie);
  },
);

it('liest den Normgeber unabhängig vom Datenquellennamen und meldet fehlende oder fremde Normgeber', () => {
  expect(
    validiereImportindex(xml.replace('Gesetze im Internet', 'Unbekannter Anbieter'), 'de-bund')
      .kategorie,
  ).toBe('de-bund');
  expect(() =>
    validiereImportindex(xml.replace('<normgeber>de-bund</normgeber>', ''), 'de-bund'),
  ).toThrow(/Normgeber/);
  expect(() => validiereImportindex(xml.replace('de-bund', 'de-bw'), 'de-bund')).toThrow(
    /Normgeber/,
  );
});

it('liest die Abrufkennung und weist das frühere link-Format als Formatbefund zurück', () => {
  const inhalt = xml.replace(
    '<inhalt/>',
    '<inhalt><gesetz><kurztitel>G</kurztitel><langtitel>Gesetz</langtitel><abrufkennung>g</abrufkennung></gesetz></inhalt>',
  );
  expect(parseImportindex(inhalt)).toEqual([
    { kurztitel: 'G', langtitel: 'Gesetz', abrufkennung: 'g' },
  ]);
  expect(() => validiereImportindex(inhalt.replaceAll('abrufkennung', 'link'))).toThrow(
    /Ungültiges Importindex-XML/,
  );
});
