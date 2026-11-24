// OverlayRahmen.tsx
// Zentrale Shell für alle Overlays der App: Backdrop + Panel.
// Zwei visuelle Varianten:
//   'standard' – leichtes Blur, für Info- und Aktions-Overlays
//   'suche'    – stärkeres Blur und Schatten, für GesetzesucheOverlay und VolltextSucheOverlay
//
// Escape-Handling ist eingebaut (via useEscapeKey).
// kannSchliessen=false sperrt sowohl Escape als auch Backdrop-Klick (z. B. während Import läuft).
//
// Abstand zum oberen Rand: FEST auf 12.5vh (= 1/8 der Fensterhöhe) – bewusst
// als reine CSS-vh-Einheit statt einer Pixelzahl, damit sie sich ohne
// Resize-Listener/eigenen State automatisch mit der Fensterhöhe mitskaliert.
// Zusammen mit dem Höhenlimit unten (maxHeight: 75vh = 3/4 der Seite) ergibt
// das garantiert 12.5vh + 75vh = 87.5vh ≤ 100vh – das Overlay passt also
// IMMER vollständig ins Fenster, auch bei sehr kleinen Fenstern (vorher
// konnte ein fester Pixel-paddingTop bei kleinem Fenster zusammen mit der
// 75vh-Grenze über die Fensterhöhe hinausragen). War vorher ein Prop mit
// uneinheitlichen Werten (80/100px) ohne erkennbaren inhaltlichen Grund pro
// Overlay – siehe Absprache Overlay-Vereinheitlichung.

import React, { useEffect } from 'react';
import { useEscapeKey } from '@/hooks/utils/useEscapeKey';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';

const PADDING_TOP_VH = '12.5vh';

// Standardisierte Breiten-Stufen (siehe Absprache – vorher 8 verschiedene,
// ungovernte Werte zwischen 420 und 600 ohne erkennbaren inhaltlichen
// Grund pro Overlay, analog zum früheren paddingTop-Fall oben).
export const OVERLAY_BREITE_KOMPAKT = 420;
export const OVERLAY_BREITE_NORMAL = 500;
export const OVERLAY_BREITE_GROSS = 560;

interface OverlayRahmenProps {
  onSchliessen: () => void;
  /** Breite des inneren Panels in Pixeln (unskalierter Rohwert – wird intern
   *  mit dem UI-Größenfaktor multipliziert, siehe pxSkaliert()). */
  breite: number;
  /** z-index des Overlays. Standard: 1000 */
  zIndex?: number;
  /** Visuelle Variante. Standard: 'standard' */
  variante?: 'standard' | 'suche';
  /**
   * false: Backdrop-Klick und Escape schließen nicht (z. B. während Ladevorgang).
   * Standard: true
   */
  kannSchliessen?: boolean;
  /** Zusätzliche Styles für das innere Panel (z. B. maxHeight) */
  panelStyle?: React.CSSProperties;
  /** Reiner Layoutslot; Textblätter werden vom jeweiligen Inhalt angezeigt. */
  children: React.ReactElement | React.ReactElement[];
}

export function OverlayRahmen({
  onSchliessen,
  breite,
  zIndex = 1000,
  variante = 'standard',
  kannSchliessen = true,
  panelStyle,
  children,
}: OverlayRahmenProps) {
  useEscapeKey(onSchliessen, !kannSchliessen);
  const uiFaktor = useUiSkalierungsFaktor();

  // Wenn ein Overlay über die macOS-Menüleiste geöffnet wird, behält die
  // Menüleiste den OS-Fensterfokus. Das WebView hat zwar DOM-Fokus, aber
  // Tastatureingaben und Escape kommen nicht an. setFocus() gibt den
  // OS-Fensterfokus explizit ans WebView zurück.
  useEffect(() => {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setFocus())
      .catch(() => {
        /* außerhalb von Tauri – kein Fehler */
      });
  }, []);

  const istSuche = variante === 'suche';

  return (
    <div
      // data-overlay-aktiv: einziger zentraler Marker für "irgendein Overlay
      // ist offen" – wird von PfeilNavigation.ts per document.querySelector
      // abgefragt, um Kollisionen mit den eigenen ArrowUp/Down-Handlern der
      // Such-Overlays (OeffnenOverlay, VolltextSucheOverlay,
      // Gesetzesuebersicht) zu vermeiden, ohne dass Gesetzestextansicht/App.tsx
      // den Offen-Zustand jedes einzelnen Overlays kennen müsste.
      data-overlay-aktiv="true"
      onClick={kannSchliessen ? onSchliessen : undefined}
      style={
        {
          position: 'fixed',
          inset: 0,
          background: istSuche ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.45)',
          backdropFilter: istSuche ? 'blur(6px)' : 'blur(4px)',
          WebkitBackdropFilter: istSuche ? 'blur(6px)' : 'blur(4px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: PADDING_TOP_VH,
          zIndex,
        } as React.CSSProperties
      }
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: pxSkaliert(breite, uiFaktor),
          // Erzwingt einen sichtbaren Rand zum Fensterrand, auch wenn
          // breite >= Fensterbreite ist (z. B. schmales Fenster + neu
          // verbreitertes Einstellungsfenster) – sonst stößt das Panel
          // bündig an den Rand und wirkt nicht mehr wie ein schwebendes
          // Overlay. 48px = 24px Rand auf jeder Seite.
          maxWidth: `calc(100vw - ${pxSkaliert(48, uiFaktor)}px)`,
          // Einheitliches Höhenlimit für alle Overlays: maximal 3/4 der
          // Seite, darüber scrollt der jeweilige Overlay-Inhalt intern
          // (siehe flex:1/minHeight:0/overflowY:'auto' in den einzelnen
          // Overlay-Komponenten). Über panelStyle.maxHeight überschreibbar.
          maxHeight: '75vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--rahmen)',
          borderRadius: istSuche ? 14 : 12,
          boxShadow: istSuche ? '0 24px 80px rgba(0,0,0,0.45)' : '0 24px 64px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
