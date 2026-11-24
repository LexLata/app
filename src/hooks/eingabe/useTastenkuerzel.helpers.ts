// useTastenkuerzel.helpers.ts
// Aus useTastenkuerzel.ts ausgelagerte Tastenkürzel-Erkennungsfunktionen
// (Cognitive-Complexity-Reduktion des dortigen keydown-Handlers).
//
// KeyboardEvent wird überall als Pick<...> typisiert (nur die tatsächlich
// gelesenen Felder) statt als volles DOM-Interface – macht die Funktionen
// mit einfachen Objektliteralen testbar, ohne echtes KeyboardEvent/jsdom.
// DOM-Zugriffe (document.querySelector/activeElement), die sich nicht ohne
// echtes DOM prüfen lassen, werden per Dependency Injection (Funktions-
// Parameter statt direktem Aufruf) hereingereicht – siehe
// istUeberlagerungAktiv/istEingabefeldFokussiert unten.

import { flushSync } from 'react-dom';
import { istErlaubt, type EinfuehrungsAktion } from '@/lib/domain/einfuehrung/einfuehrung.index';
import { findeTastenkuerzel } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { gesetzesreferenzSchluessel, referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import type { Tab, AktivesOverlay } from '@/lib/domain/appTypes';
import {
  type Gesetzeskurzbefehl,
  findeGesetzFuerEvent,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';

type TastenkuerzelEvent = Pick<
  KeyboardEvent,
  'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'key' | 'code' | 'preventDefault'
>;

// ---------------------------------------------------------------------------
// Einführungs-Sperre (siehe Guard-Kommentar in useTastenkuerzel.ts)
// ---------------------------------------------------------------------------

/** Die Katalogbelegung erkennt die Taste; das Einführungsmodul erlaubt die Aktion. */
export function istTastenkuerzelWaehrendEinfuehrungErlaubt(
  e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'key' | 'code'>,
  teilaktion: number,
): boolean {
  const aktionen: Record<string, EinfuehrungsAktion> = {
    oeffnen: 'oeffnen-overlay-zeigen',
    'favorit-speichern': 'favorit-speichern',
    'lesezeichen-speichern': 'lesezeichen-speichern',
  };
  const treffer = findeTastenkuerzel(e, Object.keys(aktionen));
  const aktion = treffer && aktionen[treffer.id];
  if (aktion) return istErlaubt(teilaktion, aktion);
  if (/^[0-9§]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey)
    return istErlaubt(teilaktion, 'oeffnen-overlay-zeigen');
  if (e.altKey && !e.metaKey && !e.ctrlKey && /^Digit[0-9]$/.test(e.code))
    return istErlaubt(teilaktion, 'lesezeichen-aufrufen');
  // Der Sonderhandler akzeptiert bei Klappstufen weiterhin auch Umschalt.
  const klappstufe = findeTastenkuerzel(
    {
      key: e.key,
      code: e.code,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey && !e.metaKey,
      shiftKey: false,
      altKey: e.altKey,
    },
    ['klappstufe-zuklappen', 'klappstufe-aufklappen'],
  );
  return (
    klappstufe !== undefined &&
    (istErlaubt(teilaktion, 'alles-zuklappen') || istErlaubt(teilaktion, 'alles-aufklappen'))
  );
}

// ---------------------------------------------------------------------------
// Speziellere Tastenkürzel mit Sonderlogik (Ausnahmen vom uniformen Muster oben:
// bedingtes preventDefault, bedingtes Durchreichen an den nächsten Handler,
// o.ä.) – je eine eigene Funktion statt verschachtelter if-Blöcke in
// useTastenkuerzel.ts. Jede gibt zurück, ob sie das Event verarbeitet hat
// (h() in useTastenkuerzel.ts kehrt in diesem Fall sofort zurück).
// ---------------------------------------------------------------------------

/** ⌥+Ziffer / ⌥⇧+Ziffer: Lesezeichen öffnen. */
export function behandleLesezeichenZiffernTastenkuerzel(
  e: TastenkuerzelEvent,
  lesezeichenEintraegeRef: RefObject<{ bezeichnung: string; gesetz: Gesetzesreferenz }[]>,
  handleLesezeichenOeffnenRef: RefObject<(bezeichnung: string, gesetz: Gesetzesreferenz) => void>,
  seitenleistenTastenkuerzel: boolean,
): boolean {
  if (!seitenleistenTastenkuerzel) return false;
  if (!e.altKey || e.metaKey || e.ctrlKey) return false;
  const treffer = e.code.match(/^Digit([0-9])$/);
  if (!treffer) return false;
  const d = parseInt(treffer[1]!, 10);
  const basis = e.shiftKey ? 10 : 0;
  const index = basis + (d === 0 ? 9 : d - 1);
  const eintrag = lesezeichenEintraegeRef.current[index];
  if (eintrag) {
    e.preventDefault();
    handleLesezeichenOeffnenRef.current(eintrag.bezeichnung, eintrag.gesetz);
  }
  return true;
}

/** ⌘1–⌘9 / Strg+1–9: Tab nach Position wählen. */
export function behandleTabPositionsTastenkuerzel(
  e: TastenkuerzelEvent,
  tabsRef: RefObject<Tab[]>,
  setAktiverTabId: Dispatch<SetStateAction<string | null>>,
): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || !/^[1-9]$/.test(e.key)) return false;
  const aktuelleTabs = tabsRef.current;
  if (aktuelleTabs.length === 0) return true;
  e.preventDefault();
  const ziel =
    e.key === '9'
      ? aktuelleTabs[aktuelleTabs.length - 1]
      : (aktuelleTabs[Number(e.key) - 1] ?? aktuelleTabs[aktuelleTabs.length - 1]);
  if (ziel) setAktiverTabId(ziel.id);
  return true;
}

