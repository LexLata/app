// useMarkierungen.ts
//
// App-seitiger Trigger-Hook für die DIREKTEN Markierungs-Features
// Unterstreichen (⌘U / Menü „Unterstreichen"), Hervorheben (⇧⌘U / Menü
// „Hervorheben") und "Markierung löschen" (Rechtsklick-Kontextmenü, siehe
// markierungContext.ts): ermittelt die aktuelle
// Browser-Selektion, löst sie über textpfad.ts in xmlId +
// Textpfad auf, bestimmt darüber das betroffene Element im Gesetz des
// aktiven Tabs, berechnet den Bezeichnung-String und persistiert die
// Markierung – analog zu handleFavoritSpeichern in
// useLesezeichenUndFavoriten.ts, nur dass die Zielposition hier aus der
// tatsächlichen Textselektion stammt statt aus dem „aktives Element"-Zustand.
// Unterstreichen/Hervorheben teilen sich dieselbe markieren()-Kernlogik, nur
// der `typ` unterscheidet sich.
//
// Die HILFSFENSTER-basierten Features Verweismarkierung/Kommentar (Anfrage +
// Bearbeiten) leben dagegen in useVerweismarkierungUndKommentarHilfsfenster.ts – dieser
// Hook hier hält aber weiterhin den gemeinsamen Undo-/Redo-Stack für ALLE
// Markierungs-Aktionen (siehe unten), da deren Hilfsfenster ihre Aktion per
// IPC-Event an dieses Fenster zurückmelden (siehe Listener unten). Auch
// markierung-wegen-ueberlappung-abgelehnt wird hier empfangen, damit das Banner im Hauptfenster
// erscheint und die Eingabe im Hilfsfenster erhalten bleibt.
//
// Die Anzeige (MarkierungCtx, Laden/Sync pro Gesetz) lebt bewusst NICHT hier,
// sondern Gesetzestextansicht-seitig in useMarkierungenAnzeige.ts – dieser Hook
// löst nur das Sync-Event aus, lädt aber selbst nichts.
//
// Undo/Redo (⌘Z/⇧⌘Z, siehe useTastenkuerzel.ts/menu.rs): dieser Hook hält
// den Undo-/Redo-Stack (nur RAM, fenster-lokal, siehe undoStackRef/
// redoStackRef unten) für ALLE Markierungs-Aktionen – Hinzufügen von
// Unterstreichung/Hervorhebung/Verweismarkierung UND Bearbeiten eines
// Verweises. markieren() pusht direkt (läuft im selben Fenster); die
// Verweismarkierung-/Kommentar-Hilfsfenster (VerweismarkierungFenster.tsx/
// KommentarFenster.tsx) laufen dagegen in EIGENEN Tauri-Fenstern und liefern
// ihre Aktion daher per bestätigter Historienübernahme an das aufrufende
// Fenster – siehe Empfängeranmeldung unten.

// Statt dynamisch: useMarkierungenDeaktiviert.ts wird bereits über App.tsx
// (Hook-Aufruf beim Root-Component) statisch/eager geladen – ein dynamischer
// Import hier brachte keinen Chunk-Splitting-Vorteil, nur die
// Vite-Warnung INEFFECTIVE_DYNAMIC_IMPORT.

