// useGesetzSprung.helpers.ts
// Reine Berechnungs-/Hilfsfunktionen für springeZuIndex (useGesetzSprung.ts):
// Sprung-Klassifikation, Zielberechnung und die daraus
// extrahierten Korrekturschritte. Keine eigenen React-Hooks – RefObject wird
// hier nur als Typ für von außen hereingereichte Refs verwendet, nicht per
// useRef selbst erzeugt.

import type { RefObject } from 'react';
import type { ScrollVorgang } from './ScrollVorgang';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { schaetzeHoehe, schaetzeScrollTop, SCROLL_MARGIN, type HoehenKontext } from './virtualizer';

// Anzahl der maximalen Korrektur-Durchläufe (rAF-Schleifen) nach einem Sprung.
// Federt den Fall ab, dass virtualizer.getOffsetForIndex für noch nie gerenderte
// Items nur deren estimateSize liefert. Nach MAX_SPRUNG_VERSUCHE wird der letzte
// Stand akzeptiert (Zeit-/Aufwandsgrenze statt endloser Annäherung).
const MAX_SPRUNG_VERSUCHE = 2;

// Kleinere Abweichungen als dieser Schwellwert (in px) sind nicht wahrnehmbar
// und beenden die Korrekturschleife der rohen Positions-Wiederherstellung
// (berechneRestoreZiel) frühzeitig.
const SPRUNG_KORREKTUR_SCHWELLE = 4;

// Setzt springeAktivRef und loggt dabei jeden Wechsel – u.a. relevant für
// shouldAdjustScrollPositionOnItemSizeChange in useScrollSteuerung.ts, das
// während eines laufenden Sprungs die eingebaute Virtualizer-Kompensation
// unterdrückt (siehe Kommentar dort).
function setzeSpringeAktiv(springeAktivRef: RefObject<boolean>, wert: boolean, grund: string) {
  if (springeAktivRef.current === wert) return;
  springeAktivRef.current = wert;
  console.log(`[ScrollKompensation] springeAktivRef -> ${wert ? 'AN' : 'AUS'} (${grund})`);
}

// Ober-/Unterkante eines Elements in absoluten scrollTop-Koordinaten (gleiche
// Basis wie SCROLL_MARGIN) – real gemessen, wenn der Virtualizer es bereits
// gerendert hat (virtualizer.getVirtualItems()), sonst geschätzt
// (schaetzeScrollTop/schaetzeHoehe) wie der Rest dieser Datei.
export function ermittleElementGrenzen(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  index: number,
  sichtbareElemente: readonly DarstellungsElement[],
  schriftgroesse: number,
  hoehenKontext: HoehenKontext,
): { oben: number; unten: number } {
  const gerendert = virtualizer.getVirtualItems().find((item) => item.index === index);
  if (gerendert) {
    const oben = SCROLL_MARGIN + gerendert.start;
    return { oben, unten: oben + gerendert.size };
  }
  const result = virtualizer.getOffsetForIndex(index, 'start');
  const oben = result
    ? SCROLL_MARGIN + result[0]
    : schaetzeScrollTop(index, sichtbareElemente, schriftgroesse, hoehenKontext);
  return {
    oben,
    // Aufrufer-Vertrag: index ist stets ein gültiger Index in
    // sichtbareElemente, aus einer vorab bestätigten Suche im selben Array
    // (siehe Aufrufer in useAnsichtssteuerung.ts/useScrollSteuerung.ts/
    // useScrollSteuerung.ts).
    unten: oben + schaetzeHoehe(sichtbareElemente[index]!, schriftgroesse, hoehenKontext),
  };
}

// Faktor für die "weiter Sprung"-Erkennung (sichtbarMachen in useGesetzSprung.ts): ist der
// Abstand zwischen aktueller scrollTop-Position und Ziel-Oberkante
// mindestens das WEITER_SPRUNG_FAKTOR-fache der Fenster-Höhe, bliebe vom
// bisher sichtbaren Bereich nach dem Sprung ohnehin nichts mehr sichtbar.
// Bewusst eine benannte, leicht anpassbare Konstante statt eine fest im
// Code verdrahtete Zahl, falls sich der Wert in der Praxis als zu knapp
// oder zu großzügig erweist.
const WEITER_SPRUNG_FAKTOR = 2;

/** Grenze zwischen nahem (animiertem) und weitem (direktem) Sprung. */
export function istWeiterSprung(oben: number, scrollTop: number, clientHeight: number) {
  return Math.abs(oben - scrollTop) >= clientHeight * WEITER_SPRUNG_FAKTOR;
}

// Abstand (CSS-px) zwischen Leisten-Unterkante und Normoberkante bei
// 'flush-oben': hält den Leistenschatten vom Normtext frei. Zum Anpassen
// diesen Wert ändern; er gilt für jeden 'flush-oben'-Sprung.
const LEISTE_PUFFER = 8;

