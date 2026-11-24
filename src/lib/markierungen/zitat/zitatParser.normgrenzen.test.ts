// zitatParser.normgrenzen.test.ts
//
// Tests für zitatParser.normgrenzen.ts (kolokiert, Vitest). Entstanden bei
// der Mutation-Testing-Auswertung vom 2026-08-26 (siehe Chatverlauf) als
// gezielte Ergänzung zu den in zitatParser.test.ts bereits sehr umfangreich
// abgedeckten Grammatik-Fällen – hier speziell die Fälle, die dort bisher
// NICHT (bzw. nicht beobachtbar genug) mitgetestet waren: die vier
// Symbolformen §/§§/Art./Artt. einzeln, das Zwei-Token-Binnenparagraph-
// Format OHNE führendes Symbol, sowie einige Reset-/Randfälle in
// behandleSemikolon/-Buchstabe/-Wort.
//
// Wie zitatParser.test.ts bewusst NUR über die öffentliche parseZitat()-API
// getestet; ergänzende direkte Handlertests sichern die Indexkonvention.

import { it, expect } from 'vitest';
import { parseZitat, type RohNormZitat } from './zitatParser';

import {
  behandleSemikolon,
  behandleSymbol,
  behandleZahl,
  behandleBuchstabe,
  behandleZusatz,
  behandleWort,
  behandleKomma,
} from './zitatParser.normgrenzen';
import {
  erzeugeNormState,
  neueNorm,
  neueOhneZielZitat,
  type NormKontext,
} from './zitatParser.normzustand';
import { tokenisiere } from './zitatParser.tokenizer';

function kurz(z: RohNormZitat) {
  return { norm: z.normzahlRoh, anzeige: z.anzeigeText, ohneZiel: !!z.ohneZiel };
}

it('eine weitere Unterabsatzangabe übernimmt nur den übergeordneten Absatz als Prüfkontext', () => {
  const { ambiguitaeten } = parseZitat('§ 5 Abs. 1 UAbs. 2, 3');
  expect(ambiguitaeten).toEqual([
    {
      index: 1,
      vorherigerIndex: 0,
      art: 'unterabsatz',
      wert: '3',
      absatzKontext: '1',
      unterabsatzKontext: undefined,
      satzKontext: undefined,
      nummerKontext: undefined,
      verfeinerung: undefined,
    },
  ]);
});

it('nach einem Komma ist nur die römische Zahl selbst ein Absatzkandidat; ein Zusatzwort leitet seinen eigenen Wert ein', () => {
  const roemisch = parseZitat('§ 5 Nr. 1, II');
  expect(roemisch.zitate.map((z) => ({ norm: z.normzahlRoh, anzeige: z.anzeigeText }))).toEqual([
    { norm: '5', anzeige: '§ 5' },
    { norm: '2', anzeige: 'II' },
  ]);
  expect(roemisch.ambiguitaeten.map((a) => ({ art: a.art, wert: a.wert }))).toEqual([
    { art: 'absatz', wert: '2' },
  ]);
  for (const zusatzwort of ['Abs.', 'UAbs.', 'Satz', 'Nr.']) {
    const explizit = parseZitat(`§ 5 Nr. 1, ${zusatzwort} 2`);
    expect(
      explizit.zitate.map((z) => z.normzahlRoh),
      zusatzwort,
    ).toEqual(['5']);
    expect(explizit.ambiguitaeten, zusatzwort).toEqual([]);
  }
});

it('nur eine arabische Ordnungszahl gehört nach dem Komma zur folgenden Alternative, Variante, Gruppe oder zum Halbsatz', () => {
  for (const zusatzwort of ['Alt.', 'Var.', 'Gr.', 'Hs.']) {
    const arabisch = parseZitat(`§ 5 Satz 1, 2. ${zusatzwort}`);
    expect(
      arabisch.zitate.map((z) => z.normzahlRoh),
      zusatzwort,
    ).toEqual(['5']);
    expect(arabisch.ambiguitaeten, zusatzwort).toEqual([]);
    const roemisch = parseZitat(`§ 5 Satz 1, II ${zusatzwort}`);
    expect(
      roemisch.zitate.map((z) => z.normzahlRoh),
      zusatzwort,
    ).toEqual(['5', '2']);
    expect(
      roemisch.ambiguitaeten.map((a) => ({ art: a.art, wert: a.wert })),
      zusatzwort,
    ).toEqual([{ art: 'absatz', wert: '2' }]);
  }
});

// ---------------------------------------------------------------------------
// behandleSymbol: plural-Ableitung für alle vier Symbolformen
// ---------------------------------------------------------------------------

