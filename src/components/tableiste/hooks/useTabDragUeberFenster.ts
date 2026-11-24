// useTabDragUeberFenster.ts
//
// Live-"Platz machen" beim Ziehen eines Tabs über ein ANDERES, bereits
// offenes Fenster. Ergänzt das bestehende Cross-Window-Drop-Feature
// (Tableiste.tsx: fensterUnterCursorFinden + App.tsx: handleTabInFensterAufnehmen /
// tab-uebertragung-eingefuegt) um eine rein visuelle Vorschau WÄHREND des
// Drags – die eigentliche Tab-Übertragung beim Loslassen bleibt davon
// vollständig unberührt.
//
// Dieser Hook übernimmt zwei Rollen, die JEDE Tableiste-Instanz gleichzeitig
// ausfüllt (jedes offene Fenster ist potenziell sowohl Quelle als auch Ziel):
//
//  - SENDEN: Während des eigenen Drags ruft Tableiste.tsx bei jeder
//    Cursor-Bewegung dragBewegungMelden() auf. Bei einem Zielwechsel wird
//    dem alten Ziel "verlassen" und dem neuen "betreten" gemeldet, sonst
//    dem aktuellen Ziel nur die neue Position ("bewegt") – jeweils als
//    Tauri-Event direkt an das betroffene Fenster (emitTo), throttled auf
//    max. 1 Nachricht pro Frame.
//  - EMPFANGEN: Unabhängig vom eigenen Drag hört diese Instanz permanent auf
//    genau diese drei Events und hält bei Bedarf einen lokalen
//    fremdVorschau-State, um eine Lücke an der richtigen Stelle der eigenen
//    Tableiste darzustellen. Der fremde Tab selbst wird dabei NICHT
//    übernommen – das passiert weiterhin ausschließlich über den
//    bestehenden tab-uebertragung-eingefuegt-Kanal beim tatsächlichen Drop.
//
// Kein neuer Rust-Code nötig: Die Umrechnung von Bildschirm- in lokale
// Fensterkoordinaten läuft über die native Tauri-Fensterposition
// (getCurrentWindow().outerPosition(), siehe eigenePositionRef unten) statt
// über einen Rust-Command – die DOM-Eigenschaft window.screenX erwies sich
// in dieser Tauri-WebView-Umgebung als unzuverlässig (lieferte konstant 0).

import { useEffect, useRef, useState } from 'react';
import type { Tab } from '@/lib/domain/appTypes.ts';

export interface FremdVorschau {
  zeile1: string;
  zeile2?: string;
  index: number;
}

interface Params {
  leisteRef: React.RefObject<HTMLDivElement | null>;
  tabsRef: React.RefObject<Tab[]>;
  /**
   * Optionaler, von AUSSEN (App.tsx über Tableiste) hereingereichter Ref, der
   * synchron IMMER den aktuellen fremdVorschau.index (bzw. null) spiegelt.
   * Grund: App.tsx muss beim Verarbeiten von "tab-uebertragung-eingefuegt"
   * (siehe dort) den GENAU JETZT gültigen Index synchron lesen können, um
   * den Tab an der live angezeigten Stelle statt immer ans Ende einzufügen
   * – ein Lesen über den fremdVorschau-STATE wäre hier zu unzuverlässig
   * (React-State-Updates sind nicht synchron garantiert verfügbar).
   */
  fremdVorschauIndexRef?: React.RefObject<number | null>;
}

