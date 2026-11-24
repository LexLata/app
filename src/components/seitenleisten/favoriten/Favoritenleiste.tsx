// Favoritenleiste.tsx
// Favoritenzeilen; der gemeinsame Rahmen trägt das Layout.
import { useSyncExternalStore } from 'react';
import {
  abonniereSpeicherbareNorm,
  liesSpeicherbareNorm,
} from '@/lib/domain/aktives-element/aktives-element.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { kurzformAusBezeichnung } from '@/lib/domain/norm/norm.index';
import { useState } from 'react';
import { tastenkuerzelFuerIndex, type TastenkuerzelInfo } from './favoritenTastenkuerzel';
import type { FavoritenEintrag } from './useFavoritenleiste';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { usePlattform } from '@/hooks/utils/usePlattform';
import {
  Seitenleiste,
  type SeitenleistenRahmenProps,
} from '@/components/seitenleisten/Seitenleiste';
interface FavoritenleisteProps extends SeitenleistenRahmenProps {
  eintraege: FavoritenEintrag[];
  gesetz: Gesetzesreferenz | null;
  onKlick: (xmlId: string) => void;
  seitenleistenTastenkuerzel?: boolean;
}
export function Favoritenleiste({
  eintraege,
  gesetz,
  onKlick,
  fontGroesse = 11,
  seitenleistenTastenkuerzel = false,
  seite,
  schnellaktionen,
  schnellaktionenAnzahl,
}: FavoritenleisteProps) {
  const aktiveNorm = useSyncExternalStore(abonniereSpeicherbareNorm, liesSpeicherbareNorm);
  const { istMac } = usePlattform();
  const renderSpalte = (von: number, bis: number, lineHeight: number, paddingBlock: number) =>
    eintraege
      .slice(von, bis)
      .map((e, i) => (
        <FavoritenItem
          key={`${e.bezeichnung}-${von + i}`}
          eintrag={e}
          aktiv={
            !!gesetz &&
            !!aktiveNorm &&
            istGleichesGesetz(gesetz, aktiveNorm.gesetz) &&
            e.bezeichnung === aktiveNorm.bezeichnung
          }
          tastenkuerzel={tastenkuerzelFuerIndex(von + i, istMac)}
          fontGroesse={fontGroesse}
          lineHeight={lineHeight}
          paddingBlock={paddingBlock}
          onKlick={() => onKlick(e.xmlId)}
          kuerzelAnzeigen={seitenleistenTastenkuerzel}
        />
      ));

  return (
    <Seitenleiste
      seite={seite}
      schnellaktionen={schnellaktionen}
      schnellaktionenAnzahl={schnellaktionenAnzahl}
      fontGroesse={fontGroesse}
      anzahl={eintraege.length}
      renderSpalte={renderSpalte}
    />
  );
}

// ---------------------------------------------------------------------------
// Item-Komponente
// ---------------------------------------------------------------------------

function FavoritenItem({
  eintrag,
  aktiv,
  tastenkuerzel,
  fontGroesse,
  lineHeight,
  paddingBlock,
  onKlick,
  kuerzelAnzeigen,
}: {
  eintrag: FavoritenEintrag;
  aktiv: boolean;
  tastenkuerzel: TastenkuerzelInfo;
  fontGroesse: number;
  lineHeight: number;
  paddingBlock: number;
  onKlick: () => void;
  kuerzelAnzeigen: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <TextAttributElement
      element="button"
      onClick={onKlick}
      // Tooltip mit voller Bezeichnung und gegebenenfalls Tastenkürzel.
      title={
        kuerzelAnzeigen && tastenkuerzel.tooltip
          ? `${eintrag.bezeichnung} (${tastenkuerzel.tooltip})`
          : eintrag.bezeichnung
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        // Buchstabe linksbündig, Zahl rechtsbündig innerhalb der vollen Breite.
        // Ohne Tastenkürzel-Span (ausgeblendet) bleibt nur die Norm-Zahl übrig –
        // 'space-between' hätte dann keine Wirkung mehr (nur ein Flex-Kind)
        // und sie würde nach links rutschen statt rechtsbündig zu bleiben,
        // daher 'flex-end' in diesem Fall.
        justifyContent: kuerzelAnzeigen ? 'space-between' : 'flex-end',
        gap: kuerzelAnzeigen ? 5 : 0,
        width: '100%',
        background: 'none',
        border: 'none',
        paddingInline: 8,
        paddingBlock,
        cursor: 'pointer',
        textAlign: 'right',
      }}
    >
      {/* Ohne aktivierte Seitenleisten-Tastenkürzel entfällt die Kürzelspalte. */}
      {kuerzelAnzeigen && (
        <TextAnzeige
          element="span"
          text={tastenkuerzel.buchstabe || 'a'}
          style={{
            fontSize: 0.7 * fontGroesse,
            lineHeight: 1,
            fontFamily: 'var(--schrift)',
            color: 'var(--text-sekundaer)',
            fontStyle: tastenkuerzel.kursiv ? 'italic' : 'normal',
            userSelect: 'none',
            flexShrink: 0,
            // Mindestbreite damit die Zahl bei fehlendem Tastenkürzel trotzdem rechts bleibt.
            minWidth: tastenkuerzel.buchstabe ? undefined : 0,
            visibility: tastenkuerzel.buchstabe ? 'visible' : 'hidden',
          }}
        />
      )}
      {/* Norm-Zahl: rechtsbündig, primäre Farbe, Hover → Akzentfarbe */}
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
