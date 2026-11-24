// Kurze Scrollanimation innerhalb der gemeinsamen Auftragslebensdauer.
import { schreibeScrollPosition } from '@/lib/utils/scrollAufzeichnungDiagnose';
import type { RefObject } from 'react';
import type { ScrollVorgang } from './ScrollVorgang';

// Dauer der sanften Scroll-Animation für kurze Sprünge (naher, aber leicht
// verdeckter 'minimal'-Sprung, sowie 'flush-oben'-Sprünge innerhalb der
// WEITER_SPRUNG_FAKTOR-Distanz – siehe sollAnimieren in springeZuIndex) in
// Millisekunden. Echte "weite" Sprünge (Distanz ≥ WEITER_SPRUNG_FAKTOR *
// clientHeight) bleiben unverändert ein sofortiger Sprung ohne Animation.
// Zum Anpassen der Dauer: einfach diesen Wert ändern.
const SPRUNG_ANIMATION_DAUER_MS = 180;

// Sanftes Ease-out: schnell zu Beginn, sanft auslaufend zum Ziel hin – wirkt
// bei kurzen UI-Scrollstrecken natürlicher als lineares Interpolieren.
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// Animiert container.scrollTop von seinem aktuellen Wert zu ziel über
// SPRUNG_ANIMATION_DAUER_MS und ruft danach onFertig auf. Die laufende
// requestAnimationFrame-ID wird in laufendeAnimationRef gehalten, damit ein
// währenddessen neu ausgelöster Sprung (z. B. schnelles
// Hintereinander-Klicken auf Verweise) die alte Animation abbrechen kann,
// statt dass beide gleichzeitig an scrollTop schreiben.
export function animiereScrollTo(
  container: HTMLDivElement,
  ziel: number,
  laufendeAnimationRef: RefObject<number | null>,
  onFertig: () => void,
  vorgang?: ScrollVorgang,
): void {
  const frame = vorgang ? vorgang.frame : requestAnimationFrame;
  let start = container.scrollTop;
  let zielAktuell = ziel;
  const distanz = zielAktuell - start;
  if (Math.abs(distanz) < 1) {
    onFertig();
    return;
  }
  const startZeit = performance.now();
  // Rundungs-Rauschgrenze: der Browser rundet scrollTop intern, dadurch
  // weicht der tatsächliche Wert im Folgeframe meist um < 1px vom zuletzt
  // geschriebenen Wert ab, ohne dass das eine "externe" Veränderung ist.
  const RAUSCH_SCHWELLE = 2;
  let letzterGeschriebenerWert = start;
  const schritt = (jetzt: number) => {
    // Erkennt, ob seit dem letzten Frame etwas ANDERES als wir selbst an
    // scrollTop geschrieben hat (z.B. die automatische Virtualizer-
    // Kompensation aus shouldAdjustScrollPositionOnItemSizeChange, falls ein
    // Element trotz des Wartens in springeZuIndex doch noch neu vermessen
    // wird). Ohne diese Erkennung würde unser eigener, aus dem fixen
    // Start/Ziel berechneter Wert diese Verschiebung im selben Frame
    // kommentarlos wieder überschreiben. Start und Ziel werden stattdessen
    // um genau dieses externe Delta verschoben, sodass die Animation an der
    // (jetzt korrigierten) Position nahtlos weiterläuft, statt zur alten,
    // jetzt falschen Position zurückzuspringen. Reine Absicherung – die
    // eigentliche Ursache wird jetzt in springeZuIndex durch Abwarten vor
    // Animationsstart behoben (siehe Kommentar dort).
    const externesDelta = container.scrollTop - letzterGeschriebenerWert;
    if (Math.abs(externesDelta) > RAUSCH_SCHWELLE) {
      start += externesDelta;
      zielAktuell += externesDelta;
    }
    const verstrichen = jetzt - startZeit;
    // Der rAF-Zeitstempel kann vor dem innerhalb desselben Frames erfassten
    // Start liegen. Vor Beginn darf daraus keine Rückwärtsbewegung entstehen.
    const t = Math.max(0, Math.min(1, verstrichen / SPRUNG_ANIMATION_DAUER_MS));
    const neuerWert = start + distanz * easeOutQuad(t);
    schreibeScrollPosition(container, neuerWert, 'sprung-animation');
    letzterGeschriebenerWert = neuerWert;
    if (t < 1) {
      laufendeAnimationRef.current = frame(schritt);
    } else {
      laufendeAnimationRef.current = null;
      onFertig();
    }
  };
  laufendeAnimationRef.current = frame(schritt);
}
