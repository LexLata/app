// gesetzesXMLBauer.test.ts
//
// Tests für baueGesetzesXML() (gesetzesXMLBauer.ts) – Bau
// des vollständigen GesetzesXML-Strings (<gesetz>/<infos>/<inhalt>) aus
// Metadaten + gesammelter Normenliste. Fokus: <infos>-Feldauswahl je nach
// vorhandenen Metadaten, die drei Norm-Serialisierungszweige (reine
// Gliederung / Gliederungsartikel / normale Norm), die id-Vergabe inkl.
// Artikel-Kontext-Verkettung (siehe bezeichnungZuId.ts) und Kollisions-
// behandlung innerhalb eines Gesetzes.
//
// baueText() (Absatz-Ebene) wird hier bewusst nur mit einfachen,
// einsätzigen Absätzen verwendet – die volle Serialisierungslogik ist
// bereits in xmlSerialisierung.baueText.test.ts / .baueEintrag.test.ts
// abgedeckt.
//
// Reine String-Assertions ohne DOM-Parsing (im Unterschied zu
// gesetzesXMLNachbereiten.test.ts, das den XML-String zusätzlich zurück in
// ein DOM liest) – baueGesetzesXML() selbst arbeitet nicht mit DOM-APIs,
// daher genügt ein Vitest-Node-Lauf ohne linkedom-Polyfill für DIESE Datei;
// das globale setupNode.ts (siehe vitest.config.ts) ist trotzdem geladen,
// stört aber nicht.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, expectTypeOf, vi } from 'vitest';
import type { GesetzInfosFuerXML } from '@/lib/domain/gesetzInfos';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { baueGesetzesXML, istWeggefallenWortlaut, type GesammelteNorm } from './gesetzesXMLBauer';

it('verlangt den gemeinsamen stärkeren XML-Vertrag', () => {
  expectTypeOf<Parameters<typeof baueGesetzesXML>[0]>().toEqualTypeOf<GesetzInfosFuerXML>();
});

const FIXER_ZEITPUNKT = new Date('2024-01-01T00:00:00.000Z');

function infos(overrides: Partial<GesetzInfosFuerXML> = {}): GesetzInfosFuerXML {
  return {
    kurztitel: 'G',
    langtitel: 'Gesetz G',
    normgeber: 'de-bund',
    verarbeitungszeit: FIXER_ZEITPUNKT,
    ...overrides,
  };
}

