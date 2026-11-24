import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungsXML.test.ts
//
// Unit-Tests für die reine XML-Serialisierung/-Parsing-Logik aus
// markierungsXML.ts. Prüft Markierungstypen und Randfälle; der
// Parser-Roundtrip liegt ergänzend in markierungsXML.eintragsKette.test.ts.
//
// Struktur:
//   - bauTextstelleZeilen: direkte Unit-Tests (exportiert, pur).
//   - baueXML + parseEintraege: Roundtrip-Tests je Markierungstyp
//     (baueBlock selbst ist NICHT exportiert, daher nur über baueXML
//     erreichbar).
//   - parseEintraege: zusätzliche, direkt auf handgeschriebenem XML
//     geprüfte Robustheits-/Randfälle (Pflichtfeld-Validierung, defensive
//     Behandlung unvollständiger/unerwarteter Eingaben).
//
// KEIN I/O (kein readTextFile/writeTextFile, kein AppData) – alle
// getesteten Funktionen sind reine String↔Objekt-Konvertierungen, siehe
// Kopfkommentar der Quelldatei. Vitest (Node-Umgebung), kein DOM-Polyfill
// nötig, da hier ausschließlich mit Regex statt DOMParser gearbeitet wird.

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bauTextstelleZeilen } from './markierungsXML';
import { baueXML, parseEintraege as parseDateiEintraege } from './markierungs-xml.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

function unterstreichung(
  overrides: Parameters<typeof markierungsEintrag>[0] = {},
): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
      bezugstext: 'Text',
    },

    ...overrides,
  });
}

describe('bauTextstelleZeilen', () => {
  it('nur Pflichtfeld <zeichenbereich>, keine der optionalen Zeilen', () => {
    const zeilen = bauTextstelleZeilen(
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: undefined }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }).bezug.textstelle!,
    );
    expect(zeilen).toBe('                <zeichenbereich start="0" ende="5"/>');
  });

  it('Normtext schreibt Absatz, äußeren Satz, Kette und inneren Satz in derselben Reihenfolge', () => {
    const zeilen = bauTextstelleZeilen(
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({
              absatz: '(1)',
              satz: 2,
              eintraege: [
                { ebene: 'nummer', bezeichnung: '1.' },
                { ebene: 'litera', bezeichnung: 'a)', wiederholung: 1 },
              ],
              satzInEintrag: 3,
            }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }).bezug.textstelle!,
    );
    expect(zeilen).toBe(
      [
        '                <absatz>(1)</absatz>',
        '                <satz>2</satz>',
        '                <nummer>1.</nummer>',
        '                <litera wiederholung="1">a)</litera>',
        '                <satz>3</satz>',
        '                <zeichenbereich start="0" ende="5"/>',
      ].join('\n'),
    );
  });

  it('nichtamtlicherTitel schreibt ausschließlich seinen Bereich', () => {
    const zeilen = bauTextstelleZeilen(
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: bereichPfad('nichtamtlicherTitel'),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }).bezug.textstelle!,
    );
    expect(zeilen).toContain('<bereich>nichtamtlicher-titel</bereich>');
    expect(zeilen).not.toContain('<bereich>amtlicher-titel</bereich>');
  });

  it('amtlicherTitel schreibt seinen Bereich', () => {
    expect(
      bauTextstelleZeilen(
        unterstreichung({
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: bereichPfad('amtlicherTitel'),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 5,
            },
            bezugstext: '',
          },
        }).bezug.textstelle!,
      ),
    ).toContain('<bereich>amtlicher-titel</bereich>');
  });

  it('Edge-Case: wiederholung=0 an einem Eintrag wird NICHT ausgegeben (falsy-Check, 0 = "einziges Vorkommen")', () => {
    const zeilen = bauTextstelleZeilen(
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({
              eintraege: [{ ebene: 'nummer', bezeichnung: '1.', wiederholung: 0 }],
            }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }).bezug.textstelle!,
    );
    expect(zeilen).not.toContain('<wiederholung>');
  });

  it('Edge-Case: die Unterabsatz-Bezeichnung "0" bleibt beim Schreiben erhalten', () => {
    const zeilen = bauTextstelleZeilen(
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ unterabsatz: '[0]' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }).bezug.textstelle!,
    );
    expect(zeilen).toContain('<unterabsatz>[0]</unterabsatz>');
  });

  it('Sonderzeichen in absatz werden escaped', () => {
    const zeilen = bauTextstelleZeilen(
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: 'Anhang 1 & 2' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }).bezug.textstelle!,
    );
    expect(zeilen).toContain('<absatz>Anhang 1 &amp; 2</absatz>');
  });

  it('mehrere Eintraege OHNE wiederholung erzeugen keine <wiederholung>-Zeilen dazwischen', () => {
    const zeilen = bauTextstelleZeilen(
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({
              eintraege: [
                { ebene: 'nummer', bezeichnung: '1.' },
                { ebene: 'litera', bezeichnung: 'a)' },
              ],
            }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }).bezug.textstelle!,
    );
    expect(zeilen).toBe(
      [
        '                <nummer>1.</nummer>',
        '                <litera>a)</litera>',
        '                <zeichenbereich start="0" ende="5"/>',
      ].join('\n'),
    );
  });
});

describe('baueXML – Grundgerüst', () => {
  it('kurztitel wird escaped, <verarbeitungszeit> im erwarteten ISO-Format (ohne Millisekunden, mit Z)', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'Test & Co' }), [unterstreichung()]);
    expect(xml).toContain('<gesetz normgeber="de-bund">Test &amp; Co</gesetz>');
    expect(xml).toMatch(
      /<verarbeitungszeit>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>/,
    );
  });

  it('leere Eintragsliste erzeugt ein leeres <inhalt>-Element ohne Absturz', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), []);
    expect(xml).toContain('<inhalt>');
    expect(xml).toContain('</inhalt>');
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('mehrere Einträge erscheinen in Eingabereihenfolge', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      unterstreichung({ ausgangsstelle: normAusgangsstelle('§ 1') }),
      unterstreichung({ ausgangsstelle: normAusgangsstelle('§ 2') }),
    ]);
    const idx1 = xml.indexOf('>§ 1</bezeichnung>');
    const idx2 = xml.indexOf('>§ 2</bezeichnung>');
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);
  });
});

