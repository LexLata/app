// OverlaySchliessenButton.tsx
//
// Gemeinsamer Schließen-Button (X) für Overlay-Kopfzeilen. Vorher an mehreren
// Stellen (ExportOverlay, FavoritenHinzufuegenOverlay, GesetzInfoOverlay,
// ImportindexOverlay, AktualisierenOverlay) fast wortgleich
// dupliziert – dabei fehlte überall der WebkitAppearance-Fix, der in
// tableisteStil.ts (LEISTEN_BUTTON_STIL) bereits für die Tableiste
// dokumentiert ist: macOS' WebView rendert <button> sonst mit unsichtbarem
// System-Padding, was das X optisch nicht zentriert.
//
// Bewusst als Komponente (nicht nur Style-Konstante wie LEISTEN_BUTTON_STIL):
// Icon, Klick-Handler und Stil treten hier immer zusammen auf, nie einzeln.

import type { CSSProperties } from 'react';
import { X } from '@phosphor-icons/react';
import { useIconGroessen } from '@/hooks/stil/useTextRollen';

interface OverlaySchliessenButtonProps {
  onClick: () => void;
  /** Sperrt den Button optisch und funktional (z. B. während ein Import/
   *  Export läuft) – Standard: false. */
  deaktiviert?: boolean;
}

const STIL: CSSProperties = {
  background: 'none',
  border: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
  color: 'var(--symbol-gedaempft)',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  transition: 'color 0.1s',
};

export function OverlaySchliessenButton({
  onClick,
  deaktiviert = false,
}: OverlaySchliessenButtonProps) {
  const iconGroessen = useIconGroessen();
  return (
    <button
      onClick={onClick}
      disabled={deaktiviert}
      style={{
        ...STIL,
        cursor: deaktiviert ? 'default' : 'pointer',
        opacity: deaktiviert ? 0.4 : 1,
      }}
      onMouseEnter={(e) => {
        if (!deaktiviert) e.currentTarget.style.color = 'var(--text-primaer)';
      }}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--symbol-gedaempft)')}
    >
      <X size={iconGroessen.iconButton} weight="regular" />
    </button>
  );
}
