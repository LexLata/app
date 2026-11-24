// VerweismarkierungFormular.tsx
//
// Reine Darstellung des Verweismarkierung-Formulars (siehe VerweismarkierungFenster.tsx
// für Zustand/Logik). EIN Freitext-Textfeld für das komplette Zitat (z.B.
// "§§ 280 Abs. 1, 3, 281 ZPO") ersetzt die früheren drei Einzelfelder
// (Normzahl/Konkretisierung/Gesetz) vollständig – die Aufteilung übernimmt
// beim Parsen zitatParser.ts (siehe Absprache).
//
// Eingabefeld + "Bezug auf markierten Text"-Checkbox sind mit
// KommentarFormular.tsx über FensterEingabeFeld/
// FensterTextbezugMitSpeicherAbschluss geteilt (siehe Absprache Formular-
// Vereinheitlichung) – nur das Zitat-Parsing/Fehlerhandling/der Import
// bleiben hier eigen, das unterscheidet sich strukturell zu stark vom
// schlichten Kommentarfeld (Fehlerliste, Import-Button, "Trotzdem
// speichern").

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { type ReactElement, type RefObject } from 'react';
import { HilfsfensterFormularRahmen } from '@/components/hilfsfenster/gemeinsam/HilfsfensterFormularRahmen';
import type { VerweismarkierungKontext } from '@/lib/markierungen/markierungen.index';
import type { ZitatFehler } from '@/lib/markierungen/markierungen.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { FensterEingabeFeld } from '@/components/hilfsfenster/gemeinsam/FensterEingabeFeld';
import {
  FensterTextbezugMitSpeicherAbschluss,
  type AusgangsstellenPruefung,
} from '@/components/hilfsfenster/gemeinsam/FensterTextbezugCheckbox';

interface VerweismarkierungFormularProps {
  kontext: VerweismarkierungKontext;
  zitatText: string;
  textbezug: boolean;
  ausgangsPruefung?: AusgangsstellenPruefung;
  laeuft: boolean;
  schliessvorgangAktiv: boolean;
  gespeichert: boolean;
  uebertragungOffen: boolean;
  onWiederholen: () => void;
  onTrotzdemSchliessen: () => void;
  fehler: ZitatFehler[];
  importFehlgeschlagen: boolean;
  /** Ergebnis-Hinweis des letzten importVersuchen()-Laufs (siehe
   *  gesetzImportGemeinsam.ts: baueAktualisierungsNachricht), z.B.
   *  "Keine Neuerungen." oder "Datei aktualisiert: BGB." – wird hinter der
   *  bestehenden Fehlermeldung angezeigt, solange fehler nicht leer ist. */
  aktualisierungsHinweis: string | null;
  zitatTextRef: RefObject<HTMLTextAreaElement | null>;
  inhaltRef: RefObject<HTMLDivElement | null>;
  onZitatTextChange: (wert: string) => void;
  onTextbezugChange: (wert: boolean) => void;
  onAbbrechen: () => void;
  onTrotzdemSpeichern: () => void;
  onImportVersuchen: () => void;
  onFertig: () => void;
  onEnter: () => void;
}

// Button-Text richtet sich danach, WELCHE Fehlerarten in `fehler` auftreten
// (siehe Absprache): nur 'gesetz' → "Gesetze importieren", nur 'norm' →
// "Gesetze aktualisieren", beide → "Gesetze importieren und aktualisieren".
// Mehrzahl bewusst IMMER verwendet (auch bei nur einem betroffenen Gesetz) –
// vereinfacht den Text, ohne an Klarheit zu verlieren.
function importButtonText(fehler: ZitatFehler[]): string | null {
  // Anzahl UNTERSCHIEDLICHER betroffener Gesetze (nicht die Anzahl der
  // Fehlereinträge) – zwei Normen aus demselben fehlenden Gesetz sollen
  // trotzdem nur "Gesetz importieren" (Singular) ergeben.
  const gesetzAnzahl = new Set(
    fehler
      .filter((f) => f.art === 'gesetz' && f.gesetz)
      .map((f) => gesetzesreferenzSchluessel(f.gesetz!)),
  ).size;
  const normAnzahl = fehler.filter((f) => f.art === 'norm').length;
  const hatGesetz = gesetzAnzahl > 0;
  const hatNorm = normAnzahl > 0;
  if (hatGesetz && hatNorm) return 'Gesetze importieren und aktualisieren';
  if (hatGesetz) return gesetzAnzahl === 1 ? 'Gesetz importieren' : 'Gesetze importieren';
  if (hatNorm) return normAnzahl === 1 ? 'Gesetz aktualisieren' : 'Gesetze aktualisieren';
  return null;
}

function importLaeuftText(fehler: ZitatFehler[]): string {
  const kurztitel = [
    ...new Set(
      fehler
        .filter((f) => f.art === 'gesetz' || f.art === 'norm')
        .map((f) => f.gesetz?.kurztitel)
        .filter((titel): titel is string => !!titel),
    ),
  ];
  if (kurztitel.length === 0) return 'Import läuft …';
  const hatGesetz = fehler.some((f) => f.art === 'gesetz');
  const hatNorm = fehler.some((f) => f.art === 'norm');
  const verb = kurztitel.length === 1 ? 'wird' : 'werden';
  const aktion =
    hatGesetz && hatNorm
      ? 'importiert bzw. aktualisiert'
      : hatGesetz
        ? 'importiert'
        : 'aktualisiert';
  return `${kurztitel.join(', ')} ${verb} ${aktion} …`;
}

