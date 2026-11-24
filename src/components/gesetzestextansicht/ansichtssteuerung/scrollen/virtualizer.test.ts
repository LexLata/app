import { normDarstellung } from '@/test/gesetz/gesetzFabriken';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  schaetzeHoehe,
  schaetzeScrollTop,
  erstelleItemKeyFunktion,
  ermittleHoehenIdentitaet,
  SCROLL_MARGIN,
  type HoehenKontext,
} from './virtualizer';
import type {
  AbsatzDarstellung,
  DarstellungsElement,
  NormDarstellung,
  SatzDarstellung,
  UeberschriftDarstellung,
  UnterabsatzDarstellung,
} from '@/lib/domain/gesetzTypes';

const ermittleItemKey = (el: DarstellungsElement, kontext: HoehenKontext, schrift: number) =>
  erstelleItemKeyFunktion(
    [el],
    kontext.eingeklappteUeberschriften,
    kontext.eingeklappteNormen,
    ermittleHoehenIdentitaet(kontext, schrift),
  )(0);

// Tests laufen im 'node'-Environment (kein DOM, s. vitest.config.ts). Sowohl
// zeilenFuerText als auch spaltenBreite (textMessung.ts) fallen
// dadurch deterministisch auf ihre canvas-lose Heuristik-Formel zurück:
//   zeilenFuerText: max(1, ceil(text.length / max(20, breite/(schrift*0.55))))
//   spaltenBreite:  text.length * schrift * 0.55 + schrift * 0.35
// Alle folgenden Erwartungswerte sind von Hand nach diesen Formeln
// nachgerechnet (SCHRIFT=15, breite=720 → weit über der Schwelle 20, d.h.
// kurze Test-Texte wie "Text" bleiben immer einzeilig).

const SCHRIFT = 15;

const kontextBasis: HoehenKontext = {
  eingeklappteUeberschriften: new Set(),
  eingeklappteNormen: new Set(),
  unterArtikelIds: new Set(),
  zeilenabstand: 1.6,
  messung: erstelleTestTextMessung(),
  inhaltEinzug: 12,
  satzNeuZeile: true,
  textAlign: 'left',
  hyphens: 'auto',
  lang: 'de',

  textSpalteBreite: 720,
};

function satz(partial: Partial<SatzDarstellung> & { id: string; text: string }): SatzDarstellung {
  return { eintraege: [], ...partial };
}

function absatz(partial: Partial<AbsatzDarstellung> & { id: string }): AbsatzDarstellung {
  return { saetze: [], ...partial };
}

function unterabsatz(
  partial: Partial<UnterabsatzDarstellung> & { id: string; bezeichnung: string },
): UnterabsatzDarstellung {
  return { saetze: [], ...partial };
}

function normEl(
  partial: Partial<NormDarstellung> & { id: string; bezeichnung: string },
): DarstellungsElement {
  return { typ: 'norm', data: normDarstellung({ xmlId: partial.id, absaetze: [], ...partial }) };
}

function ueberschriftEl(
  partial: Partial<UeberschriftDarstellung> & { id: string; bezeichnung: string },
): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: { xmlId: partial.id, ebene: 1, gliederungskennzahl: '000000', ...partial },
  };
}

describe('schaetzeHoehe – ganze Pixel', () => {
  // Gemessene Höhen sind ganze Pixel (offsetHeight, gerundete ResizeObserver-Größe). Eine
  // Schätzung mit Nachkommastellen wiche daher auch bei richtigem Zeilenumbruch ab und löste
  // eine Neuberechnung und oberhalb des Sichtbereichs eine Scrollkorrektur aus.
  it('rundet die Überschrift 44 + 16,5 · 1,35 + 10 = 76,275 auf 76', () => {
    const el = ueberschriftEl({ id: 'u1', bezeichnung: 'Erster Teil', ebene: 1 });
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(76);
  });

  it('rundet die Norm mit einem einzeiligen Absatz 19,5 + 24 + 8,4 + 20 = 71,9 auf 72', () => {
    const el = normEl({
      id: 'n1',
      bezeichnung: '§ 1',
      absaetze: [absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'Text' })] })],
    });
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(72);
  });
});

describe('schaetzeHoehe – Überschrift', () => {
  it('Ebene 1, nicht untergeordnet: topPad 44 + fontGroesse*1.35 + 10', () => {
    const el = ueberschriftEl({ id: 'u1', bezeichnung: 'Erster Teil', ebene: 1 });
    // topPad=44, fontGroesse=15*1.1=16.5 → 44 + 16.5*1.35 + 10 = 76.275
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(76);
  });

  it('untergeordnete Überschrift: topPad fest 16, fontGroesse ohne 1.1-Faktor', () => {
    const el = ueberschriftEl({ id: 'u1', bezeichnung: 'Erster Teil', ebene: 1 });
    const kontext: HoehenKontext = { ...kontextBasis, unterArtikelIds: new Set(['u1']) };
    // topPad=16 (istUntergeordnet gewinnt), fontGroesse=15 → 16 + 15*1.35 + 10 = 46.25
    expect(schaetzeHoehe(el, SCHRIFT, kontext)).toBe(46);
  });

  it('schätzt aufgeklappte und eingeklappte Ebene-2-Überschriften gleich hoch', () => {
    const el = ueberschriftEl({ id: 'u1', bezeichnung: 'Erster Abschnitt', ebene: 2 });
    const kontext: HoehenKontext = { ...kontextBasis, eingeklappteUeberschriften: new Set(['u1']) };
    // 32 + 15 * 1.1 * 1.35 + 10 = 64.275
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(64);
    expect(schaetzeHoehe(el, SCHRIFT, kontext)).toBe(64);
  });
});

