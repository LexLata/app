import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonfliktPruefung.test.ts
//
// Tests für markierungskonfliktPruefung.ts (kolokiert, Vitest). Reine
// Vergleichslogik ohne Dateizugriff (siehe Kopfkommentar der Quelldatei) –
// die Tests bauen daher GesetzDarstellung/NormDarstellung/MarkierungsEintrag
// von Hand auf, analog zu normStrukturPruefung.test.ts.
//
// Für die textstelle-Fälle (pruefeEigenenKonflikt mit zeichenbereichStart/-Ende) wird
// bewusst `Bereich bezeichnung`/`titel` statt eines Norminhalts-Textbezugs
// genutzt: aktuellerTextAnPfad löst diese beiden Felder direkt über
// element.bezeichnung/.titel.slice(...) auf (siehe dortiger Kommentar), ohne
// die volle Satz-/Eintrags-Traversierung von textAnTextpfad zu durchlaufen –
// die ist bereits in gesetzesXMLParser.eintragsKette.test.ts abgedeckt und
// soll hier nicht dupliziert werden.

// ---------------------------------------------------------------------------
// Test-Factories
// ---------------------------------------------------------------------------

// Konkreter gespeicherter Titelbezug; Grenzen entsprechen seinem Wortlaut.

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel, zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { assert, describe, expect, it } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { normTextLaenge } from '@/lib/domain/gesetzDarstellungAuswertung';
import { aktuellerTextAnPfad } from '@/lib/domain/textpfad/textpfad.index';
import { schuetzeLeerzeichen } from '@/lib/domain/basis/textNachbearbeitung';
import {
  loeseAusgangsstelleAuf,
  berechneZielKonflikte,
  bestimmeIdentifizierendeFelder,
  findeElementZuBezeichnung,
  identitaetsSchluessel,
  klassifiziereZielnorm,
  pruefeEigenenKonflikt,
  pruefeMarkierung,
  pruefeMarkierungenEinesGesetzes,
  pruefeNichtamtlicheTitelXmlFehlt,
} from './markierungskonfliktPruefung';
import type {
  GesetzDarstellung,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  erwaegungsgrundAusgangsstelle,
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const nichtamtlicherTitelBezug = {
  textstelle: {
    pfad: bereichPfad('nichtamtlicherTitel' as const),
    zeichenbereichStart: 0,
    zeichenbereichEnde: 'Kauf'.length,
  },
  bezugstext: 'Kauf',
};

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function norm(
  xmlId: string,
  bezeichnung: string,
  opts?: { titel?: string; titelIstNichtamtlich?: true; textLaenge?: number },
): NormDarstellung {
  const textLaenge = opts?.textLaenge ?? 0;
  return normaleNorm({
    id: naechsteId(),
    xmlId,
    bezeichnung,
    titel: opts?.titel,
    titelIstNichtamtlich: opts?.titelIstNichtamtlich,
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

function ueberschrift(gliederungskennzahl: string, bezeichnung: string): UeberschriftDarstellung {
  return { id: naechsteId(), xmlId: naechsteId(), bezeichnung, ebene: 1, gliederungskennzahl };
}

function gesetz(
  kurztitel: string,
  normen: NormDarstellung[],
  ueberschriften: UeberschriftDarstellung[] = [],
): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: [
      ...ueberschriften.map((u) => ({ typ: 'ueberschrift' as const, data: u })),
      ...normen.map((n) => ({ typ: 'norm' as const, data: n })),
    ],
  });
}

function eintrag(
  overrides: Parameters<typeof markierungsEintrag>[0] & Pick<MarkierungsEintrag, 'ausgangsstelle'>,
): MarkierungsEintrag {
  return markierungsEintrag({
    typ:
      overrides.bezug?.typ === 'bezugstext' || overrides.textstelle
        ? 'unterstreichung'
        : 'kommentar',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// findeElementZuBezeichnung (nur die Norm/Überschrift-Weiche, da
// findeNormZuBezeichnung selbst nicht exportiert ist)
// ---------------------------------------------------------------------------

describe('findeElementZuBezeichnung', () => {
  it('findet eine Norm über ihre Bezeichnung', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    expect(findeElementZuBezeichnung(g, normAusgangsstelle('§ 433'))?.bezeichnung).toBe('§ 433');
  });

  it('findet eine Überschrift über ihre gliederungskennzahl, wenn keine Norm passt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')], [ueberschrift('010000', 'Erster Teil')]);
    expect(findeElementZuBezeichnung(g, ueberschriftAusgangsstelle('010000'))?.bezeichnung).toBe(
      'Erster Teil',
    );
  });

  it('liefert undefined, wenn weder Norm noch Überschrift passen', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    expect(findeElementZuBezeichnung(g, normAusgangsstelle('§ 999'))).toBeUndefined();
  });

  it('Edge-Case: findet bei mehreren Normen GENAU die passende, nicht einfach die erste (mutant 29)', () => {
    const g = gesetz('BGB', [norm('433', '§ 433'), norm('434', '§ 434')]);
    expect(findeElementZuBezeichnung(g, normAusgangsstelle('§ 434'))?.bezeichnung).toBe('§ 434');
  });

  it('Edge-Case: eine über den Titel gefundene Überschrift wird NICHT als Norm zurückgegeben (mutant 32)', () => {
    // Ein Überschriftentitel kann die gesuchte Zahl enthalten
    // („Vertragstypen 100“). Eine Ausgangsstelle ohne Überschriftskennzeichnung
    // darf trotzdem nur auf eine Norm auflösen (sonst würde z.B.
    // normAmtlicherTitel/-TextLaenge später auf einem Objekt ohne `absaetze`
    // aufgerufen).
    const g = gesetz(
      'BGB',
      [norm('433', '§ 433')],
      [{ ...ueberschrift('010000', 'Erster Teil'), titel: 'Vertragstypen 100' }],
    );
    expect(findeElementZuBezeichnung(g, normAusgangsstelle('§ 100'))).toBeUndefined();
  });

  it('Edge-Case: eine Überschrift mit abweichender gliederungskennzahl wird nicht fälschlich gefunden (mutant 41/43/47)', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')], [ueberschrift('010000', 'Erster Teil')]);
    expect(findeElementZuBezeichnung(g, normAusgangsstelle('§ 999'))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// pruefeEigenenKonflikt (eigener Bezugskonflikt)
// ---------------------------------------------------------------------------

describe('pruefeEigenenKonflikt', () => {
  it('Konflikt, wenn die markierte Norm gar nicht mehr existiert', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const e = eintrag({ ausgangsstelle: normAusgangsstelle('§ 999') });
    expect(pruefeEigenenKonflikt(e, g)).toBe('pauschalerBezugFehlt');
  });

  it('kein Konflikt bei textstelle (Bereich bezeichnung), wenn der Text unverändert ist', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('bezeichnung'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 3,
        },
        bezugstext: '§ 4',
      },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBeUndefined();
  });

  it('Konflikt bei textstelle (Bereich bezeichnung), wenn sich der Text GENAU an der markierten Stelle geändert hat', () => {
    // Auflösung bleibt fuzzy (Suchschlüssel "433" matcht weiterhin, da
    // "§433 a".includes("433")), aber der markierte Zeichenbereich [0,5)
    // selbst hat sich verändert ("§ 433" -> "§433 "):
    const g = gesetz('BGB', [norm('433', '§433 a')]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('bezeichnung'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '§ 433',
      },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBe('bezugstextFehltOderUnpassend');
  });

  it('Konflikt bei textstelle (titel), wenn aktueller Titel an der Stelle abweicht', () => {
    const g = gesetz('BGB', [norm('433', '§ 433', { titel: 'Kaufvertrag' })]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('amtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 4,
        },
        bezugstext: 'Miet',
      },

      // war früher "Miet...", jetzt "Kauf..."
    });
    expect(pruefeEigenenKonflikt(e, g)).toBe('bezugstextFehltOderUnpassend');
  });

  it('Edge-Case: titel-Textbezug, Norm hat aktuell GAR KEINEN Titel mehr', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]); // kein titel
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('amtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 4,
        },
        bezugstext: 'Kauf',
      },
    });
    // (element.titel ?? '').slice(0,4) === '' !== 'Kauf' -> Konflikt
    expect(pruefeEigenenKonflikt(e, g)).toBe('bezugstextFehltOderUnpassend');
  });

  it('Edge-Case: textstelle zeigt auf Norminhalt, aufgelöstes Element ist inzwischen eine Überschrift', () => {
    // Weder Bereich bezeichnung noch titel gesetzt -> aktuellerTextAnPfad
    // verzweigt auf textAnTextpfad, das für Überschriften (keine `absaetze`)
    // undefined liefert -> muss als Konflikt gewertet werden.
    const g = gesetz('BGB', [], [ueberschrift('433', 'Erster Teil')]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: 'Kauf',
      },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBe('bezugstextFehltOderUnpassend');
  });

  it('ohne textstelle: kein Konflikt, wenn elementstand (Titel+Länge) noch passt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433', { titel: 'Kaufvertrag', textLaenge: 10 })]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Kaufvertrag', textlaenge: 10 } },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBeUndefined();
  });

  it('ohne textstelle: Konflikt, wenn sich die Textlänge der Ausgangsnorm geändert hat', () => {
    const g = gesetz('BGB', [norm('433', '§ 433', { titel: 'Kaufvertrag', textLaenge: 99 })]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Kaufvertrag', textlaenge: 10 } },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBe('pauschalerBezugUnpassend');
  });

  it('Edge-Case: elementstand mit amtlichem Titel, Norm ist jetzt Bereich nichtamtlicherTitel -> normAmtlicherTitel() liefert undefined -> Konflikt', () => {
    const g = gesetz('BGB', [
      norm('433', '§ 433', { titel: 'Kaufvertrag', titelIstNichtamtlich: true, textLaenge: 10 }),
    ]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Kaufvertrag', textlaenge: 10 } },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBe('pauschalerBezugUnpassend');
  });

  it('Edge-Case: elementstand gesetzt, aber aufgelöstes Element ist eine Überschrift (kein `absaetze`) -> Konflikt bei abweichender Überschrift', () => {
    const g = gesetz('BGB', [], [ueberschrift('433', 'Erster Teil')]);
    const e = eintrag({
      ausgangsstelle: ueberschriftAusgangsstelle('433'),
      bezug: { typ: 'pauschal' as const, elementstand: { titel: 'x', textlaenge: 1 } },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBe('pauschalerBezugUnpassend');
  });

  it('pauschaler Kommentar an leerer Norm: kein Konflikt bei passendem Elementstand', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const e = eintrag({ ausgangsstelle: normAusgangsstelle('§ 433') });
    expect(pruefeEigenenKonflikt(e, g)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// pruefeNichtamtlicheTitelXmlFehlt (nichtamtlicheTitelXmlFehlt)
// ---------------------------------------------------------------------------

describe('pruefeNichtamtlicheTitelXmlFehlt', () => {
  it('true, wenn eine Markierung sich auf nichtamtlichen Titel bezieht und die XML fehlt', () => {
    const eintraege = [
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 433'), ...nichtamtlicherTitelBezug }),
    ];
    expect(
      pruefeNichtamtlicheTitelXmlFehlt(
        eintraege,
        gesetzesreferenz({ kurztitel: 'BGB' }),
        new Set(),
      ),
    ).toBe(true);
  });

  it('false, wenn die nichtamtlicheTitel-XML für das Gesetz vorhanden ist', () => {
    const eintraege = [
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 433'), ...nichtamtlicherTitelBezug }),
    ];
    expect(
      pruefeNichtamtlicheTitelXmlFehlt(
        eintraege,
        gesetzesreferenz({ kurztitel: 'BGB' }),
        new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
      ),
    ).toBe(false);
  });

  it('false, wenn keine der Markierungen sich auf einen nichtamtlichen Titel bezieht', () => {
    const eintraege = [eintrag({ ausgangsstelle: normAusgangsstelle('§ 433') })];
    expect(
      pruefeNichtamtlicheTitelXmlFehlt(
        eintraege,
        gesetzesreferenz({ kurztitel: 'BGB' }),
        new Set(),
      ),
    ).toBe(false);
  });

  it('Edge-Case: leere eintraege-Liste -> false', () => {
    expect(
      pruefeNichtamtlicheTitelXmlFehlt([], gesetzesreferenz({ kurztitel: 'BGB' }), new Set()),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// berechneZielKonflikte (Zielkonflikte)
// ---------------------------------------------------------------------------

function zielnorm(overrides: Parameters<typeof zielnormTestdaten>[0]): Verweisziel {
  return zielnormTestdaten(overrides);
}

function verweisEintrag(verweisziele: Verweisziel[], verweistext = 'x'): MarkierungsEintrag {
  return eintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    ausgangsstelle: normAusgangsstelle('§ 1'),
    typ: 'verweismarkierung',
    verweisinhalt: { verweistext, verweisziele },
  });
}

describe('berechneZielKonflikte', () => {
  it('leer bei markierungstyp !== "verweismarkierung"', () => {
    const g = gesetz('BGB', []);
    expect(
      berechneZielKonflikte(
        eintrag({ ausgangsstelle: normAusgangsstelle('§ 1'), typ: 'unterstreichung' }),
        g,
        [],
      ),
    ).toEqual([]);
  });

  it('leer, wenn verweisinhalt fehlt', () => {
    const g = gesetz('BGB', []);
    expect(
      berechneZielKonflikte(
        eintrag({
          bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
          ausgangsstelle: normAusgangsstelle('§ 1'),
          typ: 'verweismarkierung',
        }),
        g,
        [],
      ),
    ).toEqual([]);
  });

  it('Edge-Case: Ziel ohne elementstand (ganzes Gesetz/"Trotzdem speichern") wird komplett übersprungen', () => {
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '',
        gesetz: gesetzesreferenz({ kurztitel: 'FehltGarnicht' }),
      }),
    ]);
    expect(berechneZielKonflikte(e, g, [])).toEqual([]);
  });

  it('Reine Zusatzinformation ohne Normbezug hat keine Zielkonflikte', () => {
    const g = gesetz('BGB', []);
    const e = verweisEintrag([]);
    expect(berechneZielKonflikte(e, g, [])).toEqual([]);
  });

  it('zielGesetzFehlt: Zielgesetz ist nicht mehr auf dem Gerät', () => {
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '§ 1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    const result = berechneZielKonflikte(e, g, []);
    expect(result).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielGesetzFehlt',
        bezeichnungen: [{ bezeichnung: '§ 1' }],
      },
    ]);
  });

  it('zielNormFehlt: Zielgesetz existiert, Zielnorm darin nicht mehr auffindbar', () => {
    const ziel = gesetz('StGB', [norm('222', '§ 222')]);
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '§ 999',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    const result = berechneZielKonflikte(e, g, [ziel]);
    expect(result).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielNormFehlt',
        bezeichnungen: [{ bezeichnung: '§ 999', befund: 'fehlt' }],
      },
    ]);
  });

  it('zielNormUnpassend: Zielgesetz und -norm existieren, Inhalt/Titel/Länge weichen ab', () => {
    const ziel = gesetz('StGB', [norm('222', '§ 222', { titel: 'Neu', textLaenge: 20 })]);
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '§ 222',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { titel: 'Alt', textlaenge: 20 },
      }),
    ]);
    const result = berechneZielKonflikte(e, g, [ziel]);
    expect(result).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielNormUnpassend',
        bezeichnungen: [{ bezeichnung: '§ 222', befund: 'unpassend' }],
      },
    ]);
  });

  it('kein Eintrag, wenn Zielnorm exakt (Titel+Länge) noch passt', () => {
    const ziel = gesetz('StGB', [norm('222', '§ 222', { titel: 'Alt', textLaenge: 20 })]);
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '§ 222',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { titel: 'Alt', textlaenge: 20 },
      }),
    ]);
    expect(berechneZielKonflikte(e, g, [ziel])).toEqual([]);
  });

  it('ohne `gesetz`-Feld wird das eigene Gesetz als Ziel angenommen', () => {
    const g = gesetz('BGB', [norm('222', '§ 222', { titel: 'Alt', textLaenge: 20 })]);
    const e = verweisEintrag([zielnorm({ bezeichnung: '§ 999', elementstand: { textlaenge: 5 } })]);
    const result = berechneZielKonflikte(e, g, [g]);
    expect(result).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        typ: 'zielNormFehlt',
        bezeichnungen: [{ bezeichnung: '§ 999', befund: 'fehlt' }],
      },
    ]);
  });

  it('trennt veränderte, nicht eindeutige und fehlende Zielnormen desselben Gesetzes', () => {
    const g = gesetz('BGB', []);
    const ziel = gesetz('GG', [norm('10', 'Art. 10'), norm('5a', 'Art. 5'), norm('5b', 'Art. 5')]);
    const e = verweisEintrag(
      ['10', '999', '5'].map((bezeichnung) =>
        zielnorm({
          bezeichnung: 'Art. ' + bezeichnung,

          gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
          elementstand: { textlaenge: 5 },
        }),
      ),
    );
    expect(berechneZielKonflikte(e, g, [ziel])).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
        typ: 'zielNormUnpassend',
        bezeichnungen: [{ bezeichnung: 'Art. 10', befund: 'unpassend' }],
      },
      {
        gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
        typ: 'zielNormFehlt',
        bezeichnungen: [
          { bezeichnung: 'Art. 999', befund: 'fehlt' },
          { bezeichnung: 'Art. 5', befund: 'nichtEindeutig' },
        ],
      },
    ]);
  });

  it('ordnet veränderte Ziele vor fehlenden ein, unabhängig von der Zielreihenfolge', () => {
    const ziel = gesetz('StGB', [norm('222', '§ 222')]);
    const g = gesetz('BGB', []);
    const ziele = ['999', '222'].map((bezeichnung) =>
      zielnorm({
        bezeichnung,
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
    );
    const ergebnis = berechneZielKonflikte(verweisEintrag(ziele), g, [ziel]);
    expect(ergebnis.map((k) => k.typ)).toEqual(['zielNormUnpassend', 'zielNormFehlt']);
    expect(berechneZielKonflikte(verweisEintrag([...ziele].reverse()), g, [ziel])).toEqual(
      ergebnis,
    );
  });

  it('Edge-Case: bei bereits erkanntem zielGesetzFehlt (Gesetz fehlt) werden weitere Ziele desselben Gesetzes nur noch als Bezeichnung mitgeführt, nicht mehr strukturell geprüft', () => {
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '§ 1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
      zielnorm({
        bezeichnung: '§ 2',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    // alleGesetze enthält StGB NICHT -> für BEIDE Ziele bleibt es bei zielGesetzFehlt
    const result = berechneZielKonflikte(e, g, []);
    expect(result).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielGesetzFehlt',
        bezeichnungen: [{ bezeichnung: '§ 1' }, { bezeichnung: '§ 2' }],
      },
    ]);
  });

  it('Edge-Case: von zwei Zitaten auf dasselbe Zielgesetz passt eines noch -> nur das andere landet in bezeichnungen', () => {
    const ziel = gesetz('StGB', [
      norm('222', '§ 222', { titel: 'Alt', textLaenge: 20 }),
      norm('223', '§ 223', { titel: 'Neu', textLaenge: 20 }),
    ]);
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      // passt exakt -> darf NICHT in bezeichnungen landen
      zielnorm({
        bezeichnung: '§ 222',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { titel: 'Alt', textlaenge: 20 },
      }),
      // passt nicht mehr -> zielNormUnpassend
      zielnorm({
        bezeichnung: '§ 223',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { titel: 'Alt', textlaenge: 20 },
      }),
    ]);
    const result = berechneZielKonflikte(e, g, [ziel]);
    expect(result).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielNormUnpassend',
        bezeichnungen: [{ bezeichnung: '§ 223', befund: 'unpassend' }],
      },
    ]);
  });

  it('nurGesetze schränkt die Prüfung auf die genannten Zielgesetze ein', () => {
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '§ 1',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { textlaenge: 5 },
      }),
      zielnorm({
        bezeichnung: '§ 1',
        gesetz: gesetzesreferenz({ kurztitel: 'HGB' }),
        elementstand: { textlaenge: 5 },
      }),
    ]);
    const result = berechneZielKonflikte(
      e,
      g,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'HGB' }))]),
    );
    expect(result).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'HGB' }),
        typ: 'zielGesetzFehlt',
        bezeichnungen: [{ bezeichnung: '§ 1' }],
      },
    ]);
  });

  it('praefix wird 1:1 aus der Zielnorm übernommen', () => {
    const g = gesetz('BGB', []);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: 'Art. 229 § 3',
        gesetz: gesetzesreferenz({ kurztitel: 'EGBGB' }),

        elementstand: { textlaenge: 5 },
      }),
    ]);
    const result = berechneZielKonflikte(e, g, []);
    expect(result[0]!.bezeichnungen).toEqual([{ bezeichnung: 'Art. 229 § 3' }]);
  });
});

