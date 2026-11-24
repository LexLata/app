// ErweitertAbschnitt.tsx
// Einstellungen-Kategorie "Erweitert": Minimalistischer
// Modus (vormals VerhaltenAbschnitt.tsx), Plattformfremde UI anzeigen +
// Fenstertitelleiste (vormals FensterAbschnitt.tsx – die Fenstertitelleisten-
// Präferenz ist Linux-spezifisch und stand nicht explizit auf der neuen
// Struktur-Liste, ist inhaltlich aber am nächsten an "Plattformfremde UI
// anzeigen" und bleibt daher hier) sowie der Zurücksetzen-Button (vormals
// freistehend am Ende von EinstellungenFenster.tsx). Die Zurücksetzen-Logik
// (Bestätigungsdialog, Ladezustand) bleibt bewusst in EinstellungenFenster.tsx
// – hier nur Darstellung, analog zum Rest dieser Datei.
//
// Zeilen nutzen EinstellungenZeile.tsx/EinstellungenCheckboxZeile.tsx (siehe
// dort – Vereinheitlichung der Zeilenhöhe/-abstände, vormals hier per lokal
// duplizierten Wrapper-Divs/Labels). Der Zurücksetzen-Button bleibt
// eigenständig (Button+Text- statt Label+Control-Muster, passt nicht zu den
// beiden Zeilen-Komponenten).

