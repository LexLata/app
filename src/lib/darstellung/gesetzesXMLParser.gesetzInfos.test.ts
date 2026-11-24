// gesetzesXMLParser.gesetzInfos.test.ts
//
// Tests für parseGesetzesXML() (gesetzesXMLParser.ts) – Fokus: Gesetz-Ebene
// (Wurzelelement-Validierung, <infos>-Felder, Fehler-/Kantenfälle). Bisher
// nur über den migrierten eintragsKette-Test indirekt abgedeckt (dort nur
// als Vehikel für die Eintrags-Kette, keine gezielte Prüfung der
// Gesetz-Ebene selbst). Teil einer Aufteilung in vier fokussierte Dateien
// (siehe auch .gliederung.test.ts, .text.test.ts, .verweise.test.ts) statt
// einer einzigen sehr großen Datei.

import { describe, it, expect, vi } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';

function gesetzXml(infosInner: string, inhaltInner = ''): string {
  return `<?xml version="1.0"?><gesetz id="g1"><infos>${infosInner}${infosInner.includes('<normgeber>') ? '' : '<normgeber>de-bund</normgeber>'}</infos><inhalt>${inhaltInner}</inhalt></gesetz>`;
}

describe('parseGesetzesXML – Fehler-/Kantenfälle (gibt null zurück statt zu werfen)', () => {
  it('kaputtes/nicht wohlgeformtes XML → null', () => {
    expect(parseGesetzesXML('<kurztitel><<<broken')).toBeNull();
  });

  it('falsches Wurzelelement (nicht <gesetz>) → null', () => {
    expect(parseGesetzesXML('<?xml version="1.0"?><anderes></anderes>')).toBeNull();
  });

  it('EDGE CASE: falsches Wurzelelement, das ANSONSTEN eine vollständig gültige infos/inhalt-Struktur trägt → trotzdem null (der Wurzelelement-Check darf nicht nur zufällig über einen späteren fehlenden-infos-Check "mitgetötet" werden)', () => {
    const xml =
      '<?xml version="1.0"?><anderes><infos><langtitel>T</langtitel><gesetz>K</kurztitel></infos><inhalt></inhalt></anderes>';
    expect(parseGesetzesXML(xml)).toBeNull();
  });

  it('fehlendes <infos>-Element → null', () => {
    expect(
      parseGesetzesXML('<?xml version="1.0"?><gesetz id="g1"><inhalt></inhalt></gesetz>'),
    ).toBeNull();
  });

  it('<infos> ohne langtitel und kurztitel → null', () => {
    expect(parseGesetzesXML(gesetzXml('<fundstelle>X</fundstelle>'))).toBeNull();
  });

  it('leerer String → null', () => {
    // War bis zur Ergänzung des documentElement-Guards ein TypeError statt
    // eines sauberen null-Rückgabewerts (linkedom liefert bei leerem Input
    // documentElement===null statt eines <parsererror>-Elements, siehe
    // Chatverlauf). Jetzt korrekt abgesichert.
    expect(parseGesetzesXML('')).toBeNull();
  });
});

