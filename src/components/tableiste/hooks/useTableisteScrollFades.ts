// useTableisteScrollFades.ts
//
// Kapselt zwei zusammengehörige, rein scrollbezogene Verantwortlichkeiten der
// Tableiste, die zuvor direkt in Tableiste.tsx lagen:
//
//  - Sichtbarkeit der Links-/Rechts-Fade-Overlays (kannLinksScrollen /
//    kannRechtsScrollen), abhängig vom aktuellen scrollLeft der Leiste.
//    Reagiert auf Größenänderungen (ResizeObserver) und auf Tab-Änderungen
//    (neue Tabs können neue Scroll-Breite erzeugen).
//  - Sicherstellen, dass der aktive Tab sichtbar ist (scrollIntoView) –
//    deckt sowohl Klicks in der Leiste als auch externe Aktivierungen ab
//    (⌘1, ⌃Tab, neuer Tab, …).
//  - Autoscroll, wenn während eines laufenden Tab-Drags der Cursor nahe an
//    den linken/rechten Rand der Leiste kommt.
//
// Bewusst NICHT Teil von useTabDragUndReihenfolge: Scroll-Fades und
// Sichtbarkeit des aktiven Tabs sind auch UNABHÄNGIG von einem laufenden
// Drag relevant (z. B. nach Tastatur-Tabwechsel), Autoscroll ist die einzige
// Berührung mit Drag – wird daher hier als reine start/stop-Funktion nach
// außen gegeben, die der Drag-Hook bei Bedarf aufruft.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Tab } from '@/lib/domain/appTypes.ts';

const AUTOSCROLL_RAND = 40;
const AUTOSCROLL_TEMPO = 10;

interface Params {
  leisteRef: React.RefObject<HTMLDivElement | null>;
  tabs: Tab[];
  aktiverTabId: string | null;
  /** Faktor-bewusst berechnete Breite des "Neuer Tab"-Buttons (siehe
   *  tableisteStil.ts: neuerTabButtonBreite()) – vom Aufrufer übergeben,
   *  da sie vom aktuellen UI-Skalierungsfaktor UND der bereits skalierten
   *  Icon-Größe abhängt und dieser Hook selbst kein UI-Größe-Context-
   *  Consumer sein soll (reiner Scroll-/Layout-Hook). */
  neuerTabButtonBreite: number;
}

export function useTableisteScrollFades({
  leisteRef,
  tabs,
  aktiverTabId,
  neuerTabButtonBreite,
}: Params) {
  const [kannLinksScrollen, setKannLinksScrollen] = useState(false);
  const [kannRechtsScrollen, setKannRechtsScrollen] = useState(false);
  // Ob der "Neuer Tab"-Button noch inline rechts hinter den Tabs Platz hat
  // (siehe Tableiste.tsx: sonst wird er stattdessen stabil neben dem
  // Übersicht-Button gerendert). Bewusst über die tatsächlichen Tab-Elemente
  // ([data-tab-id]) statt über el.scrollWidth berechnet, da Letzteres vom
  // Button selbst mitbeeinflusst würde, sobald er inline gerendert ist –
  // das würde zu einem Zirkelschluss zwischen Button-Präsenz und
  // Breitenmessung führen.
  const [neuerTabButtonPasstInline, setNeuerTabButtonPasstInline] = useState(true);
  const autoScrollRichtung = useRef<'links' | 'rechts' | null>(null);
  const autoScrollFrame = useRef<number | null>(null);

  const scrollFadeAktualisieren = useCallback(() => {
    const el = leisteRef.current;
    if (!el) return;
    setKannLinksScrollen(el.scrollLeft > 1);
    setKannRechtsScrollen(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);

    let tabsBreite = 0;
    el.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((tabEl) => {
      tabsBreite += tabEl.offsetWidth;
    });
    setNeuerTabButtonPasstInline(tabsBreite + neuerTabButtonBreite <= el.clientWidth);
  }, [leisteRef, neuerTabButtonBreite]);

  useEffect(() => {
    const el = leisteRef.current;
    if (!el) return;
    const beobachter = new ResizeObserver(() => scrollFadeAktualisieren());
    beobachter.observe(el);
    scrollFadeAktualisieren();
    return () => beobachter.disconnect();
  }, [leisteRef, scrollFadeAktualisieren]);

  useEffect(() => {
    // Nach Tab-Hinzufügen/-Entfernen ODER einer Änderung der (faktor-
    // abhängigen) Neuer-Tab-Button-Breite erst nach dem Layout-Update neu
    // berechnen.
    requestAnimationFrame(scrollFadeAktualisieren);
  }, [tabs, neuerTabButtonBreite, scrollFadeAktualisieren]);

  // Sichtbarkeit des aktiven Tabs sicherstellen – deckt sowohl Klicks in der
  // Leiste selbst als auch externe Aktivierungen ab (⌘1, ⌃Tab, neuer Tab, …),
  // da all diese Wege letztlich aktiverTabId verändern.
  useEffect(() => {
    if (!aktiverTabId) return;
    const el = leisteRef.current?.querySelector<HTMLElement>(`[data-tab-id="${aktiverTabId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [aktiverTabId, leisteRef]);

  function autoScrollStoppen() {
    autoScrollRichtung.current = null;
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }

  function autoScrollStarten(richtung: 'links' | 'rechts') {
    if (autoScrollRichtung.current === richtung) return;
    autoScrollRichtung.current = richtung;
    if (autoScrollFrame.current !== null) return;

    const schritt = () => {
      const el = leisteRef.current;
      if (!el || !autoScrollRichtung.current) {
        autoScrollFrame.current = null;
        return;
      }
      el.scrollLeft +=
        autoScrollRichtung.current === 'links' ? -AUTOSCROLL_TEMPO : AUTOSCROLL_TEMPO;
      autoScrollFrame.current = requestAnimationFrame(schritt);
    };
    autoScrollFrame.current = requestAnimationFrame(schritt);
  }

  // Von useTabDragUndReihenfolge während onMove aufgerufen: prüft die
  // Cursor-Position relativ zur Leiste und startet/stoppt Autoscroll
  // entsprechend. Bündelt die AUTOSCROLL_RAND-Schwellenwertprüfung hier statt
  // sie im Drag-Hook zu duplizieren.
  function autoScrollBeiCursorAktualisieren(clientX: number) {
    const el = leisteRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (clientX < rect.left + AUTOSCROLL_RAND) {
      autoScrollStarten('links');
    } else if (clientX > rect.right - AUTOSCROLL_RAND) {
      autoScrollStarten('rechts');
    } else {
      autoScrollStoppen();
    }
  }

  return {
    kannLinksScrollen,
    kannRechtsScrollen,
    neuerTabButtonPasstInline,
    scrollFadeAktualisieren,
    autoScrollBeiCursorAktualisieren,
    autoScrollStoppen,
  };
}
