// useAuswahlleiste.ts
//
// Ermittelt, ob/wo nach einer per Pointer-Drag abgeschlossenen Textauswahl im
// Gesetzestext die schwebende Auswahlleiste (siehe
// auswahlleiste.tsx) angezeigt werden soll – ein
// ZWEITER, gleichwertiger Eintrittspunkt für dieselben bestehenden
// Markierungs-Aktionen (Unterstreichen/Hervorheben/Verweismarkierung/Kommentar/
// Entfernen), die bislang nur per Tastenkürzel/Menü auslösbar waren (siehe
// useMarkierungen.ts, useVerweismarkierungUndKommentarHilfsfenster.ts). Dieser Hook
// selbst löst KEINE Aktion aus und speichert nichts – er bestimmt nur den
// Anzeige-Zustand der Leiste; die eigentlichen Handler bleiben unverändert
// in den oben genannten Hooks.
//
// Auslöser: 'mouseup' auf dem Textcontainer (containerRef, siehe
// Gesetzestextansicht.tsx) – NICHT 'selectionchange', da die Leiste erst beim
// Loslassen erscheinen soll, nicht schon währenddessen. Die Position stammt
// aus dem mouseup-Event selbst (clientX/clientY), also möglichst nah an der
// Stelle, an der der Nutzer das Draggen beendet hat.
//
// Ausblenden bewusst NICHT bei bloßer Pointer-Entfernung (siehe Absprache):
// der Nutzer muss den Pointer erst zur Leiste hin bewegen, um ein Symbol zu
// treffen – ein Distanz-Trigger würde sie dabei genau im falschen Moment
// verstecken. Stattdessen blendet die Leiste aus bei: (1) Kollabieren/Leeren
// der Selektion (deckt "Klick woanders in den Text" über 'selectionchange'
// ab), (2) Escape, (3) Scrollen des Textcontainers (Position würde sonst
// veralten, da sie in Viewport-Koordinaten vorliegt), (4) Auslösen einer
// Aktion aus der Leiste selbst (siehe onAktionAusgefuehrt).

// Erkennt, ob eine Selektion visuell in einer einzigen Textzeile liegt.
// Bewusst über Range.getClientRects() statt über die Höhe der
// Gesamt-BoundingRect (selectionRect) – letztere ist bei Schriftgrößen-/
// Zeilenhöhen-Variationen (siehe --zeilen-abstand) nicht zuverlässig von
// "zwei knapp aufeinanderfolgenden Zeilen" zu unterscheiden. Client-Rects
// derselben Zeile liegen vertikal nah beieinander (Toleranz: halbe
// Rect-Höhe); Rects einer Folgezeile liegen um ca. eine volle Zeilenhöhe
// tiefer, was die Toleranz deutlich überschreitet. Rects mit Breite/Höhe 0
// (Browser erzeugen diese gelegentlich an Zeilenumbruch-/Element-Grenzen)
// werden vorher ausgefiltert.

import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import type {
  AuswahlErgebnis,
  AuswahlFehler,
  MehrfachAuswahlErgebnis,
  MehrfachAuswahlFehler,
  Textpfad,
} from '@/lib/domain/textpfad/textpfad.index';
import { ermittleAuswahl, ermittleMehrfachAuswahl } from '@/lib/domain/textpfad/textpfad.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';

function istEinzeiligeAuswahl(range: Range): boolean {
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  if (rects.length <= 1) return true;
  const tops = rects.map((r) => r.top);
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);
  const minHoehe = Math.min(...rects.map((r) => r.height));
  return maxTop - minTop < minHoehe / 2;
}

