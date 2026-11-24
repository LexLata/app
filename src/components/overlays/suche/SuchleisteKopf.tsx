// SuchleisteKopf.tsx
//
// Gemeinsame "Kopfzeile" der beiden Suchleisten-Overlays (OeffnenOverlay,
// VolltextSucheOverlay): Eingabefeld + Lösch-Kreuz. Vorher in beiden Dateien
// bis auf den Platzhaltertext identisch dupliziert (inkl. des Lösch-Icons als
// eigenes Inline-SVG) – siehe Absprache Overlay-Vereinheitlichung.
//
// Bewusst KEIN Titel/Icon/Schließen-Kreuz wie OverlayKopfzeile (standard/):
// die Suchleisten-Overlays schließen ausschließlich per Escape, siehe
// jeweiliger OverlayRahmen-Aufruf.

import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import type { RefObject } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayKopfPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

interface SuchleisteKopfProps {
  value: string;
  onChange: (wert: string) => void;
  platzhalter: string;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** DOM-Marker für die Einführungstour (siehe EinfuehrungsOverlay.teilaktionen.ts)
   *  – nur bei OeffnenOverlay gesetzt. */
  dataEinfuehrungZiel?: string;
}

export function SuchleisteKopf({
  value,
  onChange,
  platzhalter,
  disabled = false,
  inputRef,
  dataEinfuehrungZiel,
}: SuchleisteKopfProps) {
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.gross,
        padding: overlayKopfPadding(uiFaktor),
        flexShrink: 0,
        // Trennlinie zum Inhalt darunter fester Bestandteil der Kopfzeile
        // selbst (Bugfix) – vorher eine separate <OverlayTrennlinie/> je
        // Verwendungsstelle, deren Sichtbarkeit vom jeweiligen Listenzustand
        // abhing und beim Wechsel der markierten Zeile optisch mit der
        // Hervorhebung der ersten Ergebniszeile verschmelzen konnte. Jetzt
        // immer vorhanden, unabhängig von Liste/Auswahl – die Zeilen
        // darunter bleiben nur für die Trennlinie UNTER sich zuständig.
        borderBottom: '1px solid var(--rahmen)',
      }}
    >
      <TextAttributElement
        element="input"
        ref={inputRef}
        data-einfuehrung-ziel={dataEinfuehrungZiel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={platzhalter}
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          padding: 0,
          outline: 'none',
          fontSize: pxSkaliert(17, uiFaktor),
          color: 'var(--text-primaer)',
          fontFamily: 'var(--schrift)',
        }}
      />

      {value && !disabled && (
        <TextAttributElement
          element="button"
          onClick={() => {
            onChange('');
            inputRef?.current?.focus();
          }}
          title="Eingabe löschen"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--symbol-gedaempft)',
            fontSize: pxSkaliert(16, uiFaktor),
            padding: 0,
            lineHeight: 1,
            display: 'flex',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primaer)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--symbol-gedaempft)')}
        >
          <svg
            width={pxSkaliert(16, uiFaktor)}
            height={pxSkaliert(16, uiFaktor)}
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.35" />
            <line
              x1="5.5"
              y1="5.5"
              x2="10.5"
              y2="10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="10.5"
              y1="5.5"
              x2="5.5"
              y2="10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </TextAttributElement>
      )}
    </div>
  );
}
