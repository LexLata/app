// KommentarFormular.tsx
//
// Reine Darstellung des Kommentar-Formulars (siehe KommentarFenster.tsx für
// Zustand/Logik) – strukturell eine schlankere Kopie von
// VerweismarkierungFormular.tsx: EIN Freitext-Textfeld für den
// Kommentartext (kein Zitat-Parsing, keine Fehlerliste, kein
// Import-Button), plus dieselbe "Bezug auf markierten Text"-Checkbox.
//
// Eingabefeld + Checkbox sind mit VerweismarkierungFormular.tsx über
// FensterEingabeFeld/FensterTextbezugMitSpeicherAbschluss geteilt (siehe Absprache
// Formular-Vereinheitlichung).

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { type RefObject } from 'react';
import type { KommentarKontext } from '@/lib/markierungen/markierungen.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { FensterEingabeFeld } from '@/components/hilfsfenster/gemeinsam/FensterEingabeFeld';
import {
  FensterTextbezugMitSpeicherAbschluss,
  type AusgangsstellenPruefung,
} from '@/components/hilfsfenster/gemeinsam/FensterTextbezugCheckbox';
import { HilfsfensterFormularRahmen } from '@/components/hilfsfenster/gemeinsam/HilfsfensterFormularRahmen';

interface KommentarFormularProps {
  kontext: KommentarKontext;
  kommentarText: string;
  textbezug: boolean;
  ausgangsPruefung?: AusgangsstellenPruefung;
  laeuft: boolean;
  gespeichert: boolean;
  uebertragungOffen: boolean;
  onWiederholen: () => void;
  onTrotzdemSchliessen: () => void;
  /** Inline-Fehlermeldung (siehe KommentarFenster.tsx: speichern) – deckt
   *  sowohl den Duplikat-Fall als auch einen Bearbeiten-Wettlauf ab (Kommentar
   *  wurde zwischenzeitlich in einem anderen Fenster verändert/gelöscht).
   *  null = keine Meldung. */
  fehler: string | null;
  kommentarTextRef: RefObject<HTMLTextAreaElement | null>;
  inhaltRef: RefObject<HTMLDivElement | null>;
  onKommentarTextChange: (wert: string) => void;
  onTextbezugChange: (wert: boolean) => void;
  onAbbrechen: () => void;
  onFertig: () => void;
  onEnter: () => void;
}

export default function KommentarFormular({
  kontext,
  kommentarText,
  textbezug,
  ausgangsPruefung,
  laeuft,
  gespeichert,
  uebertragungOffen,
  onWiederholen,
  onTrotzdemSchliessen,
  fehler,
  kommentarTextRef,
  inhaltRef,
  onKommentarTextChange,
  onTextbezugChange,
  onAbbrechen,
  onFertig,
  onEnter,
}: KommentarFormularProps) {
  const buttonRollen = useButtonRollen();
  const textRollen = useTextRollen();
  const eingabenGesperrt = laeuft || gespeichert;
  // Beide Quellen (Neuanlegen vs. Bearbeiten) liefern strukturell denselben
  // bezugstext – siehe FensterTextbezugMitSpeicherAbschluss-Kommentar.
  const bezugstext =
    kontext.auswahl?.bezugstext ?? kontext.bearbeiten?.textbezug?.bezugstext ?? null;

  return (
    <HilfsfensterFormularRahmen
      inhaltRef={inhaltRef}
      beschriftung="Kommentar"
      aktionen={
        <>
          <button
            type="button"
            style={buttonRollen.sekundaerKompakt(laeuft)}
            onClick={uebertragungOffen ? onTrotzdemSchliessen : onAbbrechen}
            disabled={laeuft}
          >
            <TextAnzeige text={uebertragungOffen ? 'Trotzdem schließen' : 'Abbrechen'} />
          </button>
          <button
            type="button"
            style={buttonRollen.primaerKompakt(laeuft || !kommentarText.trim())}
            onClick={uebertragungOffen ? onWiederholen : onFertig}
            disabled={laeuft || !kommentarText.trim()}
          >
            <TextAnzeige
              text={uebertragungOffen ? 'Erneut versuchen' : gespeichert ? 'Schließen' : 'Fertig'}
            />
          </button>
        </>
      }
    >
      <FensterEingabeFeld
        value={kommentarText}
        cursorAmEnde={!!kontext.bearbeiten}
        disabled={eingabenGesperrt}
        rows={2}
        minHeight={50}
        platzhalter="Kommentar…"
        textareaRef={kommentarTextRef}
        onChange={onKommentarTextChange}
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

      {fehler ? <TextAnzeige style={textRollen.fehlertext} text={fehler} /> : null}
    </HilfsfensterFormularRahmen>
  );
}
