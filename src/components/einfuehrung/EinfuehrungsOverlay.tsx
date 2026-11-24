// EinfuehrungsOverlay.tsx
//
// Schicht über der gesamten App (siehe App.tsx: letztes Kind im Root-div),
// die den aktuellen Einführungs-Teilaktion als Sprechblase neben dem
// jeweiligen Ziel-Element (siehe EinfuehrungsOverlay.teilaktionen.ts) anzeigt,
// plus einer Fortschritts-/Überspringen-Leiste oben rechts.
//
// Bewusst KEIN OverlayRahmen.tsx-Muster (kein Modal, kein abgedunkelter
// Hintergrund) – die Einführung soll die übrige App sichtbar und teilweise
// bedienbar lassen (siehe Kopfkommentar in useEinfuehrung.ts /
// Gesetzestextansicht.types.ts: einfuehrungSperren). Trägt aber denselben
// data-overlay-aktiv-Marker wie OverlayRahmen.tsx (siehe dortiger
// Kommentar), damit die bestehenden Tastenkürzel-Sperren (Pfeilnavigation
// – siehe dortigen data-overlay-aktiv-Check) auch während der Einführung
// automatisch greifen. Der Marker folgt der Normwechsel-Erlaubnis und steuert
// Pfeilnavigation und Favoriten-Tasten. Die Klappstufen-Kürzel werden unabhängig
// davon im Eingabehook anhand der Erlaubnisse des Einführungsmoduls gesperrt.
//
// Positionierung: läuft über eine rAF-Schleife, weil sich Ziel-Elemente
// während der Einführung bewegen können (Stern wandert zwischen linker und
// rechter Leiste, adaptive Spaltenlayouts – siehe
// useAdaptivesLeistenLayout.ts) oder erst verzögert im DOM erscheinen
// (Öffnen-Overlay-Eingabefeld erst nach Öffnen des Overlays). Dieselbe
// Schleife misst auch die drei Grenz-Elemente (data-einfuehrung-grenze
// "oben"/"links"/"rechts" – siehe Tableiste.tsx, Lesezeichenleiste.tsx,
// Favoritenleiste.tsx), damit weder Sprechblase noch
// Fortschrittsleiste je eine Seitenleiste oder die Tableiste verdecken.
// Besonders wichtig, sobald die (erst zur Laufzeit erscheinende)
// Favoritenleiste rechts eingeblendet wird (Teilaktion 3/4) – dann muss auch
// die Fortschrittsleiste automatisch nach links ausweichen.
//
// Zwei Positionierungs-Strategien je nach Ziel:
// - Icons der Seitenleiste (Stern, Lesezeichen, Zu-/Aufklappen, Suche): sitzen alle
//   in einer vertikalen Spalte am linken oder rechten Fensterrand (siehe
//   Lesezeichenleiste.tsx: marginTop:'auto' pinnt sie unten). Die
//   Sprechblase erscheint daher SEITLICH neben der Spalte, vertikal auf
//   Höhe des Icons zentriert (nicht darüber/darunter, das würde bei
//   Icons nahe am Rand regelmäßig aus dem Fenster ragen).
// - Sucheingabe: fester Platz unterhalb der Fortschrittsleiste (siehe
//   ZIEL_OHNE_ANKER unten) statt direkt am Eingabefeld, damit sie das Feld
//   selbst nicht verdeckt.

import {
  einfuehrungsschritt,
  inhaltsTeilaktion,
  istErlaubt,
  GESAMT_EINFUEHRUNGSSCHRITTE,
} from '@/lib/domain/einfuehrung/einfuehrung.index';
import { useEffect, useRef, useState } from 'react';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import {
  SPRECHBLASE_BREITE,
  EINFUEHRUNG_RAHMENDICKE,
  Sprechblase,
  Haupttext,
  Zusatztext,
} from './EinfuehrungsOverlay.bausteine';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { usePlattform } from '@/hooks/utils/usePlattform';
import { EINFUEHRUNGS_TEILAKTIONEN } from '@/components/einfuehrung/EinfuehrungsOverlay.teilaktionen';
import type { EinfuehrungsZiel } from '@/components/einfuehrung/EinfuehrungsOverlay.teilaktionen';
import { useEinfuehrungsTextRollen } from './useEinfuehrungsTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

/** Höhen-Schätzung, bevor ein Element zum ersten Mal gerendert wurde (siehe
 *  aktualisieren() unten: danach wird die tatsächlich gemessene Höhe
 *  verwendet). Bewusst großzügig geschätzt (lieber einmal unnötig ausweichen
 *  als abgeschnitten werden). */
