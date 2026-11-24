// bezeichnungZuId.test.ts
//
// Unit-Tests für berechneId() (reine Textableitung) und IdVergabe (zustands-
// behaftete Kollisionsauflösung innerhalb eines Gesetzes). Das Zusammenspiel
// beider Funktionen innerhalb von baueGesetzesXML() (Gliederungsartikel-
// Kontextverkettung über mehrere Normen, reale id-Kollision) wird bereits in
// gesetzesXMLBauer.test.ts abgedeckt – hier liegt der Fokus auf der
// Bezeichnungs-zu-id-Ableitung selbst, inkl. Randfällen der Regex-Präfixe.

import { describe, it, expect, vi } from 'vitest';
import { berechneId, IdVergabe } from '@/lib/domain/norm/bezeichnungZuId';

describe('berechneId – Paragraph-Präfix (§/§§)', () => {
  it('"§ 434" -> "434"', () => {
    expect(berechneId('§ 434')).toBe('434');
  });

  it('"§3" ohne Leerzeichen nach § -> "3"', () => {
    expect(berechneId('§3')).toBe('3');
  });

  it('"§§ 3 bis 6" -> nur die ERSTE Zahl wird verwendet, "3" (kein Range-Erhalt)', () => {
    expect(berechneId('§§ 3 bis 6')).toBe('3');
  });

  it('Ziffer+Buchstabe-Kombination bleibt zusammen: "§ 3a" -> "3a"', () => {
    expect(berechneId('§ 3a')).toBe('3a');
  });

  it('mit artikelKontextstelle wird die id als "kontext-nr" verkettet: "§ 2" + "229" -> "229-2"', () => {
    expect(berechneId('§ 2', '229')).toBe('229-2');
  });

  it('ohne artikelKontextstelle bleibt es bei der reinen Nummer', () => {
    expect(berechneId('§ 2', undefined)).toBe('2');
  });

  it('Edge-Case: "§" allein (kein Text danach) hat KEINE Ziffer nach dem Präfix -> Fallback auf den Gesamttext ("§")', () => {
    expect(berechneId('§')).toBe('§');
  });

  it('Edge-Case: "§ ohne Zahl" (Präfix matcht, aber danach folgt Text statt Ziffer) -> Fallback auf Gesamttext ohne Leerzeichen', () => {
    expect(berechneId('§ ohne Zahl')).toBe('§ohneZahl');
  });
});

describe('berechneId – Artikel-Präfix (Art./Artikel)', () => {
  it('"Art. 229" -> "229"', () => {
    expect(berechneId('Art. 229')).toBe('229');
  });

  it('"Artikel 5" (ausgeschrieben) -> "5"', () => {
    expect(berechneId('Artikel 5')).toBe('5');
  });

  it('"Art5" ohne Punkt/Leerzeichen -> "5"', () => {
    expect(berechneId('Art5')).toBe('5');
  });

  it('Groß-/Kleinschreibung ist egal ("art. 229", "ART. 229")', () => {
    expect(berechneId('art. 229')).toBe('229');
    expect(berechneId('ART. 229')).toBe('229');
  });

  it('Edge-Case: artikelKontextstelle wird im Artikel-Zweig NICHT verwendet (nur im Paragraph-Zweig relevant) – "Art 5" + Kontext "229" ergibt weiterhin nur "5"', () => {
    expect(berechneId('Art 5', '229')).toBe('5');
  });

  it('Edge-Case: "Art" ohne nachfolgende Ziffer -> Fallback auf Gesamttext', () => {
    expect(berechneId('Art. Anhang')).toBe('Art.Anhang');
  });
});

