// Zeigt die Verlaufspfeile und löst die Navigation im aktiven Tab aus.
import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { leistenButtonStil } from './tableisteStil';
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react';

interface VerlaufButtonsProps {
  kannVerlaufZurueck: boolean;
  kannVerlaufVorwaerts: boolean;
  onVerlaufZurueck: () => void;
  onVerlaufVorwaerts: () => void;
  istMacOS: boolean;
  uiFaktor: number;
  iconButtonGroesse: number;
}

export function VerlaufButtons({
  kannVerlaufZurueck,
  kannVerlaufVorwaerts,
  onVerlaufZurueck,
  onVerlaufVorwaerts,
  istMacOS,
  uiFaktor,
  iconButtonGroesse,
}: VerlaufButtonsProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        flexShrink: 0,
        borderRight: '1px solid var(--rahmen)',
      }}
    >
      <TextAttributElement
        element="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onVerlaufZurueck}
        disabled={!kannVerlaufZurueck}
        title={`Im Verlauf zurück (${tastenkuerzelAnzeige('verlauf-zurueck', istMacOS)})`}
        style={{
          ...leistenButtonStil(uiFaktor, 10),
          cursor: kannVerlaufZurueck ? 'pointer' : 'default',
          opacity: kannVerlaufZurueck ? 1 : 0.35,
        }}
        onMouseEnter={(e) => {
          if (kannVerlaufZurueck) e.currentTarget.style.color = 'var(--text-primaer)';
        }}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-sekundaer)')}
      >
        <ArrowLeft size={iconButtonGroesse} weight="regular" />
      </TextAttributElement>
      <TextAttributElement
        element="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onVerlaufVorwaerts}
        disabled={!kannVerlaufVorwaerts}
        title={`Im Verlauf vorwärts (${tastenkuerzelAnzeige('verlauf-vor', istMacOS)})`}
        style={{
          ...leistenButtonStil(uiFaktor, 10),
          cursor: kannVerlaufVorwaerts ? 'pointer' : 'default',
          opacity: kannVerlaufVorwaerts ? 1 : 0.35,
        }}
        onMouseEnter={(e) => {
          if (kannVerlaufVorwaerts) e.currentTarget.style.color = 'var(--text-primaer)';
        }}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-sekundaer)')}
      >
        <ArrowRight size={iconButtonGroesse} weight="regular" />
      </TextAttributElement>
    </div>
  );
}
