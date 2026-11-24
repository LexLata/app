// ScrollVorgang.ts
// Instanzlokale Lebensdauer für Sprung, Ankerkorrektur und Resize. Alle Fortsetzungen
// sind an ihren Auftrag gebunden; Ablösung storniert die zugehörigen Handles.
export interface ScrollVorgang {
  istGueltig(): boolean;
  frame(this: void, callback: FrameRequestCallback): number;
  spaeter(callback: () => void, ms: number): void;
  aufraeumen(callback: () => void): void;
  beenden(grund?: string): void;
}
export function erstelleScrollLebensdauer(
  melden?: (phase: string, nummer: number, anlass: string, grund: string | null) => void,
) {
  let nummer = 0;
  let aktiv: ScrollVorgang | null = null;
  function abbrechen() {
    aktiv?.beenden('abgebrochen');
    aktiv = null;
  }
  function starten(anlass = 'sprung'): ScrollVorgang {
    aktiv?.beenden('abgeloest');
    const id = ++nummer;
    melden?.('beginn', id, anlass, null);
    let gueltig = true;
    const aufraeumen = new Set<() => void>();
    const frames = new Set<number>();
    const timer = new Set<ReturnType<typeof setTimeout>>();
    const vorgang: ScrollVorgang = {
      istGueltig: () => gueltig,
      frame(callback) {
        if (!gueltig) return 0;
        const id = requestAnimationFrame((zeit) => {
          frames.delete(id);
          if (gueltig) callback(zeit);
        });
        frames.add(id);
        return id;
      },
      spaeter(callback, ms) {
        if (!gueltig) return;
        const id = setTimeout(() => {
          timer.delete(id);
          if (gueltig) callback();
        }, ms);
        timer.add(id);
      },
      aufraeumen(callback) {
        if (gueltig) aufraeumen.add(callback);
        else callback();
      },
      beenden(grund = 'abgeschlossen') {
        if (!gueltig) return;
        melden?.(grund === 'abgeschlossen' ? 'ende' : 'abbruch', id, anlass, grund);
        gueltig = false;
        aufraeumen.forEach((callback) => callback());
        aufraeumen.clear();
        frames.forEach(cancelAnimationFrame);
        timer.forEach(clearTimeout);
        frames.clear();
        timer.clear();
      },
    };
    aktiv = vorgang;
    return vorgang;
  }
  return { starten, abbrechen };
}
export type ScrollLebensdauer = ReturnType<typeof erstelleScrollLebensdauer>;