describe('schaetzeHoehe – Norm', () => {
  const zeilHoehe = SCHRIFT * kontextBasis.zeilenabstand; // 24

  it.each(['(weggefallen)', '(gegenstandslos)', '(aufgehoben)', '(entfallen)', undefined])(
    'Status weggefallen ohne Text: feste Kurzzeilenhöhe auch für Titel %s',
    (titel) => {
      const el = normEl({ id: 'n1', bezeichnung: '§ 1', titel, status: 'weggefallen' });
      expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(Math.round(SCHRIFT * 1.3 + 20));
    },
  );

  it('Norm ohne Titel und Text: feste Kurzzeilenhöhe', () => {
    const el = normEl({ id: 'n1', bezeichnung: '§ 25' });
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(Math.round(SCHRIFT * 1.3 + 20));
  });

  it.each([undefined, 'weggefallen'] as const)(
    'echter Text bleibt bei Titel weggefallen und Status %s in der Höhenschätzung erhalten',
    (status) => {
      const el = normEl(
        normDarstellung({
          id: 'n1',
          bezeichnung: '§ 1',
          titel: '(weggefallen)',
          status,
          absaetze: [absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'X'.repeat(500) })] })],
        }),
      );
      expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBeGreaterThan(zeilHoehe + 20);
    },
  );

  it('eingeklappte Norm: dieselbe feste Formel, unabhängig vom Titel', () => {
    const el = normEl(
      normDarstellung({
        id: 'n1',
        bezeichnung: '§ 1',
        absaetze: [absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'X'.repeat(500) })] })],
      }),
    );
    const kontext: HoehenKontext = { ...kontextBasis, eingeklappteNormen: new Set(['n1']) };
    expect(schaetzeHoehe(el, SCHRIFT, kontext)).toBe(Math.round(SCHRIFT * 1.3 + 20));
  });

  it('ein unbenannter Absatz, ein kurzer Satz: eigene Titelhöhe plus eine Fließtextzeile und 20px Abstand', () => {
    const el = normEl(
      normDarstellung({
        id: 'n1',
        bezeichnung: '§ 1',
        absaetze: [absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'Text' })] })],
      }),
    );
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(
      Math.round(SCHRIFT * 1.3 + 1.35 * zeilHoehe + 20),
    );
  });

  it('zwei benannte Absätze ("(1)","(2)"): Spalte für Absatzbezeichnungen reduziert Breite, bleibt aber je 1 Zeile', () => {
    const el = normEl(
      normDarstellung({
        id: 'n1',
        bezeichnung: '§ 1',
        absaetze: [
          absatz({ id: 'a1', bezeichnung: '(1)', saetze: [satz({ id: 's1', text: 'Text' })] }),
          absatz({ id: 'a2', bezeichnung: '(2)', saetze: [satz({ id: 's2', text: 'Text' })] }),
        ],
      }),
    );
    // Titel + 2 Textzeilen + zweimal 0,35 Zeilenhöhen Abstand
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(104);
  });

  it('Absatz mit Unterabsätzen (EU-Recht-Fall): jeder Unterabsatz zählt wie ein eigener Absatz', () => {
    const el = normEl(
      normDarstellung({
        id: 'n1',
        bezeichnung: 'Art. 6',
        absaetze: [
          absatz({
            id: 'a1',
            unterabsaetze: [
              unterabsatz({
                id: 'ua1',
                bezeichnung: '[1]',
                saetze: [satz({ id: 's1', text: 'Text' })],
              }),
              unterabsatz({
                id: 'ua2',
                bezeichnung: '[2]',
                saetze: [satz({ id: 's2', text: 'Text' })],
              }),
            ],
          }),
        ],
      }),
    );
    // Titel + 2 Unterabsatzzeilen; kein zusätzlicher Abstand zwischen Unterabsätzen.
    expect(schaetzeHoehe(el, SCHRIFT, kontextBasis)).toBe(
      Math.round(SCHRIFT * 1.3 + 2.35 * zeilHoehe + 20),
    );
  });

  it('Satz mit Listeneintrag: der Eintrag trägt eine eigene Zeile zur Absatzhöhe bei', () => {
    const ohneEintrag = normEl(
      normDarstellung({
        id: 'n1',
        bezeichnung: '§ 1',
        absaetze: [absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'Text' })] })],
      }),
    );
    const mitEintrag = normEl(
      normDarstellung({
        id: 'n2',
        bezeichnung: '§ 2',
        absaetze: [
          absatz({
            id: 'a1',
            saetze: [
              satz({
                id: 's1',
                text: 'Text',
                eintraege: [
                  {
                    id: 'e1',
                    bezeichnung: '1.',
                    ebene: 'nummer',
                    text: 'Text',
                    untereintraege: [],
                  },
                ],
              }),
            ],
          }),
        ],
      }),
    );
    const hoeheOhne = schaetzeHoehe(ohneEintrag, SCHRIFT, kontextBasis);
    const hoeheMit = schaetzeHoehe(mitEintrag, SCHRIFT, kontextBasis);
    expect(hoeheMit).toBeGreaterThan(hoeheOhne);
    expect(hoeheMit).toBe(hoeheOhne + zeilHoehe);
  });

  it.each([
    ['ohne Text und ohne Untereinträge', []],
    [
      'ohne Text mit Untereintrag',
      [{ id: 'e2', bezeichnung: 'a)', ebene: 'litera' as const, text: 'Text', untereintraege: [] }],
    ],
  ])('belegt mit der Bezeichnung eines Eintrags %s eine eigene Zeile', (_fall, untereintraege) => {
    const mit = (bezeichnung: string) =>
      normEl(
        normDarstellung({
          id: 'n2',
          bezeichnung: '§ 2',
          absaetze: [
            absatz({
              id: 'a1',
              saetze: [
                satz({
                  id: 's1',
                  text: 'Text',
                  eintraege: [{ id: 'e1', bezeichnung, ebene: 'nummer', text: '', untereintraege }],
                }),
              ],
            }),
          ],
        }),
      );
    const zeilHoehe = SCHRIFT * kontextBasis.zeilenabstand;
    // Die Bezeichnung „1.“ steht in der ersten Reihe des Eintrags, auch ohne Text daneben.
    expect(schaetzeHoehe(mit('1.'), SCHRIFT, kontextBasis)).toBe(
      Math.round(schaetzeHoehe(mit(''), SCHRIFT, kontextBasis) + zeilHoehe),
    );
  });
});

