// gesetzVergleich.test.ts
// Inhaltsvergleiche erhalten feste Wurzelattribute und alle Norm-IDs.
import { describe, expect, it } from 'vitest';
import { gesetzesXMLOhneVeraenderlicheFelder } from './gesetzVergleich';

describe('gesetzesXMLOhneVeraenderlicheFelder', () => {
  it('erhält XML ohne veränderliche Felder unverändert', () => {
    const xml = '<gesetz version="1"><infos/><inhalt><norm id="norm-a"/></inhalt></gesetz>';
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml)).toBe(xml);
  });
  it('ignoriert unterschiedliche letzteNeuerung-Werte', () => {
    const xml = (zeit: string) =>
      `<gesetz><infos><letzteNeuerung>${zeit}</letzteNeuerung></infos></gesetz>`;
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('alt'))).toBe(
      gesetzesXMLOhneVeraenderlicheFelder(xml('neu')),
    );
  });
  it('normalisiert nur die Wurzel-ID unabhängig von weiteren Attributen', () => {
    const xml = (id: string, zeit: string) =>
      `<gesetz version="1" id="${id}" xml:space="preserve"><infos><verarbeitungszeit>${zeit}</verarbeitungszeit></infos><inhalt><norm id="norm-a"/></inhalt></gesetz>`;
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt'))).toBe(
      gesetzesXMLOhneVeraenderlicheFelder(xml('b', 'neu')),
    );
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt'))).toContain('version="1"');
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt'))).toContain('xml:space="preserve"');
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt'))).toContain('id="norm-a"');
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt'))).not.toBe(
      gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt').replace('version="1"', 'version="2"')),
    );
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt'))).not.toBe(
      gesetzesXMLOhneVeraenderlicheFelder(
        xml('a', 'alt').replace('xml:space="preserve"', 'xml:space="default"'),
      ),
    );
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt'))).not.toBe(
      gesetzesXMLOhneVeraenderlicheFelder(xml('a', 'alt').replace('norm-a', 'norm-b')),
    );
  });
});

it('gleicht nur direkte Referenzkopfangaben an und erhält Kommentare, CDATA und Normtext bytegetreu', () => {
  const xml =
    '<gesetz><infos><!-- <kurztitel>Kommentar</kurztitel> --><kurztitel>Bgb</kurztitel><normgeber>bund</normgeber></infos><inhalt><norm id="a"><text><![CDATA[<kurztitel>Bgb</kurztitel>]]><kurztitel>Bgb</kurztitel>Text Bgb</text></norm></inhalt></gesetz>';
  const erwartet = xml.replace(
    '<kurztitel>Bgb</kurztitel><normgeber>bund</normgeber>',
    '<kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber>',
  );
  expect(gesetzesXMLOhneVeraenderlicheFelder(xml, { kurztitel: 'BGB', normgeber: 'de-bund' })).toBe(
    erwartet,
  );
});
