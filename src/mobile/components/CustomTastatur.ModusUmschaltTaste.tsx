// CustomTastatur.ModusUmschaltTaste.tsx
//
// Sonderkomponente für §123/ABC – eigenständig, weil ihr Interaktionsmodell
// grundlegend anders ist als bei einer normalen Taste (Taste.tsx): sie
// schaltet die Ansicht sofort bei Drücken um, kann während des Haltens auf
// eine andere Taste im jetzt gezeigten Layout zeigen (Ziehen mit demselben
// Finger), und der Rücksprung zur ursprünglichen Ansicht entscheidet sich
// erst bei ihrem eigenen Loslassen.

import { useEffect, useRef, useState } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { TastenHandle } from './CustomTastatur.types';
import { baueTastenPointerHandler } from './CustomTastatur.pointer';

/** §123/ABC: schaltet die Ansicht SOFORT bei Drücken um (nicht erst beim
 *  Loslassen). Die Ansicht bleibt für die GESAMTE Dauer des Haltens stabil
 *  umgeschaltet – auch wenn währenddessen mit einem anderen Finger eine
 *  andere Taste benutzt wird (die wird dann ganz normal sofort getippt).
 *  Der Rücksprung zur ursprünglichen Ansicht entscheidet sich erst, wenn
 *  §123/ABC SELBST losgelassen wird: nur dann, und auch nur, wenn
 *  währenddessen tatsächlich eine andere Taste benutzt wurde, springt die
 *  Ansicht zurück (Peek-Geste, wie bei nativen Tastaturen). Ein einfacher
 *  Tap oder Halten ohne andere Taste lässt die Ansicht dauerhaft
 *  umgeschaltet. */
export function ModusUmschaltTaste({
  label,
  breiteFaktor,
  onModusWechsel,
  tastenMapRef,
  registrieren,
  setzeModusHalten,
  loescheModusHaltenUndPruefen,
}: {
  label: string;
  breiteFaktor?: number;
  onModusWechsel: () => void;
  tastenMapRef: React.RefObject<WeakMap<HTMLButtonElement, TastenHandle>>;
  registrieren: (el: HTMLButtonElement, handle: TastenHandle) => void;
  /** Registriert diese Taste als "gerade gehalten". Andere Tasten melden
   *  währenddessen nur, dass sie benutzt wurden (siehe meldeTasteBenutzt in
   *  Taste.tsx) – der Rücksprung selbst passiert erst hier, beim Loslassen. */
  setzeModusHalten: (wechselZurueck: () => void) => void;
  loescheModusHaltenUndPruefen: () => void;
}) {
  const [gedrueckt, setGedrueckt] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const letztePositionRef = useRef({ x: 0, y: 0 });

  function handleDown() {
    setGedrueckt(true);
    setzeModusHalten(onModusWechsel);
    onModusWechsel();
  }

  function handleMove(clientX: number, clientY: number) {
    letztePositionRef.current = { x: clientX, y: clientY };
  }

  function handleUp() {
    setGedrueckt(false);
    // Unterstützt weiterhin denselben Finger: zu einer Taste im jetzt
    // gezeigten anderen Layout ziehen und dort loslassen, tippt sie (das
    // meldet über meldeTasteBenutzt automatisch "benutzt = true").
    const { x, y } = letztePositionRef.current;
    const ziel = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>('[data-custom-taste]');
    if (ziel && ziel !== buttonRef.current) {
      const handle = tastenMapRef.current?.get(ziel);
      if (handle) {
        handle.simulateDown();
        handle.simulateUp();
      }
    }
    // Erst jetzt, beim Loslassen von §123 SELBST, wird entschieden, ob
    // zurückgesprungen wird (nur falls eine andere Taste benutzt wurde).
    loescheModusHaltenUndPruefen();
  }

  function handleCancel() {
    setGedrueckt(false);
    loescheModusHaltenUndPruefen();
  }

  useEffect(() => {
    if (buttonRef.current) {
      registrieren(buttonRef.current, {
        simulateDown: handleDown,
        simulateMove: handleMove,
        simulateUp: handleUp,
        simulateCancel: handleCancel,
      });
    }
  });

  const pointerHandler = baueTastenPointerHandler(buttonRef, {
    down: (clientX, clientY) => {
      letztePositionRef.current = { x: clientX, y: clientY };
      handleDown();
    },
    move: handleMove,
    up: handleUp,
    cancel: handleCancel,
  });

  return (
    <button
      ref={buttonRef}
      className="custom-tastatur-taste"
      data-custom-taste
      // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: baueTastenPointerHandler liefert ausschließlich Pointer- und Kontextmenüereignisse; CustomTastatur.test.tsx prüft Ereignisprops, Moduswechsel und Abbruch.
      {...pointerHandler}
      style={{
        flex: breiteFaktor ?? 1,
        minWidth: 0,
        height: 42,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: gedrueckt ? 'var(--tastatur-hintergrund-bg)' : 'var(--tastatur-taste-bg)',
        borderRadius: 6,
        color: 'var(--text-primaer)',
        fontSize: 15,
        fontFamily: 'var(--schrift)',
        padding: 0,
      }}
    >
      <TextAnzeige text={label} />
    </button>
  );
}