describe('baueGesetzesXML – <infos>-Feldauswahl', () => {
  it('normalisiert das ausgeschriebene Ausfertigungsdatum', () => {
    expect(baueGesetzesXML(infos({ ausfertigung: '14. Oktober 2008' }), [])).toContain(
      '<ausfertigung>2008-10-14</ausfertigung>',
    );
  });
  it('lässt leere und ungültige Ausfertigung weg und erhält Neufassungstext', () => {
    expect(baueGesetzesXML(infos({ ausfertigung: '  ' }), [])).not.toContain('<ausfertigung>');
    expect(baueGesetzesXML(infos({ ausfertigung: ' 1896 ' }), [])).toContain(
      '<ausfertigung>1896</ausfertigung>',
    );
    const xml = baueGesetzesXML(
      infos({
        ausfertigung: '31. Februar 2020',
        neugefasst: 'Neugefasst durch Bek. v. 2.1.2002 I 42, 2909',
      }),
      [],
    );
    expect(xml).not.toContain('<ausfertigung>');
    expect(xml).toContain('<neugefasst>Neugefasst durch Bek. v. 2.1.2002 I 42, 2909</neugefasst>');
  });
  it('schreibt letzteNeuerung mit explizitem Wert oder aktuellem Default', () => {
    expect(baueGesetzesXML(infos({ letzteNeuerung: FIXER_ZEITPUNKT }), [])).toContain(
      '<letzteNeuerung>2024-01-01T00:00:00Z</letzteNeuerung>',
    );
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-30T12:34:56.789Z'));
      expect(baueGesetzesXML(infos(), [])).toContain(
        '<letzteNeuerung>2026-09-30T12:34:56Z</letzteNeuerung>',
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it('minimale Metadaten: nur Pflichtfelder + Default-Quelle + verarbeitungszeit', () => {
    const xml = baueGesetzesXML(infos(), []);
    expect(xml).toContain('<gesetz version="1">');
    expect(xml).toContain('<langtitel>Gesetz G</langtitel>');
    expect(xml).toContain('<kurztitel>G</kurztitel>');
    expect(xml).toContain('<datenquelle name="Gesetze im Internet"/>');
    expect(xml).toContain('<normgeber>de-bund</normgeber>');
    expect(xml).toContain('<verarbeitungszeit>2024-01-01T00:00:00Z</verarbeitungszeit>');
    expect(xml).not.toContain('<fundstelle>');
    expect(xml).not.toContain('<stand>');
    expect(xml).not.toContain('<gliederungsartikel/>');
  });

  it('optionale Felder erscheinen nur, wenn gesetzt: fundstelle, ausfertigung, eigene quelle, gliederungsartikel-Flag', () => {
    const xml = baueGesetzesXML(
      infos({
        fundstelle: 'BGBl I 2024, 1',
        ausfertigung: '1.1.2024',
        datenquelle: { name: 'Landesrecht BW' },
        hatGliederungsartikel: true,
      }),
      [],
    );
    expect(xml).toContain('<fundstelle>BGBl I 2024, 1</fundstelle>');
    expect(xml).toContain('<ausfertigung>2024-01-01</ausfertigung>');
    expect(xml).toContain('<datenquelle name="Landesrecht BW"/>');
    expect(xml).not.toContain('<gliederungsartikel/>');
  });

  it('<stand> erscheint nur bei mindestens einem der beiden Unterfelder, mit neugefasst VOR aenderungsvermerk', () => {
    const nurNeugefasst = baueGesetzesXML(infos({ neugefasst: '1.1.2020' }), []);
    expect(nurNeugefasst).toContain(
      '<stand>\n      <neugefasst>1.1.2020</neugefasst>\n    </stand>',
    );

    const beide = baueGesetzesXML(
      infos({ neugefasst: '1.1.2020', aenderungsvermerk: '1.1.2023' }),
      [],
    );
    const neuIdx = beide.indexOf('<neugefasst>');
    const aenderungsvermerkIdx = beide.indexOf('<aenderungsvermerk>');
    expect(neuIdx).toBeGreaterThan(-1);
    expect(aenderungsvermerkIdx).toBeGreaterThan(neuIdx);
  });

  it('fehlt verarbeitungszeit, wird new Date() als Fallback verwendet (nur Format geprüft, kein fixer Zeitpunkt möglich)', () => {
    const xml = baueGesetzesXML({ kurztitel: 'G', langtitel: 'GG', normgeber: 'de-bund' }, []);
    expect(xml).toMatch(
      /<verarbeitungszeit>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>/,
    );
  });

  it('XML-Sonderzeichen in Metadatenfeldern werden escaped', () => {
    const xml = baueGesetzesXML(
      infos({
        kurztitel: 'G & H',
        langtitel: 'Gesetz <über> "Test" & Co',
        fundstelle: 'BGBl I & S. 1',
      }),
      [],
    );
    expect(xml).toContain('<langtitel>Gesetz &lt;über&gt; &quot;Test&quot; &amp; Co</langtitel>');
    expect(xml).toContain('<kurztitel>G &amp; H</kurztitel>');
    expect(xml).toContain('<fundstelle>BGBl I &amp; S. 1</fundstelle>');
  });

  it('Edge-Case: leerer String bei kurztitel/langtitel/fundstelle unterdrückt das jeweilige Tag (falsy-Check, nicht nur undefined-Check)', () => {
    const xml = baueGesetzesXML(infos({ langtitel: '', kurztitel: '', fundstelle: '' }), []);
    expect(xml).not.toContain('<titel>');
    expect(xml).not.toContain('<kurztitel>');
    expect(xml).not.toContain('<fundstelle>');
  });
});

describe('baueGesetzesXML – <inhalt>: reine Gliederung (Überschrift ohne normBezeichnung)', () => {
  it('wird als <gliederung gliederungskennzahl="…"> ohne id serialisiert', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'gliederung',
        bez: 'Erster Teil',
        ebene: 1,
        gliederungskennzahl: '010000000000',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    expect(xml).toContain('<gliederung gliederungskennzahl="010000000000">');
    expect(xml).toContain('<bezeichnung>Erster Teil</bezeichnung>');
    expect(xml).not.toContain('<gliederung id=');
  });

  it('Edge-Case: fehlende gliederungskennzahl fällt auf ebene-basierten Default zurück ("0".repeat((ebene-1)*3) + "010")', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'gliederung',
        bez: 'Titel ohne Gliederungskennzahl',
        ebene: 2,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    // ebene=2 -> (2-1)*3 = 3 Nullen + "010"
    expect(xml).toContain('<gliederung gliederungskennzahl="000010">');
  });

  it('titel-Unterelement erscheint nur, wenn norm.titel gesetzt ist', () => {
    const ohneTitel = baueGesetzesXML(infos(), [
      {
        type: 'gliederung',
        bez: 'Teil',
        ebene: 1,
        gliederungskennzahl: '010000000000',
        absaetze: [],
      },
    ]);
    expect(ohneTitel).not.toContain('<titel>Teil');

    const mitTitel = baueGesetzesXML(infos(), [
      {
        type: 'gliederung',
        bez: 'Teil',
        titel: 'Zusatztitel',
        ebene: 1,
        gliederungskennzahl: '010000000000',
        absaetze: [],
      },
    ]);
    expect(mitTitel).toContain('<titel>Zusatztitel</titel>');
  });
});

describe('baueGesetzesXML – <inhalt>: Gliederungsartikel (z.B. Art. 229 EGBGB)', () => {
  it('wird wie eine Norm serialisiert (id + gliederungskennzahl-Attribut kombiniert)', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'gliederung',
        bez: 'Art 229',
        normBezeichnung: 'Art 229',
        ebene: 1,
        gliederungskennzahl: '229000000000',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos({ hatGliederungsartikel: true }), normen);
    expect(xml).toContain('<norm id="229" gliederungskennzahl="229000000000">');
    expect(xml).toContain('<bezeichnung>Art 229</bezeichnung>');
  });

  it('nachfolgende §§ innerhalb desselben Gliederungsartikels erhalten die verkettete id "artikelId-nr"', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'gliederung',
        bez: 'Art 229',
        normBezeichnung: 'Art 229',
        ebene: 1,
        gliederungskennzahl: '229000000000',
        absaetze: [],
      },
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 2',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [{ elemente: [{ type: 'texte', saetze: ['Text.'] }] }],
      },
    ];
    const xml = baueGesetzesXML(infos({ hatGliederungsartikel: true }), normen);
    expect(xml).toContain('<norm id="229-2">');
    expect(xml).toContain('<bezeichnung>§ 2</bezeichnung>');
  });

  it('Edge-Case: ein zweiter Gliederungsartikel setzt currentArtikelId neu, nachfolgende §§ hängen am NEUEN Artikel', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'gliederung',
        normBezeichnung: 'Art 229',
        bez: '',
        ebene: 1,
        gliederungskennzahl: '229000000000',
        absaetze: [],
      },
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
      {
        type: 'gliederung',
        normBezeichnung: 'Art 230',
        bez: '',
        ebene: 1,
        gliederungskennzahl: '230000000000',
        absaetze: [],
      },
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos({ hatGliederungsartikel: true }), normen);
    expect(xml).toContain('<norm id="229-1">');
    expect(xml).toContain('<norm id="230-1">');
  });
});

