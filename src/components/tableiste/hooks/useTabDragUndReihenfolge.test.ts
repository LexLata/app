// useTabDragUndReihenfolge.test.ts
//
// Tests für ermittleZielFuerTabVerschieben, die reine Entscheidungslogik der
// Tab-Umsortierung während eines Drags (aus onMove ausgelagert). Der Rest
// des Hooks bleibt DOM-/Pointer-Event-gebundene Orchestrierung ohne eigene
// Tests (siehe Absprache) – nur diese kernige, jetzt DOM-freie Logik wird
// hier getestet.

import { describe, it, expect } from 'vitest';
import { ermittleZielFuerTabVerschieben } from './useTabDragUndReihenfolge';
import type { Tab } from '@/lib/domain/appTypes.ts';

function tab(id: string): Tab {
  return { id } as Tab;
}

describe('ermittleZielFuerTabVerschieben', () => {
  it('dragId nicht (mehr) in tabs vorhanden -> null (kein Absturz)', () => {
    const ziel = ermittleZielFuerTabVerschieben(
      [tab('a'), tab('b')],
      'nicht-vorhanden',
      [{ id: 'a', mitte: 100 }],
      50,
    );
    expect(ziel).toBeNull();
  });

  it('Cursor bewegt sich nach RECHTS über einen Tab, der weiter rechts steht -> dieser wird Ziel', () => {
    // Reihenfolge a(0) b(1) c(2), gezogen wird a; Cursor liegt rechts der
    // Mitte von b (Index 1 > dragIdx 0) -> b wird Ziel.
    const ziel = ermittleZielFuerTabVerschieben(
      [tab('a'), tab('b'), tab('c')],
      'a',
      [
        { id: 'a', mitte: 50 },
        { id: 'b', mitte: 150 },
        { id: 'c', mitte: 250 },
      ],
      160, // rechts von b's Mitte (150)
    );
    expect(ziel).toBe('b');
  });

  it('Cursor bewegt sich nach LINKS über einen Tab, der weiter links steht -> dieser wird Ziel', () => {
    // Gezogen wird c (Index 2); Cursor liegt links der Mitte von b (Index 1
    // < dragIdx 2) -> b wird Ziel.
    const ziel = ermittleZielFuerTabVerschieben(
      [tab('a'), tab('b'), tab('c')],
      'c',
      [
        { id: 'a', mitte: 50 },
        { id: 'b', mitte: 150 },
        { id: 'c', mitte: 250 },
      ],
      140, // links von b's Mitte (150)
    );
    expect(ziel).toBe('b');
  });

  it('Edge-Case: Cursor rechts von einem Tab, der weiter LINKS steht -> KEIN Ziel (Richtung passt nicht)', () => {
    // Gezogen wird c (Index 2), b steht links davon (Index 1 < 2) – die
    // Bedingung für "nach links tauschen" verlangt cursorX < mitte, hier
    // aber cursorX > mitte -> b ist kein gültiges Ziel.
    const ziel = ermittleZielFuerTabVerschieben(
      [tab('a'), tab('b'), tab('c')],
      'c',
      [
        { id: 'a', mitte: 50 },
        { id: 'b', mitte: 150 },
      ],
      160,
    );
    expect(ziel).toBeNull();
  });

  it('dragId selbst wird in tabPositionen übersprungen (kein Tausch mit sich selbst)', () => {
    const ziel = ermittleZielFuerTabVerschieben(
      [tab('a'), tab('b')],
      'a',
      [{ id: 'a', mitte: 500 }], // extreme Position, würde sonst evtl. matchen
      1000,
    );
    expect(ziel).toBeNull();
  });

  it('liefert den ERSTEN Treffer in tabPositionen-Reihenfolge, nicht alle möglichen', () => {
    // Sowohl b als auch c stehen rechts von a und der Cursor liegt rechts
    // beider Mitten – laut Dokumentation (erster Treffer) muss b gewinnen,
    // da es zuerst in tabPositionen steht.
    const ziel = ermittleZielFuerTabVerschieben(
      [tab('a'), tab('b'), tab('c')],
      'a',
      [
        { id: 'b', mitte: 150 },
        { id: 'c', mitte: 250 },
      ],
      300,
    );
    expect(ziel).toBe('b');
  });

  it('keine Position überschreitet die Bedingung -> null', () => {
    const ziel = ermittleZielFuerTabVerschieben(
      [tab('a'), tab('b')],
      'a',
      [{ id: 'b', mitte: 500 }],
      10, // weit links von b's Mitte, b steht aber rechts von a -> keine Bedingung erfüllt
    );
    expect(ziel).toBeNull();
  });
});
