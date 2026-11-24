// AllgemeinAbschnitt.tsx
// Einstellungen-Kategorie "Allgemein": Farbschema (System/Hell/Dunkel,
// vormals als "Erscheinungsbild" bezeichnet – umbenannt bei der
// Einstellungen-Umstrukturierung), App-Akzentfarbe (siehe
// useAppAkzentfarbe.ts) und Größe der Bedienelemente (vormals Teil von
// UiGroesseAbschnitt.tsx, das mit dieser Umstrukturierung entfällt – die
// zweite darin enthaltene Option "Größe der Kontextleiste" ist jetzt Teil
// von GesetzestextAbschnitt.tsx, da sie sich auf das Gesetzestext-UI
// bezieht statt auf allgemeine Bedienelemente).
//
// Letzte Zeile: „Automatisch nach Updates suchen“ (useAppUpdatesAutomatischSuchen.ts).
//
// Zeilen nutzen EinstellungenZeile.tsx (siehe dort – Vereinheitlichung der
// Zeilenhöhe/-abstände, vormals hier per lokal dupliziertem Wrapper-Div).

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { Farbschema } from '@/hooks/einstellungen/useFarbschema';
import type { Farbwahl } from '@/lib/einstellungen/einstellungen.index';
import type { UiGroesse } from '@/hooks/einstellungen/useUiGroesse';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { FarbAuswahlDropdown } from '@/components/hilfsfenster/einstellungsfenster/FarbAuswahlDropdown';
import { EinstellungenZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenZeile';
import { EinstellungenSelect } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenSelect';
import { EinstellungenCheckboxZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenCheckboxZeile';

const FARBSCHEMA_OPTIONEN: { wert: Farbschema; label: string }[] = [
  { wert: 'system', label: 'Wie System' },
  { wert: 'hell', label: 'Hell' },
  { wert: 'dunkel', label: 'Dunkel' },
];

const UI_GROESSE_OPTIONEN: { wert: UiGroesse; label: string }[] = [
  { wert: 'klein', label: 'Klein' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'gross', label: 'Groß' },
];

interface AllgemeinAbschnittProps {
  farbschema: Farbschema;
  onFarbschemaAendern: (wert: Farbschema) => void;
  appAkzentfarbe: Farbwahl;
  onAppAkzentfarbeAendern: (wert: Farbwahl) => void;
  uiGroesse: UiGroesse;
  onUiGroesseAendern: (wert: UiGroesse) => void;
  appUpdatesAutomatischSuchen: boolean;
  onAppUpdatesAutomatischSuchenAendern: (wert: boolean) => void;
}

export function AllgemeinAbschnitt({
  farbschema,
  onFarbschemaAendern,
  appAkzentfarbe,
  onAppAkzentfarbeAendern,
  uiGroesse,
  onUiGroesseAendern,
  appUpdatesAutomatischSuchen,
  onAppUpdatesAutomatischSuchenAendern,
}: AllgemeinAbschnittProps) {
  const textRollen = useTextRollen();
  return (
    <>
      <EinstellungenZeile
        marginTop={0}
        label={
          <TextAnzeige
            element="label"
            htmlFor="farbschema-select"
            style={{ ...textRollen.standardtext }}
            text="Farbschema"
          />
        }
      >
        <EinstellungenSelect
          id="farbschema-select"
          value={farbschema}
          onChange={(e) => onFarbschemaAendern(e.target.value as Farbschema)}
        >
          {FARBSCHEMA_OPTIONEN.map(({ wert, label }) => (
            <TextAnzeige element="option" key={wert} value={wert} text={label} />
          ))}
        </EinstellungenSelect>
      </EinstellungenZeile>

      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="app-akzentfarbe-select"
            style={{ ...textRollen.standardtext }}
            text="App-Akzentfarbe"
          />
        }
      >
        <FarbAuswahlDropdown
          id="app-akzentfarbe-select"
          wert={appAkzentfarbe}
          onAendern={onAppAkzentfarbeAendern}
          previewVar="--akzent"
        />
      </EinstellungenZeile>

      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="ui-groesse-select"
            style={{ ...textRollen.standardtext }}
            text="Größe der Bedienelemente"
          />
        }
      >
        <EinstellungenSelect
          id="ui-groesse-select"
          value={uiGroesse}
          onChange={(e) => onUiGroesseAendern(e.target.value as UiGroesse)}
        >
          {UI_GROESSE_OPTIONEN.map(({ wert, label }) => (
            <TextAnzeige element="option" key={wert} value={wert} text={label} />
          ))}
        </EinstellungenSelect>
      </EinstellungenZeile>

      <EinstellungenCheckboxZeile
        checked={appUpdatesAutomatischSuchen}
        onChange={onAppUpdatesAutomatischSuchenAendern}
        text="Automatisch nach Updates suchen"
      />
    </>
  );
}
