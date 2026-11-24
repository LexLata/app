// useTabDragUndReihenfolge.ts
//
// Kompletter Pointer-Drag einer Tableiste: Ziehen zum Neuanordnen innerhalb
// derselben Leiste, Erkennung von "Fenster verlassen" (Herausziehen), sowie
// Live-Zielfenster-Erkennung für die Übernahme in ein ANDERES offenes
// Fenster. Zuvor lag dieser gesamte Block direkt in Tableiste.tsx; die
// eigentliche Live-Vorschau in FREMDEN Fenstern bleibt weiterhin in
// useTabDragUeberFenster.ts (unverändert, wird hier nur konsumiert).
//
// Bewusst als eigener Hook: reine Interaktions-/Zustandslogik ohne jegliches
// Rendering, dadurch unabhängig von der JSX-Struktur der Tableiste lesbar
// und veränderbar.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { beginneZiehvorschau } from '@/components/ziehvorschau/ziehvorschau.index';
import type { Tab } from '@/lib/domain/appTypes.ts';
import { alleFensterPositionenLesen, type FensterPosition } from '@/lib/plattform/tauriHelpers.ts';
import type { Window as TauriFenster } from '@tauri-apps/api/window';

export interface DragZustand {
  tabId: string;
  ausserhalb: boolean;
  klon: { x: number; y: number; breite: number };
}

/** Webansicht und natives Außenrechteck zählen beide zum eigenen Fenster. */
export function istImEigenenFenster(
  zeiger: { clientX: number; clientY: number; screenX: number; screenY: number },
  breite: number,
  hoehe: number,
  fenster: FensterPosition | undefined,
  skalierung: number,
): boolean {
  if (
    zeiger.clientX >= 0 &&
    zeiger.clientX <= breite &&
    zeiger.clientY >= 0 &&
    zeiger.clientY <= hoehe
  )
    return true;
  if (!fenster) return false;
  const x = zeiger.screenX * skalierung;
  const y = zeiger.screenY * skalierung;
  return (
    x >= fenster.x &&
    x <= fenster.x + fenster.breite &&
    y >= fenster.y &&
    y <= fenster.y + fenster.hoehe
  );
}

/** Reine Entscheidungslogik für verschiebeTabsBeiBedarf unten (aus onMove
 *  ausgelagert, damit die kernige Umsortierungs-Logik OHNE DOM/Pointer-Event
 *  testbar ist): liefert die id des Tabs, mit dem `dragId` tauschen soll,
 *  oder null, wenn (noch) keine Verschiebung nötig ist. `tabPositionen` sind
 *  die Bildschirmmitten aller sichtbaren Tab-Elemente (inkl. `dragId`
 *  selbst, wird intern übersprungen) – vom Aufrufer per
 *  getBoundingClientRect() ermittelt. */
export function ermittleZielFuerTabVerschieben(
  tabs: Tab[],
  dragId: string,
  tabPositionen: { id: string; mitte: number }[],
  cursorX: number,
): string | null {
  const dragIdx = tabs.findIndex((t) => t.id === dragId);
  if (dragIdx < 0) return null;

  for (const { id: targetId, mitte } of tabPositionen) {
    if (targetId === dragId) continue;
    const targetIdx = tabs.findIndex((t) => t.id === targetId);
    if ((targetIdx > dragIdx && cursorX > mitte) || (targetIdx < dragIdx && cursorX < mitte)) {
      return targetId;
    }
  }
  return null;
}

interface Params {
  tabs: Tab[];
  leisteRef: React.RefObject<HTMLDivElement | null>;
  onTabAktivieren: (id: string) => void;
  onTabsNeuAnordnen: React.Dispatch<React.SetStateAction<Tab[]>>;
  onTabHerausziehen: (tabId: string) => void | Promise<void>;
  onTabInFensterAufnehmen: (tabId: string, zielLabel: string) => void | Promise<void>;
  /** Immer aktueller Spiegel von tabTitel (gleiches Muster wie tabsRef unten)
   *  – wird für dragBewegungMelden gebraucht (lebt in onMove, das mit leerem
   *  Dependency-Array registriert ist und daher sonst mit dem Stand vom
   *  Mount-Zeitpunkt arbeiten würde). */
  tabTitelRef: React.RefObject<Record<string, string>>;
  dragBewegungMelden: (
    zielLabel: string | null,
    screenX: number,
    zeile1: string,
    zeile2: string | undefined,
  ) => void;
  dragEndeVorbereiten: () => () => void;
  autoScrollBeiCursorAktualisieren: (clientX: number) => void;
  autoScrollStoppen: () => void;
}