// Die drei möglichen Ergebnisse einer Sprung-Klassifikation:
// - 'kein-sprung': Element bereits vollständig sichtbar, gar nicht scrollen.
// - 'flush-oben': Oberkante exakt unter die Leiste (weiter Sprung, von oben
//   verdeckt, oder zu groß für den verfügbaren Platz).
// - 'minimal': kleinstmögliche Verschiebung, Unterkante an die
//   Container-Unterkante (naher Sprung, passt komplett in den verfügbaren
//   Platz unterhalb der Leiste).
export type SprungModus = 'kein-sprung' | 'flush-oben' | 'minimal';

// Klassifiziert einen Element-Sprung EINMALIG, bevor überhaupt gescrollt
// wurde – siehe sichtbarMachen in useGesetzSprung.ts: der Modus wird nur bei
// versuch===0 (mit der zu diesem Zeitpunkt noch unverfälschten scrollTop)
// bestimmt und über die gesamte Korrekturschleife hinweg unverändert
// beibehalten, statt bei jedem Versuch neu aus der zwischenzeitlich bereits
// verschobenen scrollTop hergeleitet zu werden. Grund: leisteHoehe ist beim
// ersten Versuch typischerweise noch ungenau (siehe kontextPfadFuerZielSetzen
// in useGesetzSprung.ts) – war sie zu GROSS geschätzt, landet die erste
// scrollTop zu niedrig; bei einer Neu-Klassifikation im nächsten Versuch sähe
// das Element dann fälschlich als "bereits vollständig sichtbar" aus (obwohl
// nur ein zu großer Abstand zur Leiste besteht), und die Schleife bräche mit
// 'kein-sprung' ab, statt die Position noch auf 'flush-oben' zu korrigieren –
// sichtbar als unnötiger Abstand zwischen Leiste und Normzeile.
export function bestimmeSprungModus(
  oben: number,
  unten: number,
  scrollTop: number,
  clientHeight: number,
  leisteHoehe: number,
): SprungModus {
  // Sentinel (siehe leisteHoeheRef-Kommentar in useScrollSteuerung.ts): die
  // Leiste wurde noch NIE gemessen (typischerweise der allererste Sprung
  // direkt nach dem Mount, z. B. initialNorm). In diesem Fall darf weder
  // 'kein-sprung' NOCH 'minimal' zurückgegeben werden: 'kein-sprung' würde
  // fälschlich "bereits korrekt positioniert" annehmen (siehe Kommentar
  // weiter unten), und 'minimal' (unten - clientHeight) bezieht die Leiste
  // per Definition NIE ein – das ist sein ganzer Zweck bei einem bereits
  // sichtbaren Element. Da der Modus über die gesamte Korrekturschleife
  // hinweg beibehalten wird (siehe springeZuIndex), würde 'minimal' die
  // Leiste dann auch in Versuch 1/2 mit der inzwischen echten Höhe
  // permanent ignorieren. Einziger sicherer Fallback bei unbekannter
  // Leistenhöhe ist deshalb 'flush-oben' – bezieht leisteHoehe ein, sobald
  // sie im nächsten rAF-Zyklus real gemessen ist.
  if (leisteHoehe < 0) return 'flush-oben';

  const sichtbarOben = scrollTop + leisteHoehe;
  const sichtbarUnten = scrollTop + clientHeight;
  if (oben >= sichtbarOben && unten <= sichtbarUnten) return 'kein-sprung';

  if (istWeiterSprung(oben, scrollTop, clientHeight)) return 'flush-oben';
  if (oben < sichtbarOben || unten - oben > clientHeight - leisteHoehe) return 'flush-oben';
  return 'minimal';
}

// Abstand unter dem Vorschautitel beim nahen Sprung nach unten, als Anteil der Schriftgröße:
// knapp unter der engsten Lücke bis zur nächsten sichtbaren Schrift (etwa 0,3 × Schriftgröße
// unter einer Titelzeile mit Zeilenhöhe 1,3), damit die folgende Zeile nicht angeschnitten wird.
const VORSCHAU_ABSTAND_FAKTOR = 0.25;

export function vorschauAbstand(schriftgroesse: number): number {
  return schriftgroesse * VORSCHAU_ABSTAND_FAKTOR;
}

// Berechnet die Ziel-scrollTop für einen bereits feststehenden Sprung-Modus
// mit den jeweils aktuellsten Messwerten für oben/unten/leisteHoehe. Der Modus
// selbst wird hier NICHT neu hergeleitet – siehe bestimmeSprungModus.
// leisteHoehe wird auf 0 geklemmt: der Sentinel-Wert -1 (Leiste noch nie
// gemessen) darf niemals als tatsächlicher Abstand einfließen.
// 'minimal' mit vorschauUnten (Unterkante des vollständigen Titels des nächsten
// Elements samt vorschauAbstand): diese Stelle landet genau an der Container-Unterkante, sofern Norm
// und Vorschau zusammen unter die Leiste passen. Sonst (oder ohne nächstes
// Element, vorschauUnten null) wie bisher Unterkante der Norm an die Unterkante.
export function zielFuerModus(
  modus: 'flush-oben' | 'minimal',
  oben: number,
  unten: number,
  clientHeight: number,
  leisteHoehe: number,
  vorschauUnten: number | null = null,
): number {
  const geklemmteLeisteHoehe = Math.max(0, leisteHoehe);
  if (modus === 'minimal') {
    const mitVorschau =
      vorschauUnten !== null &&
      vorschauUnten > unten &&
      vorschauUnten - oben <= clientHeight - geklemmteLeisteHoehe;
    // Aufgerundet auf ganze Pixel, damit der Vorschautitel nicht angeschnitten wird.
    return mitVorschau ? Math.ceil(vorschauUnten - clientHeight) : unten - clientHeight;
  }
  return oben - geklemmteLeisteHoehe - LEISTE_PUFFER;
}

