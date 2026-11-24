// zitatParser.tokenizer.test.ts
//
// Tests für zitatParser.tokenizer.ts (kolokiert, Vitest). Deckt die reine
// Tokenisierung ab (Grammatik/Grenz-Erkennung liegt in zitatParser.ts und
// wird dort getestet, siehe zitatParser.test.ts) – hier stehen einzelne
// Token-Arten, ihre Sonderfälle (Alphanumerische Listen-Nummern,
// Ordnungszahl-Punkt, SONDER_MUSTER, Litera-Buchstaben, römische
// Absatz-Kurzform) im Fokus.
//
// Direkter it()/expect()-Stil (kein pruefe()/gleich()-Wrapper wie in
// zitatParser.test.ts – der ist dort als Altlast aus der Vor-Vitest-Zeit
// erhalten, aber keine projektweite Konvention, siehe übrige *.test.ts).

import { describe, it, expect } from 'vitest';
import { tokenisiere, type Token } from './zitatParser.tokenizer';

/** Kompakte Kurzform je Token für lesbarere Testerwartungen. */
function kurz(t: Token) {
  return {
    art: t.art,
    wert: t.wert,
    norm: t.norm,
    roemischWert: t.roemischWert,
    warOrdnungszahl: t.warOrdnungszahl,
  };
}

// ---------------------------------------------------------------------------
// Basis-Tokenarten (Whitespace, Satzzeichen, §/§§)
// ---------------------------------------------------------------------------

