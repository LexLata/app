// fensterGeometrieSpeicher.ts
// Liest und speichert die Geometrie des Hauptfensters im App-Daten-Ordner.

import { pruefeFensterGeometrie } from './fensterDatenPruefung';
import type { FensterGeometrie } from '@/lib/persistenz/fenster/fensterSpeicher';
import {
  EINSTELLUNGEN_ORDNER,
  appDatenLesen,
  appDatenSchreiben,
  sicherstelleOrdner,
} from '@/lib/persistenz/kern/kern.index';

// 'main' wird von Tauri schon aus tauri.conf.json erzeugt, bevor JavaScript
// läuft. Rust liest diese Datei daher synchron vor der Sichtbarkeit, damit das
// Fenster nicht erst sichtbar seine Größe oder Position korrigiert.
const HAUPT_GEOMETRIE_DATEI = `${EINSTELLUNGEN_ORDNER}/haupt-fenster-geometrie.json`;

// Der letzte Zustand ist ein Fallback für neue Fenster oder main ohne eigenen
// gespeicherten Zustand. Er bleibt getrennt von der Hauptfenster-Datei, damit
// ein anderes Fenster deren Flacker-Schutz nicht überschreibt.
const LETZTE_GEOMETRIE_DATEI = `${EINSTELLUNGEN_ORDNER}/letzte-fenster-geometrie.json`;

/** Schreibt die Hauptfenster-Geometrie für Rusts Startzeit-Flacker-Schutz.
 * Fehlende Geometrie und Schreibfehler bleiben bewusst folgenlos. */
export async function hauptFensterGeometrieFuerRustSpeichern(
  geometrie: FensterGeometrie | undefined,
): Promise<void> {
  if (!geometrie) return;
  try {
    await sicherstelleOrdner(EINSTELLUNGEN_ORDNER);
    await appDatenSchreiben(HAUPT_GEOMETRIE_DATEI, JSON.stringify(geometrie));
  } catch {
    /* betrifft nur den Flacker-Schutz beim Start */
  }
}

/** Schreibt die Geometrie als Fallback für Fenster ohne eigenen Zustand.
 * Fehlende Geometrie und Schreibfehler bleiben bewusst folgenlos. */
export async function letzteFensterGeometrieSpeichern(
  geometrie: FensterGeometrie | undefined,
): Promise<void> {
  if (!geometrie) return;
  try {
    await sicherstelleOrdner(EINSTELLUNGEN_ORDNER);
    await appDatenSchreiben(LETZTE_GEOMETRIE_DATEI, JSON.stringify(geometrie));
  } catch {
    /* betrifft nur den Fallback bei leerem Fensterzustand */
  }
}

/** Liest die letzte Fenstergeometrie. Fehlende, nicht lesbare oder ungültige
 * Dateien ergeben bewusst undefined; alle Geometriewerte werden geprüft. */
export async function letzteFensterGeometrieLesen(): Promise<FensterGeometrie | undefined> {
  try {
    const geparst: unknown = JSON.parse(await appDatenLesen(LETZTE_GEOMETRIE_DATEI));
    return pruefeFensterGeometrie(geparst);
  } catch {
    return undefined;
  }
}
