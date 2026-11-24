// useAdaptivesLeistenLayout.ts
//
// Gemeinsame Layout-Logik für die schmalen Seitenleisten (Lesezeichen in
// Lesezeichenleiste.tsx, Favoriten in Favoritenleiste.tsx).
// Beide Leisten zeigten bislang denselben, byte-identisch duplizierten
// Algorithmus – hier an einer Stelle gebündelt, damit eine Änderung nicht
// an zwei Stellen synchron gehalten werden muss.
//
// Berechnet aus der verfügbaren Containerhöhe, der Anzahl an Einträgen und
// der gewählten Schriftgröße einen kontinuierlich interpolierten
// Zeilenabstand (lineHeight/paddingBlock) und entscheidet, ob ein- oder
// zweispaltig dargestellt werden soll oder ob gescrollt werden muss
// (letztes Mittel):
//   1. Einspaltig, dynamischer Zeilenabstand: nutzt die ganze Höhe,
//      reduziert bis auf ein Minimum.
//   2. Zweispaltig: wenn einspaltig nicht mehr genug Platz hat. Zeilenabstand
//      wird zurückgesetzt und wieder dynamisch reduziert.
//   3. Scrollen: wenn auch zweispaltig nicht ausreicht.
//
// Reagiert per ResizeObserver auf Größenänderungen des Containers UND auf
// Änderungen von `anzahl`/`fontGroesse` (dann ändern sich ITEM_H_MAX/MIN,
// der Observer wird neu aufgesetzt und feuert laut Spec beim erneuten
// observe() sofort einmal mit der aktuellen Höhe).

import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { RefObject } from 'react';

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

const LH_MAX = 1.7; // Maximaler lineHeight (angenehm)
const LH_MIN = 1.1; // Minimaler lineHeight (noch lesbar)
const PB_MAX = 3.5; // paddingBlock (px) beim maximalen lineHeight
const PB_MIN = 0; // paddingBlock (px) beim minimalen lineHeight

const CONTAINER_PADDING = 16;

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

type LayoutModus = 'einSpaltig' | 'zweiSpaltig' | 'scroll';

export interface LeistenLayoutAngaben {
  erlaubteTeilungen: number[];
  zusatzabstaende: number[];
  /** Anteil der Zusatzhöhe über dem lesbaren Minimum; fehlend bedeutet 1. */
  hoehenFaktoren?: number[];
}

interface LayoutZustand {
  teilung?: number;
  modus: LayoutModus;
  /** Berechnete Höhe pro Item in px (bestimmt lineHeight + paddingBlock). */
  itemHoehe: number;
  /**
   * Nur bei modus === 'zweiSpaltig' relevant: Anzahl der Einträge in der
   * Spalte, die zusätzlich `reserviertePixel` (z.B. den Button-Block)
   * tragen muss. Die aufrufende Leiste ordnet diese Zahl der jeweils
   * richtigen (bei ihr optisch linken oder rechten) Spalte zu.
   */
  mitReserveAnzahl?: number;
}

export interface AdaptivesLeistenLayout {
  teilung?: number;
  modus: LayoutModus;
  zweiSpaltig: boolean;
  scroll: boolean;
  lineHeight: number;
  paddingBlock: number;
  zeilenMehrhoehe: number;
  /** Siehe LayoutZustand.mitReserveAnzahl. */
  mitReserveAnzahl?: number;
}

// ---------------------------------------------------------------------------
// Reine Berechnungs-Helfer (exportiert, u.a. für spätere Tests)
// ---------------------------------------------------------------------------

/** Berechnet ITEM_H_MAX und ITEM_H_MIN aus der Schriftgröße. */
function itemHoeheGrenzen(fontGroesse: number) {
  return {
    itemHMax: fontGroesse * LH_MAX + 2 * PB_MAX,
    itemHMin: fontGroesse * LH_MIN + 2 * PB_MIN,
  };
}

/**
 * Gibt die optimale Item-Höhe und den Modus zurück, sodass alle Items in
 * den Container passen – oder wechselt in den Scroll-Modus.
 *
 * `reserviertePixel` (z.B. eine Button-Zeile) wird NICHT pauschal von der
 * Containerhöhe abgezogen, bevor durch die (halbierte) Item-Anzahl geteilt
 * wird: Das würde beiden Spalten gleichermaßen weniger Platz zubilligen,
 * obwohl die Reserve nur eine der beiden Spalten betrifft – die andere
 * bliebe dann mit einer Lücke in exakt der Größe der Reserve zurück (genau
 * das beobachtete Problem). Stattdessen wird itemHoehe so berechnet, dass
 * beide Spalten – die eine mit, die andere ohne Reserve – bei passend
 * verschobenem Split-Punkt beide bündig mit der Containerhöhe abschließen:
 *   itemHoehe * anzahl + reserviertePixel = 2 * verfuegbar
 * (die Reserve „kostet" also im Schnitt über beide Spalten hinweg nur die
 * Hälfte, weil sie nur in einer von zwei Spalten anfällt).
 */