describe('parseGesetzesXML – Pflichtfeld kurztitel; langtitel ist optional', () => {
  it.each(['', 'A_B', 'abcdefghijklmnopqrstu'])(
    'liefert bei vorhandenem ungültigem Normgeber %s null statt zu werfen',
    (normgeber) => {
      expect(
        parseGesetzesXML(gesetzXml(`<kurztitel>K</kurztitel><normgeber>${normgeber}</normgeber>`)),
      ).toBeNull();
    },
  );
  it('lehnt fehlenden Normgeber unabhängig von quelle ab', () => {
    const gesetz = parseGesetzesXML(
      '<gesetz><infos><kurztitel>K</kurztitel><datenquelle name="Bundesrecht"/></infos><inhalt/></gesetz>',
    );
    expect(gesetz).toBeNull();
  });
  it('liest nur gültige Normgeber und leitet sie nicht aus dem Anzeigetext ab', () => {
    expect(
      parseGesetzesXML(
        gesetzXml(
          '<langtitel>T</langtitel><kurztitel>K</kurztitel><datenquelle name="Landesrecht BW"/><normgeber>eu</normgeber>',
        ),
      )?.normgeber,
    ).toBe('eu');
    expect(
      parseGesetzesXML(
        gesetzXml(
          '<langtitel>T</langtitel><kurztitel>K</kurztitel><datenquelle name="Landesrecht BW"/><normgeber>fremd</normgeber>',
        ),
      )?.normgeber,
    ).toBe('fremd');
  });
  it('nur langtitel gesetzt: fehlender kurztitel wird nicht ersetzt', () => {
    const g = parseGesetzesXML(gesetzXml('<langtitel>Langer Titel</langtitel>'));
    expect(g).toBeNull();
  });

  it('nur kurztitel gesetzt: langtitel bleibt leerer String', () => {
    const g = parseGesetzesXML(gesetzXml('<kurztitel>KT</kurztitel>'));
    expect(g).not.toBeNull();
    expect(g!.kurztitel).toBe('KT');
    expect(g!.langtitel).toBe('');
  });

  it('trägt bei fehlendem Wurzelattribut keine eigene Kennung', () => {
    const g = parseGesetzesXML(
      '<?xml version="1.0"?><gesetz><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos><inhalt></inhalt></gesetz>',
    );
    expect(g).not.toBeNull();
    expect(g).not.toHaveProperty('id');
  });

  it('ignoriert ein unbekanntes id-Attribut am Wurzelelement', () => {
    const g = parseGesetzesXML(gesetzXml('<langtitel>T</langtitel><kurztitel>K</kurztitel>'));
    expect(g).not.toHaveProperty('id');
  });
});

describe('parseGesetzesXML – alle optionalen <infos><normgeber>de-bund</normgeber>-Felder', () => {
  it('liest letzteNeuerung und lässt sie bei fehlendem Tag offen', () => {
    expect(
      parseGesetzesXML(
        gesetzXml(
          '<langtitel>T</langtitel><kurztitel>K</kurztitel><letzteNeuerung>2024-01-01T10:00:00Z</letzteNeuerung>',
        ),
      )?.letzteNeuerung,
    ).toEqual(new Date('2024-01-01T10:00:00Z'));
    expect(parseGesetzesXML(gesetzXml('<langtitel>T</langtitel>'))?.letzteNeuerung).toBeUndefined();
  });
  it('liest fundstelle, ausfertigung, datenquelle, sprache, stand/aenderungsvermerk, stand/neugefasst, verarbeitungszeit, hatGliederungsartikel', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>Bürgerliches Gesetzbuch</langtitel><kurztitel>BGB</kurztitel>' +
          '<fundstelle>BGBl. I</fundstelle><ausfertigung>1896</ausfertigung>' +
          '<datenquelle name="bund"/><sprache>de</sprache>' +
          '<stand><aenderungsvermerk>2024</aenderungsvermerk><neugefasst>2002</neugefasst></stand>' +
          '<verarbeitungszeit>2024-01-01T10:00:00Z</verarbeitungszeit>',
      ),
    );
    expect(g).not.toBeNull();
    expect(g).toMatchObject({
      kurztitel: 'BGB',
      langtitel: 'Bürgerliches Gesetzbuch',
      fundstelle: 'BGBl. I',
      ausfertigung: '1896',
      datenquelle: { name: 'bund', url: undefined },
      sprache: 'de',
      aenderungsvermerk: '2024',
      neugefasst: '2002',
      hatGliederungsartikel: false,
    });
    expect(g!.verarbeitungszeit?.toISOString()).toBe('2024-01-01T10:00:00.000Z');
  });

  it('titel, kurztitel, fundstelle, ausfertigung, datenquelle, sprache und verarbeitungszeit werden getrimmt (umschließender Whitespace im XML-Text)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>  Bürgerliches Gesetzbuch  </langtitel><kurztitel>  BGB  </kurztitel>' +
          '<fundstelle>  BGBl. I  </fundstelle><ausfertigung>  1896  </ausfertigung>' +
          '<datenquelle name="  bund  "/><sprache>  de  </sprache>' +
          '<verarbeitungszeit>  2024-01-01T10:00:00Z  </verarbeitungszeit>',
      ),
    );
    expect(g).toMatchObject({
      langtitel: 'Bürgerliches Gesetzbuch',
      kurztitel: 'BGB',
      fundstelle: 'BGBl. I',
      ausfertigung: '1896',
      datenquelle: { name: 'bund', url: undefined },
      sprache: 'de',
    });
    expect(g!.verarbeitungszeit?.toISOString()).toBe('2024-01-01T10:00:00.000Z');
  });

  it('<stand>/<aenderungsvermerk> wird getrimmt; fehlt <neugefasst> im vorhandenen <stand>, bleibt neugefasst undefined statt zu werfen', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel><stand><aenderungsvermerk>  2024  </aenderungsvermerk></stand>',
      ),
    );
    expect(g).toMatchObject({ aenderungsvermerk: '2024', neugefasst: undefined });
  });

  it('<stand>/<neugefasst> wird getrimmt; fehlt <aenderungsvermerk> im vorhandenen <stand>, bleibt aenderungsvermerk undefined statt zu werfen', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel><stand><neugefasst>  2002  </neugefasst></stand>',
      ),
    );
    expect(g).toMatchObject({ aenderungsvermerk: undefined, neugefasst: '2002' });
  });

  it('alle optionalen Felder bleiben undefined, wenn nicht im XML vorhanden', () => {
    const g = parseGesetzesXML(gesetzXml('<langtitel>T</langtitel><kurztitel>K</kurztitel>'));
    expect(g).toMatchObject({
      fundstelle: undefined,
      ausfertigung: undefined,
      datenquelle: undefined,
      sprache: undefined,
      aenderungsvermerk: undefined,
      neugefasst: undefined,
      verarbeitungszeit: undefined,
    });
  });

  it('hatGliederungsartikel wird ausschließlich aus dem Normattribut erkannt', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel>',
        '<norm id="1" gliederungskennzahl="001"><bezeichnung>Art. 1</bezeichnung></norm>',
      ),
    );
    expect(g!.hatGliederungsartikel).toBe(true);
  });

  it('erzeugt bei fehlender verarbeitungszeit keinen Prüfzeitpunkt', () => {
    const g = parseGesetzesXML(gesetzXml('<langtitel>T</langtitel><kurztitel>K</kurztitel>'));
    expect(g!.verarbeitungszeit).toBeUndefined();
    expect(g).not.toHaveProperty('importDatum');
  });
});