// ---------------------------------------------------------------------------
// pruefeMarkierung
// ---------------------------------------------------------------------------

describe('pruefeMarkierung', () => {
  it('liefert [] ohne eigenen Konflikt und ohne Zielkonflikte', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const e = eintrag({ ausgangsstelle: normAusgangsstelle('§ 433') }); // pauschaler Kommentar mit passendem Elementstand
    expect(pruefeMarkierung(e, g, [], new Set())).toEqual([]);
  });

  it('liefert einen Eintrag mit eigenerKonflikt=true, wenn die Norm fehlt', () => {
    const g = gesetz('BGB', []);
    const e = eintrag({ ausgangsstelle: normAusgangsstelle('§ 433'), typ: 'kommentar' });
    const result = pruefeMarkierung(e, g, [], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.eigenerKonflikt).toBe('pauschalerBezugFehlt');
    expect(result[0]!.zielKonflikte).toEqual([]);
    expect(bezeichnungAusgangsstelle(result[0]!.ausgangsstelle)).toBe('§ 433');
    expect(result[0]!.markierungstyp).toBe('kommentar');
  });

  it('setzt textstelle im Ergebnis, wenn ein Zeichenbereich vorliegt', () => {
    const g = gesetz('BGB', []);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('bezeichnung'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 1,
        },
        bezugstext: 'x',
      },
    });
    const result = pruefeMarkierung(e, g, [], new Set());
    expect(result[0]!.textstelle).toBe(e.bezug.textstelle);
    expect(result[0]!.kommentarText).toBeUndefined();
    expect(result[0]!.verweistext).toBeUndefined();
  });

  it('setzt kommentarText im Ergebnis für Kommentare ohne Textbezug', () => {
    const g = gesetz('BGB', []);
    const e = eintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      ausgangsstelle: normAusgangsstelle('§ 433'),
      typ: 'kommentar',
      kommentarText: 'Anmerkung',
    });
    const result = pruefeMarkierung(e, g, [], new Set());
    expect(result[0]!.textstelle).toBeUndefined();
    expect(result[0]!.kommentarText).toBe('Anmerkung');
  });

  it('setzt verweistext im Ergebnis für Verweise ohne Textbezug', () => {
    const g = gesetz('BGB', []);
    const e = verweisEintrag(
      [zielnorm({ bezeichnung: '§ 1', elementstand: { textlaenge: 5 } })],
      'siehe § 1',
    );
    const result = pruefeMarkierung(e, g, [], new Set());
    expect(result[0]!.verweistext).toBe('siehe § 1');
    expect(result[0]!.kommentarText).toBeUndefined();
  });

  it('Edge-Case: nichtamtlicheTitelXmlFehlt-Fall (nichtamtlicher Titel fehlt) unterdrückt den generischen eigenerKonflikt, meldet aber weiterhin Zielkonflikte', () => {
    // Norm existiert (kein eigener Bezugskonflikt-Fall über fehlendes Element), aber die
    // Markierung bezieht sich auf einen nichtamtlichen Titel, der fehlt ->
    // eigenerKonflikt muss unterdrückt werden (nichtamtlicheTitelXmlFehlt wird pro Gesetz
    // separat geführt, siehe pruefeMarkierungenEinesGesetzes).
    const g = gesetz('BGB', [norm('433', '§ 433', { titel: 'Kauf' })]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('nichtamtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 4,
        },
        bezugstext: 'Miet',
      },

      // würde ohne Unterdrückung als eigener Bezugskonflikt-Konflikt zählen
    });
    expect(pruefeMarkierung(e, g, [], new Set())).toEqual([]);
  });

  it('Edge-Case: NUR Zielkonflikt (Zielkonflikte), kein eigener Konflikt -> trotzdem ein Eintrag mit eigenerKonflikt=undefined', () => {
    // Eigene Norm des Verweises ist unverändert (kein eigener Bezugskonflikt-Konflikt), aber
    // die Zielnorm in einem anderen Gesetz hat sich geändert
    // (zielNormUnpassend). Laut Datei-Kopfkommentar muss auch dieser Fall einen Eintrag
    // erzeugen (siehe Mutation-Testing-Analyse im Chatverlauf, mutant 208/
    // 213: ohne diesen Test würde ein Bug, der genau diesen Fall
    // fälschlich unterschlägt oder eigenerKonflikt fälschlich auf true
    // setzt, unbemerkt bleiben).
    const zielgesetz = gesetz('StGB', [norm('222', '§ 222', { titel: 'Neu', textLaenge: 20 })]);
    // Eigene Norm '1' existiert im eigenen Gesetz (BGB) unverändert; ohne
    // Textbezug/elementstand meldet pruefeEigenenKonflikt dafür korrekt
    // false (siehe 'weder textstelle noch elementstand (Altbestand)').
    const g = gesetz('BGB', [norm('1', '§ 1')]);
    const e = verweisEintrag([
      zielnorm({
        bezeichnung: '§ 222',
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        elementstand: { titel: 'Alt', textlaenge: 20 },
      }),
    ]);
    const result = pruefeMarkierung(e, g, [zielgesetz], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]!.eigenerKonflikt).toBeUndefined();
    expect(result[0]!.zielKonflikte).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielNormUnpassend',
        bezeichnungen: [{ bezeichnung: '§ 222', befund: 'unpassend' }],
      },
    ]);
  });

  it('Edge-Case: nichtamtlicheTitelXmlFehlt-Unterdrückung gilt nur, wenn die nichtamtlicheTitel-XML wirklich fehlt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433', { titel: 'Kauf' })]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('nichtamtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 4,
        },
        bezugstext: 'Miet',
      },
    });
    // nichtamtlicheTitelVorhanden enthält BGB -> nichtamtlicheTitelXmlFehlt liegt NICHT vor ->
    // generische Prüfung greift wieder normal -> Konflikt wird gemeldet.
    const result = pruefeMarkierung(
      e,
      g,
      [],
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.eigenerKonflikt).toBe('bezugstextFehltOderUnpassend');
  });
});

