// exportSpeicher.property.test.ts
//
// Property-basierter Test (fast-check) für ermittleZipName: die
// GRUPPEN_ANZEIGE-Lookup-Tabelle in exportSpeicher.ts hat 8 Einträge, aber
// die bisherigen Beispiel-Tests riefen ermittleZipName bei genau einer
// Gruppe nur mit 'gesetze' bzw. 'favoriten' auf (siehe Mutation-Testing-
// Analyse im Chatverlauf) – die Labels für 'lesezeichen', 'gesetzeskurzbefehle',
// 'nichtamtlicheTitel' und 'importindizes' wurden dadurch nie geprüft.
// Dieser Test deckt bewusst ALLE Schlüssel gleichzeitig ab, statt vier
// weitere Beispiel-Tests zu duplizieren.

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { ermittleZipName } from './exportSpeicher';
import type { ExportGruppe, ExportKategorie } from './exportSpeicher';

// Muss exakt den Schlüsseln von GRUPPEN_ANZEIGE in exportSpeicher.ts
// entsprechen (dort nicht exportiert) UND den erwarteten Anzeigenamen –
// bei Abweichung zwischen den beiden Seiten schlägt der Test fehl, bei
// Abweichung vom Schlüssel-Typ selbst meldet TypeScript einen Fehler unten.
const GRUPPEN_ANZEIGE_ERWARTET: Record<ExportGruppe['schluessel'], string> = {
  gesetze: 'Gesetze',
  markierungen: 'Markierungen',
  favoriten: 'Favoriten',
  nichtamtlicheTitel: 'Nichtamtliche Titel',
  lesezeichen: 'Lesezeichen',
  gesetzeskurzbefehle: 'Gesetzeskurzbefehle',
  importindizes: 'Importindizes',
  einstellungen: 'Einstellungen',
};

describe('Property: ermittleZipName (Einzelgruppen-Benennung für ALLE Gruppenschlüssel)', () => {
  it('verwendet für jeden Gruppenschlüssel das jeweils korrekte GRUPPEN_ANZEIGE-Label', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T10:00:00Z'));
    try {
      fc.assert(
        fc.property(
          fc.constantFrom(
            ...(Object.keys(GRUPPEN_ANZEIGE_ERWARTET) as ExportGruppe['schluessel'][]),
          ),
          (schluessel) => {
            const gruppe: ExportGruppe = {
              schluessel,
              dateien: [{ name: 'x.xml', inhalt: 'inhalt' }],
            };
            const result = ermittleZipName(new Set<ExportKategorie>(['alleFavoriten']), [gruppe]);
            expect(result).toBe(`${GRUPPEN_ANZEIGE_ERWARTET[schluessel]} 2026-05-19`);
          },
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