export function useTabDragUeberFenster({ leisteRef, tabsRef, fremdVorschauIndexRef }: Params) {
  const [fremdVorschau, setFremdVorschau] = useState<FremdVorschau | null>(null);

  // Eigenes Fenster-Label – wird JEDEM gesendeten Event als "quelle"
  // mitgegeben (siehe dragBewegungMelden/dragEndeMelden) UND beim Empfang
  // defensiv gegengeprüft (siehe unten): Sollte ein Fenster aus irgendeinem
  // Grund (Bug in fensterUnterCursorFinden, Label-Mismatch o. Ä.) sich
  // selbst als Ziel ansprechen, wird das Event hier zusätzlich ignoriert,
  // statt sich blind auf den Selbst-Ausschluss beim Senden zu verlassen.
  const eigenesLabelRef = useRef<string | null>(null);
  // Physische Bildschirmposition DIESES Fensters – bewusst über die native
  // Tauri-API (getCurrentWindow().outerPosition(), gleiche Quelle wie
  // fenster_alle_positionen in fenster.rs) statt über die DOM-Eigenschaft
  // window.screenX/screenY: Letztere liefert in dieser Tauri-WebView-Umgebung
  // konstant 0, unabhängig von der tatsächlichen Fensterposition – kein
  // Skalierungsfehler, sondern die Eigenschaft ist hier schlicht nicht
  // verlässlich verdrahtet. Wird zusätzlich bei jeder neuen Ziel-Session
  // aufgefrischt (siehe positionAuffrischenFallsNoetig unten), falls das
  // Fenster nach dem Mount verschoben wurde.
  const eigenePositionRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    import('@tauri-apps/api/window')
      .then((m) => {
        eigenesLabelRef.current = m.getCurrentWindow().label;
        m.getCurrentWindow()
          .outerPosition()
          .then((pos) => {
            eigenePositionRef.current = { x: pos.x, y: pos.y };
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

  function fremdVorschauSetzenUndSpiegeln(
    wert: FremdVorschau | null | ((prev: FremdVorschau | null) => FremdVorschau | null),
  ) {
    setFremdVorschau((prev) => {
      const neu = typeof wert === 'function' ? wert(prev) : wert;
      if (fremdVorschauIndexRef) fremdVorschauIndexRef.current = neu?.index ?? null;
      return neu;
    });
  }

  // -- Empfangs-Seite -------------------------------------------------------
  useEffect(() => {
    let ablBetreten: (() => void) | null = null;
    let ablBewegt: (() => void) | null = null;
    let ablVerlassen: (() => void) | null = null;
    // Stellt sicher, dass eigenePositionRef pro Ziel-Session GENAU EINMAL
    // aufgefrischt wird – ausgelöst durch "betreten" ODER (falls das aus
    // unbekanntem Grund mal ausbleibt, siehe Kommentar bei "tab-drag-bewegt"
    // unten) ersatzweise durch das erste "bewegt" danach. Zurückgesetzt bei
    // "verlassen", damit die nächste Ziel-Session wieder auffrischt.
    let positionAufgefrischt = false;
    function positionAuffrischenFallsNoetig() {
      if (positionAufgefrischt) return;
      positionAufgefrischt = true;
      import('@tauri-apps/api/window')
        .then((m) => m.getCurrentWindow().outerPosition())
        .then((pos) => {
          eigenePositionRef.current = { x: pos.x, y: pos.y };
        })
        .catch(() => {});
    }

    function indexFuerScreenX(screenX: number): number {
      const el = leisteRef.current;
      if (!el) return tabsRef.current.length;
      const skalierung = window.devicePixelRatio || 1;
      // eigenePositionRef.x ist physisch (native Tauri-API), screenX ist
      // logisch (e.screenX aus dem Quellfenster) – daher hier durch
      // skalierung teilen statt wie zuvor mit window.screenX (das ohnehin
      // immer 0 lieferte, siehe Kommentar bei eigenePositionRef oben).
      const eigenePosition = eigenePositionRef.current;
      const lokalX = screenX - (eigenePosition?.x ?? 0) / skalierung;
      const tabEls = Array.from(el.querySelectorAll<HTMLElement>('[data-tab-id]'));
      const rects = tabEls.map((t) => {
        const r = t.getBoundingClientRect();
        return { left: r.left, width: r.width, mitte: r.left + r.width / 2 };
      });
      let ergebnis = tabEls.length;
      for (let i = 0; i < tabEls.length; i++) {
        // rects hat exakt die Länge von tabEls (per map gebaut); Schleifen-
        // Invariante i < tabEls.length macht den Zugriff daher sicher.
        if (lokalX < rects[i]!.mitte) {
          ergebnis = i;
          break;
        }
      }
      return ergebnis;
    }

    // WICHTIG: bewusst getCurrentWebview().listen() statt des globalen
    // listen() aus '@tauri-apps/api/event'. Letzteres ist NICHT auf das
    // emitTo-Ziel beschränkt, sondern empfängt app-weit ALLE Events,
    // unabhängig davon, an welches Fenster sie per emitTo() adressiert
    // wurden (dokumentiertes Tauri-Verhalten, siehe
    // https://github.com/tauri-apps/tauri/issues/11379 – "emitTo emits
    // everywhere"). Das erklärte den beobachteten Bug: Quellfenster erhielt
    // sein eigenes emitTo(ZIEL, ...) zurück, und ob das eigentliche Ziel
    // reagierte, war vom Zufall abhängig. getCurrentWebview().listen()
    // liefert dagegen wirklich nur Events, die an DIESES Webview gerichtet
    // sind. Der "quelle"-Selbst-Check unten bleibt als zusätzliches
    // Sicherheitsnetz bestehen, ist mit dem korrekten Listen-Aufruf aber
    // eigentlich nicht mehr nötig.
    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) => {
        const webview = getCurrentWebview();

        function verarbeiteFremdDragEvent(
          payload: { zeile1: string; zeile2?: string; quelle: string | null },
          index: number | (() => number),
        ) {
          if (payload.quelle && payload.quelle === eigenesLabelRef.current) return;
          positionAuffrischenFallsNoetig();
          fremdVorschauSetzenUndSpiegeln({
            zeile1: payload.zeile1,
            zeile2: payload.zeile2,
            index: typeof index === 'function' ? index() : index,
          });
        }

        webview
          .listen<{ zeile1: string; zeile2?: string; quelle: string | null }>(
            'tab-drag-betreten',
            (e) => {
              // Eigene Fensterposition bei jeder neuen Ziel-Session auffrischen
              // (statt nur einmalig beim Mount, siehe eigenePositionRef oben) –
              // deckt den Fall ab, dass das Fenster nach dem Start noch
              // verschoben wurde. Bewusst NICHT bei jedem "tab-drag-bewegt"
              // (würde einen IPC-Call pro Frame bedeuten), sondern nur einmal pro
              // Session – ein Verschieben WÄHREND eines einzelnen Drags bleibt
              // ein akzeptiertes Restrisiko (siehe Tableiste.tsx:
              // fensterGeometrienRef zum selben Thema).
              // Start-Index grob am Ende der eigenen Tabs – der nächste
              // "tab-drag-bewegt"-Event (folgt in der Regel binnen eines Frames)
              // korrigiert das sofort auf die tatsächliche Cursor-Position.
              verarbeiteFremdDragEvent(e.payload, tabsRef.current.length);
            },
          )
          .then((fn) => {
            ablBetreten = fn;
          })
          .catch(() => {});

        webview
          .listen<{ screenX: number; zeile1: string; zeile2?: string; quelle: string | null }>(
            'tab-drag-bewegt',
            (e) => {
              // Bewusst NICHT von einem vorherigen "tab-drag-betreten" abhängig
              // (erzeugt fremdVorschau bei Bedarf selbst, statt nur einen
              // bestehenden Eintrag zu aktualisieren) – siehe Kommentar oben bei
              // "zeile1"/"zeile2" im Payload. Grund: in der Praxis beobachtet,
              // dass "tab-drag-betreten" ein Fenster manchmal gar nicht erreicht
              // (Ursache noch nicht abschließend geklärt, vermutlich
              // Registrierungs-Timing von webview.listen()), während
              // "tab-drag-bewegt" zuverlässig ankam. Damit ist "betreten" nur noch
              // eine (verzichtbare) Beschleunigung fürs allererste Erscheinen,
              // kein Single-Point-of-Failure mehr. Aus demselben Grund hier auch
              // die Positions-Auffrischung als Ersatzauslöser (siehe
              // positionAuffrischenFallsNoetig oben) – falls "betreten" ausbleibt,
              // übernimmt das erste "bewegt" danach.
              verarbeiteFremdDragEvent(e.payload, () => indexFuerScreenX(e.payload.screenX));
            },
          )
          .then((fn) => {
            ablBewegt = fn;
          })
          .catch(() => {});

        webview
          .listen<{ quelle: string | null } | null>('tab-drag-verlassen', () => {
            positionAufgefrischt = false;
            fremdVorschauSetzenUndSpiegeln(null);
          })
          .then((fn) => {
            ablVerlassen = fn;
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      ablBetreten?.();
      ablBewegt?.();
      ablVerlassen?.();
    };
    // Bewusst leeres Dependency-Array (gleicher Bugfix-Grund wie beim
    // tab-uebertragung-eingefuegt-Listener in App.tsx): leisteRef/tabsRef sind
    // Refs und daher innerhalb der Closure ohnehin immer aktuell – ein erneutes
    // An-/Abmelden wäre hier unnötig und würde nur das Risiko verlorener Events
    // in der kurzen Umschaltlücke schaffen.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Fensterübergreifende Drag-Listener bleiben bis Unmount angemeldet, um Übertragungsereignisse nicht in einer Ummeldelücke zu verlieren; Werte kommen aus Refs.
  }, []);

  // -- Sende-Seite ------------------------------------------------------
  const sendeKennungRef = useRef(0);
  const zielKennungenRef = useRef(new Map<string, number>());
  const aktuellesZielRef = useRef<string | null>(null);
  const ausstehenderFrameRef = useRef(false);
  const naechsteMeldungRef = useRef<{
    zielLabel: string | null;
    screenX: number;
    zeile1: string;
    zeile2?: string;
  } | null>(null);

  // Wird von Tableiste.tsx aus onMove bei JEDER Cursor-Bewegung während
  // eines laufenden Drags aufgerufen (auch während der Cursor noch im
  // eigenen Fenster ist – zielLabel ist dann null, siehe unten). Throttled
  // auf max. 1 emitTo-Nachricht pro Frame via requestAnimationFrame, damit
  // die IPC-Last während des Drags nicht mit jedem pointermove steigt.
  function dragBewegungMelden(
    zielLabel: string | null,
    screenX: number,
    zeile1: string,
    zeile2: string | undefined,
  ) {
    naechsteMeldungRef.current = { zielLabel, screenX, zeile1, zeile2 };
    if (ausstehenderFrameRef.current) return;
    ausstehenderFrameRef.current = true;

    const kennung = sendeKennungRef.current;
    requestAnimationFrame(() => {
      if (kennung !== sendeKennungRef.current) return;
      ausstehenderFrameRef.current = false;
      const meldung = naechsteMeldungRef.current;
      if (!meldung) return;

      import('@tauri-apps/api/event')
        .then(({ emitTo }) => {
          if (kennung !== sendeKennungRef.current) return;
          const vorheriges = aktuellesZielRef.current;
          if (meldung.zielLabel !== vorheriges) {
            if (vorheriges) {
              zielKennungenRef.current.delete(vorheriges);
              emitTo(vorheriges, 'tab-drag-verlassen', { quelle: eigenesLabelRef.current }).catch(
                () => {},
              );
            }
            if (meldung.zielLabel) {
              zielKennungenRef.current.set(meldung.zielLabel, kennung);
              emitTo(meldung.zielLabel, 'tab-drag-betreten', {
                zeile1: meldung.zeile1,
                zeile2: meldung.zeile2,
                quelle: eigenesLabelRef.current,
              }).catch(() => {});
            }
            aktuellesZielRef.current = meldung.zielLabel;
          } else if (meldung.zielLabel) {
            emitTo(meldung.zielLabel, 'tab-drag-bewegt', {
              screenX: meldung.screenX,
              zeile1: meldung.zeile1,
              zeile2: meldung.zeile2,
              quelle: eigenesLabelRef.current,
            }).catch(() => {});
          }
        })
        .catch(() => {});
    });
  }

  // Wird von Tableiste.tsx aus onUp aufgerufen – IMMER, unabhängig davon,
  // ob der Tab tatsächlich in ein anderes Fenster übernommen, in ein neues
  // Fenster herausgezogen oder der Drag einfach abgebrochen wurde. Räumt in
  // jedem Fall die Vorschau im zuletzt anvisierten Fenster auf. Ein Aufruf
  // ohne vorherigen dragBewegungMelden()-Aufruf ist ein No-op.
  function dragEndeVorbereiten() {
    const ziel = aktuellesZielRef.current;
    const kennung = sendeKennungRef.current++;
    aktuellesZielRef.current = null;
    naechsteMeldungRef.current = null;
    ausstehenderFrameRef.current = false;
    // Den bisherigen Zielstand vor der asynchronen Übernahme sichern. Ein
    // Folgezug erhält unabhängig davon seinen eigenen Senderzustand.
    return () => {
      if (!ziel) return;
      import('@tauri-apps/api/event')
        .then(({ emitTo }) => {
          // Über demselben Ziel gehört die Live-Lücke inzwischen dem Folgezug.
          if (zielKennungenRef.current.get(ziel) !== kennung) return;
          zielKennungenRef.current.delete(ziel);
          return emitTo(ziel, 'tab-drag-verlassen', { quelle: eigenesLabelRef.current });
        })
        .catch(() => {});
    };
  }

  return { fremdVorschau, dragBewegungMelden, dragEndeVorbereiten };
}
