// useAktuellerWertRef.ts
//
// Kapselt das im Projekt mehrfach duplizierte Pattern "Wert in einem Ref
// spiegeln, damit ein nur EINMAL registrierter Event-Listener/Effekt (leeres
// Deps-Array – z.B. useTastenkuerzel.ts, useMenueEvents.ts) trotzdem immer
// den aktuellen Wert sieht, statt für immer auf dem Stand des allerersten
// Renders zu bleiben" (siehe z.B. tabsRef in useAppTabs.ts für dasselbe
// Muster, dort aber lokal statt extrahiert).
//
// Bewusst NUR für die Einführungs-Refs (einfuehrungAktiv/einfuehrungTeilaktion)
// eingeführt, wo das Pattern an drei Stellen (App.tsx, useTastenkuerzel.ts,
// useMenueEvents.ts) wortgleich vorkam – ein Wechsel der übrigen,
// unabhängigen Ref-Spiegelungen im Projekt (tabsRef, gesetzeRef, ...) auf
// diesen Hook ist bewusst NICHT Teil dieser Änderung.

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useAktuellerWertRef<T>(wert: T): RefObject<T> {
  const ref = useRef(wert);
  useEffect(() => {
    ref.current = wert;
  }, [wert]);
  return ref;
}