describe('schaetzeScrollTop', () => {
  it('summiert die geschätzten Höhen bis zum Index und addiert SCROLL_MARGIN', () => {
    const elemente = [
      normEl(
        normDarstellung({
          id: 'n1',
          bezeichnung: '§ 1',
          absaetze: [absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'Text' })] })],
        }),
      ),
      normEl(
        normDarstellung({
          id: 'n2',
          bezeichnung: '§ 2',
          absaetze: [absatz({ id: 'a2', saetze: [satz({ id: 's2', text: 'Text' })] })],
        }),
      ),
      normEl(
        normDarstellung({
          id: 'n3',
          bezeichnung: '§ 3',
          absaetze: [absatz({ id: 'a3', saetze: [satz({ id: 's3', text: 'Text' })] })],
        }),
      ),
    ];
    const hoeheProNorm = schaetzeHoehe(elemente[0]!, SCHRIFT, kontextBasis);
    expect(schaetzeScrollTop(2, elemente, SCHRIFT, kontextBasis)).toBe(
      SCROLL_MARGIN + 2 * hoeheProNorm,
    );
  });

  it('bis=0: nur SCROLL_MARGIN, keine Elemente aufsummiert', () => {
    const elemente = [normEl({ id: 'n1', bezeichnung: '§ 1' })];
    expect(schaetzeScrollTop(0, elemente, SCHRIFT, kontextBasis)).toBe(SCROLL_MARGIN);
  });

  it('bis > Listenlänge: bricht an der tatsächlichen Länge ab, kein Fehler', () => {
    const elemente = [normEl({ id: 'n1', bezeichnung: '§ 1' })];
    const hoehe = schaetzeHoehe(elemente[0]!, SCHRIFT, kontextBasis);
    expect(schaetzeScrollTop(99, elemente, SCHRIFT, kontextBasis)).toBe(SCROLL_MARGIN + hoehe);
  });
});

describe('ermittleItemKey', () => {
  it('aufgeklappte Norm: Key aus id + textVersion, ohne ":zu"-Suffix', () => {
    const el = normEl({ id: 'n1', bezeichnung: '§ 1' });
    expect(ermittleItemKey(el, kontextBasis, SCHRIFT)).toBe(
      'n1:[15,"\'Source Serif 4\', serif",1.6,720,12,true,"left","auto","de"]',
    );
  });

  it('eingeklappte Norm: Key erhält ":zu"-Suffix (eigene Cache-Invalidierung)', () => {
    const el = normEl({ id: 'n1', bezeichnung: '§ 1' });
    const kontext: HoehenKontext = { ...kontextBasis, eingeklappteNormen: new Set(['n1']) };
    expect(ermittleItemKey(el, kontext, SCHRIFT)).toBe(
      'n1:zu:[15,"\'Source Serif 4\', serif",1.6,720,12,true,"left","auto","de"]',
    );
  });

  it('eingeklappte Überschrift: prüft eingeklappteUeberschriften statt eingeklappteNormen', () => {
    const el = ueberschriftEl({ id: 'u1', bezeichnung: 'Erster Teil' });
    const kontext: HoehenKontext = { ...kontextBasis, eingeklappteUeberschriften: new Set(['u1']) };
    expect(ermittleItemKey(el, kontext, SCHRIFT)).toBe(
      'u1:zu:[15,"\'Source Serif 4\', serif",1.6,720,12,true,"left","auto","de"]',
    );
  });

  it('Änderung von aufgelöstem Font/Zeilenabstand/Textspaltenbreite erzeugt andere Keys', () => {
    const el = normEl({ id: 'n1', bezeichnung: '§ 1' });
    const key1 = ermittleItemKey(el, kontextBasis, SCHRIFT);
    const key2 = ermittleItemKey(el, { ...kontextBasis, zeilenabstand: 1.8 }, SCHRIFT);
    const key3 = ermittleItemKey(el, { ...kontextBasis, textSpalteBreite: 600 }, SCHRIFT);
    const key4 = ermittleItemKey(
      el,
      {
        ...kontextBasis,
        messung: erstelleTestTextMessung('sans'),
      },
      SCHRIFT,
    );
    expect(new Set([key1, key2, key3, key4]).size).toBe(4);
  });
});

