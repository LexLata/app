// useEinfuehrungsAblauf.ts
//
// Bündelt die komplette Ablaufsteuerung der Einführung (useEinfuehrung.ts),
// die vorher direkt in App.tsx lag – aus App.tsx ausgelagert, damit dort nur
// noch der Hook-Aufruf plus die Weiterreichung der Rückgabewerte an JSX/
// useTastenkuerzel/useMenueEvents steht (siehe App.tsx-Kopfkommentar:
// "App.tsx bleibt dünn").
//
// Die Fortschritts-ERKENNUNG bleibt bewusst hier (nicht in useEinfuehrung.ts
// selbst, siehe dortiger Kopfkommentar) – dieser Hook ist die Stelle, die
// alle dafür nötigen Signale (favoritenStatus, tabZustand, aktivesOverlay)
// von App.tsx entgegennimmt.

import type { useAppTabs as Tabsteuerung } from '@/hooks/tabs/useAppTabs';
import { istErlaubt } from '@/lib/domain/einfuehrung/einfuehrung.index';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { findeFavoritfaehigeNorm } from '@/lib/domain/norm/norm.index';
import type {
  ElementOeffnenParams,
  AktivesOverlay,
  EinklappZustand,
  Tab,
} from '@/lib/domain/appTypes';
import { useEinfuehrung } from '@/hooks/einfuehrung/useEinfuehrung';
import { useAktuellerWertRef } from '@/hooks/utils/useAktuellerWertRef';

interface EinfuehrungsAblaufOptionen {
  favoritenStatus: { istAktuellFavorit: boolean; favoritenleisteSichtbar: boolean };
  tabZustand: EinklappZustand | undefined;
  aktivesOverlay: AktivesOverlay | null;
  holeTabGesetz: ReturnType<typeof Tabsteuerung>['holeTabGesetz'];
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>;
  handleFavoritSpeichern: () => Promise<boolean>;
  handleLesezeichenSpeichern: () => Promise<boolean>;
  elementOeffnen: (params: ElementOeffnenParams) => void;
  leistenTauschen: boolean;
  minimalistischerModus: boolean;
}