describe('baueXML + parseEintraege – Roundtrip je Markierungstyp', () => {
  it('unterstreichung: einfacher Textbezug', () => {
    const original = unterstreichung({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: 'Beispieltext',
      },
    });
    const zurueck = parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]));
    expect(zurueck).toEqual([original]);
  });

  it('hervorhebung: identische Struktur wie unterstreichung, eigener Tag-Name', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      ...unterstreichung(),
      typ: 'hervorhebung',
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(xml).toContain('<hervorhebung>');
    expect(xml).not.toContain('<unterstreichung>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('kommentar MIT Textbezug: textstelle/bezugstext vorhanden', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 4,
        },
        bezugstext: 'Beispiel',
      },

      kommentarText: 'Anmerkung dazu.',
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(xml).toContain('<textstelle>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('kommentar OHNE Textbezug (allgemeiner Kommentar zur Norm): weder textstelle noch bezugstext', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'Allgemeine Anmerkung.',
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(xml).not.toContain('<textstelle>');
    expect(xml).not.toContain('<bezugstext>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('kommentar: leerer kommentarText wird als leerer String (nicht undefined) zurückgelesen', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: '',
    });
    const zurueck = parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]));
    expect(zurueck[0]!.kommentarText).toBe('');
  });

  it('speichert volle Verweiszielbezeichnungen ohne Zusatzattribute', () => {
    const original = markierungsEintrag({
      typ: 'verweismarkierung',
      verweisinhalt: {
        verweistext: '§ 433',
        verweisziele: [
          {
            typ: 'zielnorm',
            bezeichnung: '§ 433',
            elementstand: { textlaenge: 10 },
            verweistextZeichenbereich: [0, 5],
          },
        ],
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [original]);
    expect(xml).toContain('<bezeichnung>§ 433</bezeichnung>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('verweis MIT Textbezug + einer konkret aufgelösten Zielnorm (inkl. Elementstand und voller Bezeichnung)', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 6 },
        bezugstext: '§ 2 BGB',
      },

      verweisinhalt: {
        verweistext: '§ 2 BGB',
        verweisziele: [
          verweisziel({
            typ: 'zielnorm',
            gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
            bezeichnung: '§ 2',
            verweistextZeichenbereich: [0, 7],
            elementstand: { titel: 'Willenserklärung', textlaenge: 250 },
          }),
        ],
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('verweis: Zielnorm im EIGENEN Gesetz (kein <gesetz>-Tag, da z.gesetz undefined)', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
        bezugstext: '§ 2',
      },

      verweisinhalt: {
        verweistext: '§ 2',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            bezeichnung: '2',
            verweistextZeichenbereich: [0, 3],
          }),
        ],
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(xml.match(/<verweisziel>[\s\S]*?<\/verweisziel>/)?.[0]).not.toContain('<gesetz>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('verweis: ganzes Gesetz als Ziel (nur gesetz, KEIN bezeichnung) – Erkennungsmerkmal beim Parsen ist das fehlende <bezeichnung> bei vorhandenem <gesetz>', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 2 },
        bezugstext: 'GG',
      },

      verweisinhalt: {
        verweistext: 'GG',
        verweisziele: [
          verweisziel({
            typ: 'ganzesGesetz',
            gesetz: gesetzesreferenz({ kurztitel: 'GG' }),

            verweistextZeichenbereich: [0, 2],
          }),
        ],
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(
      new DOMParser()
        .parseFromString(xml, 'application/xml')
        .querySelector('verweisziel > bezeichnung'),
    ).toBeNull(); // kein bezeichnung-Tag im zielnorm-Block
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('verweis: reine Zusatzinfo hat keine Verweisziele', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'Abs. 3', verweisziele: [] },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(xml).not.toContain('<verweisziel>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('verweis: mehrere verweisziele (verschiedene Zeichen-Bereiche) bleiben in Reihenfolge erhalten', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 11 },
        bezugstext: '§§ 2, 3 BGB',
      },

      verweisinhalt: {
        verweistext: '§§ 2, 3 BGB',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
            bezeichnung: '2',
            verweistextZeichenbereich: [0, 5],
          }),
          verweisziel({
            typ: 'zielnormOhneElementstand',
            gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
            bezeichnung: '3',
            verweistextZeichenbereich: [5, 11],
          }),
        ],
      },
    });
    const zurueck = parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]));
    expect(zurueck[0]!.verweisinhalt?.verweisziele.map((z) => z.bezeichnung)).toEqual(['2', '3']);
  });

  it('verweis OHNE Textbezug: elementstand statt textstelle/bezugstext', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Ausgangsnorm', textlaenge: 42 } },
      verweisinhalt: {
        verweistext: 'GG',
        verweisziele: [
          verweisziel({
            typ: 'ganzesGesetz',
            gesetz: gesetzesreferenz({ kurztitel: 'GG' }),

            verweistextZeichenbereich: [0, 2],
          }),
        ],
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(xml).not.toContain('<textstelle>');
    expect(xml).not.toContain('<bezugstext>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('Edge-Case: zielnorm OHNE titel (nur textlaenge) – <titel> fehlt im XML, titel bleibt undefined', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 3 },
        bezugstext: '§ 2',
      },

      verweisinhalt: {
        verweistext: '§ 2',
        verweisziele: [
          verweisziel({
            typ: 'zielnorm',
            bezeichnung: '§ 2',
            verweistextZeichenbereich: [0, 3],
            elementstand: { textlaenge: 10 },
          }),
        ],
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]);
    expect(xml).not.toContain('<titel>');
    expect(parseEintraege(xml)).toEqual([original]);
  });

  it('Sonderzeichen in bezeichnung/bezugstext/kommentarText/verweistext/zielnorm.gesetz überleben den Roundtrip', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('A & B "§ § 1"'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: 'X < Y > Z',
      },

      verweisinhalt: {
        verweistext: 'X < Y > Z',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            gesetz: gesetzesreferenz({ kurztitel: "Gesetz 'mit' Anführung & Co" }),
            bezeichnung: '1',
            verweistextZeichenbereich: [0, 9],
          }),
        ],
      },
    });
    const zurueck = parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]));
    expect(zurueck).toEqual([original]);
  });

  it('Eintrags-Kette (nummer/litera) im Textpfad überlebt den Roundtrip inkl. wiederholung', () => {
    const original = unterstreichung({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({
            absatz: '(1)',
            eintraege: [
              { ebene: 'nummer', bezeichnung: '1.' },
              { ebene: 'litera', bezeichnung: 'a)', wiederholung: 2 },
            ],
            satzInEintrag: 5,
          }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    const zurueck = parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]));
    expect(zurueck).toEqual([original]);
  });
});