afterEach(() => vi.unstubAllGlobals());

it('Höhen- und Scrollschätzung verwenden die explizite Messgrundlage der jeweiligen Ansicht', () => {
  const fonts: string[] = [];
  const ctx = {
    font: '',
    measureText(text: string) {
      fonts.push(this.font);
      return { width: text.length * (this.font.includes('Source Serif 4') ? 12 : 6) };
    },
  };
  vi.stubGlobal('document', {
    documentElement: {},
    createElement: () => ({ getContext: () => ctx }),
  });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
  const el = normEl(
    normDarstellung({
      id: 'n1',
      bezeichnung: '§ 1',
      absaetze: [absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'abc abc' })] })],
    }),
  );
  const serifMessung = {
    ...kontextBasis,
    textSpalteBreite: 50,
    inhaltEinzug: 0,
    messung: erstelleTestTextMessung('serif'),
  };
  const sansMessung = {
    ...kontextBasis,
    textSpalteBreite: 50,
    inhaltEinzug: 0,
    messung: erstelleTestTextMessung('sans'),
  };
  expect(schaetzeHoehe(el, 15, serifMessung)).toBe(Math.round(15 * 1.3 + 2.35 * 15 * 1.6 + 20));
  expect(schaetzeHoehe(el, 15, sansMessung)).toBe(Math.round(15 * 1.3 + 1.35 * 15 * 1.6 + 20));
  expect(schaetzeScrollTop(1, [el], 15, serifMessung)).toBe(
    SCROLL_MARGIN + Math.round(15 * 1.3 + 2.35 * 15 * 1.6 + 20),
  );
  expect(fonts).toContain("15px 'Source Serif 4', serif");
  expect(fonts.some((font) => font.startsWith('15px system-ui'))).toBe(true);
});

import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { normTextLaenge } from '@/lib/domain/gesetzDarstellungAuswertung';
it.each([
  { aussen: true, unterabsatz: false, verschachtelt: false, zahl: true },
  { aussen: false, unterabsatz: false, verschachtelt: false, zahl: false },
  { aussen: true, unterabsatz: true, verschachtelt: true, zahl: false },
  { aussen: false, unterabsatz: true, verschachtelt: true, zahl: true },
])(
  'zählt einzelne Satzkinder ohne zusammengefassten Eintragstext: %j',
  ({ aussen, unterabsatz, verschachtelt, zahl }) => {
    const innerer = `<neu/><satz${zahl ? ' zahl="1"' : ''}>Siehe <verweis norm="2">B</verweis>.</satz><neu/>`;
    const liste = `<nummer zahl="1">${verschachtelt ? `<litera buchstabe="a">${innerer}</litera>` : innerer}</nummer>`;
    const inhalt = aussen ? `<satz zahl="1">${liste}</satz>` : liste;
    const el = parseGesetzesXML(
      `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz>${unterabsatz ? `<unterabsatz zahl="[2]">${inhalt}</unterabsatz>` : inhalt}</absatz></text></norm></inhalt></gesetz>`,
    )!.elemente[0]!;
    if (el.typ !== 'norm') throw new Error('Norm fehlt');
    const n = el.data;
    const a = n.absaetze[0]!;
    const kontext: HoehenKontext = {
      eingeklappteUeberschriften: new Set<string>(),
      eingeklappteNormen: new Set<string>(),
      unterArtikelIds: new Set<string>(),
      zeilenabstand: 1.6,
      messung: erstelleTestTextMessung(),
      inhaltEinzug: 12,
      satzNeuZeile: true,
      textAlign: 'left',
      hyphens: 'auto',
      lang: 'de',

      textSpalteBreite: 720,
    };
    const hoehe = schaetzeHoehe(el, 16, kontext);
    // Der zusammengefasste Eintragstext darf neben der Satzliste nicht zusätzlich zählen.
    const eintrag = (unterabsatz ? a.unterabsaetze![0]!.saetze : a.saetze)[0]!.eintraege[0]!;
    const blattEintrag = verschachtelt ? eintrag.untereintraege[0]! : eintrag;
    blattEintrag.text = 'Zusammenfassung, die nicht zusätzlich gezählt werden darf.'.repeat(100);
    expect(normTextLaenge(n)).toBe(8);
    expect(schaetzeHoehe(el, 16, kontext)).toBe(hoehe);
  },
);

