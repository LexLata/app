// UiGroesseProvider.tsx
// Stellt UI-Größe und Skalierung gemeinsam für einen Fensterbaum bereit.

import type { ReactElement } from 'react';
import { UiGroesseContext, UI_SKALIERUNG_WERTE, useUiGroesse } from './useUiGroesse';

export function UiGroesseProvider({ children }: { children: ReactElement | ReactElement[] }) {
  const { uiGroesse, setUiGroesse } = useUiGroesse();
  const faktor = UI_SKALIERUNG_WERTE[uiGroesse];
  return (
    <UiGroesseContext.Provider value={{ uiGroesse, setUiGroesse, faktor }}>
      {children}
    </UiGroesseContext.Provider>
  );
}
