// useFensterRestore.speichern.ts
//
// Laufendes (entprelltes) Speichern von Tab- und Geometrie-Zustand eines
// Hauptfensters sowie dessen Antwort auf die Beenden-Anfrage (siehe
// useBeendenAnfrage.ts): Speichern beenden, auf laufende
// Gesetz-Speichervorgänge einschließlich Datei-Importen warten (neue, etwa
// der Hintergrundaktualisierung, bis zum Abbruch anhalten), den Stand ein
// letztes Mal speichern und – anders als beim Schließen – Fensterzustand und
// Tabs BEHALTEN, damit die Sitzung beim nächsten Start wiederhergestellt wird.
// Nach einem Abbruch der Anfrage wird wieder laufend gespeichert.
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { Tab } from '@/lib/domain/appTypes';
import {
  speichereFensterZustand,
  hauptFensterGeometrieFuerRustSpeichern,
  letzteFensterGeometrieSpeichern,
} from '@/lib/persistenz/fenster/fenster.index';
import { beendenVorbereiten } from '@/lib/persistenz/gesetz/gesetz.index';
import { aktuelleGeometrieLesen } from './useFensterRestore.hilfen';
import { useBeendenAnfrage } from './useBeendenAnfrage';

export function useFensterZustandSpeichern({
  tabs,
  aktiverTabId,
  tabsRef,
  aktiverTabIdRef,
  fensterLabelRef,
  restoreErledigt,
  gemountet,
  uebernahmeFehlgeschlagenRef,
}: {
  tabs: Tab[];
  aktiverTabId: string | null;
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  fensterLabelRef: RefObject<string>;
  /** Erst danach gibt es einen eigenen Stand, der gespeichert werden darf. */
  restoreErledigt: boolean;
  gemountet: RefObject<boolean>;
  uebernahmeFehlgeschlagenRef: RefObject<boolean>;
}) {
  const speicherTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speichernGesperrtRef = useRef(false);

  const beendeFensterSpeichern = useCallback(() => {
    speichernGesperrtRef.current = true;
    if (speicherTimerRef.current !== null) clearTimeout(speicherTimerRef.current);
    speicherTimerRef.current = null;
  }, []);

  const fensterJetztSpeichern = useCallback(
    async (signal?: AbortSignal) => {
      if (speichernGesperrtRef.current || signal?.aborted) return;
      const geometrie = await aktuelleGeometrieLesen();
      // Auch eine bereits laufende Geometrieabfrage kann erst nach dem
      // Schließen/Unmount zurückkehren. Den entfernten Eintrag nicht neu anlegen.
      if (speichernGesperrtRef.current || signal?.aborted) return;
      const fensterLabel = fensterLabelRef.current;
      function sitzungSpeichern() {
        const aktuelleTabs = tabsRef.current;
        speichereFensterZustand(
          fensterLabel,
          {
            tabs: aktuelleTabs.flatMap((t) =>
              t.gesetzesreferenz ? [{ gesetzesreferenz: referenzVon(t.gesetzesreferenz) }] : [],
            ),
            aktiverIndex: aktuelleTabs.findIndex((t) => t.id === aktiverTabIdRef.current),
            geometrie,
          },
          { fehlerWeitergeben: signal !== undefined },
        );
      }

      if (!signal) sitzungSpeichern();
      if (fensterLabel === 'main') {
        await hauptFensterGeometrieFuerRustSpeichern(geometrie);
      }
      if (!signal?.aborted) await letzteFensterGeometrieSpeichern(geometrie);
      if (signal && !signal.aborted && !speichernGesperrtRef.current) {
        // Bis zum Abschluss der Geometriespeicherung bleiben Tabänderungen möglich.
        sitzungSpeichern();
        beendeFensterSpeichern();
      }
    },
    [tabsRef, aktiverTabIdRef, fensterLabelRef, beendeFensterSpeichern],
  );

  const planeFensterSpeichern = useCallback(() => {
    if (speichernGesperrtRef.current) return;
    if (speicherTimerRef.current) clearTimeout(speicherTimerRef.current);
    speicherTimerRef.current = setTimeout(() => void fensterJetztSpeichern(), 250);
  }, [fensterJetztSpeichern]);

  useBeendenAnfrage(async (signal) => {
    signal.addEventListener(
      'abort',
      () => {
        if (!gemountet.current) return;
        speichernGesperrtRef.current = false;
        if (restoreErledigt) planeFensterSpeichern();
      },
      { once: true },
    );

    await beendenVorbereiten(signal);
    if (signal.aborted) return false;
    if (restoreErledigt && !uebernahmeFehlgeschlagenRef.current) {
      await fensterJetztSpeichern(signal);
    } else {
      beendeFensterSpeichern();
    }
    return !signal.aborted;
  });

  useEffect(() => {
    speichernGesperrtRef.current = false;
    return () => beendeFensterSpeichern();
  }, [beendeFensterSpeichern]);

  // Speichert laufend (leicht entprellt), welche Tabs und welche Geometrie
  // dieses Fenster hat – damit beim nächsten App-Start alles wieder genauso
  // aussieht. Erst NACH abgeschlossener Wiederherstellung aktiv, sonst würde
  // der allererste Render (noch der Initial-Leertab aus useAppTabs.ts) den
  // gerade erst geladenen Zustand überschreiben.
  useEffect(() => {
    if (!restoreErledigt) return;
    planeFensterSpeichern();
  }, [restoreErledigt, tabs, aktiverTabId, planeFensterSpeichern]);

  // Reines Verschieben/Resizen ändert weder tabs noch aktiverTabId und würde
  // den obigen Effekt daher nie auslösen – ohne diesen Listener ginge eine neue
  // Größe/Position verloren, solange währenddessen kein Tab gewechselt wird.
  useEffect(() => {
    if (!restoreErledigt) return;
    let entferneResize: (() => void) | undefined;
    let entferneMove: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const fenster = getCurrentWindow();
        entferneResize = await fenster.onResized(() => planeFensterSpeichern());
        entferneMove = await fenster.onMoved(() => planeFensterSpeichern());
      } catch {
        /* nicht in Tauri-Umgebung */
      }
    })();
    return () => {
      entferneResize?.();
      entferneMove?.();
    };
  }, [restoreErledigt, planeFensterSpeichern]);

  return { beendeFensterSpeichern };
}
