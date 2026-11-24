// klappAnkerKorrektur.ts
// Hält die gemessene Bildschirmstelle sofort und begrenzt spätere Layoutkorrekturen.
import { schreibeScrollPosition } from '@/lib/utils/scrollAufzeichnungDiagnose';
import type { ScrollAnker, ScrollAuftrag } from './ScrollSteuerung.types';
import type { MutableRefObject } from 'react';
import type { ScrollVorgang } from './ScrollVorgang';

export function korrigiereKlappAnker(
  containerLesen: () => HTMLDivElement | null,
  index: number,
  anker: ScrollAnker,
  vorgang: ScrollVorgang,
  abschliessen: () => void,
  sofort = true,
): () => void {
  let versuch = 0;
  const korrigieren = () => {
    if (!vorgang.istGueltig()) return;
    const container = containerLesen();
    const dom = container?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    versuch++;
    if (container && dom) {
      const delta = dom.getBoundingClientRect().top - anker.bildschirmTop;
      if (Math.abs(delta) > 0.5)
        schreibeScrollPosition(container, container.scrollTop + delta, 'klapp-anker');
      else return abschliessen();
    }
    if (versuch < 20) vorgang.frame(korrigieren);
    else abschliessen();
  };
  if (sofort) korrigieren();
  return korrigieren;
}

export function nachKlappSprung(
  auftrag: ScrollAuftrag,
  vorgang: ScrollVorgang | null,
  container: () => HTMLDivElement | null,
  index: number,
  fertig: () => void,
  springeAktiv: MutableRefObject<boolean>,
): void {
  if (auftrag.art !== 'anker-halten') return fertig();
  springeAktiv.current = true;
  if (vorgang)
    vorgang.frame(() => korrigiereKlappAnker(container, index, auftrag.anker, vorgang, fertig));
}