describe('parseGesetzesXML – Inhalt-Elemente: Norm/Gliederung-Filterung', () => {
  it('EDGE CASE: eine Norm mit bezeichnung "Inhaltsübersicht" wird komplett übersprungen (case-insensitiv, getrimmt)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel>',
        '<norm id="iu"><bezeichnung>  Inhaltsübersicht  </bezeichnung></norm>' +
          '<norm id="n1"><bezeichnung>§ 1</bezeichnung></norm>',
      ),
    );
    expect(g!.elemente).toHaveLength(1);
    expect(g!.elemente[0]!.data.xmlId).toBe('n1');
  });

  it('EDGE CASE: "INHALTSÜBERSICHT" (Großschreibung) wird ebenfalls übersprungen', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel>',
        '<norm id="iu"><bezeichnung>INHALTSÜBERSICHT</bezeichnung></norm>',
      ),
    );
    expect(g!.elemente).toHaveLength(0);
  });

  it('eine ähnliche, aber nicht exakt passende bezeichnung wird NICHT übersprungen', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel>',
        '<norm id="n1"><bezeichnung>Inhaltsübersicht zum Dritten Buch</bezeichnung></norm>',
      ),
    );
    expect(g!.elemente).toHaveLength(1);
  });

  it('fehlendes <inhalt>-Element ergibt eine leere elemente-Liste (kein Absturz)', () => {
    const g = parseGesetzesXML(
      '<?xml version="1.0"?><gesetz id="g1"><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos></gesetz>',
    );
    expect(g).not.toBeNull();
    expect(g!.elemente).toEqual([]);
  });

  it('unbekannte Kind-Tags in <inhalt> werden ignoriert (weder norm noch gliederung)', () => {
    const g = parseGesetzesXML(
      gesetzXml('<langtitel>T</langtitel><kurztitel>K</kurztitel>', '<sonstwas>X</sonstwas>'),
    );
    expect(g!.elemente).toEqual([]);
  });
});

