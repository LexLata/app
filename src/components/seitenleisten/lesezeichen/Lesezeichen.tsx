// Zeichnet die Gesetzesköpfe und anklickbaren Einträge der Lesezeichenleiste.
import { kurzformAusBezeichnung } from '@/lib/domain/norm/norm.index';
import { useState } from 'react';
import type { Lesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { GAP_KOPF, type TastenkuerzelInfo } from './lesezeichenHilfen';

// ---------------------------------------------------------------------------
// Kopfzeile-Komponente (Gesetzesname)
// ---------------------------------------------------------------------------

export function LesezeichenKopf({
  text,
  ersteGesetzeszeile,
  ersteZeile,
  folgezeilenReduktion,
  fontGroesse,
  lineHeight,
  paddingBlock,
}: {
  text: string;
  ersteGesetzeszeile: boolean;
  ersteZeile: boolean;
  folgezeilenReduktion: number;
  fontGroesse: number;
  lineHeight: number;
  paddingBlock: number;
}) {
  return (
    <TextAnzeige
      element="div"
      text={text}
      style={{
        fontSize: fontGroesse,
        lineHeight,
        fontFamily: 'var(--schrift)',
        fontWeight: 700,
        color: 'var(--text-sekundaer)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        paddingInline: 8,
        paddingBlock,
        // Nur zusätzlichen Zwischenraum verdichten; am Minimum bleibt die volle lesbare Höhe.
        marginTop: !ersteGesetzeszeile ? -folgezeilenReduktion : ersteZeile ? 0 : GAP_KOPF,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Item-Komponente
// ---------------------------------------------------------------------------

export function LesezeichenItem({
  eintrag,
  aktiv,
  tastenkuerzel,
  fontGroesse,
  lineHeight,
  paddingBlock,
  onKlick,
  kuerzelAnzeigen,
}: {
  eintrag: Lesezeichen;
  aktiv: boolean;
  tastenkuerzel: TastenkuerzelInfo;
  fontGroesse: number;
  lineHeight: number;
  paddingBlock: number;
  onKlick: () => void;
  kuerzelAnzeigen: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  // Tooltip mit voller Bezeichnung, Gesetz und gegebenenfalls Tastenkürzel.
  const titleText = `${eintrag.bezeichnung} ${eintrag.gesetz.kurztitel}${kuerzelAnzeigen && tastenkuerzel.tooltip ? ` (${tastenkuerzel.tooltip})` : ''}`;

  return (
    <TextAttributElement
      element="button"
      onClick={onKlick}
      title={titleText}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        // Ohne Tastenkürzel-Span (ausgeblendet) bleibt nur die Bezeichnung übrig –
        // 'space-between' hätte dann keine Wirkung mehr (nur ein Flex-Kind)
        // und die Bezeichnung würde nach links rutschen statt rechtsbündig
        // zu bleiben, daher 'flex-end' in diesem Fall.
        justifyContent: kuerzelAnzeigen ? 'space-between' : 'flex-end',
        gap: kuerzelAnzeigen ? 5 : 0,
        width: '100%',
        background: 'none',
        border: 'none',
        paddingInline: 8,
        paddingBlock,
        cursor: 'pointer',
      }}
    >
      {/* Ohne aktivierte Seitenleisten-Tastenkürzel entfällt die Kürzelspalte. */}
      {kuerzelAnzeigen && (
        <TextAnzeige
          element="span"
          text={tastenkuerzel.ziffer || '0'}
          style={{
            fontSize: 0.7 * fontGroesse,
            lineHeight: 1,
            fontFamily: 'var(--schrift)',
            color: 'var(--text-sekundaer)',
            fontStyle: tastenkuerzel.kursiv ? 'italic' : 'normal',
            userSelect: 'none',
            flexShrink: 0,
            // Stabile Breite: eine Ziffer breit, damit die Norm-Zahl bündig bleibt.
            minWidth: '1ch',
            visibility: tastenkuerzel.ziffer ? 'visible' : 'hidden',
          }}
        />
      )}
      {/* Bezeichnung: rechtsbündig, Hover → Akzentfarbe (Gesetz steht in der
          Kopfzeile, wird hier nicht wiederholt) */}
      <TextAnzeige
        element="span"
        text={kurzformAusBezeichnung(eintrag.bezeichnung)}
        style={{
          fontSize: fontGroesse,
          lineHeight,
          fontFamily: 'var(--schrift)',
          color: aktiv || hovered ? 'var(--akzent)' : 'var(--text-primaer)',
          whiteSpace: 'nowrap',
          transition: 'color 0.1s',
        }}
      />
    </TextAttributElement>
  );
}
