// useTextauswahl.ts
//
// Meldet bei jeder Änderung der Browser-Textauswahl an menueZustandSync.ts,
// ob gerade Text ausgewählt ist – einzige aktuelle Verwendung: die vier
// Markierungs-Menüpunkte (menu.rs: "unterstreichen"/"hervorheben"/
// "verweismarkierung"/"kommentar") sollen grau sein, wenn nichts ausgewählt ist.
// Bewusst ALS EIGENER, schlanker Hook statt in useMarkierungen.ts: die
// Selektion selbst hat mit Markierungs-Logik nichts zu tun (reine
// DOM-Beobachtung), zweiter denkbarer Anwendungsfall wäre z. B. die
// Floating-Toolbar, falls die künftig auch auf diesen Hook statt eigener
// Selektionsermittlung umgestellt wird.

import { useEffect } from 'react';
import { meldeTextAuswahlStatus } from '@/lib/plattform/menu/menu.index';

export function useTextauswahl(): void {
  useEffect(() => {
    function aktualisieren() {
      const auswahl = window.getSelection();
      meldeTextAuswahlStatus(!!auswahl && !auswahl.isCollapsed && auswahl.toString().length > 0);
    }
    document.addEventListener('selectionchange', aktualisieren);
    aktualisieren();
    return () => {
      document.removeEventListener('selectionchange', aktualisieren);
      // Fenster wird geschlossen/unmounted – Auswahl gilt nicht mehr.
      meldeTextAuswahlStatus(false);
    };
  }, []);
}
