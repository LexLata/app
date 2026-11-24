// auswahlleiste.tsx
//
// Schwebende, kompakte Auswahlleiste, die nach einer per Pointer-Drag
// abgeschlossenen Textauswahl im Gesetzestext erscheint (Zustand/Position
// siehe useAuswahlleiste.ts) – zweiter Eintrittspunkt für dieselben
// bestehenden Markierungs-Aktionen wie Tastenkürzel/Menü (⌘U, ⇧⌘U, ⌘K, ⇧⌘K,
// siehe useMarkierungen.ts/useVerweismarkierungUndKommentarHilfsfenster.ts). Reine
// Darstellung + Positionierung; jede Fachlogik bleibt in den o.g. Hooks.
//
// Positionierung: verdeckt NIE den ausgewählten Text – sie erscheint immer
// oberhalb oder unterhalb der gesamten Selektions-BoundingRect (leiste.
// selectionRect), nie mittendrin. Von den beiden Seiten wird die genommen,
// die näher am Loslass-Punkt (leiste.position) liegt UND ausreichend Platz
// bietet; passt keine der beiden ganz, die mit dem meisten Platz. Horizontal
// bleibt sie am Loslass-Punkt zentriert (an den Fensterrand geklemmt) – dort
// besteht kein Verdecken-Risiko, da sie vertikal schon außerhalb der Auswahl
// liegt. Die endgültige Position wird erst nach dem ersten Render anhand der
// tatsächlichen Größe berechnet (siehe useLayoutEffect unten), daher der
// kurze visibility:hidden-Zwischenschritt.
//
// Ausblenden (siehe useAuswahlleiste.ts für die vollständige
// Begründung): NICHT bei bloßer Pointer-Entfernung – der Nutzer muss den
// Pointer erst hierher bewegen, um ein Symbol zu treffen.
//
// onMouseDown mit preventDefault auf jedem Symbol: verhindert, dass der
// Klick auf den Button zuerst die Browser-Selektion kollabiert (Standard-
// Browserverhalten bei Fokuswechsel) – ohne das würde die beim Klick
// erneut ausgelesene Selektion (siehe handleUnterstreichen usw.) bereits
// leer sein.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AuswahlleisteState } from '@/components/gesetzestextansicht/auswahl/useAuswahlleiste';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';

interface Props {
  leiste: AuswahlleisteState;
  onUnterstreichen: () => void;
  onHervorheben: () => void;
  onVerweismarkierungAnfrage: () => void;
  onKommentarAnfrage: () => void;
  onEntfernen: (eintraege: MarkierungsEintrag[]) => void;
  /** Baut das Zitat und schreibt es in die Zwischenablage (siehe
   *  useZitatKopieren.ts) – Rückgabe true = Erfolg (zeigt danach kurz
   *  "Zitat kopiert" an), false = kein Zitat bildbar (Banner wird von der
   *  Funktion selbst gezeigt, siehe dort) bzw. Zwischenablage-Zugriff
   *  fehlgeschlagen. */
  onZitatKopieren: (kopierZiel: { xmlId: string; pfad: Textpfad } | null) => Promise<boolean>;
  /** Siehe kopierenLaeuftRef-Kommentar in useAuswahlleiste.ts –
   *  MUSS während der "Zitat kopiert"-Anzeige (kopiertSichtbar unten) true
   *  sein, sonst blendet der dortige mouseup/selectionchange-Listener die
   *  Leiste vorzeitig wieder aus. Bleibt ab dem mousedown durchgängig true,
   *  bis ausblenden() (siehe useAuswahlleiste.ts) am Ende dieses
   *  gesamten Vorgangs den Guard selbst zurücksetzt – deckt also sowohl das
   *  Zeitfenster bis zum Auflösen von onZitatKopieren als auch die
   *  anschließende Anzeigedauer ab. */
  onKopierenLaeuftAendern: (laeuft: boolean) => void;
  /** Nach jeder Aktion aufgerufen, blendet die Leiste aus – siehe
   *  useAuswahlleiste.ts: ausblenden(). */
  onAusgefuehrt: () => void;
}

