// textanzeige.attribute.ts
// Gemeinsame interne Erzeugung intrinsischer Elemente mit geschützten Textattributen.
import { createElement } from 'react';
import { schuetzeLeerzeichen } from '@/lib/domain/basis/textNachbearbeitung';
import type { TextElement } from './textanzeige.types';

const TEXTATTRIBUTE = new Set(['title', 'placeholder', 'aria-label', 'alt']);

export function erzeugeTextAttributElement(element: TextElement, props: Record<string, unknown>) {
  const geschuetzteProps = Object.fromEntries(
    Object.entries(props).map(([name, wert]) => [
      name,
      TEXTATTRIBUTE.has(name) && typeof wert === 'string' ? schuetzeLeerzeichen(wert) : wert,
    ]),
  );
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: erzeugeTextAttributElement schützt title, placeholder, aria-label und alt mit schuetzeLeerzeichen; TextAttributElement.test.tsx prüft Attribute und Originaleingaben.
  return createElement(element, geschuetzteProps);
}