// Rohe scrollTop-Wiederherstellung (gespeicherte Leseposition, Ankerhalten beim
// Klappen): Elementoberkante plus relativer Versatz innerhalb des Elements.
export function berechneRestoreZiel(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  index: number,
  sichtbareElemente: readonly DarstellungsElement[],
  schriftgroesse: number,
  hoehenKontext: HoehenKontext,
  offsetInItem: number,
): number {
  const result = virtualizer.getOffsetForIndex(index, 'start');
  return (
    (result
      ? SCROLL_MARGIN + result[0]
      : schaetzeScrollTop(index, sichtbareElemente, schriftgroesse, hoehenKontext)) + offsetInItem
  );
}

// Signatur der rekursiven Fortsetzung von springeZuIndex – wird an die unten
// definierten Funktionen durchgereicht, damit diese (obwohl außerhalb des
// Hooks/außerhalb von springeZuIndex definiert) den nächsten Korrektur-
// Versuch auslösen können, ohne springeZuIndex per Closure einzufangen.
type SprungFortsetzenFn = (
  index: number,
  nachAbschluss: (() => void) | undefined,
  offsetInItem: number,
  versuch: number,
  kompensiereLeiste: boolean,
  modus?: SprungModus,
) => void;

export interface KorrekturSchrittParams {
  index: number;
  nachAbschluss?: () => void;
  offsetInItem: number;
  versuch: number;
  ziel: number;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  springeAktivRef: RefObject<boolean>;
  polsterZuruecksetzen: () => void;
  kontextAktualisieren: () => void;
  springeZuIndexFortsetzen: SprungFortsetzenFn;
  vorgang?: ScrollVorgang;
}

// Extrahiert aus springeZuIndex (vormals "naechsterSchritt"-Closure): die
// Fortsetzung nach dem Setzen von scrollTop (ob instant oder animiert) –
// entweder abbrechen (MAX_SPRUNG_VERSUCHE erreicht) oder nach zwei rAF
// erneut messen/korrigieren. Für den animierten 'minimal'-Fall (versuch===0)
// läuft dieser Schritt ERST NACH Abschluss der Animation, nicht parallel
// dazu – sonst würde die Korrekturschleife mitten in der Animation messen
// und fälschlich nachkorrigieren.
export function fuehreKorrekturSchrittAus(params: KorrekturSchrittParams): void {
  const frame = params.vorgang ? params.vorgang.frame : requestAnimationFrame;
  const {
    index,
    nachAbschluss,
    offsetInItem,
    versuch,
    ziel,
    virtualizer,
    springeAktivRef,
    polsterZuruecksetzen,
    kontextAktualisieren,
    springeZuIndexFortsetzen,
  } = params;

  if (versuch >= MAX_SPRUNG_VERSUCHE) {
    setzeSpringeAktiv(springeAktivRef, false, 'MAX_SPRUNG_VERSUCHE erreicht');
    polsterZuruecksetzen();
    kontextAktualisieren();
    nachAbschluss?.();
    return;
  }
  // Zwei verschachtelte rAF, damit Layout+Paint UND der ResizeObserver des
  // Virtualizers (virtualizer.measureElement) für die neu gerenderten Items
  // sicher durchgelaufen sind, bevor erneut gemessen wird – ebenso hat React
  // bis dahin die Leiste mit dem bereits gesetzten kontextPfad neu
  // gerendert, sodass leisteHoeheRef.current hier bereits die Höhe für das
  // tatsächliche Sprungziel enthält.
  frame(() => {
    frame(() => {
      const erneut = virtualizer.getOffsetForIndex(index, 'start');
      const aktuellesZiel =
        (erneut ? SCROLL_MARGIN + erneut[0] : ziel - offsetInItem) + offsetInItem;
      if (Math.abs(aktuellesZiel - ziel) > SPRUNG_KORREKTUR_SCHWELLE) {
        springeZuIndexFortsetzen(index, nachAbschluss, offsetInItem, versuch + 1, false);
      } else {
        setzeSpringeAktiv(springeAktivRef, false, 'Konvergenz erreicht');
        polsterZuruecksetzen();
        kontextAktualisieren();
        nachAbschluss?.();
      }
    });
  });
}