describe('parseEintraege – Robustheit / Pflichtfeld-Validierung', () => {
  it('ein Block ohne <bezeichnung> wird komplett übersprungen, nachfolgende gültige Blöcke bleiben erhalten', () => {
    const xml = `<inhalt>
      <unterstreichung><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>
      <unterstreichung><bezeichnung>§ 2</bezeichnung><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>
    </inhalt>`;
    const result = parseEintraege(xml);
    expect(result).toHaveLength(1);
    expect(bezeichnungAusgangsstelle(result[0]!.ausgangsstelle)).toBe('§ 2');
  });

  it('unterstreichung/hervorhebung OHNE bezugstext/zeichenbereich werden übersprungen (bei diesen Typen Pflicht)', () => {
    const xml = '<unterstreichung><bezeichnung>§ 1</bezeichnung></unterstreichung>';
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('Edge-Case: verweis/kommentar OHNE bezugstext/zeichenbereich werden NICHT übersprungen (dort optional, allgemeiner Bezug)', () => {
    const xml =
      '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><kommentartext>Text</kommentartext></kommentar>';
    expect(parseEintraege(xml)).toHaveLength(1);
  });

  it('Edge-Case: ein <wiederholung>-Tag OHNE vorherigen nummer/litera-Eintrag wird ignoriert statt abzustürzen', () => {
    const xml =
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><textstelle><wiederholung>1</wiederholung></textstelle><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>';
    const result = parseEintraege(xml);
    expect(result).toHaveLength(1);
    expect(result[0]!.bezug.textstelle?.pfad.eintraege).toBeUndefined();
  });

  it('<satz> VOR der Eintrags-Kette wird als äußerer satz gelesen, NACH der Kette als satzInEintrag – Position entscheidet, nicht Reihenfolge im Objekt', () => {
    const vorher = parseEintraege(
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><satz>2</satz><nummer>1.</nummer><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>',
    )[0]!;
    expect(vorher.bezug.textstelle?.pfad.satz).toBe(2);
    expect(vorher.bezug.textstelle?.pfad.satzInEintrag).toBeUndefined();

    const danach = parseEintraege(
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><nummer>1.</nummer><satz>2</satz><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>',
    )[0]!;
    expect(danach.bezug.textstelle?.pfad.satzInEintrag).toBe(2);
    expect(danach.bezug.textstelle?.pfad.satz).toBeUndefined();
  });

  it('mehrere unterschiedliche Markierungstypen im selben Dokument werden alle erfasst', () => {
    const xml = `<inhalt>
      <unterstreichung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="3"/><bezugstext>a</bezugstext></unterstreichung>
      <hervorhebung><bezeichnung>§ 2</bezeichnung><zeichenbereich start="0" ende="3"/><bezugstext>b</bezugstext></hervorhebung>
      <kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 3</bezeichnung><kommentartext>c</kommentartext></kommentar>
    </inhalt>`;
    expect(parseEintraege(xml).map((e) => e.typ)).toEqual([
      'unterstreichung',
      'hervorhebung',
      'kommentar',
    ]);
  });

  it('Edge-Case: unbekannter/nicht unterstützter Tag-Name wird ignoriert (Regex kennt nur die vier Markierungstypen)', () => {
    const xml =
      '<sonstwas><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="3"/><bezugstext>a</bezugstext></sonstwas>';
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('leerer String -> leeres Array, kein Absturz', () => {
    expect(parseEintraege('')).toEqual([]);
  });
});

// Ergänzungen nach Mutation-Testing-Analyse (Stryker-Report vom 2026-08-27):
// je Gruppe unten der Bezug auf die überlebenden Mutanten-IDs, gruppiert nach
// gemeinsamer Ursache statt 1:1 pro ID (siehe Chat-Analyse).
describe('Unvollständige XML-Textbezüge: Lesen und erneutes Schreiben', () => {
  // Unvollständige Grenzen gehören zu den XML-Eingaben, nicht zum gültigen
  // Speichervertrag. Der Leser verwirft solche Einträge mit Befund; deren erneute
  // Speicherung enthält weder Markierung noch Textbezug. Beide Wrapper-Tags bleiben
  // ausdrücklich geprüft, weil die Abwesenheit des öffnenden Tags allein das
  // schließende Tag nicht abdeckt.
  it('kommentar: NUR zeichenbereichStart gesetzt (zeichenbereichEnde fehlt) -> Eintrag wird verworfen', () => {
    const xml = baueXML(
      gesetzesreferenz({ kurztitel: 'TestG' }),
      parseEintraege(
        baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
          markierungsEintrag({
            bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
            typ: 'kommentar',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            kommentarText: 'Text',
          }),
        ]).replace(
          '</bezeichnung>',
          '</bezeichnung><textstelle><zeichenbereich start="0"/></textstelle>',
        ),
      ),
    );
    expect(xml).not.toContain('<textstelle>');
    expect(xml).not.toContain('</textstelle>');
    expect(xml).not.toContain('<bezugstext>');
    const result = parseEintraege(xml)[0]!;
    expect(result).toBeUndefined();
  });

  it('kommentar: NUR zeichenbereichEnde gesetzt (zeichenbereichStart fehlt) -> Eintrag wird verworfen', () => {
    const xml = baueXML(
      gesetzesreferenz({ kurztitel: 'TestG' }),
      parseEintraege(
        baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
          markierungsEintrag({
            bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
            typ: 'kommentar',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            kommentarText: 'Text',
          }),
        ]).replace(
          '</bezeichnung>',
          '</bezeichnung><textstelle><zeichenbereich ende="4"/></textstelle>',
        ),
      ),
    );
    expect(xml).not.toContain('<textstelle>');
    expect(xml).not.toContain('</textstelle>');
    const result = parseEintraege(xml)[0]!;
    expect(result).toBeUndefined();
  });

  it('kommentar: erzeugte Zeilen sind durch Zeilenumbrüche getrennt (nicht aneinandergehängt)', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        kommentarText: 'x',
      }),
    ]);
    expect(xml).toContain('</elementstand>\n            <kommentartext>x</kommentartext>');
  });

  // Fehlte bisher: das "ohne Textbezug"-Gegenstück prüft nur die ABWESENHEIT
  // von <textstelle>/</textstelle>. Ob die Tags bei hatTextbezugK=true tatsächlich
  // als eigene, korrekt umschließende Zeilen geschrieben werden, prüft
  // parseEintraege (toEqual) NICHT, weil das Parsen komplett tolerant
  // gegenüber der Wrapper-Struktur ist (siehe Analyse-Chat, Kategorie E).
  it('kommentar MIT Textbezug: <textstelle> und </textstelle> stehen als eigene Zeilen um bauTextstelleZeilen', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      markierungsEintrag({
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
          bezugstext: 'x',
        },

        kommentarText: 'Anmerkung',
      }),
    ]);
    expect(xml).toContain(
      '<textstelle>\n                <zeichenbereich start="0" ende="4"/>\n            </textstelle>',
    );
  });

  it('verweis: NUR zeichenbereichStart gesetzt (zeichenbereichEnde fehlt) -> Eintrag wird verworfen', () => {
    const xml = baueXML(
      gesetzesreferenz({ kurztitel: 'TestG' }),
      parseEintraege(
        baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
          markierungsEintrag({
            typ: 'verweismarkierung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 10 } },
            verweisinhalt: {
              verweistext: 'GG',
              verweisziele: [
                verweisziel({
                  typ: 'ganzesGesetz',
                  gesetz: gesetzesreferenz({ kurztitel: 'GG' }),

                  verweistextZeichenbereich: [0, 2],
                }),
              ],
            },
          }),
        ]).replace(
          '</bezeichnung>',
          '</bezeichnung><textstelle><zeichenbereich start="0"/></textstelle>',
        ),
      ),
    );
    expect(xml).not.toContain('<textstelle>');
    expect(xml).not.toContain('</textstelle>');
    const result = parseEintraege(xml)[0]!;
    expect(result).toBeUndefined();
  });

  // Der umgekehrte unvollständige Fall bleibt separat geprüft: Ende vorhanden,
  // Start fehlt. Er wird ebenfalls mit Befund verworfen.
  it('verweis: NUR zeichenbereichEnde gesetzt (zeichenbereichStart fehlt) -> Eintrag wird verworfen', () => {
    const xml = baueXML(
      gesetzesreferenz({ kurztitel: 'TestG' }),
      parseEintraege(
        baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
          markierungsEintrag({
            typ: 'verweismarkierung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 10 } },
            verweisinhalt: {
              verweistext: 'GG',
              verweisziele: [
                verweisziel({
                  typ: 'ganzesGesetz',
                  gesetz: gesetzesreferenz({ kurztitel: 'GG' }),

                  verweistextZeichenbereich: [0, 2],
                }),
              ],
            },
          }),
        ]).replace(
          '</bezeichnung>',
          '</bezeichnung><textstelle><zeichenbereich ende="4"/></textstelle>',
        ),
      ),
    );
    expect(xml).not.toContain('<textstelle>');
    const result = parseEintraege(xml)[0]!;
    expect(result).toBeUndefined();
  });

  it('verweis: erzeugte Zeilen sind durch Zeilenumbrüche getrennt (nicht aneinandergehängt)', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'verweismarkierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        verweisinhalt: {
          verweistext: 'GG',
          verweisziele: [
            verweisziel({
              typ: 'ganzesGesetz',
              gesetz: gesetzesreferenz({ kurztitel: 'GG' }),

              verweistextZeichenbereich: [0, 2],
            }),
          ],
        },
      }),
    ]);
    expect(xml).toContain('</elementstand>\n            <verweisinhalt>');
  });

  // Analog zum Kommentar-Fall oben: das "ohne Textbezug"-Gegenstück prüft nur
  // die Abwesenheit der Tags, nie deren tatsächliche Anwesenheit/Struktur
  // bei hatTextbezug=true.
  it('verweis MIT Textbezug: <textstelle> und </textstelle> stehen als eigene Zeilen um bauTextstelleZeilen', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      markierungsEintrag({
        typ: 'verweismarkierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 6 },
          bezugstext: '§ 2 BGB',
        },

        verweisinhalt: {
          verweistext: '§ 2 BGB',
          verweisziele: [
            verweisziel({
              typ: 'zielnormOhneElementstand',
              gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
              bezeichnung: '2',
              verweistextZeichenbereich: [0, 7],
            }),
          ],
        },
      }),
    ]);
    expect(xml).toContain(
      '<textstelle>\n                <zeichenbereich start="0" ende="6"/>\n            </textstelle>',
    );
  });
});