it('plural gilt unabhängig für alle vier Symbolformen §/§§/Art./Artt. (nicht nur für §/§§, wie bisher indirekt getestet)', () => {
  expect(parseZitat('§ 5 Abs 1, 2').ambiguitaeten, '§ Singular: mehrdeutig').toHaveLength(1);
  expect(parseZitat('§§ 5 Abs 1, 2').ambiguitaeten, '§§ Plural: sicher').toHaveLength(0);
  expect(parseZitat('Art. 5 Abs 1, 2').ambiguitaeten, 'Art. Singular: mehrdeutig').toHaveLength(1);
  expect(parseZitat('Artt. 5 Abs 1, 2').ambiguitaeten, 'Artt. Plural: sicher').toHaveLength(0);
});

it('ein alleinstehendes Symbol ohne folgende Normzahl bekommt anzeigeText = Symbol OHNE trailing Leerzeichen', () => {
  expect(parseZitat('§').zitate.map(kurz)).toEqual([{ norm: '', anzeige: '§', ohneZiel: false }]);
});

// ---------------------------------------------------------------------------
// behandleZahlOhneOffeneNorm: "n. Alt" ganz ohne vorangehende Norm
// ---------------------------------------------------------------------------

it('"1. Alt" ganz ohne vorangehende Norm erzeugt einen ohneZiel-Verweis (Ordnungszahl gehört zur Alt-Zusatzangabe, nicht zur Normzahl)', () => {
  const { zitate } = parseZitat('1. Alt');
  expect(zitate).toHaveLength(1);
  expect(zitate[0]!.ohneZiel).toBe(true);
});

// ---------------------------------------------------------------------------
// behandleZahlMitOffenerNorm: Satz-Kurzform setzt zusatzArt korrekt auf 'satz'
// ---------------------------------------------------------------------------

it('Satz-Kurzform ("434 III 2") liefert bei nachfolgendem Komma-Kandidaten art:"satz" (nicht nur "irgendein" zusatzArt)', () => {
  const { ambiguitaeten } = parseZitat('434 III 2, 3');
  expect(ambiguitaeten.map((a) => ({ art: a.art, wert: a.wert }))).toEqual([
    { art: 'satz', wert: '3' },
  ]);
});

// ---------------------------------------------------------------------------
// behandleZahlMitOffenerNorm: direkter Wert zu Abs/UAbs/S/Nr – je EIGENER Ast
// ---------------------------------------------------------------------------

it('"UAbs 2" (ohne Komma) löst KEINE Satz-Kurzform-Erwartung aus – anders als "Abs 2" (siehe eigener Ast je Zusatzart)', () => {
  expect(parseZitat('§ 5 UAbs 2 3').ambiguitaeten, 'UAbs: keine Satz-Kurzform').toEqual([]);
  expect(
    parseZitat('§ 5 UAbs 2, 3').ambiguitaeten.map((a) => a.art),
    'UAbs bei Komma',
  ).toEqual(['unterabsatz']);
});

it('"Nr 2" merkt sich den Wert als aktiverNummerWert (beobachtbar über nachfolgenden Komma-Kandidaten mit art:"nummer")', () => {
  const { ambiguitaeten } = parseZitat('§ 5 Nr 2, 3');
  expect(ambiguitaeten.map((a) => a.art)).toEqual(['nummer']);
});

it('aktiverNummerWert bleibt bis zur nächsten Litera-Ebene erhalten und erscheint dort als nummerKontext (einzige Stelle, an der er gelesen wird, siehe kontextFuer)', () => {
  const { ambiguitaeten } = parseZitat('§ 5 Nr 2 lit i, 433');
  expect(ambiguitaeten.map((a) => ({ art: a.art, nummerKontext: a.nummerKontext }))).toEqual([
    { art: 'litera', nummerKontext: '2' },
  ]);
});

it('ein Zusatzwort ohne eigenen checkbaren Wert (z.B. "Var") lässt eine direkt folgende Zahl unverändert – KEIN Wechsel in den Abs/UAbs/S/Nr-Ast (beobachtbar über absent nummerKontext bei einer nachfolgenden Litera-Prüfung)', () => {
  expect(parseZitat('§ 5 Var 2, 3').ambiguitaeten).toEqual([]);
  const { ambiguitaeten } = parseZitat('§ 5 Var 2 lit i, 433');
  expect(ambiguitaeten.map((a) => a.nummerKontext)).toEqual([undefined]);
});

// ---------------------------------------------------------------------------
// behandleZahlMitOffenerNorm: Zwei-Token-Binnenparagraph-Format OHNE Symbol
// ---------------------------------------------------------------------------

