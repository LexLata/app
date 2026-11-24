// aktualisierungsNachricht.test.ts
//
// Unit-Tests für aktualisierungsNachricht.ts (aus gesetzImportGemeinsam.test.ts
// verschoben, als die reine Formatierungsfunktion in eine eigene,
// abhängigkeitsfreie Datei ausgelagert wurde – siehe dortiger Kopfkommentar).

import { describe, it, expect } from 'vitest';
import {
  baueAktualisierungsNachricht,
  type AktualisierungsKategorie,
} from './aktualisierungsNachricht';

describe('baueAktualisierungsNachricht', () => {
  function ergebnisse(...kategorien: [string, AktualisierungsKategorie][]) {
    return kategorien.map(([kurztitel, kategorie]) => ({ kurztitel, kategorie }));
  }

  it('gibt null zurück, wenn keine Ergebnisse vorliegen', () => {
    expect(baueAktualisierungsNachricht([])).toBeNull();
  });

  it('"Keine Neuerungen.", wenn alle Ergebnisse "unveraendert" sind', () => {
    expect(baueAktualisierungsNachricht(ergebnisse(['BGB', 'unveraendert']))).toBe(
      'Keine Neuerungen.',
    );
  });

  it('Singular "Datei aktualisiert: X." bei genau einem aktualisierten Gesetz', () => {
    expect(baueAktualisierungsNachricht(ergebnisse(['BGB', 'aktualisiert']))).toBe(
      'Datei aktualisiert: BGB.',
    );
  });

  it('Plural "Dateien aktualisiert: X und Y." bei mehreren aktualisierten Gesetzen', () => {
    expect(
      baueAktualisierungsNachricht(ergebnisse(['BGB', 'aktualisiert'], ['ZPO', 'aktualisiert'])),
    ).toBe('Dateien aktualisiert: BGB und ZPO.');
  });

  it('ignoriert unveränderte Einträge neben aktualisierten', () => {
    expect(
      baueAktualisierungsNachricht(
        ergebnisse(['BGB', 'aktualisiert'], ['StGB', 'unveraendert'], ['ZPO', 'aktualisiert']),
      ),
    ).toBe('Dateien aktualisiert: BGB und ZPO.');
  });
});