export function useEinfuehrungsAblauf({
  favoritenStatus,
  holeTabGesetz,
  tabsRef,
  aktiverTabIdRef,
  einklappZustandRef,
  tabZustand,
  aktivesOverlay,
  handleFavoritSpeichern,
  handleLesezeichenSpeichern,
  elementOeffnen,
  leistenTauschen,
  minimalistischerModus,
}: EinfuehrungsAblaufOptionen) {
  const einfuehrung = useEinfuehrung();
  const {
    aktiv: einfuehrungAktiv,
    teilaktion: einfuehrungTeilaktion,
    fertig: einfuehrungFertig,
    appName: einfuehrungAppName,
    naechsteTeilaktion: einfuehrungNaechsteTeilaktion,
    beenden: einfuehrungBeenden,
    neuStarten: einfuehrungNeuStarten,
    sperren: einfuehrungSperren,
  } = einfuehrung;

  // Suchfehler und Sprechblase teilen diesen flüchtigen Zustand; kein Persistieren.
  const [keineVerbindung, setKeineVerbindung] = useState(false);
  useEffect(() => {
    setKeineVerbindung(false);
  }, [einfuehrungAktiv, einfuehrungTeilaktion, aktivesOverlay]);

  // Ohne diese Refs würden ⇧⌘D/⌘D (useTastenkuerzel.ts) und die
  // entsprechenden Menüpunkte (useMenueEvents.ts) die Einführung nie
  // voranschalten, weil beide ihre Handler nur einmal mit leerem
  // Deps-Array registrieren.
  const einfuehrungAktivRef = useAktuellerWertRef(einfuehrungAktiv);
  const einfuehrungTeilaktionRef = useAktuellerWertRef(einfuehrungTeilaktion);

  const favoritenStatusRef = useRef(favoritenStatus);
  useEffect(() => {
    favoritenStatusRef.current = favoritenStatus;
  }, [favoritenStatus]);

  // Nur der laufende Aufruf besitzt diese Sperre; Normwechsel bleiben möglich.
  const speicherungLaeuftRef = useRef(false);
  const ablaufStandRef = useRef(0);
  useEffect(() => {
    ablaufStandRef.current += 1;
  }, [einfuehrungAktiv, einfuehrungTeilaktion]);

  const aktiveNormIdentitaet = useCallback(() => {
    const tab = tabsRef.current.find((t) => t.id === aktiverTabIdRef.current);
    const tabGesetz = holeTabGesetz(tab);
    if (!tab?.gesetzesreferenz || !tabGesetz) return undefined;
    const referenz = gesetzesreferenzSchluessel(tab.gesetzesreferenz);
    const aktivesElementId = einklappZustandRef.current[tab.id + '-' + referenz]?.aktivesElementId;
    const element = tabGesetz.elemente.find((e) => e.data.id === aktivesElementId);
    return element ? JSON.stringify([referenz, element.data.xmlId]) : undefined;
  }, [holeTabGesetz, tabsRef, aktiverTabIdRef, einklappZustandRef]);

  const speichernMitErfolgspruefung = useCallback(
    async (art: 'favorit' | 'lesezeichen') => {
      if (!einfuehrungAktivRef.current) {
        await (art === 'favorit' ? handleFavoritSpeichern() : handleLesezeichenSpeichern());
        return;
      }
      if (speicherungLaeuftRef.current) return;
      speicherungLaeuftRef.current = true;
      const aktiv = einfuehrungAktivRef.current;
      const teilaktion = einfuehrungTeilaktionRef.current;
      const stand = ablaufStandRef.current;
      const ziel = aktiveNormIdentitaet();
      const warFavorit = favoritenStatusRef.current.istAktuellFavorit;
      try {
        const erfolg = await (art === 'favorit'
          ? handleFavoritSpeichern()
          : handleLesezeichenSpeichern());
        if (
          !erfolg ||
          !aktiv ||
          !einfuehrungAktivRef.current ||
          einfuehrungTeilaktionRef.current !== teilaktion ||
          ablaufStandRef.current !== stand ||
          !ziel ||
          aktiveNormIdentitaet() !== ziel
        )
          return;
        if (art === 'favorit' && teilaktion === 2) {
          einfuehrungNaechsteTeilaktion(warFavorit ? 4 : undefined);
        } else if (
          (art === 'favorit' && teilaktion === 3 && warFavorit) ||
          (art === 'lesezeichen' && teilaktion === 4)
        ) {
          einfuehrungNaechsteTeilaktion();
        }
      } finally {
        speicherungLaeuftRef.current = false;
      }
    },
    [
      handleFavoritSpeichern,
      handleLesezeichenSpeichern,
      aktiveNormIdentitaet,
      einfuehrungAktivRef,
      einfuehrungTeilaktionRef,
      einfuehrungNaechsteTeilaktion,
    ],
  );
  const favoritSpeichernMitEinfuehrung = useCallback(
    () => speichernMitErfolgspruefung('favorit'),
    [speichernMitErfolgspruefung],
  );
  const lesezeichenSpeichernMitEinfuehrung = useCallback(
    () => speichernMitErfolgspruefung('lesezeichen'),
    [speichernMitErfolgspruefung],
  );

  // Teilaktion 0 → 1: Öffnen-Overlay geöffnet.
  useEffect(() => {
    if (einfuehrungAktiv && einfuehrungTeilaktion === 0 && aktivesOverlay === 'oeffnen') {
      einfuehrungNaechsteTeilaktion();
    }
  }, [aktivesOverlay, einfuehrungAktiv, einfuehrungTeilaktion, einfuehrungNaechsteTeilaktion]);

  // Teilaktion 1 → 2: Gesetz über das Öffnen-Overlay geöffnet. Bewusst
  // aktionsbasiert direkt im Navigations-Callback (siehe
  // onOeffnenNavigation unten), NICHT über einen auf gesetzOffen
  // wartenden Effect: war schon vor Start der Einführung ein Gesetz offen
  // (z. B. wiederhergestellte Tabs) oder öffnet die Suche eine Norm im
  // BEREITS aktiven Gesetz (bloße Ziffern-Eingabe), ändert sich gesetzOffen
  // gar nicht erst (bleibt durchgehend true) – ein Effect mit gesetzOffen
  // in den Abhängigkeiten hätte die Weiterschaltung dann nie bemerkt, weil
  // ein reines Ref-Signal (ohne begleitende State-Änderung) keinen
  // Re-Render/erneuten Effect-Lauf auslöst.
  const onOeffnenNavigation = useCallback(() => {
    if (einfuehrungAktivRef.current && einfuehrungTeilaktionRef.current === 1)
      einfuehrungNaechsteTeilaktion();
  }, [einfuehrungNaechsteTeilaktion, einfuehrungAktivRef, einfuehrungTeilaktionRef]);

  // Die Einführung benötigt auch bei „GG“ oder einer Präambel ein speicherbares Ziel.
  const elementOeffnenFuerSuche = useCallback(
    (params: ElementOeffnenParams) => {
      if (
        einfuehrungAktivRef.current &&
        istErlaubt(einfuehrungTeilaktionRef.current, 'suche-navigieren') &&
        params.gesetz
      ) {
        const xmlId =
          findeFavoritfaehigeNorm(params.gesetz, params.xmlId) ??
          params.gesetz.elemente.find((e) => e.typ === 'norm')?.data.xmlId;
        if (xmlId) {
          elementOeffnen({ ...params, xmlId });
          return;
        }
      }
      elementOeffnen(params);
    },
    [elementOeffnen, einfuehrungAktivRef, einfuehrungTeilaktionRef],
  );

  // Teilaktion 6 (global zuklappen) / Teilaktion 7 (global aufklappen): beide
  // über eine bei Teilaktion-Eintritt erfasste Baseline-Größe
  // (eingeklappteUeberschriften.size + eingeklappteNormen.size), verglichen in
  // meldeEinklappAenderung (von App.tsx aus dem ohnehin vorhandenen
  // onEinklappZustandChange-Callback von Gesetzestextansicht aufgerufen). Zwei
  // Gründe gegen die frühere kannZuklappen/kannAufklappen-Voll-
  // ständigkeits-Prüfung:
  // 1. Sie schaltete erst weiter, wenn WIRKLICH alles ein-/aufgeklappt war
  //    (mehrere Klicks nötig) – der erste Klick (z. B. "alle Normtexte
  //    eingeklappt") wurde nicht erkannt.
  // 2. Sie reagierte nicht auf ⌘←/⌘→, weil diese Tastenkürzel den
  //    zuklappen/aufklappen-Callback intern in useKlappstufenNavigation.ts
  //    aufrufen, nicht den Button-Handler.
  // Der Baseline-Vergleich löst beides: er reagiert auf die tatsächliche
  // Zustandsänderung (egal ob per Klick oder Kurzbefehl ausgelöst) und
  // bereits beim ersten Teilaktion, der die erfasste Baseline über-/
  // unterschreitet. Teilaktion 5 hinterlässt beim Eintritt in Teilaktion 6 schon
  // ein eingeklapptes Element – ohne Baseline (einfach ">0" prüfen) wäre
  // Teilaktion 6 wie zuvor Teilaktion 2 sofort übersprungen worden.
  const einfuehrungKlappBasisRef = useRef(0);
  const erfasseKlappBasis = useEffectEvent(() => {
    einfuehrungKlappBasisRef.current =
      (tabZustand?.ueberschriften.size ?? 0) + (tabZustand?.normen.size ?? 0);
  });
  useEffect(() => {
    if (!einfuehrungAktiv || (einfuehrungTeilaktion !== 6 && einfuehrungTeilaktion !== 7)) return;
    erfasseKlappBasis();
  }, [einfuehrungAktiv, einfuehrungTeilaktion]);

  // Teilaktion 5/6/7: von App.tsx direkt aus dem onEinklappZustandChange-Prop
  // von Gesetzestextansicht aufgerufen (dort lebt bereits die restliche
  // Verlaufs-/Aktivierungs-Logik, die nichts mit der Einführung zu tun
  // hat).
  const meldeEinklappAenderung = useCallback(
    (groesse: number) => {
      if (!einfuehrungAktiv) return;
      if (einfuehrungTeilaktion === 5 && groesse > 0) {
        einfuehrungNaechsteTeilaktion();
      } else if (einfuehrungTeilaktion === 6 && groesse > einfuehrungKlappBasisRef.current) {
        einfuehrungNaechsteTeilaktion();
      } else if (einfuehrungTeilaktion === 7 && groesse < einfuehrungKlappBasisRef.current) {
        einfuehrungNaechsteTeilaktion();
      }
    },
    [einfuehrungAktiv, einfuehrungTeilaktion, einfuehrungNaechsteTeilaktion],
  );

  // Während der Einführung erzwungenes Standardlayout (siehe
  // Konversationsvorgabe: unabhängig von zuvor gewählten Einstellungen).
  const leistenTauschenEffektiv = einfuehrungAktiv ? false : leistenTauschen;
  const minimalistischerModusEffektiv = einfuehrungAktiv ? false : minimalistischerModus;

  // Buttons, die im jeweils aktuellen Einführungs-Teilaktion anklickbar sein
  // dürfen (alle anderen bleiben gesperrt – siehe Lesezeichenleiste.tsx).
  // Bereits hier auf undefined reduziert (statt roh + Ternary in App.tsx),
  // damit App.tsx die Prop direkt durchreichen kann.
  const einfuehrungErlaubtFuerUI = einfuehrungAktiv
    ? {
        suche: istErlaubt(einfuehrungTeilaktion, 'oeffnen-overlay-zeigen'),
        favorit: istErlaubt(einfuehrungTeilaktion, 'favorit-speichern'),
        lesezeichen: istErlaubt(einfuehrungTeilaktion, 'lesezeichen-speichern'),
        zuklappen: istErlaubt(einfuehrungTeilaktion, 'alles-zuklappen'),
        aufklappen: istErlaubt(einfuehrungTeilaktion, 'alles-aufklappen'),
      }
    : undefined;

  return {
    einfuehrungTeilaktionFuerSuche: einfuehrungAktiv ? einfuehrungTeilaktion : undefined,
    onKeineVerbindung: setKeineVerbindung,
    keineVerbindung,
    einfuehrungAktiv,
    einfuehrungTeilaktion,
    einfuehrungFertig,
    einfuehrungAppName,
    einfuehrungBeenden,
    einfuehrungNeuStarten,
    einfuehrungAktivRef,
    einfuehrungTeilaktionRef,
    favoritSpeichernMitEinfuehrung,
    lesezeichenSpeichernMitEinfuehrung,
    elementOeffnenFuerSuche,
    onOeffnenNavigation,
    meldeEinklappAenderung,
    leistenTauschenEffektiv,
    minimalistischerModusEffektiv,
    einfuehrungErlaubtFuerUI,
    // Für Gesetzestextansicht.tsx: dort weiterhin direkt gebraucht (undefined
    // außerhalb der Einführung, siehe Gesetzestextansicht.types.ts).
    einfuehrungSperrenFuerGesetzestextansicht: einfuehrungAktiv ? einfuehrungSperren : undefined,
    einfuehrungFavoritErlaubtFuerGesetzestextansicht:
      !einfuehrungAktiv || istErlaubt(einfuehrungTeilaktion, 'favorit-speichern'),
  };
}
