// CustomTastatur.pointer.ts
// Bündelt Pointer- und Mausereignisse der mobilen Bildschirmtastatur.

import type { MouseEvent, PointerEvent, RefObject } from 'react';

export function baueTastenPointerHandler(
  buttonRef: RefObject<HTMLButtonElement | null>,
  handler: {
    down: (clientX: number, clientY: number) => void;
    move: (clientX: number, clientY: number) => void;
    up: () => void;
    cancel: () => void;
  },
) {
  return {
    onPointerDown(e: PointerEvent<HTMLButtonElement>) {
      e.preventDefault();
      try {
        buttonRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // Die Taste bleibt für Down/Up an derselben Stelle funktionsfähig.
      }
      handler.down(e.clientX, e.clientY);
    },
    onPointerMove(e: PointerEvent<HTMLButtonElement>) {
      handler.move(e.clientX, e.clientY);
    },
    onPointerUp: handler.up,
    onPointerCancel: handler.cancel,
    onContextMenu(e: MouseEvent<HTMLButtonElement>) {
      e.preventDefault();
    },
  };
}
