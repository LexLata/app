import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonflikteXML.test.ts
//
// Tests für markierungskonflikteXML.ts – reine XML-Bau-/Parse-Helfer für
// markierungskonflikte.xml (kein Datei-I/O, siehe Kopfkommentar der
// Quelldatei). Struktur:
//   - gesetzesreferenzAusDateiname, parseNichtamtlicheTitelXmlFehlt: triviale
//     String-/Regex-Helfer, direkt getestet.
//   - baueGesetzBlock (baut, inkl. des privaten baueMarkierungBlock) und
//     parseKonfliktEintraege (parst zurück): je einzeln UND im Roundtrip,
//     da parseKonfliktEintraege laut eigenem Kopfkommentar ein "stiller
//     Kopplungspunkt" ans Ausgabeformat von baueMarkierungBlock ist – der
//     Roundtrip-Test ist genau die Absicherung gegen ein künftiges
//     Auseinanderlaufen beider Seiten.
//   - patchReferenzierendesGesetz/patchEigenenEintrag: nutzen echte
//     GesetzDarstellung-Fixtures und die (bereits separat getesteten,
//     reinen) Funktionen aus markierungskonfliktPruefung.ts – Fixture-Factories
//     bewusst analog zu markierungskonfliktPruefung.test.ts gehalten, damit
//     beide Testdateien im selben Stil lesbar bleiben.
//
// Vitest (Node-Umgebung), kein DOM-Polyfill nötig (reine String-/
// Regex-Verarbeitung, kein DOMParser).

// ---------------------------------------------------------------------------
// Test-Factories (analog zu markierungskonfliktPruefung.test.ts)
// ---------------------------------------------------------------------------

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, expect, it } from 'vitest';
import { parseEintraege } from './markierungs-xml.index';
import {
  baueGesetzBlock,
  gesetzesreferenzAusBlock,
  parseKonfliktEintraege as parseDateiKonflikte,
  parseNichtamtlicheTitelXmlFehlt as parseDateiTitelFehlt,
  patchEigenenEintrag,
  patchReferenzierendesGesetz,
} from './markierungskonflikteXML';
import { bauTextstelleZeilen } from './markierungsXML';
import type { KonfliktEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { GesetzDarstellung, NormDarstellung } from '@/lib/domain/gesetzTypes';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function norm(
  xmlId: string,
  bezeichnung: string,
  opts?: { titel?: string; textLaenge?: number },
): NormDarstellung {
  const textLaenge = opts?.textLaenge ?? 0;
  return normaleNorm({
    id: naechsteId(),
    xmlId,
    bezeichnung,
    titel: opts?.titel,
    absaetze:
      textLaenge > 0
        ? [
            {
              id: naechsteId(),
              bezeichnung: '(1)',
              saetze: [{ id: naechsteId(), zahl: 1, text: 'x'.repeat(textLaenge), eintraege: [] }],
            },
          ]
        : [],
  });
}

function gesetz(kurztitel: string, normen: NormDarstellung[]): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: normen.map((n) => ({ typ: 'norm' as const, data: n })),
  });
}

function zielnorm(overrides: Parameters<typeof zielnormTestdaten>[0]): Verweisziel {
  return zielnormTestdaten(overrides);
}

function verweisEintrag(
  bezeichnung: string,
  verweisziele: Verweisziel[],
  verweistext = 'x',
): MarkierungsEintrag {
  return markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
    verweisinhalt: { verweistext, verweisziele },
  });
}

function kommentarEintrag(bezeichnung: string, kommentarText: string): MarkierungsEintrag {
  return markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
    kommentarText,
  });
}

// ---------------------------------------------------------------------------
// gesetzesreferenzAusDateiname
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parseNichtamtlicheTitelXmlFehlt (nichtamtlicheTitelXmlFehlt, Gesetz-Ebene)
// ---------------------------------------------------------------------------