describe('baueGesetzesXML – <inhalt>: normale Norm (§)', () => {
  it('normBezeichnung landet im <bezeichnung>-Tag, id wird via IdVergabe berechnet', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 434',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    expect(xml).toContain('<norm id="434">');
    expect(xml).toContain('<bezeichnung>§ 434</bezeichnung>');
  });

  it('istErwaegungsgrund=true fügt typ="erwaegungsgrund"-Attribut hinzu (EU-Recht)', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: 'E1',
        istErwaegungsgrund: true,
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    expect(xml).toContain('<norm id="E1" typ="erwaegungsgrund">');
  });

  it('istErwaegungsgrund fehlt/false -> kein typ-Attribut', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: 'E1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    expect(xml).toContain('<norm id="E1">');
    expect(xml).not.toContain('typ="erwaegungsgrund"');
  });

  it('fussnoten-Tag erscheint nur, wenn gesetzt, und wird escaped', () => {
    const mitFussnote: GesammelteNorm[] = [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
        fussnoten: 'Fn 1 & 2',
      },
    ];
    const xml = baueGesetzesXML(infos(), mitFussnote);
    expect(xml).toContain('<fussnoten>Fn 1 &amp; 2</fussnoten>');

    const ohneFussnote = baueGesetzesXML(infos(), [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 2',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ]);
    expect(ohneFussnote).not.toContain('<fussnoten>');
  });

  it('Edge-Case: Bezeichnungs-Kollision innerhalb desselben Gesetzes bekommt einen "_2"-Suffix (IdVergabe, siehe bezeichnungZuId.ts)', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    expect(xml).toContain('<norm id="1">');
    expect(xml).toContain('<norm id="1_2">');
  });
});

