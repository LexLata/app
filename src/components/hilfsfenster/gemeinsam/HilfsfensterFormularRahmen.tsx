// HilfsfensterFormularRahmen.tsx
// Gemeinsam begrenztes Formular für Kommentar und Verweismarkierung; Aktionen bleiben sichtbar.
import { useRef, type ReactElement, type RefObject } from 'react';
import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { fensterAussenPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import {
  useDynamischeFensterGroesse,
  useHilfsfensterAktionsZeilenStil,
} from './hilfsfensterGroesse';

/** Platz für den Fokusrahmen von Eingabefeldern im Scrollbereich. */
const FOKUSRAHMEN_RESERVE = 4;

interface HilfsfensterFormularRahmenProps {
  inhaltRef: RefObject<HTMLDivElement | null>;
  beschriftung: string;
  aktionen: ReactElement;
  children: ReactElement | (ReactElement | null)[];
}
export function HilfsfensterFormularRahmen({
  inhaltRef,
  beschriftung,
  aktionen,
  children,
}: HilfsfensterFormularRahmenProps) {
  const formularRef = useRef<HTMLDivElement>(null);
  const buttonZeileRef = useRef<HTMLDivElement>(null);
  const faktor = useUiSkalierungsFaktor();
  const abstaende = useAbstandRollen();
  const aktionsZeilenStil = useHilfsfensterAktionsZeilenStil();
  useDynamischeFensterGroesse(inhaltRef, buttonZeileRef, formularRef);
  return (
    <div
      ref={inhaltRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: abstaende.gross,
        padding: fensterAussenPadding(faktor),
        boxSizing: 'border-box',
        maxHeight: '100vh',
        background: 'var(--bg-haupt)',
        color: 'var(--text-primaer)',
        fontFamily: 'var(--schrift)',
      }}
    >
      <TextAttributElement
        element="div"
        role="region"
        aria-label={beschriftung}
        tabIndex={0}
        style={{
          // Innenabstand mit gleich großem Gegenrand: Der Scrollbereich schneidet
          // sonst den Fokusrahmen des Textfelds ab; das Layout bleibt unverändert.
          minHeight: 0,
          overflowY: 'auto',
          padding: pxSkaliert(FOKUSRAHMEN_RESERVE, faktor),
          margin: -pxSkaliert(FOKUSRAHMEN_RESERVE, faktor),
        }}
      >
        <div
          ref={formularRef}
          style={{ display: 'flex', flexDirection: 'column', gap: abstaende.gross }}
        >
          {children}
        </div>
      </TextAttributElement>
      <div ref={buttonZeileRef} style={{ ...aktionsZeilenStil, flexShrink: 0 }}>
        {aktionen}
      </div>
    </div>
  );
}