// ---------------------------------------------------------------------------
// pruefeMarkierungenEinesGesetzes
// ---------------------------------------------------------------------------

describe('pruefeMarkierungenEinesGesetzes', () => {
  it('gesetzFehlt: eigenesGesetz undefined -> fehlendesGesetz=true, keine Einzelprüfung', () => {
    const result = pruefeMarkierungenEinesGesetzes(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      undefined,
      [eintrag({ ausgangsstelle: normAusgangsstelle('§ 433') })],
      [],
      new Set(),
    );
    expect(result).toEqual({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      fehlendesGesetz: true,
      eintraege: [],
    });
  });

  it('sammelt Konflikte über mehrere Markierungen hinweg', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const eintraege = [
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 433') }), // kein Konflikt
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 999') }), // Norm fehlt -> Konflikt
    ];
    const result = pruefeMarkierungenEinesGesetzes(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      g,
      eintraege,
      [],
      new Set(),
    );
    expect(result.fehlendesGesetz).toBeUndefined();
    expect(result.eintraege).toHaveLength(1);
    expect(bezeichnungAusgangsstelle(result.eintraege[0]!.ausgangsstelle)).toBe('§ 999');
  });

  it('setzt nichtamtlicheTitelXmlFehlt, wenn nichtamtlicheTitelXmlFehlt für das Gesetz zutrifft', () => {
    const g = gesetz('BGB', [norm('433', '§ 433', { titel: 'Kauf' })]);
    const eintraege = [
      eintrag({ ausgangsstelle: normAusgangsstelle('§ 433'), ...nichtamtlicherTitelBezug }),
    ];
    const result = pruefeMarkierungenEinesGesetzes(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      g,
      eintraege,
      [],
      new Set(),
    );
    expect(result.nichtamtlicheTitelXmlFehlt).toBe(true);
  });

  it('Edge-Case: leere eintraege-Liste -> keine Konflikte, kein nichtamtlicheTitelXmlFehlt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const result = pruefeMarkierungenEinesGesetzes(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      g,
      [],
      [],
      new Set(),
    );
    expect(result).toEqual({
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      nichtamtlicheTitelXmlFehlt: undefined,
      eintraege: [],
    });
  });
});

