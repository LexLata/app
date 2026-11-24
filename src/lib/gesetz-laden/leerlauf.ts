// Hintergrundschritte beginnen mit freiem Leerlaufbudget und Abstand zur letzten Eingabe.
function istEingabeplanung(wert: unknown): wert is { isInputPending: () => boolean } {
  return (
    typeof wert === 'object' &&
    wert !== null &&
    'isInputPending' in wert &&
    typeof wert.isInputPending === 'function'
  );
}
export function warteAufLeerlauf(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    let abgeschlossen = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const eingaben = ['pointerdown', 'keydown', 'input', 'wheel'];
    let letzteEingabe = -Infinity;
    const merkeEingabe = () => {
      letzteEingabe = performance.now();
    };
    if (typeof document !== 'undefined')
      for (const name of eingaben)
        document.addEventListener(name, merkeEingabe, { capture: true, passive: true });
    function fertig() {
      if (abgeschlossen) return;
      abgeschlossen = true;
      if (idle !== undefined && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener('abort', fertig);
      if (typeof document !== 'undefined')
        for (const name of eingaben) document.removeEventListener(name, merkeEingabe, true);
      resolve();
    }
    function eingabeAusstehend() {
      if (performance.now() - letzteEingabe < 50) return true;
      if (typeof navigator === 'undefined' || !('scheduling' in navigator)) return false;
      const planung = navigator.scheduling;
      return istEingabeplanung(planung) && planung.isInputPending();
    }
    function warten() {
      if (abgeschlossen) return;
      if (typeof requestIdleCallback === 'function') {
        idle = requestIdleCallback((zeit) => {
          idle = undefined;
          if (abgeschlossen) return;
          if (zeit.timeRemaining() > 0 && !eingabeAusstehend()) fertig();
          else warten();
        });
      } else {
        // WebViews ohne Idle-API: Eingaben verlängern die Ruhephase vor jedem Schritt.
        timer = setTimeout(() => {
          timer = undefined;
          if (abgeschlossen) return;
          if (eingabeAusstehend()) warten();
          else fertig();
        }, 50);
      }
    }
    signal.addEventListener('abort', fertig, { once: true });
    warten();
  });
}
