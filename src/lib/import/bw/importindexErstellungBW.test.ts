import { describe, it, expect } from 'vitest';
import { formuliereErgebnistext, type ErgebnistextParams } from './importindexErstellungBW';

// Erwartete Outputs wurden gegen die Implementierung VOR der
// cognitive-complexity-Refaktorierung (Extraktion von formuliereErgebnistext
// aus erstelleLandesrechtBWImportindexNeu) verifiziert – siehe Absprache: neue
// Tests werden gegen echte Funktionsoutputs geschrieben, nicht analytisch
// hergeleitet.

function basisParams(overrides: Partial<ErgebnistextParams> = {}): ErgebnistextParams {
  return {
    geaendert: false,
    ersetztAnzahl: 0,
    ergaenztAnzahl: 0,
    permalinkFehlgeschlagen: 0,
    leerzeichenKorrigiertAnzahl: 0,
    markiert: 0,
    entmarkiert: 0,
    reihenfolgeGeaendert: false,
    ...overrides,
  };
}

describe('formuliereErgebnistext', () => {
  it('meldet knapp "keine Änderungen" wenn weder geändert noch Permalinks fehlgeschlagen', () => {
    expect(formuliereErgebnistext(basisParams())).toBe(
      'Importindex Landesrecht BW geprüft: keine Änderungen.',
    );
  });

  it('meldet fehlgeschlagene Permalinks auch ohne inhaltliche Änderung (nicht die Kurzform)', () => {
    expect(formuliereErgebnistext(basisParams({ permalinkFehlgeschlagen: 2 }))).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 2 Permalinks fehlgeschlagen.',
    );
  });

  it('verwendet Singular für genau 1 aktualisiertes/hinzugefügtes/fehlgeschlagenes Element', () => {
    expect(
      formuliereErgebnistext(
        basisParams({
          geaendert: true,
          ersetztAnzahl: 1,
          ergaenztAnzahl: 1,
          permalinkFehlgeschlagen: 1,
        }),
      ),
    ).toBe(
      'Importindex Landesrecht BW aktualisiert: 1 Gesetz aktualisiert, 1 hinzugefügt, 1 Permalink fehlgeschlagen.',
    );
  });

  it('verwendet Plural bei mehreren aktualisierten/hinzugefügten/fehlgeschlagenen Elementen', () => {
    expect(
      formuliereErgebnistext(
        basisParams({
          geaendert: true,
          ersetztAnzahl: 3,
          ergaenztAnzahl: 5,
          permalinkFehlgeschlagen: 2,
        }),
      ),
    ).toBe(
      'Importindex Landesrecht BW aktualisiert: 3 Gesetze aktualisiert, 5 hinzugefügt, 2 Permalinks fehlgeschlagen.',
    );
  });

  it('hängt Leerzeichen-Korrektur (Singular) an', () => {
    expect(
      formuliereErgebnistext(basisParams({ geaendert: true, leerzeichenKorrigiertAnzahl: 1 })),
    ).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks fehlgeschlagen. Ein Langtitel korrigiert.',
    );
  });

  it('hängt Leerzeichen-Korrektur (Plural) an', () => {
    expect(
      formuliereErgebnistext(basisParams({ geaendert: true, leerzeichenKorrigiertAnzahl: 4 })),
    ).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks fehlgeschlagen. 4 Langtitel korrigiert.',
    );
  });

  it('hängt "möglicherweise entfernt"-Markierung (Singular) an', () => {
    expect(formuliereErgebnistext(basisParams({ geaendert: true, markiert: 1 }))).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks fehlgeschlagen. 1 Eintrag als möglicherweise entfernt markiert.',
    );
  });

  it('hängt "möglicherweise entfernt"-Markierung (Plural) an', () => {
    expect(formuliereErgebnistext(basisParams({ geaendert: true, markiert: 3 }))).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks fehlgeschlagen. 3 Einträge als möglicherweise entfernt markiert.',
    );
  });

  it('hängt Entmarkierung (Singular) an', () => {
    expect(formuliereErgebnistext(basisParams({ geaendert: true, entmarkiert: 1 }))).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks fehlgeschlagen. 1 Markierung "möglicherweise entfernt" wieder aufgehoben.',
    );
  });

  it('hängt Entmarkierung (Plural) an', () => {
    expect(formuliereErgebnistext(basisParams({ geaendert: true, entmarkiert: 2 }))).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks fehlgeschlagen. 2 Markierungen "möglicherweise entfernt" wieder aufgehoben.',
    );
  });

  it('hängt Reihenfolge-Hinweis an', () => {
    expect(
      formuliereErgebnistext(basisParams({ geaendert: true, reihenfolgeGeaendert: true })),
    ).toBe(
      'Importindex Landesrecht BW aktualisiert: 0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks fehlgeschlagen. Reihenfolge aktualisiert.',
    );
  });

  it('kombiniert alle Zusatzhinweise in der festen Reihenfolge Leerzeichen/Markierung/Entmarkierung/Reihenfolge', () => {
    expect(
      formuliereErgebnistext(
        basisParams({
          geaendert: true,
          ersetztAnzahl: 2,
          ergaenztAnzahl: 1,
          permalinkFehlgeschlagen: 0,
          leerzeichenKorrigiertAnzahl: 1,
          markiert: 2,
          entmarkiert: 1,
          reihenfolgeGeaendert: true,
        }),
      ),
    ).toBe(
      'Importindex Landesrecht BW aktualisiert: 2 Gesetze aktualisiert, 1 hinzugefügt, 0 Permalinks fehlgeschlagen.' +
        ' Ein Langtitel korrigiert.' +
        ' 2 Einträge als möglicherweise entfernt markiert.' +
        ' 1 Markierung "möglicherweise entfernt" wieder aufgehoben.' +
        ' Reihenfolge aktualisiert.',
    );
  });
});