// ---------------------------------------------------------------------------
// identitaetsSchluessel
// ---------------------------------------------------------------------------

describe('identitaetsSchluessel', () => {
  it('nutzt den Zeichenbereich bei vorhandener textstelle', () => {
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 3, zeichenbereichEnde: 7 },
        bezugstext: '',
      },
    });
    expect(identitaetsSchluessel(e)).toBe(
      'norm:§ 433|unterstreichung|z:3-7|[null,null,0,null,1,[],1]',
    );
  });

  it('nutzt kommentarText ohne textstelle bei typ "kommentar"', () => {
    const e = eintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      ausgangsstelle: normAusgangsstelle('§ 433'),
      typ: 'kommentar',
      kommentarText: 'Hallo',
    });
    expect(identitaetsSchluessel(e)).toBe('norm:§ 433|kommentar|t:Hallo');
  });

  it('nutzt verweistext ohne textstelle bei typ "verweismarkierung"', () => {
    const e = eintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      ausgangsstelle: normAusgangsstelle('§ 433'),
      typ: 'verweismarkierung',
      verweisinhalt: { verweistext: 'siehe § 1', verweisziele: [] },
    });
    expect(identitaetsSchluessel(e)).toBe('norm:§ 433|verweismarkierung|v:siehe § 1');
  });

  it('Edge-Case: unterschiedliche Zeichenbereiche derselben Norm ergeben unterschiedliche Schlüssel', () => {
    const a = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    });
    const b = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 5, zeichenbereichEnde: 10 },
        bezugstext: '',
      },
    });
    expect(identitaetsSchluessel(a)).not.toBe(identitaetsSchluessel(b));
  });
});