describe('Mutation-Testing-Nachbesserung: hatPflichtTextbezug bei unterstreichung/hervorhebung nur teilweise erfüllt (ID 370)', () => {
  it('nur bezugstext, kein zeichenbereich -> Eintrag wird übersprungen', () => {
    const xml =
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><bezugstext>abc</bezugstext></unterstreichung>';
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('nur zeichenbereich, kein bezugstext -> Eintrag wird übersprungen', () => {
    const xml =
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="3"/></unterstreichung>';
    expect(parseEintraege(xml)).toEqual([]);
  });
});

describe('Mutation-Testing-Nachbesserung: Roundtrip fehlte komplett für titel/Bereich nichtamtlicherTitel/Bereich bezeichnung (IDs 394-399,408,409)', () => {
  it('titel=true überlebt den vollen Roundtrip (nicht nur bauTextstelleZeilen)', () => {
    const original = unterstreichung({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('amtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    expect(parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]))).toEqual([
      original,
    ]);
  });

  it('nichtamtlicherTitel überlebt den vollen Roundtrip', () => {
    const original = unterstreichung({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('nichtamtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    expect(parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]))).toEqual([
      original,
    ]);
  });

  it('bereich=bezeichnung überlebt den vollen Roundtrip', () => {
    const original = unterstreichung({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('bezeichnung'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    expect(parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]))).toEqual([
      original,
    ]);
  });

  // Handgeschriebene Bereiche mit zusätzlichem Leerraum bleiben lesbar.
  it('<bereich>amtlicher-titel</bereich> mit Leerraum in Tag und Wert wird trotzdem als titel erkannt', () => {
    const xml =
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><bereich > amtlicher-titel </bereich ><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>';
    expect(parseEintraege(xml)[0]!.bezug.textstelle?.pfad.bereich).toBe('amtlicherTitel');
  });

  it('<bereich>nichtamtlicher-titel</bereich> mit Leerraum in Tag und Wert wird trotzdem erkannt', () => {
    const xml =
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><bereich > nichtamtlicher-titel </bereich ><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>';
    expect(parseEintraege(xml)[0]!.bezug.textstelle?.pfad.bereich).toBe('nichtamtlicherTitel');
  });

  it('<bereich>bezeichnung</bereich> mit Leerraum in Tag und Wert wird trotzdem erkannt', () => {
    const xml =
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><bereich > bezeichnung </bereich ><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>';
    expect(parseEintraege(xml)[0]!.bezug.textstelle?.pfad.bereich).toBe('bezeichnung');
  });
});

describe('Mutation-Testing-Nachbesserung: .filter(Boolean) verhindert "false" als Text in den Zeilen (IDs 100,102,207,209)', () => {
  it('kommentar ohne Textbezug: erzeugte Zeilen enthalten nicht das Wort "false"', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        kommentarText: 'x',
      }),
    ]);
    expect(xml).not.toContain('false');
  });

  it('verweis ohne Textbezug: erzeugte Zeilen enthalten nicht das Wort "false"', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      markierungsEintrag({
        bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
        typ: 'verweismarkierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        verweisinhalt: {
          verweistext: 'GG',
          verweisziele: [
            verweisziel({
              typ: 'ganzesGesetz',
              gesetz: gesetzesreferenz({ kurztitel: 'GG' }),

              verweistextZeichenbereich: [0, 2],
            }),
          ],
        },
      }),
    ]);
    expect(xml).not.toContain('false');
  });
});

describe('Mutation-Testing-Nachbesserung: XML-Grundgerüst von baueXML war nur über toContain, nie exakt geprüft (IDs 61,62,89,160,167,229-231,234,237)', () => {
  it('baueXML(kurztitel, []) erzeugt exakt das erwartete Gerüst', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), []);
    expect(xml).toMatch(
      /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<markierungen version="1">\n {4}<infos>\n {8}<gesetz normgeber="de-bund">TestG<\/gesetz>\n {8}<verarbeitungszeit>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>\n {4}<\/infos>\n {4}<inhalt>\n\n {4}<\/inhalt>\n<\/markierungen>$/,
    );
  });

  it('unterstreichung: <textstelle>/</textstelle>-Wrapper stehen exakt um die bauTextstelleZeilen-Zeilen', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      }),
    ]);
    expect(xml).toContain('<textstelle>\n                <absatz>(1)</absatz>\n');
    expect(xml).toContain('<zeichenbereich start="0" ende="5"/>\n            </textstelle>');
  });

  it('zwei Einträge werden durch einen Zeilenumbruch getrennt (nicht aneinandergehängt)', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [
      unterstreichung({ ausgangsstelle: normAusgangsstelle('§ 1') }),
      unterstreichung({ ausgangsstelle: normAusgangsstelle('§ 2') }),
    ]);
    expect(xml).toContain('</unterstreichung>\n        <unterstreichung>');
  });
});

describe('Mutation-Testing-Nachbesserung: trim() nur über handgeschriebenes XML mit Whitespace prüfbar (IDs 277,279,280,341,401,402,459)', () => {
  it('bezeichnung/absatz/nummer-Bezeichnung mit umgebendem Whitespace werden getrimmt', () => {
    const xml =
      '<unterstreichung><bezeichnung>§ 1</bezeichnung><absatz> (1) </absatz><nummer> 1. </nummer><zeichenbereich start="0" ende="3"/><bezugstext>abc</bezugstext></unterstreichung>';
    const result = parseEintraege(xml)[0]!;
    expect(bezeichnungAusgangsstelle(result.ausgangsstelle)).toBe('§ 1');
    expect(result.bezug.textstelle?.pfad.absatz).toBe('(1)');
    expect(result.bezug.textstelle?.pfad.eintraege).toEqual([
      { ebene: 'nummer', bezeichnung: '1.' },
    ]);
  });

  it('titel/gesetz/zielnorm-bezeichnung mit umgebendem Whitespace werden getrimmt (elementstand)', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><elementstand><titel> Ausgangsnorm </titel><textlaenge>10</textlaenge></elementstand><verweisinhalt><verweistext>GG</verweistext><verweisziel><gesetz normgeber="de-bund"> GG </gesetz><bezeichnung> 2 </bezeichnung><verweistextZeichenbereich start="0" ende="1"/></verweisziel></verweisinhalt></verweismarkierung>';
    const result = parseEintraege(xml)[0]!;
    expect(result.bezug.elementstand?.titel).toBe('Ausgangsnorm');
    const zn = result.verweisinhalt!.verweisziele[0]!;
    expect(zn.gesetz).toEqual(gesetzesreferenz({ kurztitel: 'GG' }));
    expect(zn.bezeichnung).toBe('2');
  });

  // Fehlte bisher: trim() auf titel der Zielnorm selbst (eigene
  // elementstand INNERHALB von zielnorm) – bisher nur für die Ausgangsnorm-
  // elementstand getestet (andere Funktion, parseElementstand statt
  // parseEinzelneZielnorm).
  it('titel einer Zielnorm (eigene elementstand) mit umgebendem Whitespace wird getrimmt', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="1"/><bezugstext>x</bezugstext><verweisinhalt><verweistext>xxxxxx</verweistext><verweisziel><bezeichnung>§ 2</bezeichnung><verweistextZeichenbereich start="0" ende="1"/><elementstand><titel> Zielnorm </titel><textlaenge>5</textlaenge></elementstand></verweisziel></verweisinhalt></verweismarkierung>';
    const zn = parseEintraege(xml)[0]!.verweisinhalt!.verweisziele[0]!;
    expect(zn.elementstand?.titel).toBe('Zielnorm');
  });
});

describe('Ungültige Präfixattribute an Verweiszielen', () => {
  it('weist alte Präfixattribute auch bei mehreren Leerzeichen zurück', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="1"/><bezugstext>x</bezugstext><verweisinhalt><verweistext>xxxxxx</verweistext><verweisziel><bezeichnung  praefix="§">2</bezeichnung><verweistextZeichenbereich start="0" ende="1"/></verweisziel></verweisinhalt></verweismarkierung>';
    expect(parseEintraege(xml)).toEqual([]);
  });
});

describe('Mehrstufige Verweisziele', () => {
  it('volle zweistufige Normbezeichnungen überleben den Rundlauf', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 6 },
        bezugstext: 'Art. 229 § 3 EGBGB',
      },

      verweisinhalt: {
        verweistext: 'Art. 229 § 3 EGBGB',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),
            bezeichnung: 'Art. 229 § 3',
            verweistextZeichenbereich: [0, 13],
          }),
        ],
      },
    });
    expect(parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]))).toEqual([
      original,
    ]);
  });
});