/** ⌃Tab / ⌃⇧Tab: nächster / vorheriger Tab. */
export function behandleTabWechselTastenkuerzel(
  e: TastenkuerzelEvent,
  tabsRef: RefObject<Tab[]>,
  aktiverTabIdRef: RefObject<string | null>,
  setAktiverTabId: Dispatch<SetStateAction<string | null>>,
): boolean {
  if (!e.ctrlKey || e.metaKey || e.altKey || e.key !== 'Tab') return false;
  const aktuelleTabs = tabsRef.current;
  if (aktuelleTabs.length <= 1) return true;
  e.preventDefault();
  const idx = aktuelleTabs.findIndex((t) => t.id === aktiverTabIdRef.current);
  const naechsterIdx = e.shiftKey
    ? (idx - 1 + aktuelleTabs.length) % aktuelleTabs.length
    : (idx + 1) % aktuelleTabs.length;
  setAktiverTabId(aktuelleTabs[naechsterIdx]!.id);
  return true;
}

/**
 * ⌥← / ⌥→: im Verlauf des aktiven Tabs zurück/vorwärts navigieren. Die
 * eigentliche Navigation übernimmt verlaufSchrittUndOeffnen in App.tsx – hier
 * nur die tastaturspezifischen Vorbedingungen (kein Overlay offen, kein
 * Eingabefeld fokussiert). istUeberlagerungAktiv/istEingabefeldFokussiert
 * werden injiziert (DOM-Zugriff), damit diese Funktion selbst ohne echtes DOM
 * testbar bleibt.
 */
export function behandleVerlaufNavigationTastenkuerzel(
  e: TastenkuerzelEvent,
  verlaufSchrittUndOeffnenRef: RefObject<(richtung: 'zurueck' | 'vorwaerts') => void>,
  istUeberlagerungAktiv: () => boolean,
  istEingabefeldFokussiert: () => boolean,
): boolean {
  if (e.metaKey || e.ctrlKey || e.shiftKey || !e.altKey) return false;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  if (istUeberlagerungAktiv() || istEingabefeldFokussiert()) return true;
  e.preventDefault();
  verlaufSchrittUndOeffnenRef.current(e.key === 'ArrowLeft' ? 'zurueck' : 'vorwaerts');
  return true;
}