describe('bestimmeIdentifizierendeFelder', () => {
  it('unterstreichung (immer mit Zeichenbereich): textstelle gesetzt, kommentarText/verweistext undefined', () => {
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    });
    expect(bestimmeIdentifizierendeFelder(e)).toEqual({
      textstelle: e.bezug.textstelle,
      kommentarText: undefined,
      verweistext: undefined,
    });
  });

  it('kommentar OHNE Textbezug: kommentarText gesetzt, textstelle undefined', () => {
    const e = eintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      ausgangsstelle: normAusgangsstelle('§ 433'),
      typ: 'kommentar',
      kommentarText: 'Anmerkung',
    });
    expect(bestimmeIdentifizierendeFelder(e)).toEqual({
      textstelle: undefined,
      kommentarText: 'Anmerkung',
      verweistext: undefined,
    });
  });

  it('kommentar MIT Textbezug (zeichenbereichStart/zeichenbereichEnde gesetzt): textstelle gesetzt statt kommentarText', () => {
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      typ: 'kommentar',
      kommentarText: 'Anmerkung',
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 5, zeichenbereichEnde: 10 },
        bezugstext: '',
      },
    });
    expect(bestimmeIdentifizierendeFelder(e)).toEqual({
      textstelle: e.bezug.textstelle,
      kommentarText: undefined,
      verweistext: undefined,
    });
  });

  it('verweis OHNE Textbezug: verweistext gesetzt, textstelle undefined', () => {
    const e = verweisEintrag([zielnorm({ bezeichnung: '§ 1' })], 'siehe § 1');
    expect(bestimmeIdentifizierendeFelder(e)).toEqual({
      textstelle: undefined,
      kommentarText: undefined,
      verweistext: 'siehe § 1',
    });
  });

  it('Verweis mit ausdrücklich leerem Verweistext bleibt identifizierbar', () => {
    const e = eintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      ausgangsstelle: normAusgangsstelle('§ 433'),
      typ: 'verweismarkierung',
    });
    expect(bestimmeIdentifizierendeFelder(e)).toEqual({
      textstelle: undefined,
      kommentarText: undefined,
      verweistext: '',
    });
  });

  it('verweis MIT Textbezug (zeichenbereichStart/zeichenbereichEnde gesetzt): textstelle gesetzt statt verweistext', () => {
    const basis = verweisEintrag([zielnorm({ bezeichnung: '§ 1' })], 'siehe § 1');
    const e = markierungsEintrag({
      ...basis,
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
        bezugstext: '',
      },
    });
    expect(bestimmeIdentifizierendeFelder(e)).toEqual({
      textstelle: e.bezug.textstelle,
      kommentarText: undefined,
      verweistext: undefined,
    });
  });
});

