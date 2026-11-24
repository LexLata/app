// Regel der Bereithaltung: welche bereits benutzten Gesetzestextansichten eines Hauptfensters
// aufgebaut bleiben. Reine Funktion; Gültigkeit und Reihenfolgen liefert useTabBereithaltung.
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

export interface BereithaltungsAnsicht {
  tabId: string;
  gesetzesreferenz: string;
  /** `tab`: aktuelle Ansicht eines offenen Tabs; `verlassen`: im Tab verlassenes Gesetz. */
  art: 'tab' | 'verlassen';
  /** Vom Hook geprüft: Tab offen, Gesetz geladen und Datenstand unverändert. */
  gueltig: boolean;
  kosten: number;
}

export interface BereithaltungsEingabe {
  /**
   * Bereits benutzte Ansichten; Art `tab` in Aktivierungsreihenfolge, Art `verlassen` nach dem
   * Zeitpunkt des Verlassens, jeweils jüngste zuerst.
   */
  ansichten: readonly BereithaltungsAnsicht[];
  aktiverTabId: string | null;
  /** Zuletzt verlassener Tab, solange seine Garantie besteht. */
  garantieTabId: string | null;
  budget: number;
}

/** Bereithaltungskosten: zunächst die Elementzahl des Gesetzes (Plan G5). */
export function bereithaltungskosten(gesetz: GesetzDarstellung | undefined): number {
  return gesetz?.elemente.length ?? 0;
}

/** Liefert die bereitzuhaltenden Ansichten in Eingabereihenfolge (Regel Nr. 1–5). */
export function bereitzuhaltendeAnsichten({
  ansichten,
  aktiverTabId,
  garantieTabId,
  budget,
}: BereithaltungsEingabe): BereithaltungsAnsicht[] {
  const tabAnsichten = ansichten.filter((a) => a.art === 'tab' && a.gueltig);
  const aktive = tabAnsichten.find((a) => a.tabId === aktiverTabId);
  const garantiert = tabAnsichten.find(
    (a) => a.tabId === garantieTabId && a.tabId !== aktiverTabId,
  );
  let rest = budget - (garantiert?.kosten ?? 0);
  const weitere: BereithaltungsAnsicht[] = [];
  // Erst offene Tabs, dann verlassene Gesetzesansichten; die erste nicht passende beendet die jeweilige Auswahl.
  const verlasseneAnsichten = ansichten.filter((a) => a.art === 'verlassen' && a.gueltig);
  for (const gruppe of [tabAnsichten, verlasseneAnsichten]) {
    for (const a of gruppe) {
      if (a === aktive || a === garantiert) continue;
      if (rest <= 0 || a.kosten > rest) break;
      rest -= a.kosten;
      weitere.push(a);
    }
  }
  const gehalten = new Set([aktive, garantiert, ...weitere]);
  return ansichten.filter((a) => gehalten.has(a));
}
