// Verbindet App-Aktionen mit Tabs, Öffnungssteuerung und Overlays.
// Verlaufsbefehle laufen über den Besitzer useVerlaufSteuerung; die Öffnungssteuerung
// prüft Ziel und Auftragsgültigkeit. Liste, Zeiger und Rückkehrmarke bleiben dort.

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { AktivesOverlay, Tab } from '@/lib/domain/appTypes';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import type { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { bannerSchliessen, zeigeBanner } from '@/lib/banner/banner.index';
import {
  abonniereDateiImportZustand,
  dateiImportErfolgstext,
  istReinerImportErfolg,
  leseDateiImportZustand,
  starteDateiImport,
  verwerfeDateiImportErgebnis,
  waehleImportDateien,
} from '@/lib/import-export/import-export.index';

interface AppAktionenOptionen {
  uebersichtExportAktionRef: RefObject<(() => void) | null>;
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  tabSchliessen: (tabId: string) => void;
  tabWiederherstellen: () => void;
  fensterSchliessen: () => void;
  verlaufNavigieren: ReturnType<typeof useAppTabs>['verlaufNavigieren'];
  gesetzesreferenzOeffnen: ReturnType<typeof useGesetzOeffnen>['gesetzesreferenzOeffnen'];
  gesetzInfoInTabsPatchen: (gesetze: GesetzDarstellung[], referenzen: Gesetzesreferenz[]) => void;
  aktivesOverlay: AktivesOverlay | null;
  setAktivesOverlay: Dispatch<SetStateAction<AktivesOverlay | null>>;
}

export function useAppAktionen({
  uebersichtExportAktionRef,
  tabsRef,
  aktiverTabIdRef,
  tabSchliessen,
  tabWiederherstellen,
  fensterSchliessen,
  verlaufNavigieren,
  gesetzesreferenzOeffnen,
  gesetzInfoInTabsPatchen,
  aktivesOverlay,
  setAktivesOverlay,
}: AppAktionenOptionen) {
  const aktivesOverlayRef = useRef(aktivesOverlay);
  useEffect(() => {
    aktivesOverlayRef.current = aktivesOverlay;
  }, [aktivesOverlay]);

  // Ende eines Datei-Imports (Übergang laeuft → fertig): Ist das Overlay offen,
  // zeigt es selbst Abschlusszeile bzw. Bericht. Sonst bei reinem Erfolg nur ein
  // Banner (Ergebnis verworfen); andernfalls öffnet sich der Bericht, sofern kein
  // anderes Overlay offen ist – ein offenes wird nicht verdrängt, stattdessen
  // bietet ein Banner „Bericht anzeigen“ an.
  useEffect(() => {
    let vorher = leseDateiImportZustand().art;
    return abonniereDateiImportZustand(() => {
      const jetzt = leseDateiImportZustand();
      const warLaufend = vorher === 'laeuft';
      vorher = jetzt.art;
      if (!warLaufend || jetzt.art !== 'fertig') return;
      const offen = aktivesOverlayRef.current;
      if (offen === 'dateiImport') return;
      if (istReinerImportErfolg(jetzt.ergebnis)) {
        zeigeBanner({
          art: 'erfolg',
          text: dateiImportErfolgstext(jetzt.ergebnis.berichtEintraege.length),
        });
        verwerfeDateiImportErgebnis();
        return;
      }
      if (offen === null) {
        setAktivesOverlay('dateiImport');
        return;
      }
      const fehlerAnzahl = jetzt.ergebnis.fehler.length;
      const bannerId = zeigeBanner({
        art: 'vorgangsergebnis',
        text:
          fehlerAnzahl === 0
            ? 'Datei-Import abgeschlossen – Bericht ansehen'
            : `Datei-Import abgeschlossen, ${fehlerAnzahl} Fehler – Bericht ansehen`,
        aktion: {
          label: 'Bericht anzeigen',
          onClick: () => {
            bannerSchliessen(bannerId);
            if (leseDateiImportZustand().art !== 'kein') setAktivesOverlay('dateiImport');
          },
        },
      });
    });
  }, [setAktivesOverlay]);

  // Gegenstück für Aktualisierungen OHNE Inhaltsänderung (Kategorie
  // 'unveraendert', siehe AktualisierenOverlay.tsx): patcht Liste und offene
  // Tabs direkt mit den übergebenen, bereits frischen Objekten – kein
  // Disk-Reload, kein Remount, Scrollposition bleibt erhalten. Für
  // inhaltliche Änderungen gibt es kein Gegenstück mehr HIER: das übernimmt
  // zentral useGesetzVerwaltung.ts über den 'gesetze-geaendert'-Broadcast.
  function gesetzInfoAktualisieren(aktualisierteGesetze: GesetzDarstellung[]) {
    gesetzInfoInTabsPatchen(aktualisierteGesetze, aktualisierteGesetze.map(referenzVon));
  }

  // Die Übersicht übernimmt ⌘E / Menü „Export…“ bei Auswahl oder gesperrten Aktionen.
  // Ohne angemeldete Aktion ersetzt das allgemeine Export-Overlay das offene Overlay.
  function handleExportOeffnen() {
    if (uebersichtExportAktionRef.current) {
      uebersichtExportAktionRef.current();
      return;
    }
    setAktivesOverlay('export');
  }

  function tabOderFensterSchliessen() {
    if (tabsRef.current.length > 1 && aktiverTabIdRef.current) {
      tabSchliessen(aktiverTabIdRef.current);
    } else {
      fensterSchliessen();
    }
  }

  function tabWiederherstellenAktuell() {
    tabWiederherstellen();
  }

  // Der Verlaufsbesitzer reiht Befehle; die Öffnungssteuerung meldet den
  // gültigen Abschluss. Erst dann werden Zeiger und Rückkehrmarke übernommen.
  function verlaufSchrittUndOeffnen(richtung: 'zurueck' | 'vorwaerts') {
    const tabId = aktiverTabIdRef.current;
    if (!tabId) return;
    verlaufNavigieren(tabId, richtung, (ziel, melden) =>
      gesetzesreferenzOeffnen(
        { gesetzesreferenz: ziel.gesetzesreferenz, xmlId: ziel.xmlId, ohneVerlauf: true },
        'immer-aktiver-tab',
        tabId,
        melden,
      ),
    );
  }

  // Startaktion für das Ablegen von Dateien auf die Gesetzesübersicht und die Anfrage
  // über Menü/Kurzbefehl. Startet den Import, sofern keiner läuft, und zeigt in
  // jedem Fall das Overlay (ersetzt dabei etwa die Gesetzesübersicht).
  function handleDateiImportStart(pfade: string[]) {
    starteDateiImport(pfade);
    setAktivesOverlay('dateiImport');
  }

  // Schließen beendet einen laufenden Import nicht; ein fertiges Ergebnis
  // wird verworfen.
  function handleDateiImportSchliessen() {
    setAktivesOverlay(null);
    verwerfeDateiImportErgebnis();
  }

  // Menü bzw. Kurzbefehl „Dateien importieren“: Läuft im Fenster schon ein
  // Import, wird nur dessen Overlay wieder gezeigt. Sonst Dateiauswahl; bei
  // Abbruch geschieht nichts, andernfalls startet der Import und das Overlay
  // öffnet sofort mit dem Fortschritt.
  async function handleDateiImportAnfrage() {
    if (leseDateiImportZustand().art === 'laeuft') {
      setAktivesOverlay('dateiImport');
      return;
    }
    const pfade = await waehleImportDateien();
    if (!pfade) return;
    handleDateiImportStart(pfade);
  }

  return {
    gesetzInfoAktualisieren,
    handleExportOeffnen,
    tabOderFensterSchliessen,
    fensterSchliessen,
    tabWiederherstellenAktuell,
    verlaufSchrittUndOeffnen,
    handleDateiImportStart,
    handleDateiImportSchliessen,
    handleDateiImportAnfrage,
  };
}