describe('parseNichtamtlicheTitelXmlFehlt', () => {
  it('true bei vorhandenem <konflikt typ="nichtamtliche-titel-xml-fehlt"/>', () => {
    expect(
      parseNichtamtlicheTitelXmlFehlt(
        '<gesetz><konflikt typ="nichtamtliche-titel-xml-fehlt"/></gesetz>',
      ),
    ).toBe(true);
  });

  it('false ohne diesen Marker', () => {
    expect(parseNichtamtlicheTitelXmlFehlt('<gesetz></gesetz>')).toBe(false);
  });

  it('Edge-Case: ein <konflikt typ="gesetz-fehlt"/> (gesetzFehlt, fehlendes Gesetz) zählt NICHT als 1a', () => {
    expect(parseNichtamtlicheTitelXmlFehlt('<gesetz><konflikt typ="gesetz-fehlt"/></gesetz>')).toBe(
      false,
    );
  });

  it('Edge-Case: ein <konflikt typ="ziel-norm-unpassend" gesetz="X" normgeber="de-bund"/> innerhalb eines markierung-Blocks zählt nicht als 1a', () => {
    expect(
      parseNichtamtlicheTitelXmlFehlt(
        '<unbekannt><konflikt typ="ziel-norm-unpassend" gesetz="X" normgeber="de-bund"/></unbekannt>',
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// baueGesetzBlock (inkl. privatem baueMarkierungBlock)
// ---------------------------------------------------------------------------

describe('baueGesetzBlock', () => {
  it('fehlendesGesetz (gesetzFehlt): nur <konflikt typ="gesetz-fehlt"/>, keine markierung-Blöcke', () => {
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      fehlendesGesetz: true,
      eintraege: [],
    });
    expect(block).toBe(
      [
        '    <gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <konflikt typ="gesetz-fehlt"/>',
        '    </gesetz>',
      ].join('\n'),
    );
  });

  it('leere eintraege ohne 1a: nur der leere Rahmen', () => {
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [],
    });
    expect(block).toBe(
      ['    <gesetz kurztitel="BGB" normgeber="de-bund">', '    </gesetz>'].join('\n'),
    );
  });

  it('kurztitel wird escaped', () => {
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'Gesetz & Co' }),
      eintraege: [],
    });
    expect(block).toContain('<gesetz kurztitel="Gesetz &amp; Co" normgeber="de-bund">');
  });

  it('nichtamtlicheTitelXmlFehlt (1a) UND eigenerKonflikt (2) UND ein Zielkonflikt gemeinsam, mit textstelle', () => {
    const k: KonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [
        { typ: 'zielNormUnpassend', gesetz: gesetzesreferenz({ kurztitel: 'StGB' }) },
      ],
      ausgangsstelle: normAusgangsstelle('§ 433'),
      markierungstyp: 'unterstreichung',
      textstelle: {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
      },
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: true,
      eintraege: [k],
    });
    expect(block).toBe(
      [
        '    <gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <konflikt typ="nichtamtliche-titel-xml-fehlt"/>',
        '        <unterstreichung>',
        '            <konflikt typ="bezugstext-fehlt-oder-unpassend"/>',
        '            <konflikt typ="ziel-norm-unpassend" gesetz="StGB" normgeber="de-bund"/>',
        '            <bezeichnung>§ 433</bezeichnung>',
        '            <textstelle>',
        bauTextstelleZeilenErwartungFuerZeichen(0, 5, '(1)'),
        '            </textstelle>',
        '        </unterstreichung>',
        '    </gesetz>',
      ].join('\n'),
    );
  });

  it('kommentar OHNE textstelle: <kommentartext> statt <textstelle>', () => {
    const k: KonfliktEintrag = {
      zielKonflikte: [],
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      markierungstyp: 'kommentar',
      kommentarText: 'Anmerkung & mehr',
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [k],
    });
    expect(block).toContain('<kommentartext>Anmerkung &amp; mehr</kommentartext>');
    expect(block).not.toContain('<textstelle>');
  });

  it('verweis OHNE textstelle: <verweistext> statt <textstelle>, mehrere Zielkonflikte in Reihenfolge', () => {
    const k: KonfliktEintrag = {
      zielKonflikte: [
        { typ: 'zielGesetzFehlt', gesetz: gesetzesreferenz({ kurztitel: 'StGB' }) },
        { typ: 'zielNormFehlt', gesetz: gesetzesreferenz({ kurztitel: 'HGB' }) },
      ],
      ausgangsstelle: normAusgangsstelle('§ 1'),
      markierungstyp: 'verweismarkierung',
      verweistext: 'siehe § 1 StGB',
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [k],
    });
    expect(block).toContain('<verweistext>siehe § 1 StGB</verweistext>');
    expect(block).not.toContain('<textstelle>');
    const idxStgb = block.indexOf('typ="ziel-gesetz-fehlt" gesetz="StGB"');
    const idxHgb = block.indexOf('typ="ziel-norm-fehlt" gesetz="HGB"');
    expect(idxStgb).toBeGreaterThan(-1);
    expect(idxHgb).toBeGreaterThan(idxStgb);
  });

  it('Edge-Case: weder eigenerKonflikt noch zielKonflikte (kann bei patchEigenenEintrag entstehen, wenn NUR 1a greift) -> kein <konflikt>-Tag im Block, restliche Felder trotzdem vorhanden', () => {
    const k: KonfliktEintrag = {
      zielKonflikte: [],
      ausgangsstelle: normAusgangsstelle('§ 1'),
      markierungstyp: 'kommentar',
      kommentarText: 'x',
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [k],
    });
    expect(block).not.toContain('<konflikt typ="bezugstext-fehlt-oder-unpassend"/>');
    expect(block).not.toContain('<konflikt gesetz="');
    expect(block).toContain('<bezeichnung>§ 1</bezeichnung>');
  });

  it('mehrere Einträge erscheinen in Reihenfolge, getrennt', () => {
    const k1: KonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      ausgangsstelle: normAusgangsstelle('§ 1'),
      markierungstyp: 'unterstreichung',
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
    };
    const k2: KonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      ausgangsstelle: normAusgangsstelle('§ 2'),
      markierungstyp: 'unterstreichung',
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [k1, k2],
    });
    const idx1 = block.indexOf('>§ 1</bezeichnung>');
    const idx2 = block.indexOf('>§ 2</bezeichnung>');
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);
    expect([...block.matchAll(/<unterstreichung>/g)]).toHaveLength(2);
  });

  it('mehrere Einträge werden durch Zeilenumbruch getrennt (nicht direkt aneinandergehängt)', () => {
    const k1: KonfliktEintrag = {
      zielKonflikte: [],
      ausgangsstelle: normAusgangsstelle('§ 1'),
      markierungstyp: 'kommentar',
      kommentarText: 'x',
    };
    const k2: KonfliktEintrag = {
      zielKonflikte: [],
      ausgangsstelle: normAusgangsstelle('§ 2'),
      markierungstyp: 'kommentar',
      kommentarText: 'x',
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [k1, k2],
    });
    // Ohne Trennzeichen stünden '</unterstreichung>' und '        <unbekannt>'
    // (des zweiten Eintrags) ohne Zeilenumbruch direkt hintereinander.
    expect(block).toContain('</kommentar>\n        <kommentar>');
  });
});

// Hilfsfunktion, um die (durch bauTextstelleZeilen erzeugten) textstelle-Innenzeilen
// nicht ein zweites Mal per Hand nachzubilden – nutzt bewusst dieselbe,
// bereits separat in markierungsXML.test.ts getestete Funktion.
function bauTextstelleZeilenErwartungFuerZeichen(
  start: number,
  ende: number,
  absatz?: string,
): string {
  return bauTextstelleZeilen(
    markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ x'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz }),
          zeichenbereichStart: start,
          zeichenbereichEnde: ende,
        },
        bezugstext: '',
      },
    }).bezug.textstelle,
  );
}

// ---------------------------------------------------------------------------
// parseKonfliktEintraege
// ---------------------------------------------------------------------------

