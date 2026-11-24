// textanzeige.types.ts
// Öffentliche Eingaben für zustandslose Textanzeigen und intrinsische Attributträger.
import type { ComponentPropsWithRef, CSSProperties } from 'react';

export type TextElement = keyof HTMLElementTagNameMap;
export type TextAttributElementProps<E extends TextElement> = {
  element: E;
} & ComponentPropsWithRef<E>;

/** Geordneter, nicht leerer Bereich [von, bis) im ursprünglichen UTF-16-Text. */
export interface HervorhebungsBereich {
  von: number;
  bis: number;
}

export type TextAnzeigeProps<E extends TextElement = 'span'> = {
  element?: E;
  text: string | number;
  modus?: 'allgemein' | 'zitat';
  hervorhebungen?: readonly HervorhebungsBereich[];
  hervorhebungStil?: CSSProperties;
} & Omit<ComponentPropsWithRef<E>, 'children'>;
