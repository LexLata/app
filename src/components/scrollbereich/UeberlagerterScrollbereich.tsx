// Scrollbereich mit einer überlagerten Scrollbar: die Inhaltsbreite bleibt konstant.
// Rad, Trackpad und Tastatur scrollen weiterhin den echten Browser-Scrollbereich.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type Ref,
} from 'react';

import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';

export function UeberlagerterScrollbereich({
  children,
  beschriftung,
  style,
  ref,
}: {
  children: ReactElement;
  beschriftung: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}) {
  const id = useId();
  const faktor = useUiSkalierungsFaktor();
  const inhalt = useRef<HTMLDivElement>(null);
  const [stand, setStand] = useState({ hoehe: 0, gesamt: 0, oben: 0 });
  const ziehen = useRef<{ y: number; oben: number } | null>(null);
  useEffect(() => {
    const el = inhalt.current;
    if (!el) return;
    const aktualisieren = () =>
      setStand({ hoehe: el.clientHeight, gesamt: el.scrollHeight, oben: el.scrollTop });
    const groesse = new ResizeObserver(aktualisieren);
    groesse.observe(el);
    if (el.firstElementChild) groesse.observe(el.firstElementChild);
    el.addEventListener('scroll', aktualisieren);
    aktualisieren();
    return () => {
      groesse.disconnect();
      el.removeEventListener('scroll', aktualisieren);
    };
  }, []);
  const scrollbarNoetig = stand.gesamt > stand.hoehe;
  const griffHoehe = Math.min(
    stand.hoehe,
    Math.max(Math.min(24, stand.hoehe / 2), stand.hoehe ** 2 / stand.gesamt),
  );
  const weg = stand.hoehe - griffHoehe;
  const maximal = stand.gesamt - stand.hoehe;
  function scrolle(oben: number) {
    if (inhalt.current) inhalt.current.scrollTop = Math.max(0, Math.min(maximal, oben));
  }
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TextAttributElement
        element="div"
        id={id}
        ref={(el) => {
          inhalt.current = el;
          if (typeof ref === 'function') return ref(el);
          if (ref) ref.current = el;
        }}
        className="ueberlagerter-scrollbereich"
        tabIndex={0}
        role="region"
        aria-label={beschriftung}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', ...style }}
      >
        <div>{children}</div>
      </TextAttributElement>
      {scrollbarNoetig ? (
        <TextAttributElement
          element="div"
          role="scrollbar"
          aria-label={beschriftung + ' scrollen'}
          aria-controls={id}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={maximal}
          aria-valuenow={stand.oben}
          tabIndex={0}
          style={{
            position: 'absolute',
            // Über der StrukturKontextLeiste (zIndex: 1).
            zIndex: 2,
            top: 0,
            right: 0,
            bottom: 0,
            width: pxSkaliert(8, faktor),
            touchAction: 'none',
            cursor: 'default',
          }}
          onWheel={(e) => {
            scrolle(
              stand.oben +
                e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stand.hoehe : 1),
            );
          }}
          onKeyDown={(e) => {
            const ziel = {
              ArrowDown: stand.oben + 40,
              ArrowUp: stand.oben - 40,
              PageDown: stand.oben + stand.hoehe,
              PageUp: stand.oben - stand.hoehe,
              Home: 0,
              End: maximal,
            }[e.key];
            if (ziel !== undefined) {
              e.preventDefault();
              scrolle(ziel);
            }
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const griff = e.currentTarget.firstElementChild;
            if (griff && e.target instanceof Node && !griff.contains(e.target)) {
              const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
              scrolle(((y - griffHoehe / 2) / weg) * maximal);
            }
            ziehen.current = { y: e.clientY, oben: inhalt.current?.scrollTop ?? stand.oben };
          }}
          onPointerMove={(e) => {
            if (ziehen.current)
              scrolle(ziehen.current.oben + ((e.clientY - ziehen.current.y) / weg) * maximal);
          }}
          onPointerUp={() => {
            ziehen.current = null;
          }}
          onPointerCancel={() => {
            ziehen.current = null;
          }}
          onLostPointerCapture={() => {
            ziehen.current = null;
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: pxSkaliert(1, faktor),
              width: pxSkaliert(6, faktor),
              top: maximal ? (stand.oben / maximal) * weg : 0,
              height: griffHoehe,
              background: 'var(--rahmen)',
              borderRadius: pxSkaliert(3, faktor),
            }}
          />
        </TextAttributElement>
      ) : null}
    </div>
  );
}
