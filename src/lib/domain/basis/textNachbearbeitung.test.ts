// textNachbearbeitung.test.ts
//
// Tests für textNachbearbeitung.ts (kolokiert, Vitest). Reine,
// dateizugriffsfreie String-Transformation – deckt beide Funktionen
// (schuetzeLeerzeichen für allgemeinen Text,
// schuetzeLeerzeichenZitat zusätzlich für römische Kurzformen in Normzitaten) sowie die undefined-Passthrough-Overloads ab.

import { describe, it, expect } from 'vitest';
import { schuetzeLeerzeichen, schuetzeLeerzeichenZitat } from './textNachbearbeitung';

describe('schuetzeLeerzeichen', () => {
  it('ersetzt das Leerzeichen zwischen "§" und einer Zahl durch \\u00A0', () => {
    expect(schuetzeLeerzeichen('§ 5')).toBe('§\u00A05');
  });

  it('ersetzt das Leerzeichen bei den gängigen Abkürzungen vor einer Zahl', () => {
    expect(schuetzeLeerzeichen('Artikel 12')).toBe('Artikel\u00A012');
    expect(schuetzeLeerzeichen('Art. 12')).toBe('Art.\u00A012');
    expect(schuetzeLeerzeichen('Absatz 3')).toBe('Absatz\u00A03');
    expect(schuetzeLeerzeichen('Abs. 3')).toBe('Abs.\u00A03');
    expect(schuetzeLeerzeichen('Satz 2')).toBe('Satz\u00A02');
    expect(schuetzeLeerzeichen('S. 2')).toBe('S.\u00A02');
    expect(schuetzeLeerzeichen('Nummer 1')).toBe('Nummer\u00A01');
    expect(schuetzeLeerzeichen('Nr. 1')).toBe('Nr.\u00A01');
    expect(schuetzeLeerzeichen('Abschnitt 4')).toBe('Abschnitt\u00A04');
  });

  it('ersetzt das Leerzeichen nach einer Aufzählungs-/Datumsnummer ("1. Januar")', () => {
    expect(schuetzeLeerzeichen('1. Januar')).toBe('1.\u00A0Januar');
  });

  it('wendet beide Regeln kombiniert in einem Text an', () => {
    expect(schuetzeLeerzeichen('§ 5 Abs. 2 Satz 1')).toBe('§\u00A05 Abs.\u00A02 Satz\u00A01');
  });

  it('lässt Text ohne betroffene Muster unverändert', () => {
    expect(schuetzeLeerzeichen('normaler Fließtext ohne Verweise')).toBe(
      'normaler Fließtext ohne Verweise',
    );
  });

  it('schützt Abkürzungen ohne Punkt auch im allgemeinen Text', () => {
    expect(schuetzeLeerzeichen('Abs 3')).toBe('Abs\u00a03');
    expect(schuetzeLeerzeichen('lit a')).toBe('lit\u00a0a');
  });

  it('gibt undefined bei undefined-Eingabe zurück (Passthrough)', () => {
    expect(schuetzeLeerzeichen(undefined)).toBeUndefined();
  });

  it('gibt einen leeren String bei leerem Eingabestring zurück', () => {
    expect(schuetzeLeerzeichen('')).toBe('');
  });
});

