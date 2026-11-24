// useStrukturKontext.ts
// Kontextpfad und Höhenpolster aus dem inneren Scrollmessstand; kein eigener
// DOM-/Scrolllistener. Die Renderleiste meldet ihre natürliche Höhe zurück.

import {
  STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT,
  STRUKTURKONTEXTLEISTE_GROESSE_WERTE,
} from '@/lib/stil/gesetzTextDarstellung';
import type { ScrollStand } from './scrollen/scrollen.index';
import { useLayoutEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';

import {
  berechneSichtbarenKontextPfad,
  kontextEintragId,
  kontextPfadeGleich,
  type KontextEintrag,
} from './useStrukturKontext.helpers';

// Scroll-Handler
// Verarbeitet den Messstand des Scrollmoduls unabhängig von äußeren
// Rückmelde-Callbacks. DOM-Container, Virtualizer und Auftragslebensdauer
// gehören useScrollSteuerung; die Ansichtssteuerung hält den Kontextpfad.
//
// Verwaltet zusätzlich die EFFEKTIVE (gepolsterte) Höhe der Leiste als
// eigenen State (Rückgabewert effektiveHoehe) – siehe Kommentar am Dateikopf.
// Kernidee des Polsters: Beim Schrumpfen des Pfads (echteHoeheRef sinkt)
// darf die effektive Höhe pro Scroll-Tick höchstens um die tatsächliche
// Scroll-Distanz seit dem letzten Tick sinken. Dadurch bleibt
// contentOffset = scrollTop - scrollMargin + effektiveHoehe während der
// gesamten Abbau-Phase MATHEMATISCH KONSTANT: scrollTop wächst um genau
// das Delta, effektiveHoehe sinkt um genau dasselbe Delta, die Summe ändert
// sich nicht. Der daraus berechnete Pfad bleibt also stabil, bis das
// Polster (= effektiveHoehe - echteHoehe) auf 0 abgebaut ist – erst dann
// kann contentOffset wieder steigen und ein neuer Wechsel ausgelöst werden.
// Wächst echteHoehe dagegen (tiefere Ebene wird betreten), springt
// effektiveHoehe sofort mit hoch: die Anticipation-Logik in
// berechneSichtbarenKontextPfad sorgt bereits dafür, dass das nicht abrupt
// wirkt, ein Polster wäre hier nur zusätzliche Verzögerung ohne Nutzen.
//
// Umkehren der Scroll-Richtung mitten im Abbau: Die obige Konstanz von
// contentOffset gilt nur, wenn das Polster bei JEDER Scroll-Bewegung (nicht
// nur abwärts) um genau das Delta verändert wird – sinkt es bei
// Abwärts-Scrollen um delta, muss es bei Aufwärts-Scrollen um |delta|
// WACHSEN, sonst bleibt contentOffset beim Umkehren nicht konstant, sondern
// fällt mit scrollTop, und der gerade verlassene (höherrangige) Eintrag
// taucht kurz wieder auf, bevor er gleich wieder verschwindet – ein kurzes
// Aufflackern beim Richtungswechsel.
//
// peakEchteHoeheRef begrenzt dieses Wachstum nach oben. WICHTIG: das muss
// eine ABSOLUTE Obergrenze sein (der höchste echte Höhenwert seit dem
// letzten vollständigen Abbau), keine bei jedem Schrumpfen aufsummierte
// Differenz! Eine aufsummierende Variante kann unbegrenzt wachsen, wenn der
// Reset (s.u.) durch anhaltend schnelles Aufwärts-Scrollen nie zum Zug
// kommt: bei großem (negativem) Delta wird die effektive Höhe nämlich an
// der OBERGRENZE geklemmt statt am Boden, der Reset-Bedingung
// (effektiveHoehe == echteHoehe) greift dadurch nie, und jedes weitere
// Schrumpfen während dieser Phase addiert sich weiter auf die Obergrenze
// drauf – das hat genau das (durch sehr schnelles Hoch-Scrollen über viele
// Gliederungswechsel ausgelöste) Einfrieren verursacht: die Leiste wuchs
// dabei auf eine absurde Pixel-Höhe, deren Höhen-Transition/Layout den
// Hauptthread blockierte. Eine absolute Obergrenze (= Maximum statt Summe)
// ist dagegen von Natur aus durch die maximale Gliederungstiefe des
// Dokuments begrenzt und kann nie darüber hinauswachsen, egal wie oft/wie
// schnell zwischendurch geschrumpft wird.
//
// Performance bei großen Gesetzen (z. B. BGB) und schwächeren Rechnern:
// 1. Der Handler läuft höchstens einmal pro Animationsframe (rAF-Drosselung
//    über tickAusstehend unten), nicht einmal pro rohem 'scroll'-Event –
//    bei schnellem/Momentum-Scrollen können davon weit mehr pro Sekunde
//    feuern, als der Bildschirm Frames anzeigt.
// 2. ermittleKontextPfadSchnell löst die Vorfahren-Suche per Binärsuche in
//    einer vorberechneten, NUR Überschriften enthaltenden Liste auf
//    (O(log Überschriftenanzahl)) statt mit einem linearen Durchlauf durch
//    ALLE sichtbaren Elemente (O(n), inkl. aller Normen/Sätze) bei jedem
//    Scroll-Tick – bei mehreren tausend Elementen sonst ein spürbarer
//    Engpass.

export function useStrukturKontext(params: {
  stand: ScrollStand | null;
  sichtbareElemente: readonly DarstellungsElement[];
  schrift: number;
  skalierung?: number;
  scrollMargin: number;
  // Echte/Ziel-Höhe der Leiste für den AKTUELLEN Pfad – von
  // StrukturKontextLeiste per ResizeObserver an die Ansichtssteuerung gemeldet. Dient
  // hier als Untergrenze für die unten verwaltete effektive Höhe und wird
  // separat auch noch von springeZuIndex im Scrollmodul gebraucht
  // (ein Sprungziel landet immer exakt unter der ECHTEN, ungepolsterten
  // Höhe – ein gezielter Sprung soll kein zufällig vorhandenes Polster
  // mitschleppen, siehe polsterZuruecksetzen unten).
  echteHoeheRef: RefObject<number>;
  auftragAktiv: boolean;
  setKontextPfad: Dispatch<SetStateAction<KontextEintrag[]>>;
  // Optionaler Callback: wird bei jedem updateKontextPfad mit dem Index des
  // ersten tatsächlich sichtbaren Elements (unter der Leiste) und dem
  // vorzeichenbehafteten Abstand der rohen Scrollposition zum Elementanfang aufgerufen. Ermöglicht
  // einen optionalen inneren Beobachter. Die äußeren Tab-/Positionsmeldungen
  // gehören der Ansichtssteuerung und folgen dem stabilen Scrollmodulstand.
  onFirstVisible?: (index: number, offsetInItem: number) => void;
}): {
  effektiveHoehe: number;
  hoeheAnimiert: boolean;
  polsterZuruecksetzen: () => void;
  kontextAktualisieren: () => void;
  kontextPfadFuerZielSetzen: (index: number) => void;
  zielPfad: (index: number) => KontextEintrag[];
} {
  const {
    stand,
    sichtbareElemente,
    schrift,
    skalierung = STRUKTURKONTEXTLEISTE_GROESSE_WERTE[STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT],
    scrollMargin,
    echteHoeheRef,
    auftragAktiv,
    setKontextPfad,
    onFirstVisible,
  } = params;

  const [effektiveHoehe, setEffektiveHoehe] = useState(0);
  const effektiveHoeheRef = useRef(0);
  const letzterScrollTopRef = useRef(0);
  // Höchster echter Höhenwert seit dem letzten vollständigen Abbau – siehe
  // ausführlichen Kommentar oben, warum das ein MAXIMUM statt einer
  // aufsummierten Differenz sein muss.
  const peakEchteHoeheRef = useRef(0);
  // Sticky-Status der Anticipation-Entscheidung aus
  // berechneSichtbarenKontextPfad – siehe ausführlicher Kommentar dort
  // (bereitsAlsAktivBestaetigt), behebt das einmalige Aufflackern beim
  // Aufwärts-Scrollen durch die eigene Zeile von firstVisibleEintrag.
  // letzterFirstVisibleIndexRef hält fest, für welchen Index die
  // Entscheidung zuletzt getroffen wurde; firstVisibleEintragWarInkludiertRef
  // das Ergebnis dieser Entscheidung. Beide werden nur verwendet, solange
  // firstVisible.index zwischen zwei Ticks UNVERÄNDERT bleibt – bei jedem
  // Wechsel auf einen neuen Index wird ganz normal neu (geometrisch)
  // entschieden.
  const letzterFirstVisibleIndexRef = useRef<number | null>(null);
  const firstVisibleEintragWarInkludiertRef = useRef(false);
  // Stabile Referenz auf die aktuelle updateKontextPfad-Funktion: wird bei
  // jedem Effekt-Durchlauf aktualisiert und von kontextAktualisieren() (dem
  // Hook-Return-Wert) aufgerufen – so können Aufrufer außerhalb des Effekts
  // (insb. nach Abschluss eines springeZuIndex-Sprungs) immer die frische
  // Closure mit aktuellen sichtbareElemente/schrift-Werten erwischen.
  const kontextAktualisierenRef = useRef<() => void>(() => {});
  // Steuert, ob Höhenänderungen der Leiste aktuell per CSS-Transition
  // animiert werden – nur während des Scrollens (siehe onScroll unten).
  // Defaultet bewusst auf false: bei jedem frischen Mount (z. B.
  // Tab-Wechsel, da Gesetzestextansicht je Tab per key neu gemountet wird, siehe
  // App.tsx) UND bei jedem gezielten Sprung (polsterZuruecksetzen) soll die
  // Höhe sofort den Zielwert annehmen, nicht von 0 bzw. dem alten Wert
  // hochanimieren.
  const [hoeheAnimiert, setHoeheAnimiert] = useState(false);
  // Zuletzt gesetzter Animationswert: Scrollschritte melden nur Änderungen, sonst
  // folgt jedem Bild eine zusätzliche, wertgleiche Neuberechnung der Ansicht.
  const hoeheAnimiertRef = useRef(false);
  function setzeHoeheAnimiert(animiert: boolean) {
    if (hoeheAnimiertRef.current === animiert) return;
    hoeheAnimiertRef.current = animiert;
    setHoeheAnimiert(animiert);
  }

  // Für die Zielvorbereitung der Ansichtssteuerung: setzt die effektive Höhe sofort
  // auf die aktuelle echte Höhe zurück, ohne jedes Polster. Ein gezielter
  // Sprung (Öffnen-Overlay, zuletzt aktiviertes Element, Klick auf einen
  // Leisten-Eintrag) soll immer exakt unter der Ziel-Leiste landen, nicht
  // unter einem zufällig noch laufenden Abbau von vorherigem Scrollen – und
  // soll dabei (wie ein Tab-Wechsel) nicht animiert hochwachsen, sondern
  // sofort die Zielhöhe anzeigen. Setzt außerdem den oben beschriebenen
  // Sticky-Status zurück: nach einem Sprung gehört der nächste Scroll-Tick
  // an einer ganz anderen Stelle im Dokument zu einem komplett neuen
  // firstVisible.index, eine zufällig übernommene alte Entscheidung wäre
  // hier fehl am Platz.
  function polsterZuruecksetzen() {
    // Math.max(0, ...): echteHoeheRef.current kann -1 sein (Sentinel "Leiste
    // noch nie gemessen", siehe leisteHoeheRef in useAnsichtssteuerung.ts)
    // – darf niemals als negative CSS-Höhe gerendert werden.
    const ziel = Math.max(0, echteHoeheRef.current);
    effektiveHoeheRef.current = ziel;
    peakEchteHoeheRef.current = ziel;
    setEffektiveHoehe(ziel);
    setzeHoeheAnimiert(false);
    letzterScrollTopRef.current = stand?.scrollTop ?? 0;
    letzterFirstVisibleIndexRef.current = null;
    firstVisibleEintragWarInkludiertRef.current = false;
  }

  // Übernahme des vorbereiteten oberen Zielpfads bei der Landung; bei roher
  // Wiederherstellung weiterhin vor deren Mess-/Korrekturablauf.
  function kontextPfadFuerZielSetzen(index: number) {
    setKontextPfad(ermittleKontextPfadSchnell(index));
    letzterFirstVisibleIndexRef.current = null;
    firstVisibleEintragWarInkludiertRef.current = false;
  }

  // ---------------------------------------------------------------------
  // Schnelle Vorfahren-Suche (siehe Performance-Kommentar oben)
  // ---------------------------------------------------------------------
  // Vorberechnung pro Überschrift: der Vorfahren-Pfad INKLUSIVE dieser
  // Überschrift selbst, in Dokumentreihenfolge. Da sichtbareElemente schon
  // nach Einklapp-Zustand gefiltert ist, sind alle hier gefundenen Vorfahren
  // garantiert nicht eingeklappt. Läuft nur
  // bei Änderung von sichtbareElemente (Einklapp-Zustand), nicht bei jedem
  // Scroll-Tick.
  const ueberschriftenPfade = useMemo(() => {
    const ergebnis: { index: number; pfad: KontextEintrag[] }[] = [];
    const stack: KontextEintrag[] = [];
    for (let i = 0; i < sichtbareElemente.length; i++) {
      const el = sichtbareElemente[i];
      // el beweisbar sicher durch die Schleifen-Invariante.
      if (el === undefined) continue;
      let eintrag: KontextEintrag | null = null;
      if (el.typ === 'ueberschrift') {
        eintrag = { ueberschrift: el.data, ebene: el.data.ebene, index: i };
      } else if (
        el.typ === 'norm' &&
        el.data.art === 'gliederungsartikel' &&
        el.data.ueberschriftartig
      ) {
        eintrag = { gliederungsartikel: el.data, ebene: el.data.gliederungsEbene, index: i };
      }
      if (!eintrag) continue;
      // stack[stack.length-1] beweisbar sicher durch die length>0-Prüfung.
      while (stack.length > 0 && stack[stack.length - 1]!.ebene >= eintrag.ebene) {
        stack.pop();
      }
      stack.push(eintrag);
      ergebnis.push({ index: i, pfad: [...stack] });
    }
    return ergebnis;
  }, [sichtbareElemente]);

  // Ermittelt den Vorfahren-Pfad bis (exklusiv) zum übergebenen Index per
  // Binärsuche in ueberschriftenPfade statt linearem Durchlauf durch ALLE
  // sichtbaren Elemente: gesucht wird die letzte Überschrift mit
  // index < bis, deren vorberechneter Pfad direkt (ohne erneute Iteration)
  // übernommen wird.
  function ermittleKontextPfadSchnell(bis: number): KontextEintrag[] {
    let lo = 0;
    let hi = ueberschriftenPfade.length - 1;
    let treffer = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      // ueberschriftenPfade[mid] beweisbar sicher: Standard-Binärsuche-
      // Invariante, mid liegt immer in [0, ueberschriftenPfade.length - 1].
      if (ueberschriftenPfade[mid]!.index < bis) {
        treffer = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return treffer === -1 ? [] : ueberschriftenPfade[treffer]!.pfad;
  }

  const letzteVorausschauGroesseRef = useRef({ schrift, skalierung });
  const aktualisiereKontext = useEffectEvent(() => {
    // Größenwechsel müssen auch bei gleichem Index neu geometrisch entscheiden.
    // Normales Scrollen behält die bestätigte Entscheidung gegen Aufflackern.
    const vorher = letzteVorausschauGroesseRef.current;
    if (vorher.schrift !== schrift || vorher.skalierung !== skalierung) {
      firstVisibleEintragWarInkludiertRef.current = false;
      letzteVorausschauGroesseRef.current = { schrift, skalierung };
    }
    if (!stand) return;

    // Während eines Auftrags gehört der vorbereitete Kontext dem Ziel;
    // Höhenmeldungen dürfen ihn nicht aus dem alten Scrollmessstand ersetzen.
    function updateKontextPfad() {
      const scrollTop = stand!.scrollTop;
      // Math.max(0, ...): siehe Kommentar an polsterZuruecksetzen – Sentinel
      // -1 (Leiste noch nie gemessen) darf hier nicht als negativer Wert in
      // Peak-/Polster-Berechnung einfließen.
      const echteHoehe = Math.max(0, echteHoeheRef.current);

      // Peak nachführen (siehe ausführlicher Kommentar an der Funktion oben).
      if (echteHoehe > peakEchteHoeheRef.current) {
        peakEchteHoeheRef.current = echteHoehe;
      }

      // Polster symmetrisch fortschreiben: bei Abwärts-Scrollen (positives
      // Delta) sinkt die effektive Höhe um genau das Delta, bei
      // Aufwärts-Scrollen (negatives Delta) wächst sie um genau |Delta| –
      // siehe Kommentar an der Funktion oben, warum diese Symmetrie für
      // ein flackerfreies Umkehren der Richtung nötig ist. Nach unten nie
      // unter die echte Höhe, nach oben nie über den Peak.
      const scrollDelta = scrollTop - letzterScrollTopRef.current;
      letzterScrollTopRef.current = scrollTop;
      const kandidat = effektiveHoeheRef.current - scrollDelta;
      const neueEffektiveHoehe = Math.min(
        Math.max(kandidat, echteHoehe),
        peakEchteHoeheRef.current,
      );
      // Vollständig abgebaut: Peak verfällt auf die aktuelle echte Höhe,
      // damit er nicht an einer ganz anderen Stelle im Dokument viel später
      // erneut greift (siehe Kommentar an der Funktion oben).
      if (neueEffektiveHoehe <= echteHoehe) {
        peakEchteHoeheRef.current = echteHoehe;
      }
      if (neueEffektiveHoehe !== effektiveHoeheRef.current) {
        effektiveHoeheRef.current = neueEffektiveHoehe;
        setEffektiveHoehe(neueEffektiveHoehe);
      }
      if (auftragAktiv) return;

      // + effektiveHoeheRef.current (nicht die echte Höhe!): solange noch
      // Polster vorhanden ist, deckt die Leiste optisch mehr ab, als ihr
      // aktueller Pfad bräuchte – das muss auch hier als "schon
      // vorbeigescrollt" gelten, sonst bekäme firstVisible einen Eintrag,
      // der in Wirklichkeit noch unter dem Polster verschwindet.
      const contentOffset = Math.max(0, scrollTop - scrollMargin + effektiveHoeheRef.current);
      const items = stand!.zeilen;

      const sichtbaresId = stand?.sichtbarkeitsliste[0]?.id;
      const sichtbarerIndex =
        items.find((item) => sichtbareElemente[item.index]?.data.id === sichtbaresId)?.index ?? 0;
      const firstVisible =
        items.find(
          (item) => item.index >= sichtbarerIndex && item.start + item.size > contentOffset,
        ) ?? items[items.length - 1];
      if (!firstVisible) return;

      // Rohposition relativ zum Elementanfang; die Leiste bestimmt nur den Index.
      onFirstVisible?.(firstVisible.index, scrollTop - scrollMargin - firstVisible.start);

      // vorherigePfad: alle Vorfahren VOR firstVisible (exklusiv) – per
      // Konstruktion immer schon vollständig unsichtbar (siehe Kommentar an
      // berechneSichtbarenKontextPfad). firstVisibleEintrag: firstVisible
      // selbst, falls es eine Überschrift ist – die einzige Kandidatin, die
      // noch geprüft werden muss, ob ihr eigenes Wachstum sie gleich
      // verdrängen würde.
      const vorherigePfad = ermittleKontextPfadSchnell(firstVisible.index);
      const firstVisibleElement = sichtbareElemente[firstVisible.index];
      const firstVisibleEintrag: KontextEintrag | null =
        firstVisibleElement?.typ === 'ueberschrift'
          ? {
              ueberschrift: firstVisibleElement.data,
              ebene: firstVisibleElement.data.ebene,
              index: firstVisible.index,
            }
          : firstVisibleElement?.typ === 'norm' &&
              firstVisibleElement.data.art === 'gliederungsartikel' &&
              firstVisibleElement.data.ueberschriftartig
            ? {
                gliederungsartikel: firstVisibleElement.data,
                ebene: firstVisibleElement.data.gliederungsEbene,
                index: firstVisible.index,
              }
            : null;

      // Sticky-Status fortschreiben (siehe ausführlicher Kommentar an
      // berechneSichtbarenKontextPfad/an den Refs oben): nur wenn
      // firstVisible.index seit dem letzten Tick UNVERÄNDERT ist, darf die
      // damalige Inkludiert-Entscheidung übernommen werden.
      const gleicherIndexWieZuvor = firstVisible.index === letzterFirstVisibleIndexRef.current;
      letzterFirstVisibleIndexRef.current = firstVisible.index;

      const neuerPfad = berechneSichtbarenKontextPfad(
        vorherigePfad,
        firstVisibleEintrag,
        items,
        contentOffset,
        schrift,
        gleicherIndexWieZuvor && firstVisibleEintragWarInkludiertRef.current,
        skalierung,
      );

      firstVisibleEintragWarInkludiertRef.current =
        firstVisibleEintrag !== null &&
        neuerPfad.length > 0 &&
        // neuerPfad[length-1] beweisbar sicher durch die length>0-Prüfung.
        kontextEintragId(neuerPfad[neuerPfad.length - 1]!) ===
          kontextEintragId(firstVisibleEintrag);

      setKontextPfad((prev) => (kontextPfadeGleich(prev, neuerPfad) ? prev : neuerPfad));
    }

    // Ref immer auf die frische Closure zeigen lassen, damit
    // kontextAktualisieren() (Hook-Return) beim Aufruf nach einem Sprung
    // aktuelle sichtbareElemente/schrift-Werte verwendet.
    kontextAktualisierenRef.current = updateKontextPfad;

    // Messstände und Listener-Lebensdauer gehören dem Scrollmodul.
    if (!auftragAktiv && stand.benutzerscrollen) setzeHoeheAnimiert(true);
    updateKontextPfad();
  });
  useLayoutEffect(
    () => aktualisiereKontext(),
    [stand, sichtbareElemente, schrift, skalierung, auftragAktiv],
  );

  return {
    effektiveHoehe,
    hoeheAnimiert,
    polsterZuruecksetzen,
    kontextAktualisieren: () => kontextAktualisierenRef.current(),
    kontextPfadFuerZielSetzen,
    zielPfad: ermittleKontextPfadSchnell,
  };
}

/**
 * Zustand des Kontextpfads für die Ansichtssteuerung. Der Setzer gibt nur echte
 * Änderungen an React weiter: Ein Aktualisierer, der den bisherigen Pfad
 * zurückgibt, löst keine (wertgleiche) Neuberechnung der Ansicht aus.
 */
export function useKontextPfadZustand() {
  const [kontextPfad, setzen] = useState<KontextEintrag[]>([]);
  const aktuellRef = useRef(kontextPfad);
  const [setKontextPfad] = useState(() => {
    const setzer: Dispatch<SetStateAction<KontextEintrag[]>> = (wert) => {
      const naechster = typeof wert === 'function' ? wert(aktuellRef.current) : wert;
      if (naechster === aktuellRef.current) return;
      aktuellRef.current = naechster;
      setzen(naechster);
    };
    return setzer;
  });
  return [kontextPfad, setKontextPfad] as const;
}
