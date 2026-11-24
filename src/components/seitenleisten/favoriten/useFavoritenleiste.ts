// useFavoritenleiste.ts
// Kapselt das Laden der Favoriten eines Gesetzes (aus favoritenSpeicher.ts,
// bezeichnung → xmlId über normAufloesung.ts) sowie das zugehörige
// Tastaturkürzel-Handling (a–z, A–Z, ⌥+a–z → Sprung zum jeweiligen Favoriten).
import { beginneMessspanne } from '@/lib/utils/perfMessung';

import { useEffect, useEffectEvent, useState } from 'react';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { loeseLesezeichenOderFavoritAuf } from '@/lib/domain/norm/norm.index';
import { favoritenIndexFuerTaste } from './favoritenTastenkuerzel';

export interface FavoritenEintrag {
  bezeichnung: string;
  xmlId: string;
}

export interface FavoritenOptionen {
  gesetz: GesetzDarstellung;
  favoritenVersion: number;
  seitenleistenTastenkuerzel?: boolean;
  normScrollen: (xmlId: string) => void;
}

const KEINE_FAVORITEN: FavoritenEintrag[] = [];

export function useFavoritenleiste({
  gesetz,
  favoritenVersion,
  normScrollen,
  seitenleistenTastenkuerzel = false,
}: FavoritenOptionen) {
  const [geladeneEintraege, setFavoritenEintraege] = useState<FavoritenEintrag[] | null>(null);
  const favoritenEintraege = geladeneEintraege ?? KEINE_FAVORITEN;

  useEffect(() => {
    const messungBeenden = beginneMessspanne('Favoriten gelesen');
    let abgebrochen = false;
    (async () => {
      const { ladeFavoriten } = await import('@/lib/persistenz/nutzerdaten/favoritenSpeicher');
      return ladeFavoriten(gesetz);
    })()
      .then((bezeichnungListe) => {
        if (abgebrochen) return;
        const eintraege: FavoritenEintrag[] = [];
        for (const bezeichnung of bezeichnungListe) {
          const xmlId = loeseLesezeichenOderFavoritAuf(gesetz, bezeichnung).norm?.xmlId;
          if (xmlId) eintraege.push({ bezeichnung, xmlId });
        }
        messungBeenden();
        setFavoritenEintraege(eintraege);
      })
      .catch(() => {
        if (!abgebrochen) setFavoritenEintraege([]);
        if (!abgebrochen) messungBeenden('Lesefehler');
      });
    return () => {
      messungBeenden('abgebrochen');
      abgebrochen = true;
    };
  }, [gesetz, favoritenVersion]);

  const zumFavoritenSpringen = useEffectEvent((xmlId: string) => normScrollen(xmlId));

  // Tastaturkürzel für Favoriten
  useEffect(() => {
    if (!seitenleistenTastenkuerzel || favoritenEintraege.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) return;
      // Overlay-Guard: analog zu usePfeilNavigation.ts/useKlappstufenNavigation.ts/
      // useTastenkuerzel.ts. Ohne diese Prüfung feuerte der globale Listener
      // auch, wenn z.B. das Öffnen-Overlay gerade öffnet und der erste
      // Tastendruck (Buchstabe) noch auf document.body statt auf dem Such-
      // Input landet (Fokus-Race beim Öffnen) – dadurch sprang normScrollen
      // fälschlich zu einem gespeicherten Favoriten.
      if (document.querySelector('[data-overlay-aktiv]')) return;
      const ziel = e.target as HTMLElement;
      if (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable) return;

      const index = favoritenIndexFuerTaste(e);
      if (index === null) return;

      const eintrag = favoritenEintraege[index];
      if (!eintrag) return;
      e.preventDefault();
      zumFavoritenSpringen(eintrag.xmlId);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [favoritenEintraege, seitenleistenTastenkuerzel]);

  return { favoritenEintraege, geladen: geladeneEintraege !== null };
}
