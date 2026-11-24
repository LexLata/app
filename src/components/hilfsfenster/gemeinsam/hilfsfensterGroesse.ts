// hilfsfensterGroesse.ts
// Passt die Hilfsfenstergröße an Inhalt, UI-Skalierung und die Buttonzeile an.

import {
  getCurrentWindow,
  currentMonitor,
  LogicalSize,
  LogicalPosition,
} from '@tauri-apps/api/window';
import { useEffect, type CSSProperties, type RefObject } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { fensterAussenPadding, pxSkaliert } from '@/lib/stil/paddingRollen';

import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

/** Gemeinsame Geometrie der gemessenen Aktionszeile beider Eingabeformulare. */
export function useHilfsfensterAktionsZeilenStil(): CSSProperties {
  const faktor = useUiSkalierungsFaktor();
  const abstaende = useAbstandRollen();
  return {
    display: 'flex',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: abstaende.standard,
    marginTop: pxSkaliert(4, faktor),
  };
}

const GRUNDBREITE = 420;

function benoetigteBreite(buttonZeile: HTMLDivElement | null, faktor: number): number {
  const grundbreite = Math.ceil(GRUNDBREITE * faktor);
  if (!buttonZeile) return grundbreite;
  const knoepfe = Array.from(buttonZeile.children) as HTMLElement[];
  const luecke = Number.parseFloat(getComputedStyle(buttonZeile).columnGap) || 0;
  const knopfbreite = knoepfe.reduce(
    (summe, knopf) => summe + knopf.getBoundingClientRect().width,
    0,
  );
  const zeilenbreite = knopfbreite + Math.max(0, knoepfe.length - 1) * luecke;
  return Math.ceil(Math.max(grundbreite, zeilenbreite + 2 * fensterAussenPadding(faktor)));
}

/**
 * Wächst mit dem Formular bis zu 80 % der Monitorarbeitsfläche einschließlich
 * Fensterrahmen. Der Formularrahmen scrollt danach nur seinen Inhalt.
 * Beobachtet auch Monitorwechsel und misst den macOS-WebView-Ausgleich begrenzt.
 */
export function useDynamischeFensterGroesse(
  inhaltRef: RefObject<HTMLDivElement | null>,
  buttonZeileRef: RefObject<HTMLDivElement | null>,
  formularRef: RefObject<HTMLDivElement | null>,
) {
  const faktor = useUiSkalierungsFaktor();
  useEffect(() => {
    const rahmen = inhaltRef.current;
    const formular = formularRef.current;
    const buttons = buttonZeileRef.current;
    if (!rahmen || !formular || !buttons) return;
    let aktiv = true;
    let laeuft = false;
    let erneut = false;
    let abmelden: (() => void) | undefined;

    const anpassen = async () => {
      erneut = true;
      if (laeuft) return;
      laeuft = true;
      try {
        const fenster = getCurrentWindow();
        for (let versuch = 0; aktiv && erneut && versuch < 3; versuch++) {
          erneut = false;
          const [monitor, skalierung, innen, aussen, position] = await Promise.all([
            currentMonitor(),
            fenster.scaleFactor(),
            fenster.innerSize(),
            fenster.outerSize(),
            fenster.outerPosition(),
          ]);
          if (!aktiv) break;
          const innenLogisch = innen.toLogical(skalierung);
          const aussenLogisch = aussen.toLogical(skalierung);
          const ort = position.toLogical(skalierung);
          const flaeche = monitor?.workArea.size.toLogical(monitor.scaleFactor) ?? {
            width: screen.availWidth || window.innerWidth,
            height: screen.availHeight || window.innerHeight,
          };
          const ursprung = monitor?.workArea.position.toLogical(monitor.scaleFactor) ?? {
            x: 0,
            y: 0,
          };
          const rahmenHoehe = Math.max(0, aussenLogisch.height - innenLogisch.height);
          const rahmenBreite = Math.max(0, aussenLogisch.width - innenLogisch.width);
          // Einige macOS-Fenster zählen einen Teil der Titelleiste zur innerSize.
          // Dieser gemessene Ausgleich darf die Monitorgrenze niemals erhöhen.
          const webviewAusgleich = Math.max(0, innenLogisch.height - window.innerHeight);
          const maximaleInnenhoehe = Math.max(1, Math.floor(flaeche.height * 0.8) - rahmenHoehe);
          const maximaleFormularhoehe = Math.max(1, maximaleInnenhoehe - webviewAusgleich);
          rahmen.style.maxHeight = `${maximaleFormularhoehe}px`;
          const stil = getComputedStyle(rahmen);
          const buttonStil = getComputedStyle(buttons);
          const zahl = (wert: string) => Number.parseFloat(wert) || 0;
          const bedarf =
            formular.offsetHeight +
            buttons.offsetHeight +
            zahl(stil.paddingTop) +
            zahl(stil.paddingBottom) +
            zahl(stil.rowGap) +
            zahl(buttonStil.marginTop);
          const breite = Math.min(benoetigteBreite(buttons, faktor), flaeche.width - rahmenBreite);
          const hoehe = Math.min(Math.ceil(bedarf) + webviewAusgleich, maximaleInnenhoehe);
          if (
            Math.abs(innenLogisch.height - hoehe) > 1 ||
            Math.abs(innenLogisch.width - breite) > 1
          ) {
            await fenster.setSize(new LogicalSize(breite, hoehe));
            await new Promise(requestAnimationFrame);
            // Nach der nativen Änderung können Textumbruch und WebView-Ausgleich
            // abweichen. Ein weiterer Messdurchgang passt beides begrenzt an.
            erneut = true;
          }
          if (!aktiv) break;
          const x = Math.max(
            ursprung.x,
            Math.min(ort.x, ursprung.x + flaeche.width - breite - rahmenBreite),
          );
          const y = Math.max(
            ursprung.y,
            Math.min(ort.y, ursprung.y + flaeche.height - hoehe - rahmenHoehe),
          );
          if (Math.abs(ort.x - x) > 1 || Math.abs(ort.y - y) > 1)
            await fenster.setPosition(new LogicalPosition(x, y));
        }
      } catch (fehler) {
        console.warn('Hilfsfenster: Größenanpassung fehlgeschlagen', fehler);
      } finally {
        laeuft = false;
      }
    };
    const aktualisieren = () => {
      void anpassen();
    };
    const beobachter = new ResizeObserver(aktualisieren);
    beobachter.observe(formular);
    beobachter.observe(buttons);
    const buttonBeobachter = new MutationObserver(aktualisieren);
    buttonBeobachter.observe(buttons, { childList: true, characterData: true, subtree: true });
    window.addEventListener('resize', aktualisieren);
    void (async () => {
      try {
        const entfernen = await getCurrentWindow().onMoved(aktualisieren);
        if (aktiv) abmelden = entfernen;
        else entfernen();
      } catch (fehler) {
        console.warn('Hilfsfenster: Monitorbeobachtung fehlgeschlagen', fehler);
      }
    })();
    aktualisieren();
    return () => {
      aktiv = false;
      beobachter.disconnect();
      buttonBeobachter.disconnect();
      window.removeEventListener('resize', aktualisieren);
      abmelden?.();
    };
  }, [inhaltRef, buttonZeileRef, formularRef, faktor]);
}