describe('parseKonfliktEintraege', () => {
  it('parst eigenerKonflikt (eigener Bezugskonflikt, kein kurztitel-Attribut)', () => {
    const roh =
      '<kommentar><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>x</bezeichnung><kommentartext>x</kommentartext></kommentar>';
    const [eintrag] = parseKonfliktEintraege(roh);
    expect(eintrag!.eigenerKonflikt).toBe('bezugstextFehltOderUnpassend');
    expect(eintrag!.zielKonflikte).toEqual([]);
  });

  it('parst mehrere Zielkonflikte (Zielkonflikte) mit kurztitel-Attribut, unescaped', () => {
    const roh =
      '<verweismarkierung><konflikt typ="ziel-gesetz-fehlt" gesetz="Sozialgesetzbuch &amp; V" normgeber="de-bund"/><konflikt typ="ziel-norm-fehlt" gesetz="HGB" normgeber="de-bund"/><bezeichnung>x</bezeichnung><verweistext>x</verweistext></verweismarkierung>';
    const [eintrag] = parseKonfliktEintraege(roh);
    expect(eintrag!.eigenerKonflikt).toBeUndefined();
    expect(eintrag!.zielKonflikte).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'Sozialgesetzbuch & V' }), typ: 'zielGesetzFehlt' },
      { gesetz: gesetzesreferenz({ kurztitel: 'HGB' }), typ: 'zielNormFehlt' },
    ]);
  });

  it('schluessel bei textstelle: "bezeichnung|typ|z:start-ende"', () => {
    const roh =
      '<unterstreichung><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>§ 433</bezeichnung><textstelle><zeichenbereich start="3" ende="7"/></textstelle></unterstreichung>';
    const [eintrag] = parseKonfliktEintraege(roh);
    expect(eintrag!.schluessel).toBe('norm:§ 433|unterstreichung|z:3-7|[null,null,0,null,1,[],1]');
  });

  it('schluessel bei kommentar ohne textstelle: "bezeichnung|kommentar|t:text"', () => {
    const roh =
      '<kommentar><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>§ 1</bezeichnung><kommentartext>Hallo</kommentartext></kommentar>';
    const [eintrag] = parseKonfliktEintraege(roh);
    expect(eintrag!.schluessel).toBe('norm:§ 1|kommentar|t:Hallo');
  });

  it('schluessel bei verweis ohne textstelle: "bezeichnung|verweismarkierung|v:text"', () => {
    const roh =
      '<verweismarkierung><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>§ 1</bezeichnung><verweistext>siehe § 1</verweistext></verweismarkierung>';
    const [eintrag] = parseKonfliktEintraege(roh);
    expect(eintrag!.schluessel).toBe('norm:§ 1|verweismarkierung|v:siehe § 1');
  });

  it('mehrere markierung-Blöcke werden alle erfasst, in Dokumentreihenfolge', () => {
    const roh = [
      '<unterstreichung><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="1"/></unterstreichung>',
      '<unterstreichung><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>§ 2</bezeichnung><zeichenbereich start="0" ende="1"/></unterstreichung>',
    ].join('');
    const result = parseKonfliktEintraege(roh);
    expect(result.map((e) => e.schluessel)).toEqual([
      'norm:§ 1|unterstreichung|z:0-1|[null,null,0,null,1,[],1]',
      'norm:§ 2|unterstreichung|z:0-1|[null,null,0,null,1,[],1]',
    ]);
  });

  it('Edge-Case: unbekannter Markierungstyp wird verworfen', () => {
    const roh =
      '<unbekannt><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>§ 1</bezeichnung><zeichenbereich start="0" ende="1"/></unbekannt>';
    const [eintrag] = parseKonfliktEintraege(roh);
    expect(eintrag).toBeUndefined();
  });

  it('leerer/kein Match -> leeres Array', () => {
    expect(parseKonfliktEintraege('')).toEqual([]);
    expect(parseKonfliktEintraege('<gesetz kurztitel="BGB" normgeber="de-bund"></gesetz>')).toEqual(
      [],
    );
  });

  it('Edge-Case: defensiv bei fehlendem <bezeichnung>/Markierungstyp (kann bei künftig geändertem Ausgabeformat auftreten, siehe Kopfkommentar "stiller Kopplungspunkt") -> Eintrag ohne Kennung wird übersprungen', () => {
    const roh =
      '<unbekannt><konflikt typ="bezugstext-fehlt-oder-unpassend"/><zeichenbereich start="0" ende="1"/></unbekannt>';
    expect(parseKonfliktEintraege(roh)).toEqual([]);
  });

  it('kombiniert: eigenerKonflikt UND Zielkonflikte im selben Block gemeinsam geparst', () => {
    const roh =
      '<verweismarkierung><konflikt typ="bezugstext-fehlt-oder-unpassend"/><konflikt typ="ziel-norm-unpassend" gesetz="StGB" normgeber="de-bund"/><bezeichnung>x</bezeichnung><verweistext>x</verweistext></verweismarkierung>';
    const [eintrag] = parseKonfliktEintraege(roh);
    expect(eintrag!.eigenerKonflikt).toBe('bezugstextFehltOderUnpassend');
    expect(eintrag!.zielKonflikte).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielNormUnpassend' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip: baueGesetzBlock -> parseKonfliktEintraege/parseNichtamtlicheTitelXmlFehlt
// (Absicherung des in markierungskonflikteXML.ts dokumentierten "stillen
// Kopplungspunkts" zwischen Bau- und Parse-Seite)
// ---------------------------------------------------------------------------

describe('Roundtrip baueGesetzBlock -> parseKonfliktEintraege', () => {
  it('schluessel aus dem geparsten Block entspricht identitaetsSchluessel() der ursprünglichen MarkierungsEintrag', () => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)', unterabsatz: '[2]' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: 'x',
      },
    });
    const k: KonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      ausgangsstelle: original.ausgangsstelle,
      markierungstyp: original.typ,
      textstelle: original.bezug.textstelle,
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [k],
    });
    expect(block).toContain('<unterabsatz>[2]</unterabsatz>');
    const [geparst] = parseKonfliktEintraege(block);
    // Der Konfliktleser lädt nur die Konfliktkennung; den Textpfad liest
    // derselbe Markierungsleser, der auch das gemeinsame Schreibformat nutzt.
    const textstelle = block.match(/<textstelle>[\s\S]*?<\/textstelle>/)![0];
    const [gelesen] = parseEintraege(
      `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><kommentar><bezeichnung>§ 433</bezeichnung>${textstelle}<bezugstext>x</bezugstext><kommentartext></kommentartext></kommentar></inhalt></markierungen>`,
    ).eintraege;
    expect(gelesen!.bezug.textstelle).toEqual(original.bezug.textstelle);
    expect(geparst!.schluessel).toBe(identitaetsSchluessel(original));
  });

  it('nichtamtlicheTitelXmlFehlt bleibt über den Roundtrip erhalten', () => {
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: true,
      eintraege: [],
    });
    expect(parseNichtamtlicheTitelXmlFehlt(block)).toBe(true);
  });

  it('zielKonflikte bleiben inhaltlich (typ+gesetz) über den Roundtrip erhalten', () => {
    const k: KonfliktEintrag = {
      zielKonflikte: [
        { typ: 'zielNormUnpassend', gesetz: gesetzesreferenz({ kurztitel: 'StGB' }) },
        { typ: 'zielNormFehlt', gesetz: gesetzesreferenz({ kurztitel: 'HGB' }) },
      ],
      ausgangsstelle: normAusgangsstelle('§ 1'),
      markierungstyp: 'verweismarkierung',
      verweistext: 'x',
    };
    const block = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [k],
    });
    const [geparst] = parseKonfliktEintraege(block);
    expect(geparst!.zielKonflikte).toEqual(k.zielKonflikte);
  });
});