describe('Mutation-Testing-Nachbesserung: Robustheit bei unvollständigen/kaputten Blöcken (IDs 253,273,298,303,304,312,316,332,339,429)', () => {
  it('kommentar-Block ohne <kommentartext>-Tag (kaputte/manuell editierte Datei) -> Eintrag wird mit Befund ausgelassen', () => {
    const xml =
      '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung></kommentar>';
    expect(() => parseEintraege(xml)).not.toThrow();
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('Zielnorm ohne Zeichenbereich verwirft den gesamten Eintrag', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="6"/><bezugstext>x</bezugstext><verweisinhalt><verweistext>xxxxxx</verweistext><verweisziel><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>§ 1</bezeichnung></verweisziel><verweisziel><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>§ 2</bezeichnung><verweistextZeichenbereich start="0" ende="6"/></verweisziel></verweisinhalt></verweismarkierung>';
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('<verweisinhalt> ohne jede gültige zielnorm -> Eintrag wird abgelehnt', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="6"/><bezugstext>x</bezugstext><verweisinhalt><verweistext>xxxxxx</verweistext><verweisziel><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>§ 1</bezeichnung></verweisziel></verweisinhalt></verweismarkierung>';
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('<verweisinhalt> ohne <verweistext> -> Eintrag wird abgelehnt', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="6"/><bezugstext>x</bezugstext><verweisinhalt><verweisziel><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>§ 1</bezeichnung><verweistextZeichenbereich start="0" ende="6"/></verweisziel></verweisinhalt></verweismarkierung>';
    expect(() => parseEintraege(xml)).not.toThrow();
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('verweis ohne jedes <verweisinhalt>-Tag -> Eintrag wird abgelehnt', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="6"/><bezugstext>x</bezugstext></verweismarkierung>';
    expect(() => parseEintraege(xml)).not.toThrow();
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('zielnorm mit <elementstand> ohne <textlaenge> (kaputt) -> elementstand wird komplett undefined statt Absturz', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="6"/><bezugstext>x</bezugstext><verweisinhalt><verweistext>xxxxxx</verweistext><verweisziel><bezeichnung>§ 1</bezeichnung><verweistextZeichenbereich start="0" ende="6"/><elementstand><titel>Foo</titel></elementstand></verweisziel></verweisinhalt></verweismarkierung>';
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('elementstand mit <elementstand> ohne <textlaenge> (kaputt) -> elementstand bleibt undefined statt Absturz', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><elementstand><titel>Foo</titel></elementstand><verweisinhalt><verweistext>xxxxxx</verweistext><verweisziel><bezeichnung>§ 1</bezeichnung><verweistextZeichenbereich start="0" ende="6"/></verweisziel></verweisinhalt></verweismarkierung>';
    expect(() => parseEintraege(xml)).not.toThrow();
    expect(parseEintraege(xml)).toEqual([]);
  });

  it('verweis ohne Textbezug und ohne jedes <elementstand>-Tag -> elementstand bleibt undefined', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>xxxxxx</verweistext><verweisziel><bezeichnung>§ 1</bezeichnung><verweistextZeichenbereich start="0" ende="6"/></verweisziel></verweisinhalt></verweismarkierung>';
    expect(parseEintraege(xml)).toEqual([]);
  });
});

describe('Mutation-Testing-Nachbesserung: Slice-Schutz in parseElementstand vor innerer elementstand einer Zielnorm (IDs 321-325)', () => {
  // Der eigentliche Risikofall ist NICHT "beide vorhanden, unterschiedliche
  // Werte" (die Ausgangsnorm-elementstand steht im Text immer VOR <verweisinhalt>,
  // ein nicht-globales .match() findet sie so oder so als ERSTEN Treffer –
  // das war mein ursprünglicher Test und blieb wirkungslos). Der Schutz
  // greift erst, wenn KEINE Ausgangsnorm-elementstand existiert, aber die zitierte
  // Norm eine eigene elementstand hat: ohne Slice würde .match() auf dem
  // Gesamtblock dann fälschlich diese INNERE elementstand als Ausgangsnorm lesen.
  it('KEINE elementstand, aber Zielnorm mit eigener elementstand -> elementstand bleibt undefined (nicht die innere elementstand)', () => {
    const xml =
      '<verweismarkierung><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>§ 2 BGB</verweistext><verweisziel><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>§ 2</bezeichnung><verweistextZeichenbereich start="0" ende="7"/><elementstand><titel>Zielnorm</titel><textlaenge>999</textlaenge></elementstand></verweisziel></verweisinhalt></verweismarkierung>';
    expect(parseEintraege(xml)).toEqual([]);
  });

  // IDs 322/324 betreffen den Fall verweisinhaltIdx === -1 (KEIN
  // <verweisinhalt> im Block überhaupt) – der obige Test hat immer ein
  // <verweisinhalt>, verweisinhaltIdx ist dort nie -1, daher trifft er
  // "force false"/"−1 -> +1" nie. Ohne <verweisinhalt> nimmt der (korrekte)
  // Code den GANZEN Block als aussenBlock; die Mutanten würden stattdessen
  // block.slice(0, -1) bzw. block.slice(0, 1) verwenden und damit das
  // schließende </elementstand>/</verweismarkierung> abschneiden bzw. fast den ganzen Block
  // verwerfen.
  it('elementstand vorhanden, aber GAR KEIN <verweisinhalt> im Block -> Eintrag wird abgelehnt', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Ausgangsnorm', textlaenge: 42 } },
    });
    const zurueck = parseEintraege(
      baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]).replace(
        /<verweisinhalt>[\s\S]*?<\/verweisinhalt>/,
        '',
      ),
    )[0]!;
    expect(zurueck).toBeUndefined();
  });

  it('elementstand und eine zielnorm mit EIGENER, abweichender elementstand bleiben beide korrekt getrennt (Regressionsschutz)', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Ausgangsnorm', textlaenge: 42 } },
      verweisinhalt: {
        verweistext: '§ 2 BGB',
        verweisziele: [
          verweisziel({
            typ: 'zielnorm',
            gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
            bezeichnung: '§ 2',
            verweistextZeichenbereich: [0, 7],
            elementstand: { titel: 'Zielnorm', textlaenge: 999 },
          }),
        ],
      },
    });
    const zurueck = parseEintraege(
      baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]),
    )[0]!;
    expect(zurueck.bezug.elementstand).toEqual({ titel: 'Ausgangsnorm', textlaenge: 42 });
    expect(zurueck.verweisinhalt?.verweisziele[0]!.elementstand).toEqual({
      titel: 'Zielnorm',
      textlaenge: 999,
    });
  });
});

describe('Mutation-Testing-Nachbesserung: <satz> ganz ohne Eintrags-Kette (ersterEintragIdx=-1) nie roundtrip-getestet (IDs 470,472)', () => {
  it('satz ohne jede Eintrags-Kette wird als äußerer satz gelesen (nicht satzInEintrag)', () => {
    const original = unterstreichung({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ satz: 3 }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    expect(parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original]))).toEqual([
      original,
    ]);
  });
});

describe('Zeichenbereiche und Zielbezeichnungen beliebiger Länge', () => {
  it('zeichenbereichStart/zeichenbereichEnde, verweistextZeichenbereich, satz/satzInEintrag und unterabsatz überleben den Roundtrip für beliebige (auch mehrstellige) natürliche Zahlen', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 500 }),
        fc.nat({ max: 500 }),
        fc.nat({ max: 500 }),
        fc.nat({ max: 500 }),
        (zStart, laenge, satzInEintrag, unterabsatz) => {
          const original = unterstreichung({
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({
                  unterabsatz: `[${unterabsatz}]`,
                  eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
                  satzInEintrag,
                }),
                zeichenbereichStart: zStart,
                zeichenbereichEnde: zStart + laenge,
              },
              bezugstext: '',
            },
          });
          expect(
            parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original])),
          ).toEqual([original]);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('verweistextZeichenbereich einer Zielnorm überlebt den Roundtrip für beliebige (auch mehrstellige) natürliche Zahlen (ID 247 – fehlte bisher komplett)', () => {
    fc.assert(
      fc.property(fc.nat({ max: 500 }), fc.integer({ min: 1, max: 500 }), (start, laenge) => {
        const original: MarkierungsEintrag = markierungsEintrag({
          typ: 'verweismarkierung',
          ausgangsstelle: normAusgangsstelle('§ 1'),
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
            bezugstext: 'x',
          },

          verweisinhalt: {
            verweistext: 'x'.repeat(start + laenge),
            verweisziele: [
              verweisziel({
                typ: 'zielnormOhneElementstand',
                gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
                bezeichnung: '2',
                verweistextZeichenbereich: [start, start + laenge],
              }),
            ],
          },
        });
        expect(
          parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original])),
        ).toEqual([original]);
      }),
      { numRuns: 50 },
    );
  });

  it('volle Zielbezeichnungen beliebiger Länge überleben den Rundlauf', () => {
    fc.assert(
      fc.property(
        // trim() beim Parsen ist eine bewusste Absicherung gegen Whitespace in
        // handgeschriebenem/kaputtem XML (siehe Testgruppe oben) – der eigene
        // Serializer fügt nie führenden/nachfolgenden Whitespace ein, daher
        // hier bewusst nur "bereits getrimmte" Strings generieren, sonst
        // würde die Property den (separat getesteten) trim()-Effekt selbst
        // als Roundtrip-Verlust melden.
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 6 })
            .filter(
              (s) => !s.includes('|') && !s.includes('"') && !s.includes('<') && s.trim() === s,
            ),
          { minLength: 1, maxLength: 3 },
        ),
        fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !s.includes('<') && s.trim() === s),
        (praefix, bezeichnung) => {
          bezeichnung = [...praefix, bezeichnung].join(' ');
          const original: MarkierungsEintrag = markierungsEintrag({
            typ: 'verweismarkierung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
              bezugstext: 'x',
            },

            verweisinhalt: {
              verweistext: 'xxxxx',
              verweisziele: [
                verweisziel({
                  typ: 'zielnormOhneElementstand',
                  gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
                  bezeichnung,
                  verweistextZeichenbereich: [0, 5],
                }),
              ],
            },
          });
          expect(
            parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [original])),
          ).toEqual([original]);
        },
      ),
      { numRuns: 50 },
    );
  });
});