it('Schriftgröße und wirksame Darstellung gehören zur Höhenidentität', () => {
  const el = normEl({ id: 'n1', bezeichnung: '§ 1' });
  const key = ermittleItemKey(el, kontextBasis, 15);
  expect(ermittleItemKey(el, kontextBasis, 22)).not.toBe(key);
  for (const aenderung of [
    { inhaltEinzug: 21 },
    { satzNeuZeile: false },
    { textAlign: 'justify' as const },
    { hyphens: 'none' as const },
    { lang: 'en' },
  ])
    expect(ermittleItemKey(el, { ...kontextBasis, ...aenderung }, 15)).not.toBe(key);
});

describe('wirksamer Einzug, Titel und Satzstruktur', () => {
  const saetze = [satz({ id: 's1', text: 'Kurz.' }), satz({ id: 's2', text: 'Auch kurz.' })];
  const el = normEl(
    normDarstellung({ id: 'n1', bezeichnung: '§ 1', absaetze: [absatz({ id: 'a1', saetze })] }),
  );
  it('Titel bleibt bei Zeilenabstandswechsel unabhängig vom Fließtext', () => {
    const zu = { ...kontextBasis, eingeklappteNormen: new Set(['n1']) };
    expect(schaetzeHoehe(el, 15, zu)).toBe(Math.round(15 * 1.3 + 20));
    expect(schaetzeHoehe(el, 15, { ...zu, zeilenabstand: 2 })).toBe(Math.round(15 * 1.3 + 20));
    expect(schaetzeHoehe(el, 15, kontextBasis)).toBe(Math.round(15 * 1.3 + 2.35 * 15 * 1.6 + 20));
    expect(schaetzeHoehe(el, 15, { ...kontextBasis, zeilenabstand: 2 })).toBe(
      Math.round(15 * 1.3 + 2.35 * 15 * 2 + 20),
    );
  });
  it('kurze Inline-Sätze benötigen gemeinsam eine Fließtextzeile', () => {
    expect(schaetzeHoehe(el, 15, { ...kontextBasis, satzNeuZeile: false })).toBe(
      Math.round(15 * 1.3 + 1.35 * 15 * 1.6 + 20),
    );
  });
  it('zieht Inhaltseinzug vor Absatz-, Unterabsatz- und Satzspalten ab', () => {
    const messung = {
      ...kontextBasis.messung,
      zeilenFuerText: vi.fn(() => 1),
      spaltenBreite: vi.fn(() => 10),
    };
    const norm = normEl(
      normDarstellung({
        id: 'n',
        bezeichnung: '§ 1',
        absaetze: [1, 2].map((n) =>
          absatz({
            id: `a${n}`,
            bezeichnung: `(${n})`,
            unterabsaetze: [unterabsatz({ id: `ua${n}`, bezeichnung: `[${n}]`, saetze })],
          }),
        ),
      }),
    );
    schaetzeHoehe(norm, 15, { ...kontextBasis, messung, textSpalteBreite: 200, inhaltEinzug: 30 });
    expect(messung.zeilenFuerText).toHaveBeenCalledWith('Kurz.', 140, 15, {
      silbentrennung: 'de',
      harteUmbrueche: true,
    });
  });
  it('fortlaufende Sätze: jeder Unterabsatz bleibt ein eigener Block mit Markenspalte', () => {
    const messung = {
      ...kontextBasis.messung,
      zeilenFuerText: vi.fn(() => 1),
      spaltenBreite: vi.fn(() => 10),
    };
    const norm = normEl(
      normDarstellung({
        id: 'n',
        bezeichnung: 'Art. 1',
        absaetze: [
          absatz({
            id: 'a',
            unterabsaetze: [
              unterabsatz({ id: 'u1', bezeichnung: '[1]', saetze }),
              unterabsatz({ id: 'u2', bezeichnung: '[2]', saetze }),
            ],
          }),
        ],
      }),
    );
    // 720 - Einzug 12 - Markenspalte 10 = 698; keine Satznummernspalte.
    expect(schaetzeHoehe(norm, 15, { ...kontextBasis, messung, satzNeuZeile: false })).toBe(
      Math.round(15 * 1.3 + 2.35 * 15 * 1.6 + 20),
    );
    expect(messung.zeilenFuerText.mock.calls).toEqual([
      ['1Kurz. 2Auch kurz.', 698, 15, { silbentrennung: 'de', harteUmbrueche: true }],
      ['1Kurz. 2Auch kurz.', 698, 15, { silbentrennung: 'de', harteUmbrueche: true }],
    ]);
    expect(messung.spaltenBreite).toHaveBeenCalledTimes(1);
  });
});