it('"229 2" (bloße Zahlenfolge OHNE führendes Symbol) wird als zweiteiliger Binnenparagraph erkannt, wie "Art. 229 2" MIT Symbol', () => {
  expect(parseZitat('229 2').zitate.map(kurz)).toEqual([
    { norm: '229 2', anzeige: '229 2', ohneZiel: false },
  ]);
});

it('eine DRITTE Zahl in Folge ("229 2 3") wird NICHT mehr angehängt – nur genau EIN Zweitzahl-Token', () => {
  expect(parseZitat('229 2 3').zitate.map((z) => z.normzahlRoh)).toEqual(['229 2']);
});

it('eine zweite Zahl NACH einem Zusatzwort ("5 Nr 2 3" bzw. "5 Abs 2 3") wird NICHT als Binnenparagraph-Zweitzahl anghängt (state.zusatzArt ist dann gesetzt)', () => {
  expect(parseZitat('§ 5 Nr 2 3').zitate.map((z) => z.normzahlRoh)).toEqual(['5']);
  expect(parseZitat('5 Abs 2 3').zitate.map((z) => z.normzahlRoh)).toEqual(['5']);
});

// ---------------------------------------------------------------------------
// behandleSemikolon: Abschluss des offenen Gesetzesabschnitts
// ---------------------------------------------------------------------------

it('ein Semikolon schließt den Gesetzesabschnitt – ein direkt folgendes Wort wird NICHT mehr als Kurztitel-Abschluss der vorherigen Norm verschluckt, sondern eigenständiger Verweis auf ein ganzes Gesetz', () => {
  expect(parseZitat('§ 5; BGB').zitate.map(kurz)).toEqual([
    { norm: '5', anzeige: '§ 5', ohneZiel: false },
    { norm: '', anzeige: 'BGB', ohneZiel: false },
  ]);
});

// ---------------------------------------------------------------------------
// behandleBuchstabe: eigenständiger Litera-Verweis ohne offene Norm
// ---------------------------------------------------------------------------

it('ein alleinstehender Litera-Buchstabe ohne offene Norm erzeugt einen ohneZiel-Verweis', () => {
  expect(parseZitat('a').zitate.map(kurz)).toEqual([{ norm: '', anzeige: '', ohneZiel: true }]);
});

// ---------------------------------------------------------------------------
// behandleWort: ein gelesener Kurztitel schließt den Gesetzesabschnitt
// ---------------------------------------------------------------------------

it('nach einem Gesetzeskürzel, das eine wartende Normzahl schließt, wird der Gesetzesabschnitt geschlossen – ein WEITERES Wort danach ist ein eigenständiger Verweis auf ein ganzes Gesetz, nicht nochmals ein Kurztitel-Abschluss', () => {
  expect(parseZitat('§ 5 BGB Abs 3 BGB2').zitate.map(kurz)).toEqual([
    { norm: '5', anzeige: '§ 5', ohneZiel: false },
    { norm: '', anzeige: 'BGB2', ohneZiel: false },
  ]);
});

it('nach dem eigenständigen Verweis auf ein ganzes Gesetz wird der NÄCHSTE Token korrekt weiterverarbeitet, kein Token wird übersprungen (beobachtbar über den Fortsetzungs-Rückgabewert)', () => {
  const { zitate, ambiguitaeten } = parseZitat('§ 5 BGB Abs 3 BGB2 Nr 4 lit i, 433');
  expect(zitate.map((z) => z.normzahlRoh)).toEqual(['5', '', '433']);
  expect(ambiguitaeten.map((a) => a.nummerKontext)).toEqual(['4']);
});

it.each([
  [';', 0, behandleSemikolon, 1],
  ['§ 5 BGB', 0, behandleSymbol, 2],
  ['Art. 229 § 2 EGBGB', 0, behandleSymbol, 4],
  ['5', 0, behandleZahl, 1],
  ['1. Alt', 0, behandleZahl, 1],
  ['a', 0, behandleBuchstabe, 1],
  ['Abs. 3', 0, behandleZusatz, 1],
  ['SGB 2', 0, behandleWort, 2],
  [',', 0, behandleKomma, 1],
] as const)(
  'Handler konsumiert %s und liefert den nächsten Index',
  (text, ti, handler, erwartet) => {
    const ctx: NormKontext = {
      text,
      tokens: tokenisiere(text),
      zitate: [],
      ambiguitaeten: [],
      state: erzeugeNormState(),
    };
    expect(handler(ctx, ti)).toBe(erwartet);
  },
);