it('schreibt wohlgeformtes XML', () => {
  pruefeXmlWohlgeformtheit(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [unterstreichung()]));
});

describe('Phase D: Zeichenattribute und Wiederholungspfade', () => {
  it.each([
    '<zeichenbereich ende="5" start="0"/>',
    '<zeichenbereich  start = "0"\n ende = "5" />',
    '<zeichenbereich\n ende = "5"  start = "0"  />',
  ])('liest %s unabhängig von Attributreihenfolge und Leerraum', (zeichenbereich) => {
    const eintrag = unterstreichung();
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag]);
    expect(
      parseEintraege(xml.replace('<zeichenbereich start="0" ende="5"/>', zeichenbereich)),
    ).toEqual(parseEintraege(xml));
  });

  it.each([
    '<verweistextZeichenbereich ende="4" start="1"/>',
    '<verweistextZeichenbereich  ende = "4"\n start = "1" />',
  ])('liest %s bei Zielnormen', (zeichenbereich) => {
    const eintrag = unterstreichung({
      typ: 'verweismarkierung',
      verweisinhalt: {
        verweistext: '§ 2',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
            bezeichnung: '2',
            verweistextZeichenbereich: [1, 4],
          }),
        ],
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag]);
    expect(
      parseEintraege(
        xml.replace('<verweistextZeichenbereich start="1" ende="4"/>', zeichenbereich),
      ),
    ).toEqual(parseEintraege(xml));
  });

  it('erhält jede Wiederholung eines tiefen Pfades am zugehörigen Schritt', () => {
    const eintrag = unterstreichung({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({
            eintraege: [
              { ebene: 'nummer', bezeichnung: '1', wiederholung: 2 },
              { ebene: 'litera', bezeichnung: 'a', wiederholung: 3 },
              { ebene: 'nummer', bezeichnung: '1', wiederholung: 4 },
              { ebene: 'litera', bezeichnung: 'a', wiederholung: 5 },
            ],
            satz: 2,
            satzInEintrag: 3,
          }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag]);
    expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
    expect(xml).not.toContain('<wiederholung>');
    expect(parseEintraege(xml)[0]?.bezug.textstelle?.pfad.eintraege).toEqual(
      eintrag.bezug.textstelle?.pfad.eintraege,
    );
    expect(parseEintraege(xml)[0]).toMatchObject({
      bezug: { textstelle: { pfad: { typ: 'normtext' as const, satz: 2, satzInEintrag: 3 } } },
    });
  });
});

describe('Volle Ausgangsbezeichnung', () => {
  it.each(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'] as const)(
    '%s erhält volle Bezeichnungen und XML-Sonderzeichen im Rundlauf',
    (typ) => {
      for (const bezeichnung of ['§ 1', 'Art. 229 § 1', 'A&<>" 1']) {
        const e = unterstreichung({
          typ,
          ausgangsstelle: normAusgangsstelle(bezeichnung),

          kommentarText: 'Notiz',
          ...(typ === 'verweismarkierung'
            ? {
                verweisinhalt: {
                  verweistext: '2',
                  verweisziele: [
                    verweisziel({
                      typ: 'zielnormOhneElementstand',
                      bezeichnung: '2',
                      verweistextZeichenbereich: [0, 1],
                    }),
                  ],
                },
              }
            : {}),
        });
        const xml = baueXML(gesetzesreferenz({ kurztitel: 'Test' }), [e]);
        expect(parseEintraege(xml)[0]).toMatchObject({
          ausgangsstelle: normAusgangsstelle(bezeichnung),
        });
        pruefeXmlWohlgeformtheit(xml);
      }
    },
  );
  it('liest volle Bezeichnungen und verwirft alte Präfixattribute', () => {
    for (const attribut of ['', ' praefix=""']) {
      const xml = `<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung${attribut}>1</bezeichnung><kommentartext>x</kommentartext></kommentar>`;
      if (attribut) expect(parseEintraege(xml)[0]).toBeUndefined();
      else
        expect(parseEintraege(xml)[0]?.ausgangsstelle).toEqual({ typ: 'norm', bezeichnung: '1' });
    }
  });
  it('trennt äußere Ausgangsnorm und innere Zielnorm', () => {
    const e = unterstreichung({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('Anhang 1'),

      verweisinhalt: {
        verweistext: '§ 2',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            bezeichnung: '§ 2',

            verweistextZeichenbereich: [0, 3],
          }),
        ],
      },
    });
    const gelesen = parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'Test' }), [e]))[0];
    expect(gelesen && bezeichnungAusgangsstelle(gelesen.ausgangsstelle)).toBe('Anhang 1');
    expect(gelesen?.verweisinhalt?.verweisziele[0]?.bezeichnung).toBe('§ 2');
  });
});

// Die älteren Einzelblock-Fixtures erhalten den vorgesehenen Datei-/textstelle-Container.
function parseEintraege(fragment: string) {
  if (fragment.startsWith('<?xml') || fragment.startsWith('<markierungen'))
    return parseDateiEintraege(fragment).eintraege;
  const doc = new DOMParser().parseFromString(
    `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>${fragment.replace(/^<inhalt>/, '').replace(/<\/inhalt>$/, '')}</inhalt></markierungen>`,
    'application/xml',
  );
  for (const block of Array.from(doc.querySelector('inhalt')?.children ?? [])) {
    let textstelle = block.querySelector(':scope > textstelle');
    for (const kind of Array.from(block.children)) {
      if (
        ['absatz', 'unterabsatz', 'satz', 'nummer', 'litera', 'bereich', 'zeichenbereich'].includes(
          kind.tagName,
        )
      ) {
        if (!textstelle) {
          textstelle = doc.createElement('textstelle');
          block.appendChild(textstelle);
        }
        textstelle.appendChild(kind);
      }
    }
  }
  return parseDateiEintraege(new XMLSerializer().serializeToString(doc)).eintraege;
}

