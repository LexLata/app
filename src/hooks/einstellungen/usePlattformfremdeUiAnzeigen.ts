// usePlattformfremdeUiAnzeigen.ts
//
// Debug-/Vorschau-Einstellung: zeigt in Einstellungen.tsx zusätzlich
// UI-Elemente an, die eigentlich nur auf einer anderen Plattform sichtbar
// wären (aktuell: der Linux-Titelleisten-Abschnitt, siehe
// useLinuxTitelleistenPraeferenz.ts). Wirkt sich seit dem Hamburger-
// Dropdown-Menü zusätzlich auf Tableiste.tsx aus: lässt dort den ☰-Button
// auch auf macOS testweise das Windows/Linux-Dropdown statt direkt
// "Gesetze verwalten" öffnen (siehe zeigeDropdownMenu in Tableiste.tsx).
//
// Default deaktiviert, damit reguläre Nutzer nur plattformrelevante
// Einstellungen sehen.

import { PLATTFORMFREMDE_UI_KEY as AKTIVIERT_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export function usePlattformfremdeUiAnzeigen() {
  const [plattformfremdeUiAnzeigen, setPlattformfremdeUiAnzeigen] = useLocalStorageState<boolean>(
    AKTIVIERT_KEY,
    false,
    {
      parse: (roh) => roh === 'true',
    },
  );

  return { plattformfremdeUiAnzeigen, setPlattformfremdeUiAnzeigen };
}
