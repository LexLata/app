// useAktiverEinstellungenAbschnitt.ts
//
// Scroll-Spy für die neue Einstellungen-Seitenleiste (siehe
// EinstellungenSeitenleiste.tsx): ermittelt per IntersectionObserver, welcher
// der vier Kategorie-Abschnitte (Allgemein/Gesetzestext/Werkzeuge/Erweitert,
// siehe EinstellungenKategorieAbschnitt.tsx) gerade als "aktiv" gilt, damit
// die Seitenleiste ihn hervorheben kann.
//
// Rein UI-lokaler State, KEINE Persistenz – anders als praktisch jeder
// andere Hook in diesem Ordner betrifft das hier keine Nutzer-Einstellung,
// sondern nur die aktuelle Scroll-Position innerhalb des Fensters.
//
// Kein bestehendes generisches Scroll-Spy-Muster im Projekt wiederverwendbar:
// useStrukturKontext.ts (Gesetzestextansicht) ist eng an den virtualisierten
// Gesetzestext gekoppelt (VirtualItem-Listen, Gliederungstiefe) und nicht auf
// simple, normal gerenderte DOM-Abschnitte übertragbar.
//
// rootMargin "-70%" unten: klassischer Scrollspy-Kniff – ein Abschnitt gilt
// erst als "aktiv", sobald sein oberer Rand die oberen ~30% des
// Scroll-Containers erreicht hat, nicht schon beim ersten Sichtbarwerden am
// unteren Rand. Ohne Live-Test in `npm run tauri dev` ist der genaue Wert
// eine Einschätzung – bei Bedarf hier nachjustieren.
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useAktiverEinstellungenAbschnitt(
  scrollContainerRef: RefObject<HTMLElement | null>,
  abschnittIds: readonly string[],
): string {
  // Einziger Aufrufer (EinstellungenFenster.tsx) übergibt KATEGORIE_IDS, ein
  // aus einem festen, nicht-leeren Literal abgeleitetes Array (siehe
  // Kommentar oben: "feste vier Kategorien").
  const [aktiveId, setAktiveId] = useState<string>(abschnittIds[0]!);
  // Als String gejoint statt des Arrays selbst in der Dependency-Liste
  // unten: abschnittIds ist am Aufrufort (EinstellungenFenster.tsx) ein bei
  // jedem Render neu erstelltes Array-Literal mit IMMER gleichem Inhalt
  // (feste vier Kategorien) – eine Array-Referenz würde den Effekt bei
  // jedem Render neu ausführen (Observer ab-/wieder aufbauen), obwohl sich
  // inhaltlich nichts ändert. Der gejointe String ist wertgleich und damit
  // eine korrekte, vollständige Dependency (behebt react-hooks/exhaustive-deps).
  const idsSchluessel = abschnittIds.join('|');

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const ids = idsSchluessel.split('|');

    const sichtbareIds = new Set<string>();

    const observer = new IntersectionObserver(
      (eintraege) => {
        for (const eintrag of eintraege) {
          const id = (eintrag.target as HTMLElement).id;
          if (eintrag.isIntersecting) {
            sichtbareIds.add(id);
          } else {
            sichtbareIds.delete(id);
          }
        }
        // Erster (in Dokumentreihenfolge) sichtbarer Abschnitt gewinnt –
        // bei mehreren gleichzeitig sichtbaren zählt der oberste.
        const ersterSichtbarer = ids.find((id) => sichtbareIds.has(id));
        if (ersterSichtbarer) setAktiveId(ersterSichtbarer);
      },
      {
        root: container,
        rootMargin: '0px 0px -70% 0px',
        threshold: 0,
      },
    );

    const elemente = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    elemente.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [scrollContainerRef, idsSchluessel]);

  return aktiveId;
}
