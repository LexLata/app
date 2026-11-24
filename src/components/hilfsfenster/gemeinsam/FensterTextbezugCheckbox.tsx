// FensterTextbezugCheckbox.tsx
//
// Gemeinsame "Bezug auf markierten Text"-Checkbox für Kommentar-/
// Verweismarkierung-Fenster – vorher in beiden Formularen als zwei fast
// identische Blöcke dupliziert (einer für kontext.auswahl beim Neuanlegen,
// einer für kontext.bearbeiten?.textbezug beim Bearbeiten eines
// bestehenden Eintrags). Beide Quellen liefern strukturell denselben
// bezugstext – der Aufrufer löst die "welche Quelle" -Frage bereits per
// `??` auf und reicht hier nur noch den fertigen Text rein (oder null,
// wenn kein Textbezug vorliegt → dann wird nichts gerendert).

import { Checkbox } from '@/components/Checkbox';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { offenerSpeicherAbschlussHinweis } from '@/hooks/fenster/useFensterSchliessenAbsichern';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { kuerzeAnWortgrenze } from '@/lib/utils/textKuerzung';

const BEZUGSTEXT_MAX_ZEICHEN = 60;

export interface AusgangsstellenPruefung {
  bezugErhalten: boolean;
  bezugPruefungLaeuft: boolean;
  bezugPrueffehler: string | null;
}

interface FensterTextbezugCheckboxProps {
  bezugstext: string | null;
  checked: boolean;
  disabled: boolean;
  onChange: (wert: boolean) => void;
}

function FensterTextbezugCheckbox({
  bezugstext,
  checked,
  disabled,
  onChange,
}: FensterTextbezugCheckboxProps) {
  const textRollen = useTextRollen();
  const abstandRollen = useAbstandRollen();

  if (bezugstext === null) return null;

  return (
    <label
      style={{
        ...textRollen.standardtext,
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.kompakt,
      }}
    >
      <Checkbox checked={checked} disabled={disabled} onChange={onChange} />
      <TextAnzeige
        text={`Bezug auf markierten Text ("${kuerzeAnWortgrenze(bezugstext, BEZUGSTEXT_MAX_ZEICHEN)}")`}
      />
    </label>
  );
}

/** Gemeinsamer unveränderlicher Textbezug mit Hinweis zum gespeicherten Abschluss. */
export function FensterTextbezugMitSpeicherAbschluss({
  uebertragungOffen,
  pruefung,
  bezugstext,
  checked,
  disabled,
  onChange,
}: FensterTextbezugCheckboxProps & {
  uebertragungOffen: boolean;
  pruefung?: AusgangsstellenPruefung;
}) {
  const textRollen = useTextRollen();
  return (
    <>
      <FensterTextbezugCheckbox
        bezugstext={bezugstext}
        checked={checked}
        disabled={
          disabled ||
          !!pruefung?.bezugErhalten ||
          !!pruefung?.bezugPruefungLaeuft ||
          !!pruefung?.bezugPrueffehler
        }
        onChange={onChange}
      />
      {pruefung?.bezugErhalten ? (
        <TextAnzeige
          style={textRollen.hinweistext}
          text="Die Ausgangsstelle ist nicht eindeutig zuordenbar. Der gespeicherte Bezug bleibt erhalten."
        />
      ) : null}
      {pruefung?.bezugPrueffehler ? (
        <TextAnzeige style={textRollen.fehlertext} text={pruefung.bezugPrueffehler} />
      ) : null}
      {uebertragungOffen ? (
        <TextAnzeige style={textRollen.fehlertext} text={offenerSpeicherAbschlussHinweis} />
      ) : null}
    </>
  );
}