// ---------------------------------------------------------------------------
// patchReferenzierendesGesetz
// ---------------------------------------------------------------------------

describe('patchReferenzierendesGesetz', () => {
  it('kein rohBlock (erstmaliger Konflikt): neuer Eintrag wird aus den live geladenen Markierungen berechnet', () => {
    const eigen = gesetz('BGB', []);
    const e = verweisEintrag('1', [
      zielnorm({
        bezeichnung: '§ 1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    const result = patchReferenzierendesGesetz(
      undefined,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result).toEqual({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: undefined,
      eintraege: [
        {
          eigenerKonflikt: undefined,
          zielKonflikte: [
            {
              gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
              typ: 'zielGesetzFehlt',
              bezeichnungen: [{ bezeichnung: '§ 1' }],
            },
          ],
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'verweismarkierung',
          textstelle: undefined,
          kommentarText: undefined,
          verweistext: 'x',
        },
      ],
    });
  });

  it('ein bestehender Konflikt, der jetzt vollständig gelöst ist -> undefined (Block wird entfernt)', () => {
    const zielG = gesetz('StGB', [norm('1', '§ 1', { titel: 'X', textLaenge: 5 })]);
    const eigen = gesetz('BGB', []);
    const e = verweisEintrag('1', [
      zielnorm({
        bezeichnung: '§ 1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { titel: 'X', textlaenge: 5 },
      }),
    ]);
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          zielKonflikte: [
            { typ: 'zielGesetzFehlt', gesetz: gesetzesreferenz({ kurztitel: 'StGB' }) },
          ],
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'verweismarkierung',
          verweistext: 'x',
        },
      ],
    });
    const result = patchReferenzierendesGesetz(
      altBlock,
      [e],
      eigen,
      [zielG],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result).toBeUndefined();
  });

  it('Edge-Case: Zielkonflikte zu NICHT-betroffenen Gesetzen bleiben aus dem alten Block unverändert erhalten (werden nicht neu berechnet)', () => {
    const eigen = gesetz('BGB', []);
    const e = verweisEintrag('1', [
      zielnorm({
        bezeichnung: '§ 1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
      zielnorm({
        bezeichnung: '§ 2',
        gesetz: gesetzesreferenz({ kurztitel: 'HGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          zielKonflikte: [
            { typ: 'zielGesetzFehlt', gesetz: gesetzesreferenz({ kurztitel: 'StGB' }) },
            { typ: 'zielGesetzFehlt', gesetz: gesetzesreferenz({ kurztitel: 'HGB' }) },
          ],
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'verweismarkierung',
          verweistext: 'x',
        },
      ],
    });
    // Nur StGB als betroffen markiert; HGB fehlt zwar auch in alleGesetze,
    // wird aber NICHT neu geprüft -> bleibt 1:1 aus dem alten Block (ohne
    // "bezeichnungen", da parseKonfliktEintraege dieses Zusatzfeld nicht
    // liefert) statt frisch aus berechneZielKonflikte (mit "bezeichnungen").
    const result = patchReferenzierendesGesetz(
      altBlock,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result?.eintraege[0]!.zielKonflikte).toEqual([
      { typ: 'zielGesetzFehlt', gesetz: gesetzesreferenz({ kurztitel: 'HGB' }) },
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielGesetzFehlt',
        bezeichnungen: [{ bezeichnung: '§ 1' }],
      },
    ]);
  });

  it('Edge-Case: nichtamtlicheTitelXmlFehlt wird IMMER 1:1 aus dem alten Block übernommen, nie neu berechnet (patchReferenzierendesGesetz kennt nichtamtlicheTitelVorhanden gar nicht)', () => {
    const eigen = gesetz('BGB', []);
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: true,
      eintraege: [],
    });
    const result = patchReferenzierendesGesetz(
      altBlock,
      [],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result).toEqual({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: true,
      eintraege: [],
    });
  });

  it('Edge-Case: weder alter Block noch neue Konflikte -> undefined (kein leerer Block wird erzeugt)', () => {
    const eigen = gesetz('BGB', []);
    const e = verweisEintrag('1', []);
    const result = patchReferenzierendesGesetz(
      undefined,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result).toBeUndefined();
  });

  it('Edge-Case: Kommentar-Eintrag (kein textstelle, kann keinen Zielkonflikt haben) mit bestehendem eigenerKonflikt bleibt erhalten, kommentarText wird aus dem LIVE-Eintrag nachgezogen', () => {
    const eigen = gesetz('BGB', []);
    const e = kommentarEintrag('1', 'aktueller Text');
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'kommentar',
          kommentarText: 'aktueller Text',
        },
      ],
    });
    const result = patchReferenzierendesGesetz(
      altBlock,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result?.eintraege).toEqual([
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
        ausgangsstelle: normAusgangsstelle('§ 1'),
        markierungstyp: 'kommentar',
        textstelle: undefined,
        kommentarText: 'aktueller Text',
        verweistext: undefined,
      },
    ]);
  });

  it('Edge-Case: Verweis-Eintrag OHNE Zielnorm (kein textstelle) mit bestehendem eigenerKonflikt bleibt erhalten, verweistext wird aus dem LIVE-Eintrag nachgezogen', () => {
    const eigen = gesetz('BGB', []);
    const e = verweisEintrag('1', [], 'siehe irgendwo');
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'verweismarkierung',
          verweistext: 'siehe irgendwo',
        },
      ],
    });
    const result = patchReferenzierendesGesetz(
      altBlock,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result?.eintraege).toEqual([
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
        ausgangsstelle: normAusgangsstelle('§ 1'),
        markierungstyp: 'verweismarkierung',
        textstelle: undefined,
        kommentarText: undefined,
        verweistext: 'siehe irgendwo',
      },
    ]);
  });

  it('Edge-Case: Underline-Eintrag MIT Zeichenbereich -> textstelle im Ergebnis gesetzt, kommentarText/verweistext bleiben undefined (Regressionsschutz für die Delegation an bestimmeIdentifizierendeFelder)', () => {
    const eigen = gesetz('BGB', []);
    const e: MarkierungsEintrag = markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: 'x',
      },
    });
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [
            { typ: 'zielGesetzFehlt', gesetz: gesetzesreferenz({ kurztitel: 'StGB' }) },
          ],
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'unterstreichung',
          textstelle: e.bezug.textstelle,
        },
      ],
    });
    const result = patchReferenzierendesGesetz(
      altBlock,
      [e],
      eigen,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' }))]),
    );
    expect(result?.eintraege).toEqual([
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
        ausgangsstelle: normAusgangsstelle('§ 1'),
        markierungstyp: 'unterstreichung',
        textstelle: e.bezug.textstelle,
        kommentarText: undefined,
        verweistext: undefined,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// patchEigenenEintrag
// ---------------------------------------------------------------------------

describe('patchEigenenEintrag', () => {
  it('der geänderte Eintrag wird frisch über pruefeMarkierung neu bewertet (hier: jetzt gelöst -> undefined)', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433')]);
    const e: MarkierungsEintrag = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 433'),
    }); // kein Konflikt
    const schluessel = identitaetsSchluessel(e);
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'unterstreichung',
        },
      ],
    });
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      schluessel,
      [e],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result).toBeUndefined();
  });

  it('andere (nicht geänderte) Einträge werden 1:1 aus dem alten Block übernommen, NICHT neu geprüft', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433'), norm('1', '§ 1')]);
    const geaendert: MarkierungsEintrag = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
    });
    const unveraendert: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 433'),
      kommentarText: 'x',
    });
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'kommentar',
          kommentarText: 'x',
        },
      ],
    });
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      identitaetsSchluessel(geaendert),
      [geaendert, unveraendert],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result?.eintraege).toEqual([
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
        ausgangsstelle: normAusgangsstelle('§ 433'),
        markierungstyp: 'kommentar',
        textstelle: undefined,
        kommentarText: 'x',
        verweistext: undefined,
      },
    ]);
  });

  it('Edge-Case: ein gelöschter Eintrag (fehlt in alleLiveEintraege) wird ersatzlos verworfen, kein Absturz', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433')]);
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'unterstreichung',
        },
      ],
    });
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 433|unterstreichung|z:0-1|[null,null,0,null,1,[],1]',
      [],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result).toBeUndefined();
  });

  it('Edge-Case: nichtamtlicheTitelXmlFehlt kommt IMMER vom Parameter, nicht aus dem alten Block (anders als bei patchReferenzierendesGesetz)', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433')]);
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [],
    });
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'nichts-passt',
      [],
      eigen,
      [],
      new Set(),
      true,
    );
    expect(result).toEqual({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: true,
      eintraege: [],
    });
  });

  it('Edge-Case: nichtamtlicheTitelXmlFehlt=false -> Feld im Ergebnis undefined, nicht false', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433')]);
    const live = kommentarEintrag('433', 'x');
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'kommentar',
          kommentarText: 'x',
        },
      ],
    });
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'nichts-passt',
      [live],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result).toEqual({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: undefined,
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'kommentar',
          textstelle: undefined,
          kommentarText: 'x',
          verweistext: undefined,
        },
      ],
    });
  });

  it('Edge-Case: rohBlock undefined (erstmaliger Konflikt für dieses Gesetz) -> geänderter Eintrag wird trotzdem frisch geprüft', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433', { titel: 'X', textLaenge: 3 })]);
    const e: MarkierungsEintrag = markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 10 },
        bezugstext: 'x',
      },
      // außerhalb der Normlänge -> Konflikt
    });
    const schluessel = identitaetsSchluessel(e);
    const result = patchEigenenEintrag(
      undefined,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      schluessel,
      [e],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result?.eintraege).toHaveLength(1);
  });

  it('Edge-Case: unveränderter LIVE-Eintrag ohne passenden alt-Eintrag im alten Block (hatte bisher keinen Konflikt) wird übersprungen, nicht neu hinzugefügt', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433'), norm('1', '§ 1')]);
    const mitAlt: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 433'),
    });
    const ohneAlt: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
    });
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'kommentar',
        },
      ],
    });
    // geaenderterSchluessel zeigt auf keinen der beiden Live-Einträge -> beide
    // laufen den "unverändert"-Pfad, aber nur mitAlt hat einen Treffer im Block.
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'nichts-passt',
      [mitAlt, ohneAlt],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result?.eintraege).toHaveLength(1);
    expect(result && bezeichnungAusgangsstelle(result.eintraege[0]!.ausgangsstelle)).toBe('§ 433');
  });

  it('Edge-Case: unveränderter Kommentar-Eintrag (kein textstelle) -> kommentarText wird aus dem LIVE-Eintrag nachgezogen, nicht aus dem alt-Eintrag', () => {
    const eigen = gesetz('BGB', [norm('433', '§ 433')]);
    const live = kommentarEintrag('433', 'live-Text');
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'kommentar',
          kommentarText: 'live-Text',
        },
      ],
    });
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'nichts-passt',
      [live],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result?.eintraege).toEqual([
      {
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
        ausgangsstelle: normAusgangsstelle('§ 433'),
        markierungstyp: 'kommentar',
        textstelle: undefined,
        kommentarText: 'live-Text',
        verweistext: undefined,
      },
    ]);
  });

  it('Reihenfolge folgt alleLiveEintraege (kanonisch sortiert), nicht der Reihenfolge im alten Block', () => {
    const eigen = gesetz('BGB', [norm('1', '§ 1'), norm('2', '§ 2')]);
    const e1: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
    });
    const e2: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 2'),
    });
    const altBlock = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 2'),
          markierungstyp: 'kommentar',
        },
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'kommentar',
        },
      ],
    });
    // alleLiveEintraege in der Reihenfolge [e1, e2] (nicht die des Blocks) –
    // geaenderterSchluessel zeigt auf einen dritten, nicht vorhandenen Eintrag,
    // damit BEIDE unverändert aus dem Block übernommen werden.
    const result = patchEigenenEintrag(
      altBlock,
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'nichts-passt',
      [e1, e2],
      eigen,
      [],
      new Set(),
      false,
    );
    expect(result?.eintraege.map((k) => bezeichnungAusgangsstelle(k.ausgangsstelle))).toEqual([
      '§ 1',
      '§ 2',
    ]);
  });
});

