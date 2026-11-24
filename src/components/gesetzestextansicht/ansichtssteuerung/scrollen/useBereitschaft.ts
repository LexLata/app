// Verwaltet das Anzeigetor samt 300-ms-Rückfallzeitgeber. Nach dem Öffnen schließt es sich
// nur noch für einen weiten Sprung bei Aktivierung einer zuvor verdeckten Ansicht.
import { useEffect, useRef, useState } from 'react';

export function useBereitschaft(initialBereit: boolean, initialLayoutBereit: boolean | undefined) {
  const [bereit, setBereit] = useState(initialBereit);
  const rueckfallAusgeloest = useRef(false);
  useEffect(() => {
    if (bereit) {
      if (import.meta.env.DEV) {
        console.info(
          `[perf] Wiederherstellung: 300-ms-Rückfallzeitgeber ${rueckfallAusgeloest.current ? 'ausgelöst' : 'nicht ausgelöst'}`,
        );
      }
      return;
    }
    if (initialLayoutBereit === false) return;
    const timer = setTimeout(() => {
      rueckfallAusgeloest.current = true;
      setBereit(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [bereit, initialLayoutBereit]);
  function verdecken() {
    setBereit(false);
    return true;
  }
  return [bereit, setBereit, verdecken] as const;
}