describe('berechneId – Fallback (weder § noch Art., z.B. Anhang/Anlage)', () => {
  it('"Anhang 1" -> Leerzeichen werden entfernt, sonst unverändert: "Anhang1"', () => {
    expect(berechneId('Anhang 1')).toBe('Anhang1');
  });

  it('"Anlage 3 zu § 5" -> ALLE Leerzeichen im Gesamttext entfernt (kein Teil-Parsing des enthaltenen §)', () => {
    expect(berechneId('Anlage 3 zu § 5')).toBe('Anlage3zu§5');
  });

  it('führende/nachgestellte Leerzeichen werden vor der Verarbeitung getrimmt', () => {
    expect(berechneId('  Anhang 1  ')).toBe('Anhang1');
  });

  it('Edge-Case: leerer String -> leerer String (kein Absturz)', () => {
    expect(berechneId('')).toBe('');
  });

  it('Edge-Case: nur Whitespace -> leerer String', () => {
    expect(berechneId('   ')).toBe('');
  });
});

describe('IdVergabe – Kollisionsauflösung innerhalb eines Gesetzes', () => {
  it('vergibt bei erstmaliger Bezeichnung die reine berechneId()-id', () => {
    const v = new IdVergabe();
    expect(v.vergib('§ 1')).toBe('1');
  });

  it('unterschiedliche Bezeichnungen kollidieren nicht miteinander', () => {
    const v = new IdVergabe();
    expect(v.vergib('§ 1')).toBe('1');
    expect(v.vergib('§ 2')).toBe('2');
  });

  it('zweite identische Bezeichnung bekommt Suffix "_2"', () => {
    const v = new IdVergabe();
    expect(v.vergib('§ 1')).toBe('1');
    expect(v.vergib('§ 1')).toBe('1_2');
  });

  it('Edge-Case: dreifache Kollision zählt fortlaufend hoch ("_2", "_3", …)', () => {
    const v = new IdVergabe();
    expect(v.vergib('§ 1')).toBe('1');
    expect(v.vergib('§ 1')).toBe('1_2');
    expect(v.vergib('§ 1')).toBe('1_3');
  });

  it('Edge-Case: eine bereits als Suffix vergebene id ("1_2") kollidiert ihrerseits korrekt mit einer weiteren identischen Bezeichnung, die zufällig genau auf "1_2" abbildet', () => {
    const v = new IdVergabe();
    expect(v.vergib('§ 1')).toBe('1');
    expect(v.vergib('§ 1_2')).toBe('1_2');
    // Die dritte Bezeichnung "§ 1" würde regulär auf "1_2" prüfen (besetzt),
    // dann auf "1_3" (frei) – KEIN Konflikt mit der oben manuell vergebenen
    // "1_2", da die Suffix-Schleife bei jedem Versuch neu gegen `vergeben` prüft.
    expect(v.vergib('§ 1')).toBe('1_3');
  });

  it('artikelKontextstelle wird durchgereicht: gleiche §-Nummer unter verschiedenem Artikel-Kontext kollidiert NICHT', () => {
    const v = new IdVergabe();
    expect(v.vergib('§ 1', '229')).toBe('229-1');
    expect(v.vergib('§ 1', '230')).toBe('230-1');
  });

  it('loggt bei Kollision eine Warnung mit Basis-id, Bezeichnung und finaler id', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const v = new IdVergabe();
    v.vergib('§ 1');
    v.vergib('§ 1');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]![0]).toContain('"1"');
    expect(warnSpy.mock.calls[0]![0]).toContain('"§ 1"');
    expect(warnSpy.mock.calls[0]![0]).toContain('"1_2"');
    warnSpy.mockRestore();
  });

  it('keine Warnung bei kollisionsfreier Vergabe', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const v = new IdVergabe();
    v.vergib('§ 1');
    v.vergib('§ 2');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('zwei unabhängige IdVergabe-Instanzen teilen sich KEINEN Zustand (eine pro Gesetz, siehe Kopfkommentar)', () => {
    const v1 = new IdVergabe();
    const v2 = new IdVergabe();
    expect(v1.vergib('§ 1')).toBe('1');
    expect(v2.vergib('§ 1')).toBe('1');
  });
});