/** Zusammengehörige Lade-, Fehler- und Aktualisierungsmeldungen des Verweisformulars. */
function VerweisMeldungen({
  fehler,
  importLaeuft,
  aktualisierungsHinweis,
}: Pick<VerweismarkierungFormularProps, 'fehler' | 'aktualisierungsHinweis'> & {
  importLaeuft: boolean;
}) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  if (importLaeuft)
    return <TextAnzeige style={textRollen.hinweistext} text={importLaeuftText(fehler)} />;
  if (fehler.length === 0) return null;
  const fehlermeldungen: ReactElement[] = fehler.map((f, i) => (
    <TextAnzeige key={i} style={textRollen.fehlertext} text={f.text} />
  ));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: pxSkaliert(2, uiFaktor) }}>
      {fehlermeldungen}
      {aktualisierungsHinweis ? (
        <TextAnzeige style={textRollen.hinweistext} text={aktualisierungsHinweis} />
      ) : null}
    </div>
  );
}

export default function VerweismarkierungFormular({
  kontext,
  zitatText,
  textbezug,
  ausgangsPruefung,
  laeuft,
  schliessvorgangAktiv,
  gespeichert,
  uebertragungOffen,
  onWiederholen,
  onTrotzdemSchliessen,
  fehler,
  importFehlgeschlagen,
  aktualisierungsHinweis,
  zitatTextRef,
  inhaltRef,
  onZitatTextChange,
  onTextbezugChange,
  onAbbrechen,
  onTrotzdemSpeichern,
  onImportVersuchen,
  onFertig,
  onEnter,
}: VerweismarkierungFormularProps) {
  const buttonRollen = useButtonRollen();
  // Beide Quellen (Neuanlegen vs. Bearbeiten) liefern strukturell denselben
  // bezugstext – siehe FensterTextbezugMitSpeicherAbschluss-Kommentar.
  const bezugstext =
    kontext.auswahl?.bezugstext ?? kontext.bearbeiten?.textbezug?.bezugstext ?? null;
  const importText = importButtonText(fehler);
  const importLaeuft = laeuft && importText !== null;
  const gesperrt = laeuft || schliessvorgangAktiv;
  const eingabenGesperrt = gesperrt || gespeichert;
  const zeigeImportButton = !gespeichert && importText !== null;
  const zeigeTrotzdemSpeichern =
    !gespeichert &&
    fehler.length > 0 &&
    fehler.every((f) => f.art === 'norm' || (f.art === 'gesetz' && f.gesetz !== undefined));

  return (
    <HilfsfensterFormularRahmen
      inhaltRef={inhaltRef}
      beschriftung="Verweis"
      aktionen={
        <>
          <button
            type="button"
            style={buttonRollen.sekundaerKompakt(gesperrt)}
            onClick={uebertragungOffen ? onTrotzdemSchliessen : onAbbrechen}
            disabled={gesperrt}
          >
            <TextAnzeige text={uebertragungOffen ? 'Trotzdem schließen' : 'Abbrechen'} />
          </button>
          {zeigeTrotzdemSpeichern ? (
            <button
              type="button"
              style={buttonRollen.sekundaerKompakt(gesperrt)}
              onClick={onTrotzdemSpeichern}
              disabled={gesperrt}
            >
              <TextAnzeige text="Trotzdem speichern" />
            </button>
          ) : null}
          {zeigeImportButton ? (
            <button
              type="button"
              style={buttonRollen.primaerKompakt(gesperrt || importFehlgeschlagen)}
              onClick={onImportVersuchen}
              disabled={gesperrt || importFehlgeschlagen}
            >
              <TextAnzeige text={importText!} />
            </button>
          ) : (
            <button
              type="button"
              style={buttonRollen.primaerKompakt(gesperrt || !zitatText.trim())}
              onClick={uebertragungOffen ? onWiederholen : onFertig}
              disabled={gesperrt || !zitatText.trim()}
            >
              <TextAnzeige
                text={uebertragungOffen ? 'Erneut versuchen' : gespeichert ? 'Schließen' : 'Fertig'}
              />
            </button>
          )}
        </>
      }
    >
      <FensterEingabeFeld
        value={zitatText}
        cursorAmEnde={!!kontext.bearbeiten}
        disabled={eingabenGesperrt}
        rows={1}
        minHeight={30}
        hinweisText="Groß-/Kleinschreibung ist relevant"
        platzhalter="Norm(-kette) eingeben"
        textareaRef={zitatTextRef}
        onChange={onZitatTextChange}
        onEnter={onEnter}
      />

      <FensterTextbezugMitSpeicherAbschluss
        bezugstext={bezugstext}
        checked={textbezug}
        disabled={eingabenGesperrt}
        pruefung={ausgangsPruefung}
        onChange={onTextbezugChange}
        uebertragungOffen={uebertragungOffen}
      />

      <VerweisMeldungen
        fehler={fehler}
        importLaeuft={importLaeuft}
        aktualisierungsHinweis={aktualisierungsHinweis}
      />
    </HilfsfensterFormularRahmen>
  );
}