function berechneLayout(
  containerHoehe: number,
  anzahl: number,
  itemHMax: number,
  itemHMin: number,
  reserviertePixel: number = 0,
  innenabstand = CONTAINER_PADDING,
): LayoutZustand {
  if (anzahl === 0) return { modus: 'einSpaltig', itemHoehe: itemHMax };

  const verfuegbar = containerHoehe - innenabstand;

  // 1. Einspaltig: Reserve liegt in derselben (einzigen) Spalte wie die
  //    Einträge, wird also ganz regulär abgezogen.
  const zielEin = (verfuegbar - reserviertePixel) / anzahl;
  if (zielEin >= itemHMin) {
    return {
      modus: 'einSpaltig',
      itemHoehe: Math.min(itemHMax, zielEin), // nie größer als MAX
    };
  }

  // 2. Zweispaltig: siehe Formel-Herleitung oben.
  const zielZwei = (2 * verfuegbar - reserviertePixel) / anzahl;
  if (zielZwei >= itemHMin) {
    const itemHoehe = Math.min(itemHMax, zielZwei);
    // Der Shift ist unabhängig davon, ob itemHoehe am Komfort-Maximum
    // gedeckelt ist: itemHoehe fließt hier als tatsächlich gerenderter Wert
    // ein, die Formel macht beide Spalten damit bündig – ob itemHoehe durch
    // den Deckel oder durch den Platz begrenzt wurde, spielt dafür keine
    // Rolle. Direkt nach dem Umbruch von ein- auf zweispaltig ist die
    // zweispaltige itemHoehe oft sofort gedeckelt (sie verdoppelt sich beim
    // Umbruch ungefähr) – ein früherer Sonderfall, der den Shift in diesem
    // Fall auf 0 setzte, führte genau dann zu einem Überlauf der Spalte mit
    // Reserve (Buttons passten nicht mehr hinein).
    const verschiebung = itemHoehe > 0 ? reserviertePixel / itemHoehe : 0;
    const mitReserveAnzahl = Math.min(anzahl, Math.max(0, Math.round((anzahl - verschiebung) / 2)));
    return { modus: 'zweiSpaltig', itemHoehe, mitReserveAnzahl };
  }

  // 3. Scrollen: nichts mehr hilft – Items in normaler Größe, Overflow-Y auto
  return { modus: 'scroll', itemHoehe: itemHMax };
}

/** Prüft jede zulässige Teilung mit den tatsächlich gerenderten Zusatzhöhen. */
function berechneGeschuetztesLayout(
  hoehe: number,
  anzahl: number,
  maximum: number,
  minimum: number,
  reserve: number,
  angaben: LeistenLayoutAngaben,
  seite: 'links' | 'rechts',
  innenabstand = CONTAINER_PADDING,
): LayoutZustand {
  const platz = hoehe - innenabstand;
  const abstand = (von: number, bis: number) =>
    angaben.zusatzabstaende.slice(von + 1, bis).reduce((summe, wert) => summe + wert, 0);
  if (anzahl === 0) return { modus: reserve > platz ? 'scroll' : 'einSpaltig', itemHoehe: maximum };
  const zielhoehe = (von: number, bis: number, reserviert: number) => {
    const faktor =
      angaben.hoehenFaktoren?.slice(von, bis).reduce((summe, wert) => summe + wert, 0) ?? bis - von;
    return minimum + (platz - reserviert - abstand(von, bis) - (bis - von) * minimum) / faktor;
  };
  const ein = zielhoehe(0, anzahl, reserve);
  if (ein >= minimum) return { modus: 'einSpaltig', itemHoehe: Math.min(maximum, ein) };
  const alt = berechneLayout(hoehe, anzahl, maximum, minimum, reserve);
  const reserveAnzahl = alt.mitReserveAnzahl ?? Math.round((anzahl - reserve / minimum) / 2);
  const bevorzugt = seite === 'rechts' ? reserveAnzahl : anzahl - reserveAnzahl;
  const kandidaten = angaben.erlaubteTeilungen
    .filter((teilung) => teilung > 0 && teilung < anzahl)
    .map((teilung) => {
      const reserveLinks = seite === 'rechts' ? reserve : 0;
      const links = zielhoehe(0, teilung, reserveLinks);
      const rechts = zielhoehe(teilung, anzahl, reserve - reserveLinks);
      return {
        teilung,
        itemHoehe: Math.min(maximum, links, rechts),
        entfernung: Math.abs(teilung - bevorzugt),
        reserveZeilen: seite === 'rechts' ? teilung : anzahl - teilung,
      };
    })
    .filter((kandidat) => kandidat.itemHoehe >= minimum)
    .sort(
      (a, b) =>
        b.itemHoehe - a.itemHoehe ||
        a.entfernung - b.entfernung ||
        a.reserveZeilen - b.reserveZeilen,
    );
  const beste = kandidaten[0];
  return beste
    ? { modus: 'zweiSpaltig', itemHoehe: beste.itemHoehe, teilung: beste.teilung }
    : { modus: 'scroll', itemHoehe: maximum };
}

