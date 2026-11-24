// useMenueEvents.ts
//
// Registriert die Listener für die vom nativen Tauri-Menü gesendeten Events
// (siehe lib.rs) – das Pendant zu den Fallback-Tastenkürzeln in
// useTastenkuerzel.ts für Plattformen ohne natives Menü.

import { istErlaubt, type EinfuehrungsAktion } from '@/lib/domain/einfuehrung/einfuehrung.index';
import { useEffect, useEffectEvent } from 'react';
import {
  hoereImEigenenFenster,
  type MenueEreignis,
  type EreignisAnmeldung,
} from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { einstellungenFensterOeffnen } from '@/lib/plattform/tauriHelpers';
import { useAktuellerWertRef } from '@/hooks/utils/useAktuellerWertRef';
import type { MenueUndTastenAktionen } from '@/hooks/eingabe/eingabeAktionen.types';

interface MenueEventsOptionen extends MenueUndTastenAktionen {
  /** Schließt IMMER das ganze Fenster (⇧⌘W / Menü "Fenster schließen"),
   *  unabhängig davon, wie viele Tabs offen sind – anders als
   *  tabOderFensterSchliessen (⌘W), das bei mehreren Tabs nur den
   *  aktiven schließt. */
  /** Menü Hilfe > "Einführung erneut durchführen" (siehe menu.rs) – setzt
   *  die Einführung zurück (useEinfuehrung.ts: neuStarten). */
  einfuehrungNeuStarten: () => void;
  /** Sperrt während der Einführung (useEinfuehrung.ts) alle Menü-Events
   *  außer den explizit erlaubten (siehe istEreignisErlaubt unten). Robust
   *  unabhängig davon, ob das native Menü (menu.rs) ein bestimmtes Item
   *  tatsächlich ausgegraut bekommen hat – der Guard sitzt hier auf der
   *  Wirkungsseite, nicht auf der (plattform-/AppKit-abhängigen)
   *  Darstellungsseite. */
  einfuehrungAktiv: boolean;
  /** Aktueller Teilaktionsindex (0-basiert, siehe useEinfuehrung.ts) – steuert,
   *  in welcher Teilaktion "favorit-speichern"/"lesezeichen-speichern" als
   *  Menü-Alternative zum Klick durchgelassen werden (siehe
   *  istEreignisErlaubt unten; analog zu useTastenkuerzel.ts). */
  einfuehrungTeilaktion: number;
}

/** Neustart bleibt erreichbar; alle übrigen Freigaben stammen aus dem Modul. */
function istEreignisErlaubt(event: string, teilaktion: number): boolean {
  if (event === 'einfuehrung-neu-starten-anfrage') return true;
  const aktionen: Record<string, EinfuehrungsAktion> = {
    'oeffnen-overlay-oeffnen': 'oeffnen-overlay-zeigen',
    'favorit-speichern': 'favorit-speichern',
    'lesezeichen-speichern': 'lesezeichen-speichern',
  };
  const aktion = aktionen[event];
  return aktion !== undefined && istErlaubt(teilaktion, aktion);
}

