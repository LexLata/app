// useUiGroesse.ts
//
// Verwaltet die Einstellung "Größe der Bedienelemente" (Einstellungen.tsx):
// klein/normal/groß.
//
// ANSATZ (Schritt B, ersetzt den ursprünglich geplanten, nie fertig
// verdrahteten CSS-`zoom`-Ansatz – dessen Kommentar behauptete zudem
// fälschlich zuverlässige WebView2-Unterstützung; tatsächlicher Grund für
// die Umstellung war gerade UMGEKEHRT deren Unzuverlässigkeit auf
// WebView2/Windows): reiner Zahlenfaktor (UI_SKALIERUNG_WERTE), der beim
// LESEN der textRollen-/iconGroessen-Werte multiplikativ einfließt
// (Basis-px * Faktor, einmal gerundet – siehe useTextRollen()/
// useIconGroessen() in textRollen.ts). Kein zoom, keine CSS-Variable, die
// irgendwo per calc() aufgelöst werden müsste – jede Verwendungsstelle
// bekommt bereits fertig skalierte, konkrete Zahlen.
//
// WARUM EIN CONTEXT: main.tsx rendert je nach Tauri-Fenster-Label einen von
// mehreren, komplett GETRENNTEN React-Roots (App, VerweismarkierungFenster,
// KommentarFenster, MarkierungskonfliktFenster, EinstellungenFenster). Ein
// einzelner Provider in App.tsx würde die Hilfsfenster nicht erreichen.
// UiGroesseProvider wird deshalb in JEDER dieser 5 Root-Komponenten separat
// eingehängt – jede Instanz liest denselben localStorage-Key über
// useUiGroesse() und bleibt dank des in useLocalStorageState bereits
// vorhandenen storage-Event-Syncs mit den anderen Fenstern konsistent
// (gleiches, bereits etabliertes Muster wie useFarbschema() heute schon in
// mehreren Fenstern aufgerufen wird). MobileApp bindet den Provider NICHT
// ein: Mobile nutzt textRollen/iconGroessen aktuell an keiner Stelle.
//
// WICHTIG – Gesetzestext bleibt unabhängig: der Gesetzestext-Bereich
// (Gesetzestextansicht.tsx) hat mit useTextDarstellung.ts eine EIGENE,
// unabhängige Schriftgrößen-Einstellung und wird von diesem Faktor NICHT
// berührt – useTextRollen()/useIconGroessen() betreffen ausschließlich
// UI-Chrome (Overlays, Fenster, Leisten).
//
// Warum weiterhin drei feste Stufen statt freiem Faktor: bei sehr extremen
// Werten können Layouts mit festen px-Breiten (z.B. TEXT_SPALTE_BREITE,
// feste Overlay-Breiten) unschön wirken; die drei Stufen wurden bewusst
// moderat gewählt (0.9/1/1.15).

import { UI_GROESSE_KEY } from '@/lib/einstellungen/einstellungen.index';
import { createContext, useContext } from 'react';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export type UiGroesse = 'klein' | 'normal' | 'gross';
export const UI_SKALIERUNG_WERTE: Record<UiGroesse, number> = {
  klein: 0.9,
  normal: 1,
  gross: 1.15,
};

export function useUiGroesse() {
  const [uiGroesse, setUiGroesse] = useLocalStorageState<UiGroesse>(UI_GROESSE_KEY, 'normal', {
    parse: (roh) => roh as UiGroesse,
  });

  return { uiGroesse, setUiGroesse };
}

// Reiner Zahlenfaktor + die Einstellung selbst, global per Context
// verfügbar (siehe Kommentar oben, "WARUM EIN CONTEXT").
//
// WICHTIG: uiGroesse/setUiGroesse müssen TEIL DES CONTEXT sein, nicht nur
// faktor – Grund: EinstellungenFenster.tsx braucht den rohen Wert+Setter
// für das Dropdown UND hat (wie jedes Fenster) einen UiGroesseProvider im
// selben Fenster. Würde EinstellungenFenster.tsx dafür ein zweites Mal
// useUiGroesse() aufrufen (statt aus dem Context zu lesen), entstünden ZWEI
// unabhängige Hook-Instanzen im selben Fenster – die per storage-Event
// synchronisieren sich aber NUR fensterübergreifend (siehe
// useLocalStorageState.ts), nie innerhalb desselben Fensters. Das Dropdown
// hätte sich dann zwar selbst aktualisiert, der umgebende
// UiGroesseProvider (und damit alle textRollen/iconGroessen-Verwendungen
// im selben Fenster) aber nicht – genau der Bug, den dieses Konstrukt
// verhindert. Default-Werte hier sind nur der Fallback ohne Provider.
interface UiGroesseKontextWert {
  uiGroesse: UiGroesse;
  setUiGroesse: (wert: UiGroesse) => void;
  faktor: number;
}
export const UiGroesseContext = createContext<UiGroesseKontextWert>({
  uiGroesse: 'normal',
  setUiGroesse: () => {},
  faktor: 1,
});

export function useUiSkalierungsFaktor(): number {
  return useContext(UiGroesseContext).faktor;
}

// Für Verwendungsstellen, die die Einstellung selbst lesen/ändern wollen
// (aktuell nur AllgemeinAbschnitt.tsx/EinstellungenFenster.tsx) – IMMER
// diesen Hook nutzen, NIE zusätzlich roh useUiGroesse() aufrufen, siehe
// Begründung oben.
export function useUiGroesseEinstellung() {
  const { uiGroesse, setUiGroesse } = useContext(UiGroesseContext);
  return { uiGroesse, setUiGroesse };
}
