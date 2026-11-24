// EinstellungenCheckboxZeile.tsx
// Gemeinsame Checkbox-Zeile für Einstellungen-Abschnitte – siehe Absprache
// Zeilenabstand-Vereinheitlichung. Ersetzt den zuvor 12× wortgleich
// kopierten Checkbox-Label-Wrapper in GesetzestextAbschnitt.tsx,
// WerkzeugeAbschnitt.tsx, ErweitertAbschnitt.tsx, SeitenleistenAbschnitt.tsx,
// ZitatKopierenAbschnitt.tsx.
//
// minHeight bringt diese Zeile auf exakt dieselbe Höhe wie eine
// Dropdown-Zeile (EinstellungenZeile mit <select>): native <select>-Elemente
// (native Select-Darstellung) rendern unabhängig von
// dropdownPadding() auf eine vom Betriebssystem vorgegebene Mindesthöhe –
// per getBoundingClientRect() gemessen 21px bei UI-Größe "Normal" (siehe
// NATIVE_SELECT_HOEHE_ROH unten). Ohne diesen Ausgleich wirkten Dropdown-
// und Checkbox-Zeilen unterschiedlich hoch (siehe Nutzer-Rückmeldung) – ein
// erster Versuch über Padding+transparenten Rahmen ging von einer rein
// CSS-basierten (und wie sich zeigte falschen) Schätzung der Select-Höhe
// aus und hat überkompensiert.
//
// marginTop als expliziter Zahlen-Prop, siehe Begründung in
// EinstellungenZeile.tsx.
import { Checkbox } from '@/components/Checkbox';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

// Gemessener Rohwert (getBoundingClientRect().height eines
// Einstellungen-Dropdowns bei UI-Größe "Normal") – bewusst lokal statt in
// paddingRollen.ts, da aktuell nur an dieser einen Stelle gebraucht (siehe
// Rückfrage/Absprache).
const NATIVE_SELECT_HOEHE_ROH = 21;

interface EinstellungenCheckboxZeileProps {
  checked: boolean;
  onChange: (wert: boolean) => void;
  text: string;
  marginTop?: number;
}

export function EinstellungenCheckboxZeile({
  checked,
  onChange,
  text,
  marginTop = 10,
}: EinstellungenCheckboxZeileProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <label
      style={{
        ...textRollen.standardtext,
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.standard,
        marginTop,
        minHeight: pxSkaliert(NATIVE_SELECT_HOEHE_ROH, uiFaktor),
        cursor: 'pointer',
      }}
    >
      <Checkbox checked={checked} onChange={onChange} />
      <TextAnzeige text={text} />
    </label>
  );
}