export function useMenueEvents(optionen: MenueEventsOptionen) {
  // Siehe Options-Kommentar zu einfuehrungAktiv: der Effekt unten
  // registriert seine Listener einmal mit stabilen Refs und würde
  // sonst für immer den Erstrender-Stand von optionen.einfuehrungAktiv/
  // -Teilaktion sehen.
  const einfuehrungAktivRef = useAktuellerWertRef(optionen.einfuehrungAktiv);
  const einfuehrungTeilaktionRef = useAktuellerWertRef(optionen.einfuehrungTeilaktion);

  const fuehreAus = useEffectEvent((handler: (aktuell: MenueEventsOptionen) => void) =>
    handler(optionen),
  );

  useEffect(() => {
    const anmeldungen: EreignisAnmeldung[] = [];
    function registriere(event: MenueEreignis, handler: (aktuell: MenueEventsOptionen) => void) {
      const anmeldung = hoereImEigenenFenster(event, () => {
        if (
          einfuehrungAktivRef.current &&
          !istEreignisErlaubt(event, einfuehrungTeilaktionRef.current)
        )
          return;
        fuehreAus(handler);
      });
      anmeldungen.push(anmeldung);
      void anmeldung.bereit.catch((fehler) =>
        console.error('Menü-Event konnte nicht registriert werden:', fehler),
      );
    }
    function registriereMenueEvents() {
      try {
        registriere('gesetzesuebersicht-oeffnen', (optionen) =>
          optionen.setAktivesOverlay('uebersicht'),
        );
        // Weiterhin nötig: nicht mehr für das native macOS-Menü (menu.rs ruft
        // einstellungen_fenster_oeffnen dort inzwischen direkt auf), aber das
        // Windows/Linux-Hamburger-Menü (hamburgerMenu.ts) emittiert dasselbe
        // Event weiterhin client-seitig (siehe menuStruktur.ts: ereignis:
        // 'einstellungen-oeffnen') und braucht diesen Listener.
        registriere('einstellungen-oeffnen', () => void einstellungenFensterOeffnen());
        registriere('dateien-importieren-anfrage', (optionen) =>
          optionen.handleDateiImportAnfrage(),
        );
        registriere('gesetze-aktualisieren-oeffnen', (optionen) =>
          optionen.setAktivesOverlay('aktualisieren'),
        );
        registriere('gesetz-info-oeffnen', (optionen) => optionen.setAktivesOverlay('gesetzInfo'));
        registriere('export-oeffnen', (optionen) => optionen.handleExportOeffnen());
        registriere('favorit-speichern', (optionen) => optionen.handleFavoritSpeichern());
        registriere('favoriten-hinzufuegen-oeffnen', (optionen) =>
          optionen.setAktivesOverlay('favoritenHinzufuegen'),
        );
        registriere('lesezeichen-speichern', (optionen) => optionen.handleLesezeichenSpeichern());
        registriere('alle-lesezeichen-entfernen-anfrage', (optionen) =>
          optionen.handleAlleLesezeichenEntfernen(),
        );
        registriere('unterstreichen-anfrage', (optionen) => optionen.handleUnterstreichen());
        registriere('hervorheben-anfrage', (optionen) => optionen.handleHervorheben());
        registriere('verweismarkierung-anfrage', (optionen) =>
          optionen.handleVerweismarkierungAnfrage(),
        );
        registriere('kommentar-anfrage', (optionen) => optionen.handleKommentarAnfrage());
        registriere('tastenkuerzel-oeffnen', (optionen) =>
          optionen.setAktivesOverlay('tastenkuerzel'),
        );
        registriere('datenschutz-oeffnen', (optionen) => optionen.setAktivesOverlay('datenschutz'));
        registriere('ueber-oeffnen', (optionen) => optionen.setAktivesOverlay('ueber'));
        registriere('einfuehrung-neu-starten-anfrage', (optionen) =>
          optionen.einfuehrungNeuStarten(),
        );
        // Kein natives Tastaturkürzel im Menü (siehe menu.rs: bewusst ohne
        // accelerator, um Kollision mit dem nativen Bearbeiten>Rückgängig/
        // Wiederholen zu vermeiden) – ⌘Z/⇧⌘Z werden stattdessen ausschließlich
        // JS-seitig behandelt, siehe useTastenkuerzel.ts.
        registriere('markierung-rueckgaengig-anfrage', (optionen) =>
          optionen.handleMarkierungRueckgaengig(),
        );
        registriere('markierung-wiederholen-anfrage', (optionen) =>
          optionen.handleMarkierungWiederholen(),
        );
        registriere('gesetzesindizes-oeffnen', (optionen) =>
          optionen.setAktivesOverlay('importindizes'),
        );
        registriere('oeffnen-overlay-oeffnen', (optionen) => {
          optionen.setOeffnenOverlayInitial('');
          optionen.setAktivesOverlay('oeffnen');
        });
        registriere('volltext-suche-oeffnen', (optionen) => {
          optionen.setAktivesOverlay('volltextSuche');
        });
        registriere('volltext-alle-oeffnen', (optionen) => {
          optionen.setAktivesOverlay('volltextAlle');
        });
        registriere('verlauf-anzeigen-oeffnen', (optionen) => {
          optionen.setAktivesOverlay('verlauf');
        });
        registriere('schliessen-anfrage', (optionen) => optionen.tabOderFensterSchliessen());
        registriere('fenster-schliessen-anfrage', (optionen) => optionen.fensterSchliessen());
        registriere('leerentab-oeffnen', (optionen) => optionen.erstelleLeerenTab());
        registriere('letzter-tab-oeffnen', (optionen) => optionen.tabWiederherstellen());
      } catch (fehler) {
        console.error('Menü-Events konnten nicht vollständig registriert werden:', fehler);
      }
    }

    registriereMenueEvents();
    return () => {
      anmeldungen.forEach((anmeldung) => anmeldung.abmelden());
    };
  }, [einfuehrungAktivRef, einfuehrungTeilaktionRef]);
}
