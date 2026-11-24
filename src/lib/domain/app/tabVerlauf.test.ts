// tabVerlauf.test.ts
//
// Tests für tabVerlauf.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// Logik auf TabVerlauf – deckt sowohl die Grundregeln (Dedupe, Zeiger-
// Reset) als auch das dokumentierte "Zeiger stand vorne, neuer Eintrag
// kommt hinzu"-Zusammenspiel zwischen verlaufEintragHinzufuegen und
// verlaufSchrittNavigieren ab.

import { describe, it, expect, assert } from 'vitest';
import {
  leererVerlauf,
  verlaufEintragHinzufuegen,
  verlaufSchrittNavigieren,
  verlaufSprung,
  verlaufAktivierungMelden,
  verlaufPfeilzustaende,
  verlaufPositionSetzen,
} from '@/lib/domain/app/tabVerlauf';
import type { VerlaufEintrag } from '@/lib/domain/appTypes';

function eintrag(xmlId: string, kurztitel = 'g1'): VerlaufEintrag {
  return { gesetzesreferenz: { kurztitel, normgeber: 'de-bund' }, xmlId };
}

describe('leererVerlauf', () => {
  it('liefert eine leere Eintragsliste mit Zeiger 0', () => {
    expect(leererVerlauf()).toEqual({ eintraege: [], position: 0 });
  });
});

describe('verlaufEintragHinzufuegen', () => {
  it('fügt einen ersten Eintrag hinzu, Zeiger bleibt 0', () => {
    const v = verlaufEintragHinzufuegen(leererVerlauf(), eintrag('433'));
    expect(v).toEqual({ eintraege: [eintrag('433')], position: 0 });
  });

  it('neue Einträge werden vorne eingefügt (Index 0 = neuester)', () => {
    let v = leererVerlauf();
    v = verlaufEintragHinzufuegen(v, eintrag('A'));
    v = verlaufEintragHinzufuegen(v, eintrag('B'));
    expect(v.eintraege).toEqual([eintrag('B'), eintrag('A')]);
    expect(v.position).toBe(0);
  });

  it('Dedupe: derselbe Eintrag (Gesetzesreferenz + XML-ID) erneut hinzugefügt wird nicht dupliziert, sondern nach vorne verschoben', () => {
    let v = leererVerlauf();
    v = verlaufEintragHinzufuegen(v, eintrag('A'));
    v = verlaufEintragHinzufuegen(v, eintrag('B'));
    v = verlaufEintragHinzufuegen(v, eintrag('A'));
    expect(v.eintraege).toEqual([eintrag('A'), eintrag('B')]);
  });

  it('Dedupe wirkt NUR bei gleicher Gesetzesreferenz UND gleicher XML-ID (unterschiedliches Gesetz mit gleicher xmlId bleibt eigener Eintrag)', () => {
    let v = leererVerlauf();
    v = verlaufEintragHinzufuegen(v, eintrag('1', 'g1'));
    v = verlaufEintragHinzufuegen(v, eintrag('1', 'g2'));
    expect(v.eintraege).toEqual([eintrag('1', 'g2'), eintrag('1', 'g1')]);
  });

  it('EDGE CASE: ist der Zeiger vor dem Hinzufügen > 0, wird der Eintrag AN der Zeiger-Position zuerst nach vorne verschoben (er war die zuletzt betrachtete Norm)', () => {
    let v = leererVerlauf();
    v = verlaufEintragHinzufuegen(v, eintrag('A'));
    v = verlaufEintragHinzufuegen(v, eintrag('B'));
    v = verlaufEintragHinzufuegen(v, eintrag('C'));
    // v.eintraege = [C, B, A], Zeiger auf 0
    const nav = verlaufSchrittNavigieren(v, 'zurueck'); // -> B, Zeiger auf 1
    expect(nav?.verlauf.position).toBe(1);

    const vNeu = verlaufEintragHinzufuegen(nav!.verlauf, eintrag('D'));
    // B (an der alten Zeiger-Position 1) wird zuerst nach vorne geholt,
    // DANN wird D eingefügt (und verdrängt B wieder an Position 1).
    expect(vNeu.eintraege).toEqual([eintrag('D'), eintrag('B'), eintrag('C'), eintrag('A')]);
    expect(vNeu.position).toBe(0);
  });

  it('Zeiger wird nach dem Hinzufügen IMMER auf 0 zurückgesetzt, auch wenn er vorher weit hinten stand', () => {
    let v = leererVerlauf();
    v = verlaufEintragHinzufuegen(v, eintrag('A'));
    v = verlaufEintragHinzufuegen(v, eintrag('B'));
    const nav = verlaufSchrittNavigieren(v, 'zurueck');
    const vNeu = verlaufEintragHinzufuegen(nav!.verlauf, eintrag('C'));
    expect(vNeu.position).toBe(0);
  });

  it('mutiert den übergebenen verlauf NICHT (gibt ein neues Objekt zurück)', () => {
    const v = leererVerlauf();
    const vNeu = verlaufEintragHinzufuegen(v, eintrag('A'));
    expect(v.eintraege).toEqual([]);
    expect(vNeu).not.toBe(v);
  });
});

