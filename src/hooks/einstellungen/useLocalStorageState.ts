// useLocalStorageState.ts
//
// Gemeinsamer Basis-Hook für das wiederkehrende Muster "einzelner
// Einstellungswert, initial aus localStorage gelesen, bei jeder Änderung
// dorthin zurückgeschrieben" (siehe z.B. useMarkierungenDeaktiviert.ts,
// useMinimalistischerModus.ts, useAutoAktualisierungsIntervall.ts,
// useSchriftgroessen.ts). Ersetzt die vorher pro Hook duplizierte
// try/catch-um-localStorage-Logik.
//
// Liefert zusätzlich einen Ref-Spiegel (siehe Ref-Muster in
// useMarkierungenDeaktiviert.ts) – für Hooks, die ihn nicht brauchen, kostet
// das nichts Nennenswertes (ein zusätzliches useRef).
//
// NICHT für Einstellungen mit abweichendem Persistenz-Muster geeignet, z.B.
// Einstellungen mit nullable-Semantik + removeItem bei Zurücksetzen +
// Kombination mit einer zweiten, nicht-localStorage-Quelle – dort eigener,
// gleichartiger storage-Listener nötig.
//
// CROSS-WINDOW-SYNC: Seit es mit dem Einstellungen-Fenster (siehe
// EinstellungenFenster.tsx) ein zweites Fenster gibt, das dieselben Keys
// liest/schreibt, hört dieser Hook zusätzlich auf das native `storage`-
// Event. Dieses Event feuert per Web-Standard NUR in ANDEREN Fenstern
// desselben Ursprungs, nie im schreibenden Fenster selbst – deckt sich
// also genau mit "die jeweils andere Seite muss den neuen Wert übernehmen".

import { meldeEinstellungenGeaendert } from '@/lib/einstellungen/einstellungen.index';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

interface Optionen<T> {
  /** Wandelt den rohen (garantiert nicht-null) localStorage-String in T um.
   *  Standard: String-Passthrough (nur für T = string sinnvoll). */
  parse?: (roh: string) => T;
  /** Wandelt T zum Schreiben in localStorage in einen String um.
   *  Standard: String(wert). */
  serialisiere?: (wert: T) => string;
}

export function useLocalStorageState<T>(key: string, standardwert: T, optionen: Optionen<T> = {}) {
  const parse = optionen.parse ?? ((roh: string) => roh as unknown as T);
  const serialisiere = optionen.serialisiere ?? ((wert: T) => String(wert));

  const [wert, setWertState] = useState<T>(() => {
    try {
      const gespeichert = localStorage.getItem(key);
      return gespeichert === null ? standardwert : parse(gespeichert);
    } catch {
      return standardwert;
    }
  });
  const wertRef = useRef(wert);

  const aufStorageReagieren = useEffectEvent((e: StorageEvent) => {
    if (e.key !== key) return;
    const neu = e.newValue === null ? standardwert : parse(e.newValue);
    setWertState(neu);
    wertRef.current = neu;
  });
  useEffect(() => {
    const listener = (e: StorageEvent) => aufStorageReagieren(e);
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [key]);

  function setWert(neu: T) {
    setWertState(neu);
    wertRef.current = neu;
    try {
      localStorage.setItem(key, serialisiere(neu));
      meldeEinstellungenGeaendert(key);
    } catch {
      // localStorage nicht verfügbar – Einstellung bleibt für diese Sitzung gültig
    }
  }

  return [wert, setWert, wertRef] as const;
}