/**
 * ⌘← / ⌘→ (Strg unter Windows/Linux): Klappstufen-Navigation im gesamten
 * Gesetz (siehe useKlappstufenNavigation.ts). zuklappen/aufklappen sind
 * No-ops, solange kein Gesetz offen ist (App.tsx).
 */
export function behandleKlappstufenTastenkuerzel(
  e: TastenkuerzelEvent,
  zuklappenRef: RefObject<() => void>,
  aufklappenRef: RefObject<() => void>,
  istUeberlagerungAktiv: () => boolean,
  istEingabefeldFokussiert: () => boolean,
): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  if (istUeberlagerungAktiv() || istEingabefeldFokussiert()) return true;
  e.preventDefault();
  (e.key === 'ArrowLeft' ? zuklappenRef : aufklappenRef).current();
  return true;
}

/** Ziffer oder §-Zeichen → Öffnen-Overlay öffnen (nur außerhalb von Eingabefeldern). */
export function behandleOeffnenZifferTastenkuerzel(
  e: TastenkuerzelEvent,
  setOeffnenOverlayInitial: Dispatch<SetStateAction<string>>,
  setAktivesOverlay: Dispatch<SetStateAction<AktivesOverlay | null>>,
  istEingabefeldFokussiert: () => boolean,
): boolean {
  if (!/^[0-9§]$/.test(e.key) || e.metaKey || e.ctrlKey || e.altKey) return false;
  // Bewusst false statt true: bei fokussiertem Eingabefeld soll die Ziffer
  // ganz normal eingegeben werden können UND das Event fällt durch an den
  // nächsten Handler (benutzerdefinierte Gesetzeskurzbefehle) – anders als bei den
  // Guards oben, die das Event bei erfülltem Vorbedingungs-Ast immer als
  // "verarbeitet" betrachten.
  if (istEingabefeldFokussiert()) return false;
  e.preventDefault();
  // Das Feld muss vor der nächsten Taste eingehängt und fokussiert sein.
  // Die öffnende Taste ist bereits verhindert und wird nur als Startwert gesetzt.
  flushSync(() => {
    setOeffnenOverlayInitial(e.key);
    setAktivesOverlay('oeffnen');
  });
  return true;
}

/** Benutzerdefinierte Gesetzeskurzbefehle (siehe gesetzeskurzbefehlSpeicher.ts). */
export function behandleGesetzeskurzbefehl(
  e: TastenkuerzelEvent,
  gesetzeskurzbefehleRef: RefObject<Record<string, Gesetzeskurzbefehl>>,
  gesetzeRef: RefObject<LesbarerSuchverzeichniseintrag[]>,
  oeffnenRef: RefObject<ReturnType<typeof useGesetzOeffnen>['gesetzesreferenzOeffnen']>,
): void {
  // findeGesetzFuerEvent liest nur key/metaKey/ctrlKey/shiftKey/altKey (siehe
  // dort) – alles bereits in TastenkuerzelEvent enthalten; der Cast überbrückt nur,
  // dass die Funktion (außerhalb des Scopes dieser Datei) noch den vollen
  // KeyboardEvent-Typ erwartet.
  const schluessel = findeGesetzFuerEvent(e as KeyboardEvent, gesetzeskurzbefehleRef.current);
  if (!schluessel) return;
  const gesetz = gesetzeRef.current.find((g) => gesetzesreferenzSchluessel(g) === schluessel);
  if (!gesetz) return;
  e.preventDefault();
  // 'aktiver-tab': springt zu vorhandenem Tab, ersetzt sonst aktiven – kein
  // Norm-Sprungziel, da Gesetzeskurzbefehle keine Norm adressieren.
  oeffnenRef.current(
    { gesetzesreferenz: referenzVon(gesetz), nurInstalliert: true },
    'aktiver-tab',
  );
}
