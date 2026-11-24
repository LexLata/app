// useTastenkuerzel.ts
//
// Fallback-Tastenkürzel auf Fenster-Ebene – nötig für Windows (kein natives
// Menü) bzw. falls das native Tauri-Menü beim allerersten Tastendruck noch
// nicht bereitsteht (siehe useMenueEvents.ts für das native Pendant).
//
// Belegungen kommen ausschließlich aus dem gemeinsamen Tastenkürzel-Katalog.
// Hier bleiben die Zuordnung zu Aktionen und deren fachliche Bedingungen.
import { istAktiv } from '@/lib/plattform/menu/menu.index';
import { flushSync } from 'react-dom';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import {
  findeTastenkuerzel,
  reservierteTastenkuerzel,
} from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { useEffect, useEffectEvent, useRef } from 'react';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import type { MenueUndTastenAktionen } from '@/hooks/eingabe/eingabeAktionen.types';
import type { ElementOeffnenParams, Tab } from '@/lib/domain/appTypes';
import { useAktuellerWertRef } from '@/hooks/utils/useAktuellerWertRef';
import { einstellungenFensterOeffnen, plattformFallsBekannt } from '@/lib/plattform/tauriHelpers';
import {
  type Gesetzeskurzbefehl,
  setzeReservierteTastenkuerzel,
  setzeReservierteTastenkuerzelCodes,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import {
  istTastenkuerzelWaehrendEinfuehrungErlaubt,
  behandleLesezeichenZiffernTastenkuerzel,
  behandleTabPositionsTastenkuerzel,
  behandleTabWechselTastenkuerzel,
  behandleVerlaufNavigationTastenkuerzel,
  behandleKlappstufenTastenkuerzel,
  behandleOeffnenZifferTastenkuerzel,
  behandleGesetzeskurzbefehl,
} from '@/hooks/eingabe/useTastenkuerzel.helpers';

const KUERZEL_MIT_MENUEBEDINGUNG: ReadonlySet<string> = new Set([
  'gesetze-aktualisieren',
  'alle-lesezeichen-entfernen',
  'gesetz-info',
  'volltext-suche',
  'verlauf-anzeigen',
  'favorit-speichern',
  'lesezeichen-speichern',
  'verweismarkierung',
  'kommentar',
]);

// Von mehreren Handlern genutzt (⌥←/→, ⌘←/→, Ziffer/§ → Öffnen-Overlay): true,
// wenn der Fokus gerade in einem Text-Eingabefeld liegt – dort sollen diese
// Tastenkürzel nicht eingreifen (Ziffer/§ soll normal eintippbar bleiben, ⌥←/→ und
// ⌘←/→ sollen nicht die Cursor-Bewegung/Tastenkürzel des Eingabefelds
// überschreiben).
function istEingabefeldFokussiert(): boolean {
  const focused = document.activeElement;
  return (
    focused instanceof HTMLInputElement ||
    focused instanceof HTMLTextAreaElement ||
    (focused instanceof HTMLElement && focused.isContentEditable)
  );
}

function istUeberlagerungAktiv(): boolean {
  return document.querySelector('[data-overlay-aktiv]') !== null;
}

interface TastenkuerzelOptionen extends MenueUndTastenAktionen {
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  gesetzeskurzbefehle: Record<string, Gesetzeskurzbefehl>;
  gesetze: LesbarerSuchverzeichniseintrag[];
  /** Einheitlicher Öffnen-Einstiegspunkt aus App.tsx. */
  elementOeffnen: (params: ElementOeffnenParams) => void;
  gesetzesreferenzOeffnen: ReturnType<typeof useGesetzOeffnen>['gesetzesreferenzOeffnen'];
  setAktiverTabId: Dispatch<SetStateAction<string | null>>;
  seitenleistenTastenkuerzel?: boolean;
  lesezeichenEintraege: { bezeichnung: string; gesetz: Gesetzesreferenz }[];
  handleLesezeichenOeffnen: (bezeichnung: string, gesetz: Gesetzesreferenz) => void;
  /**
   * Bewegt den Verlaufs-Zeiger des aktiven Tabs (⌥←/⌥→) und öffnet das Ziel
   * im aufrufenden Tab. Definiert in App.tsx (kombiniert verlaufSchritt aus
   * useAppTabs.ts mit elementOeffnen) – dieselbe Funktion nutzen auch die
   * Verlaufs-Pfeile links der Tableiste (siehe Tableiste.tsx).
   */
  verlaufSchrittUndOeffnen: (richtung: 'zurueck' | 'vorwaerts') => void;
  /** ⌘←/⌘→ (Strg unter Windows/Linux): Klappstufen-Navigation im gesamten
   *  Gesetz – siehe useKlappstufenNavigation.ts. App.tsx übergibt hier
   *  klappstufenStatus.zuklappen/.aufklappen, dieselben Funktionen, die
   *  auch die Buttons der Seitenleiste nutzen (Lesezeichenleiste.tsx); No-ops,
   *  solange kein Gesetz offen ist (siehe App.tsx: gesetzOffen-Effect). */
  handleZuklappen: () => void;
  handleAufklappen: () => void;
  /** Während der Einführung erlaubt die ID-basierte Sperre nur Öffnen-Overlay,
   *  Favorit/Lesezeichen und Klappstufen in der jeweils vorgesehenen Teilaktion.
   *  Das native Menü ist unabhängig davon gesperrt. */
  einfuehrungAktiv: boolean;
  /** Die Teilaktion bestimmt die Erlaubnisse für sämtliche Kürzel einschließlich
   *  Klappstufen. Der Einführungsmarker steuert separat Pfeile und Favoriten-Tasten. */
  einfuehrungTeilaktion: number;
}

export function useTastenkuerzel(optionen: TastenkuerzelOptionen) {
  const { tabsRef, aktiverTabIdRef } = optionen;
  const seitenleistenTastenkuerzelRef = useAktuellerWertRef(
    optionen.seitenleistenTastenkuerzel ?? false,
  );

  // Immer aktuelle Werte für den unten registrierten, nur einmal erzeugten
  // Listener (analog zu tabsRef/aktiverTabIdRef in useAppTabs.ts).
  const gesetzeskurzbefehleRef = useRef<Record<string, Gesetzeskurzbefehl>>(
    optionen.gesetzeskurzbefehle,
  );
  const gesetzeRef = useRef<LesbarerSuchverzeichniseintrag[]>(optionen.gesetze);
  const gesetzesreferenzOeffnenRef = useAktuellerWertRef(optionen.gesetzesreferenzOeffnen);
  // Lesezeichen-Liste wird erst nach dem (asynchronen) Laden aus AppData
  // befüllt – beim ersten Render ist sie noch leer. Ohne Ref bliebe der
  // unten registrierte, nur einmal erzeugte Listener für immer auf diesem
  // leeren Anfangsstand stehen (analog zu gesetzeRef oben). Ebenso schließt
  // handleLesezeichenOeffnen in App.tsx über die jeweils aktuelle
  // gesetze-Liste; auch dafür braucht der Listener die jeweils aktuelle
  // Funktion, nicht die vom allerersten Render.
  const lesezeichenEintraegeRef = useRef(optionen.lesezeichenEintraege);
  const handleLesezeichenOeffnenRef = useRef(optionen.handleLesezeichenOeffnen);
  const verlaufSchrittUndOeffnenRef = useRef(optionen.verlaufSchrittUndOeffnen);
  const tabWiederherstellenRef = useRef(optionen.tabWiederherstellen);
  const zuklappenRef = useRef(optionen.handleZuklappen);
  const aufklappenRef = useRef(optionen.handleAufklappen);
  const einfuehrungAktivRef = useAktuellerWertRef(optionen.einfuehrungAktiv);
  const einfuehrungTeilaktionRef = useAktuellerWertRef(optionen.einfuehrungTeilaktion);
  useEffect(() => {
    gesetzeskurzbefehleRef.current = optionen.gesetzeskurzbefehle;
  }, [optionen.gesetzeskurzbefehle]);
  useEffect(() => {
    gesetzeRef.current = optionen.gesetze;
  }, [optionen.gesetze]);
  useEffect(() => {
    lesezeichenEintraegeRef.current = optionen.lesezeichenEintraege;
  }, [optionen.lesezeichenEintraege]);
  useEffect(() => {
    handleLesezeichenOeffnenRef.current = optionen.handleLesezeichenOeffnen;
  }, [optionen.handleLesezeichenOeffnen]);
  useEffect(() => {
    verlaufSchrittUndOeffnenRef.current = optionen.verlaufSchrittUndOeffnen;
  }, [optionen.verlaufSchrittUndOeffnen]);
  useEffect(() => {
    tabWiederherstellenRef.current = optionen.tabWiederherstellen;
  }, [optionen.tabWiederherstellen]);
  useEffect(() => {
    zuklappenRef.current = optionen.handleZuklappen;
  }, [optionen.handleZuklappen]);
  useEffect(() => {
    aufklappenRef.current = optionen.handleAufklappen;
  }, [optionen.handleAufklappen]);

  const h = useEffectEvent((e: KeyboardEvent) => {
    // Während der Einführung (useEinfuehrung.ts) nur die dort explizit als
    // Alternative beworbenen Kombinationen durchlassen – siehe Kommentar an
    // einfuehrungAktiv in TastenkuerzelOptionen.
    if (
      einfuehrungAktivRef.current &&
      !istTastenkuerzelWaehrendEinfuehrungErlaubt(e, einfuehrungTeilaktionRef.current)
    ) {
      return;
    }

    // Der Katalog bestimmt den Treffer, dieser Handler die Aktion und Bedingungen.
    const tastenkuerzelAktionen: Record<string, () => void> = {
      'volltext-suche': () => {
        if (aktiverTabIdRef.current)
          optionen.setAktivesOverlay((v) => (v === 'volltextSuche' ? null : 'volltextSuche'));
      },
      'volltext-alle': () =>
        optionen.setAktivesOverlay((v) => (v === 'volltextAlle' ? null : 'volltextAlle')),
      gesetzesuebersicht: () =>
        optionen.setAktivesOverlay((v) => (v === 'uebersicht' ? null : 'uebersicht')),
      einstellungen: () => void einstellungenFensterOeffnen(),
      'dateien-importieren': () => optionen.handleDateiImportAnfrage(),
      'gesetze-aktualisieren': () =>
        optionen.setAktivesOverlay((v) => (v === 'aktualisieren' ? null : 'aktualisieren')),
      'gesetz-info': () => {
        if (aktiverTabIdRef.current)
          optionen.setAktivesOverlay((v) => (v === 'gesetzInfo' ? null : 'gesetzInfo'));
      },
      'verlauf-anzeigen': () => {
        if (aktiverTabIdRef.current)
          optionen.setAktivesOverlay((v) => (v === 'verlauf' ? null : 'verlauf'));
      },
      'neues-fenster': () => void rufeBefehl('neues_fenster_anfordern'),
      'neuer-tab': () => optionen.erstelleLeerenTab(),
      'letzter-tab': () => tabWiederherstellenRef.current(),
      'schliessen-tab': () => optionen.tabOderFensterSchliessen(),
      'fenster-schliessen': () => optionen.fensterSchliessen(),
      export: () => optionen.handleExportOeffnen(),
      'lesezeichen-speichern': () => optionen.handleLesezeichenSpeichern(),
      'favorit-speichern': () => optionen.handleFavoritSpeichern(),
      unterstreichen: () => optionen.handleUnterstreichen(),
      hervorheben: () => optionen.handleHervorheben(),
      verweismarkierung: () => optionen.handleVerweismarkierungAnfrage(),
      kommentar: () => optionen.handleKommentarAnfrage(),
      'markierung-rueckgaengig': () => optionen.handleMarkierungRueckgaengig(),
      'markierung-wiederholen': () => optionen.handleMarkierungWiederholen(),
      'alle-lesezeichen-entfernen': () => optionen.handleAlleLesezeichenEntfernen(),
      oeffnen: () => {
        flushSync(() => {
          optionen.setOeffnenOverlayInitial('');
          optionen.setAktivesOverlay((v) => (v === 'oeffnen' ? null : 'oeffnen'));
        });
      },
    };
    const plattform = plattformFallsBekannt();
    const ids = Object.keys(tastenkuerzelAktionen).filter(
      (id) => id !== 'neues-fenster' || (plattform !== null && plattform !== 'macos'),
    );
    const treffer = findeTastenkuerzel(e, ids);
    if (treffer) {
      e.preventDefault();
      if (KUERZEL_MIT_MENUEBEDINGUNG.has(treffer.id) && !istAktiv(treffer.id)) return;
      tastenkuerzelAktionen[treffer.id]!();
      return;
    }

    if (
      behandleLesezeichenZiffernTastenkuerzel(
        e,
        lesezeichenEintraegeRef,
        handleLesezeichenOeffnenRef,
        seitenleistenTastenkuerzelRef.current,
      )
    )
      return;
    if (behandleTabPositionsTastenkuerzel(e, tabsRef, optionen.setAktiverTabId)) return;
    if (behandleTabWechselTastenkuerzel(e, tabsRef, aktiverTabIdRef, optionen.setAktiverTabId))
      return;
    if (
      behandleVerlaufNavigationTastenkuerzel(
        e,
        verlaufSchrittUndOeffnenRef,
        istUeberlagerungAktiv,
        istEingabefeldFokussiert,
      )
    )
      return;
    if (
      behandleKlappstufenTastenkuerzel(
        e,
        zuklappenRef,
        aufklappenRef,
        istUeberlagerungAktiv,
        istEingabefeldFokussiert,
      )
    )
      return;
    if (
      behandleOeffnenZifferTastenkuerzel(
        e,
        optionen.setOeffnenOverlayInitial,
        optionen.setAktivesOverlay,
        istEingabefeldFokussiert,
      )
    )
      return;
    behandleGesetzeskurzbefehl(e, gesetzeskurzbefehleRef, gesetzeRef, gesetzesreferenzOeffnenRef);
  });

  useEffect(() => {
    const reservierung = reservierteTastenkuerzel();
    setzeReservierteTastenkuerzel(reservierung.tasten);
    setzeReservierteTastenkuerzelCodes(reservierung.codes);

    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}
