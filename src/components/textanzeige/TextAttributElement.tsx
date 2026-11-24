// TextAttributElement.tsx
// Schützt nur sichtbare Textattribute; DOM-Props, Eingabewerte und Layout bleiben erhalten.
import { erzeugeTextAttributElement } from './textanzeige.attribute';
import type { TextAttributElementProps, TextElement } from './textanzeige.types';

export function TextAttributElement<E extends TextElement>({
  element,
  ...props
}: TextAttributElementProps<E>) {
  return erzeugeTextAttributElement(element, props);
}