it('Aufzählung, Eintragssätze und Fortsetzungen zählen in beiden Satzanordnungen', () => {
  const saetze = [satz({ id: 'e1s1', text: 'Eins.' }), satz({ id: 'e1s2', text: 'Zwei.' })];
  const el = normEl(
    normDarstellung({
      id: 'n',
      bezeichnung: '§ 1',
      absaetze: [
        absatz({
          id: 'a',
          saetze: [
            satz({
              id: 's',
              text: 'Einleitung',
              fortsetzung: 'Schluss',
              eintraege: [
                {
                  id: 'e',
                  bezeichnung: '1.',
                  ebene: 'nummer',
                  text: 'Nicht zusätzlich zählen',
                  saetze,
                  fortsetzung: 'Fortsetzung',
                  untereintraege: [
                    {
                      id: 'sub',
                      bezeichnung: 'a)',
                      ebene: 'litera',
                      text: 'Unterpunkt',
                      untereintraege: [],
                    },
                  ],
                },
              ],
            }),
          ],
        }),
      ],
    }),
  );
  expect(schaetzeHoehe(el, 15, kontextBasis)).toBe(Math.round(15 * 1.3 + 6.35 * 15 * 1.6 + 20));
  // Fortlaufend: "Einleitung" (1), Eintragssätze "1Eins. 2Zwei." gemeinsam (1),
  // Eintragsfortsetzung (1), Unterpunkt (1), Satzfortsetzung "Schluss" (1).
  expect(schaetzeHoehe(el, 15, { ...kontextBasis, satzNeuZeile: false })).toBe(
    Math.round(15 * 1.3 + 5.35 * 15 * 1.6 + 20),
  );
});

it('Inline-Nummern kosten Textbreite, reservieren aber keine Nummernkolumne', () => {
  const messung = {
    ...kontextBasis.messung,
    zeilenFuerText: vi.fn(() => 1),
    spaltenBreite: vi.fn(() => 10),
  };
  const el = normEl(
    normDarstellung({
      id: 'n',
      bezeichnung: '§ 1',
      absaetze: [
        absatz({ id: 'a', saetze: [satz({ id: 's1', text: 'A' }), satz({ id: 's2', text: 'B' })] }),
      ],
    }),
  );
  schaetzeHoehe(el, 15, { ...kontextBasis, messung, satzNeuZeile: false });
  expect(messung.zeilenFuerText).toHaveBeenCalledExactlyOnceWith('1A 2B', 708, 15, {
    silbentrennung: 'de',
    harteUmbrueche: true,
  });
  expect(messung.spaltenBreite).not.toHaveBeenCalled();
});

it('fortlaufende Sätze: Folgesätze laufen nach der Fortsetzung im selben Fließtextblock weiter', () => {
  const messung = {
    ...kontextBasis.messung,
    zeilenFuerText: vi.fn((..._args: unknown[]) => 1),
    spaltenBreite: vi.fn(() => 10),
  };
  const el = normEl(
    normDarstellung({
      id: 'n',
      bezeichnung: '§ 1',
      absaetze: [
        absatz({
          id: 'a',
          saetze: [
            satz({ id: 's1', text: 'A' }),
            satz({
              id: 's2',
              text: 'B',
              fortsetzung: 'C',
              eintraege: [
                { id: 'e', bezeichnung: '1.', ebene: 'nummer', text: 'E', untereintraege: [] },
              ],
            }),
            satz({ id: 's3', text: 'D' }),
          ],
        }),
      ],
    }),
  );
  schaetzeHoehe(el, 15, { ...kontextBasis, messung, satzNeuZeile: false });
  // Eintrag: 708 - Bezeichnungsspalte 10 = 698.
  expect(messung.zeilenFuerText.mock.calls.filter((c) => c[0]).map((c) => [c[0], c[1]])).toEqual([
    ['1A 2B', 708],
    ['E', 698],
    ['C 3D', 708],
  ]);
});

it('neue Textbreite verändert Schätzung und Höhenkey in beiden Richtungen; gleiche Breite bleibt stabil', () => {
  const norm = normEl(
    normDarstellung({
      id: 'breite',
      bezeichnung: '§ 1',
      absaetze: [absatz({ id: 'a', saetze: [satz({ id: 's', text: 'Rechtstext '.repeat(80) })] })],
    }),
  );
  const breit = { ...kontextBasis, textSpalteBreite: 696 };
  const schmal = { ...kontextBasis, textSpalteBreite: 296 };
  expect(schaetzeHoehe(norm, SCHRIFT, schmal)).toBeGreaterThan(schaetzeHoehe(norm, SCHRIFT, breit));
  expect(ermittleItemKey(norm, schmal, SCHRIFT)).not.toBe(ermittleItemKey(norm, breit, SCHRIFT));
  expect(ermittleItemKey(norm, { ...schmal, textSpalteBreite: 696 }, SCHRIFT)).toBe(
    ermittleItemKey(norm, breit, SCHRIFT),
  );
  expect(schaetzeHoehe(norm, SCHRIFT, { ...breit })).toBe(schaetzeHoehe(norm, SCHRIFT, breit));
  expect(ermittleItemKey(norm, { ...breit }, SCHRIFT)).toBe(ermittleItemKey(norm, breit, SCHRIFT));
});

