// MobileSeitenleiste.tsx
// Schmale Seitenleiste rechts, ausschließlich in der Textansicht sichtbar
// (in der Suche wäre ein Icon zurück zur Suche sinnlos) – siehe Mobile-Plan,
// "Offene, bereits getroffene Detailentscheidungen". v1 hat nur den einen
// Button; weitere Icons (z.B. später Markierungen/Favoriten) reihen sich
// hier ein, wenn ein zweiter Anwendungsfall entsteht.

import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
interface MobileSeitenleisteProps {
  onOeffnenOverlayOeffnen: () => void;
  onEinstellungenOeffnen: () => void;
  /** Seitenlänge der Touch-Targets in px, einstellbar (30–60, siehe
   *  useMobileEinstellungen.ts). Default 44 = bisheriger Fixwert. */
  groesse?: number;
}

export function MobileSeitenleiste({
  onOeffnenOverlayOeffnen,
  onEinstellungenOeffnen,
  groesse = 44,
}: MobileSeitenleisteProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: 8,
        width: groesse + 8,
        flexShrink: 0,
        height: '100%',
        borderLeft: '1px solid var(--rahmen)',
        background: 'var(--bg-leiste)',
      }}
    >
      <TextAttributElement
        element="button"
        onClick={onEinstellungenOeffnen}
        aria-label="Einstellungen"
        style={{
          width: groesse,
          height: groesse,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderRadius: 8,
          color: 'var(--text-primaer)',
          fontSize: groesse * 0.5,
          marginBottom: 4,
        }}
      >
        ☰
      </TextAttributElement>

      <TextAttributElement
        element="button"
        onClick={onOeffnenOverlayOeffnen}
        aria-label="Gesetz oder Norm öffnen"
        style={{
          width: groesse,
          height: groesse,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          borderRadius: 8,
          color: 'var(--text-primaer)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="8.5" cy="8.5" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <line
            x1="13.2"
            y1="13.2"
            x2="18"
            y2="18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </TextAttributElement>
    </div>
  );
}