/** Leitet lineHeight und paddingBlock aus der Item-Höhe ab (lineare Interpolation). */
function itemHoeheZuStyle(
  itemHoehe: number,
  itemHMax: number,
  itemHMin: number,
): { lineHeight: number; paddingBlock: number } {
  const t = (itemHoehe - itemHMin) / (itemHMax - itemHMin);
  return {
    lineHeight: LH_MIN + t * (LH_MAX - LH_MIN),
    paddingBlock: PB_MIN + t * (PB_MAX - PB_MIN),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Berechnet das adaptive Layout (Zeilenabstand, Spaltenmodus) für eine
 * schmale Seitenleiste mit fester Höhe und variabler Anzahl an Einträgen.
 *
 * @param containerRef Ref auf den scrollenden/begrenzenden Leisten-Container.
 * @param anzahl        Anzahl der darzustellenden Zeilen (inkl. Kopfzeilen,
 *                       falls die aufrufende Leiste solche kennt).
 * @param fontGroesse    Aktuelle Schriftgröße der Leiste (z.B. leistenSchriftgroesse).
 * @param reserviertePixel Fest reservierte Höhe (z.B. eine Button-Zeile am
 *   Ende einer Spalte, siehe SEITENLEISTEN_BUTTON_HOEHE), die NICHT für
 *   Einträge zur Verfügung steht. Siehe berechneLayout für die genaue
 *   Verrechnung im zweispaltigen Fall.
 */
export function useAdaptivesLeistenLayout(
  containerRef: RefObject<HTMLDivElement | null>,
  anzahl: number,
  fontGroesse: number,
  reserviertePixel: number = 0,
  layoutAngaben?: LeistenLayoutAngaben,
  seite: 'links' | 'rechts' = 'rechts',
  innenabstand = CONTAINER_PADDING,
): AdaptivesLeistenLayout {
  const { itemHMax, itemHMin } = itemHoeheGrenzen(fontGroesse);
  const [layout, setLayout] = useState<LayoutZustand>({ modus: 'einSpaltig', itemHoehe: itemHMax });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Der erste Spaltenmodus muss vor der Zielmessung im selben Paint feststehen.
    const berechnen = () =>
      layoutAngaben
        ? berechneGeschuetztesLayout(
            el.clientHeight,
            anzahl,
            itemHMax,
            itemHMin,
            reserviertePixel,
            layoutAngaben,
            seite,
            innenabstand,
          )
        : berechneLayout(
            el.clientHeight,
            anzahl,
            itemHMax,
            itemHMin,
            reserviertePixel,
            innenabstand,
          );
    let stand = berechnen();
    const gleich = (a: LayoutZustand, b: LayoutZustand) =>
      a.teilung === b.teilung &&
      a.modus === b.modus &&
      a.itemHoehe === b.itemHoehe &&
      a.mitReserveAnzahl === b.mitReserveAnzahl;
    setLayout((vorher) => (gleich(vorher, stand) ? vorher : stand));
    const uebernehmen = (neu: LayoutZustand) => {
      if (gleich(stand, neu)) return;
      stand = neu;
      setLayout(neu);
    };
    // rAF-Drosselung: während eines kontinuierlichen Fenster-Resizes feuert
    // ResizeObserver ggf. mehrfach pro Frame – ohne Drosselung löst das
    // ebenso oft ein setState (Re-Render) aus. Das verzögert/verlangsamt den
    // Hauptthread und lässt die Leiste beim Ziehen sichtbar hinter der
    // eigentlichen Fensterkante zurückbleiben. Analog zum bestehenden
    // Muster in useStrukturKontext.ts (onScroll) wird pro Frame nur der
    // jeweils letzte Messwert verarbeitet.
    let frame: number | null = null;
    let aktiv = true;
    const ro = new ResizeObserver(() => {
      if (!aktiv) return;
      const neu = berechnen();
      if (
        neu.teilung !== stand.teilung ||
        neu.modus !== stand.modus ||
        neu.mitReserveAnzahl !== stand.mitReserveAnzahl
      ) {
        // Eine andere Spaltenaufteilung ändert die Textbreite noch vor diesem Paint.
        flushSync(() => uebernehmen(neu));
      } else if (!gleich(stand, neu) && frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          if (aktiv) uebernehmen(berechnen());
        });
      }
    });
    ro.observe(el);
    return () => {
      aktiv = false;
      ro.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [
    containerRef,
    anzahl,
    itemHMax,
    itemHMin,
    reserviertePixel,
    layoutAngaben,
    seite,
    innenabstand,
  ]);

  const { lineHeight, paddingBlock } = itemHoeheZuStyle(layout.itemHoehe, itemHMax, itemHMin);

  return {
    teilung: layout.teilung,
    modus: layout.modus,
    zweiSpaltig: layout.modus === 'zweiSpaltig',
    scroll: layout.modus === 'scroll',
    lineHeight,
    paddingBlock,
    zeilenMehrhoehe: layout.itemHoehe - itemHMin,
    mitReserveAnzahl: layout.mitReserveAnzahl,
  };
}
