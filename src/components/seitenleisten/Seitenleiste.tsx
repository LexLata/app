// Seitenleiste.tsx
// Gemeinsamer adaptiver Rahmen; Schnellaktionen stehen in der inneren Spalte.
import { useEffect, useRef, type ReactElement } from 'react';
import {
  useAdaptivesLeistenLayout,
  type LeistenLayoutAngaben,
} from '@/hooks/utils/useAdaptivesLeistenLayout';
import { useSeitenleistenButtonHoehe } from '@/hooks/stil/useSeitenleistenButtonHoehe';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { setzeRechteLeisteBreite } from '@/hooks/seitenleisten/rechteSeitenleisteBreiteStore';

/** Lokaler Override: unterer Leistenrand unter den Schnellaktionen als Anteil
 *  von 8 px (0 = kein Rand, 1 = wie oben). */
const SCHNELLAKTIONEN_RAND_UNTEN_FAKTOR = 0.15;

export interface SeitenleistenRahmenProps {
  seite: 'links' | 'rechts';
  fontGroesse?: number;
  schnellaktionen: ReactElement | null;
  schnellaktionenAnzahl: number;
}
interface SeitenleisteProps extends SeitenleistenRahmenProps {
  anzahl: number;
  layoutAngaben?: LeistenLayoutAngaben;
  renderSpalte: (
    von: number,
    bis: number,
    lineHeight: number,
    paddingBlock: number,
    zeilenMehrhoehe: number,
  ) => ReactElement[];
}
export function Seitenleiste({
  seite,
  fontGroesse = 11,
  schnellaktionen,
  schnellaktionenAnzahl,
  anzahl,
  renderSpalte,
  layoutAngaben,
}: SeitenleisteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aeussererRef = useRef<HTMLDivElement>(null);
  const uiFaktor = useUiSkalierungsFaktor();
  const buttonHoehe = useSeitenleistenButtonHoehe();
  // Unterer Rand der Leiste; mit Schnellaktionen als Faktor von 8 px, damit der
  // Abstand trotz Eckenrundung optisch dem oberen entspricht.
  const randOben = pxSkaliert(8, uiFaktor);
  const randUnten = pxSkaliert(
    schnellaktionenAnzahl > 0 ? 8 * SCHNELLAKTIONEN_RAND_UNTEN_FAKTOR : 8,
    uiFaktor,
  );
  const {
    lineHeight,
    paddingBlock,
    zeilenMehrhoehe,
    zweiSpaltig,
    scroll,
    mitReserveAnzahl,
    teilung,
  } = useAdaptivesLeistenLayout(
    containerRef,
    anzahl,
    fontGroesse,
    schnellaktionenAnzahl * buttonHoehe + (layoutAngaben && schnellaktionenAnzahl > 0 ? 1 : 0),
    layoutAngaben,
    seite,
    randOben + randUnten,
  );
  useEffect(() => {
    if (seite !== 'rechts') return;
    const el = aeussererRef.current;
    if (!el) return;
    let aktiv = true;
    let tickAusstehend = false;
    const ro = new ResizeObserver(() => {
      if (tickAusstehend) return;
      tickAusstehend = true;
      requestAnimationFrame(() => {
        tickAusstehend = false;
        if (aktiv) setzeRechteLeisteBreite(el.offsetWidth);
      });
    });
    ro.observe(el);
    return () => {
      aktiv = false;
      ro.disconnect();
      setzeRechteLeisteBreite(0);
    };
  }, [seite]);
  const aktionsInhalt: ReactElement | null = schnellaktionen;
  const buttonBlock =
    schnellaktionenAnzahl > 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', flexShrink: 0 }}>
        <div
          style={{
            // eslint-disable-next-line lexlata/keine-unskalierten-px -- Feste 1-CSS-Pixel-Haarlinie trennt Flächen; Skalierung würde die Dicke ändern.
            height: 1,
            alignSelf: 'stretch',
            background: 'var(--rahmen)',
            margin: `0 ${pxSkaliert(5, uiFaktor)}px`,
            flexShrink: 0,
          }}
        />
        {aktionsInhalt}
      </div>
    ) : null;
  const reserveAnzahl = mitReserveAnzahl ?? Math.ceil(anzahl / 2);
  const mitte = teilung ?? (seite === 'rechts' ? reserveAnzahl : anzahl - reserveAnzahl);
  const zeilen = (von: number, bis: number) => {
    const inhalt: ReactElement[] = renderSpalte(
      von,
      bis,
      lineHeight,
      paddingBlock,
      zeilenMehrhoehe,
    );
    return inhalt;
  };
  return (
    <div
      ref={aeussererRef}
      data-einfuehrung-grenze={seite}
      style={{
        [seite === 'links' ? 'borderRight' : 'borderLeft']: '1px solid var(--rahmen)',
        background: 'var(--bg-leiste)',
        flexShrink: 0,
        width: 'max-content',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: 'max-content',
          paddingTop: randOben,
          paddingBottom: randUnten,
          overflowY: scroll ? 'auto' : 'hidden',
          overflowX: 'hidden',
          display: 'flex',
          ...(zweiSpaltig ? {} : { flexDirection: 'column' }),
        }}
      >
        {zweiSpaltig ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {zeilen(0, mitte)}
              {seite === 'rechts' && buttonBlock}
            </div>
            <div
              style={{
                // eslint-disable-next-line lexlata/keine-unskalierten-px -- Feste 1-CSS-Pixel-Haarlinie trennt Flächen; Skalierung würde die Dicke ändern.
                width: 1,
                alignSelf: 'stretch',
                background: 'var(--rahmen)',
                margin: `${pxSkaliert(2, uiFaktor)}px 0`,
                flexShrink: 0,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {zeilen(mitte, anzahl)}
              {seite === 'links' && buttonBlock}
            </div>
          </>
        ) : (
          <>
            {zeilen(0, anzahl)}
            {buttonBlock}
          </>
        )}
      </div>
    </div>
  );
}