it.each([
  ['2024-01-01T10:00:00', '2024-01-01T10:00:00.000Z'],
  ['2024-07-01T12:00:00+02:00', '2024-07-01T10:00:00.000Z'],
  ['kein-datum', undefined],
  ['', undefined],
])('liest Verarbeitungszeit %s mit UTC-Annahme', (wert, erwartung) => {
  expect(
    parseGesetzesXML(
      gesetzXml(
        `<langtitel>T</langtitel><kurztitel>K</kurztitel><verarbeitungszeit>${wert}</verarbeitungszeit>`,
      ),
    )?.verarbeitungszeit?.toISOString(),
  ).toBe(erwartung);
});
it('unterstützt den alten Zeitstempel-Tag nicht zusätzlich', () => {
  expect(
    parseGesetzesXML(
      gesetzXml(
        '<langtitel>T</langtitel><kurztitel>K</kurztitel><importzeit>2024-01-01T10:00:00Z</importzeit>',
      ),
    )?.verarbeitungszeit,
  ).toBeUndefined();
});

it('kennt ausschließlich die neuen Gesetzmetadaten und Rumpf-Tags', () => {
  const gesetz = parseGesetzesXML(
    '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>K</kurztitel><titel>Alter Langtitel</titel><stand><geaendert>Alter Vermerk</geaendert></stand></infos><text><norm id="alt"><bezeichnung>§ 1</bezeichnung><inhalt>Alter Text</inhalt></norm></text></gesetz>',
  );
  expect(gesetz).toMatchObject({
    langtitel: '',
    aenderungsvermerk: undefined,
    hatGliederungsartikel: false,
    elemente: [],
  });
});

describe('parseGesetzesXML – manuell gepflegtes Normpräfix', () => {
  it.each([
    ['Can.', 'canon'],
    ['canon', 'canon'],
    ['c.', 'canon'],
    ['cann.', 'canon'],
    ['canons', 'canon'],
    ['canones', 'canon'],
    ['cc.', 'canon'],
    ['Kan.', 'canon'],
    ['Kanon', 'canon'],
    ['Kanones', 'canon'],
    ['§', 'paragraph'],
    ['§§', 'paragraph'],
    ['Art.', 'artikel'],
    ['Art', 'artikel'],
    ['Artikel', 'artikel'],
    ['Artt', 'artikel'],
    ['Artikels', 'artikel'],
    ['Artikeln', 'artikel'],
    ['  cAn. \n ', 'canon'],
  ])('liest %s als Familie %s ohne Warnung', (text, familie) => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const g = parseGesetzesXML(
        gesetzXml(`<kurztitel>K</kurztitel><normpraefix>${text}</normpraefix>`),
      );
      expect(g).toMatchObject({ normpraefix: familie });
      expect(warnung).not.toHaveBeenCalled();
    } finally {
      warnung.mockRestore();
    }
  });

  it.each(['unbekannt', 'can', ''])('ignoriert unbekannten Wert %s mit Logwarnung', (text) => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const g = parseGesetzesXML(
        gesetzXml(`<kurztitel>K</kurztitel><normpraefix>${text}</normpraefix>`),
      );
      expect(g).not.toBeNull();
      expect(g).toMatchObject({ normpraefix: undefined });
      expect(warnung).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('normpraefix'), text);
    } finally {
      warnung.mockRestore();
    }
  });

  it.each(['', '<metadaten><normpraefix>Can.</normpraefix></metadaten>'])(
    'ignoriert fehlendes oder verschachteltes Feld: %s',
    (extra) => {
      const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        expect(parseGesetzesXML(gesetzXml(`<kurztitel>K</kurztitel>${extra}`))).toMatchObject({
          normpraefix: undefined,
        });
        expect(warnung).not.toHaveBeenCalled();
      } finally {
        warnung.mockRestore();
      }
    },
  );
});

it.each([
  ['<datenquelle name="Quelle"/>', { name: 'Quelle', url: undefined }],
  ['<datenquelle url="https://test/"/>', { name: undefined, url: 'https://test/' }],
  ['<datenquelle name="Quelle" url="https://test/"/>', { name: 'Quelle', url: 'https://test/' }],
  ['', undefined],
])('liest die Datenquelle aus %s', (xml, erwartet) => {
  expect(parseGesetzesXML(gesetzXml('<kurztitel>G</kurztitel>' + xml))?.datenquelle).toEqual(
    erwartet,
  );
});