describe('Phase D: kombinierte Konflikte und tolerante Bereichsattribute', () => {
  it.each(['zielGesetzFehlt', 'zielNormUnpassend', 'zielNormFehlt'] as const)(
    'erhält eigenen Konflikt und Zielkonflikt %s getrennt',
    (typ) => {
      const live: MarkierungsEintrag = markierungsEintrag({
        typ: 'verweismarkierung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({
              eintraege: [{ ebene: 'nummer', bezeichnung: '§ 1', wiederholung: 2 }],
            }),
            zeichenbereichStart: 12,
            zeichenbereichEnde: 34,
          },
          bezugstext: 'Verweis',
        },
      });
      const xml = baueGesetzBlock({
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        eintraege: [
          {
            ausgangsstelle: live.ausgangsstelle,
            markierungstyp: live.typ,
            textstelle: live.bezug.textstelle,
            eigenerKonflikt: 'bezugstextFehltOderUnpassend',
            zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'GG & Co' }), typ }],
          },
        ],
      });
      expect(() =>
        pruefeXmlWohlgeformtheit(`<markierungskonflikte version="1">${xml}</markierungskonflikte>`),
      ).not.toThrow();
      expect(xml).toContain('<gesetz kurztitel="BGB" normgeber="de-bund">');
      expect(xml).toContain('<konflikt typ="bezugstext-fehlt-oder-unpassend"/>');
      expect(xml).toContain(
        `typ="${typ.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}" gesetz="GG &amp; Co" normgeber="de-bund"`,
      );
      for (const zeichenbereich of [
        '<zeichenbereich ende="34" start="12"/>',
        '<zeichenbereich\n ende = "34"  start = "12" />',
        '<zeichenbereich  start = "12"\n ende = "34"  />',
      ]) {
        expect(
          parseKonfliktEintraege(
            xml.replace('<zeichenbereich start="12" ende="34"/>', zeichenbereich),
          ),
        ).toEqual([
          {
            ausgangsstelle: live.ausgangsstelle,

            markierungstyp: live.typ,
            bereich: live.bezug.textstelle?.pfad.bereich,
            eigenerKonflikt: 'bezugstextFehltOderUnpassend',
            zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'GG & Co' }), typ }],
            schluessel: identitaetsSchluessel(live),
          },
        ]);
      }
    },
  );
});