describe('Markierungskonflikte – Einrückung des GesetzesXML', () => {
  it('erhält Markierungen an Haupttext, Fortsetzung und Unterliste sowie die Normidentität', () => {
    function parseVariante(eingerueckt: boolean): GesetzDarstellung {
      const leerraum = eingerueckt ? '\r\n    \t' : ' ';
      const rand = eingerueckt ? '\n  ' : '';
      const text = (wert: string) => rand + wert.replaceAll(' ', leerraum) + rand;
      const xml = `<gesetz id="version"><infos><normgeber>de-bund</normgeber><langtitel>Versionstest</langtitel><kurztitel>VG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><titel>Anwendung</titel><text><absatz zahl="(1)"><satz zahl="1">${text('Siehe § 5:')}<nummer zahl="1.">${text('Gemäß Nr. 2:')}<litera buchstabe="a)">${text('Am 1. Januar\u00a0gilt es.')}<zeilenumbruch/>${text('Weiterer Text.')}</litera>${text('bleibt Art. 3.')}</nummer>${text('endet Satz 4.')}</satz></absatz></text></norm></inhalt></gesetz>`;
      const g = parseGesetzesXML(xml);
      expect(g).not.toBeNull();
      return g!;
    }

    const vorher = parseVariante(false);
    const nachher = parseVariante(true);
    const urspruenglicheNorm = vorher.elemente[0]!.data as NormDarstellung;
    const nummerKette = [{ ebene: 'nummer' as const, bezeichnung: '1.' }];
    const faelle = [
      { pfad: normtextPfad({ absatz: '(1)', satz: 1 }), text: 'Siehe § 5:', start: 0 },
      {
        pfad: normtextPfad({ absatz: '(1)', satz: 1 }),
        text: 'endet Satz 4.',
        start: 'Siehe § 5:'.length,
      },
      {
        pfad: normtextPfad({ absatz: '(1)', satz: 1, eintraege: nummerKette }),
        text: 'Gemäß Nr. 2:',
        start: 0,
      },
      {
        pfad: normtextPfad({ absatz: '(1)', satz: 1, eintraege: nummerKette }),
        text: 'bleibt Art. 3.',
        start: 'Gemäß Nr. 2:'.length,
      },
      {
        pfad: normtextPfad({
          absatz: '(1)',
          satz: 1,
          eintraege: [...nummerKette, { ebene: 'litera' as const, bezeichnung: 'a)' }],
        }),
        text: 'Am 1. Januar\u00a0gilt es.\nWeiterer Text.',
        start: 0,
      },
    ];

    for (const { pfad, text, start } of faelle) {
      const bezugstext = schuetzeLeerzeichen(text);
      const markierung = eintrag({
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: { ...pfad },
            zeichenbereichStart: start,
            zeichenbereichEnde: start + bezugstext.length,
          },
          bezugstext: bezugstext,
        },
      });
      // Der gespeicherte Bezugstext entspricht dem tatsächlich dargestellten
      // Text, einschließlich bestehender und ergänzter geschützter Leerzeichen.
      expect(
        aktuellerTextAnPfad(urspruenglicheNorm, {
          pfad: pfad,
          zeichenbereichStart: start,
          zeichenbereichEnde: start + bezugstext.length,
        }),
      ).toBe(bezugstext);
      expect(pruefeMarkierung(markierung, vorher, [], new Set())).toEqual([]);
      expect(pruefeMarkierung(markierung, nachher, [], new Set())).toEqual([]);
      expect(
        pruefeEigenenKonflikt(
          markierungsEintrag({
            ...markierung,
            bezug: {
              typ: 'bezugstext',
              textstelle: {
                pfad: normtextPfad({ absatz: 'fehlt' }),
                zeichenbereichStart: 0,
                zeichenbereichEnde: 1,
              },
              bezugstext: 'x',
            },
          }),
          nachher,
        ),
      ).toBe('bezugstextFehltOderUnpassend');
    }

    const elementstand = {
      titel: urspruenglicheNorm.titel,
      textlaenge: normTextLaenge(urspruenglicheNorm),
    };
    expect(
      pruefeEigenenKonflikt(
        eintrag({
          ausgangsstelle: normAusgangsstelle('§ 1'),
          bezug: { typ: 'pauschal' as const, elementstand: elementstand },
        }),
        nachher,
      ),
    ).toBeUndefined();
    expect(klassifiziereZielnorm(zielnorm({ bezeichnung: '§ 1', elementstand }), nachher)).toBe(
      'passt',
    );
  });
});

describe('präfixgenaue Ausgangsnorm', () => {
  it.each([false, true])(
    'meldet eine fehlende oder umbenannte Norm trotz gleicher Überschriftengliederungskennzahl (Textbezug: %s)',
    (mitTextbezug) => {
      const u = { ...ueberschrift('010', 'Abschnitt 1'), titel: 'Gleicher Text' };
      const e = eintrag({
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle('Anhang 010'),

        kommentarText: 'Notiz',
        ...(mitTextbezug
          ? {
              bezug: {
                typ: 'bezugstext' as const,
                textstelle: {
                  pfad: bereichPfad('amtlicherTitel'),
                  zeichenbereichStart: 0,
                  zeichenbereichEnde: 7,
                },
                bezugstext: 'Gleiche',
              },
            }
          : {}),
      });
      for (const normen of [[], [norm('anlage', 'Anlage 010')]]) {
        const g = gesetz('Test', normen, [u]);
        expect(findeElementZuBezeichnung(g, e.ausgangsstelle)).toBeUndefined();
        expect(pruefeEigenenKonflikt(e, g)).toBe(
          mitTextbezug ? 'bezugstextFehltOderUnpassend' : 'pauschalerBezugFehlt',
        );
      }
    },
  );

  it.each([undefined, [], ['Art.', '§']])(
    'deutet unmarkierte Kennung nicht zur Überschrift um (%j)',
    (praefix) => {
      const u = ueberschrift('010', 'Abschnitt 1');
      expect(
        findeElementZuBezeichnung(
          gesetz('Test', [], [u]),
          normAusgangsstelle([(praefix ?? ['§']).at(-1), '010'].filter(Boolean).join(' ')),
        ),
      ).toBeUndefined();
      expect(
        findeElementZuBezeichnung(gesetz('Test', [], [u]), ueberschriftAusgangsstelle('010')),
      ).toBe(u);
    },
  );

  it('unterscheidet identische Textstellen anhand ihres Normpräfixes', () => {
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 2 },
        bezugstext: '',
      },
    });
    expect(identitaetsSchluessel(e)).toBe(
      'norm:§ 1|unterstreichung|z:0-2|[null,null,0,null,1,[],1]',
    );
    expect(
      identitaetsSchluessel(
        markierungsEintrag({
          ...e,
          ausgangsstelle: normAusgangsstelle('1'),
        }),
      ),
    ).not.toBe(identitaetsSchluessel(e));
    expect(
      identitaetsSchluessel(
        markierungsEintrag({
          ...e,
          ausgangsstelle: normAusgangsstelle('§ 1'),
        }),
      ),
    ).toBe('norm:§ 1|unterstreichung|z:0-2|[null,null,0,null,1,[],1]');
    expect(
      identitaetsSchluessel(
        markierungsEintrag({
          ...e,
          ausgangsstelle: normAusgangsstelle('Anhang 1'),
        }),
      ),
    ).not.toBe(
      identitaetsSchluessel(
        markierungsEintrag({
          ...e,
          ausgangsstelle: normAusgangsstelle('§ 1'),
        }),
      ),
    );
  });
  it('prüft Anhang statt gleichnummerigem Paragraphen und meldet geändertes Präfix', () => {
    const g = gesetz('Test', [norm('p1', '§ 1'), norm('a1', 'Anhang 1')]);
    const e = eintrag({
      ausgangsstelle: normAusgangsstelle('Anhang 1'),

      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('bezeichnung'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 6,
        },
        bezugstext: 'Anhang',
      },
    });
    expect(pruefeEigenenKonflikt(e, g)).toBeUndefined();
    expect(
      pruefeEigenenKonflikt(
        markierungsEintrag({
          ...e,
          ausgangsstelle: normAusgangsstelle('Anlage 1'),
        }),
        g,
      ),
    ).toBe('bezugstextFehltOderUnpassend');
  });
  it('prüft Erwägungsgrund ohne Präfix gegen seinen Text', () => {
    const n = { ...norm('e25', 'E25'), art: 'erwaegungsgrund' as const };
    const g = gesetz('Test', [norm('art25', 'Art. 25'), n]);
    expect(
      pruefeEigenenKonflikt(
        eintrag({
          ausgangsstelle: erwaegungsgrundAusgangsstelle('E25'),
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: bereichPfad('bezeichnung'),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 3,
            },
            bezugstext: 'E25',
          },
        }),
        g,
      ),
    ).toBeUndefined();
  });
});

