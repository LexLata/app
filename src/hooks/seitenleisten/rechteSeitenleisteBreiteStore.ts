// rechteSeitenleisteBreiteStore.ts
//
// Fensterlokaler Store für die aktuell gerenderte Breite der rechten Seitenleiste.
// Schreiber (rechte Seitenleiste) und Leser (BannerHost) verwenden denselben
// Modul-Store mit useSyncExternalStore, entsprechend dem bannerStore.
// 0 = rechte Seitenleiste aktuell nicht sichtbar bzw. nicht gemessen.

let breite = 0;
const listener = new Set<() => void>();

function benachrichtigen() {
  listener.forEach((fn) => fn());
}

/** Setzt die gemessene Breite (px) per ResizeObserver, beim Abbau der
 * rechten Seitenleiste 0. */
export function setzeRechteLeisteBreite(neu: number) {
  if (neu === breite) return;
  breite = neu;
  benachrichtigen();
}

export function subscribe(fn: () => void): () => void {
  listener.add(fn);
  return () => listener.delete(fn);
}

export function getSnapshot(): number {
  return breite;
}