it('fügt vor Zwischenüberschriften keinen eigenen Feinabstand hinzu', () => {
  const a = absatz({ id: 'a', saetze: [satz({ id: 's', text: 'Erste Lesung' })] });
  const ohne = normEl(normDarstellung({ id: 'n', bezeichnung: 'Art. 1', absaetze: [a] }));
  const mit = normEl(
    normDarstellung({
      id: 'n',
      bezeichnung: 'Art. 1',
      absaetze: [{ ...a, zwischenueberschrift: true }],
    }),
  );
  expect(schaetzeHoehe(mit, SCHRIFT, kontextBasis)).toBe(
    schaetzeHoehe(ohne, SCHRIFT, kontextBasis),
  );
});

it.each([1.2, 1.8])(
  'schätzt zwischen Absätzen zusätzlich 0,35 Zeilenhöhen bei Zeilenabstand %s',
  (zeilenabstand) => {
    const a = absatz({ id: 'a', saetze: [satz({ id: 's', text: 'Text' })] });
    const einzeln = normEl({ id: 'n', bezeichnung: '§ 1', absaetze: [a] });
    const doppelt = normEl({ id: 'n', bezeichnung: '§ 1', absaetze: [a, { ...a, id: 'b' }] });
    const kontext = { ...kontextBasis, zeilenabstand };
    const zeile = 20 * zeilenabstand;
    expect(schaetzeHoehe(einzeln, 20, kontext)).toBe(Math.round(20 * 1.3 + 1.35 * zeile + 20));
    expect(schaetzeHoehe(doppelt, 20, kontext)).toBe(Math.round(20 * 1.3 + 2.7 * zeile + 20));
  },
);

it('addiert für Zusatztext eine volle Textzeile und einen Absatzabstand', () => {
  const ohne = normEl({
    id: 'n',
    bezeichnung: '§ 1',
    absaetze: [absatz({ id: 'a', saetze: [satz({ id: 's', text: 'A' })] })],
  });
  if (ohne.typ !== 'norm') throw Error('Norm erwartet');
  const mit: DarstellungsElement = {
    typ: 'norm',
    data: { ...ohne.data, zusatztexte: [{ nachAbsatz: 1, text: 'Zusatz' }] },
  };
  // Zusatztext: 15px Schrift * 1,6 Zeilenabstand * (1 Textzeile + 0,35 Abstand) = 32,4px mehr;
  // ohne 19,5 + 24 + 8,4 + 20 = 71,9 → 72, mit 71,9 + 32,4 = 104,3 → 104.
  expect(schaetzeHoehe(ohne, SCHRIFT, kontextBasis)).toBe(72);
  expect(schaetzeHoehe(mit, SCHRIFT, kontextBasis)).toBe(104);
});