describe('schuetzeLeerzeichenZitat', () => {
  it('deckt zusätzlich Abkürzungen OHNE Punkt ab ("Abs 3", "Nr 1", "S 2")', () => {
    expect(schuetzeLeerzeichenZitat('Abs 3')).toBe('Abs\u00A03');
    expect(schuetzeLeerzeichenZitat('Nr 1')).toBe('Nr\u00A01');
    expect(schuetzeLeerzeichenZitat('S 2')).toBe('S\u00A02');
  });

  it('erkennt "lit"/"lit." vor einer Zahl oder einem Buchstaben', () => {
    expect(schuetzeLeerzeichenZitat('lit. 3')).toBe('lit.\u00A03');
    expect(schuetzeLeerzeichenZitat('lit 3')).toBe('lit\u00A03');
    expect(schuetzeLeerzeichenZitat('lit a')).toBe('lit\u00a0a');
  });

  it('deckt römische Ziffern I/V/X als eigenständige Abkürzungs-Token ab', () => {
    expect(schuetzeLeerzeichenZitat('I 2')).toBe('I\u00A02');
    expect(schuetzeLeerzeichenZitat('V 3')).toBe('V\u00A03');
    expect(schuetzeLeerzeichenZitat('X 4')).toBe('X\u00A04');
  });

  it('trifft I/V/X NICHT, wenn sie Teil eines längeren Wort-/Zeichentokens sind (Wortgrenzen)', () => {
    // "V" mitten in einem Wort ohne eigene Wortgrenzen ringsum:
    expect(schuetzeLeerzeichenZitat('xVx 2')).toBe('xVx 2');
    // "I" direkt gefolgt von einem weiteren Wortzeichen (keine rechte
    // Wortgrenze nach dem I):
    expect(schuetzeLeerzeichenZitat('Ia 2')).toBe('Ia 2');
    // "I" direkt nach einem weiteren Wortzeichen (keine linke Wortgrenze
    // vor dem I):
    expect(schuetzeLeerzeichenZitat('aI 2')).toBe('aI 2');
    // "IV" als zusammenhängendes Token: weder "I" noch "V" haben hier auf
    // beiden Seiten eine Wortgrenze:
    expect(schuetzeLeerzeichenZitat('IV 2')).toBe('IV 2');
  });

  it('deckt auch die im allgemeinen Fließtext abgedeckten Grundfälle weiterhin ab', () => {
    expect(schuetzeLeerzeichenZitat('§ 5')).toBe('§\u00A05');
    expect(schuetzeLeerzeichenZitat('1. Januar')).toBe('1.\u00A0Januar');
  });

  it('gibt undefined bei undefined-Eingabe zurück (Passthrough)', () => {
    expect(schuetzeLeerzeichenZitat(undefined)).toBeUndefined();
  });
});

it.each([
  'Buchstabe a',
  'Buchst. a',
  'lit. a',
  'lit a',
  'Abs. II',
  'Art 1',
  'Absätze 2',
  'Nummern 1',
  '§  1',
])('schützt zusätzlich %s in Zitaten', (text) => {
  expect(schuetzeLeerzeichenZitat(text)).toBe(text.replaceAll(' ', '\u00a0'));
});
it('erweitert römische Kurzformen wie II 1 nicht', () => {
  expect(schuetzeLeerzeichenZitat('II 1')).toBe('II 1');
});

