// SeitenleistenAktionen.tsx
//
// Icon-Button-Primitive + SVG-Icons für die UI-Alternativen zu bisher nur
// per Kurzbefehl erreichbaren Aktionen (Favorit/Lesezeichen hinzufügen,
// Auf-/Zuklappen, Öffnen-Overlay). Ausgelagert, weil sowohl
// Lesezeichenleiste.tsx (Fußzeile: alle Buttons, oder alle außer Stern)
// als auch Favoritenleiste.tsx (Fußzeile: nur der Stern,
// siehe dortige Verdrahtung) dieselben Icons/denselben Button-Stil brauchen.
//
// "Minimalistischer Modus" (useMinimalistischerModus.ts) blendet diese
// Buttons komplett aus – das entscheiden die beiden aufrufenden Leisten
// selbst (jeweils per Bedingung um <SeitenleistenButtonZeile>), nicht diese
// Datei.

import type { ReactElement } from 'react';
import { useState } from 'react';
import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { leistenButtonStil } from '@/components/tableiste/tableisteStil';
import { BUTTON_PADDING_VERTIKAL_ROH } from '@/hooks/stil/useSeitenleistenButtonHoehe';
import { useIconGroessen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { Star, BookmarkSimple, MagnifyingGlass } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Icon-Button-Primitive
// ---------------------------------------------------------------------------

const BUTTON_PADDING_HORIZONTAL_ROH = 8;

interface SeitenleistenIconButtonProps {
  icon: ReactElement;
  titel: string;
  onClick: () => void;
  disabled?: boolean;
  /** Optische Hervorhebung (siehe Suche-Button: "am wichtigsten"). */
  betont?: boolean;
  /** Verankerungspunkt für EinfuehrungsOverlay.tsx (siehe dort:
   *  data-einfuehrung-ziel-Lookup). Setzt nur ein data-Attribut, hat sonst
   *  keine Wirkung – ohne aktive Einführung folgenlos. */
  einfuehrungsZiel?: string;
  /** Während der Einführung: ist dies gerade das im aktuellen Schritt
   *  erklärte Icon? Färbt es in der App-Akzentfarbe (var(--akzent), siehe
   *  useAppAkzentfarbe.ts) statt einer Umrandung – bewusst als React-Prop
   *  statt per direkter DOM-Manipulation, sonst würde jeder Re-Render
   *  (z. B. Hover-State) die Hervorhebung wieder überschreiben. */
  hervorgehoben?: boolean;
}

export function SeitenleistenIconButton({
  icon,
  titel,
  onClick,
  disabled,
  betont,
  einfuehrungsZiel,
  hervorgehoben,
}: SeitenleistenIconButtonProps) {
  const [hover, setHover] = useState(false);
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <TextAttributElement
      element="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      disabled={disabled}
      title={titel}
      data-einfuehrung-ziel={einfuehrungsZiel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...leistenButtonStil(uiFaktor),
        padding: `${pxSkaliert(BUTTON_PADDING_VERTIKAL_ROH, uiFaktor)}px ${pxSkaliert(BUTTON_PADDING_HORIZONTAL_ROH, uiFaktor)}px`,
        width: '100%',
        outline: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        color: hervorgehoben
          ? 'var(--akzent)'
          : !disabled && hover
            ? 'var(--text-primaer)'
            : 'var(--text-sekundaer)',
        fontWeight: betont ? 700 : undefined,
      }}
    >
      {icon}
    </TextAttributElement>
  );
}

// ---------------------------------------------------------------------------
// Icons (currentColor – erben die Farbe von SeitenleistenIconButton).
// Stern/Lesezeichen/Lupe nutzen @phosphor-icons/react (Standardformen ohne
// eigene Bedeutung, konsistent mit den übrigen Icons der App). Auf-/
// Zuklappen bleiben bewusst eigene SVGs – die "Pfeilspitzen zueinander/
// voneinander weg"-Metapher gibt es in Phosphors Standard-Katalog so nicht.
// ---------------------------------------------------------------------------

export function SternIcon({ ausgefuellt }: { ausgefuellt: boolean }) {
  const iconGroessen = useIconGroessen();
  return <Star size={iconGroessen.standard} weight={ausgefuellt ? 'fill' : 'regular'} />;
}

export function LesezeichenIcon({ ausgefuellt }: { ausgefuellt: boolean }) {
  const iconGroessen = useIconGroessen();
  return <BookmarkSimple size={iconGroessen.standard} weight={ausgefuellt ? 'fill' : 'regular'} />;
}

/** Pfeilspitzen zeigen zueinander ("Lücke schließt sich") – Zuklappen. */
export function ZuklappenIcon({ groesse }: { groesse?: number | `${number}em` } = {}) {
  const iconGroessen = useIconGroessen();
  return (
    <svg
      width={groesse ?? iconGroessen.standard}
      height={groesse ?? iconGroessen.standard}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2.5l4 3 4-3" />
      <path d="M4 13.5l4-3 4 3" />
    </svg>
  );
}

/** Pfeilspitzen zeigen voneinander weg ("Lücke öffnet sich") – Aufklappen. */
export function AufklappenIcon() {
  const iconGroessen = useIconGroessen();
  return (
    <svg
      width={iconGroessen.standard}
      height={iconGroessen.standard}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5.5l4-3 4 3" />
      <path d="M4 10.5l4 3 4-3" />
    </svg>
  );
}

/** Öffnen-Overlay – bewusst kräftigerer Strich, siehe `betont` in SeitenleistenIconButton. */
export function SucheIcon({ groesse }: { groesse?: number | `${number}em` } = {}) {
  const iconGroessen = useIconGroessen();
  return <MagnifyingGlass size={groesse ?? iconGroessen.standard} weight="bold" />;
}
