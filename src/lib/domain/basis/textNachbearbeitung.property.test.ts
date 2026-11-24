// textNachbearbeitung.property.test.ts
//
// Property-based Test (fast-check) für die eine Invariante, auf die
// lib/domain/textpfad/textpfad.rueckwaerts.ts sich
// verlässt (siehe dortiger Kommentar bei
// schuetzeLeerzeichen/schuetzeLeerzeichenZitat): beide Funktionen ERSETZEN
// nur einzelne Leerzeichen durch \u00A0 (jeweils ein Zeichen durch ein
// Zeichen), fügen also nie Zeichen hinzu oder entfernen welche. Bricht das,
// zählt textAnTextpfad an anderen Positionen als beim Erstellen einer
// Markierung – ein stiller, schwer zu findender Bug. Deshalb hier separat
// als Property abgesichert, nicht nur über die Beispiele in
// textNachbearbeitung.test.ts.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { schuetzeLeerzeichen, schuetzeLeerzeichenZitat } from './textNachbearbeitung';

describe('schuetzeLeerzeichen/schuetzeLeerzeichenZitat – Property: Zeichenzahl bleibt erhalten', () => {
  it('für JEDEN String: Ergebnislänge === Eingabelänge (nur 1:1-Zeichenersetzung, kein Hinzufügen/Entfernen)', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(schuetzeLeerzeichen(text).length).toBe(text.length);
        expect(schuetzeLeerzeichenZitat(text).length).toBe(text.length);
      }),
    );
  });

  it('ist idempotent (zweifache Anwendung === einfache Anwendung), auch bei gemischten Leerzeichenfolgen', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const einmal = schuetzeLeerzeichen(text);
        expect(schuetzeLeerzeichen(einmal)).toBe(einmal);
        const einmalZitat = schuetzeLeerzeichenZitat(text);
        expect(schuetzeLeerzeichenZitat(einmalZitat)).toBe(einmalZitat);
      }),
    );
  });
});

describe.each([
  ['allgemeiner Text', schuetzeLeerzeichen],
  ['Normzitat', schuetzeLeerzeichenZitat],
] as const)('%s – Texttreue (A3)', (_modus, schuetzen) => {
  const abstand = fc
    .array(fc.constantFrom(' ', '\u00a0'), { minLength: 1, maxLength: 20 })
    .map((zeichen) => zeichen.join(''));
  const normteil = fc.constantFrom(
    ['§', '1'],
    ['§§', '2'],
    ['Art', '229'],
    ['Abs.', 'III'],
    ['lit.', 'a'],
    ['Buchst.', 'b'],
    ['UAbs', '3'],
    ['Can.', '4'],
    ['Erwägungsgrund', '5'],
  );

  it('schützt sämtliche gewöhnlichen Leerzeichen zwischen erkanntem Präfix und Wert', () => {
    fc.assert(
      fc.property(normteil, abstand, ([praefix, wert], raeume) => {
        const text = `${praefix}${raeume}${wert}`;
        expect(schuetzen(text)).toBe(`${praefix}${'\u00a0'.repeat(raeume.length)}${wert}`);
      }),
    );
  });

  it('erhält Positionen, sämtliche anderen Zeichen und normalisierten Originaltext', () => {
    fc.assert(
      fc.property(
        fc.string(),
        normteil,
        abstand,
        fc.string(),
        (anfang, [praefix, wert], raeume, ende) => {
          const text = `${anfang} ${praefix}${raeume}${wert} ${ende}`;
          const ergebnis = schuetzen(text);
          expect(ergebnis.length).toBe(text.length);
          expect(ergebnis.replaceAll('\u00a0', ' ')).toBe(text.replaceAll('\u00a0', ' '));
          for (let i = 0; i < text.length; i++) {
            if (text[i] !== ' ') expect(ergebnis[i]).toBe(text[i]);
            else expect([' ', '\u00a0']).toContain(ergebnis[i]);
          }
          expect(schuetzen(ergebnis)).toBe(ergebnis);
        },
      ),
    );
  });
});
