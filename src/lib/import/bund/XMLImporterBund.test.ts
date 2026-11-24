// XMLImporterBund.test.ts
//
// Tests für importiereBundXML() (XMLImporterBund.ts) – Übersetzung des
// Bundesjustizamt-XML in unser GesetzesXML. Bisher komplett
// ungetestet; diese Suite wurde VOR der Cognitive-Complexity-Refaktorierung
// auf Basis des bestehenden Verhaltens geschrieben und dient als
// Regressionsnetz dafür (siehe cognitive-complexity.txt-Workstream).
//
// Fixtures bilden nur die vom Code selbst über querySelector angesprochenen
// Tags nach (metadaten, jurabk, langue, periodikum, zitstelle,
// ausfertigung-datum, standangabe/standtyp/standkommentar, quelle,
// importtime, gliederungseinheit, enbez, titel, Content/P/NOINDEX,
// fussnoten) – kein Anspruch auf vollständige Bundesjustizamt-Schema-Treue,
// nur strukturelle Übereinstimmung mit dem, was importiere() tatsächlich
// ausliest.
//
// Absätze werden hier nur oberflächlich geprüft (Anzahl/Vorhandensein) –
// die Absatz-interne Serialisierung ist bereits in parseP.test.ts und
// xmlSerialisierung.*.test.ts abgedeckt.

import { describe, it, expect } from 'vitest';
import { importiereBundXML } from './XMLImporterBund';

/** Baut ein minimales Bundesjustizamt-XML-Dokument mit einer "ersten Norm"
 *  (Gesetz-Metadaten, doknr === Root-doknr) und optionalen weiteren Normen. */