it.each([
  [', BGB', undefined, false, 1, 0],
  [', 2', undefined, false, 2, 0],
  [', 2', 'variante', false, 2, 0],
  [', 10', 'gruppe', false, 2, 0],
  [', 2', 'alternative', false, 2, 0],
  [', 3', 'halbsatz', false, 2, 0],
  [', 2', 'absatz', false, 2, 1],
  [', II', 'nummer', false, 2, 1],
  [', b', 'litera', false, 2, 0],
  [', b', 'absatz', false, 1, 0],
  [', b', undefined, false, 1, 0],
  [', 1. Alt', 'satz', false, 2, 0],
  [', 2 Abs. 3', 'absatz', false, 2, 0],
  [', 2', 'absatz', true, 2, 0],
  [', 2, 3', 'absatz', true, 2, 1],
  [', 2 Abs. 3', 'absatz', true, 2, 0],
] as const)(
  'Kommafortschritt bei %s, Zusatz %s, Plural %s',
  (text, zusatzArt, plural, erwartet, mehrdeutig) => {
    const ctx: NormKontext = {
      text,
      tokens: tokenisiere(text),
      zitate: [],
      ambiguitaeten: [],
      state: erzeugeNormState(),
    };
    neueNorm(ctx, 0, plural);
    ctx.state.zusatzArt = zusatzArt;
    expect(behandleKomma(ctx, 0)).toBe(erwartet);
    expect(ctx.ambiguitaeten).toHaveLength(mehrdeutig);
  },
);

it('Komma nach einem Eintrag ohne Ziel konsumiert nur den Trenner', () => {
  const ctx: NormKontext = {
    text: ', 2',
    tokens: tokenisiere(', 2'),
    zitate: [],
    ambiguitaeten: [],
    state: erzeugeNormState(),
  };
  neueOhneZielZitat(ctx, 0);
  expect(behandleKomma(ctx, 0)).toBe(1);
});

it('ein Artikelsymbol vor einem Paragraphen behält sein Artikelpräfix', () => {
  const { zitate } = parseZitat('Art. § 90');
  expect(zitate.map(kurz)).toEqual([{ norm: '90', anzeige: 'Art. 90', ohneZiel: false }]);
});

it('eine Ordnungszahl nach dem Semikolon gehört vollständig zum Zitat ohne Ziel', () => {
  const { zitate } = parseZitat('§ 5; 1. Alt.');
  expect(
    zitate.map((z) => ({ start: z.textStart, ende: z.textEnde, ohneZiel: !!z.ohneZiel })),
  ).toEqual([
    { start: 0, ende: 5, ohneZiel: false },
    { start: 5, ende: 12, ohneZiel: true },
  ]);
});

it('nur Paragraphensymbole werden vor einer Zahl zusammengeführt', () => {
  for (const text of ['§ § 90', '§§ § 90', '§ §§ 90', '§§ §§ 90']) {
    expect(parseZitat(text).zitate.map(kurz), text).toEqual([
      { norm: '90', anzeige: text.endsWith('§§ 90') ? '§§ 90' : '§ 90', ohneZiel: false },
    ]);
  }
  expect(parseZitat('§ Art. 90').zitate.map(kurz)).toEqual([
    { norm: '', anzeige: '§', ohneZiel: false },
    { norm: '90', anzeige: 'Art. 90', ohneZiel: false },
  ]);
});

it('gleichlautende Norm- und Zusatznummern eröffnen keinen Binnenparagraphen', () => {
  for (const eingabe of ['§ 5 Nr. 5 2', 'Art. 5 Var. 5 2', '5 Satz 5 2']) {
    expect(parseZitat(eingabe).zitate.map(kurz), eingabe).toEqual([
      {
        norm: '5',
        anzeige: eingabe.startsWith('§') ? '§ 5' : eingabe.startsWith('Art.') ? 'Art. 5' : '5',
        ohneZiel: false,
      },
    ]);
  }
});

it('Binnenparagraphen erfordern die unmittelbar vorherige Normzahl statt eines anderen Tokens', () => {
  for (const eingabe of ['5 vgl. 2', '5 a 2', 'Art. 5 Abs. 2', 'Abs. 2', 'BGB; 2']) {
    expect(
      parseZitat(eingabe).zitate.map((z) => z.normzahlRoh),
      eingabe,
    ).not.toContain('5 2');
  }
  expect(parseZitat('Art. 229 2').zitate.map(kurz)).toEqual([
    { norm: '229 2', anzeige: 'Art. 229 2', ohneZiel: false },
  ]);
});
