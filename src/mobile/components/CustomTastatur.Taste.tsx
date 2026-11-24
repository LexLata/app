// CustomTastatur.Taste.tsx
//
// Einzelne Taste der Custom-Tastatur: Bubble-Feedback beim Drücken,
// Long-Press-Alternativen (z. B. s→ß, Auswahl per horizontaler
// Fingerbewegung, Abbruch beim Wegziehen nach unten), optionale
// Tastenwiederholung (z. B. ⌫), sowie Registrierung einer imperativen
// Steuer-Schnittstelle (TastenHandle) beim Container in CustomTastatur.tsx,
// damit Zwischenraum-Taps an die nächstgelegene Taste weitergeleitet werden
// können (siehe Bugfix-Kommentar dort).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { TastenHandle } from './CustomTastatur.types';
import { baueTastenPointerHandler } from './CustomTastatur.pointer';
import {
  LANGDRUCK_SCHWELLE_MS,
  WIEDERHOLUNG_START_MS,
  WIEDERHOLUNG_INTERVALL_MS,
  BUBBLE_NACHLEUCHT_MS,
  ABBRUCH_ABSTAND_PX,
} from './CustomTastatur.layout';

/** Shift/Caps-Lock-Symbol als echtes SVG statt Unicode-Zeichen (⇧/⇪ werden
 *  auf vielen mobilen Fonts nicht zuverlässig oder nur als Umriss
 *  dargestellt – damit war "ausgefüllt" gar nicht steuerbar). Umschaltung
 *  zwischen Umriss (inaktiv) und ausgefüllt (aktiv) läuft über `fill`;
 *  `stroke` nur im inaktiven Zustand, damit die Form zwischen beiden
 *  Zuständen identisch bleibt (kein "Aufblähen" durch zusätzlichen Rand).
 *  Caps Lock bekommt zusätzlich den Balken darunter, wie beim nativen
 *  Vorbild. */
export function ShiftIcon({ aktiv, capsLock }: { aktiv: boolean; capsLock: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" style={{ display: 'block' }}>
      <path
        d="M12 3 L20 11 H16 V19 H8 V11 H4 Z"
        fill={aktiv ? 'currentColor' : 'none'}
        stroke={aktiv ? 'none' : 'currentColor'}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {capsLock && <rect x="4" y="21" width="16" height="2" rx="0.5" fill="currentColor" />}
    </svg>
  );
}