it('schreibt alle sechs Wortcodes als wohlgeformtes XML', () => {
  const bloecke = [
    baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB & Co' }),
      fehlendesGesetz: true,
      eintraege: [],
    }),
    baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      nichtamtlicheTitelXmlFehlt: true,
      eintraege: [],
    }),
    baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
      eintraege: [
        {
          ausgangsstelle: normAusgangsstelle('§ 1'),
          markierungstyp: 'kommentar',
          kommentarText: '&<>"',
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [
            { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), typ: 'zielGesetzFehlt' },
            { gesetz: gesetzesreferenz({ kurztitel: 'GG' }), typ: 'zielNormUnpassend' },
            { gesetz: gesetzesreferenz({ kurztitel: 'HGB' }), typ: 'zielNormFehlt' },
          ],
        },
      ],
    }),
  ].join('\n');
  expect(() =>
    pruefeXmlWohlgeformtheit(`<markierungskonflikte version="1">${bloecke}</markierungskonflikte>`),
  ).not.toThrow();
  for (const wort of [
    'gesetzFehlt',
    'nichtamtlicheTitelXmlFehlt',
    'bezugstextFehltOderUnpassend',
    'zielGesetzFehlt',
    'zielNormUnpassend',
    'zielNormFehlt',
  ]) {
    expect(bloecke).toContain(`typ="${wort.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}"`);
  }
});

