// TabBeschriftung.tsx
//
// Titel/Untertitel-Block eines Tabs (Gesetzes-Kurztitel + optionaler
// tabTitel-Zusatz) – gemeinsam genutzt von Tableiste.tsx (echter Tab und
// Drag-Klon) und FremdTabPlatzhalter.tsx (Vorschau beim Ziehen aus einem
// ANDEREN Fenster). Zuvor war dieser Zwei-Zeilen-Block dreifach dupliziert;
// diese Komponente bündelt Inhalt und Stil an einer Stelle.
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { standardOderBetont } from '@/lib/stil/textRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';

// Rohe (unskalierte) Titel-Schriftgröße + Zeilenhöhen beider Zeilen –
// EINZIGE Quelle, aus der auch Tableiste.hoehe.ts die Zeilenhöhe der
// gesamten Tableiste berechnet (siehe dort). Untertitel-Schriftgröße
// selbst kommt aus textRollen.hinweistext (dort zentral definiert), nur
// die hier lokal abweichende Zeilenhöhe (1.2 statt textRollen.hinweistext'
// 1.4 – enger, weil Titel+Untertitel dicht übereinander stehen) ist eine
// eigene Konstante.
export const TAB_TITEL_FONTSIZE_ROH = 12;
export const TAB_TITEL_LINEHOEHE = 1.3;
export const TAB_UNTERTITEL_LINEHOEHE = 1.2;

interface TabBeschriftungProps {
  titel: string;
  untertitel?: string;
  /** Aktiver Tab bekommt fetteren/dunkleren Titel. Default: false
   *  (FremdTabPlatzhalter kennt keinen "aktiv"-Zustand). */
  aktiv?: boolean;
}

export function TabBeschriftung({ titel, untertitel, aktiv = false }: TabBeschriftungProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <TextAnzeige
        element="div"
        text={titel}
        data-tab-kurztitel=""
        style={{
          ...standardOderBetont(aktiv, textRollen),
          fontSize: pxSkaliert(TAB_TITEL_FONTSIZE_ROH, uiFaktor),
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: TAB_TITEL_LINEHOEHE,
        }}
      />
      {untertitel && (
        <TextAnzeige
          element="div"
          text={untertitel}
          style={{
            ...textRollen.hinweistext,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: TAB_UNTERTITEL_LINEHOEHE,
          }}
        />
      )}
    </div>
  );
}