describe('Basis-Tokenarten', () => {
  it('überspringt Whitespace ohne eigenes Token', () => {
    const tokens = tokenisiere('  1   2');
    expect(tokens.map((t) => t.wert)).toEqual(['1', '2']);
  });

  it('erkennt Komma, Semikolon und Schrägstrich als eigene Tokenarten', () => {
    const tokens = tokenisiere(',;/');
    expect(tokens.map((t) => t.art)).toEqual(['komma', 'semikolon', 'schraegstrich']);
    expect(tokens.map((t) => [t.start, t.ende])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    // wert wird für Semikolon/Schrägstrich separat geprüft (Komma-wert ist
    // bereits über andere Tests abgedeckt, z.B. den Vorschauhelfer-Tests).
    expect(tokens.map((t) => t.wert)).toEqual([',', ';', '/']);
  });

  it('erkennt § als symbol mit norm "§"', () => {
    const tokens = tokenisiere('§');
    expect(tokens).toEqual([{ art: 'symbol', start: 0, ende: 1, wert: '§', norm: '§' }]);
  });

  it('erkennt §§ (unmittelbar doppelt) als EIN symbol-Token mit norm "§§"', () => {
    const tokens = tokenisiere('§§');
    expect(tokens).toEqual([{ art: 'symbol', start: 0, ende: 2, wert: '§§', norm: '§§' }]);
  });

  it('§§§ (drei Zeichen): erstes Paar wird zu §§, das dritte bleibt eigenes §-Token', () => {
    // Kein sinnvolles reales Zitat, aber dokumentiert das Greedy-Verhalten
    // der Verdopplungs-Prüfung (immer nur EIN Blick nach vorn).
    const tokens = tokenisiere('§§§');
    expect(tokens.map(kurz)).toEqual([
      {
        art: 'symbol',
        wert: '§§',
        norm: '§§',
        roemischWert: undefined,
        warOrdnungszahl: undefined,
      },
      { art: 'symbol', wert: '§', norm: '§', roemischWert: undefined, warOrdnungszahl: undefined },
    ]);
  });

  it('unbekannte Zeichen (z.B. Klammern) werden stillschweigend übersprungen', () => {
    const tokens = tokenisiere('(1)');
    expect(tokens.map((t) => t.wert)).toEqual(['1']);
  });

  it('Unicode-Umlaute/ß gelten als Wortbuchstaben', () => {
    const tokens = tokenisiere('Präambel');
    expect(tokens).toEqual([{ art: 'wort', start: 0, ende: 8, wert: 'Präambel' }]);
  });
});

// ---------------------------------------------------------------------------
// Zahl-Erkennung: alphanumerische Listen-Nummern & Ordnungszahl-Punkt
// ---------------------------------------------------------------------------

describe('Zahl-Erkennung', () => {
  it('einfache Zahl ohne Zusatz', () => {
    const tokens = tokenisiere('280');
    expect(tokens).toEqual([
      { art: 'zahl', start: 0, ende: 3, wert: '280', warOrdnungszahl: false },
    ]);
  });

  it('Zahl + EIN direkt folgender Kleinbuchstabe OHNE weiteren Buchstaben danach wird zur Zahl verschmolzen ("1a")', () => {
    const tokens = tokenisiere('1a');
    expect(tokens).toEqual([
      { art: 'zahl', start: 0, ende: 2, wert: '1a', warOrdnungszahl: false },
    ]);
  });

  it('Verschmelzung funktioniert auch am Textende (kein Folgezeichen zur Grenzprüfung)', () => {
    const tokens = tokenisiere('34a');
    expect(tokens.map((t) => t.wert)).toEqual(['34a']);
  });

  it('Verschmelzung endet korrekt vor einem Komma ("1b,")', () => {
    const tokens = tokenisiere('1b,');
    expect(tokens.map((t) => [t.art, t.wert])).toEqual([
      ['zahl', '1b'],
      ['komma', ','],
    ]);
  });

  it.each(['5aa', '5ab', '1bb', '5f'])('liest %s vollständig als Eingabezahl', (text) => {
    expect(tokenisiere(text)).toEqual([
      { art: 'zahl', start: 0, ende: text.length, wert: text, warOrdnungszahl: false },
    ]);
  });

  it.each(['1abc', '5bis', '5aBGB', '5ff', '5AA', '5aB'])(
    'schneidet %s nicht auf ein Teilsuffix ab',
    (text) => {
      const tokens = tokenisiere(text);
      expect(tokens.map((t) => t.wert)).toEqual([text[0], text.slice(1)]);
      expect(tokens[0]).toMatchObject({ art: 'zahl', start: 0, ende: 1 });
      expect(tokens[1]).toMatchObject({ start: 1, ende: text.length });
    },
  );

  it.each(['5aa.', '5ab.', '1bb.', '5f.'])('behandelt %s nicht als Ordnungszahl', (text) => {
    expect(tokenisiere(text)).toEqual([
      {
        art: 'zahl',
        start: 0,
        ende: text.length - 1,
        wert: text.slice(0, -1),
        warOrdnungszahl: false,
      },
    ]);
  });

  it('Zahl + GROSSbuchstabe wird NICHT verschmolzen (nur Kleinbuchstaben zählen) – bleibt eigenes wort-Token', () => {
    const tokens = tokenisiere('34A');
    expect(tokens.map((t) => [t.art, t.wert])).toEqual([
      ['zahl', '34'],
      ['wort', 'A'],
    ]);
  });

  it('Ordnungszahl-Punkt (warOrdnungszahl) bei reiner Zahl mit unmittelbar folgendem Punkt', () => {
    const tokens = tokenisiere('6.');
    expect(tokens).toEqual([{ art: 'zahl', start: 0, ende: 1, wert: '6', warOrdnungszahl: true }]);
    // Der Punkt selbst ist NICHT Teil des Tokens (wert/ende schließen ihn
    // aus) – bleibt als "unbekanntes Zeichen" unverarbeitet im Quelltext.
  });

  it('Ordnungszahl-Punkt gilt NICHT, wenn ein Buchstaben-Suffix vorliegt ("1a." ist kein bekanntes Zitiermuster)', () => {
    const tokens = tokenisiere('1a.');
    expect(tokens).toEqual([
      { art: 'zahl', start: 0, ende: 2, wert: '1a', warOrdnungszahl: false },
    ]);
  });

  it('Zahl ohne folgenden Punkt: warOrdnungszahl bleibt false', () => {
    const tokens = tokenisiere('6 Var');
    expect(tokens[0]).toMatchObject({ wert: '6', warOrdnungszahl: false });
  });
});

// ---------------------------------------------------------------------------
// SONDER_MUSTER (iVm/i.V.m., aE/a.E., am Ende) – Sonderregex VOR genereller
// Wort-Erkennung
// ---------------------------------------------------------------------------

describe('Sonderwort-Erkennung (SONDER_MUSTER)', () => {
  it('"iVm" ohne Punkte wird als EIN Trenn-Token (komma) erkannt', () => {
    const tokens = tokenisiere('iVm');
    expect(tokens).toEqual([{ art: 'komma', start: 0, ende: 3, wert: 'iVm' }]);
  });

  it('"i.V.m." mit Punkten wird ebenfalls als EIN Trenn-Token (komma) erkannt', () => {
    const tokens = tokenisiere('i.V.m.');
    expect(tokens).toEqual([{ art: 'komma', start: 0, ende: 6, wert: 'i.V.m.' }]);
  });

  it('"aE" und "a.E." werden als sonstige-Token erkannt', () => {
    expect(tokenisiere('aE').map((t) => t.art)).toEqual(['sonstige']);
    expect(tokenisiere('a.E.').map((t) => t.art)).toEqual(['sonstige']);
  });

  it('"am Ende" (mit Leerzeichen) wird als EIN zusammenhängendes sonstige-Token erkannt', () => {
    const tokens = tokenisiere('am Ende');
    expect(tokens).toEqual([{ art: 'sonstige', start: 0, ende: 7, wert: 'am Ende' }]);
  });

  it('ANNAHME/Grenzfall: SONDER_MUSTER ist case-sensitiv – "AM ENDE" (Großschreibung) trifft NICHT und wird stattdessen zu zwei generischen wort-Token', () => {
    // Dokumentiert bewusst das aktuelle Verhalten (keine Vereinheitlichung
    // der Groß-/Kleinschreibung in den Regexen) – falls das nicht gewollt
    // ist, bitte Bescheid geben, dann passe ich SONDER_MUSTER an.
    const tokens = tokenisiere('AM ENDE');
    expect(tokens.map((t) => [t.art, t.wert])).toEqual([
      ['wort', 'AM'],
      ['wort', 'ENDE'],
    ]);
  });

  it('"iV" ohne folgendes "m" trifft SONDER_MUSTER nicht und wird generisch als wort tokenisiert', () => {
    const tokens = tokenisiere('iV');
    expect(tokens).toEqual([{ art: 'wort', start: 0, ende: 2, wert: 'iV' }]);
  });

  it('SONDER_MUSTER wird relativ zur aktuellen Position im Eingabetext geprüft, nicht ab Textanfang ("6 iVm" erkennt iVm trotz vorangehender Zahl)', () => {
    const tokens = tokenisiere('6 iVm');
    expect(tokens.map((t) => t.art)).toEqual(['zahl', 'komma']);
    expect(tokens[1]).toMatchObject({ wert: 'iVm' });
  });

  it('REGRESSION (Mutation-Testing-Analyse): der Textanfang-Anker in /^am\\s+Ende/ ist notwendig – ohne ihn würde "am Ende" auch MITTEN in einem Wort fälschlich anschlagen ("Team Ende" enthält "am Ende" ab Index 2)', () => {
    const tokens = tokenisiere('Team Ende');
    expect(tokens.map((t) => [t.art, t.wert])).toEqual([
      ['wort', 'Team'],
      ['wort', 'Ende'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Symbol-/Zusatzwort-Klassifizierung (Art/Artikel/Artt, Abs/Nr/lit/…)
// ---------------------------------------------------------------------------

describe('Wort-Klassifizierung (Symbole/Zusatzwörter/Sonstige)', () => {
  it('"Art" und "Artikel" werden beide zu symbol/Art (keine Pluralunterscheidung bei "Artikel")', () => {
    expect(tokenisiere('Art')[0]).toMatchObject({ art: 'symbol', norm: 'Art' });
    expect(tokenisiere('Artikel')[0]).toMatchObject({ art: 'symbol', norm: 'Art' });
  });

  it('"Artt" wird zu symbol/Artt (Plural)', () => {
    expect(tokenisiere('Artt')[0]).toMatchObject({ art: 'symbol', norm: 'Artt' });
  });

  it('Zusatzwörter sind case-insensitiv (Klassifizierung lowercased intern)', () => {
    expect(tokenisiere('ABS')[0]).toMatchObject({ art: 'zusatz', norm: 'absatz' });
    expect(tokenisiere('AbS')[0]).toMatchObject({ art: 'zusatz', norm: 'absatz' });
  });

  it('unmittelbar folgender einzelner Punkt gehört zur Abkürzung (Original-Groß-/Kleinschreibung bleibt in wert erhalten)', () => {
    const tokens = tokenisiere('Abs.');
    expect(tokens).toEqual([{ art: 'zusatz', start: 0, ende: 4, wert: 'Abs.', norm: 'absatz' }]);
  });

  it('deckt alle dokumentierten Zusatzwort-Synonyme ab (Absatz/Uabs/Nr/Ziff/Ziffern/Litera)', () => {
    const paare: Array<[string, string]> = [
      ['Absatz', 'absatz'],
      ['UAbs', 'unterabsatz'],
      ['Unterabsatz', 'unterabsatz'],
      ['Nr', 'nummer'],
      ['Nummer', 'nummer'],
      ['Ziff', 'nummer'],
      ['Ziffer', 'nummer'],
      ['Ziffern', 'nummer'],
      ['Litera', 'litera'],
      ['Gruppe', 'gruppe'],
      ['Variante', 'variante'],
      ['Halbsatz', 'halbsatz'],
      ['Alternative', 'alternative'],
    ];
    for (const [wort, erwartet] of paare) {
      expect(tokenisiere(wort)[0], wort).toMatchObject({ art: 'zusatz', norm: erwartet });
    }
  });

  it('SONSTIGE_WOERTER (analog/vgl/sh/siehe/des) werden als art "sonstige" ohne norm erkannt', () => {
    for (const wort of ['analog', 'vgl', 'sh', 'siehe', 'des']) {
      expect(tokenisiere(wort)[0], wort).toEqual({
        art: 'sonstige',
        start: 0,
        ende: wort.length,
        wert: wort,
      });
    }
  });

  it('generisches unbekanntes Wort (Kurztitel-Kandidat) bleibt art "wort" ohne norm', () => {
    const tokens = tokenisiere('ZPO');
    expect(tokens).toEqual([{ art: 'wort', start: 0, ende: 3, wert: 'ZPO' }]);
  });
});

// ---------------------------------------------------------------------------
// Litera-Buchstabe-Erkennung (LITERA_BUCHSTABE_MUSTER)
// ---------------------------------------------------------------------------

describe('Litera-Buchstabe-Erkennung', () => {
  it('einzelner Kleinbuchstabe wird zu buchstabe', () => {
    expect(tokenisiere('a')).toEqual([{ art: 'buchstabe', start: 0, ende: 1, wert: 'a' }]);
  });

  it('verdoppelter GLEICHER Kleinbuchstabe wird zu buchstabe ("aa", "bb")', () => {
    expect(tokenisiere('aa')[0]).toMatchObject({ art: 'buchstabe', wert: 'aa' });
    expect(tokenisiere('bb')[0]).toMatchObject({ art: 'buchstabe', wert: 'bb' });
  });

  it('zwei VERSCHIEDENE Kleinbuchstaben ("ab") gelten NICHT als Litera-Buchstabe, bleiben generisches wort', () => {
    expect(tokenisiere('ab')).toEqual([{ art: 'wort', start: 0, ende: 2, wert: 'ab' }]);
  });

  it('einzelner GROSSbuchstabe ("A") gilt NICHT als Litera-Buchstabe (Muster ist auf Kleinbuchstaben beschränkt)', () => {
    expect(tokenisiere('A')).toEqual([{ art: 'wort', start: 0, ende: 1, wert: 'A' }]);
  });

  it('bereits als Zusatzwort erkannte Einzelbuchstaben ("s" = Satz) bleiben zusatz, werden NICHT zu buchstabe umklassifiziert', () => {
    expect(tokenisiere('s')).toEqual([
      { art: 'zusatz', start: 0, ende: 1, wert: 's', norm: 'satz' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Römische Zahl als Absatz-Kurzform
// ---------------------------------------------------------------------------

describe('Römische Zahlen als Absatz-Kurzform', () => {
  it('alleinstehende gültige römische Zahl (kein Vorgänger-Token) wird als zusatz/absatz mit roemischWert erkannt', () => {
    const tokens = tokenisiere('III');
    expect(tokens).toEqual([
      { art: 'zusatz', start: 0, ende: 3, wert: 'III', norm: 'absatz', roemischWert: 3 },
    ]);
  });

  it('römische Zahl unmittelbar nach einer Normzahl wird als Absatz-Angabe erkannt ("§ 5 III")', () => {
    const tokens = tokenisiere('§ 5 III');
    expect(tokens[2]).toEqual({
      art: 'zusatz',
      start: 4,
      ende: 7,
      wert: 'III',
      norm: 'absatz',
      roemischWert: 3,
    });
  });

  it('römische Zahl unmittelbar nach einem WORT-Token (Kurztitel-Fortsetzung, z.B. "SGB IV") wird NICHT als Absatz erkannt', () => {
    const tokens = tokenisiere('SGB IV');
    expect(tokens).toEqual([
      { art: 'wort', start: 0, ende: 3, wert: 'SGB' },
      { art: 'wort', start: 4, ende: 6, wert: 'IV' },
    ]);
  });

  it('ungültige römische Zahlen ("IIII", "VX") fallen auf generisches wort zurück statt einen (falschen) Wert zu erfinden', () => {
    expect(tokenisiere('IIII')).toEqual([{ art: 'wort', start: 0, ende: 4, wert: 'IIII' }]);
    expect(tokenisiere('VX')).toEqual([{ art: 'wort', start: 0, ende: 2, wert: 'VX' }]);
  });

  it('römische Zahl direkt nach Komma/Schrägstrich innerhalb einer offenen Norm wird ebenfalls als Absatz erkannt', () => {
    const tokens = tokenisiere('280, III');
    expect(tokens[2]).toMatchObject({ art: 'zusatz', norm: 'absatz', roemischWert: 3 });
  });

  it('Erkennung ist beidseitig verankert: nicht-römisches Präfix ("aIV") verhindert die Erkennung, bleibt generisches wort', () => {
    const tokens = tokenisiere('aIV');
    expect(tokens).toEqual([{ art: 'wort', start: 0, ende: 3, wert: 'aIV' }]);
  });

  it('Erkennung ist beidseitig verankert: nicht-römisches Suffix ("IVa") verhindert die Erkennung, bleibt generisches wort', () => {
    const tokens = tokenisiere('IVa');
    expect(tokens).toEqual([{ art: 'wort', start: 0, ende: 3, wert: 'IVa' }]);
  });
});

describe('Trennwort- und Bereichsgrenzen', () => {
  it.each(['und', 'sowie', 'oder', 'bzw.'])('angehängtes %s bleibt ein Trennwort', (wort) => {
    expect(tokenisiere(`5${wort} 7`).map((t) => [t.art, t.wert])).toEqual([
      ['zahl', '5'],
      ['komma', wort],
      ['zahl', '7'],
    ]);
  });

  it.each(['5 . - 7', '5 - BGB 7'])(
    'erkennt in %s keinen Bereichsstrich über fremden Text hinweg',
    (text) => {
      expect(tokenisiere(text).some((t) => t.art === 'komma')).toBe(false);
    },
  );
});

it.each(['VwGO', 'FeV', 'AufenthV', 'MÄ', 'IVa', 'aIV', 'iv'])(
  'liest %s vollständig als Wort statt als römische Absatzangabe',
  (text) => {
    expect(tokenisiere(text)).toEqual([{ art: 'wort', start: 0, ende: text.length, wert: text }]);
  },
);

describe('vollständige Bereichstrenner-Token', () => {
  it('fremdes Zeichen wird auch bei späterem Bereichsstrich übersprungen', () => {
    expect(tokenisiere('5*7-9')).toEqual([
      { art: 'zahl', start: 0, ende: 1, wert: '5', warOrdnungszahl: false },
      { art: 'zahl', start: 2, ende: 3, wert: '7', warOrdnungszahl: false },
      { art: 'komma', start: 3, ende: 4, wert: '-' },
      { art: 'zahl', start: 4, ende: 5, wert: '9', warOrdnungszahl: false },
    ]);
  });

  it.each(['-', '–', '—'])(
    'Bereichsstrich %s behält seine vollständige Originalspanne',
    (strich) => {
      expect(tokenisiere(`5 ${strich} 7`)[1]).toEqual({
        art: 'komma',
        start: 2,
        ende: 3,
        wert: strich,
      });
    },
  );
});

it.each(['cann', 'canons', 'canones', 'Kanones'])(
  'profilfreie Tokenisierung ordnet %s keinem Artikelpräfix zu',
  (wort) => {
    expect(tokenisiere(wort)).toEqual([{ art: 'wort', start: 0, ende: wort.length, wert: wort }]);
  },
);