describe.each([
  ['allgemeiner Text', schuetzeLeerzeichen],
  ['Normzitat', schuetzeLeerzeichenZitat],
] as const)('%s – gemeinsame Regeln (A1–A3)', (_modus, schuetzen) => {
  it.each([
    '§ 1',
    '§§ 1',
    'Art. 1',
    'Art 1',
    'Artikel 1',
    'Abs. 1',
    'Abs 1',
    'Abs. III',
    'Abs III',
    'Absatz IV',
    'Absätze II',
    'S. 1',
    'S 1',
    'Satz 1',
    'Nr. 1',
    'Nr 1',
    'Nummer 1',
    'Nummern 1',
    'Ziffer 1',
    'Ziffern 1',
    'Ziff. 1',
    'Ziff 1',
    'lit. a',
    'lit a',
    'lit. 1',
    'Buchst. a',
    'Buchstabe a',
    'Buchstaben a',
    'Abschnitt 1',
    'Gruppe 1',
    'Gr. 1',
    'Gr 1',
    'Variante 1',
    'Var. 1',
    'Var 1',
    'Halbsatz 1',
    'Hs. 1',
    'Hs 1',
    'Alternative 1',
    'Alt. 1',
    'Alt 1',
    'UAbs. 1',
    'UAbs 1',
    'Unterabsatz 1',
    'Erwägungsgrund 1',
    'Can. 1',
    'can. 1',
    'canon 1',
    'Canon 1',
    'CANON 1',
    'c. 1',
    'C. 1',
    'Kan. 1',
    'Kanon 1',
    'cann. 1',
    'Cann. 1',
    'canons 1',
    'canones 1',
    'cc. 1',
    'Kanones 1',
  ])('schützt %s', (text) => {
    expect(schuetzen(text)).toBe(text.replaceAll(' ', '\u00a0'));
  });

  it.each([
    'Erwägungsgrund',
    '§',
    'Abs.',
    'Can.',
    'Art. Wort',
    'Abs. Wort',
    'lit. ab',
    'Buchst. ab',
    'UAbs. III',
    'Can. a',
    'Abs. IIIa',
    'xArt. 1',
    'xArtikel 1',
    'xAbs. 1',
    'xAbsatz 1',
    'xSatz 1',
    'xNr. 1',
    'xNummer 1',
    'xZiff. 1',
    'xlit. a',
    'xBuchst. a',
    'xAbschnitt 1',
    'xGr. 1',
    'xVar. 1',
    'xHs. 1',
    'xAlt. 1',
    'xUAbs. 1',
    'xUnterabsatz 1',
    'xCan. 1',
    'xErwägungsgrund 1',
    'Artikels 1',
    'Artt 1',
  ])('lässt fehlende Werte und fremde Wortbestandteile unverändert: %s', (text) => {
    expect(schuetzen(text)).toBe(text);
  });

  it('bindet Gesetzeskürzel und die Zwischenräume zwischen Zitatteilen nicht an', () => {
    expect(schuetzen('§§ 1, 2 ZPO; Art. 229 § 3 EGBGB; § 9999 Abs. 1 ZPO')).toBe(
      '§§\u00a01, 2 ZPO; Art.\u00a0229 §\u00a03 EGBGB; §\u00a09999 Abs.\u00a01 ZPO',
    );
  });

  it.each(['§', 'Art.', 'Abs.', 'UAbs', 'Can.', 'Erwägungsgrund'])(
    'schützt alle gewöhnlichen Leerzeichen in gemischten Folgen nach %s',
    (praefix) => {
      const abstand = ' \u00a0  \u00a0 ';
      expect(schuetzen(`${praefix}${abstand}1`)).toBe(
        `${praefix}${'\u00a0'.repeat(abstand.length)}1`,
      );
    },
  );

  it.each(['Abs. III', 'lit. a', 'Buchst. a'])(
    'schützt gemischte Abstände auch bei Buchstaben und römischen Werten: %s',
    (text) => {
      expect(schuetzen(text.replace(' ', ' \u00a0  '))).toBe(text.replace(' ', '\u00a0'.repeat(4)));
    },
  );

  it.each(['\t', '\n', '\r\n', ' \t ', ' \n ', '\u2009'])(
    'respektiert andere Abstände und ausdrückliche Zeilenumbrüche: %j',
    (abstand) => {
      const text = `§${abstand}1 Abs.${abstand}III lit.${abstand}a Can.${abstand}1`;
      expect(schuetzen(text)).toBe(text);
    },
  );

  it('behält die Nummer-mit-Punkt-Zusatzregel exakt bei', () => {
    const text =
      '1. Januar; 1.  Januar; 1. \u00a0 Januar; 1.\u00a0 Januar; 1.\tJanuar; 1.\nJanuar; x1. Januar; 1. ';
    expect(schuetzen(text)).toBe(
      '1.\u00a0Januar; 1.\u00a0 Januar; 1.\u00a0\u00a0 Januar; 1.\u00a0 Januar; 1.\tJanuar; 1.\nJanuar; x1.\u00a0Januar; 1.\u00a0',
    );
  });
});

it('beschränkt die bisherigen römischen Kurzformen auf den Zitatweg (A2)', () => {
  const text = 'I  2 V \u00a0 3 X 4 II 1 IV 2 IX 3 XI 4 Ia 2 xVx 2';
  expect(schuetzeLeerzeichen(text)).toBe(text);
  expect(schuetzeLeerzeichenZitat(text)).toBe(
    'I\u00a0\u00a02 V\u00a0\u00a0\u00a03 X\u00a04 II 1 IV 2 IX 3 XI 4 Ia 2 xVx 2',
  );
});