export interface AuswahlleisteState {
  position: { x: number; y: number };
  /** BoundingRect der GESAMTEN Selektion (ggf. mehrzeilig) in
   *  Viewport-Koordinaten – Grundlage dafür, dass die Leiste den
   *  ausgewählten Text nie verdeckt (siehe Positionierung in
   *  auswahlleiste.tsx: die Leiste erscheint
   *  IMMER oberhalb oder unterhalb dieses Rechtecks, nie mittendrin). */
  selectionRect: { top: number; bottom: number; left: number; right: number };
  /** true = Auswahl überspannt mehrere Normteile – Hinzufügen-Symbole werden
   *  ausgegraut angezeigt, bleiben aber klickbar (die aufgerufenen Handler
   *  zeigen in diesem Fall selbst das bekannte Warnungs-Banner, siehe
   *  useMarkierungen.ts: markieren()). */
  ueberspannt: boolean;
  /** true = eine bestehende BESTÄNDIGE Markierung ('verweismarkierung'/'kommentar',
   *  siehe pruefeMarkierungAnStelle) überlappt die Auswahl – das Anlegen
   *  EINER NEUEN Markierung (jeden Typs) an dieser Stelle ist deshalb
   *  blockiert. Graut wie `ueberspannt` die Hinzufügen-Symbole aus, bleiben
   *  aber ebenso klickbar: die aufgerufenen Handler (markieren() bzw.
   *  pruefeKonkurrenzUndZeigeBanner in useVerweismarkierungUndKommentarHilfsfenster.ts)
   *  zeigen beim tatsächlichen Klick selbst das Konflikt-Banner. Betrifft
   *  NICHT das "Entfernen"-Symbol (siehe ueberlappende unten) – Entfernen
   *  ist gerade der Weg, die Blockierung aufzulösen. */
  blockiert: boolean;
  /** true = die Selektion liegt visuell in einer einzigen Zeile (siehe
   *  istEinzeiligeAuswahl unten). Grundlage dafür, dass die Leiste in
   *  auswahlleiste.tsx bei einzeiligen Auswahlen
   *  bevorzugt oberhalb des Texts erscheint, statt wie bei mehrzeiligen
   *  Auswahlen anhand des Loslass-Punkts zu entscheiden. */
  einzeilig: boolean;
  /** xmlId des betroffenen Elements – undefined bei ueberspannt (dort nicht
   *  eindeutig bestimmbar, siehe ermittleAuswahl). */
  xmlId?: string;
  /** Bestehende Markierungen an genau dieser Auswahl-Stelle – bestimmt, ob
   *  das "Entfernen"-Symbol (umkreistes X) angezeigt wird. Leer bei
   *  ueberspannt. */
  ueberlappende: MarkierungsEintrag[];
  /** Ziel für "Zitat kopieren" – UNABHÄNGIG von `ueberspannt` bestimmt
   *  (siehe ermittleMehrfachAuswahl, textpfad.ts): anders als die
   *  vier übrigen Symbole (die nur EIN Blatt abdecken können) bleibt
   *  Kopieren auch bei einer über mehrere Blätter reichenden Auswahl aktiv,
   *  solange alle Blätter zur selben Norm gehören (GGT-Pfad). null = kein
   *  Zitat bildbar (leere Auswahl oder mehrere Normen betroffen) – Button
   *  dann ausgegraut. */
  kopierZiel: { xmlId: string; pfad: Textpfad } | null;
}

interface Optionen {
  containerRef: RefObject<HTMLDivElement | null>;
  gesetz: GesetzDarstellung;
  markierungenNachXmlId: Map<string, MarkierungsEintrag[]>;
  markierungenDeaktiviert: boolean;
}

