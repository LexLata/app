// FarbAuswahlDropdown.tsx
//
// Geteiltes Dropdown für die Farbauswahl-Einstellungen (Gesetzestext-
// Akzentfarbe, Markierungsfarbe, App-Akzentfarbe – siehe farbpalette.ts).
// Baut auf demselben <select>-Muster wie das Farbschema-Dropdown in
// AllgemeinAbschnitt.tsx auf, ergänzt um ein schreibgeschütztes
// Farbquadrat, das die aktuell gewählte Farbe direkt zeigt (native
// <option>-Elemente können selbst keine Farbe darstellen).
//
// previewVar: der CSS-Variablenname, aus dem das Quadrat seine Farbe
// bezieht (z. B. "--aktiv-element", "--markierungsfarbe", "--akzent") –
// folgt damit automatisch der jeweiligen [data-*]-Auswahl in index.css,
// ohne dass diese Komponente selbst wissen muss, welche Farbe konkret
// gemeint ist.

import type { ReactElement } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { type Farbwahl, FARBWAHL_OPTIONEN } from '@/lib/einstellungen/einstellungen.index';
import { EinstellungenSelect } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenSelect';

interface FarbAuswahlDropdownProps {
  id: string;
  wert: Farbwahl;
  onAendern: (wert: Farbwahl) => void;
  previewVar: string;
  disabled?: boolean;
}

export function FarbAuswahlDropdown({
  id,
  wert,
  onAendern,
  previewVar,
  disabled,
}: FarbAuswahlDropdownProps) {
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  // Rohwert 28 wiederverwendet aus der vormaligen Farbwahl-Vorschau (input
  // type="color") in HervorhebungsfarbeAbschnitt.tsx, statt einen neuen
  // Rohwert zu erfinden.
  const vorschauGroesse = pxSkaliert(20, uiFaktor);

  const optionen: ReactElement[] = FARBWAHL_OPTIONEN.map(({ wert: optionsWert, label }) => (
    <TextAnzeige element="option" key={optionsWert} value={optionsWert} text={label} />
  ));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.standard,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: vorschauGroesse,
          height: vorschauGroesse,
          borderRadius: pxSkaliert(5, uiFaktor),
          border: '1px solid var(--rahmen)',
          background: `var(${previewVar})`,
          flexShrink: 0,
        }}
      />
      <EinstellungenSelect
        id={id}
        value={wert}
        disabled={disabled}
        onChange={(e) => onAendern(e.target.value as Farbwahl)}
      >
        {optionen}
      </EinstellungenSelect>
    </div>
  );
}
