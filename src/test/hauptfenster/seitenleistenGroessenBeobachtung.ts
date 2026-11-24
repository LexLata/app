// seitenleistenGroessenBeobachtung.ts
// Löst native Größenmeldungen aus; DOM-Maße legt der jeweilige Verhaltenstest fest.
import { vi } from 'vitest';
export function seitenleistenGroessenBeobachtung() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private aktiv = true;
      constructor(private melden: (entries: ResizeObserverEntry[]) => void) {}
      observe() {
        queueMicrotask(() => {
          if (this.aktiv) this.melden([]);
        });
      }
      unobserve() {}
      disconnect() {
        this.aktiv = false;
      }
    },
  );
}