it('trennt gewählte Zielgesetze nach Normgeber und normalisiert die Identität', () => {
  const eigenes = { ...gesetz('Ausgang', []), normgeber: 'de-bund' };
  const bund = { ...gesetz('ABC', [norm('1', '§ 1')]), normgeber: 'de-bund' };
  const bw = { ...gesetz('ABC', []), normgeber: 'de-bw' };
  const marker = eintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    verweisinhalt: {
      verweistext: '§ 1 ABC',
      verweisziele: [
        verweisziel({
          typ: 'zielnorm',
          gesetz: { kurztitel: 'abc', normgeber: 'de-bund' },
          bezeichnung: '§ 1',
          verweistextZeichenbereich: [0, 1],
          elementstand: testElementstand(),
        }),
        verweisziel({
          typ: 'zielnorm',
          gesetz: { kurztitel: 'ABC', normgeber: 'de-bw' },
          bezeichnung: '§ 1',
          verweistextZeichenbereich: [0, 1],
          elementstand: testElementstand(),
        }),
        verweisziel({
          typ: 'zielnorm',
          gesetz: { kurztitel: 'ABC', normgeber: 'eu' },
          bezeichnung: '§ 1',
          verweistextZeichenbereich: [0, 1],
          elementstand: testElementstand(),
        }),
      ],
    },
  });
  expect(berechneZielKonflikte(marker, eigenes, [bund, bw])).toEqual([
    {
      gesetz: { kurztitel: 'ABC', normgeber: 'de-bw' },
      typ: 'zielNormFehlt',
      bezeichnungen: [{ bezeichnung: '§ 1', befund: 'fehlt' }],
    },
    {
      gesetz: { kurztitel: 'ABC', normgeber: 'eu' },
      typ: 'zielGesetzFehlt',
      bezeichnungen: [{ bezeichnung: '§ 1' }],
    },
  ]);
});

it('fasst Casevarianten desselben fehlenden Ziels zusammen und prüft nur die ausgewählte Referenz', () => {
  const eigenes = { ...gesetz('ABC', []), normgeber: 'de-bund' };
  const erstesZiel = { kurztitel: 'Abc', normgeber: 'de-bw' };
  const marker = eintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    verweisinhalt: {
      verweistext: '§§ 1, 2 ABC',
      verweisziele: [
        verweisziel({
          typ: 'zielnorm',
          gesetz: erstesZiel,
          bezeichnung: '§ 1',
          verweistextZeichenbereich: [0, 1],
          elementstand: testElementstand(),
        }),
        verweisziel({
          typ: 'zielnorm',
          gesetz: { kurztitel: 'ABC', normgeber: 'de-bw' },
          bezeichnung: '§ 2',
          verweistextZeichenbereich: [2, 3],
          elementstand: testElementstand(),
        }),
        verweisziel({
          typ: 'zielnorm',
          gesetz: gesetzesreferenz({ kurztitel: 'ABC' }),
          bezeichnung: '§ 3',
          verweistextZeichenbereich: [4, 5],
          elementstand: testElementstand(),
        }),
      ],
    },
  });
  const konflikte = berechneZielKonflikte(
    marker,
    eigenes,
    [eigenes],
    new Set([gesetzesreferenzSchluessel({ kurztitel: 'abc', normgeber: 'de-bw' })]),
  );
  expect(konflikte).toEqual([
    {
      gesetz: erstesZiel,
      typ: 'zielGesetzFehlt',
      bezeichnungen: [{ bezeichnung: '§ 1' }, { bezeichnung: '§ 2' }],
    },
  ]);
  expect(konflikte[0]?.gesetz).toBe(erstesZiel);
});

it('verwechselt fehlende Titel verschiedener Normgeber auch bei Casevarianten nicht', () => {
  const eintraege = [
    eintrag({ ausgangsstelle: normAusgangsstelle('§ 1'), ...nichtamtlicherTitelBezug }),
  ];
  const vorhandene = new Set([
    gesetzesreferenzSchluessel({ kurztitel: 'ABC', normgeber: 'de-bund' }),
  ]);
  expect(
    pruefeNichtamtlicheTitelXmlFehlt(
      eintraege,
      { kurztitel: 'abc', normgeber: 'de-bund' },
      vorhandene,
    ),
  ).toBe(false);
  expect(
    pruefeNichtamtlicheTitelXmlFehlt(
      eintraege,
      { kurztitel: 'ABC', normgeber: 'de-bw' },
      vorhandene,
    ),
  ).toBe(true);
  expect(
    pruefeNichtamtlicheTitelXmlFehlt(
      eintraege,
      { kurztitel: 'ABC', normgeber: 'unbekannt' },
      vorhandene,
    ),
  ).toBe(true);
});

it('meldet einen Artwechsel des Listeneintrags trotz unverändertem Bezugstext als Markierungskonflikt', () => {
  const parse = (liste: string) =>
    parseGesetzesXML(
      `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>${liste}</absatz></text></norm></inhalt></gesetz>`,
    )!;
  const vorher = parse('<nummer zahl="a">Gleich</nummer>');
  const nachher = parse('<litera buchstabe="a">Gleich</litera>');
  const markierung = eintrag({
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: 'a' }] }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 6,
      },
      bezugstext: 'Gleich',
    },
  });
  expect(pruefeMarkierung(markierung, vorher, [], new Set())).toEqual([]);
  expect(pruefeMarkierung(markierung, nachher, [], new Set())).toMatchObject([
    { eigenerKonflikt: 'bezugstextFehltOderUnpassend' },
  ]);
});

it('trennt Überschrift 010 von § 1010 ausdrücklich', () => {
  const g = gesetz('BGB', [norm('1010', '§ 1010')], [ueberschrift('010', 'Buch 1')]);
  expect(findeElementZuBezeichnung(g, ueberschriftAusgangsstelle('010'))?.bezeichnung).toBe(
    'Buch 1',
  );
  expect(findeElementZuBezeichnung(g, normAusgangsstelle('§ 010'))).toBeUndefined();
  expect(
    identitaetsSchluessel(eintrag({ ausgangsstelle: ueberschriftAusgangsstelle('010') })),
  ).not.toBe(identitaetsSchluessel(eintrag({ ausgangsstelle: normAusgangsstelle('§ 010') })));
});