it('Konflikt-XML erhält Präfix und denselben Schlüssel wie Live-Markierungen', () => {
  for (const praefix of [undefined, ['§'], ['Art.', '§'], ['A&<>"']]) {
    const live: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle(
        [(praefix ?? ['§']).at(-1), '1'].filter(Boolean).join(' '),
      ),

      kommentarText: 'x',
    });
    const xml = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'Test' }),
      eintraege: [
        {
          ausgangsstelle: live.ausgangsstelle,

          markierungstyp: live.typ,
          kommentarText: 'x',
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
        },
      ],
    });
    expect(parseKonfliktEintraege(xml)[0]?.schluessel).toBe(identitaetsSchluessel(live));
    expect(xml).not.toContain('praefix=');
  }
});

// Einzelblock-Fixtures stehen in der Datei direkt unter einem Gesetz.
function parseKonfliktEintraege(fragment: string) {
  const doc = new DOMParser().parseFromString(
    fragment.trimStart().startsWith('<gesetz')
      ? fragment
      : `<gesetz normgeber="de-bund">${fragment}</gesetz>`,
    'application/xml',
  );
  for (const block of Array.from(doc.documentElement.children)) {
    const zeichenbereich = block.querySelector(':scope > zeichenbereich');
    if (zeichenbereich) {
      const textstelle = doc.createElement('textstelle');
      block.appendChild(textstelle);
      textstelle.appendChild(zeichenbereich);
    }
  }
  return parseDateiKonflikte(new XMLSerializer().serializeToString(doc));
}

function parseNichtamtlicheTitelXmlFehlt(fragment: string) {
  return parseDateiTitelFehlt(
    fragment.trimStart().startsWith('<gesetz')
      ? fragment
      : `<gesetz normgeber="de-bund">${fragment}</gesetz>`,
  );
}

it('DOM-Konfliktleser ignoriert Zusatzkinder, Attribute und Kommentare', () => {
  const xml = `<gesetz extra='x' kurztitel='BGB' normgeber="de-bund"><neu><konflikt typ="nichtamtliche-titel-xml-fehlt"/><markierung/></neu>
    <!-- <konflikt typ="nichtamtliche-titel-xml-fehlt"/><markierung/> -->
    <kommentar extra='x'><neu><bezeichnung>§ 9</bezeichnung><konflikt typ="bezugstext-fehlt-oder-unpassend"/></neu>
      <konflikt typ="ziel-norm-fehlt" extra='x' gesetz='A &amp; B' normgeber='de-bund'/><bezeichnung extra='x'>§ 1</bezeichnung><kommentartext>x</kommentartext>
    </kommentar></gesetz>`;
  expect(parseDateiTitelFehlt(xml)).toBe(false);
  expect(parseDateiKonflikte(xml)).toEqual([
    {
      ausgangsstelle: normAusgangsstelle('§ 1'),

      markierungstyp: 'kommentar',
      bereich: undefined,
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'A & B' }), typ: 'zielNormFehlt' }],
      schluessel: 'norm:§ 1|kommentar|t:x',
    },
  ]);
});
it('DOM-Konfliktleser verwirft beschädigtes XML', () => {
  expect(() =>
    parseDateiKonflikte('<gesetz kurztitel="BGB" normgeber="de-bund"><kommentar></gesetz>'),
  ).toThrow('Datei ungültig');
});

it('liest Normgeber am Konfliktcontainer einschließlich Erweiterungen', () => {
  expect(
    gesetzesreferenzAusBlock(
      '<gesetz neu="ja" normgeber="de-bw" kurztitel="BGB"><!--neu--></gesetz>',
    ),
  ).toEqual({ kurztitel: 'BGB', normgeber: 'de-bw' });
  expect(() => gesetzesreferenzAusBlock('<gesetz normgeber="A_B" kurztitel="BGB"/>')).toThrow(
    'Normgeber',
  );
});

it('erhält vollständige Ausgangs- und Zielreferenzen bei Markierungskonflikten', () => {
  const ziel = { kurztitel: 'BGB', normgeber: 'de-bw' };
  const block = baueGesetzBlock({
    gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    eintraege: [
      {
        zielKonflikte: [{ typ: 'zielGesetzFehlt', gesetz: ziel }],
        ausgangsstelle: normAusgangsstelle('§ 1'),
        markierungstyp: 'verweismarkierung',
        verweistext: '§ 2 BGB',
      },
    ],
  });
  expect(gesetzesreferenzAusBlock(block)).toEqual({ kurztitel: 'BGB', normgeber: 'de-bund' });
  expect(parseDateiKonflikte(block)[0]?.zielKonflikte).toEqual([
    { typ: 'zielGesetzFehlt', gesetz: ziel },
  ]);
  expect(() => parseDateiKonflikte(block.replace('normgeber="de-bw"', 'normgeber="A_B"'))).toThrow(
    'Normgeber',
  );
});

it.each(['amtlicherTitel', 'nichtamtlicherTitel', 'bezeichnung'] as const)(
  'Markierungskonflikt schreibt Bereich %s und erhält die Identifikation',
  (bereich) => {
    const original: MarkierungsEintrag = markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: bereichPfad(bereich), zeichenbereichStart: 1, zeichenbereichEnde: 3 },
        bezugstext: 'ab',
      },
    });
    const konflikt: KonfliktEintrag = {
      ausgangsstelle: original.ausgangsstelle,
      markierungstyp: 'unterstreichung',
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      textstelle: original.bezug.textstelle,
    };
    const xml = baueGesetzBlock({
      gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
      eintraege: [konflikt],
    });
    expect(xml).toContain(
      `<bereich>${bereich === 'amtlicherTitel' ? 'amtlicher-titel' : bereich === 'nichtamtlicherTitel' ? 'nichtamtlicher-titel' : 'bezeichnung'}</bereich>`,
    );
    expect(parseDateiKonflikte(xml)[0]).toMatchObject({
      schluessel: identitaetsSchluessel(original),
      ausgangsstelle: original.ausgangsstelle,
      markierungstyp: original.typ,
      bereich,
    });
  },
);

