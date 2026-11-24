// Private Prüfung gespeicherter Fensterdaten auf der Grenze zu unbekanntem JSON.
// Gültige Teile werden nur für die Rückgabe erhalten; Lesen bereinigt keinen Speicher.

import type { TabVerlauf } from '@/lib/domain/appTypes';
import { leererVerlauf, verlaufOhneAktivierung } from '@/lib/domain/app/tabVerlauf';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGueltigerNormgeber } from '@/lib/domain/gesetzesreferenz';
import { istRecord } from '@/lib/persistenz/kern/kern.index';
interface GespeicherterTab {
  gesetzesreferenz: Gesetzesreferenz;
}

/** Größe und Position eines Fensters, wie von der Tauri-Window-API gemeldet. */
export interface FensterGeometrie {
  breite: number;
  hoehe: number;
  x: number;
  y: number;
  maximiert: boolean;
}

/** Persistierbarer Zustand eines Fensters mit offenen Tabs und optionaler
 * Geometrie. */
export interface GespeichertesFenster {
  tabs: GespeicherterTab[];
  /** Index in `tabs`, der beim Beenden aktiv war. -1 wenn kein Tab aktiv war. */
  aktiverIndex: number;
  /** Zuletzt bekannte Größe/Position dieses Fensters. Fehlt bei älteren, vor
   *  Einführung der Geometrie-Speicherung erzeugten Einträgen. */
  geometrie?: FensterGeometrie;
}

/** Minimaler Wiederherstellungszustand eines geschlossenen Tabs. */
export interface GeschlossenerTab {
  gesetzesreferenz: Gesetzesreferenz;
  verlauf: TabVerlauf;
}

function istId(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.length > 0;
}

export function pruefeFensterGeometrie(wert: unknown): FensterGeometrie | undefined {
  if (!istRecord(wert)) return undefined;
  const { breite, hoehe, x, y, maximiert } = wert;
  if (
    typeof breite !== 'number' ||
    !Number.isFinite(breite) ||
    breite <= 0 ||
    typeof hoehe !== 'number' ||
    !Number.isFinite(hoehe) ||
    hoehe <= 0 ||
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof maximiert !== 'boolean'
  )
    return undefined;
  return { breite, hoehe, x, y, maximiert };
}

export function pruefeFensterZustand(wert: unknown): GespeichertesFenster | null {
  if (!istRecord(wert) || !Array.isArray(wert.tabs)) return null;
  const tabs: GespeichertesFenster['tabs'] = [];
  const ursprungsIndizes: number[] = [];
  wert.tabs.forEach((tab: unknown, index: number) => {
    if (!istRecord(tab)) return;
    const gesetzesreferenz = liesGesetzesreferenz(tab);
    if (!gesetzesreferenz) return;
    tabs.push({ gesetzesreferenz });
    ursprungsIndizes.push(index);
  });
  if (wert.tabs.length > 0 && tabs.length === 0) return null;
  const index = wert.aktiverIndex;
  let aktiverIndex = -1;
  if (tabs.length > 0 && index !== -1) {
    const gueltigerIndex = typeof index === 'number' && Number.isInteger(index) && index >= 0;
    const neuZugeordnet = gueltigerIndex ? ursprungsIndizes.indexOf(index) : -1;
    // Derselbe Fallback wie beim Restore: auf den vorhandenen Bereich begrenzen.
    aktiverIndex =
      neuZugeordnet >= 0 ? neuZugeordnet : Math.min(gueltigerIndex ? index : 0, tabs.length - 1);
  }
  const geometrie = pruefeFensterGeometrie(wert.geometrie);
  return { tabs, aktiverIndex, ...(geometrie ? { geometrie } : {}) };
}

/** Liest ausschließlich die gespeicherte Gesetzesreferenz. */
function liesGesetzesreferenz(wert: Record<string, unknown>): Gesetzesreferenz | null {
  if ('gesetzesreferenz' in wert) {
    const ref = wert.gesetzesreferenz;
    if (!istRecord(ref) || !istId(ref.kurztitel)) return null;
    if (typeof ref.normgeber !== 'string' || !istGueltigerNormgeber(ref.normgeber)) return null;
    return {
      kurztitel: ref.kurztitel,
      normgeber: ref.normgeber,
    };
  }
  return null;
}

function pruefeVerlauf(wert: unknown): TabVerlauf {
  if (!istRecord(wert) || !Array.isArray(wert.eintraege)) return leererVerlauf();
  const { position } = wert;
  if (
    typeof position !== 'number' ||
    !Number.isInteger(position) ||
    position < 0 ||
    position >= Math.max(1, wert.eintraege.length)
  )
    return leererVerlauf();
  const eintraege: TabVerlauf['eintraege'] = [];
  for (const eintrag of wert.eintraege) {
    if (!istRecord(eintrag) || !istId(eintrag.xmlId)) {
      return leererVerlauf();
    }
    const gesetzesreferenz = liesGesetzesreferenz(eintrag);
    if (!gesetzesreferenz) return leererVerlauf();
    eintraege.push({ gesetzesreferenz, xmlId: eintrag.xmlId });
  }
  return verlaufOhneAktivierung({ eintraege, position });
}

export function pruefeGeschlosseneTabs(wert: unknown): GeschlossenerTab[] {
  if (!Array.isArray(wert)) return [];
  const tabs: GeschlossenerTab[] = [];
  for (const tab of wert) {
    if (!istRecord(tab)) continue;
    const gesetzesreferenz = liesGesetzesreferenz(tab);
    if (!gesetzesreferenz) continue;
    tabs.push({ gesetzesreferenz, verlauf: pruefeVerlauf(tab.verlauf) });
  }
  return tabs;
}
