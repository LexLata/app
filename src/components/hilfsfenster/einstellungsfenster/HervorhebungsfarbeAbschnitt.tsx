// HervorhebungsfarbeAbschnitt.tsx
// Einstellungen-Abschnitt: Markierungsfarbe (betrifft alle Markierungsarten
// im Gesetzestext, siehe useHervorhebungsfarbe.ts). Keine eigene Vorschau
// (eigenes Fenster, siehe EinstellungenFenster.tsx – die Wirkung ist direkt
// im Hauptfenster sichtbar, sobald die Farbe geändert wird), das
// Farbquadrat im Dropdown selbst zeigt die Farbe aber schon.
//
// Zeile nutzt EinstellungenZeile.tsx (siehe dort – Vereinheitlichung der
// Zeilenhöhe/-abstände, vormals hier per lokal dupliziertem Wrapper-Div).

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import type { Farbwahl } from '@/lib/einstellungen/einstellungen.index';
import { FarbAuswahlDropdown } from '@/components/hilfsfenster/einstellungsfenster/FarbAuswahlDropdown';
import { EinstellungenZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenZeile';

interface HervorhebungsfarbeAbschnittProps {
  hervorhebungsfarbe: Farbwahl;
  onHervorhebungsfarbeAendern: (wert: Farbwahl) => void;
}

export function HervorhebungsfarbeAbschnitt({
  hervorhebungsfarbe,
  onHervorhebungsfarbeAendern,
}: HervorhebungsfarbeAbschnittProps) {
  const textRollen = useTextRollen();
  return (
    <EinstellungenZeile
      label={
        <TextAnzeige
          element="label"
          htmlFor="markierungsfarbe-select"
          style={{ ...textRollen.standardtext }}
          text="Markierungsfarbe"
        />
      }
    >
      <FarbAuswahlDropdown
        id="markierungsfarbe-select"
        wert={hervorhebungsfarbe}
        onAendern={onHervorhebungsfarbeAendern}
        previewVar="--markierungsfarbe"
      />
    </EinstellungenZeile>
  );
}