export function useTabDragUndReihenfolge({
  tabs,
  leisteRef,
  onTabAktivieren,
  onTabsNeuAnordnen,
  onTabHerausziehen,
  onTabInFensterAufnehmen,
  tabTitelRef,
  dragBewegungMelden,
  dragEndeVorbereiten,
  autoScrollBeiCursorAktualisieren,
  autoScrollStoppen,
}: Params) {
  const [dragZustand, setDragZustand] = useState<DragZustand | null>(null);
  // Nur Sichtbarkeit während der Transportzusage, keine Kopie des Tabinhalts.
  const [ausstehendeTabIds, setAusstehendeTabIds] = useState<Set<string>>(() => new Set());

  const radius = useRadiusRollen().standard;
  const radiusRef = useRef(radius);
  useLayoutEffect(() => {
    radiusRef.current = radius;
  }, [radius]);
  const isDragging = useRef(false);
  const downTabId = useRef<string | null>(null);
  const downX = useRef(0);
  const downY = useRef(0);
  const offsetX = useRef(0);
  const tabsRef = useRef<Tab[]>(tabs);
  const tauriWinRef = useRef<TauriFenster | null>(null);

  const ausserhalbRef = useRef(false);
  const scrollVorVerlassen = useRef<number | null>(null);
  const scrollWiederherstellen = useRef(false);
  useLayoutEffect(() => {
    if (scrollWiederherstellen.current && leisteRef.current) {
      leisteRef.current.scrollLeft = scrollVorVerlassen.current ?? 0;
      scrollWiederherstellen.current = false;
    }
  });

  // Snapshot der Bildschirm-Rechtecke aller offenen Fenster – einmalig beim
  // Drag-Start (siehe onMove: erster isDragging-Übergang) abgefragt, damit
  // beim Loslassen rein lokal (kein IPC) geprüft werden kann, ob der Cursor
  // über einem ANDEREN Fenster liegt. Bewusst kein Live-Nachladen während
  // des Drags (kein Live-"Platz machen" im Zielfenster in dieser Ausbaustufe)
  // – ein während des Drags verschobenes Zielfenster wird daher ggf. nicht
  // erkannt (siehe Planungsnotiz), was als akzeptables Risiko eingestuft wurde.
  const fensterGeometrienRef = useRef<FensterPosition[]>([]);

  useEffect(() => {
    import('@tauri-apps/api/window')
      .then((m) => {
        tauriWinRef.current = m.getCurrentWindow();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  function startDragWindow(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (tauriWinRef.current) {
      tauriWinRef.current.startDragging().catch(() => {});
    }
  }

  function imEigenenFenster(e: PointerEvent) {
    return istImEigenenFenster(
      e,
      window.innerWidth,
      window.innerHeight,
      fensterGeometrienRef.current.find((f) => f.label === tauriWinRef.current?.label),
      window.devicePixelRatio || 1,
    );
  }

  // Prüft anhand des beim Drag-Start geholten Snapshots (fensterGeometrienRef),
  // ob die übergebene Bildschirmposition (z. B. e.screenX/screenY beim
  // Loslassen) über einem ANDEREN offenen Fenster liegt, und liefert dessen
  // Label. Nimmt bei Überlappung mehrerer Fenster einfach den ersten Treffer –
  // ohne Z-Reihenfolge-Info aus dem Snapshot ist das eine bewusste
  // Vereinfachung (seltener Fall bei überlappenden Fenstern).
  //
  // WICHTIG: e.screenX/screenY liefert der Browser in LOGISCHEN (CSS-)Pixeln,
  // fensterGeometrienRef aber in PHYSISCHEN Pixeln (siehe fenster_alle_positionen
  // in fenster.rs: outer_position()/outer_size()). Auf jedem Display mit
  // Skalierungsfaktor ≠ 1 (z. B. jedes Retina-Display) klaffen beide sonst
  // auseinander – hier daher vorab mit window.devicePixelRatio umgerechnet.
  function fensterUnterCursorFinden(screenX: number, screenY: number): string | null {
    const eigenesLabel = tauriWinRef.current?.label;
    const skalierung = window.devicePixelRatio || 1;
    const physX = screenX * skalierung;
    const physY = screenY * skalierung;
    for (const f of fensterGeometrienRef.current) {
      if (f.label === eigenesLabel) continue;
      if (physX >= f.x && physX <= f.x + f.breite && physY >= f.y && physY <= f.y + f.hoehe) {
        return f.label;
      }
    }
    return null;
  }

  useEffect(() => {
    let snapshotKennung = 0;
    let ziehvorschau: ReturnType<typeof beginneZiehvorschau> | null = null;
    function starteDragFallsUeberSchwelle(e: PointerEvent, dragId: string) {
      if (Math.hypot(e.clientX - downX.current, e.clientY - downY.current) < 4) return;
      isDragging.current = true;
      document.documentElement.classList.add('tab-wird-gezogen');
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      const el = leisteRef.current?.querySelector<HTMLElement>(`[data-tab-id="${dragId}"]`);
      const rect = el?.getBoundingClientRect();
      const tab = tabsRef.current.find((t) => t.id === dragId);
      ziehvorschau = beginneZiehvorschau(
        tab?.gesetzesreferenz?.kurztitel ?? 'Neuer Tab',
        el ?? null,
        radiusRef.current,
      );
      const top = leisteRef.current?.getBoundingClientRect().top ?? 0;
      offsetX.current = e.clientX - (rect?.left ?? e.clientX);

      setDragZustand({
        tabId: dragId,
        ausserhalb: false,
        klon: { x: e.clientX, y: top, breite: rect?.width ?? 160 },
      });

      // Snapshot der Fenstergeometrien für die Zielfenster-Erkennung beim
      // Loslassen (siehe onUp/fensterUnterCursorFinden) – siehe Kommentar
      // bei fensterGeometrienRef oben zum bewussten Verzicht auf Live-
      // Nachladen.
      const kennung = ++snapshotKennung;
      void alleFensterPositionenLesen()
        .then((liste) => {
          if (kennung === snapshotKennung) fensterGeometrienRef.current = liste;
        })
        .catch(() => {});
    }

    // Die Live-Lücke im Zielfenster bleibt auch beim einzigen Tab aktiv.
    function meldeLiveVorschau(e: PointerEvent, dragId: string) {
      const dragTab = tabsRef.current.find((t) => t.id === dragId);
      const zielLabel = fensterUnterCursorFinden(e.screenX, e.screenY);
      dragBewegungMelden(
        zielLabel,
        e.screenX,
        dragTab?.gesetzesreferenz?.kurztitel ?? 'Neuer Tab',
        !dragTab?.ladezustand || dragTab.ladezustand === 'geladen'
          ? tabTitelRef.current[dragId]
          : undefined,
      );
    }

    // Liest die aktuellen Bildschirmmitten aller sichtbaren Tab-Elemente aus
    // dem DOM und delegiert die eigentliche Umsortierungs-Entscheidung an
    // die reine (und daher separat getestete) ermittleZielFuerTabVerschieben.
    function verschiebeTabsBeiBedarf(e: PointerEvent, dragId: string, leiste: HTMLDivElement) {
      const tabPositionen: { id: string; mitte: number }[] = [];
      for (const el of leiste.querySelectorAll<HTMLElement>('[data-tab-id]')) {
        if (el.style.display === 'none') continue;
        const id = el.getAttribute('data-tab-id');
        if (!id) continue;
        const r = el.getBoundingClientRect();
        tabPositionen.push({ id, mitte: r.left + r.width / 2 });
      }

      const zielId = ermittleZielFuerTabVerschieben(
        tabsRef.current,
        dragId,
        tabPositionen,
        e.clientX,
      );
      if (!zielId) return;

      onTabsNeuAnordnen((prev) => {
        const neu = [...prev];
        const vi = neu.findIndex((t) => t.id === dragId);
        const ti = neu.findIndex((t) => t.id === zielId);
        if (vi < 0 || ti < 0) return prev;
        // vi < 0 wurde soeben ausgeschlossen: splice(vi, 1) entfernt daher
        // garantiert genau ein vorhandenes Element.
        const [tab] = neu.splice(vi, 1);
        neu.splice(ti, 0, tab!);
        return neu;
      });
    }

    function onMove(e: PointerEvent) {
      const dragId = downTabId.current;
      if (!dragId) return;

      if (!isDragging.current) {
        starteDragFallsUeberSchwelle(e, dragId);
      }
      if (!isDragging.current) return;
      meldeLiveVorschau(e, dragId);

      const aussen = !imEigenenFenster(e);
      ziehvorschau?.melden(
        e.screenX,
        e.screenY,
        aussen && !fensterUnterCursorFinden(e.screenX, e.screenY),
      );
      const leiste = leisteRef.current;
      const rueckkehr = ausserhalbRef.current && !aussen;
      if (aussen && !ausserhalbRef.current) {
        scrollVorVerlassen.current = leiste?.scrollLeft ?? 0;
        autoScrollStoppen();
      }
      ausserhalbRef.current = aussen;
      if (rueckkehr && leiste) {
        leiste.scrollLeft = scrollVorVerlassen.current ?? 0;
        scrollWiederherstellen.current = true;
        // Die verkleinerte Scrollbreite kann den gespeicherten Stand noch
        // begrenzen. Die Messung nimmt den Stand nach Wiedereinblenden vorweg.
        const scrollKorrektur = leiste.scrollLeft - (scrollVorVerlassen.current ?? 0);
        // Der gezogene Tab beansprucht draußen keinen Platz. Die Mitten der
        // übrigen Tabs bestimmen daher unmittelbar seine Einfügeposition.
        const zielElement = [...leiste.querySelectorAll<HTMLElement>('[data-tab-id]')]
          .filter((el) => el.dataset.tabId !== dragId && el.style.display !== 'none')
          .find((el) => {
            const r = el.getBoundingClientRect();
            return e.clientX <= r.left + scrollKorrektur + r.width / 2;
          });
        const zielId = zielElement?.dataset.tabId;
        onTabsNeuAnordnen((vorher) => {
          const tab = vorher.find((t) => t.id === dragId);
          if (!tab) return vorher;
          const neu = vorher.filter((t) => t.id !== dragId);
          // Ausstehende, unsichtbare Übergaben zählen nicht als sichtbare Plätze.
          const zielIndex = zielId ? neu.findIndex((t) => t.id === zielId) : neu.length;
          neu.splice(zielIndex < 0 ? neu.length : zielIndex, 0, tab);
          return neu;
        });
      }
      setDragZustand((prev) =>
        prev
          ? {
              ...prev,
              ausserhalb: aussen,
              klon: { ...prev.klon, x: e.clientX },
            }
          : null,
      );
      if (!leiste || aussen || rueckkehr) return;
      autoScrollBeiCursorAktualisieren(e.clientX);
      verschiebeTabsBeiBedarf(e, dragId, leiste);
    }

    function aufraeumen() {
      ziehvorschau?.beenden();
      ziehvorschau = null;
      snapshotKennung++;
      document.documentElement.classList.remove('tab-wird-gezogen');
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      downTabId.current = null;
      isDragging.current = false;
      ausserhalbRef.current = false;
      fensterGeometrienRef.current = [];
      setDragZustand(null);
      autoScrollStoppen();
    }

    async function onUp(e: PointerEvent) {
      const id = downTabId.current;
      const gezogen = isDragging.current;
      const aussen = !imEigenenFenster(e);
      const zielLabel = aussen ? fensterUnterCursorFinden(e.screenX, e.screenY) : null;
      const uebergabe = !!(id && gezogen && aussen && (zielLabel || tabsRef.current.length > 1));
      const endeMelden = dragEndeVorbereiten();
      if (uebergabe && id) setAusstehendeTabIds((vorher) => new Set(vorher).add(id));
      aufraeumen();
      try {
        if (id && !gezogen) onTabAktivieren(id);
        else if (id && aussen) {
          // Erst die Übertragung abwarten: das Ende-Event darf die Live-Lücke
          // im Zielfenster nicht vor deren Übernahme löschen.
          if (zielLabel) await onTabInFensterAufnehmen(id, zielLabel);
          else if (tabsRef.current.length > 1) await onTabHerausziehen(id);
        }
      } catch (fehler) {
        console.error('Tab-Übergabe konnte nicht abgeschlossen werden:', fehler);
      } finally {
        if (uebergabe && id)
          setAusstehendeTabIds((vorher) => {
            const neu = new Set(vorher);
            neu.delete(id);
            return neu;
          });
        endeMelden();
      }
    }
    function onCancel() {
      aufraeumen();
      dragEndeVorbereiten()();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      ziehvorschau?.beenden();
      snapshotKennung++;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.documentElement.classList.remove('tab-wird-gezogen');
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      if (isDragging.current) dragEndeVorbereiten()();
      autoScrollStoppen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Pointer-Handler bleiben während eines Drags angemeldet; Neuanmeldung würde autoScrollStoppen auslösen und laufende Mausereignisse unterbrechen. Veränderliche Tabs und Titel werden über Refs gelesen.
  }, []);

  function onTabPointerDown(e: React.PointerEvent, tabId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    downTabId.current = tabId;
    downX.current = e.clientX;
    downY.current = e.clientY;
    isDragging.current = false;
  }

  return { dragZustand, ausstehendeTabIds, offsetX, onTabPointerDown, startDragWindow };
}
