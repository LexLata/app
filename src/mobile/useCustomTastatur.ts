// useCustomTastatur.ts
//
// Kapselt das Verhalten, das für JEDEN Input mit Custom-Tastatur gleich ist:
// native Bildschirmtastatur unterdrücken, Custom-Tastatur bei Fokus
// einblenden, Text direkt im vom Aufrufer verwalteten State manipulieren
// (kein eigener Text-State hier, siehe Plan Punkt 2/3).
//
// Native Tastatur unterdrücken: `readOnly` auf dem <input> ist – anders als
// `inputMode="none"` allein – sowohl auf iOS (WKWebView) als auch auf
// Android (WebView/Chrome) zuverlässig wirksam, siehe Recherche zum Plan.
// `inputMode="none"` wird zusätzlich gesetzt (schadet nicht, hilft auf
// manchen Plattformen zusätzlich). Der Input bleibt fokussierbar/tippbar,
// nur eben ohne native Tastatur.
//
// Cursor-Position: `readOnly`-Inputs erlauben weiterhin Tippen zum
// Positionieren des nativen Cursors (`selectionStart`/`selectionEnd`
// funktionieren normal). Wir lesen die Position bei Tap/Fokus aus dem Input
// aus (`cursorPosition`-State) und setzen sie nach jeder Eingabe über die
// Custom-Tastatur programmatisch zurück auf den Input, damit der sichtbare
// native Cursor synchron zum Text bleibt.
//
// Cursor per Ziehen verschieben: die native "Lupe" zum Verschieben des
// Cursors in editierbarem Text ist Browser-/OS-Verhalten für editierbare
// Felder und bei readOnly-Inputs plattformübergreifend nicht zuverlässig
// (gleiches Problem wie beim blinkenden Caret). Wir bilden das daher
// pragmatisch selbst nach: bei Pointer-Down+Move auf dem Input wird die
// Cursor-Position laufend aus der x-Koordinate berechnet (Zeichenbreiten
// per Canvas gemessen, mit der Font des Inputs) und direkt gesetzt.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

interface UseCustomTastaturParams {
  aktiv: boolean;
  wert: string;
  onWertAendern: (neuerWert: string) => void;
  /** Ref auf das <input>-Element, um den nativen Cursor zu lesen/zu setzen. */
  inputRef: RefObject<HTMLInputElement | null>;
}