describe('baueGesetzesXML – Normenreihenfolge und Struktur-Grundgerüst', () => {
  it('mehrere Normen erscheinen in Eingabereihenfolge innerhalb von <inhalt>…</inhalt>', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 2',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    const idx1 = xml.indexOf('<bezeichnung>§ 1</bezeichnung>');
    const idx2 = xml.indexOf('<bezeichnung>§ 2</bezeichnung>');
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);
    expect(xml.trim().startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.trim().endsWith('</gesetz>')).toBe(true);
  });

  it('leere Normenliste erzeugt ein leeres <inhalt>…</inhalt> ohne Absturz', () => {
    const xml = baueGesetzesXML(infos(), []);
    expect(xml).toContain('<inhalt>\n  </inhalt>');
  });

  it('Absätze einer Norm werden über baueText() eingebettet (Zusammenspiel geprüft, Detailverhalten siehe xmlSerialisierung.*.test.ts)', () => {
    const normen: GesammelteNorm[] = [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [{ nummer: '(1)', elemente: [{ type: 'texte', saetze: ['Satz A.'] }] }],
      },
    ];
    const xml = baueGesetzesXML(infos(), normen);
    expect(xml).toContain('<absatz zahl="(1)">Satz A.</absatz>');
  });
});

describe('baueGesetzesXML – strikte Wohlgeformtheit', () => {
  it('bewahrt Mixed Content und maskiert Sonderzeichen in Metadaten und Text', () => {
    const text = "  D'Artagnan & <Freunde>  ";
    const xml = baueGesetzesXML(infos({ langtitel: text }), [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        ebene: 1,
        gliederungskennzahl: '',
        absaetze: [{ elemente: [{ type: 'texte', saetze: [text, 'Zweiter Satz.'] }] }],
      },
    ]);
    expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
    const dom = new DOMParser().parseFromString(xml, 'text/xml');
    expect(dom.querySelector('satz')?.textContent).toBe(text);
    expect(dom.documentElement.hasAttribute('xml:space')).toBe(false);
  });
});

it('lässt die technische Wurzel-ID auch bei Sonderzeichen weg', () => {
  const xml = baueGesetzesXML(infos(gesetzesreferenz({ kurztitel: `&<>"' &amp; &lt;` })), []);
  expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
  expect(new DOMParser().parseFromString(xml, 'text/xml').documentElement.hasAttribute('id')).toBe(
    false,
  );
});