export function Taste({
  label,
  wert,
  breiteFaktor = 1,
  onTaste,
  unterbeschriftung,
  icon,
  alternativen,
  zeigtBubble = true,
  registrieren,
  wiederholend = false,
  meldeTasteBenutzt,
}: {
  label: string;
  /** Zeichen, das bei kurzem Tap emittiert wird (falls abweichend von label). */
  wert?: string;
  breiteFaktor?: number;
  onTaste: (zeichen: string) => void;
  unterbeschriftung?: boolean;
  /** Falls gesetzt, wird statt des Text-Labels dieses Icon gerendert (z. B.
   *  das Shift/Caps-Lock-Symbol, das per SVG-fill zwischen Umriss und
   *  ausgefüllt umschaltet – siehe ShiftIcon). */
  icon?: ReactElement;
  /** Zeichen, die per Long-Press zusätzlich wählbar sind. */
  alternativen?: string[];
  /** Ob beim Drücken eine vergrößerte Zeichen-Bubble angezeigt wird
   *  (sinnvoll für Buchstaben/Zahlen/Sonderzeichen, nicht für breite
   *  Funktionstasten wie „Leerzeichen“ oder „Fertig“). */
  zeigtBubble?: boolean;
  /** Meldet dem Container-Element und die imperative Steuer-Schnittstelle
   *  dieser Taste, damit Zwischenraum-Taps weitergeleitet werden können. */
  registrieren?: (el: HTMLButtonElement, handle: TastenHandle) => void;
  /** Löst onTaste bei anhaltendem Drücken wiederholt aus (z. B. ⌫). */
  wiederholend?: boolean;
  /** Meldet der ModusUmschaltTaste (§123/ABC) NACH abgeschlossener Nutzung
   *  dieser Taste nur, DASS eine andere Taste benutzt wurde – löst selbst
   *  KEINEN Rücksprung aus. Der eigentliche Rücksprung entscheidet sich
   *  erst, wenn §123/ABC selbst losgelassen wird (siehe
   *  loescheModusHaltenUndPruefen in CustomTastatur.tsx). Dadurch bleibt
   *  die Ansicht die ganze Zeit stabil, in der §123 gehalten wird. */
  meldeTasteBenutzt?: () => void;
}) {
  const basisWert = wert ?? label;
  const [gedrueckt, setGedrueckt] = useState(false);
  const [bubbleSichtbar, setBubbleSichtbar] = useState(false);
  const [langdruckAktiv, setLangdruckAktiv] = useState(false);
  const [ausgewaehlteAlternative, setAusgewaehlteAlternative] = useState<number | null>(null);
  // Wird true, wenn beim Long-Press-Auswählen (s→ß) der Finger zu weit nach
  // unten weggezogen wird – das Popup verschwindet dann, und beim Loslassen
  // wird nichts getippt (Abbruch, wie bei nativen Tastaturen).
  const [abgebrochen, setAbgebrochen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  // Breite der Popup-Items soll exakt der tatsächlich gerenderten
  // Tastenbreite entsprechen (die variiert je nach Bildschirmbreite/Layout),
  // daher gemessen statt fest verdrahtet.
  const [tastenBreite, setTastenBreite] = useState(40);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (langdruckAktiv && buttonRef.current) {
      setTastenBreite(buttonRef.current.getBoundingClientRect().width);
    }
  }, [langdruckAktiv]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nachleuchtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wiederholStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wiederholIntervallRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (nachleuchtTimerRef.current !== null) clearTimeout(nachleuchtTimerRef.current);
      if (wiederholStartRef.current !== null) clearTimeout(wiederholStartRef.current);
      if (wiederholIntervallRef.current !== null) clearInterval(wiederholIntervallRef.current);
    };
  }, []);
  // Ref-Pattern gegen stale Closures (Projekt-Konvention): onTaste ändert
  // sich bei manchen Aufrufern bei jedem Tastendruck (z. B. onLoeschen aus
  // useCustomTastatur.ts, das über useCallback von cursorPosition abhängt).
  // Ein länger laufendes setInterval (Tastenwiederholung) würde sonst die
  // zum Start-Zeitpunkt eingefangene, schnell veraltende Funktion immer
  // wieder aufrufen statt die aktuelle.
  const onTasteRef = useRef(onTaste);
  useEffect(() => {
    onTasteRef.current = onTaste;
  });

  function wiederholungStoppen() {
    if (wiederholStartRef.current) {
      clearTimeout(wiederholStartRef.current);
      wiederholStartRef.current = null;
    }
    if (wiederholIntervallRef.current) {
      clearInterval(wiederholIntervallRef.current);
      wiederholIntervallRef.current = null;
    }
  }

  function aufraeumen() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    wiederholungStoppen();
    setGedrueckt(false);
    setLangdruckAktiv(false);
    setAusgewaehlteAlternative(null);
    setAbgebrochen(false);
  }

  // Die eigentliche Logik – unabhängig davon, ob sie durch einen echten
  // Pointer-Event auf dieser Taste selbst oder durch Weiterleitung vom
  // Container (Zwischenraum-Tap) ausgelöst wird.
  function handleDown() {
    if (nachleuchtTimerRef.current) {
      clearTimeout(nachleuchtTimerRef.current);
      nachleuchtTimerRef.current = null;
    }
    setGedrueckt(true);
    setBubbleSichtbar(true);
    setAusgewaehlteAlternative(null);
    setAbgebrochen(false);
    if (alternativen && alternativen.length > 0) {
      timerRef.current = setTimeout(() => setLangdruckAktiv(true), LANGDRUCK_SCHWELLE_MS);
    }
    if (wiederholend) {
      onTasteRef.current(basisWert); // sofortige erste Auslösung
      wiederholStartRef.current = setTimeout(() => {
        wiederholIntervallRef.current = setInterval(
          () => onTasteRef.current(basisWert),
          WIEDERHOLUNG_INTERVALL_MS,
        );
      }, WIEDERHOLUNG_START_MS);
    }
  }

  function handleMove(clientX: number, clientY: number) {
    if (!langdruckAktiv || abgebrochen) return;

    const buttonRect = buttonRef.current?.getBoundingClientRect();
    if (buttonRect && clientY > buttonRect.bottom + ABBRUCH_ABSTAND_PX) {
      setAbgebrochen(true);
      setAusgewaehlteAlternative(null);
      return;
    }

    // Auswahl rein nach horizontaler Position: das jeweils nächstgelegene
    // Popup-Item (per x-Distanz, Y wird ignoriert) ist ausgewählt – so
    // reicht eine horizontale Bewegung, unabhängig davon, ob der Finger
    // exakt auf dem Popup oder weiter unten über der Taste selbst ist.
    const optionen = popupRef.current?.querySelectorAll<HTMLElement>('[data-alt-index]');
    if (!optionen || optionen.length === 0) return;
    let naechste: string | null = null;
    let kleinsteDistanz = Infinity;
    optionen.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
      if (dx < kleinsteDistanz) {
        kleinsteDistanz = dx;
        naechste = el.getAttribute('data-alt-index');
      }
    });
    setAusgewaehlteAlternative(
      naechste != null && naechste !== '-basis-' ? Number(naechste) : null,
    );
  }

  function handleUp() {
    if (wiederholend) {
      // Auslösung ist bereits über handleDown (sofort) bzw. das
      // Wiederholungs-Intervall erfolgt – kein zusätzliches onTaste hier.
      aufraeumen();
      nachleuchtTimerRef.current = setTimeout(() => setBubbleSichtbar(false), BUBBLE_NACHLEUCHT_MS);
      meldeTasteBenutzt?.();
      return;
    }
    if (abgebrochen) {
      // Finger wurde beim Long-Press-Auswählen zu weit weggezogen –
      // abgebrochen, es wird nichts getippt. bubbleSichtbar explizit
      // zurücksetzen: aufraeumen() setzt langdruckAktiv auf false, wodurch
      // die Bubble sonst (weil sie nie ausgeblendet wurde, nur durch die
      // langdruckAktiv-Bedingung unsichtbar war) wieder erscheinen und bis
      // zum nächsten Tastendruck hängen bleiben würde.
      aufraeumen();
      setBubbleSichtbar(false);
      return;
    }
    const zeichen =
      // ausgewaehlteAlternative stammt aus handleMove über das
      // data-alt-index-Attribut, das per {i} aus
      // alternativen.map((_, i) => ...) beim Rendern gesetzt wird – daher
      // stets ein gültiger Index in alternativen.
      langdruckAktiv && ausgewaehlteAlternative != null
        ? alternativen![ausgewaehlteAlternative]!
        : basisWert;
    aufraeumen();
    // Bubble bleibt noch kurz sichtbar, statt sofort mit dem Loslassen zu
    // verschwinden – Dauer über BUBBLE_NACHLEUCHT_MS einstellbar.
    nachleuchtTimerRef.current = setTimeout(() => setBubbleSichtbar(false), BUBBLE_NACHLEUCHT_MS);
    onTaste(zeichen);
    // Nur vormerken, dass diese Taste benutzt wurde – der eigentliche
    // Rücksprung von §123/ABC entscheidet sich erst dort, beim Loslassen
    // von §123 SELBST (nicht hier).
    meldeTasteBenutzt?.();
  }

  function handleCancel() {
    aufraeumen();
  }

  // Bei jedem Render neu registrieren (nicht nur beim Mounten), damit der
  // Container immer die aktuellen Closures (mit aktuellem langdruckAktiv/
  // ausgewaehlteAlternative-State) für eine mögliche Weiterleitung hat.
  useEffect(() => {
    if (buttonRef.current && registrieren) {
      registrieren(buttonRef.current, {
        simulateDown: handleDown,
        simulateMove: handleMove,
        simulateUp: handleUp,
        simulateCancel: handleCancel,
      });
    }
  });

  const pointerHandler = baueTastenPointerHandler(buttonRef, {
    down: handleDown,
    move: handleMove,
    up: handleUp,
    cancel: handleCancel,
  });

  return (
    <button
      ref={buttonRef}
      className="custom-tastatur-taste"
      data-custom-taste
      // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: baueTastenPointerHandler liefert ausschließlich Pointer- und Kontextmenüereignisse; CustomTastatur.test.tsx prüft Ereignisprops und originale Zeichen.
      {...pointerHandler}
      style={{
        position: 'relative',
        zIndex: bubbleSichtbar || langdruckAktiv ? 2 : 0,
        flex: breiteFaktor,
        minWidth: 0,
        height: 42,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: gedrueckt ? 'var(--tastatur-hintergrund-bg)' : 'var(--tastatur-taste-bg)',
        borderRadius: 6,
        color: 'var(--text-primaer)',
        fontSize: unterbeschriftung ? 15 : 20,
        fontFamily: 'var(--schrift)',
        padding: 0,
      }}
    >
      {icon ?? <TextAnzeige text={label} />}

      {bubbleSichtbar && zeigtBubble && !langdruckAktiv ? (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 46,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--tastatur-taste-bg)',
            borderRadius: 10,
            fontSize: 30,
            fontFamily: 'var(--schrift)',
            color: 'var(--text-primaer)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <TextAnzeige text={basisWert} />
        </div>
      ) : null}

      {langdruckAktiv && !abgebrochen && alternativen ? (
        <div
          ref={popupRef}
          style={{
            // Linksbündig statt zentriert: die Basis-Option (hier "s") soll
            // exakt über der Taste erscheinen, die Alternative(n) daneben –
            // nicht das ganze Popup mittig über der Taste.
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            display: 'flex',
            background: 'var(--tastatur-taste-bg)',
            borderRadius: 8,
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}
        >
          <div
            data-alt-index="-basis-"
            style={{
              width: tastenBreite,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              color: ausgewaehlteAlternative === null ? '#fff' : 'var(--text-primaer)',
              background: ausgewaehlteAlternative === null ? 'var(--akzent)' : 'transparent',
            }}
          >
            <TextAnzeige text={basisWert} />
          </div>
          {alternativen.map((alt, i) => (
            <div
              key={alt}
              data-alt-index={i}
              style={{
                width: tastenBreite,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                color: ausgewaehlteAlternative === i ? '#fff' : 'var(--text-primaer)',
                background: ausgewaehlteAlternative === i ? 'var(--akzent)' : 'transparent',
              }}
            >
              <TextAnzeige text={alt} />
            </div>
          ))}
        </div>
      ) : null}
    </button>
  );
}
