// Prüft die reine Scroll-Nachführung unabhängig von DOM-Messung und Navigation.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { aktivesElementNachfuehren } from './aktivesElementNachfuehren';

const titel = (id: string) => ({ id, titelSichtbar: true, koerperSichtbar: false });
const koerper = (id: string) => ({ id, titelSichtbar: false, koerperSichtbar: true });
const unsichtbar = (id: string) => ({ id, titelSichtbar: false, koerperSichtbar: false });

describe('aktivesElementNachfuehren', () => {
  it.each([titel('aktiv'), koerper('aktiv')])(
    'behält ein sichtbares aktives Element bei: %o',
    (aktiv) => {
      expect(aktivesElementNachfuehren('aktiv', [titel('vorher'), aktiv])).toBe('aktiv');
    },
  );

  it.each(['001', 'para-2'])(
    'wählt den obersten sichtbaren Titel einer Überschrift oder Norm (%s) vor einem Körper',
    (id) => {
      expect(
        aktivesElementNachfuehren('aktiv', [
          unsichtbar('aktiv'),
          koerper('para-1'),
          titel(id),
          titel('weiter'),
        ]),
      ).toBe(id);
    },
  );

  it('wählt ohne sichtbaren Titel den obersten sichtbaren Normkörper', () => {
    expect(
      aktivesElementNachfuehren('aktiv', [
        unsichtbar('aktiv'),
        koerper('erste'),
        koerper('zweite'),
      ]),
    ).toBe('erste');
  });

  it('behält ohne sichtbares Element die alte ID bei, auch bei leerer Liste', () => {
    expect(aktivesElementNachfuehren('aktiv', [unsichtbar('aktiv')])).toBe('aktiv');
    expect(aktivesElementNachfuehren('aktiv', [])).toBe('aktiv');
    expect(aktivesElementNachfuehren(null, [])).toBeNull();
  });

  it('führt auch eine fehlende oder noch unbekannte aktive ID nach', () => {
    expect(aktivesElementNachfuehren('fehlt', [titel('ziel')])).toBe('ziel');
    expect(aktivesElementNachfuehren(null, [koerper('ziel')])).toBe('ziel');
  });

  const sichtbarkeitsliste = fc.uniqueArray(
    fc.record({ id: fc.string(), titelSichtbar: fc.boolean(), koerperSichtbar: fc.boolean() }),
    { selector: (element) => element.id },
  );

  it('liefert stets eine sichtbare oder die alte ID', () => {
    fc.assert(
      fc.property(sichtbarkeitsliste, fc.option(fc.string(), { nil: null }), (liste, alt) => {
        const ergebnis = aktivesElementNachfuehren(alt, liste);
        expect(
          ergebnis === alt ||
            liste.some(
              (element) =>
                element.id === ergebnis && (element.titelSichtbar || element.koerperSichtbar),
            ),
        ).toBe(true);
      }),
    );
  });

  it('behält jedes sichtbare aktive Element unabhängig von den anderen Elementen bei', () => {
    fc.assert(
      fc.property(sichtbarkeitsliste, (liste) => {
        for (const element of liste) {
          if (element.titelSichtbar || element.koerperSichtbar) {
            expect(aktivesElementNachfuehren(element.id, liste)).toBe(element.id);
          }
        }
      }),
    );
  });
});
