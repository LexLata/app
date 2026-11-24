// textpfad.test.ts
//
// Tests für textpfad.ts (kolokiert, Vitest). Deckt NUR blattPfad()
// ab – eine reine Element→Textpfad-Zuordnung (liest ausschließlich
// data-*-Attribute), testbar über linkedom-erzeugte Elemente im bestehenden
// Node-Testsetup (siehe src/test/setupNode.ts), ohne neue Abhängigkeiten.
//
// Auswahlgrenzen werden getrennt in textpfad.auswahl.test.ts mit
// jsdom geprüft. Dort werden die standardisierten DOM-Range-Operationen
// verwendet, keine selbst vereinfachten Grenzvergleiche. Welche Grenzknoten
// eine WebView beim Ziehen tatsächlich liefert, bleibt eine Desktop-Prüfung.

import { bereichPfad, normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, it, expect } from 'vitest';
import { DOMParser } from 'linkedom';
import { blattPfad } from '@/lib/domain/textpfad/textpfad';

function blatt(attribute: Record<string, string | null>): Element {
  const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
  const el = doc.querySelector('div')!;
  for (const [name, wert] of Object.entries(attribute)) {
    if (wert !== null) el.setAttribute(name, wert);
  }
  return el as unknown as Element;
}

describe('Bereich der Textpfad', () => {
  it.each(['amtlicherTitel', 'nichtamtlicherTitel', 'bezeichnung'] as const)(
    'liest data-bereich=%s',
    (bereich) => {
      expect(blattPfad(blatt({ 'data-bereich': bereich }))).toEqual(bereichPfad(bereich));
    },
  );
  it('lehnt unbekannte Bereiche ab', () => {
    expect(blattPfad(blatt({ 'data-bereich': 'zusatz' }))).toBeUndefined();
  });
});

describe('blattPfad', () => {
  it('Element ohne jedes data-Attribut ergibt einen leeren Textpfad', () => {
    expect(blattPfad(blatt({}))).toEqual(normtextPfad({}));
  });

  it('liest alle Felder aus den entsprechenden data-Attributen', () => {
    const el = blatt({
      'data-absatz': '(1)',
      'data-unterabsatz': '[2]',
      'data-satz': '1',
      'data-satz-in-eintrag': '3',
      'data-eintraege': JSON.stringify([{ ebene: 'nummer', bezeichnung: '1.' }]),
    });
    expect(blattPfad(el)).toEqual(
      normtextPfad({
        absatz: '(1)',
        unterabsatz: '[2]',
        satz: 1,
        satzInEintrag: 3,
        eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
      }),
    );
  });

  it('EDGE CASE: leeres String-Attribut ("") gilt als NICHT gesetzt (Attribut-Wert ist falsy)', () => {
    // data-absatz="" ⇒ getAttribute liefert "" (falsy) ⇒ pfad.absatz bleibt
    // unset. Betrifft nur die Wert-tragenden Attribute (absatz/unterabsatz/
    // satz/satzInEintrag/eintraege/bereich).
    expect(blattPfad(blatt({ 'data-absatz': '' }))).toEqual(normtextPfad({}));
  });

  it('EDGE CASE: data-satz="0" bleibt als echte 0 erhalten (String "0" ist selbst truthy, nur der numerische Wert ist 0)', () => {
    expect(blattPfad(blatt({ 'data-satz': '0' }))).toEqual(normtextPfad({ satz: 0 }));
  });

  it('leerer vorhandener Bereich ist ungültig', () => {
    expect(blattPfad(blatt({ 'data-bereich': '' }))).toBeUndefined();
  });

  it('data-eintraege wird als JSON geparst (Mehrfach-Kette)', () => {
    const kette: import('@/lib/domain/gesetzTypes').TextpfadEintrag[] = [
      { ebene: 'nummer', bezeichnung: '1.' },
      { ebene: 'litera', bezeichnung: 'a)', wiederholung: 1 },
    ];
    const el = blatt({ 'data-eintraege': JSON.stringify(kette) });
    expect(blattPfad(el)).toEqual(normtextPfad({ eintraege: kette }));
  });

  it('fehlendes data-eintraege-Attribut führt zu KEINEM eintraege-Feld (nicht zu einem leeren Array)', () => {
    expect(blattPfad(blatt({}))).not.toHaveProperty('eintraege');
  });
});

it('liest den Wiederholungsindex auch ohne Absatzbezeichnung', () => {
  expect(blattPfad(blatt({ 'data-absatz-wiederholung': '2' }))).toEqual(
    normtextPfad({ absatzWiederholung: 2 }),
  );
});