describe('mehrzeilige Titel und Silbentrennung mit Textmessung', () => {
  // Messattrappe: jedes Zeichen ist 10 px breit; Textbreite 212 − Einzug 12 = 200 px.
  const fonts: string[] = [];
  function zehnProZeichen() {
    const ctx = {
      font: '',
      measureText(text: string) {
        fonts.push(this.font);
        return { width: text.length * 10 };
      },
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx }) });
    return { ...kontextBasis, textSpalteBreite: 212, messung: erstelleTestTextMessung() };
  }

  it('schätzt einen umbrechenden Titel hinter der fetten Bezeichnung zweizeilig', () => {
    const kontext = zehnProZeichen();
    const el = normEl({ id: 'n1', bezeichnung: '§ 1', titel: 'Kauf Vertrag Pflichten' });
    // Vorlauf "§ 1" 30 + 6 = 36; "Kauf " 50 + "Vertrag " 80 = 166; "Pflichten " → 2. Zeile.
    // Eingeklappt: 2 · 15 · 1,3 + 20 = 59.
    const eingeklappt = { ...kontext, eingeklappteNormen: new Set(['n1']) };
    expect(schaetzeHoehe(el, SCHRIFT, eingeklappt)).toBe(59);
    expect(fonts).toContain("bold 15px 'Source Serif 4', serif");
  });

  it('rechnet die Klammern nichtamtlicher Titel mit', () => {
    const kontext = { ...zehnProZeichen(), eingeklappteNormen: new Set(['n1']) };
    const titel = 'Kaufe Vertragen';
    // Amtlich:      36 + "Kaufe " 60 + "Vertragen" 90 = 186 ≤ 200 → 1 Zeile: 19,5 + 20 → 40.
    // Nichtamtlich: 36 + "[Kaufe " 70 + "Vertragen]" 100 = 206 > 200 → 2 Zeilen: 39 + 20 = 59.
    const amtlich = normEl({ id: 'n1', bezeichnung: '§ 1', titel });
    const nichtamtlich = normEl({
      id: 'n1',
      bezeichnung: '§ 1',
      titel,
      titelIstNichtamtlich: true,
    });
    expect(schaetzeHoehe(amtlich, SCHRIFT, kontext)).toBe(40);
    expect(schaetzeHoehe(nichtamtlich, SCHRIFT, kontext)).toBe(59);
  });

  it('schätzt eine umbrechende Überschrift mit Trenner mehrzeilig', () => {
    const kontext = { ...zehnProZeichen(), unterArtikelIds: new Set(['u1']) };
    const el = ueberschriftEl({
      id: 'u1',
      bezeichnung: 'Erster Teil',
      titel: 'Allgemeine Vorschriften',
    });
    // "Erster " 70 + "Teil: " 60 = 130; "Allgemeine " 110 → 2.; "Vorschriften " 130 → 3. Zeile.
    // Untergeordnet: 16 + 3 · 15 · 1,35 + 10 = 86,75 → 87.
    expect(schaetzeHoehe(el, SCHRIFT, kontext)).toBe(87);
  });

  it('behandelt Quell-Zeilenumbrüche in Titeln und Überschriften wie Leerzeichen', () => {
    const kontext = zehnProZeichen();
    const eingeklappt = { ...kontext, eingeklappteNormen: new Set(['n1']) };
    // Wie white-space: normal: 36 + "Kauf " 50 + "Vertrag" 70 = 156 ≤ 200 → 1 Zeile: 19,5 + 20 → 40.
    const norm = normEl({ id: 'n1', bezeichnung: '§ 1', titel: 'Kauf\nVertrag' });
    expect(schaetzeHoehe(norm, SCHRIFT, eingeklappt)).toBe(40);
    // "Erster " 70 + "Teil: " 60 + "Kauf" 40 = 170 → 1 Zeile; untergeordnet 16 + 20,25 + 10 → 46.
    const unter = { ...kontext, unterArtikelIds: new Set(['u1']) };
    const ueberschrift = ueberschriftEl({ id: 'u1', bezeichnung: 'Erster\nTeil', titel: 'Kauf' });
    expect(schaetzeHoehe(ueberschrift, SCHRIFT, unter)).toBe(46);
  });

  it('zählt im Normtext nur <zeilenumbruch/> als harten Umbruch, nicht Quell-Zeilenumbrüche', () => {
    const kontext = zehnProZeichen();
    const hoehe = (text: string) => {
      const el = parseGesetzesXML(
        `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz><satz>${text}</satz></absatz></text></norm></inhalt></gesetz>`,
      )?.elemente[0];
      if (!el) throw new Error('Norm fehlt');
      return schaetzeHoehe(el, SCHRIFT, kontext);
    };
    // "ab cd" passt in eine Zeile; der Quellumbruch wird zum Leerzeichen, <zeilenumbruch/> nicht.
    expect(hoehe('ab\ncd')).toBe(hoehe('ab cd'));
    expect(hoehe('ab<zeilenumbruch/>cd')).toBeGreaterThan(hoehe('ab cd'));
  });

  it('berücksichtigt Silbentrennung im Normtext nur bei hyphens auto', () => {
    const kontext = zehnProZeichen();
    const el = normEl({
      id: 'n1',
      bezeichnung: '§ 1',
      absaetze: [
        absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'Haus Verwaltungsgericht Haus' })] }),
      ],
    });
    // auto: "Haus Verwaltungsge-" | "richt Haus" → 19,5 + 2 · 24 + 8,4 + 20 = 95,9 → 96.
    // none: "Haus" | "Verwaltungsgericht" | "Haus" → 19,5 + 3 · 24 + 8,4 + 20 = 119,9 → 120.
    expect(schaetzeHoehe(el, SCHRIFT, kontext)).toBe(96);
    expect(schaetzeHoehe(el, SCHRIFT, { ...kontext, hyphens: 'none' })).toBe(120);
  });

  it.each([
    ['de', 96],
    ['de-DE', 96],
    ['DE-at', 96],
    ['fr', 96],
    ['fr-CA', 96],
    ['es', 96],
    ['en', 120],
    ['it', 120],
    ['dex', 120],
    // Ohne eigene Angabe erbt die Ansicht die Sprache der App (index.html: lang="de").
    [undefined, 96],
  ])(
    'nähert die Silbentrennung nur für Deutsch, Französisch und Spanisch an: %s',
    (lang, hoehe) => {
      const kontext = { ...zehnProZeichen(), lang };
      const el = normEl({
        id: 'n1',
        bezeichnung: '§ 1',
        absaetze: [
          absatz({ id: 'a1', saetze: [satz({ id: 's1', text: 'Haus Verwaltungsgericht Haus' })] }),
        ],
      });
      // Wie oben: Verwaltungsge|richt (in allen drei Regelsätzen) 96, ohne Trennung 120.
      expect(schaetzeHoehe(el, SCHRIFT, kontext)).toBe(hoehe);
    },
  );
});

it('schätzt Überschrifttext nur im aufgeklappten Zustand zusätzlich', () => {
  const ohne = ueberschriftEl({ id: 'u', bezeichnung: 'Teil 1' });
  const mit = ueberschriftEl({
    id: 'u',
    bezeichnung: 'Teil 1',
    text: {
      absaetze: [absatz({ id: 'a', saetze: [satz({ id: 's', text: 'Regelung' })] })],
      zusatztexte: [],
    },
  });
  const grundhoehe = schaetzeHoehe(ohne, SCHRIFT, kontextBasis);
  expect(schaetzeHoehe(mit, SCHRIFT, kontextBasis)).toBeGreaterThan(grundhoehe);
  expect(
    schaetzeHoehe(mit, SCHRIFT, { ...kontextBasis, eingeklappteUeberschriften: new Set(['u']) }),
  ).toBe(grundhoehe);
});
