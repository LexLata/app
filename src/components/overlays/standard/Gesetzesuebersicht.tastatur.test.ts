// Gesetzesuebersicht.tastatur.test.ts
//
// Tests für die reine Entscheidungslogik bestimmeTastaturAktion (kein DOM,
// kein React) – probiert gegen das Verhalten des ursprünglichen
// keydown-Handlers in Gesetzesuebersicht.tsx.

import { describe, it, expect } from 'vitest';
import { bestimmeTastaturAktion } from './Gesetzesuebersicht.tastatur';
import type { TastaturKontext } from './Gesetzesuebersicht.tastatur';

function kontext(overrides: Partial<TastaturKontext> & { taste: string }): TastaturKontext {
  return {
    metaKey: false,
    ctrlKey: false,
    zielIstInput: false,
    auswahlSchluessel: null,
    gefilterteSchluessel: [],
    recordingAktiv: false,
    ...overrides,
  };
}

describe('bestimmeTastaturAktion', () => {
  it('Edge-Case: während eine Kurzbefehl-Aufnahme aktiv ist, wird jede Taste ignoriert', () => {
    const k = kontext({ taste: 'Delete', auswahlSchluessel: '1', recordingAktiv: true });
    expect(bestimmeTastaturAktion(k)).toEqual({ typ: 'keine' });
  });

  describe('Löschen (Delete/Backspace)', () => {
    it('löst loeschen aus, wenn eine Zeile ausgewählt ist und der Fokus nicht im Suchfeld liegt', () => {
      expect(bestimmeTastaturAktion(kontext({ taste: 'Delete', auswahlSchluessel: '1' }))).toEqual({
        typ: 'loeschen',
        schluessel: '1',
      });
      expect(
        bestimmeTastaturAktion(kontext({ taste: 'Backspace', auswahlSchluessel: '1' })),
      ).toEqual({
        typ: 'loeschen',
        schluessel: '1',
      });
    });

    it('keine Aktion ohne Auswahl', () => {
      expect(bestimmeTastaturAktion(kontext({ taste: 'Delete', auswahlSchluessel: null }))).toEqual(
        {
          typ: 'keine',
        },
      );
    });

    it('Edge-Case: keine Aktion, wenn der Fokus im Suchfeld liegt (Backspace soll dort normal löschen)', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({ taste: 'Backspace', auswahlSchluessel: '1', zielIstInput: true }),
        ),
      ).toEqual({ typ: 'keine' });
    });
  });

  describe('Öffnen (Enter)', () => {
    it('löst oeffnen aus, wenn eine Zeile ausgewählt ist', () => {
      expect(bestimmeTastaturAktion(kontext({ taste: 'Enter', auswahlSchluessel: '1' }))).toEqual({
        typ: 'oeffnen',
        schluessel: '1',
      });
    });

    it('Edge-Case: Enter im Suchfeld öffnet trotzdem (kein zielIstInput-Ausschluss wie bei Delete)', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({ taste: 'Enter', auswahlSchluessel: '1', zielIstInput: true }),
        ),
      ).toEqual({ typ: 'oeffnen', schluessel: '1' });
    });

    it('keine Aktion ohne Auswahl', () => {
      expect(bestimmeTastaturAktion(kontext({ taste: 'Enter', auswahlSchluessel: null }))).toEqual({
        typ: 'keine',
      });
    });
  });

  describe('Navigation (ArrowUp/ArrowDown)', () => {
    it('springt von keiner Auswahl auf den ersten Eintrag (ArrowDown)', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({
            taste: 'ArrowDown',
            auswahlSchluessel: null,
            gefilterteSchluessel: ['a', 'b', 'c'],
          }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: 'a' });
    });

    it('springt von keiner Auswahl auf den ersten Eintrag (ArrowUp)', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({
            taste: 'ArrowUp',
            auswahlSchluessel: null,
            gefilterteSchluessel: ['a', 'b', 'c'],
          }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: 'a' });
    });

    it('bewegt die Auswahl um eins nach unten', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({
            taste: 'ArrowDown',
            auswahlSchluessel: 'a',
            gefilterteSchluessel: ['a', 'b', 'c'],
          }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: 'b' });
    });

    it('bewegt die Auswahl um eins nach oben', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({
            taste: 'ArrowUp',
            auswahlSchluessel: 'c',
            gefilterteSchluessel: ['a', 'b', 'c'],
          }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: 'b' });
    });

    it('Edge-Case: ArrowDown am Ende der Liste bleibt auf dem letzten Eintrag stehen', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({
            taste: 'ArrowDown',
            auswahlSchluessel: 'c',
            gefilterteSchluessel: ['a', 'b', 'c'],
          }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: 'c' });
    });

    it('Edge-Case: ArrowUp am Anfang der Liste bleibt auf dem ersten Eintrag stehen', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({
            taste: 'ArrowUp',
            auswahlSchluessel: 'a',
            gefilterteSchluessel: ['a', 'b', 'c'],
          }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: 'a' });
    });

    it('Edge-Case: leere gefilterte Liste -> navigieren mit neuerSchluessel null (Handler ruft trotzdem preventDefault)', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({ taste: 'ArrowDown', auswahlSchluessel: null, gefilterteSchluessel: [] }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: null });
    });

    it('Edge-Case: ausgewählte id ist nicht (mehr) in gefilterteSchluessel enthalten -> Sprung auf den ersten Eintrag', () => {
      // indexOf liefert -1 -> idx-1/+1 rechnet ausgehend von -1
      expect(
        bestimmeTastaturAktion(
          kontext({ taste: 'ArrowDown', auswahlSchluessel: 'x', gefilterteSchluessel: ['a', 'b'] }),
        ),
      ).toEqual({ typ: 'navigieren', neuerSchluessel: 'a' });
    });

    it('keine Aktion im Suchfeld', () => {
      expect(
        bestimmeTastaturAktion(
          kontext({ taste: 'ArrowDown', gefilterteSchluessel: ['a'], zielIstInput: true }),
        ),
      ).toEqual({ typ: 'keine' });
    });
  });

  it('unbekannte Taste löst keine Aktion aus', () => {
    expect(bestimmeTastaturAktion(kontext({ taste: 'a', auswahlSchluessel: '1' }))).toEqual({
      typ: 'keine',
    });
  });
});
