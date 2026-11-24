// SeitenleistenAbschnitt.tsx
// Einstellungen-Unterabschnitt "Seitenleisten" (innerhalb der Kategorie
// Werkzeuge, siehe WerkzeugeAbschnitt.tsx): Schriftgröße der Seitenleisten
// (Favoriten, Lesezeichen, Inhaltsverzeichnis) + Ausblenden der
// Tastaturkürzel-Hinweise dort (vormals in VerhaltenAbschnitt.tsx).
//
// Schriftgröße bewusst als Dropdown statt (wie vorher) als Slider – Absprache
// bei der Einstellungen-Umstrukturierung: stufenlose Werte bringen hier
// keinen echten Mehrwert, ein Dropdown mit festen Stufen ist schneller zu
// bedienen. Der zugrundeliegende Wert (useTextDarstellung.ts) bleibt trotzdem
// ein einfacher number-Typ (wie zuvor) – nur das Eingabe-Element ändert sich,
// keine Typ-Kaskade in Gesetzestextansicht.tsx/App.tsx nötig.
//
// Zeilen nutzen EinstellungenZeile.tsx/EinstellungenCheckboxZeile.tsx (siehe
// dort – Vereinheitlichung der Zeilenhöhe/-abstände, vormals hier per lokal
// duplizierten Wrapper-Divs/Labels).

import { usePlattform } from '@/hooks/utils/usePlattform';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { EinstellungenZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenZeile';
import { EinstellungenCheckboxZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenCheckboxZeile';
import { EinstellungenSelect } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenSelect';

// Feste Stufen (Absprache) – Untergrenze bewusst bei 10 (statt bisher 8),
// da kleinere Werte in der Praxis kaum sinnvoll lesbar sind.
const LEISTEN_SCHRIFT_OPTIONEN = [10, 11, 12, 13, 14, 16, 18];

interface SeitenleistenAbschnittProps {
  leistenSchriftgroesse: number;
  onLeistenSchriftgroesseAendern: (wert: number) => void;
  leistenTauschen: boolean;
  onLeistenTauschenAendern: (wert: boolean) => void;
  seitenleistenTastenkuerzel: boolean;
  onSeitenleistenTastenkuerzelAendern: (wert: boolean) => void;
}

export function SeitenleistenAbschnitt({
  leistenSchriftgroesse,
  onLeistenSchriftgroesseAendern,
  leistenTauschen,
  onLeistenTauschenAendern,
  seitenleistenTastenkuerzel,
  onSeitenleistenTastenkuerzelAendern,
}: SeitenleistenAbschnittProps) {
  const { istMac } = usePlattform();
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <>
      <TextAnzeige
        element="div"
        style={{
          ...textRollen.abschnittsUeberschrift,
          paddingBottom: pxSkaliert(4, uiFaktor),
          marginTop: pxSkaliert(24, uiFaktor),
        }}
        text={'Seitenleisten'}
      />

      <EinstellungenZeile
        marginTop={0}
        label={
          <TextAnzeige
            element="label"
            htmlFor="leisten-schriftgroesse-select"
            style={{ ...textRollen.standardtext }}
            text="Schriftgröße Seitenleisten"
          />
        }
      >
        <EinstellungenSelect
          id="leisten-schriftgroesse-select"
          value={leistenSchriftgroesse}
          onChange={(e) => onLeistenSchriftgroesseAendern(Number(e.target.value))}
        >
          {LEISTEN_SCHRIFT_OPTIONEN.map((wert) => (
            <TextAnzeige element="option" key={wert} value={wert} text={`${wert} pt`} />
          ))}
        </EinstellungenSelect>
      </EinstellungenZeile>

      <EinstellungenCheckboxZeile
        checked={seitenleistenTastenkuerzel}
        onChange={onSeitenleistenTastenkuerzelAendern}
        text="Tastenkürzel in Seitenleisten aktivieren"
      />
      <TextAnzeige
        element="div"
        style={{ ...textRollen.hinweistext, marginTop: 0, marginBottom: pxSkaliert(4, uiFaktor) }}
        text={`Blendet neben Favoriten und Lesezeichen graue Buchstaben bzw. Ziffern ein und aktiviert die zugehörigen Tastenkürzel: Favoriten öffnen mit Buchstabentasten, Lesezeichen mit ${tastenkuerzelAnzeige('lesezeichen-1-10', istMac)}.`}
      />
      <EinstellungenCheckboxZeile
        checked={leistenTauschen}
        onChange={onLeistenTauschenAendern}
        text="Leisten tauschen: Favoriten links, Lesezeichen rechts"
      />
    </>
  );
}