// Wie lange "Zitat kopiert" (siehe kopiertSichtbar unten) angezeigt wird,
// bevor die Leiste sich wie bei den übrigen Aktionen schließt.
const KOPIERT_ANZEIGE_MS = 1200;

const RAND_ABSTAND = 8;
const VERTIKAL_ABSTAND = 10;

export function Auswahlleiste({
  leiste,
  onUnterstreichen,
  onHervorheben,
  onVerweismarkierungAnfrage,
  onKommentarAnfrage,
  onEntfernen,
  onZitatKopieren,
  onKopierenLaeuftAendern,
  onAusgefuehrt,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const uiFaktor = useUiSkalierungsFaktor();
  const textRollen = useTextRollen();

  // true = statt der Symbole U/H/§/💬(/Entfernen) steht kurz "Zitat kopiert"
  // da (siehe handleKopieren unten) – eigener, lokaler Zustand: rein
  // visuelles, kurzlebiges Feedback dieser einen Komponente, kein Store
  // nötig (analog zu `position` oben). Ändert NICHT die Größe der Leiste
  // (siehe Rendering unten: die ausgeblendeten Symbole bleiben gemountet,
  // nur unsichtbar) – die useLayoutEffect-Positionsberechnung unten braucht
  // deshalb auch keine Abhängigkeit davon.
  const [kopiertSichtbar, setKopiertSichtbar] = useState(false);
  const kopierLebensdauerRef = useRef<{
    aktuell: boolean;
    vorgang: number;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);

  useLayoutEffect(() => {
    const lebensdauer = {
      aktuell: true,
      vorgang: 0,
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    kopierLebensdauerRef.current = lebensdauer;
    setKopiertSichtbar(false);
    return () => {
      lebensdauer.aktuell = false;
      clearTimeout(lebensdauer.timer);
    };
  }, [leiste]);

  const { x, y } = leiste.position;
  const { top: auswahlOben, bottom: auswahlUnten } = leiste.selectionRect;
  const { einzeilig } = leiste;
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();

    let left = x - width / 2;
    left = Math.min(Math.max(left, RAND_ABSTAND), window.innerWidth - width - RAND_ABSTAND);

    // Nie über der Auswahl selbst: die Leiste liegt IMMER oberhalb von
    // auswahlOben oder unterhalb von auswahlUnten, nie
    // dazwischen. Näher am Pointer bevorzugt (Pointer liegt näher an
    // auswahlOben → oben bevorzugen, sonst unten), aber nur wenn dort
    // auch tatsächlich Platz ist – sonst automatischer Rückfall auf die
    // andere Seite. Reicht auf keiner Seite der volle Platz, wird die Seite
    // mit dem meisten verfügbaren Platz genommen (kein Überlappen der
    // Auswahl in Kauf nehmen, dafür ggf. an den Fensterrand geklemmt).
    const platzOben = auswahlOben - RAND_ABSTAND;
    const platzUnten = window.innerHeight - auswahlUnten - RAND_ABSTAND;
    // Bei einzeiliger Auswahl IMMER oberhalb bevorzugen (siehe
    // useAuswahlleiste.ts: einzeilig) statt anhand des
    // Loslass-Punkts zu entscheiden – bei einer einzelnen Zeile liegt der
    // Loslass-Punkt praktisch immer näher am unteren Rand der Auswahl (dort
    // endet der Drag), was die Leiste vorher fast immer nach UNTEN drängte,
    // obwohl oben meist ausreichend Platz ist. Nur bei mehrzeiliger Auswahl
    // bleibt die bisherige Punkt-basierte Entscheidung sinnvoll (dort kann
    // der Loslasspunkt oben oder unten liegen, je nach Drag-Richtung).
    const naeherAnOben = einzeilig ? true : Math.abs(y - auswahlOben) <= Math.abs(auswahlUnten - y);

    const obenPasstAusreichend = platzOben >= height;
    const untenPasstAusreichend = platzUnten >= height;

    let oben: boolean;
    if (obenPasstAusreichend && untenPasstAusreichend) oben = naeherAnOben;
    else if (obenPasstAusreichend) oben = true;
    else if (untenPasstAusreichend) oben = false;
    else oben = platzOben >= platzUnten; // keine Seite reicht ganz aus – die geräumigere nehmen

    let top = oben ? auswahlOben - height - VERTIKAL_ABSTAND : auswahlUnten + VERTIKAL_ABSTAND;
    top = Math.min(Math.max(top, RAND_ABSTAND), window.innerHeight - height - RAND_ABSTAND);

    setPosition({ left, top });
  }, [x, y, auswahlOben, auswahlUnten, einzeilig]);

  function ausloesen(action: () => void) {
    action();
    onAusgefuehrt();
  }

  // Eigener, asynchroner Ablauf statt ausloesen(): bei Erfolg bleibt die
  // Leiste noch KOPIERT_ANZEIGE_MS sichtbar (siehe kopiertSichtbar-Rendering
  // unten), erst danach onAusgefuehrt(). Bei Misserfolg (Banner wurde
  // bereits von onZitatKopieren selbst gezeigt, siehe dort) schließt die
  // Leiste sofort wie bei den übrigen Symbolen.
  async function handleKopieren() {
    const lebensdauer = kopierLebensdauerRef.current;
    if (!lebensdauer?.aktuell) return;
    const vorgang = ++lebensdauer.vorgang;
    clearTimeout(lebensdauer.timer);
    const erfolgreich = await onZitatKopieren(leiste.kopierZiel);
    // Der Schreibzugriff bleibt bestehen; überholt ist nur seine UI-Fortsetzung.
    if (!lebensdauer.aktuell || lebensdauer.vorgang !== vorgang) return;
    if (erfolgreich) {
      setKopiertSichtbar(true);
      lebensdauer.timer = setTimeout(() => {
        if (lebensdauer.aktuell && lebensdauer.vorgang === vorgang) onAusgefuehrt();
      }, KOPIERT_ANZEIGE_MS);
    } else {
      onAusgefuehrt();
    }
  }

  // aktiv: gilt für die vier Hinzufügen-Symbole (U/H/§/💬) – ausgegraut bei
  // ueberspannt (Auswahl über mehrere Normteile) ODER blockiert (bestehender
  // Verweis/Kommentar im Weg, siehe pruefeMarkierungAnStelle), bleiben in
  // beiden Fällen klickbar, die Handler zeigen dann selbst das Banner.
  // zeigeEntfernen bewusst UNABHÄNGIG von aktiv: das Entfernen-Symbol soll
  // gerade bei blockiert weiterhin aktiv bleiben (Entfernen löst die
  // Blockierung auf); bei ueberspannt ist ueberlappende ohnehin immer leer
  // (siehe useAuswahlleiste.ts), die explizite Prüfung dort bleibt
  // nur als sprechender Ausstieg erhalten.
  const aktiv = !leiste.ueberspannt && !leiste.blockiert;
  const zeigeEntfernen: boolean = !leiste.ueberspannt && leiste.ueberlappende.length > 0;
  const kopierAktiv = !!leiste.kopierZiel;

  return (
    <div
      ref={elRef}
      style={{
        position: 'fixed',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
        display: 'flex',
        gap: pxSkaliert(2, uiFaktor),
        // Keine bestehende paddingRollen-Rolle passt (kein zweiter
        // Anwendungsfall für ein allseitig gleiches 4px-Element-Padding
        // dieser Art) – daher direkt pxSkaliert() mit eigenem Rohwert.
        padding: pxSkaliert(4, uiFaktor),
        background: 'var(--bg-panel)',
        border: '1px solid var(--rahmen)',
        borderRadius: pxSkaliert(8, uiFaktor),
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
        zIndex: 1000,
      }}
      // Verhindert, dass ein Klick INNERHALB der Leiste (z.B. auf den
      // Zwischenraum zwischen den Symbolen) als "woanders geklickt" die
      // Selektion kollabieren lässt.
      //
      // onKopierenLaeuftAendern(true) MUSS bereits hier (mousedown) und
      // nicht erst im click-Handler von "Zitat kopieren" gesetzt werden:
      // das native 'mouseup' (das in useAuswahlleiste.ts den
      // Auto-Hide auslöst) feuert VOR Reacts synthetischem 'click' – ein im
      // Klick-Handler gesetzter Guard käme also zu spät, die Leiste wäre zu
      // dem Zeitpunkt schon ausgeblendet. Gilt für ALLE Symbole (nicht nur
      // Kopieren): harmlos, da ausblenden() (siehe useAuswahlleiste.ts)
      // den Guard nach jeder Aktion zuverlässig wieder zurücksetzt.
      onMouseDown={(e) => {
        e.preventDefault();
        onKopierenLaeuftAendern(true);
      }}
    >
      {/* Umschließt genau die Symbole, die bei "Zitat kopiert" ausgeblendet
          werden (U/H/§/💬 sowie ggf. Entfernen) – bleiben dabei bewusst
          GEMOUNTET (nur opacity:0 + pointer-events:none) statt entfernt zu
          werden: nur so behält die Leiste exakt ihre bisherige Breite/Höhe
          und muss ihre Position nicht neu berechnen (siehe useLayoutEffect
          oben, das absichtlich NICHT von kopiertSichtbar abhängt). Der
          Bestätigungstext wird absolut über genau diesen freiwerdenden
          Bereich gelegt und darin zentriert (position:relative-Anker unten). */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: pxSkaliert(2, uiFaktor),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: pxSkaliert(2, uiFaktor),
            opacity: kopiertSichtbar ? 0 : 1,
            pointerEvents: kopiertSichtbar ? 'none' : 'auto',
          }}
        >
          <Symbol titel="Unterstreichen" aktiv={aktiv} onKlick={() => ausloesen(onUnterstreichen)}>
            <TextAnzeige text="U" style={{ textDecoration: 'underline', fontWeight: 600 }} />
          </Symbol>

          <Symbol titel="Hervorheben" aktiv={aktiv} onKlick={() => ausloesen(onHervorheben)}>
            <TextAnzeige
              text="H"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: pxSkaliert(16, uiFaktor),
                height: pxSkaliert(16, uiFaktor),
                background: 'var(--hervorheben-kaestchen-bg)',
                borderRadius: pxSkaliert(3, uiFaktor),
                fontWeight: 600,
                fontSize: pxSkaliert(11, uiFaktor),
                color: 'var(--text-primaer)',
              }}
            />
          </Symbol>

          <Symbol
            titel="Verweis hinzufügen"
            aktiv={aktiv}
            onKlick={() => ausloesen(onVerweismarkierungAnfrage)}
          >
            <TextAnzeige text="§" style={{ fontWeight: 600 }} />
          </Symbol>

          <Symbol
            titel="Kommentar hinzufügen"
            aktiv={aktiv}
            onKlick={() => ausloesen(onKommentarAnfrage)}
          >
            <SprechblaseIcon groesse={pxSkaliert(15, uiFaktor)} />
          </Symbol>

          {zeigeEntfernen && (
            <Symbol
              titel="Markierung löschen"
              aktiv
              onKlick={() => ausloesen(() => onEntfernen(leiste.ueberlappende))}
            >
              <EntfernenIcon groesse={pxSkaliert(15, uiFaktor)} />
            </Symbol>
          )}
        </div>

        {kopiertSichtbar ? (
          <TextAnzeige
            text="Zitat kopiert"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...textRollen.standardtext,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>

      {/* IMMER gerendert (auch während kopiertSichtbar): bleibt dadurch über
          den gesamten Klick-Vorgang hinweg dieselbe Komponenteninstanz,
          sodass ihre lokale Klick-Animation (Symbol: gedrueckt-State,
          klickAnimation-Prop) tatsächlich sichtbar abläuft. */}
      <Symbol titel="Zitat kopieren" aktiv={kopierAktiv} klickAnimation onKlick={handleKopieren}>
        <KopierenIcon groesse={pxSkaliert(15, uiFaktor)} />
      </Symbol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function Symbol({
  titel,
  aktiv,
  onKlick,
  klickAnimation,
  children,
}: {
  titel: string;
  aktiv: boolean;
  onKlick: () => void;
  /** Simple Klick-Animation (kurzes Skalieren) – bewusst opt-in statt für
   *  alle Symbole, aktuell nur für "Zitat kopieren" gedacht, da dort das
   *  einzige unmittelbare Feedback der Klick selbst ist (kein Fenster, kein
   *  Overlay öffnet sich). */
  klickAnimation?: boolean;
  children: React.ReactElement;
}) {
  const uiFaktor = useUiSkalierungsFaktor();
  const radiusRollen = useRadiusRollen();
  const [gedrueckt, setGedrueckt] = useState(false);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(animationTimer.current), []);

  function handleClick() {
    if (klickAnimation) {
      setGedrueckt(true);
      clearTimeout(animationTimer.current);
      animationTimer.current = setTimeout(() => setGedrueckt(false), 150);
    }
    onKlick();
  }

  return (
    <TextAttributElement
      element="button"
      type="button"
      title={titel}
      aria-label={titel}
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: pxSkaliert(28, uiFaktor),
        height: pxSkaliert(28, uiFaktor),
        border: 'none',
        borderRadius: radiusRollen.standard,
        background: 'transparent',
        color: 'var(--text-primaer)',
        opacity: aktiv ? 1 : 0.35,
        cursor: 'pointer',
        fontSize: pxSkaliert(13, uiFaktor),
        transform: gedrueckt ? 'scale(0.82)' : 'scale(1)',
        transition: 'transform 100ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </TextAttributElement>
  );
}

function SprechblaseIcon({ groesse }: { groesse: number }) {
  return (
    // translateY: rein optischer Ausgleich, KEIN Bounding-Box-Fix. Der
    // Sprechblasen-Schwanz unten sorgt dafür, dass die reine
    // Bounding-Box-Mitte (die der Button per align-items/justify-content
    // verwendet) höher liegt als die optische Mitte des "Bubble"-Körpers –
    // das Auge gewichtet den Schwanz kaum, den runden Körper stark. Feinschliff:
    // Wert einfach in 0.5px-Schritten erhöhen (tiefer) oder verringern (höher),
    // bis es passt – wirkt sich NUR auf dieses Icon aus, alle anderen Symbole
    // bleiben unangetastet.
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: 'translateY(1.5px)' }}
    >
      <path
        d="M2 3.5C2 2.67 2.67 2 3.5 2h9c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H6.8l-2.6 2.2c-.3.25-.75.03-.75-.36V11h-.95C2.67 11 2 10.33 2 9.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EntfernenIcon({ groesse }: { groesse: number }) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="8" cy="8" r="6.3" stroke="var(--akzent-warnung)" strokeWidth="1.1" />
      <path
        d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"
        stroke="var(--akzent-warnung)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function KopierenIcon({ groesse }: { groesse: number }) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="6" y="6" width="7.5" height="7.5" rx="1.3" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M4.5 10H3.5C2.67 10 2 9.33 2 8.5v-5C2 2.67 2.67 2 3.5 2h5c.83 0 1.5.67 1.5 1.5V4.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
