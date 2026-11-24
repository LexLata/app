// usePlattform.ts
//
// Liefert, ob die App auf macOS/Windows/Linux läuft – für plattformabhängige
// Anzeige von Tastenkürzeln (siehe tastenkuerzelFormat.ts), die Fenster-Buttons der
// custom Titelleiste (Tableiste.fensterButtons.tsx) und ähnliche
// UI-Unterschiede. holePlattform() (tauriHelpers.ts) cached das Ergebnis
// bereits intern, hier wird es nur noch in einen synchron lesbaren
// React-State übernommen (gleiches Muster wie bisher einzeln in
// Tableiste.tsx, jetzt zentral).
//
// Ist der Wert bei Mount bereits synchron bekannt (siehe
// plattformFallsBekannt() in tauriHelpers.ts), startet der State direkt
// korrekt, ohne Zwischenzustand. Das ist inzwischen der Regelfall in JEDEM
// Fenster (auch Einstellungen/Verweismarkierung/Kommentar/Markierungskonflikte),
// da main.tsx ganz am Anfang von ermittleWurzelKomponente() ausnahmslos
// holePlattform() abwartet, bevor irgendeine Wurzelkomponente rendert.
// Der `bekannt === null`-Fallback bleibt dennoch als Sicherheitsnetz nötig
// (z. B. reiner Browser-Dev-Modus ohne Tauri, siehe main.tsx-Catch): dann
// startet `istMac` bei `true` (Mac-Darstellung) bis das async-Ergebnis
// vorliegt, damit während der kurzen Ladezeit kein sichtbarer Wechsel
// zwischen zwei potenziell falschen Zuständen auftritt, sondern höchstens
// einmal umgeschaltet wird. istWindows/istLinux starten in diesem Fall
// entsprechend bei `false`.

import { useEffect, useState } from 'react';
import { holePlattform, plattformFallsBekannt } from '@/lib/plattform/tauriHelpers';

export function usePlattform(): { istMac: boolean; istWindows: boolean; istLinux: boolean } {
  const bekannt = plattformFallsBekannt();
  const [istMac, setIstMac] = useState(bekannt !== null ? bekannt === 'macos' : true);
  const [istWindows, setIstWindows] = useState(bekannt === 'windows');
  const [istLinux, setIstLinux] = useState(bekannt === 'linux');

  useEffect(() => {
    if (bekannt !== null) return; // schon beim ersten Render korrekt gesetzt
    void holePlattform().then((p) => {
      setIstMac(p === 'macos');
      setIstWindows(p === 'windows');
      setIstLinux(p === 'linux');
    });
  }, [bekannt]);

  return { istMac, istWindows, istLinux };
}
