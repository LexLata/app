// Bündelt bestehende Darstellungs- und Plattformeinstellungen des Hauptfensters.
import { useLeistenTauschen } from '@/hooks/einstellungen/useLeistenTauschen';
import { useTextDarstellung } from '@/hooks/einstellungen/useTextDarstellung';
import { useAppAkzentfarbe } from '@/hooks/einstellungen/useAppAkzentfarbe';
import { useGesetzestextAkzentfarbe } from '@/hooks/einstellungen/useGesetzestextAkzentfarbe';
import { useHervorhebungsfarbe } from '@/hooks/einstellungen/useHervorhebungsfarbe';
import { useMarkierungenDeaktiviert } from '@/hooks/einstellungen/useMarkierungenDeaktiviert';
import { useMinimalistischerModus } from '@/hooks/einstellungen/useMinimalistischerModus';
import { useSeitenleistenTastenkuerzel } from '@/hooks/einstellungen/useSeitenleistenTastenkuerzel';
import { usePlattform } from '@/hooks/utils/usePlattform';
import {
  useLinuxTitelleistenPraeferenz,
  linuxTitelleistenPraeferenzSofortAnwenden,
} from '@/hooks/einstellungen/useLinuxTitelleistenPraeferenz';
import { usePlattformfremdeUiAnzeigen } from '@/hooks/einstellungen/usePlattformfremdeUiAnzeigen';

export function useHauptfensterDarstellung() {
  const {
    schriftgroesse,
    leistenSchriftgroesse,
    schriftart,
    zeilenabstand,
    satzNeuZeile,
    blocksatz,
    silbentrennung,
    randbreite,
    strukturKontextLeisteGroesse,
    lesbareZeilenlaenge,
    lesbareZeilenlaengeBreite,
  } = useTextDarstellung();
  const { markierungenDeaktiviert, markierungenDeaktiviertRef } = useMarkierungenDeaktiviert();
  const { minimalistischerModus } = useMinimalistischerModus();
  const { istLinux } = usePlattform();
  const { linuxTitelleistenPraeferenz, setLinuxTitelleistenPraeferenz } =
    useLinuxTitelleistenPraeferenz();
  // Seit dem Hamburger-Dropdown-Menü (Tableiste.tsx) wieder gebraucht: lässt
  // den ☰-Button auch auf macOS wie unter Windows/Linux das Dropdown öffnen,
  // zu Testzwecken (siehe Absprache).
  const { plattformfremdeUiAnzeigen } = usePlattformfremdeUiAnzeigen();
  // Übernimmt die Präferenz-Änderung nicht nur in den State (für Tableiste.tsx), sondern
  // wendet sie – sofern unter Linux – auch sofort auf DIESES Fenster an, statt erst beim
  // nächsten Fenster-Start (siehe linuxTitelleistenPraeferenzSofortAnwenden() für die
  // genaue Plattformprüfung). Nur noch für den Erstlauf-Dialog
  // (LinuxTitelleistenAbfrage) relevant – die Einstellungen selbst laufen
  // seit der Umstellung auf ein eigenes Fenster nicht mehr über diese
  // Funktion (siehe EinstellungenFenster.tsx: dort wird bewusst NUR
  // setLinuxTitelleistenPraeferenz aufgerufen, siehe Kommentar dort).
  function linuxTitelleistenPraeferenzAendern(praeferenz: 'nativ' | 'eigene') {
    setLinuxTitelleistenPraeferenz(praeferenz);
    void linuxTitelleistenPraeferenzSofortAnwenden();
  }
  const { leistenTauschen } = useLeistenTauschen();
  const { seitenleistenTastenkuerzel } = useSeitenleistenTastenkuerzel();
  // Ersetzt den vormaligen systemfarbeAnwenden()-Aufruf (macOS-Systemfarbe-
  // Import, entfällt – siehe Absprache): eigener CSS-Seiteneffekt
  // (data-app-akzent).
  useAppAkzentfarbe();

  // Werte selbst (hervorhebungsfarbe usw.) werden im Hauptfenster nirgends
  // mehr gelesen (nur noch im Einstellungen-Fenster, siehe
  // EinstellungenFenster.tsx) – der Hook-Aufruf bleibt trotzdem stehen,
  // damit sein interner CSS-Seiteneffekt (--hervorheben-bg) weiterhin im
  // Hauptfenster läuft, siehe Kopfkommentar in useHervorhebungsfarbe.ts.
  useHervorhebungsfarbe();
  // Gleiches Prinzip wie useHervorhebungsfarbe() oben: nur der interne
  // CSS-Seiteneffekt (--aktiv-element/-blass) wird hier gebraucht.
  useGesetzestextAkzentfarbe();

  return {
    textDarstellung: {
      schriftgroesse,
      leistenSchriftgroesse,
      schriftart,
      zeilenabstand,
      satzNeuZeile,
      blocksatz,
      silbentrennung,
      randbreite,
      strukturKontextLeisteGroesse,
      lesbareZeilenlaenge,
      lesbareZeilenlaengeBreite,
    },
    markierungenDeaktiviert,
    markierungenDeaktiviertRef,
    minimalistischerModus,
    istLinux,
    linuxTitelleistenPraeferenz,
    linuxTitelleistenPraeferenzAendern,
    plattformfremdeUiAnzeigen,
    leistenTauschen,
    seitenleistenTastenkuerzel,
  };
}