export function useCustomTastatur({
  aktiv,
  wert,
  onWertAendern,
  inputRef,
}: UseCustomTastaturParams) {
  const [sichtbar, setSichtbar] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(wert.length);

  // Merkt sich, ob die Cursor-Position gerade von uns selbst gesetzt wurde
  // (Custom-Tastatur), um sie nach dem Value-Update erneut auf den Input
  // anzuwenden – bei readOnly-Inputs springt der native Cursor sonst nicht
  // automatisch mit, wenn sich `value` programmatisch ändert.
  const pendingCursorSync = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCursorSync.current === null) return;
    const position = pendingCursorSync.current;
    pendingCursorSync.current = null;
    const el = inputRef.current;
    if (el) {
      el.setSelectionRange(position, position);
    }
  }, [wert, inputRef]);

  const cursorAusInputLesen = useCallback(() => {
    const el = inputRef.current;
    const position = el?.selectionStart;
    setCursorPosition(position != null ? position : wert.length);
  }, [wert, inputRef]);

  // Canvas einmalig anlegen (nur zum Messen von Textbreiten, wird nie
  // gerendert) – vermeidet DOM-Layout-Messungen (fehleranfällig, siehe der
  // vorherige Bug mit dem gepolsterten Mirror-Span).
  const messCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (messCanvasRef.current == null) {
    messCanvasRef.current = document.createElement('canvas');
  }

  const positionAusXBerechnen = useCallback(
    (clientX: number): number => {
      const el = inputRef.current;
      if (!el) return cursorPosition;
      const ctx = messCanvasRef.current!.getContext('2d');
      if (!ctx) return cursorPosition;
      ctx.font = window.getComputedStyle(el).font;
      const rect = el.getBoundingClientRect();
      const paddingLeft = parseFloat(window.getComputedStyle(el).paddingLeft) || 0;
      // + el.scrollLeft: die x-Koordinate des Fingers ist relativ zum
      // sichtbaren Ausschnitt, die Textbreiten-Messung aber immer relativ zum
      // unverschobenen Textanfang (Position 0) – das muss zusammenpassen,
      // sobald der Text automatisch gescrollt wurde (siehe unten).
      const xImText = clientX - rect.left - paddingLeft + el.scrollLeft;

      let naehestePosition = 0;
      let kleinsteDistanz = Infinity;
      for (let i = 0; i <= wert.length; i++) {
        const breite = ctx.measureText(wert.slice(0, i)).width;
        const distanz = Math.abs(breite - xImText);
        if (distanz < kleinsteDistanz) {
          kleinsteDistanz = distanz;
          naehestePosition = i;
        }
      }
      return naehestePosition;
    },
    [wert, cursorPosition, inputRef],
  );

  // Randzone zum automatischen Weiterscrollen beim Ziehen (in Pixel) und
  // wie viel pro Zieh-Bewegung nachgeschoben wird.
  const SCROLL_RANDZONE_PX = 24;
  const SCROLL_SCHRITT_PX = 10;

  const scrollBeimZiehenPruefen = useCallback(
    (clientX: number) => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (clientX - rect.left < SCROLL_RANDZONE_PX) {
        el.scrollLeft = Math.max(0, el.scrollLeft - SCROLL_SCHRITT_PX);
      } else if (rect.right - clientX < SCROLL_RANDZONE_PX) {
        // Der Browser begrenzt scrollLeft automatisch auf scrollWidth-clientWidth.
        el.scrollLeft = el.scrollLeft + SCROLL_SCHRITT_PX;
      }
    },
    [inputRef],
  );

  const ziehtGeradeRef = useRef(false);
  const cursorPositionRef = useRef(cursorPosition);
  useEffect(() => {
    cursorPositionRef.current = cursorPosition;
  }, [cursorPosition]);

  const onPointerDownInput = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      ziehtGeradeRef.current = true;
      setCursorPosition(positionAusXBerechnen(e.clientX));
    },
    [positionAusXBerechnen],
  );

  const onPointerMoveInput = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      if (!ziehtGeradeRef.current) return;
      scrollBeimZiehenPruefen(e.clientX);
      setCursorPosition(positionAusXBerechnen(e.clientX));
    },
    [positionAusXBerechnen, scrollBeimZiehenPruefen],
  );

  const onPointerUpInput = useCallback(() => {
    if (!ziehtGeradeRef.current) return;
    ziehtGeradeRef.current = false;
    // Nicht den nativen Wert nachlesen (der die Bewegung beim Ziehen bei
    // readOnly-Inputs i. d. R. nicht mitverfolgt) – stattdessen die zuletzt
    // per Ziehen berechnete Position übernehmen und dem Input mitteilen,
    // damit ein anschließender einfacher Tap wieder vom richtigen Wert
    // ausgeht.
    const el = inputRef.current;
    if (el) el.setSelectionRange(cursorPositionRef.current, cursorPositionRef.current);
  }, [inputRef]);

  const inputProps = aktiv
    ? {
        readOnly: true as const,
        inputMode: 'none' as const,
        onFocus: () => {
          setSichtbar(true);
          cursorAusInputLesen();
        },
        onClick: cursorAusInputLesen,
        onSelect: cursorAusInputLesen,
        onPointerDown: onPointerDownInput,
        onPointerMove: onPointerMoveInput,
        onPointerUp: onPointerUpInput,
      }
    : {};

  const tasteEingeben = useCallback(
    (zeichen: string) => {
      const position = Math.min(Math.max(cursorPosition, 0), wert.length);
      const neuerWert = wert.slice(0, position) + zeichen + wert.slice(position);
      const neuePosition = position + zeichen.length;
      onWertAendern(neuerWert);
      setCursorPosition(neuePosition);
      pendingCursorSync.current = neuePosition;
    },
    [wert, cursorPosition, onWertAendern],
  );

  const zeichenLoeschen = useCallback(() => {
    const position = Math.min(Math.max(cursorPosition, 0), wert.length);
    if (position === 0) return;
    const neuerWert = wert.slice(0, position - 1) + wert.slice(position);
    const neuePosition = position - 1;
    onWertAendern(neuerWert);
    setCursorPosition(neuePosition);
    pendingCursorSync.current = neuePosition;
  }, [wert, cursorPosition, onWertAendern]);

  const schliessen = useCallback(() => setSichtbar(false), []);

  return {
    /** An das <input>-Element spreaden, wenn `aktiv` true ist. */
    inputProps,
    /** Ob die CustomTastatur-Komponente gerade angezeigt werden soll. */
    tastaturSichtbar: aktiv && sichtbar,
    /** Aktuelle Cursor-Position im Text – für einen selbst gezeichneten
     *  blinkenden Cursor, da der native Caret bei readOnly-Inputs auf
     *  vielen mobilen Browsern nicht angezeigt wird. */
    cursorPosition,
    tasteEingeben,
    zeichenLoeschen,
    schliessen,
  };
}
