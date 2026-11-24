// Generische Drosselung für Serien aufeinanderfolgender Aufrufe an
// dieselbe externe Website (landesrecht-bw.de), um sie bei größeren Läufen
// (z. B. viele Dokumentseiten-Abrufe hintereinander) nicht zu überlasten,
// ohne den Nutzer bei kurzen Serien (z. B. Einzelimport) unnötig warten zu
// lassen. Bewusst unabhängig vom aufrufenden Rust-Kommando gehalten (siehe
// landesrecht_import.rs): die Pause gehört zur Schleife auf TS-Seite, nicht
// in einen einzelnen, zustandslosen Aufruf.

/**
 * Berechnet die Wartezeit vor dem `n`-ten Aufruf (1-indiziert) einer Serie.
 * - Aufruf 1: keine Verzögerung – der erste Aufruf einer Serie soll nie
 *   künstlich verzögert werden.
 * - Ab Aufruf 2: Basis = min(n * 100ms, 4000ms), zzgl. zufälligem Jitter von
 *   ±250ms (nie negativ). Damit wächst die Pause zu Beginn einer langen
 *   Serie sanft an (z. B. 2. Aufruf ≈ 0,2s ± 0,25s) und erreicht ab dem
 *   40. Aufruf den Deckel von 4s ± 0,25s.
 */
export function berechneVerzoegerungMs(n: number): number {
  if (n <= 1) return 0;
  const basis = Math.min(n * 100, 4000);
  const jitter = Math.random() * 500 - 250;
  return Math.max(0, Math.round(basis + jitter));
}

/** Wartet die übergebene Anzahl Millisekunden ab (No-Op bei 0). */
export function warte(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
