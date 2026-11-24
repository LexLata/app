// localStorageJSON.ts
//
// Gemeinsamer Helper für das wiederkehrende Muster "eine Map oder ein Array
// als JSON komplett in einem localStorage-Key speichern, bei jedem
// Zugriff komplett lesen/schreiben" (siehe fensterSpeicher.ts,
// geschlosseneTabsSpeicher.ts, aktivierungSpeicher.ts). Ersetzt die vorher
// pro Datei duplizierten ladeAlle()/speichereAlle()-Funktionen.
//
// Bewusst kein State/Hook (diese Speicher-Dateien sind reine, hookfreie
// lib/persistenz-Module, aus App-Code wie Tab-Verwaltung heraus aufgerufen).

/** Liest JSON aus localStorage und liefert bei fehlendem, ungültigem oder nicht
 * lesbarem Wert den Fallback. */
export function ladeJSON<T>(key: string, fallback: T, istGueltig: (wert: unknown) => wert is T): T {
  try {
    const roh = localStorage.getItem(key);
    if (!roh) return fallback;
    const geparst: unknown = JSON.parse(roh);
    return istGueltig(geparst) ? geparst : fallback;
  } catch {
    return fallback;
  }
}

/** Speichert einen Wert als JSON; bei nicht verfügbarem localStorage bleibt die
 * Operation bewusst folgenlos. */
export function speichereJSON<T>(key: string, wert: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(wert));
  } catch {
    // localStorage nicht verfügbar – Zustand geht verloren
  }
}

/** Typ-Guard für die in diesen Speicher-Dateien üblichen "Record<string, …>"-Maps. */
export function istRecord(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/**
 * Kopiert ein Record<string, T> in ein Objekt OHNE Object.prototype in der
 * Kette – schützt gegen Prototype Pollution, wenn der Schlüssel aus
 * ladeJSON()-geparstem, potenziell fremdgesteuertem JSON stammt (z.B. ein
 * Tauri-Fensterlabel oder eine importierte kurztitel) und per
 * Bracket-Notation geschrieben wird (fensterSpeicher.ts, aktivierungSpeicher.ts).
 * Ohne dies würde z.B. `alle["__proto__"] = wert` bei einem normalen `{}`
 * KEINE eigene Property anlegen, sondern (über den geerbten `__proto__`-
 * Setter) das Prototype-Objekt von `alle` selbst ersetzen – die Daten würden
 * beim anschließenden JSON.stringify (das nur eigene Properties serialisiert)
 * stillschweigend verloren gehen. Auf einem Objekt ohne Object.prototype
 * existiert dieser Setter nicht, daher legt dieselbe Zuweisung stattdessen
 * ganz normal eine eigene Property "__proto__" an.
 */
export function ohneObjectPrototype<T>(record: Record<string, T>): Record<string, T> {
  return Object.assign(Object.create(null) as Record<string, T>, record);
}