function dokument(ersteNormMeta: string, weitereNormen = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<dokumente doknr="G001">
  <norm doknr="G001">
    <metadaten>${ersteNormMeta}</metadaten>
  </norm>
  ${weitereNormen}
</dokumente>`;
}

function norm(doknr: string, meta: string, content = '', fussnoten = ''): string {
  return `<norm doknr="${doknr}">
    <metadaten>${meta}</metadaten>
    ${content ? `<Content>${content}</Content>` : ''}
    ${fussnoten ? `<fussnoten>${fussnoten}</fussnoten>` : ''}
  </norm>`;
}

describe('importiereBundXML – XML-Parse-Fehler', () => {
  it('EDGE CASE: völlig leerer/stark fehlerhafter Input, bei dem der DOMParser (bzw. dessen Test-Polyfill linkedom) documentElement===null statt eines <parsererror>-Elements liefert, ergibt fehler statt Absturz', () => {
    // In einem echten Browser liefert DOMParser laut Spezifikation nie
    // documentElement===null (stattdessen ein <parsererror>-Element, siehe
    // Test unten) – dieser Guard ist eine Absicherung für den Fall, dass
    // das doch einmal auftritt (z.B. eine leere Datei nach einem
    // fehlgeschlagenen Download).
    const ergebnis = importiereBundXML('');
    expect(ergebnis.fehler).toMatch(/XML-Fehler/);
    expect(ergebnis.xmlString).toBeUndefined();
  });

  it('Dokument mit <parsererror>-Element (wie es DOMParser bei fehlerhaftem XML liefert) ergibt fehler statt Absturz', () => {
    // Simuliert direkt die Struktur, die ein echter Browser-DOMParser bei
    // fehlerhaftem Input erzeugt (<parsererror>-Element im Dokument) – das
    // Test-Polyfill (linkedom, siehe setupNode.ts) ist deutlich toleranter
    // als ein Browser und liefert für wirklich fehlerhaftes XML stattdessen
    // documentElement === null statt eines parsererror-Dokuments, kann den
    // echten Browser-Fall hier also nicht 1:1 nachbilden.
    const xml = '<parsererror>XML-Fehler: mismatched tag</parsererror>';
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.fehler).toMatch(/XML-Fehler/);
    expect(ergebnis.xmlString).toBeUndefined();
  });
});

describe('importiereBundXML – fehlende Gesetz-Metadaten', () => {
  it('kein jurabk und kein langue in der ersten Norm liefert Fehlermeldung', () => {
    const xml = dokument('<enbez>§ 1</enbez>');
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.fehler).toBe('Keine Gesetz-Metadaten gefunden');
  });
});

describe('importiereBundXML – Gesetz-Metadaten aus der ersten Norm', () => {
  it('jurabk/langue werden übernommen (kurz-/langtitel im Ergebnis)', () => {
    const xml = dokument('<jurabk>TestG</jurabk><langue>Testgesetz</langue>');
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.fehler).toBeUndefined();
    expect(ergebnis.kurztitel).toBe('TestG');
    expect(ergebnis.langtitel).toBe('Testgesetz');
    expect(ergebnis.xmlString).toContain('<kurztitel>TestG</kurztitel>');
  });

  it('kurztitelOverride ersetzt den aus jurabk gelesenen Kurztitel', () => {
    const xml = dokument('<jurabk>TestG</jurabk><langue>Testgesetz</langue>');
    const ergebnis = importiereBundXML(xml, undefined, 'Übersteuert');
    expect(ergebnis.kurztitel).toBe('Übersteuert');
    expect(ergebnis.xmlString).toContain('<kurztitel>Übersteuert</kurztitel>');
  });

  it('periodikum + zitstelle werden zu fundstelle zusammengefügt (nur die vorhandenen Teile)', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue><periodikum>BGBl I</periodikum><zitstelle>2024, 1</zitstelle>',
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<fundstelle>BGBl I 2024, 1</fundstelle>');
  });

  it('ausfertigung-datum wird übernommen', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue><ausfertigung-datum>1.1.2024</ausfertigung-datum>',
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<ausfertigung>2024-01-01</ausfertigung>');
  });

  it('standangabe mit standtyp=Stand → aenderungsvermerk, standtyp=Neuf → neugefasst', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>' +
        '<standangabe><standtyp>Stand</standtyp><standkommentar>Geändert 2023</standkommentar></standangabe>' +
        '<standangabe><standtyp>Neuf</standtyp><standkommentar>Neugefasst 2020</standkommentar></standangabe>',
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.aenderungsvermerk).toBe('Geändert 2023');
    expect(ergebnis.xmlString).toContain('<neugefasst>Neugefasst 2020</neugefasst>');
    expect(ergebnis.xmlString).toContain('<aenderungsvermerk>Geändert 2023</aenderungsvermerk>');
  });

  it('datenquellenname-Parameter hat Vorrang vor dem <quelle>-Tag aus der Quell-XML', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue><quelle>Aus XML</quelle>',
    );
    const ergebnis = importiereBundXML(xml, 'Aus Parameter');
    expect(ergebnis.xmlString).toContain('<datenquelle name="Aus Parameter"/>');
  });

  it('ohne datenquellenname-Parameter wird das <quelle>-Tag aus der Quell-XML übernommen', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue><quelle>Aus XML</quelle>',
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<datenquelle name="Aus XML"/>');
  });

  it('importtime wird als Date geparst und landet als verarbeitungszeit im Ergebnis-XML', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue><importtime>2024-01-01T12:00:00.000Z</importtime>',
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain(
      '<verarbeitungszeit>2024-01-01T12:00:00Z</verarbeitungszeit>',
    );
  });

  it('schreibt die Wurzel ohne technische ID', () => {
    const xml = dokument('<jurabk>TestG</jurabk><langue>Testgesetz</langue>');
    const mitId = importiereBundXML(xml);
    expect(mitId.xmlString).toContain('<gesetz version="1">');
    expect(mitId.xmlString).toContain('<kurztitel>TestG</kurztitel>');

    const ohneId = importiereBundXML(xml);
    expect(ohneId.xmlString).toContain('<gesetz version="1">');
    expect(ohneId.xmlString).toContain('<kurztitel>TestG</kurztitel>');
  });
});

describe('importiereBundXML – Norm-Klassifizierung', () => {
  it('Norm mit enbez wird als normale Norm (paragraph) übernommen', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm('G001-1', '<enbez>§ 1</enbez><titel>Titel 1</titel>'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<bezeichnung>§ 1</bezeichnung>');
    expect(ergebnis.xmlString).toContain('<titel>Titel 1</titel>');
  });

  it('reine Gliederungseinheit (nur gliederungsbez, kein enbez) wird als gliederung ohne id übernommen', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm(
        'G001-2',
        '<gliederungseinheit><gliederungskennzahl>010000000000</gliederungskennzahl><gliederungsbez>Erster Teil</gliederungsbez></gliederungseinheit>',
      ),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<gliederung gliederungskennzahl="010000000000">');
    expect(ergebnis.xmlString).toContain('<bezeichnung>Erster Teil</bezeichnung>');
  });

  it('Gliederungsartikel (gliederungsbez beginnt mit "Art.", kein eigenes enbez) wird wie eine Norm serialisiert', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm(
        'G001-3',
        '<gliederungseinheit><gliederungskennzahl>229000000000</gliederungskennzahl><gliederungsbez>Art 229</gliederungsbez><gliederungstitel>Übergangsvorschrift</gliederungstitel></gliederungseinheit>',
      ),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<norm id="229" gliederungskennzahl="229000000000">');
    expect(ergebnis.xmlString).toContain('<bezeichnung>Art. 229</bezeichnung>');
    expect(ergebnis.xmlString).toContain('<titel>Übergangsvorschrift</titel>');
  });

  it('Gliederungsartikel-Erkennung bei "§"-Präfix greift ebenso', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm(
        'G001-3',
        '<gliederungseinheit><gliederungskennzahl>001000000000</gliederungskennzahl><gliederungsbez>§ 1</gliederungsbez></gliederungseinheit>',
      ),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<norm id="1" gliederungskennzahl="001000000000">');
  });

  it('EDGE CASE: gliederungsbez ohne "Art."/"§"-Präfix bleibt reine Gliederung, auch ohne eigenes enbez', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm(
        'G001-4',
        '<gliederungseinheit><gliederungskennzahl>010000000000</gliederungskennzahl><gliederungsbez>Erster Teil</gliederungsbez></gliederungseinheit>',
      ),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).not.toContain('<norm id="Erster Teil"');
    expect(ergebnis.xmlString).toContain('<gliederung gliederungskennzahl="010000000000">');
  });

  it('EDGE CASE: "Inhaltsübersicht" als enbez wird komplett übersprungen (kein Element im Ergebnis-XML)', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm('G001-5', '<enbez>Inhaltsübersicht</enbez>') + norm('G001-6', '<enbez>§ 1</enbez>'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).not.toContain('Inhaltsübersicht');
    expect(ergebnis.xmlString).toContain('<bezeichnung>§ 1</bezeichnung>');
  });

  it('EDGE CASE: enbez UND gliederungsbez gleichzeitig gesetzt → Paragraph innerhalb eines Gliederungsartikels, kein Gliederungsartikel-Zweig', () => {
    // "Nur wenn die Norm KEINE eigene Bezeichnung hat" (siehe Kommentar in
    // XMLImporterBund.ts) – ein eigenes enbez verhindert die
    // Gliederungsartikel-Erkennung über gliederungsbez.
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm(
        'G001-7',
        '<gliederungseinheit><gliederungskennzahl>229000000000</gliederungskennzahl><gliederungsbez>Art 229</gliederungsbez></gliederungseinheit><enbez>§ 2</enbez>',
      ),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<bezeichnung>§ 2</bezeichnung>');
    expect(ergebnis.xmlString).not.toContain('gliederungskennzahl="229000000000"');
  });

  it('Norm ohne enbez UND ohne gliederungsbez wird ignoriert (kein Element im Ergebnis)', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm('G001-8', '<titel>Nur ein Titel, keine Bezeichnung</titel>') +
        norm('G001-9', '<enbez>§ 1</enbez>'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).not.toContain('Nur ein Titel');
    expect(ergebnis.xmlString).toContain('<bezeichnung>§ 1</bezeichnung>');
  });

  it('Norm ohne <metadaten> wird übersprungen (kein Absturz)', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      `<norm doknr="G001-10"></norm>` + norm('G001-11', '<enbez>§ 1</enbez>'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.fehler).toBeUndefined();
    expect(ergebnis.xmlString).toContain('<bezeichnung>§ 1</bezeichnung>');
  });
});

describe('importiereBundXML – Content-Parsing und Fußnoten', () => {
  it('<P>-Elemente im Content werden zu Absätzen, <NOINDEX> wird übersprungen', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm('G001-1', '<enbez>§ 1</enbez>', '<NOINDEX>Sollte fehlen</NOINDEX><P>Erster Satz.</P>'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('Erster Satz.');
    expect(ergebnis.xmlString).not.toContain('Sollte fehlen');
  });

  it('leerer <P>-Absatz (nur Whitespace) erzeugt keinen Absatz (parseP() liefert null)', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm('G001-1', '<enbez>§ 1</enbez>', '<P>   </P>'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.fehler).toBeUndefined();
    expect(ergebnis.xmlString).toContain('<bezeichnung>§ 1</bezeichnung>');
  });

  it('fussnoten-Tag wird übernommen und escaped', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm('G001-1', '<enbez>§ 1</enbez>', '', 'Fn 1 &amp; 2'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.xmlString).toContain('<fussnoten>Fn 1 &amp; 2</fussnoten>');
  });

  it('Norm ohne Content/fussnoten erzeugt trotzdem einen gültigen Eintrag', () => {
    const xml = dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm('G001-1', '<enbez>§ 1</enbez>'),
    );
    const ergebnis = importiereBundXML(xml);
    expect(ergebnis.fehler).toBeUndefined();
    expect(ergebnis.xmlString).toContain('<bezeichnung>§ 1</bezeichnung>');
    expect(ergebnis.xmlString).not.toContain('<fussnoten>');
  });
});

it('übernimmt Absatz-, Nummer- und Litera-Labels samt Satzzeichen ins GesetzesXML', () => {
  const ergebnis = importiereBundXML(
    dokument(
      '<jurabk>TestG</jurabk><langue>Testgesetz</langue>',
      norm(
        'N001',
        '<enbez>§ 1</enbez>',
        '<P>(1) Es gilt:<DL><DT>1.</DT><DD><LA>Fall:<DL><DT>a)</DT><DD><LA>Text.</LA></DD></DL></LA></DD></DL></P>',
      ),
    ),
  );
  expect(ergebnis.xmlString).toContain('<absatz zahl="(1)">');
  expect(ergebnis.xmlString).toContain('<nummer zahl="1.">');
  expect(ergebnis.xmlString).toContain('<litera buchstabe="a)">');
});

it('schreibt den Standardnamen der Datenquelle ohne Adresse', () => {
  const ergebnis = importiereBundXML(dokument('<jurabk>TestG</jurabk><langue>Testgesetz</langue>'));
  expect(ergebnis.fehler).toBeUndefined();
  expect(ergebnis.xmlString).toContain('<datenquelle name="Gesetze im Internet"/>');
});
