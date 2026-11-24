// CustomTastatur.types.ts
//
// Gemeinsame Typen für CustomTastatur.tsx, CustomTastatur.Taste.tsx und
// CustomTastatur.ModusUmschaltTaste.tsx.

/** Imperative Schnittstelle einer Taste, damit der Container (in
 *  CustomTastatur.tsx) einen im Zwischenraum begonnenen Tastendruck an die
 *  nächstgelegene Taste durchreichen kann. Siehe Bugfix-Kommentar in
 *  CustomTastatur.tsx zur Historie (synthetisches PointerEvent hat sich als
 *  unzuverlässig erwiesen; diese imperative Steuerung ersetzt das). */
export interface TastenHandle {
  simulateDown: () => void;
  simulateMove: (clientX: number, clientY: number) => void;
  simulateUp: () => void;
  simulateCancel: () => void;
}
