// grundbestand.test.ts
// Grundbestand: strenges Lesen und Abgleich mit Importindex und kuratierter Europaliste.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gleicheGrundbestandAb, leseGrundbestand } from './grundbestand';

const lies = (pfad: string) => readFileSync(new URL(`../../${pfad}`, import.meta.url), 'utf8');
const mitgelieferteListe = lies('docs/doku/testdaten/wichtigste-gesetze.xml');

const liste = (inhalt: string, kopf = 'version="1"') =>
  `<grundbestand ${kopf}><infos><geaendert>2026-11-18T12:00:00Z</geaendert></infos>${inhalt}</grundbestand>`;

/** Kleiner gültiger Importindex mit den angegebenen Kurztiteln. */
const testindex = (normgeber: string, ...kurztitel: string[]) =>
  `<importindex version="1"><infos><verarbeitungszeit>2026-11-19T00:00:00Z</verarbeitungszeit><normgeber>${normgeber}</normgeber><datenquelle name="Test"/></infos><inhalt>${kurztitel
    .map(
      (titel, i) =>
        `<gesetz><langtitel>Gesetz ${i}</langtitel><kurztitel>${titel}</kurztitel><abrufkennung>k${i}</abrufkennung></gesetz>`,
    )
    .join('')}</inhalt></importindex>`;
const europa = (...kurztitel: string[]) =>
  JSON.stringify(
    kurztitel.map((titel, i) => ({
      celex: `3201${i}R0001`,
      kurztitel: titel,
      langtitel: `Verordnung ${i}`,
    })),
  );

describe('Grundbestand lesen', () => {
  // Schemagültigkeit derselben Datei: schema-kopf-formate.test.ts.
  it('P1-A1: die mitgelieferte Liste wird vollständig gelesen', () => {
    const { gesetze, geaendert } = leseGrundbestand(mitgelieferteListe);
    expect(geaendert.toISOString()).toBe('2026-11-18T12:00:00.000Z');
    expect(gesetze['de-bund']).toHaveLength(317);
    expect(gesetze['de-bw']).toHaveLength(149);
    expect(gesetze.eu).toHaveLength(219);
    expect(gesetze['de-bund']).toContain('BGB');
    expect(gesetze['de-bw']).toContain('LBO');
  });

  it('liest Kurztitel in Dateireihenfolge; ein fehlendes Normgeberelement entfällt', () => {
    expect(
      leseGrundbestand(
        liste('<inhalt><bw><gesetz> LBO </gesetz><gesetz>PolG</gesetz></bw></inhalt>'),
      ),
    ).toEqual({
      geaendert: new Date('2026-11-18T12:00:00Z'),
      gesetze: { 'de-bw': ['LBO', 'PolG'] },
    });
  });

  it.each([
    [
      'unbekanntes Normgeberelement',
      liste('<inhalt><by><gesetz>X</gesetz></by></inhalt>'),
      /Unbekanntes Normgeberelement <by>/,
    ],
    [
      'leeren Kurztitel',
      liste('<inhalt><bund><gesetz> </gesetz></bund></inhalt>'),
      /Leerer Kurztitel in <bund>/,
    ],
    [
      'doppelten Kurztitel',
      liste('<inhalt><bund><gesetz>BGB</gesetz><gesetz>BGB</gesetz></bund></inhalt>'),
      /Doppelter Kurztitel in <bund>: BGB/,
    ],
    [
      'doppelten Kurztitel in anderer Schreibweise',
      liste('<inhalt><eu><gesetz>DSGVO</gesetz><gesetz>dsgvo</gesetz></eu></inhalt>'),
      /Doppelter Kurztitel in <eu>: dsgvo/,
    ],
    ['fehlende Version', liste('<inhalt/>', ''), /Attribut version fehlt/],
    ['falsche Version', liste('<inhalt/>', 'version="2"'), /Version 2 wird nicht unterstützt/],
    ['fehlendes <inhalt>', liste(''), /<inhalt> muss genau einmal/],
    [
      'doppeltes Normgeberelement',
      liste('<inhalt><bund/><bund/></inhalt>'),
      /<bund> steht mehrfach/,
    ],
    ['falsches Wurzelelement', '<gesetzesliste version="1"/>', /Wurzelelement muss <grundbestand>/],
    [
      'fehlendes <geaendert>',
      '<grundbestand version="1"><infos/><inhalt/></grundbestand>',
      /<geaendert> muss genau einmal/,
    ],
    [
      'zonenloses <geaendert>',
      liste('<inhalt/>').replace('12:00:00Z', '12:00:00'),
      /kein UTC-Zeitstempel/,
    ],
    ['nicht wohlgeformtes XML', '<grundbestand', /nicht wohlgeformt/],
  ])('P1-A2: lehnt %s mit eindeutiger Meldung ab', (_fall, xml, meldung) => {
    expect(() => leseGrundbestand(xml)).toThrow(meldung);
  });
});

describe('Grundbestand gegen Importindex', () => {
  it('P1-A3: jeder Eintrag der mitgelieferten Liste steht eindeutig im Bestand', () => {
    const { gesetze } = leseGrundbestand(mitgelieferteListe);
    const abgleich = gleicheGrundbestandAb(gesetze, {
      importindexBund: lies('src-tauri/resources/importindizes/de-bund.xml'),
      importindexBW: lies('src-tauri/resources/importindizes/de-bw.xml'),
      europaKuratiert: lies('src-tauri/resources/europa/europaKuratiert.json'),
    });
    expect({ fehlend: abgleich.fehlend, mehrdeutig: abgleich.mehrdeutig }).toEqual({
      fehlend: {},
      mehrdeutig: {},
    });
  });

  it('P1-A4: meldet mehrfach geführte und fehlende Kurztitel, liefert die Schreibweise des Importindex', () => {
    const abgleich = gleicheGrundbestandAb(
      { 'de-bw': ['lbo', 'VwRefG', 'Unbekannt'], eu: ['dsgvo'] },
      {
        importindexBund: testindex('de-bund'),
        importindexBW: testindex('de-bw', 'LBO', 'VwRefG', 'vwrefg'),
        europaKuratiert: europa('DSGVO'),
      },
    );
    expect(abgleich).toEqual({
      kurztitel: { 'de-bw': ['LBO'], eu: ['DSGVO'] },
      fehlend: { 'de-bw': ['Unbekannt'] },
      mehrdeutig: { 'de-bw': ['VwRefG'] },
    });
  });

  it('gleicht nur innerhalb desselben Normgebers ab', () => {
    const quellen = {
      importindexBund: testindex('de-bund'),
      importindexBW: testindex('de-bw', 'LBO'),
      europaKuratiert: europa(),
    };
    expect(gleicheGrundbestandAb({ 'de-bund': ['LBO'] }, quellen).fehlend).toEqual({
      'de-bund': ['LBO'],
    });
  });

  it('weist einen Importindex des falschen Normgebers zurück', () => {
    expect(() =>
      gleicheGrundbestandAb(
        { 'de-bund': ['BGB'] },
        {
          importindexBund: testindex('de-bw', 'BGB'),
          importindexBW: testindex('de-bw'),
          europaKuratiert: europa(),
        },
      ),
    ).toThrow(/Ungültiges Importindex-XML/);
  });
});