describe('Endformat: Status und eindeutige Gliederungskennzahlen', () => {
  it.each(['(weggefallen)', '(gegenstandslos)', '(aufgehoben)', '(entfallen)'])(
    'übernimmt reinen Inhalt %s als Titel',
    (wortlaut) => {
      const xml = baueGesetzesXML(infos(), [
        {
          type: 'paragraph',
          bez: '',
          normBezeichnung: '§ 1',
          ebene: 0,
          gliederungskennzahl: '',
          absaetze: [{ elemente: [{ type: 'texte', saetze: [wortlaut] }] }],
        },
      ]);
      expect(xml).toContain('status="weggefallen"');
      expect(xml).toContain(`<titel>${wortlaut}</titel>`);
      expect(xml).not.toContain('<text>');
    },
  );
  it('erhält echten Text neben einem weggefallenen Titel', () => {
    const xml = baueGesetzesXML(infos(), [
      {
        type: 'paragraph',
        bez: '',
        normBezeichnung: '§ 1',
        titel: '(aufgehoben)',
        ebene: 0,
        gliederungskennzahl: '',
        absaetze: [{ elemente: [{ type: 'texte', saetze: ['Weiter geltender Text.'] }] }],
      },
    ]);
    expect(xml).toContain('status="weggefallen"');
    expect(xml).toContain('<text>Weiter geltender Text.</text>');
  });
  it('reserviert auch später vorhandene Gliederungskennzahlen vor den Fallbacks', () => {
    const normen: GesammelteNorm[] = ['', '000010', '', '000020', ''].map(
      (gliederungskennzahl) => ({
        type: 'gliederung',
        bez: 'Titel',
        ebene: 2,
        gliederungskennzahl,
        absaetze: [],
      }),
    );
    const xml = baueGesetzesXML(infos(), normen);
    const gliederungskennzahlen = [...xml.matchAll(/gliederungskennzahl="(\d+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(gliederungskennzahlen).size).toBe(5);
    expect(gliederungskennzahlen.every((kz) => kz?.length === 6)).toBe(true);
  });
});

// Vollständige Statuswortlaute werden erkannt, zusätzliche Rechtstexte nicht.
describe('istWeggefallenWortlaut', () => {
  it.each(['weggefallen', 'gegenstandslos', 'aufgehoben', 'entfallen'])(
    'erkennt den vollständigen geklammerten Wortlaut %s',
    (wortlaut) => {
      expect(istWeggefallenWortlaut(` (${wortlaut}) `)).toBe(true);
      expect(istWeggefallenWortlaut(`(${wortlaut.toUpperCase()})`)).toBe(true);
    },
  );
  it.each([undefined, '', 'weggefallen', '(weggefallen) mit Text', 'teilweise (aufgehoben)'])(
    'weist unvollständigen oder zusätzlichen Wortlaut %s zurück',
    (wortlaut) => expect(istWeggefallenWortlaut(wortlaut)).toBe(false),
  );
});

it('schreibt Name und Adresse der Datenquelle als maskierte Attribute', () => {
  const xml = baueGesetzesXML(
    infos({ datenquelle: { name: 'Recht & Gesetz', url: 'https://test/?a=1&b=2' } }),
    [],
  );
  expect(xml).toContain('<datenquelle name="Recht &amp; Gesetz" url="https://test/?a=1&amp;b=2"/>');
  expect(xml).not.toMatch(/<quelle[ >]/);
});

describe('hierarchische Ersatzkennzahlen', () => {
  it.each([
    [
      [1, 2, 2, 1],
      ['', '', '', ''],
      ['010', '010010', '010020', '020'],
    ],
    [
      [1, 2],
      ['010', ''],
      ['010', '010010'],
    ],
    [[2], [''], ['000010']],
    [
      [1, 3],
      ['', ''],
      ['010', '010000010'],
    ],
    [
      [1, 2, 2],
      ['', '', '010010'],
      ['010', '010020', '010010'],
    ],
  ])('vergibt für Ebenen %j und amtliche Werte %j die Folge %j', (ebenen, amtlich, erwartet) => {
    const normen: GesammelteNorm[] = ebenen.map((ebene, i) => ({
      type: 'gliederung',
      bez: 'Teil',
      ebene,
      gliederungskennzahl: amtlich[i] ?? '',
      absaetze: [],
    }));
    const xml = baueGesetzesXML(infos(), normen);
    expect([...xml.matchAll(/gliederungskennzahl="(\d+)"/g)].map((treffer) => treffer[1])).toEqual(
      erwartet,
    );
  });
});

it('weist hundert Überschriften derselben Ebene ohne amtliche Kennzahl zurück', () => {
  const normen: GesammelteNorm[] = Array.from({ length: 100 }, () => ({
    type: 'gliederung',
    bez: 'Teil',
    ebene: 1,
    gliederungskennzahl: '',
    absaetze: [],
  }));
  expect(() => baueGesetzesXML(infos(), normen)).toThrow(
    'Zu viele Gliederungen auf derselben Ebene.',
  );
});