it('DOM-Dateileser ignoriert Erweiterungen, Kommentare und versteckte Einträge', () => {
  const xml = `<markierungen version='1' extra='x'><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>
    <kommentar extra='x'><elementstand><textlaenge>0</textlaenge></elementstand><neu><bezeichnung>falsch</bezeichnung><kommentartext>falsch</kommentartext></neu><bezeichnung extra='x'>§ 1</bezeichnung><kommentartext>A &amp; B</kommentartext></kommentar>
    <neu><kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 9</bezeichnung><kommentartext>falsch</kommentartext></kommentar></neu>
    <!-- <kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 8</bezeichnung><kommentartext>falsch</kommentartext></kommentar> -->
  </inhalt></markierungen>`;
  const eintraege = parseDateiEintraege(xml).eintraege;
  expect(eintraege).toHaveLength(1);
  expect(eintraege[0]).toMatchObject({
    bezug: { elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),

    kommentarText: 'A & B',
  });
});
it('DOM-Dateileser liest Satzrollen und Bereiche ausschließlich unter textstelle', () => {
  const xml = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><unterstreichung><bezeichnung>§ 1</bezeichnung>
    <neu><textstelle><zeichenbereich start='9' ende='99'/></textstelle></neu>
    <textstelle><satz extra='x'>2</satz><nummer wiederholung='2' extra='x'>1.</nummer><neu><satz>9</satz></neu><satz>3</satz><zeichenbereich ende = '5' extra='x' start = '0' ></zeichenbereich></textstelle><bezugstext>Hallo</bezugstext>
  </unterstreichung></inhalt></markierungen>`;
  expect(parseDateiEintraege(xml).eintraege[0]).toMatchObject({
    bezug: {
      textstelle: {
        pfad: {
          typ: 'normtext' as const,
          satz: 2,
          satzInEintrag: 3,
          eintraege: [{ ebene: 'nummer', bezeichnung: '1.', wiederholung: 2 }],
        },
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
      },
    },
  });
});
it('DOM-Dateileser verwirft beschädigtes XML', () => {
  expect(
    () =>
      parseDateiEintraege(
        '<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt></markierungen>',
      ).eintraege,
  ).toThrow('Datei ungültig');
});

it('erhält Normgeber der Ausgangs- und Zielreferenz', () => {
  const e = unterstreichung({
    typ: 'verweismarkierung',
    verweisinhalt: {
      verweistext: '§ 2 BGB',
      verweisziele: [
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: { kurztitel: 'BGB', normgeber: 'de-bw' },
          bezeichnung: '2',
          verweistextZeichenbereich: [0, 7],
        }),
      ],
    },
  });
  const roh = baueXML({ kurztitel: 'BGB', normgeber: 'de-bund' }, [e]);
  expect(roh).toContain('<gesetz normgeber="de-bund">BGB</gesetz>');
  expect(parseDateiEintraege(roh).eintraege[0]?.verweisinhalt?.verweisziele?.[0]?.gesetz).toEqual({
    kurztitel: 'BGB',
    normgeber: 'de-bw',
  });
  const ungueltig = parseDateiEintraege(roh.replace('normgeber="de-bw"', 'normgeber="A_B"'));
  expect(ungueltig.eintraege).toEqual([]);
  expect(ungueltig.befunde).toMatchObject([
    { fall: 'verweiszielUngueltig', typ: 'verweismarkierung' },
  ]);
});

it('weist abweichende Ausgangsreferenzen einschließlich des Normgebers zurück', () => {
  const roh = baueXML({ kurztitel: 'BGB', normgeber: 'de-bund' }, [unterstreichung()]);
  expect(
    parseDateiEintraege(roh, { kurztitel: 'bgb', normgeber: 'de-bund' }).eintraege,
  ).toHaveLength(1);
  expect(
    () => parseDateiEintraege(roh, { kurztitel: 'BGB', normgeber: 'de-bw' }).eintraege,
  ).toThrow('zugeordnet');
  expect(
    () => parseDateiEintraege(roh.replace('normgeber="de-bund"', 'normgeber="A_B"')).eintraege,
  ).toThrow('Normgeber');
});

describe('Endformat der Markierungen', () => {
  it.each(['amtlicherTitel', 'nichtamtlicherTitel', 'bezeichnung'] as const)(
    'Bereich %s bleibt auch mit Zusatzmetadaten erhalten',
    (bereich) => {
      const original = unterstreichung({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: bereichPfad(bereich), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
          bezugstext: '',
        },
      });
      const xml = baueXML({ kurztitel: 'BGB', normgeber: 'de-bund' }, [original]);
      const erweitert = xml.replace(
        '<textstelle>',
        '<textstelle zusatz="ja"><metadaten><bereich>unbekannt</bereich></metadaten>',
      );
      expect(parseDateiEintraege(erweitert).eintraege).toEqual([original]);
    },
  );
  it('unbekannter Bereich wird als ungültiger Textpfad gemeldet', () => {
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [unterstreichung()]).replace(
      '<textstelle>',
      '<textstelle><bereich>erweiterung</bereich>',
    );
    expect(parseDateiEintraege(xml)).toMatchObject({
      eintraege: [],
      befunde: [{ fall: 'textpfadUngueltig' }],
    });
  });
  it('ohneZiel wird bei einem konkreten Ziel nicht geschrieben', () => {
    const e: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: {
        verweistext: '§ 2',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            bezeichnung: '2',
            verweistextZeichenbereich: [0, 3],
          }),
        ],
      },
    });
    expect(baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [e])).not.toContain('ohneZiel');
  });
});

it('erhält beide Satzrollen im XML-Rundlauf vor und nach der Listenkette', () => {
  const e = unterstreichung({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({
          absatz: '(1)',
          unterabsatz: '[2]',
          satz: 1,
          eintraege: [
            { ebene: 'nummer', bezeichnung: '1' },
            { ebene: 'litera', bezeichnung: 'a' },
          ],
          satzInEintrag: 2,
        }),
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      },
      bezugstext: 'B',
    },
  });
  const gesetz = gesetzesreferenz({ kurztitel: 'TestG' });
  const xml = baueXML(gesetz, [e]);
  expect(xml).toMatch(
    /<satz>1<\/satz>\s*<nummer>1<\/nummer>\s*<litera>a<\/litera>\s*<satz>2<\/satz>/,
  );
  expect(parseDateiEintraege(xml, gesetz).eintraege).toEqual([e]);
});

describe('vereinheitlichter Markierungsformatvertrag', () => {
  it.each(['unterstreichung', 'hervorhebung', 'verweismarkierung', 'kommentar'] as const)(
    'speichert und liest %s mit identischem internen Typ und XML-Tag',
    (typ) => {
      const eintrag: MarkierungsEintrag = markierungsEintrag({
        typ,
        ausgangsstelle: normAusgangsstelle('§ 433'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
          bezugstext: 'Text',
        },
        ...(typ === 'kommentar' ? { kommentarText: 'Anmerkung' } : {}),
        ...(typ === 'verweismarkierung'
          ? {
              verweisinhalt: {
                verweistext: '§ 434',
                verweisziele: [
                  verweisziel({
                    typ: 'zielnormOhneElementstand',
                    bezeichnung: '434',
                    verweistextZeichenbereich: [0, 5] as [number, number],
                  }),
                ],
              },
            }
          : {}),
      });
      const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag]);
      expect(xml).toContain(`<${typ}>`);
      expect(xml).toContain(`</${typ}>`);
      expect(xml).toContain('<markierungen version="1">');
      expect(parseDateiEintraege(xml).eintraege).toEqual([expect.objectContaining(eintrag)]);
    },
  );
  it.each(['unterstreichen', 'hervorheben', 'underline', 'highlight', 'verweis'])(
    'liest den alten Tag %s nicht mehr',
    (tag) => {
      expect(
        parseDateiEintraege(
          `<markierungen version="1"><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><${tag}><bezeichnung>§ 433</bezeichnung><textstelle><zeichenbereich start="0" ende="4"/></textstelle><bezugstext>Text</bezugstext></${tag}></inhalt></markierungen>`,
        ).eintraege,
      ).toEqual([]);
    },
  );
});

describe('getrennte Überschriftenkennung', () => {
  it('erhält Überschrift 010 und Norm 1010 im Roundtrip', () => {
    const u = unterstreichung({ ausgangsstelle: ueberschriftAusgangsstelle('010') });
    const n = unterstreichung({
      ausgangsstelle: normAusgangsstelle('§ 1010'),
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [u, n]);
    expect(xml).toContain('<gliederungskennzahl>010</gliederungskennzahl>');
    expect(parseDateiEintraege(xml).eintraege).toMatchObject([u, n]);
  });
  it.each([
    '<bezeichnung>§ 010</bezeichnung><gliederungskennzahl>010</gliederungskennzahl>',
    '',
    '<gliederungskennzahl/>',
    '<gliederungskennzahl>01</gliederungskennzahl>',
    '<gliederungskennzahl>abc</gliederungskennzahl>',
    '<gliederungskennzahl>010</gliederungskennzahl><gliederungskennzahl>020</gliederungskennzahl>',
    '<bezeichnung>§ 1</bezeichnung><bezeichnung>§ 2</bezeichnung>',
    '<gliederungskennzahl praefix="§">010</gliederungskennzahl>',
  ])('überspringt ungültige Kennung %s und erhält folgenden Eintrag', (kennung) => {
    const xml = `<markierungen version="1"><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><kommentar><elementstand><textlaenge>0</textlaenge></elementstand>${kennung}<kommentartext>defekt</kommentartext></kommentar><kommentar><elementstand><textlaenge>0</textlaenge></elementstand><gliederungskennzahl>010020</gliederungskennzahl><kommentartext>gültig</kommentartext></kommentar></inhalt></markierungen>`;
    expect(parseDateiEintraege(xml).eintraege).toMatchObject([
      { ausgangsstelle: ueberschriftAusgangsstelle('010020'), kommentarText: 'gültig' },
    ]);
    expect(parseDateiEintraege(xml).eintraege).toHaveLength(1);
  });
});

describe('Kommentar-Elementstand', () => {
  it('erhält den optionalen Elementstand im Roundtrip und entfernt ihn bei Textbezug', () => {
    const eintrag: MarkierungsEintrag = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'Hinweis',
      bezug: {
        typ: 'pauschal' as const,
        elementstand: { titel: 'Amtlicher Titel', textlaenge: 12 },
      },
    });
    expect(
      parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [eintrag]))[0]?.bezug
        .elementstand,
    ).toEqual(eintrag.bezug.elementstand);
    const mitText = markierungsEintrag({
      ...eintrag,
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 2 },
        bezugstext: 'ab',
      },
    });
    const xml = baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [mitText]);
    expect(xml).not.toContain('<elementstand>');
    expect(parseEintraege(xml)[0]?.bezug.elementstand).toBeUndefined();
  });
});

it.each([
  ['externes Gesetz', true, false],
  ['externes Gesetz', false, false],
  ['Ausgangsgesetz', true, false],
  ['Ausgangsgesetz', false, false],
  ['ohne Ziel', true, true],
  ['ohne Ziel', false, true],
] as const)('erhält das XML für %s (mit Bezugstext=%s)', (art, mitBezugstext, ohneVerweisziel) => {
  const ausgang = { normgeber: 'de-bund', kurztitel: 'TestG' };
  const original: MarkierungsEintrag = markierungsEintrag({
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    ...(mitBezugstext
      ? {
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 2 },
            bezugstext: 'GG',
          },
        }
      : {
          bezug: {
            typ: 'pauschal' as const,
            elementstand: { titel: 'Ausgangsnorm', textlaenge: 42 },
          },
        }),
    verweisinhalt: {
      verweistext: 'GG',
      verweisziele: ohneVerweisziel
        ? []
        : [
            verweisziel({
              typ: 'ganzesGesetz',
              gesetz:
                art === 'Ausgangsgesetz' ? ausgang : { normgeber: 'de-bund', kurztitel: 'GG' },
              verweistextZeichenbereich: [0, 2],
            }),
          ],
    },
  });
  const xml = baueXML(ausgang, [original], new Date('2026-10-11T14:51:10Z'));
  expect(xml).toMatchSnapshot();
  expect(parseEintraege(xml)).toEqual([original]);
});

describe('Unvollständiger Textbezug wird als Befund abgelehnt', () => {
  const grenzen = [
    '',
    '<zeichenbereich start="0"/>',
    '<zeichenbereich ende="4"/>',
    '<zeichenbereich start="-1" ende="4"/>',
    '<zeichenbereich start="0" ende="x"/>',
    '<zeichenbereich start="1.5" ende="4"/>',
    '<zeichenbereich start="" ende="4"/>',
  ];
  it.each(['kommentar', 'verweismarkierung'] as const)('%s wird mit Befund verworfen', (typ) => {
    for (const zeichenbereich of grenzen) {
      const xml = `<markierungen version="1"><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><${typ}>
        <bezeichnung>§ 1</bezeichnung><textstelle><absatz>(1)</absatz><unterabsatz>[2]</unterabsatz>
        <satz>3</satz><nummer wiederholung="1">1.</nummer><litera>a)</litera><satz>4</satz>
        <bereich>amtlicher-titel</bereich>${zeichenbereich}</textstelle>
        <elementstand><titel>Titel</titel><textlaenge>17</textlaenge></elementstand>
        <kommentartext>Notiz</kommentartext><verweisinhalt><verweistext>§ 2</verweistext><verweisziel>
        <bezeichnung>§ 2</bezeichnung><verweistextZeichenbereich start="0" ende="3"/>
        </verweisziel></verweisinhalt></${typ}></inhalt></markierungen>`;
      const gelesen = parseDateiEintraege(xml);
      expect(gelesen.eintraege).toEqual([]);
      expect(gelesen.befunde).toMatchObject([{ fall: 'textbezugUngueltig', typ }]);
    }
  });
  it.each(['unterstreichung', 'hervorhebung'] as const)(
    '%s ohne gültige Grenzen wird weiterhin verworfen',
    (typ) => {
      for (const zeichenbereich of grenzen) {
        expect(
          parseDateiEintraege(`<markierungen version="1"><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><${typ}><bezeichnung>§ 1</bezeichnung>
        <textstelle><absatz>(1)</absatz>${zeichenbereich}</textstelle><bezugstext>Text</bezugstext>
        </${typ}></inhalt></markierungen>`).eintraege,
        ).toEqual([]);
      }
    },
  );
});

describe('Elementstand-Eingangskontrolle', () => {
  const stand = '<elementstand><titel>Titel</titel><textlaenge>3</textlaenge></elementstand>';
  function lesen(inhalt: string) {
    return parseDateiEintraege(
      `<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt>${inhalt}</inhalt></markierungen>`,
    );
  }
  it.each(['kommentar', 'verweismarkierung'])('lehnt pauschale %s ohne Elementstand ab', (typ) => {
    const zusatz =
      typ === 'kommentar'
        ? '<kommentartext>x</kommentartext>'
        : '<verweisinhalt><verweistext>x</verweistext></verweisinhalt>';
    expect(lesen(`<${typ}><bezeichnung>§ 1</bezeichnung>${zusatz}</${typ}>`).befunde).toHaveLength(
      1,
    );
  });
  it.each(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'])(
    'lehnt Elementstand mit Bezugstext bei %s ab',
    (typ) => {
      const zusatz =
        typ === 'verweismarkierung'
          ? '<verweisinhalt><verweistext>x</verweistext></verweisinhalt>'
          : '<kommentartext>x</kommentartext>';
      expect(
        lesen(
          `<${typ}><bezeichnung>§ 1</bezeichnung><textstelle><zeichenbereich start="0" ende="1"/></textstelle><bezugstext>x</bezugstext>${stand}${zusatz}</${typ}>`,
        ).befunde,
      ).toHaveLength(1);
    },
  );
  it.each([
    '<elementstand/>',
    stand + stand,
    '<normstand><normlaenge>3</normlaenge></normstand>',
    '<elementstand><textlaenge>-1</textlaenge></elementstand>',
    '<elementstand><textlaenge>falsch</textlaenge></elementstand>',
  ])('lehnt defekten, mehrfachen oder alten Zielstand ab: %s', (zielstand) => {
    const ergebnis = lesen(
      `<verweismarkierung><bezeichnung>§ 1</bezeichnung>${stand}<verweisinhalt><verweistext>x</verweistext><verweisziel><bezeichnung>§ 2</bezeichnung><verweistextZeichenbereich start="0" ende="1"/>${zielstand}</verweisziel></verweisinhalt></verweismarkierung>`,
    );
    expect(ergebnis.eintraege).toEqual([]);
    expect(ergebnis.befunde).toMatchObject([{ fall: 'verweiszielUngueltig' }]);
  });
});

it.each([
  '<normstand><normlaenge>3</normlaenge></normstand>',
  '<elementstand><textlaenge>-1</textlaenge></elementstand>',
  '<elementstand><textlaenge>falsch</textlaenge></elementstand>',
  '<elementstand><textlaenge>1</textlaenge></elementstand><elementstand><textlaenge>1</textlaenge></elementstand>',
])('meldet einen alten, ungültigen oder mehrfachen Ausgangsstand: %s', (stand) => {
  const xml = `<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung>${stand}<kommentartext>Notiz</kommentartext></kommentar></inhalt></markierungen>`;
  const ergebnis = parseDateiEintraege(xml);
  expect(ergebnis.eintraege).toEqual([]);
  expect(ergebnis.befunde).toMatchObject([{ fall: 'elementstandUngueltig' }]);
});

// Phase 1: Altformat wird nicht migriert.
it('überspringt eine Markierung mit altem Textstellen-Tag ohne Absturz', () => {
  const altesTag = 'text' + 'ID';
  const xml = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt>
    <unterstreichung><bezeichnung>§ 1</bezeichnung><${altesTag}><absatz>(1)</absatz><zeichenbereich start="0" ende="4"/></${altesTag}><bezugstext>Text</bezugstext></unterstreichung>
  </inhalt></markierungen>`;
  expect(parseDateiEintraege(xml).eintraege).toEqual([]);
});