describe('drei eigene Bezugskonflikte', () => {
  it.each(['kommentar', 'verweismarkierung'] as const)(
    'unterscheidet Titel, Länge und fehlende Ausgangsstelle: %s',
    (typ) => {
      const stand = { titel: 'Titel', textlaenge: 5 };
      const e = eintrag({
        typ,
        ausgangsstelle: normAusgangsstelle('§ 9'),
        bezug: { typ: 'pauschal' as const, elementstand: stand },
      });
      const passend = gesetz('Test', [norm('9', '§ 9', { titel: 'Titel', textLaenge: 5 })]);
      expect(pruefeEigenenKonflikt(e, passend)).toBeUndefined();
      for (const opts of [
        { titel: 'Neu', textLaenge: 5 },
        { titel: 'Titel', textLaenge: 6 },
      ])
        expect(pruefeEigenenKonflikt(e, gesetz('Test', [norm('9', '§ 9', opts)]))).toBe(
          'pauschalerBezugUnpassend',
        );
      const fehlt = gesetz('Test', [norm('90', '§ 90', { titel: 'Titel', textLaenge: 5 })]);
      expect(pruefeEigenenKonflikt(e, fehlt)).toBe('pauschalerBezugFehlt');
      expect(
        pruefeEigenenKonflikt(
          markierungsEintrag({
            ...e,
            bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
          }),
          fehlt,
        ),
      ).toBe('pauschalerBezugFehlt');
      expect(
        pruefeEigenenKonflikt(
          markierungsEintrag({ ...e, bezug: { typ: 'pauschal' as const, elementstand: stand } }),
          passend,
        ),
      ).toBeUndefined();
      expect(
        pruefeEigenenKonflikt(
          markierungsEintrag({
            ...e,
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: bereichPfad('amtlicherTitel'),
                zeichenbereichStart: 0,
                zeichenbereichEnde: 5,
              },
              bezugstext: 'Titel',
            },
          }),
          passend,
        ),
      ).toBeUndefined();
      expect(
        pruefeEigenenKonflikt(
          markierungsEintrag({
            ...e,
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
              bezugstext: 'Titel',
            },
          }),
          fehlt,
        ),
      ).toBe('bezugstextFehltOderUnpassend');
    },
  );

  it('ordnet Überschriften eindeutig zu und prüft vorhandene nichtamtliche Titel über ihren Bezugstext', () => {
    const u = ueberschrift('010', 'Abschnitt');
    const e = eintrag({
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 9 } },
      typ: 'kommentar',
      ausgangsstelle: ueberschriftAusgangsstelle('010'),
    });
    expect(pruefeEigenenKonflikt(e, gesetz('Test', [], [u]))).toBeUndefined();
    expect(pruefeEigenenKonflikt(e, gesetz('Test', []))).toBe('pauschalerBezugFehlt');
    expect(pruefeEigenenKonflikt(e, gesetz('Test', [], [u, { ...u, xmlId: 'zweiter' }]))).toBe(
      'pauschalerBezugFehlt',
    );
    const text = eintrag({
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('nichtamtlicherTitel'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 3,
        },
        bezugstext: 'Alt',
      },
    });
    for (const titel of ['Neu', undefined]) {
      const g = gesetz('Test', [norm('1', '§ 1', { titel, titelIstNichtamtlich: true })]);
      expect(
        pruefeMarkierung(text, g, [], new Set([gesetzesreferenzSchluessel(g)]))[0]?.eigenerKonflikt,
      ).toBe('bezugstextFehltOderUnpassend');
      expect(pruefeMarkierung(text, g, [], new Set())).toEqual([]);
    }
  });

  it.each([[''], ['§'], ['Anhang'], ['Art.', '§']].map((praefix) => ({ praefix })))(
    'verwendet dieselbe strikte Zielzuordnung (Präfix %j)',
    ({ praefix }) => {
      const g = gesetz('Test', [norm('p1', '§ 1'), norm('a1', 'Anhang 1')]);
      const z = zielnorm({
        bezeichnung: `${praefix.join(' ')} 1`,
        elementstand: testElementstand(),
      });
      expect(klassifiziereZielnorm(z, g) === 'passt').toBe(
        praefix.length === 1 && praefix[0] !== '',
      );
      const e = verweisEintrag([z], 'Ziel');
      expect(berechneZielKonflikte(e, g, [g])).toHaveLength(
        praefix.length === 1 && praefix[0] !== '' ? 0 : 1,
      );
      if (praefix.length !== 1 || praefix[0] === '')
        expect(berechneZielKonflikte(e, g, [g])[0]?.typ).toBe('zielNormFehlt');
    },
  );
  it('meldet mehrfache exakte Zieltreffer und Teiltreffer auch bei passendem Stand als fehlend', () => {
    const z = zielnorm({
      bezeichnung: '§ 9',

      elementstand: { titel: 'Titel', textlaenge: 5 },
    });
    for (const normen of [
      [norm('90', '§ 90', { titel: 'Titel', textLaenge: 5 })],
      [
        norm('9a', '§ 9', { titel: 'Titel', textLaenge: 5 }),
        norm('9b', '§ 9', { titel: 'Titel', textLaenge: 5 }),
      ],
    ]) {
      const g = gesetz('Test', normen);
      expect(klassifiziereZielnorm(z, g)).not.toBe('passt');
      expect(berechneZielKonflikte(verweisEintrag([z], 'Ziel'), g, [g])[0]?.typ).toBe(
        'zielNormFehlt',
      );
    }
  });
});

it('erhält den beim Verweisanlegen gültigen Stand einer weggefallenen Sammelnorm', () => {
  const n = { ...norm('bereich', '§§ 3 bis 6'), status: 'weggefallen' as const };
  const g = gesetz('Test', [n]);
  const stand = testElementstand();
  for (const bezeichnung of ['3', '6']) {
    const z = zielnorm({ bezeichnung: '§ ' + bezeichnung, elementstand: stand });
    expect(klassifiziereZielnorm(z, g)).toBe('passt');
    expect(berechneZielKonflikte(verweisEintrag([z], 'Ziel'), g, [g])).toEqual([]);
  }
  const pauschal = eintrag({
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§§ 3 bis 6'),

    bezug: { typ: 'pauschal' as const, elementstand: stand },
  });
  expect(pruefeEigenenKonflikt(pauschal, g)).toBeUndefined();
  for (const bezeichnung of ['4', '5'])
    expect(
      klassifiziereZielnorm(zielnorm({ bezeichnung: '§ ' + bezeichnung, elementstand: stand }), g),
    ).not.toBe('passt');
});

it.each([
  ['passt', '10', 0],
  ['unpassend', '10', 5],
  ['nichtEindeutig', '5', 0],
  ['fehlt', '999', 0],
] as const)(
  'klassifiziert den Befund %s einheitlich für die Einzelprüfung',
  (befund, bezeichnung, textlaenge) => {
    const g = gesetz('GG', [norm('10', 'Art. 10'), norm('5a', 'Art. 5'), norm('5b', 'Art. 5')]);
    const ziel = zielnorm({ bezeichnung: 'Art. ' + bezeichnung, elementstand: { textlaenge } });
    expect(klassifiziereZielnorm(ziel, g)).toBe(befund);
  },
);

it('löst eine Überschrift und eine gleich nummerierte Norm jeweils eindeutig auf', () => {
  const gesetz = parseGesetzesXML(
    '<gesetz version="1"><infos><kurztitel>G</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><gliederung gliederungskennzahl="100"><bezeichnung>Teil</bezeichnung></gliederung><norm id="100"><bezeichnung>§ 100</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  assert(gesetz);
  const ueberschrift = loeseAusgangsstelleAuf(gesetz, {
    typ: 'ueberschrift',
    gliederungskennzahl: '100',
  });
  const norm = loeseAusgangsstelleAuf(gesetz, { typ: 'norm', bezeichnung: '§ 100' });
  expect(ueberschrift.anzahlTreffer).toBe(1);
  expect(norm.anzahlTreffer).toBe(1);
  expect(ueberschrift.element?.xmlId).toBe('ueberschrift:100');
  expect(norm.element?.xmlId).toBe('100');
});
