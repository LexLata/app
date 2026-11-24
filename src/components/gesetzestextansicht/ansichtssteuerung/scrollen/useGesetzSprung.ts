// useGesetzSprung.ts
// Obere/untere Normnavigation und rohe Wiederherstellung teilen eine abbrechbare Lebensdauer.

import { schreibeScrollPosition } from '@/lib/utils/scrollAufzeichnungDiagnose';
import { elementGrenzen, titelUnten } from './navigationGeometrie';
import { flushSync } from 'react-dom';
import { useEffect, useRef, type RefObject } from 'react';
import {
  erstelleScrollLebensdauer,
  type ScrollLebensdauer,
  type ScrollVorgang,
} from './ScrollVorgang';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { SCROLL_MARGIN, schaetzeTitelUnten, type HoehenKontext } from './virtualizer';
import {
  berechneRestoreZiel,
  ermittleElementGrenzen,
  bestimmeSprungModus,
  istWeiterSprung,
  zielFuerModus,
  vorschauAbstand,
  fuehreKorrekturSchrittAus,
  type SprungModus,
} from './useGesetzSprung.helpers';

import { animiereScrollTo } from './useGesetzSprung.animation';

export interface GesetzSprungParams {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  containerRef: RefObject<HTMLDivElement | null>;
  leisteHoeheRef: RefObject<number>;
  sichtbareElemente: readonly DarstellungsElement[];
  schriftgroesse: number;
  kontextAktualisieren: () => void;
  polsterZuruecksetzen: () => void;
  positionsKontextUebernehmen?: () => void;
  abgedeckteHoehe?: number;
  zielHoeheSchaetzen?: (elementId: string) => number;
  zielMessen?: (elementId: string, bestaetigen: (hoehe: number) => void) => () => void;
  zielUebernehmen?: (elementId: string, hoehe: number) => void;
  zielRendern?: (index: number | null) => void;
  springeAktivRef: RefObject<boolean>;
  hoehenKontext: HoehenKontext;
  lebensdauer?: ScrollLebensdauer;
  ansichtBereit?: boolean;
}

/** Normnavigation positioniert einmalig nach auftragsbezogener Vorbereitung.
 * Rohe Wiederherstellung behält ihre bestehende begrenzte Nachkorrektur. */
