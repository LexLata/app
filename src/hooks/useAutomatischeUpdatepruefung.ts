// Automatische Updateprüfung: die letzte Startaufgabe dieses Fensters. Die
// erste Anfrage folgt erst, wenn (a) der Fensterstart abgeschlossen ist, (b)
// alle gemeinsamen Startaufgaben abgeschlossen sind und (c) der erste
// Durchlauf der automatischen Gesetzaktualisierung beendet oder nicht fällig
// ist. Danach fragt das Fenster stündlich; ob tatsächlich geprüft wird
// (24 h), entscheidet Rust. Die Einstellung „Automatisch nach Updates
// suchen“ wird vor jeder Anfrage frisch gelesen. Ein Fund erscheint über den
// Zustand in allen Hauptfenstern; ein Fehler nur in der Konsole.

import { useEffect, useRef } from 'react';
import { STARTAUFGABEN_ANZAHL } from '@/hooks/app-start/startaufgaben';
import { leseAppUpdatesAutomatischSuchen } from '@/hooks/einstellungen/useAppUpdatesAutomatischSuchen';
import { hoereImEigenenFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

const PRUEF_TAKT_MS = 60 * 60 * 1000;

async function automatischPruefen(): Promise<void> {
  if (!leseAppUpdatesAutomatischSuchen()) return;
  try {
    const { ergebnis, detail } = await rufeBefehl('app_update_pruefen', { anlass: 'automatisch' });
    if (ergebnis === 'fehler') console.error('Automatische Updateprüfung fehlgeschlagen:', detail);
  } catch (fehler) {
    console.error('Automatische Updateprüfung fehlgeschlagen:', fehler);
  }
}

/** Fragt einmal an, sobald (a) bis (c) erfüllt sind, danach stündlich. */
export function useAutomatischeUpdatepruefung({
  startAbgeschlossen,
  gesetzaktualisierungBeendet,
}: UseAppUpdateParams): void {
  const fensterBereit = startAbgeschlossen && gesetzaktualisierungBeendet;
  const fensterBereitRef = useRef(fensterBereit);
  fensterBereitRef.current = fensterBereit;
  const zustandRef = useRef<{
    startaufgabenFertig: boolean;
    erstePruefungErfolgt: boolean;
    laufend: null | 'startaufgaben' | 'update';
    startaufgabenErneutAbfragen: boolean;
  }>({
    startaufgabenFertig: false,
    erstePruefungErfolgt: false,
    laufend: null,
    startaufgabenErneutAbfragen: false,
  });

  async function gemeinsameStartaufgabenAbgeschlossen(): Promise<boolean> {
    const zustand = zustandRef.current;
    for (;;) {
      zustand.startaufgabenErneutAbfragen = false;
      try {
        const fortschritt = await rufeBefehl('startaufgaben_fortschritt');
        if (!zustand.startaufgabenErneutAbfragen) return fortschritt >= STARTAUFGABEN_ANZAHL;
      } catch (fehler) {
        if (!zustand.startaufgabenErneutAbfragen) throw fehler;
      }
    }
  }

  async function versuchen(nurErste: boolean) {
    const zustand = zustandRef.current;
    if (!fensterBereitRef.current || zustand.laufend) return;
    if (nurErste && zustand.erstePruefungErfolgt) return;
    zustand.laufend = zustand.startaufgabenFertig ? 'update' : 'startaufgaben';
    try {
      if (!zustand.startaufgabenFertig) {
        if (!(await gemeinsameStartaufgabenAbgeschlossen()) || !fensterBereitRef.current) return;
        zustand.startaufgabenFertig = true;
      }
      zustand.laufend = 'update';
      zustand.erstePruefungErfolgt = true;
      await automatischPruefen();
    } catch (fehler) {
      console.error('Automatische Updateprüfung nicht möglich:', fehler);
    } finally {
      zustand.laufend = null;
    }
  }
  const versuchenRef = useRef(versuchen);
  versuchenRef.current = versuchen;

  useEffect(() => {
    // Startaufgaben eines anderen Fensters melden ihren Fortschritt hierüber.
    const empfang = hoereImEigenenFenster('startaufgaben-verfuegbar', () => {
      if (zustandRef.current.laufend === 'startaufgaben') {
        zustandRef.current.startaufgabenErneutAbfragen = true;
        return;
      }
      void versuchenRef.current(true);
    });
    void empfang.bereit.catch((fehler) => {
      console.error('Startaufgabenereignis für die Updateprüfung nicht anmeldbar:', fehler);
    });
    const takt = setInterval(() => void versuchenRef.current(false), PRUEF_TAKT_MS);
    return () => {
      empfang.abmelden();
      clearInterval(takt);
    };
  }, []);

  useEffect(() => {
    if (fensterBereit) void versuchenRef.current(true);
  }, [fensterBereit]);
}

export interface UseAppUpdateParams {
  /** (a) Fensterstart dieses Fensters abgeschlossen. */
  startAbgeschlossen: boolean;
  /** (c) Erster Durchlauf der automatischen Gesetzaktualisierung beendet oder nicht fällig. */
  gesetzaktualisierungBeendet: boolean;
}
