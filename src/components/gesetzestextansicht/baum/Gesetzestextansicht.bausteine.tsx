// Gesetzestextansicht.bausteine.tsx
// Textbaumrouter und virtuelle Zeilen aus dem schmalen Listenmodell.
// Virtualizer, Messplanung und Scrollzustand bleiben in der Ansichtssteuerung.

import { memo, type ReactElement } from 'react';
import type { VirtuelleTextListe } from '@/components/gesetzestextansicht/Gesetzestextansicht.renderTypes';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { STANDARD_RAND_INLINE } from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import { UeberschriftZeile } from '@/components/gesetzestextansicht/baum/ueberschriftZeile';
import { NormBlock } from '@/components/gesetzestextansicht/baum/normBlock';

// ---------------------------------------------------------------------------
// Element-Router
// ---------------------------------------------------------------------------

interface ElementBlockProps {
  element: DarstellungsElement;
  schrift: number;
  satzNeuZeile: boolean;
}

// memo: Beim Scrollen bleiben Element, Schrift und satzNeuZeile gleich; Einklappzustand,
// aktives Element und Markierungen kommen über Kontexte und lösen weiter Neuberechnung aus.
const ElementBlock = memo(function ElementBlock({
  element,
  schrift,
  satzNeuZeile,
}: ElementBlockProps) {
  switch (element.typ) {
    case 'ueberschrift':
      return <UeberschriftZeile u={element.data} schrift={schrift} satzNeuZeile={satzNeuZeile} />;
    case 'norm':
      return <NormBlock norm={element.data} schrift={schrift} satzNeuZeile={satzNeuZeile} />;
  }
});

// ---------------------------------------------------------------------------
// Virtualisierte Liste
// ---------------------------------------------------------------------------
// Rendert die von @tanstack/react-virtual berechneten sichtbaren Items als
// absolut positionierte Blöcke. Ausgelagert aus Gesetzestextansicht.tsx: reine
// Darstellung ohne eigenen State, Props kommen vollständig von oben.

interface VirtualisierteListeProps {
  modell: VirtuelleTextListe;
  schriftgroesse: number;
  satzNeuZeile: boolean;
  /** Horizontaler Rand links/rechts der Textspalte in px. Default = STANDARD_RAND_INLINE
   *  (virtualizer.ts). Mobile übergibt einen kleineren Wert, da 60px auf
   *  schmalen Displays unverhältnismäßig viel Breite kostet – siehe Gesetzestextansicht-
   *  Prop `randInline`. */
  randInline?: number;
}

export function VirtualisierteListe({
  modell,
  schriftgroesse,
  satzNeuZeile,
  randInline = STANDARD_RAND_INLINE,
}: VirtualisierteListeProps) {
  const zeilen: ReactElement[] = modell.zeilen.map((item) => {
    const element = item.element;
    return (
      <div
        key={item.key}
        data-index={item.index}
        ref={modell.messeZeile}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${item.start}px)`,
        }}
      >
        <ElementBlock element={element} schrift={schriftgroesse} satzNeuZeile={satzNeuZeile} />
      </div>
    );
  });

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        paddingInline: randInline,
        paddingBlock: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: modell.maxTextBreite === 'none' ? undefined : modell.maxTextBreite,
        }}
      >
        <div style={{ position: 'relative', height: modell.gesamtHoehe }}>{zeilen}</div>
        {/* Zusätzlicher Scroll-Puffer unterhalb des letzten Elements – fixer
            Layout-Wert, unabhängig von Schriftgröße/UI-Skalierung. */}
        {/* eslint-disable-next-line lexlata/keine-unskalierten-px -- Fester 80-Pixel-Scrollpuffer hinter dem letzten Element ermöglicht dessen Positionierung unabhängig von Schrift- und UI-Skalierung. */}
        <div style={{ height: 80 }} />
      </div>
    </div>
  );
}