export function useGesetzSprung({
  virtualizer,
  containerRef,
  leisteHoeheRef,
  sichtbareElemente,
  schriftgroesse,
  kontextAktualisieren,
  polsterZuruecksetzen,
  positionsKontextUebernehmen = polsterZuruecksetzen,
  springeAktivRef,
  hoehenKontext,
  lebensdauer,
  ansichtBereit = true,
  zielMessen,
  abgedeckteHoehe,
  zielHoeheSchaetzen,
  zielUebernehmen,
  zielRendern,
}: GesetzSprungParams) {
  const laufendeAnimationRef = useRef<number | null>(null);
  const eigeneLebensdauer = useRef(erstelleScrollLebensdauer());
  const auftraege = lebensdauer ?? eigeneLebensdauer.current;
  const vorgangRef = useRef<ScrollVorgang | null>(null);
  useEffect(
    () => () => {
      auftraege.abbrechen();
    },
    [auftraege],
  );

  function grenzenFuer(container: HTMLDivElement, index: number, frischeZeilenlage = false) {
    const geschaetzt = ermittleElementGrenzen(
      virtualizer,
      index,
      sichtbareElemente,
      schriftgroesse,
      hoehenKontext,
    );
    const gemessen = elementGrenzen(container, index);
    if (!gemessen) return geschaetzt;
    const block = frischeZeilenlage
      ? container.querySelector<HTMLElement>(`[data-index="${index}"]`)
      : null;
    if (!block) return gemessen;
    // resizeItem übernimmt Höhen sofort, React zeichnet die verschobenen Blöcke
    // erst danach. Die frische Zeilenlage mit den echten Innenabständen verbinden.
    const bisherigerBlockanfang =
      container.scrollTop +
      block.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientTop;
    const verschiebung = geschaetzt.oben - bisherigerBlockanfang;
    return { oben: gemessen.oben + verschiebung, unten: gemessen.unten + verschiebung };
  }

  /** Unterkante des vollständigen Titels des Elements nach index samt Vorschauabstand (naher
   * Sprung nach unten): gemessen, wenn gerendert, sonst geschätzt; null ohne nächstes Element. */
  function vorschauUnten(container: HTMLDivElement, index: number, frischeZeilenlage: boolean) {
    const naechstes = sichtbareElemente[index + 1];
    if (!naechstes) return null;
    const abstand = vorschauAbstand(schriftgroesse);
    const gemessen = titelUnten(container, index + 1);
    const titelOben = elementGrenzen(container, index + 1)?.oben;
    if (gemessen !== null && titelOben !== undefined)
      // Gleiche Verschiebung wie grenzenFuer bei frischer Zeilenlage.
      return (
        gemessen + grenzenFuer(container, index + 1, frischeZeilenlage).oben - titelOben + abstand
      );
    const blockOben = ermittleElementGrenzen(
      virtualizer,
      index + 1,
      sichtbareElemente,
      schriftgroesse,
      hoehenKontext,
    ).oben;
    return blockOben + schaetzeTitelUnten(naechstes, schriftgroesse, hoehenKontext) + abstand;
  }

  /** Weit ist auch ein derzeit nicht sichtbares (eingeklapptes) Ziel. */
  function istWeit(elementId: string) {
    const container = containerRef.current;
    const index = sichtbareElemente.findIndex((el) => el.data.id === elementId);
    if (!container) return false;
    if (index < 0) return true;
    return istWeiterSprung(
      grenzenFuer(container, index).oben,
      container.scrollTop,
      container.clientHeight,
    );
  }

  function sichtbarMachen(
    index: number,
    vorgang: ScrollVorgang,
    fertig?: () => void,
    vorgabe?: SprungModus,
    animieren = true,
  ) {
    const container = containerRef.current;
    const element = sichtbareElemente[index];
    if (!container || !element) {
      fertig?.();
      return;
    }
    const grenzen = (frischeZeilenlage = false) => grenzenFuer(container, index, frischeZeilenlage);
    const jetzt = grenzen();
    const urspruenglicherModus =
      vorgabe ??
      bestimmeSprungModus(
        jetzt.oben,
        jetzt.unten,
        container.scrollTop,
        container.clientHeight,
        abgedeckteHoehe ?? leisteHoeheRef.current,
      );
    if (urspruenglicherModus === 'kein-sprung') {
      springeAktivRef.current = false;
      fertig?.();
      return;
    }
    const kurzeAbwaertsNorm =
      !vorgabe &&
      jetzt.oben >= container.scrollTop + (abgedeckteHoehe ?? leisteHoeheRef.current) &&
      !istWeiterSprung(jetzt.oben, container.scrollTop, container.clientHeight);
    const knapperPlatz =
      urspruenglicherModus === 'minimal' &&
      jetzt.unten - jetzt.oben >
        container.clientHeight - (zielHoeheSchaetzen?.(element.data.id) ?? 0);
    let modus: 'flush-oben' | 'minimal' = knapperPlatz ? 'flush-oben' : urspruenglicherModus;
    springeAktivRef.current = true;
    const kurz = !istWeiterSprung(jetzt.oben, container.scrollTop, container.clientHeight);
    zielRendern?.(index);
    vorgang.aufraeumen(() => zielRendern?.(null));
    // Die nicht animierte Zielmessung bestätigt aus dem Layout-Effekt.
    // Dessen Updates verarbeitet React selbst vor der sichtbaren Ausgabe.
    const unmittelbar = ansichtBereit && !animieren && vorgabe === 'flush-oben';
    const uebernehmeRenderstand = unmittelbar ? (aktion: () => void) => aktion() : flushSync;
    const landen = (hoehe: number | null) => {
      if (!vorgang.istGueltig()) return;
      // Während Scrollen überspringt TanStack die synchrone Ref-Messung.
      // Die örtlichen Zeilen müssen vor Benutzung ihrer Zielkoordinate feststehen.
      if (virtualizer.isScrolling)
        uebernehmeRenderstand(() => {
          container.querySelectorAll<HTMLElement>('[data-index]').forEach((zeile) => {
            virtualizer.resizeItem(Number(zeile.dataset.index), zeile.offsetHeight);
          });
        });
      const { oben, unten } = grenzen(virtualizer.isScrolling);
      if (kurzeAbwaertsNorm && hoehe !== null && unten - oben <= container.clientHeight - hoehe)
        modus = 'minimal';
      const leiste =
        hoehe ??
        zielHoeheSchaetzen?.(element.data.id) ??
        abgedeckteHoehe ??
        Math.max(0, leisteHoeheRef.current);
      const ziel = zielFuerModus(
        modus,
        oben,
        unten,
        container.clientHeight,
        modus === 'minimal' ? leiste : (hoehe ?? 0),
        modus === 'minimal' ? vorschauUnten(container, index, virtualizer.isScrolling) : null,
      );
      // Nur vorhandene virtuelle Resthöhe; keine zusätzliche Endvermessung.
      const rest = virtualizer.getTotalSize() + SCROLL_MARGIN - oben;
      const obenErreichbar =
        modus === 'flush-oben' && hoehe !== null && rest >= container.clientHeight - hoehe - 4;
      const uebernehmen = () => {
        if (!vorgang.istGueltig()) return;
        const obererZielpfad = obenErreichbar && Math.abs(container.scrollTop - ziel) <= 1;
        uebernehmeRenderstand(() => {
          if (obererZielpfad) {
            leisteHoeheRef.current = hoehe ?? 0;
            zielUebernehmen?.(element.data.id, hoehe ?? 0);
          }
          springeAktivRef.current = false;
          kontextAktualisieren();
          fertig?.();
        });
        // Der Abschluss hat den erreichten Positionskontext samt echter Höhe
        // übernommen. Erst jetzt dessen Polster entfernen, ohne Zielpfadpin.
        if (!obererZielpfad && vorgang.istGueltig())
          uebernehmeRenderstand(positionsKontextUebernehmen);
        // Erst das native Scrollereignis übergibt den Renderbereich an den
        // Virtualizer. Bis dahin bleiben die örtlichen Zielzeilen erhalten.
        const freigeben = () => vorgang.beenden();
        container.addEventListener('scroll', freigeben, { once: true });
        vorgang.aufraeumen(() => container.removeEventListener('scroll', freigeben));
        vorgang.spaeter(freigeben, 250);
      };
      if (kurz && animieren)
        animiereScrollTo(container, Math.max(0, ziel), laufendeAnimationRef, uebernehmen, vorgang);
      else {
        schreibeScrollPosition(container, Math.max(0, ziel), 'sprung-ziel');
        uebernehmen();
      }
    };
    if (modus === 'minimal') {
      if (elementGrenzen(container, index)) landen(null);
      else vorgang.frame(() => landen(null));
      return;
    }
    let uebernommen = false;
    let aufraeumen = () => {};
    const bestaetigen = (hoehe: number) => {
      if (!vorgang.istGueltig() || uebernommen) return;
      uebernommen = true;
      const fortsetzen = () => {
        aufraeumen();
        landen(hoehe);
      };
      // Nicht animiertes Klappen landet im Messcommit vor dessen sichtbarer Ausgabe.
      // Animierte Sprünge behalten ihre örtliche Frame-Fortsetzung.
      if (unmittelbar) fortsetzen();
      else vorgang.frame(fortsetzen);
    };
    aufraeumen = zielMessen?.(element.data.id, bestaetigen) ?? (() => {});
    vorgang.aufraeumen(aufraeumen);
    if (!zielMessen) bestaetigen(Math.max(0, leisteHoeheRef.current));
    // Eine fehlende Bestätigung verhindert die bestmögliche Navigation nicht.
    vorgang.spaeter(() => bestaetigen(Math.max(0, leisteHoeheRef.current)), 250);
  }

  function springeZuIndex(
    index: number,
    nachAbschluss?: () => void,
    offsetInItem = 0,
    versuch = 0,
    kompensiereLeiste = true,
    modus?: SprungModus,
    animieren = true,
  ): void {
    if (versuch === 0) vorgangRef.current = auftraege.starten();
    const vorgang = vorgangRef.current;
    if (!vorgang?.istGueltig()) return;
    if (kompensiereLeiste) {
      sichtbarMachen(index, vorgang, nachAbschluss, modus, animieren);
      return;
    }
    const zielKandidat = berechneRestoreZiel(
      virtualizer,
      index,
      sichtbareElemente,
      schriftgroesse,
      hoehenKontext,
      offsetInItem,
    );
    springeAktivRef.current = true;
    polsterZuruecksetzen();
    if (containerRef.current)
      schreibeScrollPosition(
        containerRef.current,
        Math.max(0, zielKandidat),
        'sprung-vorbereitung',
      );
    fuehreKorrekturSchrittAus({
      index,
      nachAbschluss,
      offsetInItem,
      versuch,
      ziel: zielKandidat,
      virtualizer,
      springeAktivRef,
      polsterZuruecksetzen,
      kontextAktualisieren,
      springeZuIndexFortsetzen: springeZuIndex,
      vorgang,
    });
  }
  return { springeZuIndex, istWeit, aktuellerVorgang: () => vorgangRef.current };
}