describe('verlaufSchrittNavigieren', () => {
  function verlaufMitDreiEintraegen() {
    let v = leererVerlauf();
    v = verlaufEintragHinzufuegen(v, eintrag('A'));
    v = verlaufEintragHinzufuegen(v, eintrag('B'));
    v = verlaufEintragHinzufuegen(v, eintrag('C'));
    return v; // eintraege: [C, B, A], position 0
  }

  it('"zurueck" bewegt sich zu älteren Einträgen (höherer Index)', () => {
    const r = verlaufSchrittNavigieren(verlaufMitDreiEintraegen(), 'zurueck');
    expect(r?.ziel).toEqual(eintrag('B'));
    expect(r?.verlauf.position).toBe(1);
  });

  it('mehrfaches "zurueck" bewegt sich schrittweise weiter zurück', () => {
    const v = verlaufMitDreiEintraegen();
    let r = verlaufSchrittNavigieren(v, 'zurueck');
    expect(r?.ziel).toEqual(eintrag('B'));
    r = verlaufSchrittNavigieren(r!.verlauf, 'zurueck');
    expect(r?.ziel).toEqual(eintrag('A'));
  });

  it('"zurueck" am hinteren Rand (ältester Eintrag erreicht) gibt null zurück', () => {
    const v = verlaufMitDreiEintraegen();
    let r = verlaufSchrittNavigieren(v, 'zurueck');
    r = verlaufSchrittNavigieren(r!.verlauf, 'zurueck'); // Position 2 = A, letzter Eintrag
    const rEnde = verlaufSchrittNavigieren(r!.verlauf, 'zurueck');
    expect(rEnde).toBeNull();
  });

  it('"vorwaerts" bewegt sich zu neueren Einträgen (niedrigerer Index)', () => {
    const v = verlaufMitDreiEintraegen();
    const zurueck = verlaufSchrittNavigieren(v, 'zurueck');
    const vorwaerts = verlaufSchrittNavigieren(zurueck!.verlauf, 'vorwaerts');
    expect(vorwaerts?.ziel).toEqual(eintrag('C'));
    expect(vorwaerts?.verlauf.position).toBe(0);
  });

  it('"vorwaerts" am vorderen Rand (Zeiger bereits 0) gibt null zurück', () => {
    const r = verlaufSchrittNavigieren(verlaufMitDreiEintraegen(), 'vorwaerts');
    expect(r).toBeNull();
  });

  it('gibt null zurück bei undefined verlauf (z.B. Tab ohne jede Historie)', () => {
    expect(verlaufSchrittNavigieren(undefined, 'zurueck')).toBeNull();
  });

  it('gibt null zurück bei leerem Verlauf', () => {
    expect(verlaufSchrittNavigieren(leererVerlauf(), 'zurueck')).toBeNull();
    expect(verlaufSchrittNavigieren(leererVerlauf(), 'vorwaerts')).toBeNull();
  });

  it('VERÄNDERT die Eintragsliste selbst NICHT (nur der Zeiger bewegt sich, keine Umsortierung)', () => {
    const v = verlaufMitDreiEintraegen();
    const r = verlaufSchrittNavigieren(v, 'zurueck');
    expect(r?.verlauf.eintraege).toBe(v.eintraege); // dieselbe Referenz, unverändert
  });

  it('mutiert den übergebenen verlauf NICHT (gibt ein neues Objekt zurück)', () => {
    const v = verlaufMitDreiEintraegen();
    verlaufSchrittNavigieren(v, 'zurueck');
    expect(v.position).toBe(0); // unverändert
  });
});

