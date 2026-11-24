// GesetzestextAbschnitt.tsx
// Einstellungen-Abschnitt: Darstellung des Gesetzestexts – Schriftgröße,
// Schriftart, Zeilenabstand, neue Zeile für jeden Satz, Blocksatz, Silbentrennung, Randbreite,
// lesbare Zeilenlänge.
//
// Zeilen nutzen EinstellungenZeile.tsx/EinstellungenCheckboxZeile.tsx (siehe
// dort – Vereinheitlichung der Zeilenhöhe/-abstände, vormals hier per lokal
// duplizierten Wrapper-Divs/Labels). Die Schriftgröße-Zeile (Slider) bleibt
// bewusst eigenständig: sie hat mit alignItems: baseline und einem <span>
// statt Select/Checkbox ein eigenes, nicht wiederverwendbares Muster.
// Ebenso "Lesbare Zeilenlänge": Checkbox+Label links UND Select rechts in
// derselben Zeile – EinstellungenZeile deckt das über ihr generisches
// label-ReactNode ab, ohne dass diese eine Zeile aus dem gemeinsamen Muster
// herausfallen müsste (siehe Absprache).

import { Checkbox } from '@/components/Checkbox';
import type {
  Schriftart,
  Randbreite,
  Skalierungsstufe,
  LesbareZeilenlaengeBreite,
} from '@/lib/stil/gesetzTextDarstellung';
import type { Farbwahl } from '@/lib/einstellungen/einstellungen.index';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { FarbAuswahlDropdown } from '@/components/hilfsfenster/einstellungsfenster/FarbAuswahlDropdown';
import { EinstellungenZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenZeile';
import { EinstellungenCheckboxZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenCheckboxZeile';
import { EinstellungenSelect } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenSelect';

const SCHRIFTART_OPTIONEN: { wert: Schriftart; label: string }[] = [
  { wert: 'sans', label: 'Standard' },
  { wert: 'serif', label: 'Mit Serifen' },
];

const RANDBREITE_OPTIONEN: { wert: Randbreite; label: string }[] = [
  { wert: 'schmal', label: 'Schmal' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'breit', label: 'Breit' },
];

const ZEILENLAENGE_OPTIONEN: { wert: LesbareZeilenlaengeBreite; label: string }[] = [
  { wert: 'schmal', label: 'Schmal' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'breit', label: 'Breit' },
];

// Deutsches Zahlenformat ("1,2" statt "1.2") – Labels bewusst als Literal
// hinterlegt statt über Intl.NumberFormat generiert: bei dieser festen,
// kleinen Werteliste ist das genauso korrekt und ohne Formatierungs-
// Randfälle (z.B. Rundung) auf einen Blick nachvollziehbar.
const ZEILENABSTAND_OPTIONEN: { wert: number; label: string }[] = [
  { wert: 1.0, label: '1,0' },
  { wert: 1.1, label: '1,1' },
  { wert: 1.2, label: '1,2' },
  { wert: 1.3, label: '1,3' },
  { wert: 1.4, label: '1,4' },
  { wert: 1.6, label: '1,6' },
  { wert: 1.8, label: '1,8' },
  { wert: 2.0, label: '2,0' },
];

const STRUKTURLEISTE_OPTIONEN: { wert: Skalierungsstufe; label: string }[] = [
  { wert: 'klein', label: 'Klein' },
  { wert: 'normal', label: 'Normal' },
  { wert: 'gross', label: 'Groß' },
];

// Die festen Auswahlreihen haben denselben Plaintext-Anzeigevertrag.
function zeigeOptionen(optionen: readonly { wert: string | number; label: string }[]) {
  return optionen.map(({ wert, label }) => (
    <TextAnzeige element="option" key={wert} value={wert} text={label} />
  ));
}

const MIN_SCHRIFT = 11;
const MAX_SCHRIFT = 24;

interface GesetzestextAbschnittProps {
  schriftgroesse: number;
  onSchriftgroesseAendern: (wert: number) => void;
  schriftart: Schriftart;
  onSchriftartAendern: (wert: Schriftart) => void;
  zeilenabstand: number;
  onZeilenabstandAendern: (wert: number) => void;
  satzNeuZeile: boolean;
  onSatzNeuZeileAendern: (wert: boolean) => void;
  blocksatz: boolean;
  onBlocksatzAendern: (wert: boolean) => void;
  silbentrennung: boolean;
  onSilbentrennungAendern: (wert: boolean) => void;
  randbreite: Randbreite;
  onRandbreiteAendern: (wert: Randbreite) => void;
  lesbareZeilenlaenge: boolean;
  onLesbareZeilenlaengeAendern: (wert: boolean) => void;
  lesbareZeilenlaengeBreite: LesbareZeilenlaengeBreite;
  onLesbareZeilenlaengeBreiteAendern: (wert: LesbareZeilenlaengeBreite) => void;
  strukturKontextLeisteGroesse: Skalierungsstufe;
  onStrukturKontextLeisteGroesseAendern: (wert: Skalierungsstufe) => void;
  gesetzestextAkzentfarbe: Farbwahl;
  onGesetzestextAkzentfarbeAendern: (wert: Farbwahl) => void;
}

export function GesetzestextAbschnitt({
  schriftgroesse,
  onSchriftgroesseAendern,
  schriftart,
  onSchriftartAendern,
  zeilenabstand,
  onZeilenabstandAendern,
  satzNeuZeile,
  onSatzNeuZeileAendern,
  blocksatz,
  onBlocksatzAendern,
  silbentrennung,
  onSilbentrennungAendern,
  randbreite,
  onRandbreiteAendern,
  lesbareZeilenlaenge,
  onLesbareZeilenlaengeAendern,
  lesbareZeilenlaengeBreite,
  onLesbareZeilenlaengeBreiteAendern,
  strukturKontextLeisteGroesse,
  onStrukturKontextLeisteGroesseAendern,
  gesetzestextAkzentfarbe,
  onGesetzestextAkzentfarbeAendern,
}: GesetzestextAbschnittProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <>
      {/* --- Schriftgröße --- (eigenständiges Muster, siehe Kopfkommentar) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: pxSkaliert(10, uiFaktor),
        }}
      >
        <TextAnzeige
          element="label"
          htmlFor="schriftgroesse-slider"
          style={{ ...textRollen.standardtext }}
          text="Schriftgröße"
        />
        <TextAnzeige style={textRollen.reglerWert} text={`${schriftgroesse} pt`} />
      </div>

      <input
        id="schriftgroesse-slider"
        type="range"
        min={MIN_SCHRIFT}
        max={MAX_SCHRIFT}
        step={1}
        value={schriftgroesse}
        onChange={(e) => onSchriftgroesseAendern(Number(e.target.value))}
        style={{ width: '100%' }}
      />

      {/* --- Schriftart --- */}
      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="schriftart-select"
            style={{ ...textRollen.standardtext }}
            text="Schriftart"
          />
        }
      >
        <EinstellungenSelect
          id="schriftart-select"
          value={schriftart}
          onChange={(e) => onSchriftartAendern(e.target.value as Schriftart)}
        >
          {zeigeOptionen(SCHRIFTART_OPTIONEN)}
        </EinstellungenSelect>
      </EinstellungenZeile>

      {/* --- Zeilenabstand --- */}
      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="zeilenabstand-select"
            style={{ ...textRollen.standardtext }}
            text="Zeilenabstand"
          />
        }
      >
        <EinstellungenSelect
          id="zeilenabstand-select"
          value={zeilenabstand}
          onChange={(e) => onZeilenabstandAendern(Number(e.target.value))}
        >
          {zeigeOptionen(ZEILENABSTAND_OPTIONEN)}
        </EinstellungenSelect>
      </EinstellungenZeile>

      <EinstellungenCheckboxZeile
        checked={satzNeuZeile}
        onChange={onSatzNeuZeileAendern}
        text="Neue Zeile für jeden Satz"
      />

      <EinstellungenCheckboxZeile
        checked={blocksatz}
        onChange={onBlocksatzAendern}
        text="Blocksatz"
      />

      <EinstellungenCheckboxZeile
        checked={silbentrennung}
        onChange={onSilbentrennungAendern}
        text="Automatische Silbentrennung"
      />

      {/* --- Lesbare Zeilenlänge --- (Sonderfall: Checkbox+Label links,
          Select rechts – siehe Kopfkommentar) */}
      <EinstellungenZeile
        label={
          <label
            style={{
              ...textRollen.standardtext,
              display: 'flex',
              alignItems: 'center',
              gap: abstandRollen.standard,
              cursor: 'pointer',
            }}
          >
            <Checkbox checked={lesbareZeilenlaenge} onChange={onLesbareZeilenlaengeAendern} />
            <TextAnzeige text="Lesbare Zeilenlänge" />
          </label>
        }
      >
        <EinstellungenSelect
          id="zeilenlaenge-select"
          value={lesbareZeilenlaengeBreite}
          disabled={!lesbareZeilenlaenge}
          onChange={(e) =>
            onLesbareZeilenlaengeBreiteAendern(e.target.value as LesbareZeilenlaengeBreite)
          }
          style={{ opacity: lesbareZeilenlaenge ? 1 : 0.5 }}
        >
          {zeigeOptionen(ZEILENLAENGE_OPTIONEN)}
        </EinstellungenSelect>
      </EinstellungenZeile>

      {/* --- Randbreite --- */}
      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="randbreite-select"
            style={{ ...textRollen.standardtext }}
            text="Randbreite"
          />
        }
      >
        <EinstellungenSelect
          id="randbreite-select"
          value={randbreite}
          onChange={(e) => onRandbreiteAendern(e.target.value as Randbreite)}
        >
          {zeigeOptionen(RANDBREITE_OPTIONEN)}
        </EinstellungenSelect>
      </EinstellungenZeile>

      {/* --- Größe der Kontextleiste --- (vormals in UiGroesseAbschnitt.tsx,
          thematisch näher an den übrigen Gesetzestext-Darstellungsoptionen
          als an "Größe der Bedienelemente" in Allgemein) */}
      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="strukturleiste-select"
            style={{ ...textRollen.standardtext }}
            text="Größe der Kontextleiste"
          />
        }
      >
        <EinstellungenSelect
          id="strukturleiste-select"
          value={strukturKontextLeisteGroesse}
          onChange={(e) =>
            onStrukturKontextLeisteGroesseAendern(e.target.value as Skalierungsstufe)
          }
        >
          {zeigeOptionen(STRUKTURLEISTE_OPTIONEN)}
        </EinstellungenSelect>
      </EinstellungenZeile>

      {/* --- Gesetzestext-Akzentfarbe --- (vormals in
          VerhaltenAbschnitt.tsx) */}
      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="gesetzestext-akzent-select"
            style={{ ...textRollen.standardtext }}
            text="Akzentfarbe für Gesetze"
          />
        }
      >
        <FarbAuswahlDropdown
          id="gesetzestext-akzent-select"
          wert={gesetzestextAkzentfarbe}
          onAendern={onGesetzestextAkzentfarbeAendern}
          previewVar="--aktiv-element"
        />
      </EinstellungenZeile>
    </>
  );
}