describe('getrennte Konfliktkennung', () => {
  it('erhält Überschrift und gleichnamige Norm getrennt im Roundtrip', () => {
    const u: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: ueberschriftAusgangsstelle('010'),

      kommentarText: 'Text',
    });
    const n: MarkierungsEintrag = markierungsEintrag({
      ...u,
      ausgangsstelle: normAusgangsstelle(bezeichnungAusgangsstelle(u.ausgangsstelle)),
    });
    const xml = baueGesetzBlock({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintraege: [u, n].map((e) => ({
        ausgangsstelle:
          e.ausgangsstelle.typ === 'ueberschrift'
            ? ueberschriftAusgangsstelle(bezeichnungAusgangsstelle(e.ausgangsstelle))
            : e.ausgangsstelle,

        markierungstyp: e.typ,
        kommentarText: e.kommentarText,
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
      })),
    });
    expect(xml).toContain('<gliederungskennzahl>010</gliederungskennzahl>');
    expect(parseDateiKonflikte(xml).map((e) => e.schluessel)).toEqual([
      identitaetsSchluessel(u),
      identitaetsSchluessel(n),
    ]);
  });
  it.each([
    '',
    '<bezeichnung>§ 1</bezeichnung><gliederungskennzahl>010</gliederungskennzahl>',
    '<gliederungskennzahl/>',
    '<gliederungskennzahl>01</gliederungskennzahl>',
    '<gliederungskennzahl>abc</gliederungskennzahl>',
    '<gliederungskennzahl>010</gliederungskennzahl><gliederungskennzahl>020</gliederungskennzahl>',
    '<bezeichnung>§ 1</bezeichnung><bezeichnung>§ 2</bezeichnung>',
    '<gliederungskennzahl praefix="§">010</gliederungskennzahl>',
  ])('überspringt ungültige Konfliktkennung %s', (kennung) => {
    const block = (k: string) =>
      `<kommentar>${k}<kommentartext>Text</kommentartext><konflikt typ="bezugstext-fehlt-oder-unpassend"/></kommentar>`;
    const xml = `<gesetz kurztitel="BGB" normgeber="de-bund">${block(kennung)}${block('<gliederungskennzahl>010</gliederungskennzahl>')}</gesetz>`;
    expect(parseDateiKonflikte(xml)).toHaveLength(1);
    expect(parseDateiKonflikte(xml)[0]).toMatchObject({
      ausgangsstelle: ueberschriftAusgangsstelle('010'),
    });
  });
});

it.each([
  'bezugstextFehltOderUnpassend',
  'pauschalerBezugFehlt',
  'pauschalerBezugUnpassend',
] as const)('transportiert %s unverändert durch Schreiber und Leser', (typ) => {
  const live: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'Hinweis',
  });
  const xml = baueGesetzBlock({
    gesetz: gesetzesreferenz({ kurztitel: 'Test' }),
    eintraege: [
      {
        eigenerKonflikt: typ,
        zielKonflikte: [],
        ausgangsstelle: normAusgangsstelle('§ 1'),
        markierungstyp: 'kommentar',
        kommentarText: 'Hinweis',
      },
    ],
  });
  expect(xml).toContain(
    `<konflikt typ="${typ.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}"/>`,
  );
  expect(parseKonfliktEintraege(xml)[0]?.eigenerKonflikt).toBe(typ);
  const schluessel = identitaetsSchluessel(live);
  expect(parseKonfliktEintraege(xml)[0]?.schluessel).toBe(schluessel);
});

it('schreibt und liest beide Zielkonflikttypen desselben Gesetzes in einem Konfliktblock', () => {
  const zielKonflikte: KonfliktEintrag['zielKonflikte'] = [
    { gesetz: { kurztitel: 'GG', normgeber: 'de-bund' }, typ: 'zielNormUnpassend' },
    { gesetz: { kurztitel: 'GG', normgeber: 'de-bund' }, typ: 'zielNormFehlt' },
  ];
  const xml = baueGesetzBlock({
    gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    eintraege: [
      {
        zielKonflikte,
        ausgangsstelle: normAusgangsstelle('§ 1'),
        markierungstyp: 'verweismarkierung',
        verweistext: 'Art. 10, 999 GG',
      },
    ],
  });
  expect(xml.match(/<verweismarkierung>/g)).toHaveLength(1);
  expect(xml.match(/<konflikt typ="ziel-norm-(?:unpassend|fehlt)" gesetz="GG"/g)).toHaveLength(2);
  expect(parseKonfliktEintraege(xml)[0]?.zielKonflikte).toEqual(zielKonflikte);
});

it('ersetzt beide Einträge eines aktualisierten Zielgesetzes gemeinsam und erhält andere Gesetze', () => {
  const eigen = gesetz('BGB', []);
  const gg = gesetz('GG', [norm('10', 'Art. 10')]);
  const e = verweisEintrag(
    '1',
    ['10', '999'].map((bezeichnung) =>
      zielnorm({
        bezeichnung: 'Art. ' + bezeichnung,

        gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
        elementstand: testElementstand(),
      }),
    ),
  );
  const altBlock = baueGesetzBlock({
    gesetz: eigen,
    eintraege: [
      {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        markierungstyp: 'verweismarkierung',
        verweistext: 'x',
        zielKonflikte: [
          { gesetz: gesetzesreferenz({ kurztitel: 'GG' }), typ: 'zielNormUnpassend' },
          { gesetz: gesetzesreferenz({ kurztitel: 'GG' }), typ: 'zielNormFehlt' },
          { gesetz: gesetzesreferenz({ kurztitel: 'HGB' }), typ: 'zielGesetzFehlt' },
        ],
      },
    ],
  });
  const ergebnis = patchReferenzierendesGesetz(
    altBlock,
    [e],
    eigen,
    [gg],
    new Set([gesetzesreferenzSchluessel(gg)]),
  );
  expect(ergebnis?.eintraege[0]?.zielKonflikte).toEqual([
    { gesetz: gesetzesreferenz({ kurztitel: 'HGB' }), typ: 'zielGesetzFehlt' },
    {
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      typ: 'zielNormFehlt',
      bezeichnungen: [{ bezeichnung: 'Art. 999', befund: 'fehlt' }],
    },
  ]);
});
