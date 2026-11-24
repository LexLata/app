// fensterSpeicher.ts
//
// Merkt sich pro Fenster über Gesetzesreferenzen, welche Tabs offen waren – damit beim
// nächsten Start der App alles wieder genauso aussieht. AN WELCHER STELLE
// eines Gesetzes man zuletzt war, wird hier NICHT (mehr) gespeichert: Tabs
// werden beim Wiederherstellen ohne explizites Sprungziel (initialNorm)
// geöffnet – genau wie beim normalen Öffnen eines Gesetzes übernimmt dann
// automatisch aktivierungSpeicher.ts (Gesetz-weit zuletzt aktives Element).
//
// Alle Fenster der App teilen sich denselben localStorage (gleicher Origin),
// deshalb wird hier nicht ein einzelner Wert gespeichert, sondern eine Map
// von Tauri-Fenster-Label → Zustand dieses Fensters. Das Fenster-Label ist
// pro Fenster eindeutig und bleibt über Neustarts hinweg stabil, sofern das
// Fenster beim Wiederherstellen mit demselben Label neu erzeugt wird
// (siehe App.tsx + fenster_oeffnen_mit_label in lib.rs).

import {
  ladeJSON,
  speichereJSON,
  istRecord,
  ohneObjectPrototype,
} from '@/lib/persistenz/kern/kern.index';

import { pruefeFensterZustand } from './fensterDatenPruefung';

const STORAGE_KEY = 'lexlata.fenster';

import type { FensterGeometrie, GespeichertesFenster } from './fensterDatenPruefung';
export type { FensterGeometrie, GespeichertesFenster } from './fensterDatenPruefung';

type FensterMap = Record<string, unknown>;

function ladeAlle(): FensterMap {
  // ohneObjectPrototype: das Fenster-Label (Schlüssel) kommt letztlich aus
  // Tauri und landet unkontrolliert per Bracket-Notation in dieser Map (siehe
  // speichereFensterZustand) – ein Label "__proto__" würde auf einem
  // normalen {} sonst keine eigene Property anlegen, siehe Kommentar dort.
  return ohneObjectPrototype(ladeJSON(STORAGE_KEY, {}, istRecord));
}

function speichereAlle(alle: FensterMap): void {
  speichereJSON(STORAGE_KEY, alle);
}

/** Erkennbarer Fehler der zusammengehörigen Fensterübernahme. */
export class FensterUebernahmeFehler extends Error {
  constructor(ursache: unknown) {
    super('Fensterzustand konnte nicht übernommen werden', { cause: ursache });
    this.name = 'FensterUebernahmeFehler';
  }
}

/** Überträgt den validierten Quellzustand samt gewählter Geometrie mit einem Schreibvorgang nach main.
 * Eine bereits entfernte Quelle bleibt bei Wiederholung folgenlos. */
export function uebernehmeFensterZustandNachMain(
  quellLabel: string,
  geometrie?: FensterGeometrie,
): void {
  if (quellLabel === 'main') return;
  const alle = ladeAlle();
  if (!(quellLabel in alle)) return;
  const zustand = pruefeFensterZustand(alle[quellLabel]);
  if (!zustand) throw new FensterUebernahmeFehler('Ungültiger Quellzustand');
  alle.main = geometrie ? { ...zustand, geometrie } : zustand;
  delete alle[quellLabel];
  // Der allgemeine JSON-Schreibhelfer verschluckt Fehler. Bei der Übernahme
  // muss der Restore vor jeder weiteren Änderung zuverlässig abbrechen können.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alle));
  } catch (fehler) {
    throw new FensterUebernahmeFehler(fehler);
  }
}

/** Liefert den gespeicherten Zustand eines Fensters, oder null falls keiner vorhanden ist. */
export function ladeFensterZustand(label: string): GespeichertesFenster | null {
  return pruefeFensterZustand(ladeAlle()[label]);
}

/** Liefert die Labels aller Fenster, für die ein Zustand gespeichert ist. */
export function alleFensterLabels(): string[] {
  return Object.entries(ladeAlle())
    .filter(([, wert]) => pruefeFensterZustand(wert) !== null)
    .map(([label]) => label);
}

/** Speichert/aktualisiert den Zustand eines einzelnen Fensters. */
export function speichereFensterZustand(
  label: string,
  zustand: GespeichertesFenster,
  { fehlerWeitergeben = false } = {},
): void {
  const alle = ladeAlle();
  alle[label] = zustand;
  if (fehlerWeitergeben) localStorage.setItem(STORAGE_KEY, JSON.stringify(alle));
  else speichereAlle(alle);
}

/** Entfernt den Zustand eines Fensters, z. B. wenn der Nutzer es bewusst schließt. */
export function entferneFensterZustand(label: string): void {
  const alle = ladeAlle();
  if (!(label in alle)) return;
  delete alle[label];
  speichereAlle(alle);
}
