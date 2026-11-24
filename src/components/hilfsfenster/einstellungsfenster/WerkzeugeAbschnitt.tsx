// WerkzeugeAbschnitt.tsx
// Einstellungen-Kategorie "Werkzeuge": Automatische Aktualisierung,
// Markierungen (Untergruppe: Markierungsfarbe + Deaktivieren), Seitenleisten
// (Untergruppe: siehe SeitenleistenAbschnitt.tsx) und Kopieren von Zitaten
// (siehe ZitatKopierenAbschnitt.tsx). Komponiert mehrere vormals
// eigenständige Abschnitte, die bei der Einstellungen-Umstrukturierung
// fachlich hierher verschoben wurden – siehe jeweilige Kommentare unten.
//
// "Markierungen" und "Seitenleisten" sind reine VISUELLE Untergruppen
// (abschnittsUeberschrift, kein eigener Sprungmarken-Eintrag in der
// Einstellungen-Seitenleiste – Absprache: die Seitenleiste zeigt nur die
// vier Hauptkategorien).
//
// Zeilen nutzen EinstellungenZeile.tsx/EinstellungenCheckboxZeile.tsx (siehe
// dort – Vereinheitlichung der Zeilenhöhe/-abstände, vormals hier per lokal
// duplizierten Wrapper-Divs/Labels).

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import type { AutoAktualisierungsIntervall } from '@/hooks/einstellungen/useAutoAktualisierungsIntervall';
import type { Farbwahl } from '@/lib/einstellungen/einstellungen.index';
import { HervorhebungsfarbeAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/HervorhebungsfarbeAbschnitt';
import { SeitenleistenAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/SeitenleistenAbschnitt';
import { ZitatKopierenAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/ZitatKopierenAbschnitt';
import { EinstellungenZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenZeile';
import { EinstellungenCheckboxZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenCheckboxZeile';
import { EinstellungenSelect } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenSelect';

const INTERVALL_OPTIONEN: { wert: AutoAktualisierungsIntervall; label: string }[] = [
  { wert: 'taeglich', label: 'Täglich' },
  { wert: 'woechentlich', label: 'Wöchentlich' },
  { wert: 'zweiwoechentlich', label: 'Zweiwöchentlich' },
  { wert: 'nie', label: 'Nie' },
];

interface WerkzeugeAbschnittProps {
  autoAktualisierungsIntervall: AutoAktualisierungsIntervall;
  onAutoAktualisierungsIntervallAendern: (wert: AutoAktualisierungsIntervall) => void;
  markierungenDeaktiviert: boolean;
  onMarkierungenDeaktiviertAendern: (wert: boolean) => void;
  hervorhebungsfarbe: Farbwahl;
  onHervorhebungsfarbeAendern: (wert: Farbwahl) => void;
  leistenSchriftgroesse: number;
  onLeistenSchriftgroesseAendern: (wert: number) => void;
  leistenTauschen: boolean;
  onLeistenTauschenAendern: (wert: boolean) => void;
  seitenleistenTastenkuerzel: boolean;
  onSeitenleistenTastenkuerzelAendern: (wert: boolean) => void;
  zitatAbkuerzungenAktiv: boolean;
  onZitatAbkuerzungenAktivAendern: (wert: boolean) => void;
  zitatOhnePunkt: boolean;
  onZitatOhnePunktAendern: (wert: boolean) => void;
  zitatRoemischeAbsaetze: boolean;
  onZitatRoemischeAbsaetzeAendern: (wert: boolean) => void;
}

export function WerkzeugeAbschnitt({
  autoAktualisierungsIntervall,
  onAutoAktualisierungsIntervallAendern,
  markierungenDeaktiviert,
  onMarkierungenDeaktiviertAendern,
  hervorhebungsfarbe,
  onHervorhebungsfarbeAendern,
  leistenSchriftgroesse,
  onLeistenSchriftgroesseAendern,
  leistenTauschen,
  onLeistenTauschenAendern,
  seitenleistenTastenkuerzel,
  onSeitenleistenTastenkuerzelAendern,
  zitatAbkuerzungenAktiv,
  onZitatAbkuerzungenAktivAendern,
  zitatOhnePunkt,
  onZitatOhnePunktAendern,
  zitatRoemischeAbsaetze,
  onZitatRoemischeAbsaetzeAendern,
}: WerkzeugeAbschnittProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <>
      {/* --- Automatische Aktualisierung --- (vormals in
          AktualisierungUndExportAbschnitt.tsx, das mit dieser
          Umstrukturierung entfällt) */}
      <EinstellungenZeile
        marginTop={0}
        label={
          <TextAnzeige
            element="label"
            htmlFor="auto-aktualisierung-select"
            style={{ ...textRollen.standardtext }}
            text="Gesetze automatisch aktualisieren"
          />
        }
      >
        <EinstellungenSelect
          id="auto-aktualisierung-select"
          value={autoAktualisierungsIntervall}
          onChange={(e) =>
            onAutoAktualisierungsIntervallAendern(e.target.value as AutoAktualisierungsIntervall)
          }
        >
          {INTERVALL_OPTIONEN.map(({ wert, label }) => (
            <TextAnzeige element="option" key={wert} value={wert} text={label} />
          ))}
        </EinstellungenSelect>
      </EinstellungenZeile>

      {/* --- Markierungen --- (Untergruppe: Markierungsfarbe vormals eigener
          Abschnitt HervorhebungsfarbeAbschnitt.tsx, "deaktivieren" vormals in
          VerhaltenAbschnitt.tsx) */}
      <TextAnzeige
        element="div"
        style={{
          ...textRollen.abschnittsUeberschrift,
          paddingBottom: pxSkaliert(4, uiFaktor),
          marginTop: pxSkaliert(24, uiFaktor),
        }}
        text="Markierungen"
      />
      <HervorhebungsfarbeAbschnitt
        hervorhebungsfarbe={hervorhebungsfarbe}
        onHervorhebungsfarbeAendern={onHervorhebungsfarbeAendern}
      />
      <EinstellungenCheckboxZeile
        checked={markierungenDeaktiviert}
        onChange={onMarkierungenDeaktiviertAendern}
        text="Markierungen deaktivieren"
      />

      {/* --- Seitenleisten --- (Untergruppe, siehe SeitenleistenAbschnitt.tsx
          – bringt seine eigene Untergruppen-Überschrift bereits mit) */}
      <SeitenleistenAbschnitt
        leistenTauschen={leistenTauschen}
        onLeistenTauschenAendern={onLeistenTauschenAendern}
        leistenSchriftgroesse={leistenSchriftgroesse}
        onLeistenSchriftgroesseAendern={onLeistenSchriftgroesseAendern}
        seitenleistenTastenkuerzel={seitenleistenTastenkuerzel}
        onSeitenleistenTastenkuerzelAendern={onSeitenleistenTastenkuerzelAendern}
      />

      {/* --- Kopieren von Zitaten --- (unverändert, siehe
          ZitatKopierenAbschnitt.tsx – bringt seine eigene Überschrift bereits
          mit) */}
      <div style={{ marginTop: pxSkaliert(24, uiFaktor) }}>
        <ZitatKopierenAbschnitt
          abkuerzungenAktiv={zitatAbkuerzungenAktiv}
          onAbkuerzungenAktivAendern={onZitatAbkuerzungenAktivAendern}
          ohnePunkt={zitatOhnePunkt}
          onOhnePunktAendern={onZitatOhnePunktAendern}
          roemischeAbsaetze={zitatRoemischeAbsaetze}
          onRoemischeAbsaetzeAendern={onZitatRoemischeAbsaetzeAendern}
        />
      </div>
    </>
  );
}