import type { useAppTabs as Tabsteuerung } from '@/hooks/tabs/useAppTabs';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { zeigeBanner } from '@/lib/banner/banner.index';
import { istDateiSperreWartefrist } from '@/lib/persistenz/kern/kern.index';
import type { Tab } from '@/lib/domain/appTypes';
import type {
  HinzufuegenErgebnis,
  MarkierungsAktion,
  MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import {
  ausgangsstelleNichtEindeutigMeldung,
  findeElementZuBezeichnung,
  registriereMarkierungsHistorienEmpfang,
} from '@/lib/markierungen/markierungen.index';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import { ermittleAuswahl } from '@/lib/domain/textpfad/textpfad.index';
import {
  hoereGlobal,
  sendeGlobal,
} from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { setzeAktiv } from '@/lib/plattform/menu/menu.index';
import { zeigeMarkierungenDeaktiviertBanner } from '@/hooks/einstellungen/useMarkierungenDeaktiviert';

/** Ohne geöffnetes Gesetz ist nur eine tatsächliche Markierungsanfrage ein Fehler. */
function zeigeAdressierungsfehlerBeiAuswahl() {
  if (window.getSelection()?.toString().trim()) {
    zeigeBanner({
      art: 'bedienhinweis',
      text: ausgangsstelleNichtEindeutigMeldung,
      typ: 'warnung',
    });
  }
}

// Die Dateisperre hat eine Wartefrist bereits mit einer spezifischen Meldung angezeigt.
function zeigeSpeicherFehler(fehler: unknown, text: string) {
  if (istDateiSperreWartefrist(fehler)) return;
  zeigeBanner({ art: 'systemfehler', text, typ: 'fehler' });
}

interface MarkierungenOptionen {
  holeTabGesetz: ReturnType<typeof Tabsteuerung>['holeTabGesetz'];
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  /** Einstellung "Markierungen deaktivieren" (siehe
   *  useMarkierungenDeaktiviert.ts) – bei true bricht markieren() ab; zeigt
   *  dabei ein Banner, aber NUR wenn tatsächlich Text ausgewählt war (siehe
   *  dort), sonst still (kein Banner bei jedem versehentlichen ⌘U ohne
   *  Auswahl). */
  markierungenDeaktiviertRef: RefObject<boolean>;
}

export function useMarkierungen({
  holeTabGesetz,
  tabsRef,
  aktiverTabIdRef,
  markierungenDeaktiviertRef,
}: MarkierungenOptionen) {
  // Fenster-lokale Undo-/Redo-Historie, siehe Kopfkommentar. Kein
  // useState nötig: die Stacks selbst lösen kein Re-Render aus (nur die
  // XML-Datei + das bestehende "markierungen-geaendert"-Sync-Event tun das).
  const undoStackRef = useRef<MarkierungsAktion[]>([]);
  const redoStackRef = useRef<MarkierungsAktion[]>([]);

  // Direkter Sync statt State+Effect (siehe Planungsrunde: kein neuer State
  // nötig): nach JEDER der sechs Stack-Mutationen unten aufgerufen, damit
  // "Markierung rückgängig"/"…wiederholen" (menu.rs) grau sind, wenn nichts
  // rückgängig zu machen bzw. zu wiederholen ist. Löst absichtlich KEIN
  // Re-Render aus (die Stacks selbst bleiben reine Refs, siehe
  // Kopfkommentar).
  function syncUndoRedoMenuStatus() {
    try {
      setzeAktiv('markierung-rueckgaengig', undoStackRef.current.length > 0);
      setzeAktiv('markierung-wiederholen', redoStackRef.current.length > 0);
    } catch (fehler) {
      console.error('Markierungsmenü konnte nicht aktualisiert werden:', fehler);
    }
  }

  // Einmalig beim Mount: Stacks starten leer, aber die Menüpunkte sind im
  // nativen Menü zunächst hart auf aktiv gesetzt (Rust kennt den
  // Stack-Inhalt beim Menüaufbau noch nicht) – ohne diesen Sync blieben
  // "Markierung rückgängig"/"…wiederholen" bei einem frischen Fenster
  // fälschlich aktiv (derselbe Bug wie beim "Zuletzt geschlossenen Tab
  // öffnen"-Fix, siehe geschlosseneTabsSpeicher.ts).
  useEffect(() => {
    syncUndoRedoMenuStatus();
  }, []);

  // Nimmt Undo-relevante Aktionen entgegen, die im VerweismarkierungFenster
  // (separates Tauri-Fenster) entstanden sind, siehe VerweismarkierungFenster.tsx:
  // speichern(). Jede neue Aktion – ob von hier oder von dort – leert den
  // Redo-Stack (Standard-Undo/Redo-Semantik).
  useEffect(() => {
    let abgebrochen = false;
    const unlisten: Array<() => void> = [];
    void (async () => {
      const fn = await registriereMarkierungsHistorienEmpfang((aktion) => {
        if (abgebrochen) throw new Error('Historienempfang wurde abgemeldet');
        undoStackRef.current.push(aktion);
        redoStackRef.current = [];
        // Menü erst außerhalb der synchronen Übernahme aktualisieren.
        queueMicrotask(() => {
          if (!abgebrochen) syncUndoRedoMenuStatus();
        });
      });
      if (abgebrochen) fn();
      else unlisten.push(fn);
      if (abgebrochen) return;
      const anmeldung = hoereGlobal('markierung-wegen-ueberlappung-abgelehnt', () => {
        void (async () => {
          const { zeigeUeberlappungsBanner } =
            await import('@/lib/markierungen/markierungen.index');
          await zeigeUeberlappungsBanner();
        })();
      });
      unlisten.push(anmeldung.abmelden);
      await anmeldung.bereit;
    })().catch((fehler) => {
      console.error('Markierungsempfang konnte nicht angemeldet werden:', fehler);
    });
    return () => {
      abgebrochen = true;
      for (const abmelden of unlisten) abmelden();
    };
  }, []);

  async function markieren(typ: 'unterstreichung' | 'hervorhebung') {
    if (markierungenDeaktiviertRef.current) {
      // Nur bei tatsächlich vorhandener Auswahl auf das Banner zurückgreifen
      // – sonst würde ⌘U/⇧⌘U bei jedem versehentlichen Druck ohne Auswahl
      // (z.B. während man liest) ein Banner zeigen, obwohl gar keine
      // Markierung versucht wurde. window.getSelection() statt
      // ermittleAuswahl(): Letzteres würde bei fehlender Auswahl bereits
      // selbst 'fehler: leer' liefern, das wir hier aber nicht als
      // eigenständigen Bannergrund werten wollen (siehe unten für den
      // regulären 'ueberspannt-mehrere'-Fall, wenn Markierungen aktiv sind).
      if (window.getSelection()?.toString().trim()) {
        await zeigeMarkierungenDeaktiviertBanner();
      }
      return;
    }

    const tab = aktiverTabIdRef.current
      ? tabsRef.current.find((t) => t.id === aktiverTabIdRef.current)
      : null;
    const tabGesetz = holeTabGesetz(tab);
    if (!tabGesetz) {
      zeigeAdressierungsfehlerBeiAuswahl();
      return;
    }
    const gesetz = tabGesetz;
    const gesetzesreferenz = {
      kurztitel: gesetz.kurztitel,
      normgeber: gesetz.normgeber,
    };

    const auswahl = ermittleAuswahl(window.getSelection());
    if ('fehler' in auswahl) {
      // 'ueberspannt-mehrere': Auswahl reicht über mehr als einen Satzteil
      // (TextBlatt) hinweg – ein Zeichen-Bereich lässt sich dafür nicht
      // eindeutig bestimmen (siehe ermittleAuswahl), daher aktiv per Banner
      // erklären statt wie 'leer' (keine Auswahl – Normalfall, kein
      // Hinweis nötig) still abzubrechen.
      if (auswahl.fehler === 'ueberspannt-mehrere') {
        zeigeBanner({
          art: 'bedienhinweis',
          text: 'Eine Markierung kann nicht über mehrere Normteile hinweg reichen.',
          typ: 'warnung',
        });
      }
      return;
    }

    const element = gesetz.elemente.find((e) => e.data.xmlId === auswahl.xmlId);
    if (!element) {
      zeigeBanner({
        art: 'bedienhinweis',
        text: ausgangsstelleNichtEindeutigMeldung,
        typ: 'warnung',
      });
      return;
    }

    // bezeichnung: für Normen die übliche Kurz-Bezeichnung
    // (ausgangsnormKennung); Überschriften haben keine Normzahl – für sie wird
    // die gliederungskennzahl mit ausdrücklichem Überschriftenkennzeichen gespeichert.
    const kennung = ausgangsnormKennung(gesetz, element);
    if (!kennung) {
      zeigeBanner({
        art: 'bedienhinweis',
        text: ausgangsstelleNichtEindeutigMeldung,
        typ: 'warnung',
      });
      return;
    }

    const eintrag: MarkierungsEintrag = {
      typ,
      ausgangsstelle: kennung,
      bezug: { typ: 'bezugstext', textstelle: auswahl.textstelle, bezugstext: auswahl.bezugstext },
    };

    let ergebnis: HinzufuegenErgebnis;
    try {
      const { hinzufuegenMarkierung, zeigeUeberlappungsBanner } =
        await import('@/lib/markierungen/markierungen.index');
      ergebnis = findeElementZuBezeichnung(gesetz, eintrag.ausgangsstelle)
        ? await hinzufuegenMarkierung(gesetzesreferenz, eintrag)
        : { erfolgreich: false, ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig' };
      if (ergebnis.ablehnungsgrund === 'ausgangsstelle-nicht-eindeutig') {
        zeigeBanner({
          art: 'bedienhinweis',
          text: ausgangsstelleNichtEindeutigMeldung,
          typ: 'warnung',
        });
      }
      // 'duplikat' kann hier strukturell nie auftreten: eintrag hat immer
      // einen Textbezug (Textstelle aus der Auswahl, siehe
      // oben) – nur der textbezugslose Zweig in hinzufuegenMarkierung()
      // prüft auf Duplikate (siehe istIdentischeAllgemeineMarkierung).
      if (ergebnis.ablehnungsgrund === 'ueberlappung') {
        await zeigeUeberlappungsBanner();
      }
    } catch (fehler) {
      console.error('Markierung konnte nicht gespeichert werden:', fehler);
      zeigeSpeicherFehler(fehler, 'Die Markierung konnte nicht gespeichert werden.');
      return;
    }
    // Komplett blockiert (bestehender Verweismarkierung/Kommentar im Weg): nichts
    // gespeichert, kein Sync-Event, kein Undo-Eintrag (siehe Konkurrenz-
    // Regeln, markierungSpeicher.ts).
    if (!ergebnis.erfolgreich || !ergebnis.aktion) return;

    undoStackRef.current.push(ergebnis.aktion);
    redoStackRef.current = [];
    syncUndoRedoMenuStatus();

    await meldeAenderung(gesetzesreferenz);
  }

  // Speichererfolg und Historie bleiben auch bei einem Benachrichtigungsfehler erhalten.
  async function meldeAenderung(gesetz: Gesetzesreferenz) {
    try {
      await sendeGlobal('markierungen-geaendert', { gesetz });
    } catch (fehler) {
      console.error('Änderung der Markierungen konnte nicht gemeldet werden:', fehler);
    }
  }

  // Bereits gespeicherte Schritte müssen auch nach einem Fehler sichtbar sein.
  async function meldeTeilfortschritt(aktion: MarkierungsAktion) {
    if (aktion.art !== 'ersetzen' || !aktion.fortschritt?.naechsterSchritt) return;
    await meldeAenderung(aktion.gesetz);
  }

  /** ⌘Z / Menü „Markierung rückgängig": macht die letzte Markierungs-Aktion
   *  (Hinzufügen ODER Verweismarkierung-Bearbeiten, siehe MarkierungsAktion)
   *  rückgängig. Kein Nutzerfeedback bei leerem Stack oder nicht mehr
   *  auffindbarer Stelle – analog zum sonstigen Best-effort-Umgang bei
   *  Markierungen (still verwerfen statt Fehlermeldung). */
  async function handleMarkierungRueckgaengig() {
    const stack = undoStackRef.current;
    const aktion = stack.pop();
    if (!aktion) return;
    const position = stack.length;
    let erfolgreich: boolean;
    try {
      const { fuehreRueckgaengigAus } = await import('@/lib/markierungen/markierungen.index');
      erfolgreich = await fuehreRueckgaengigAus(aktion);
    } catch (fehler) {
      // Neu hinzugekommene Aktionen bleiben über dem fehlgeschlagenen Eintrag.
      stack.splice(Math.min(position, stack.length), 0, aktion);
      syncUndoRedoMenuStatus();
      console.error('Markierung konnte nicht rückgängig gemacht werden:', fehler);
      zeigeSpeicherFehler(
        fehler,
        'Rückgängig konnte nicht vollständig gespeichert werden. Bitte erneut versuchen.',
      );
      await meldeTeilfortschritt(aktion);
      return;
    }
    if (!erfolgreich) {
      syncUndoRedoMenuStatus();
      return;
    } // Stelle nicht mehr auffindbar – Aktion verwerfen, nicht erneut versuchen (Stack-Länge hat sich durch den pop() oben trotzdem geändert)
    redoStackRef.current.push(aktion);
    syncUndoRedoMenuStatus();
    await meldeAenderung(aktion.gesetz);
  }

  /** ⇧⌘Z / Menü „Markierung wiederholen": Gegenstück zu handleMarkierungRueckgaengig. */
  async function handleMarkierungWiederholen() {
    const stack = redoStackRef.current;
    const aktion = stack.pop();
    if (!aktion) return;
    const position = stack.length;
    let erfolgreich: boolean;
    try {
      const { fuehreWiederholenAus } = await import('@/lib/markierungen/markierungen.index');
      erfolgreich = await fuehreWiederholenAus(aktion);
    } catch (fehler) {
      // Eine neue Aktion kann Redo inzwischen verworfen haben; dann bleibt es leer.
      if (redoStackRef.current === stack) {
        stack.splice(Math.min(position, stack.length), 0, aktion);
      }
      syncUndoRedoMenuStatus();
      console.error('Markierung konnte nicht wiederholt werden:', fehler);
      zeigeSpeicherFehler(
        fehler,
        'Wiederholen konnte nicht vollständig gespeichert werden. Bitte erneut versuchen.',
      );
      await meldeTeilfortschritt(aktion);
      return;
    }
    if (!erfolgreich) {
      syncUndoRedoMenuStatus();
      return;
    }
    undoStackRef.current.push(aktion);
    syncUndoRedoMenuStatus();
    await meldeAenderung(aktion.gesetz);
  }

  // Trigger für "Markierung löschen" (Rechtsklick auf eine bestehende
  // Markierung JEDES Typs – Unterstreichung, Hervorhebung, Verweismarkierung oder
  // Kommentar – im Gesetzes-View, siehe
  // markierungContext.ts: onMarkierungRechtsklick). Löscht
  // sofort (kein Bestätigungsdialog, analog zum sonstigen
  // Best-effort-Umgang bei Markierungen) und landet als 'entfernen'-Aktion
  // auf dem Undo-Stack – Rückgängig fügt denselben Eintrag über
  // hinzufuegenMarkierung unverändert wieder ein (Gegenstück zu markieren()
  // oben).
  async function handleMarkierungLoeschen(
    { kurztitel, normgeber }: Gesetzesreferenz,
    eintrag: MarkierungsEintrag,
  ) {
    const gesetz = { kurztitel, normgeber };
    try {
      const { entferneMarkierung } = await import('@/lib/markierungen/markierungen.index');
      const erfolgreich = await entferneMarkierung(gesetz, eintrag);
      if (!erfolgreich) return; // Stelle nicht mehr auffindbar – still verwerfen

      undoStackRef.current.push({ art: 'entfernen', gesetz, eintrag });
      redoStackRef.current = [];
      syncUndoRedoMenuStatus();
    } catch (fehler) {
      console.error('Markierung konnte nicht gelöscht werden:', fehler);
      zeigeSpeicherFehler(fehler, 'Die Markierung konnte nicht gelöscht werden.');
      return;
    }
    await meldeAenderung(gesetz);
  }

  return {
    handleUnterstreichen: () => markieren('unterstreichung'),
    handleHervorheben: () => markieren('hervorhebung'),
    handleMarkierungLoeschen,
    handleMarkierungRueckgaengig,
    handleMarkierungWiederholen,
  };
}