it('dedupliziert nach Referenz unabhängig von Schreibweise und trennt Normgeber', () => {
  const bund = { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' }, xmlId: 'p1' };
  const bw = { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bw' }, xmlId: 'p1' };
  const erneut = { gesetzesreferenz: { kurztitel: 'x', normgeber: 'de-bund' }, xmlId: 'p1' };
  let verlauf = verlaufEintragHinzufuegen(leererVerlauf(), bund);
  verlauf = verlaufEintragHinzufuegen(verlauf, bw);
  verlauf = verlaufEintragHinzufuegen(verlauf, erneut);
  expect(verlauf).toEqual({ eintraege: [erneut, bw], position: 0 });
});

describe('Verlaufsregeln für aktive Elemente', () => {
  const basis = { eintraege: [eintrag('C'), eintrag('B'), eintrag('A')], position: 0 };
  it('trägt eine abgewichene Stelle vor dem Sprungziel nach und löscht die Marke', () => {
    const v = verlaufSprung(
      {
        ...basis,
        aktivesElement: eintrag('D'),
        rueckkehrmarke: { eintrag: eintrag('E'), position: 0 },
      },
      eintrag('X'),
    );
    expect(v.eintraege.map((e) => e.xmlId)).toEqual(['X', 'D', 'C', 'B', 'A']);
    expect(v.rueckkehrmarke).toBeUndefined();
  });
  it('verwendet beim Verweisklick ausschließlich die Ausgangsstelle', () => {
    expect(
      verlaufSprung(
        { ...basis, aktivesElement: eintrag('D') },
        eintrag('X'),
        eintrag('E'),
      ).eintraege.map((e) => e.xmlId),
    ).toEqual(['X', 'E', 'C', 'B', 'A']);
  });
  it('kehrt von einer abgewichenen Stelle über die Marke zurück', () => {
    const v = { ...basis, aktivesElement: eintrag('D') };
    const zurueck = verlaufSchrittNavigieren(v, 'zurueck');

    assert(zurueck);
    expect(zurueck.ziel).toEqual(eintrag('C'));
    expect(zurueck.verlauf.position).toBe(0);
    expect(zurueck.verlauf.eintraege).toBe(v.eintraege);
    const vor = verlaufSchrittNavigieren(zurueck.verlauf, 'vorwaerts');

    assert(vor);
    expect(vor.ziel).toEqual(eintrag('D'));
    expect(vor.verlauf.rueckkehrmarke).toBeUndefined();
  });
  it('bindet die Marke an die Zeigerposition', () => {
    const a = verlaufSchrittNavigieren({ ...basis, aktivesElement: eintrag('D') }, 'zurueck');

    assert(a);
    const b = verlaufSchrittNavigieren(a.verlauf, 'zurueck');

    assert(b);
    const c = verlaufSchrittNavigieren(b.verlauf, 'vorwaerts');

    assert(c);
    expect(c.ziel).toEqual(eintrag('C'));
    expect(verlaufSchrittNavigieren(c.verlauf, 'vorwaerts')?.ziel).toEqual(eintrag('D'));
  });
  it('setzt bei Overlayauswahl die Marke an den neuen Zeiger', () => {
    const v = verlaufPositionSetzen({ ...basis, aktivesElement: eintrag('D') }, 2);

    assert(v);
    expect(v.verlauf.rueckkehrmarke).toEqual({ eintrag: eintrag('D'), position: 2 });
    expect(v.verlauf.eintraege).toBe(basis.eintraege);
  });
  it('Schritte löschen die Marke, vorgegebenes Echo erhält sie', () => {
    const v = { ...basis, rueckkehrmarke: { eintrag: eintrag('D'), position: 0 } };
    expect(verlaufAktivierungMelden(v, eintrag('E'), 'schritt').rueckkehrmarke).toBeUndefined();
    expect(verlaufAktivierungMelden(v, eintrag('E'), 'vorgegeben').rueckkehrmarke).toEqual(
      v.rueckkehrmarke,
    );
  });
  it('liefert passende Pfeile für abgewichene und leere Verläufe', () => {
    expect(verlaufPfeilzustaende({ ...basis, aktivesElement: eintrag('D') })).toEqual({
      kannZurueck: true,
      kannVorwaerts: false,
    });
    expect(verlaufPfeilzustaende({ ...leererVerlauf(), aktivesElement: eintrag('D') })).toEqual({
      kannZurueck: false,
      kannVorwaerts: false,
    });
    expect(
      verlaufSchrittNavigieren({ ...basis, position: 1, aktivesElement: eintrag('D') }, 'vorwaerts')
        ?.ziel,
    ).toEqual(eintrag('C'));
  });
  it('kürzt auf 100 neueste Einträge, auch bei Nachtragen', () => {
    let v = leererVerlauf();
    for (let i = 0; i < 101; i++) v = verlaufEintragHinzufuegen(v, eintrag(String(i)));
    expect(v.eintraege).toHaveLength(100);
    expect(v.eintraege.at(-1)?.xmlId).toBe('1');
    const neu = verlaufSprung({ ...v, aktivesElement: eintrag('D') }, eintrag('X'));
    expect(neu.eintraege).toHaveLength(100);
    expect(neu.eintraege.at(-1)?.xmlId).toBe('3');
  });
  it('charakterisiert die Reihenfolge aus V1', () => {
    const v = {
      eintraege: Array.from({ length: 10 }, (_, i) => eintrag(String(10 - i))),
      position: 5,
    };
    expect(
      verlaufSprung(v, eintrag('X'))
        .eintraege.slice()
        .reverse()
        .map((e) => e.xmlId),
    ).toEqual(['1', '2', '3', '4', '6', '7', '8', '9', '10', '5', 'X']);
  });
});

it('trägt bei unbekannter oder identischer aktiver Stelle nichts nach', () => {
  const v = { eintraege: [eintrag('B'), eintrag('A')], position: 1 };
  expect(verlaufSprung(v, eintrag('X')).eintraege).toEqual([
    eintrag('X'),
    eintrag('A'),
    eintrag('B'),
  ]);
  expect(verlaufSprung({ ...v, aktivesElement: eintrag('A') }, eintrag('X')).eintraege).toEqual([
    eintrag('X'),
    eintrag('A'),
    eintrag('B'),
  ]);
});

it('verschiebt den Eintrag am Zeiger ohne die Länge an der Grenze zu erhöhen', () => {
  const eintraege = Array.from({ length: 100 }, (_, i) => eintrag(String(i)));
  const ziel = eintraege[25];
  assert(ziel);
  const v = verlaufEintragHinzufuegen({ eintraege, position: 50 }, ziel);
  expect(v.eintraege).toHaveLength(100);
  expect(v.eintraege.slice(0, 2)).toEqual([eintraege[25], eintraege[50]]);
});

it('lässt einen Sprung auf das bereits aktive Ziel vollständig unverändert', () => {
  const ziel = eintrag('D');
  const v = {
    eintraege: [eintrag('C'), eintrag('B'), eintrag('A')],
    position: 1,
    aktivesElement: ziel,
    rueckkehrmarke: { eintrag: eintrag('E'), position: 1 },
  };
  expect(verlaufSprung(v, ziel)).toBe(v);
  expect(verlaufSprung(v, ziel, eintrag('F'))).toBe(v);
});
