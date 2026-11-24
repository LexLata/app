// tabAktivierung.ts
//
// Reine Logik zur Bestimmung des neu zu aktivierenden Tabs, nachdem der
// bisher aktive Tab geschlossen (oder in ein anderes Fenster übertragen)
// wurde. Extrahiert aus useAppTabs.ts, wo dieselbe Berechnung an zwei
// Stellen identisch vorkam (tabSchliessen und die Tab-Übertragung ins
// Ziehfenster) – daher hier zentralisiert statt dupliziert.

import type { Tab } from '@/lib/domain/appTypes';

/**
 * Bestimmt die id des neu zu aktivierenden Tabs, nachdem `geschlosseneTabId`
 * aus `vorherigeTabs` entfernt wurde (Ergebnis: `verbleibendeTabs`).
 *
 * Aktiviert wird der Tab an derselben Position wie der geschlossene, oder
 * – falls der geschlossene der letzte war – der neue letzte Tab.
 *
 * Vorbedingung (Aufrufer-Vertrag): `verbleibendeTabs.length >= 1`. Der Fall
 * "letzter Tab im Fenster geschlossen" (0 verbleibende Tabs) wird von den
 * Aufrufern separat behandelt (Ersetzen durch einen frischen Leertab, siehe
 * useAppTabs.ts), bevor diese Funktion überhaupt aufgerufen wird.
 */
export function naechsteAktiveTabIdNachSchliessen(
  vorherigeTabs: Tab[],
  verbleibendeTabs: Tab[],
  geschlosseneTabId: string,
): string {
  const index = Math.min(
    vorherigeTabs.findIndex((t) => t.id === geschlosseneTabId),
    verbleibendeTabs.length - 1,
  );
  // Vorbedingung s.o.: verbleibendeTabs.length >= 1, index daher ein
  // gültiger Index (Math.min klemmt auf [0, verbleibendeTabs.length - 1]).
  return verbleibendeTabs[index]!.id;
}