const GESCHAETZTE_HOEHE = 140;
const RAND = 16;
const ABSTAND_ZUM_ZIEL = 12;
/** Abstand zwischen der Fortschritts-/Überspringen-Leiste und einer direkt
 *  darunter angezeigten Sprechblase (Sucheingabe-Teilaktion, Einklappen-Hinweis
 *  ohne Icon-Ziel, siehe unterFortschritt unten). HIER anpassen, falls der
 *  Abstand wieder verändert werden soll – gilt einheitlich für alle Fälle,
 *  in denen eine Sprechblase an dieser Position erscheint. */
const ABSTAND_UNTER_FORTSCHRITT = 6;

/** Ziele, die seitlich (statt unter der Fortschrittsleiste) positioniert
 *  werden – siehe Kopfkommentar. Alles außer der Sucheingabe. */
const SEITLICHE_ZIELE = new Set<EinfuehrungsZiel>([
  'oeffnen',
  'favorit',
  'lesezeichen',
  'zuklappen',
  'aufklappen',
]);

interface Position {
  top: number;
  left: number;
}

interface Grenzen {
  /** Unterkante der Tableiste – nichts darf darüber liegen. */
  oben: number;
  /** Rechte Kante der linken Seitenleiste – nichts darf darunter liegen. */
  links: number;
  /** Linke Kante der rechten Favoritenleiste (0, falls nicht sichtbar) –
   *  nichts darf darüber hinausragen. */
  rechts: number;
}

const GRENZENLOS: Grenzen = { oben: 0, links: 0, rechts: 0 };

function grenzenMessen(): Grenzen {
  const oben =
    document.querySelector<HTMLElement>('[data-einfuehrung-grenze="oben"]')?.getBoundingClientRect()
      .bottom ?? 0;
  const links =
    document
      .querySelector<HTMLElement>('[data-einfuehrung-grenze="links"]')
      ?.getBoundingClientRect().right ?? 0;
  const rechtsEl = document.querySelector<HTMLElement>('[data-einfuehrung-grenze="rechts"]');
  const rechts = rechtsEl ? window.innerWidth - rechtsEl.getBoundingClientRect().left : 0;
  return { oben, links, rechts };
}

interface EinfuehrungsOverlayProps {
  teilaktion: number;
  keineVerbindung?: boolean;
  fertig: boolean;
  appName: string;
  /** Ist die aktuell aktive Norm bereits Favorit? Nur für Teilaktion 2
   *  (Favorit hinzufügen, 0-indiziert) relevant – siehe INHALTS_INDEX
   *  unten: War sie's schon vorher, zeigt Teilaktion 2 stattdessen den
   *  Entfernen-Text von Teilaktion 3 (App.tsx: favoritSpeichernMitEinfuehrung
   *  überspringt Teilaktion 3 anschließend per Sprung). */
  istAktuellFavorit: boolean;
  onUeberspringen: () => void;
  onFertig: () => void;
}

