// dateiImportVorgang.ts
//
// Fensterlokaler, nicht gespeicherter Stand des laufenden Datei-Imports
// (Muster wie bannerStore.ts). Der Import überdauert das Overlay; Overlay und
// Einstiegspunkte (Menü/Kurzbefehl, Ablegen von Dateien) lesen deshalb denselben Stand: das Overlay
// zeigt Fortschritt bzw. Bericht, die Einstiege verhindern einen zweiten Start.

import { useSyncExternalStore } from 'react';
import type {
  DateiImportFortschritt,
  DateiImportErgebnis,
} from '@/lib/import-export/datei-import/dateiImport.types';

export type DateiImportZustand =
  | { art: 'kein' }
  | {
      art: 'laeuft';
      phase: DateiImportFortschritt['phase'];
      erledigt: number;
      gesamt: number;
      aktuelleDatei?: string;
    }
  | { art: 'fertig'; ergebnis: DateiImportErgebnis };

const KEIN: DateiImportZustand = { art: 'kein' };
let zustand: DateiImportZustand = KEIN;
const listener = new Set<() => void>();

function setze(neu: DateiImportZustand) {
  zustand = neu;
  listener.forEach((fn) => fn());
}

/** Startet den Import der Pfade, sofern kein Import läuft. Liefert false, wenn
 *  bereits einer läuft (dann geschieht nichts). Ein noch nicht verworfenes
 *  Ergebnis wird durch den neuen Import ersetzt. Ein geworfener Fehler endet
 *  als Ergebnis mit dem Fehler `importAbgebrochen`. */
export function starteDateiImport(pfade: string[]): boolean {
  if (zustand.art === 'laeuft') return false;
  setze({ art: 'laeuft', phase: 'lesen', erledigt: 0, gesamt: pfade.length });
  void (async () => {
    let ergebnis: DateiImportErgebnis;
    try {
      const { importierePfade } =
        await import('@/lib/import-export/datei-import/gesetzDateiImport');
      ergebnis = await importierePfade(pfade, (f) =>
        setze({
          art: 'laeuft',
          phase: f.phase,
          erledigt: f.erledigt,
          gesamt: f.gesamt,
          aktuelleDatei: f.datei,
        }),
      );
    } catch (fehler) {
      console.error('Datei-Import abgebrochen:', fehler);
      ergebnis = {
        konflikte: [],
        berichtEintraege: [],
        fehler: [
          {
            grund: 'importAbgebrochen',
            detail: fehler instanceof Error ? fehler.message : String(fehler),
          },
        ],
      };
    }
    setze({ art: 'fertig', ergebnis });
  })();
  return true;
}

/** Setzt ein fertiges Ergebnis zurück auf `kein`; ein laufender Import bleibt. */
export function verwerfeDateiImportErgebnis() {
  if (zustand.art === 'fertig') setze(KEIN);
}

/** Aktueller Zustand des fensterweiten Datei-Imports (außerhalb von React). */
export function leseDateiImportZustand(): DateiImportZustand {
  return zustand;
}

/** Meldet jede Zustandsänderung (z. B. für die Reaktion auf das Importende). */
export function abonniereDateiImportZustand(fn: () => void): () => void {
  listener.add(fn);
  return () => listener.delete(fn);
}

/** React-Anbindung: rendert bei jeder Zustandsänderung des Datei-Imports neu. */
export function useDateiImportZustand(): DateiImportZustand {
  return useSyncExternalStore(abonniereDateiImportZustand, leseDateiImportZustand);
}

/** Reiner Erfolg: keine Konflikte, keine Fehler, nur neue Einträge ohne Meldungen. */
export function istReinerImportErfolg(ergebnis: DateiImportErgebnis): boolean {
  const { berichtEintraege, konflikte, fehler } = ergebnis;
  return (
    konflikte.length === 0 &&
    fehler.length === 0 &&
    berichtEintraege.every((e) => e.aktion === 'neu' && !e.meldungen?.length)
  );
}

/** Erfolgstext bei reinem Erfolg: Abschlusszeile im Overlay und Banner nach
 *  Abschluss im Hintergrund. */
export function dateiImportErfolgstext(anzahl: number): string {
  return anzahl === 1
    ? '1 Datei erfolgreich importiert.'
    : `${anzahl} Dateien erfolgreich importiert.`;
}
