// textDarstellung.tsx
// Lokaler Darstellungsrahmen für Gesetzestext und eigenständige Absatzvorschau.

import type { CSSProperties, ReactElement } from 'react';
import { TextDarstellungsCtx, type TextDarstellungsModell } from './textDarstellung.modell';

export function TextDarstellungsRahmen({
  modell,
  children,
  style,
}: {
  modell: TextDarstellungsModell;
  children: ReactElement | ReactElement[];
  style?: CSSProperties;
}) {
  return (
    <TextDarstellungsCtx.Provider value={modell}>
      <div lang={modell.lang} style={{ ...style, ...modell.stil }}>
        {children}
      </div>
    </TextDarstellungsCtx.Provider>
  );
}
