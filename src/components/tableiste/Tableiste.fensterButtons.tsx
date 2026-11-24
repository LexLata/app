// Tableiste.fensterButtons.tsx
//
// Die drei Fenstersteuerungs-Buttons (Minimieren/Maximieren/Schließen) der
// custom Titelleiste, im Windows-11-Look nachgebildet (dünne Linie/Rechteck/
// X, schmales Button-Raster, Hover-Rot bei Schließen). Wird von Tableiste.tsx
// ganz rechts gerendert – und zwar:
//   – IMMER unter Windows (dort ist decorations:false fest in
//     tauri.windows.conf.json gesetzt, siehe Tableiste.tsx)
//   – unter Linux NUR, wenn linuxTitelleistenPraeferenz === 'eigene'
//     (siehe useLinuxTitelleistenPraeferenz.ts, useFensterRestore.ts)
// NIE unter macOS – dort übernimmt die native Ampel (siehe Ampel-Spacer in
// Tableiste.tsx) dieselbe Funktion.
//
// Eigener Datei-Zuschnitt (statt in Tableiste.tsx selbst), damit die ohnehin
// schon recht umfangreiche Tableiste.tsx nicht zusätzlich um drei SVG-Icons
// plus Maximieren/Wiederherstellen-Zustandslogik wächst.
//
// Bewusst NICHT Teil der UI-Größenskalierung (useUiGroesse/pxSkaliert):
// diese Buttons bilden natives Fenster-Chrome nach (Windows-11-Look) und
// ersetzen funktional die native, ebenfalls fest bemessene macOS-Ampel
// (siehe Ampel-Spacer in Tableiste.tsx) – analog dazu bleibt auch dieser
// Nachbau unabhängig von der Inhalts-UI-Größe konstant.

import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useEffect, useState } from 'react';

const BUTTON_BREITE = 46;

// Icon-Farbe läuft über die CSS-Eigenschaft "color" + stroke="currentColor" in den
// SVGs unten (gleiches Hover-Muster wie die übrigen Buttons in Tableiste.tsx, z.B. die
// ←/→-Verlaufsbuttons: color per Default var(--text-sekundaer), auf var(--text-primaer)
// bei Hover). NICHT hartcodiert weiß: --bg-leiste (der Hintergrund dieser Buttons) ist im
// Hellmodus #f0f0f0 – weiße Icons wären dort praktisch unsichtbar gewesen.
const BUTTON_GRUNDSTIL: React.CSSProperties = {
  width: BUTTON_BREITE,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-sekundaer)',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.1s, color 0.1s',
};

export function TableisteFensterButtons() {
  const [istMaximiert, setIstMaximiert] = useState(false);

  // Spiegelt den tatsächlichen Maximiert-Zustand des Fensters, damit das
  // Icon (Rechteck vs. doppeltes Rechteck) auch dann korrekt umschaltet,
  // wenn per Doppelklick auf die Drag-Fläche oder Betriebssystem-Kurzbefehl
  // maximiert/wiederhergestellt wird, nicht nur über den Button selbst.
  useEffect(() => {
    let abbestellen: (() => void) | undefined;
    let abgemeldet = false;

    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const fenster = getCurrentWindow();
        setIstMaximiert(await fenster.isMaximized());
        const entfernen = await fenster.onResized(async () => {
          try {
            setIstMaximiert(await fenster.isMaximized());
          } catch {
            /* Fenster ggf. bereits geschlossen */
          }
        });
        if (abgemeldet) {
          entfernen();
          return;
        }
        abbestellen = entfernen;
      } catch {
        /* nicht in Tauri-Umgebung */
      }
    })();

    return () => {
      abgemeldet = true;
      abbestellen?.();
    };
  }, []);

  async function minimieren() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }

  async function maximierenUmschalten() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().toggleMaximize();
  }

  async function schliessen() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: '100%',
        flexShrink: 0,
        marginLeft: 'auto',
      }}
    >
      <TextAttributElement
        element="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={minimieren}
        title="Minimieren"
        style={BUTTON_GRUNDSTIL}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--hover)';
          e.currentTarget.style.color = 'var(--text-primaer)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-sekundaer)';
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </TextAttributElement>

      <TextAttributElement
        element="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={maximierenUmschalten}
        title={istMaximiert ? 'Wiederherstellen' : 'Maximieren'}
        style={BUTTON_GRUNDSTIL}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--hover)';
          e.currentTarget.style.color = 'var(--text-primaer)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-sekundaer)';
        }}
      >
        {istMaximiert ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect
              x="2"
              y="0.5"
              width="7.5"
              height="7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
            <rect
              x="0.5"
              y="2"
              width="7.5"
              height="7.5"
              fill="var(--bg-leiste)"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        )}
      </TextAttributElement>

      <TextAttributElement
        element="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={schliessen}
        title="Schließen"
        style={BUTTON_GRUNDSTIL}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#e81123';
          e.currentTarget.style.color = '#ffffff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-sekundaer)';
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
          <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </TextAttributElement>
    </div>
  );
}