export function EinfuehrungsOverlay({
  teilaktion,
  keineVerbindung = false,
  fertig,
  appName,
  istAktuellFavorit,
  onUeberspringen,
  onFertig,
}: EinfuehrungsOverlayProps) {
  const textRollen = useEinfuehrungsTextRollen();
  const buttonRollen = useButtonRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const { istMac } = usePlattform();
  const [position, setPosition] = useState<Position | null>(null);
  const [grenzen, setGrenzen] = useState<Grenzen>(GRENZENLOS);
  const sprechblaseRef = useRef<HTMLDivElement>(null);
  const fortschrittRef = useRef<HTMLDivElement>(null);
  const grenzenRef = useRef(GRENZENLOS);

  // War die Norm beim Erreichen von Teilaktion 2 (Favorit hinzufügen) schon
  // Favorit, macht der Hinzufügen-Text keinen Sinn (der Klick entfernt ihn
  // ja tatsächlich) – dann wird stattdessen der ohnehin vorhandene
  // Entfernen-Text von Teilaktion 3 angezeigt. Der Fortschrittszähler
  // ("Schritt X von Y") bleibt bei Einführungsschritt 3, nur der INHALT
  // kommt von Index 3 – siehe App.tsx für die zugehörige Sprunglogik beim
  // Klick selbst.
  const inhaltsIndex = inhaltsTeilaktion(teilaktion, istAktuellFavorit);
  const aktuelleTeilaktion = fertig ? null : EINFUEHRUNGS_TEILAKTIONEN[inhaltsIndex];
  const ziel = aktuelleTeilaktion?.ziel ?? null;
  const breite = aktuelleTeilaktion?.breite ?? SPRECHBLASE_BREITE;

  // Verfolgt Ziel-Element, Hervorhebung und Grenzen live per rAF-Schleife
  // (siehe Kopfkommentar). Läuft unabhängig davon, ob die aktuelle Teilaktion
  // ein Ziel hat (die Fortschrittsleiste muss auch in Teilaktion 5/8 den
  // Grenzen ausweichen).
  useEffect(() => {
    let frame: number;
    const aktualisieren = () => {
      const g = grenzenMessen();
      const vorher = grenzenRef.current;
      if (g.oben !== vorher.oben || g.links !== vorher.links || g.rechts !== vorher.rechts) {
        grenzenRef.current = g;
        setGrenzen(g);
      }

      if (ziel && SEITLICHE_ZIELE.has(ziel)) {
        const el = document.querySelector<HTMLElement>(`[data-einfuehrung-ziel="${ziel}"]`);
        if (!el) {
          setPosition(null);
        } else {
          const rect = el.getBoundingClientRect();
          const hoehe = sprechblaseRef.current?.getBoundingClientRect().height ?? GESCHAETZTE_HOEHE;

          // Vertikal auf Höhe des Icons zentriert, aber innerhalb des
          // sichtbaren Bereichs geklemmt (Icons sitzen oft nah am unteren
          // Fensterrand – siehe Kopfkommentar).
          const top = Math.min(
            Math.max(rect.top + rect.height / 2 - hoehe / 2, g.oben + RAND),
            window.innerHeight - RAND - hoehe,
          );
          // Seite: Icons links im Fenster → Sprechblase rechts davon (und
          // umgekehrt für den Favoriten-Stern, sobald er in die rechte
          // Favoritenleiste gewandert ist).
          const linksSeite = rect.left < window.innerWidth / 2;
          const left = linksSeite
            ? Math.min(rect.right + ABSTAND_ZUM_ZIEL, window.innerWidth - g.rechts - breite - RAND)
            : Math.max(rect.left - ABSTAND_ZUM_ZIEL - breite, g.links + RAND);
          setPosition({ top, left });
        }
      } else if (ziel === 'oeffnen-eingabe') {
        // Fester Platz unterhalb der Fortschrittsleiste statt direkt am
        // Eingabefeld (siehe Kopfkommentar) – dieselbe Position wie die
        // "kein Ziel"-Sprechblase weiter unten. Bewusst KEINE Umrandung des
        // Eingabefelds selbst (Konversationsvorgabe: ohnehin prominent
        // offen, eine zusätzliche Umrandung wirkt eher unruhig als hilfreich).
        setPosition(null);
      }
      frame = requestAnimationFrame(aktualisieren);
    };
    frame = requestAnimationFrame(aktualisieren);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [ziel, breite]);

  const zusatztext = ersetzeTokens(aktuelleTeilaktion?.zusatztext, aktuelleTeilaktion, istMac);

  // Pfeile und Favoriten-Tasten teilen die Normwechsel-Erlaubnis.
  const dataOverlayAktiv = !istErlaubt(teilaktion, 'norm-wechseln') || undefined;

  // Fortschrittsleiste weicht den Grenzen aus – insbesondere der rechten
  // Favoritenleiste, sobald sie (ab Teilaktion 3) eingeblendet wird.
  const fortschrittTop = grenzen.oben + RAND;
  const fortschrittRight = grenzen.rechts + RAND;
  // Echte gemessene Höhe statt fixem Versatz (vorheriger Bug: zu wenig
  // Puffer zwischen Fortschrittsleiste und der darunter angezeigten
  // "kein Ziel"-Sprechblase in Teilaktion 6).
  const fortschrittHoehe = fortschrittRef.current?.getBoundingClientRect().height ?? 36;
  const unterFortschritt = fortschrittTop + fortschrittHoehe + ABSTAND_UNTER_FORTSCHRITT;

  const zeigeSeitlicheSprechblase: boolean = Boolean(
    !fertig && ziel && SEITLICHE_ZIELE.has(ziel) && position,
  );
  const zeigeFesteSprechblase: boolean = Boolean(
    !fertig && aktuelleTeilaktion && !zeigeSeitlicheSprechblase,
  );

  return (
    <div
      data-overlay-aktiv={dataOverlayAktiv}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: 'none' }}
    >
      {/* ── Fortschritt + Überspringen/Abschluss – EIN Kasten, der sich am
          Ende in das Abschluss-Popup verwandelt statt ein zweites daneben
          zu zeigen. ── */}
      <div
        ref={fortschrittRef}
        style={{
          position: 'absolute',
          top: fortschrittTop,
          right: fortschrittRight,
          display: 'flex',
          flexDirection: 'column',
          gap: abstandRollen.standard,
          background: 'var(--bg-leiste)',
          border: `${EINFUEHRUNG_RAHMENDICKE}px solid var(--akzent-blass)`,
          borderRadius: pxSkaliert(8, uiFaktor),
          padding: `${pxSkaliert(10, uiFaktor)}px ${pxSkaliert(12, uiFaktor)}px`,
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          pointerEvents: 'auto',
          width: fertig ? 260 : undefined,
          fontFamily: 'var(--schrift)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: abstandRollen.gross,
            justifyContent: 'space-between',
          }}
        >
          <TextAnzeige
            style={{
              ...(fertig ? textRollen.standardtextBetont : textRollen.standardtext),
              whiteSpace: 'nowrap',
            }}
            text={
              fertig
                ? 'Einführung abgeschlossen'
                : `Schritt ${einfuehrungsschritt(teilaktion)} von ${GESAMT_EINFUEHRUNGSSCHRITTE}`
            }
          />
          {!fertig && (
            <button
              onClick={onUeberspringen}
              style={{
                ...buttonRollen.sekundaerKompakt(),
                fontSize: textRollen.standardtext.fontSize,
                padding: buttonRollen.paddingFaktorKompakt(5 / 6, 10 / 14),
                background: 'var(--bg-eingabe)',
              }}
            >
              <TextAnzeige text="Einführung überspringen" />
            </button>
          )}
        </div>
        {fertig && (
          <>
            <TextAnzeige
              element="div"
              style={{ ...textRollen.standardtext, lineHeight: 1.4 }}
              text={`Sie kennen jetzt die wichtigsten Funktionen. Viel Freude mit ${appName}.`}
            />
            <button
              onClick={onFertig}
              style={{
                ...buttonRollen.primaerKompakt(),
                fontSize: textRollen.standardtext.fontSize,
                padding: buttonRollen.paddingFaktorKompakt(5 / 6, 10 / 14),
                alignSelf: 'flex-end',
              }}
            >
              <TextAnzeige text="Fertig" />
            </button>
          </>
        )}
      </div>

      {/* ── Sprechblase für Seitenleisten-Icon-Ziele (seitlich, vertikal zentriert) ── */}
      {zeigeSeitlicheSprechblase && (
        <Sprechblase
          innerRef={sprechblaseRef}
          breite={breite}
          style={{ top: position!.top, left: position!.left }}
        >
          <Haupttext
            text={ersetzeTokens(aktuelleTeilaktion!.haupttext, aktuelleTeilaktion, istMac)!}
          />
          <>{zusatztext ? <Zusatztext text={zusatztext} /> : null}</>
        </Sprechblase>
      )}

      {/* ── Sprechblase ohne festen Anker (Sucheingabe, Einklappen-Hinweis)
          – immer unterhalb der Fortschrittsleiste, damit sie nie ein
          anderes UI-Element verdeckt. ── */}
      {zeigeFesteSprechblase && (
        <Sprechblase
          breite={breite}
          style={{ top: unterFortschritt, right: fortschrittRight, left: 'auto' }}
        >
          <Haupttext
            text={ersetzeTokens(aktuelleTeilaktion!.haupttext, aktuelleTeilaktion, istMac)!}
          />
          <>
            {zusatztext ? <Zusatztext text={zusatztext} /> : null}
            {istErlaubt(teilaktion, 'suche-navigieren') && keineVerbindung ? (
              <Zusatztext text="Ohne Internetverbindung lässt sich das Gesetz nicht laden. Sie können es später erneut versuchen oder die Einführung überspringen." />
            ) : null}
          </>
        </Sprechblase>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text-Tokens: {tastenkuerzel}/{tastenkuerzel2} (Tastenkürzel), {zeiger} (Vorschau des
// blauen Auswahl-Zeigers), "\n" (Zeilenumbruch).
// ---------------------------------------------------------------------------

function ersetzeTokens(
  text: string | undefined,
  teilaktion:
    | {
        tastenkuerzel?: string;
        tastenkuerzel2?: string;
      }
    | null
    | undefined,
  istMac: boolean,
): string | undefined {
  if (!text) return text;
  let ergebnis = text;
  if (teilaktion?.tastenkuerzel)
    ergebnis = ergebnis.replace(
      '{tastenkuerzel}',
      tastenkuerzelAnzeige(teilaktion.tastenkuerzel, istMac),
    );
  if (teilaktion?.tastenkuerzel2)
    ergebnis = ergebnis.replace(
      '{tastenkuerzel2}',
      tastenkuerzelAnzeige(teilaktion.tastenkuerzel2, istMac),
    );
  return ergebnis;
}
