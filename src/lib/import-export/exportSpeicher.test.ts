// exportSpeicher.test.ts
//
// Tests für die REINEN Hilfsfunktionen in exportSpeicher.ts (kein Dateizugriff,
// kein Tauri-Dialog). exportiere() selbst bleibt bewusst ungetestet – dünne
// I/O-Orchestrierung (Tauri fs/dialog), siehe Projekt-Prinzip "kein Mocken
// dünner I/O-Orchestrierung in Tests".

import { describe, it, expect, vi } from 'vitest';
import { baueZipEintraege, ermittleZipName } from './exportSpeicher';
import type { ExportGruppe, ExportKategorie } from './exportSpeicher';

// baueZipEintraege liest zur Prüfung Uint8Array-Inhalte zurück in Text –
// das eigentliche Kodieren (strToU8) ist bereits fflate-Bibliothekscode und
// wird hier nicht erneut geprüft, nur die Pfad-/Präfix-Logik.
function zuText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function gruppe(schluessel: ExportGruppe['schluessel'], dateien: string[]): ExportGruppe {
  return { schluessel, dateien: dateien.map((name) => ({ name, inhalt: `inhalt:${name}` })) };
}

describe('baueZipEintraege', () => {
  it('legt Dateien unter einem Unterordner nach Gruppenname ab', () => {
    const result = baueZipEintraege([gruppe('gesetze', ['BGB.xml'])]);
    expect(Object.keys(result)).toEqual(['Gesetze/BGB.xml']);
    expect(zuText(result['Gesetze/BGB.xml']!)).toBe('inhalt:BGB.xml');
  });

  it('Edge-Case: Lesezeichen landen ohne Unterordner direkt im Zip-Root', () => {
    const result = baueZipEintraege([gruppe('lesezeichen', ['lesezeichen.xml'])]);
    expect(Object.keys(result)).toEqual(['lesezeichen.xml']);
  });

  it('Edge-Case: Gesetzeskurzbefehle und Einstellungen teilen sich denselben Ordner "Einstellungen/"', () => {
    const result = baueZipEintraege([
      gruppe('gesetzeskurzbefehle', ['gesetzeskurzbefehle.xml']),
      gruppe('einstellungen', ['Einstellungen.xml']),
    ]);
    expect(Object.keys(result).sort()).toEqual([
      'Einstellungen/Einstellungen.xml',
      'Einstellungen/gesetzeskurzbefehle.xml',
    ]);
  });

  it('mehrere Dateien derselben Gruppe landen alle im selben Unterordner', () => {
    const result = baueZipEintraege([gruppe('markierungen', ['a.xml', 'b.xml'])]);
    expect(Object.keys(result).sort()).toEqual(['Markierungen/a.xml', 'Markierungen/b.xml']);
  });

  it('Edge-Case: leere Gruppenliste -> leeres Ergebnis', () => {
    expect(baueZipEintraege([])).toEqual({});
  });

  it('Edge-Case: "einstellungen" allein (ohne "gesetzeskurzbefehle") landet ebenfalls im Ordner "Einstellungen/"', () => {
    const result = baueZipEintraege([gruppe('einstellungen', ['Einstellungen.xml'])]);
    expect(Object.keys(result)).toEqual(['Einstellungen/Einstellungen.xml']);
  });

  it('mehrere unterschiedliche Gruppen gleichzeitig', () => {
    const result = baueZipEintraege([
      gruppe('gesetze', ['BGB.xml']),
      gruppe('favoriten', ['x.xml']),
    ]);
    expect(Object.keys(result).sort()).toEqual(['Favoriten/x.xml', 'Gesetze/BGB.xml']);
  });
});

describe('ermittleZipName', () => {
  const heute = new Date('2026-05-19T10:00:00Z');

  it('"Gesetzessammlung {Datum}" bei vollständiger Sammlung, unabhängig von den Gruppen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(heute);
    try {
      const result = ermittleZipName(new Set<ExportKategorie>(['vollstaendigeSammlung']), [
        gruppe('gesetze', ['BGB.xml']),
      ]);
      expect(result).toBe('Gesetzessammlung 2026-05-19');
    } finally {
      vi.useRealTimers();
    }
  });

  it('"{Kategorie} {Datum}" bei genau einer nicht-leeren Gruppe', () => {
    vi.useFakeTimers();
    vi.setSystemTime(heute);
    try {
      const result = ermittleZipName(new Set<ExportKategorie>(['alleFavoriten']), [
        gruppe('favoriten', ['x.xml']),
      ]);
      expect(result).toBe('Favoriten 2026-05-19');
    } finally {
      vi.useRealTimers();
    }
  });

  it('"Gesetzesexport {Datum}" bei mehreren nicht-leeren Gruppen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(heute);
    try {
      const result = ermittleZipName(new Set<ExportKategorie>(['alleFavoriten', 'lesezeichen']), [
        gruppe('favoriten', ['x.xml']),
        gruppe('lesezeichen', ['lesezeichen.xml']),
      ]);
      expect(result).toBe('Gesetzesexport 2026-05-19');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Edge-Case: Benennung basiert auf den tatsächlich nicht-leeren Gruppen, nicht auf der reinen Auswahl', () => {
    // kategorien enthält zwei Kategorien, aber nur eine Gruppe kam mit Inhalt
    // zurück (die andere war leer und wurde von sammleGruppen() weggelassen)
    // -> Einzelkategorie-Benennung, nicht "Gesetzesexport".
    vi.useFakeTimers();
    vi.setSystemTime(heute);
    try {
      const result = ermittleZipName(new Set<ExportKategorie>(['alleFavoriten', 'lesezeichen']), [
        gruppe('favoriten', ['x.xml']),
      ]);
      expect(result).toBe('Favoriten 2026-05-19');
    } finally {
      vi.useRealTimers();
    }
  });
});