import type { EuFassung } from '@/lib/domain/euFassungsvertrag';
import type { NachbereitungBeiImport } from '@/lib/einstellungen/einstellungen.index';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { OVERLAY_KOPF_VERTIKAL_ROH, pxSkaliert } from '@/lib/stil/paddingRollen';
import { EinstellungenZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenZeile';
import { EinstellungenCheckboxZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenCheckboxZeile';
import { EinstellungenSelect } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenSelect';
interface ErweitertAbschnittProps {
  euFassung: EuFassung;
  onEuFassungAendern: (wert: EuFassung) => void;
  euDurchfuehrungsaktSuche: boolean;
  onEuDurchfuehrungsaktSucheAendern: (wert: boolean) => void;
  minimalistischerModus: boolean;
  onMinimalistischerModusAendern: (wert: boolean) => void;
  nachbereitungBeiImport: NachbereitungBeiImport;
  onNachbereitungBeiImportAendern: (wert: NachbereitungBeiImport) => void;
  /** Ob die App gerade unter Linux läuft – steuert, ob der
   *  Fenstertitelleisten-Abschnitt regulär (ohne plattformfremdeUiAnzeigen)
   *  sichtbar ist (siehe useLinuxTitelleistenPraeferenz.ts). */
  istLinux: boolean;
  linuxTitelleistenPraeferenz: 'nativ' | 'eigene' | null;
  onLinuxTitelleistenPraeferenzAendern: (wert: 'nativ' | 'eigene') => void;
  plattformfremdeUiAnzeigen: boolean;
  onPlattformfremdeUiAnzeigenAendern: (wert: boolean) => void;
  zuruecksetzenLaeuft: boolean;
  onZuruecksetzen: () => void;
}

export function ErweitertAbschnitt({
  euFassung,
  onEuFassungAendern,
  euDurchfuehrungsaktSuche,
  onEuDurchfuehrungsaktSucheAendern,
  minimalistischerModus,
  onMinimalistischerModusAendern,
  nachbereitungBeiImport,
  onNachbereitungBeiImportAendern,
  istLinux,
  linuxTitelleistenPraeferenz,
  onLinuxTitelleistenPraeferenzAendern,
  plattformfremdeUiAnzeigen,
  onPlattformfremdeUiAnzeigenAendern,
  zuruecksetzenLaeuft,
  onZuruecksetzen,
}: ErweitertAbschnittProps) {
  const textRollen = useTextRollen();
  const buttonRollen = useButtonRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const zeigeTitelleistenAbschnitt: boolean = istLinux || plattformfremdeUiAnzeigen;

  return (
    <>
      {/* --- Minimalistischer Modus --- (vormals VerhaltenAbschnitt.tsx) */}
      <EinstellungenCheckboxZeile
        marginTop={0}
        checked={minimalistischerModus}
        onChange={onMinimalistischerModusAendern}
        text="Minimalistischer Modus"
      />
      <TextAnzeige
        element="div"
        style={{ ...textRollen.hinweistext, marginTop: 0, marginBottom: pxSkaliert(12, uiFaktor) }}
        text={
          'Blendet zusätzliche UI-Elemente aus, die auch per Kurzbefehl erreichbar sind (z.\u00a0B. die Verlaufs-Pfeile in der Tableiste).'
        }
      />

      <EinstellungenZeile
        label={
          <TextAnzeige
            element="label"
            htmlFor="import-taggen-select"
            style={textRollen.standardtext}
            text="Beim Import taggen"
          />
        }
      >
        <EinstellungenSelect
          id="import-taggen-select"
          value={nachbereitungBeiImport}
          onChange={(e) =>
            onNachbereitungBeiImportAendern(e.target.value as NachbereitungBeiImport)
          }
        >
          <TextAnzeige element="option" value="aus" text="Aus" />
          <TextAnzeige element="option" value="verweise" text="Nur Verweise" />
          <TextAnzeige element="option" value="saetze" text="Nur Sätze" />
          <TextAnzeige element="option" value="saetze-und-verweise" text="Sätze und Verweise" />
        </EinstellungenSelect>
      </EinstellungenZeile>
      <TextAnzeige
        element="div"
        style={{ ...textRollen.hinweistext, marginTop: 0, marginBottom: pxSkaliert(12, uiFaktor) }}
        text={
          'Gilt nur für GesetzesXML-Dateien (z.\u00a0B. EMRK-Konvertierungen). „Nur Sätze“ erhält vorhandene Verweise; „Nur Verweise“ erhält die vorhandene Satzstruktur.'
        }
      />

      <TextAnzeige
        element="div"
        style={{
          ...textRollen.abschnittsUeberschrift,
          paddingBottom: pxSkaliert(4, uiFaktor),
          marginTop: pxSkaliert(24, uiFaktor),
        }}
        text="EU-Recht"
      />
      <TextAnzeige
        element="label"
        htmlFor="eu-fassung-select"
        style={{ ...textRollen.standardtext, display: 'block' }}
        text="Fassung bei Import und Aktualisierung"
      />
      <EinstellungenSelect
        id="eu-fassung-select"
        value={euFassung}
        onChange={(e) => onEuFassungAendern(e.target.value as EuFassung)}
        style={{ width: '100%', marginTop: pxSkaliert(4, uiFaktor) }}
      >
        <TextAnzeige
          element="option"
          value="konsolidiert-mit-erwaegungsgruenden"
          text="Konsolidiert mit Erwägungsgründen"
        />
        <TextAnzeige element="option" value="konsolidiert" text="Konsolidiert" />
        <TextAnzeige element="option" value="original" text="Originaltext" />
      </EinstellungenSelect>
      <TextAnzeige
        element="div"
        style={{ ...textRollen.hinweistext, marginTop: pxSkaliert(6, uiFaktor) }}
        text={
          euFassung === 'konsolidiert-mit-erwaegungsgruenden'
            ? 'Aktuellste verfügbare konsolidierte Fassung. Fehlende Erwägungsgründe werden aus dem Originaltext ergänzt.'
            : euFassung === 'konsolidiert'
              ? 'Aktuellste verfügbare konsolidierte Fassung ohne Ergänzungen aus dem Originaltext.'
              : 'Originaltext ohne spätere Änderungen.'
        }
      />
      <TextAnzeige
        element="div"
        style={{ ...textRollen.hinweistext, marginTop: pxSkaliert(6, uiFaktor) }}
        text="Ist die gewählte Fassung nicht verfügbar, wird nach Möglichkeit die andere Fassung verwendet."
      />
      <EinstellungenCheckboxZeile
        checked={euDurchfuehrungsaktSuche}
        onChange={onEuDurchfuehrungsaktSucheAendern}
        text="Durchführungsrechtsakte in „Gesetz oder Norm öffnen“ anzeigen"
      />

      <hr
        style={{
          border: 0,
          borderTop: '1px solid var(--rahmen)',
          marginTop: pxSkaliert(14, uiFaktor),
          marginBottom: pxSkaliert(OVERLAY_KOPF_VERTIKAL_ROH, uiFaktor),
        }}
      />

      {/* --- Plattformfremde UI anzeigen --- (vormals FensterAbschnitt.tsx) */}
      <EinstellungenCheckboxZeile
        checked={plattformfremdeUiAnzeigen}
        onChange={onPlattformfremdeUiAnzeigenAendern}
        text="Entwickler: Plattformfremde UI anzeigen"
      />
      <TextAnzeige
        element="div"
        style={{ ...textRollen.hinweistext, marginTop: 0, marginBottom: pxSkaliert(12, uiFaktor) }}
        text={'Betrifft die Fenstertitelleisten-Option und das Menü und den Menü-Button.'}
      />

      {/* --- Fenstertitelleiste --- (Linux-spezifisch, vormals
          FensterAbschnitt.tsx; nicht explizit auf der neuen Struktur-Liste,
          bleibt aber hier als am ehesten passende Kategorie – siehe
          Kopfkommentar) */}
      {zeigeTitelleistenAbschnitt && (
        <>
          <EinstellungenZeile
            label={
              <TextAnzeige
                element="label"
                htmlFor="titelleiste-select"
                style={{ ...textRollen.standardtext }}
                text="Fenstertitelleiste"
              />
            }
          >
            <EinstellungenSelect
              id="titelleiste-select"
              value={linuxTitelleistenPraeferenz ?? 'nativ'}
              onChange={(e) =>
                onLinuxTitelleistenPraeferenzAendern(e.target.value as 'nativ' | 'eigene')
              }
            >
              <TextAnzeige element="option" value="nativ" text="Nativ" />
              <TextAnzeige element="option" value="eigene" text="Eigene (einheitlich)" />
            </EinstellungenSelect>
          </EinstellungenZeile>
          <TextAnzeige
            element="div"
            style={{
              ...textRollen.hinweistext,
              marginTop: 0,
              marginBottom: pxSkaliert(4, uiFaktor),
            }}
            text={`Gilt sofort für dieses Fenster. Andere bereits geöffnete Fenster übernehmen die Änderung erst nach ihrem eigenen Neustart (Strg+W und erneutem Öffnen bzw. App-Neustart).${!istLinux ? ' Auf dieser Plattform wirkungslos – nur zur Vorschau.' : ''}`}
          />
        </>
      )}

      {/* --- Zurücksetzen --- (vormals freistehend am Ende von
          EinstellungenFenster.tsx, ohne eigenen Abschnitts-Rahmen; jetzt
          letzter Punkt in Erweitert, siehe neue Struktur-Liste) */}
      <div
        style={{
          borderTop: '1px solid var(--rahmen)',
          paddingTop: pxSkaliert(OVERLAY_KOPF_VERTIKAL_ROH, uiFaktor),
          marginTop: pxSkaliert(14, uiFaktor),
        }}
      >
        <TextAnzeige
          element="button"
          onClick={onZuruecksetzen}
          disabled={zuruecksetzenLaeuft}
          style={buttonRollen.sekundaer(zuruecksetzenLaeuft)}
          text={zuruecksetzenLaeuft ? 'Wird zurückgesetzt …' : 'Alle Einstellungen zurücksetzen'}
        />
        <TextAnzeige
          element="div"
          style={{ ...textRollen.hinweistext, marginTop: pxSkaliert(6, uiFaktor) }}
          text="Setzt alle Einstellungen in diesem Fenster auf ihre Standardwerte zurück."
        />
      </div>
    </>
  );
}