export function useAuswahlleiste({
  containerRef,
  gesetz,
  markierungenNachXmlId,
  markierungenDeaktiviert,
}: Optionen) {
  const [leiste, setLeiste] = useState<AuswahlleisteState | null>(null);
  const ermittlungRef = useRef(0);
  const kopierenLaeuftRef = useRef(false);
  /** Von der Leiste selbst nach jedem Symbol-Klick aufgerufen – blendet sie
   *  sofort aus (unabhängig davon, ob die Aktion synchron abschließt, z.B.
   *  Unterstreichen, oder erst ein Hilfsfenster öffnet, z.B. Verweismarkierung).
   *  Setzt außerdem IMMER kopierenLaeuftRef zurück (siehe dort) – so bleibt
   *  der Guard nie länger als eine einzelne Aktion aktiv, auch wenn eine
   *  Aktion den Guard selbst nie explizit zurücksetzt (z.B. Escape/Klick
   *  außerhalb). */
  const ausblenden = useCallback(() => {
    ermittlungRef.current++;
    kopierenLaeuftRef.current = false;
    setLeiste(null);
  }, []);

  // Immer aktuelle Referenzen für den mouseup-Listener (siehe unten, per
  // leerem Dependency-Array registriert wie in useMarkierungen.ts:
  // bestätigten Historienempfang) – vermeidet Neu-Registrierung bei jeder
  // Gesetz-/Markierungen-Änderung.
  const gesetzRef = useRef(gesetz);
  const markierungenNachXmlIdRef = useRef(markierungenNachXmlId);
  const markierungenDeaktiviertRef = useRef(markierungenDeaktiviert);
  useEffect(() => {
    gesetzRef.current = gesetz;
  }, [gesetz]);
  useEffect(() => {
    markierungenNachXmlIdRef.current = markierungenNachXmlId;
  }, [markierungenNachXmlId]);
  useEffect(() => {
    markierungenDeaktiviertRef.current = markierungenDeaktiviert;
    if (markierungenDeaktiviert) ausblenden();
  }, [markierungenDeaktiviert, ausblenden]);

  // Während "Zitat kopieren" kurz "Zitat kopiert" statt der Symbole zeigt
  // (siehe auswahlleiste.tsx: kopiertSichtbar), MUSS
  // das automatische Ausblenden unten unterdrückt werden: der Klick auf den
  // Kopieren-Button selbst lässt die Textauswahl kollabieren (Browser-Verhalten
  // beim Fokussieren eines Buttons), was sonst SOFORT onSelectionChange
  // auslöst und die Leiste vor Ablauf der Anzeigezeit verschwinden lässt. Bei
  // den vier übrigen Symbolen fällt das nie auf, da die ohnehin per
  // ausblenden() sofort selbst schließen. Bleibt durchgängig true von diesem
  // mousedown bis ausblenden() (siehe unten) am Ende des gesamten Vorgangs
  // (Klick bis Ablauf der Kopiert-Anzeige) den Guard zurücksetzt – deckt
  // damit beide Phasen ab, ohne dass die Leiste selbst wissen muss, in
  // welcher Phase sie gerade ist.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let beendet = false;

    function onMouseUp(e: MouseEvent) {
      if (kopierenLaeuftRef.current) return;
      const ermittlung = ++ermittlungRef.current;
      if (markierungenDeaktiviertRef.current) {
        setLeiste(null);
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.toString().trim() === '') {
        setLeiste(null);
        return;
      }

      const auswahl: AuswahlErgebnis | AuswahlFehler = ermittleAuswahl(selection);
      // Unabhängige Zweit-Ermittlung nur für "Zitat kopieren" – siehe
      // kopierZiel-Kommentar oben: bewusst NICHT aus `auswahl` abgeleitet,
      // da "mehrere Blätter, aber gleiche Norm" für die vier anderen
      // Symbole ein Fehlerfall ist, für Kopieren aber nicht.
      const mehrfach: MehrfachAuswahlErgebnis | MehrfachAuswahlFehler =
        ermittleMehrfachAuswahl(selection);
      const kopierZiel = 'fehler' in mehrfach ? null : mehrfach;
      const position = { x: e.clientX, y: e.clientY };
      const range = selection.getRangeAt(0);
      const rohRect = range.getBoundingClientRect();
      const selectionRect = {
        top: rohRect.top,
        bottom: rohRect.bottom,
        left: rohRect.left,
        right: rohRect.right,
      };
      const einzeilig = istEinzeiligeAuswahl(range);

      if ('fehler' in auswahl) {
        if (auswahl.fehler === 'ueberspannt-mehrere') {
          setLeiste({
            position,
            selectionRect,
            ueberspannt: true,
            blockiert: false,
            einzeilig,
            ueberlappende: [],
            kopierZiel,
          });
        } else {
          setLeiste(null);
        }
        return;
      }

      const gesetzAktuell = gesetzRef.current;
      const element = gesetzAktuell.elemente.find((el) => el.data.xmlId === auswahl.xmlId);
      if (!element) {
        setLeiste(null);
        return;
      }

      const kennung = ausgangsnormKennung(gesetzAktuell, element);
      if (!kennung) {
        setLeiste(null);
        return;
      }

      const bisherige = markierungenNachXmlIdRef.current.get(auswahl.xmlId) ?? [];
      // Dynamischer Import analog zum übrigen Projekt (siehe useMarkierungen.ts) –
      // vermeidet, dass markierungSpeicher.ts (Tauri-fs-Zugriffe) im
      // Haupt-Bundle-Pfad des Text-Renderings landet.
      (async () => {
        const { pruefeMarkierungAnStelle } = await import('@/lib/markierungen/markierungen.index');
        if (beendet || ermittlung !== ermittlungRef.current) return;
        const { ueberlappende, blockiertNeueMarkierung } = pruefeMarkierungAnStelle(bisherige, {
          ausgangsstelle: kennung,
          bezug: { typ: 'bezugstext', textstelle: auswahl.textstelle, bezugstext: '' },
        });
        setLeiste({
          position,
          selectionRect,
          ueberspannt: false,
          blockiert: blockiertNeueMarkierung,
          einzeilig,
          xmlId: auswahl.xmlId,
          ueberlappende,
          kopierZiel,
        });
      })().catch(console.error);
    }

    function onSelectionChange() {
      const selection = window.getSelection();
      const leer = !selection || selection.isCollapsed || selection.toString().trim() === '';
      // Nur das durch den Kopierbutton verursachte Kollabieren schützen.
      if (kopierenLaeuftRef.current && leer) return;
      ermittlungRef.current++;
      if (leer || kopierenLaeuftRef.current) ausblenden();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        ausblenden();
      }
    }

    function onScroll() {
      ausblenden();
    }

    container.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKeyDown);
    container.addEventListener('scroll', onScroll);
    return () => {
      beendet = true;
      kopierenLaeuftRef.current = false;
      container.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('scroll', onScroll);
    };
    // Container ist ein unbedingt gerendertes DIV (siehe Gesetzestextansicht.tsx)
    // und damit für die gesamte Lebensdauer dieser Komponenteninstanz
    // stabil vorhanden – ein Mount-Effekt genügt, containerRef gehört nicht
    // ins Dependency-Array (Ref-Änderungen lösen ohnehin kein Re-Run aus).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Listener gehören zum lebenslang stabilen Container-DIV; aktuelle Handler und Auswahlwerte werden über Refs gelesen.
  }, []);

  /** Von der Leiste um handleKopieren herum aufgerufen (siehe
   *  kopierenLaeuftRef-Kommentar oben) – true während der "Zitat
   *  kopiert"-Anzeige, sonst false. */
  function setKopierenLaeuft(wert: boolean) {
    kopierenLaeuftRef.current = wert;
  }

  return { leiste, ausblenden, setKopierenLaeuft };
}
