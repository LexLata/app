// useAppAkzentfarbe.ts
//
// Verwaltet die Einstellung "App-Akzentfarbe" (Einstellungen >
// Erscheinungsbild, siehe AllgemeinAbschnitt.tsx): betrifft
// Textauswahl (::selection), das ausgewählte Element im
// Öffnen-Overlay, Buttonfarben, den Link auf der Willkommensseite u. Ä.
// (siehe --akzent/--akzent-blass/--auswahl-bg/--textauswahl-bg in
// index.css).
//
// Ersetzt den bisherigen automatischen Import der macOS-Hervorhebungsfarbe
// (vormals tauriHelpers.ts::systemfarbeAnwenden(), siehe Absprache – dieser
// Weg entfällt ersatzlos, stattdessen feste Auswahlpalette wie bei den
// anderen beiden Farbwahl-Einstellungen). Details zur Persistenz siehe
// useFarbwahlEinstellung.ts.
//
// Jedes Tauri-Fenster hat ein eigenes document, daher MUSS dieser Hook in
// jedem Fenster gemountet werden, dessen UI --akzent verwendet (aktuell:
// App.tsx, EinstellungenFenster.tsx, VerweismarkierungFenster.tsx,
// KommentarFenster.tsx, MarkierungskonfliktFenster.tsx) – siehe dortige
// Aufrufstellen.

import { APP_AKZENTFARBE_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useFarbwahlEinstellung } from '@/hooks/einstellungen/useFarbwahlEinstellung';

export function useAppAkzentfarbe() {
  const [appAkzentfarbe, setAppAkzentfarbe] = useFarbwahlEinstellung(
    APP_AKZENTFARBE_KEY,
    'data-app-akzent',
  );
  return { appAkzentfarbe, setAppAkzentfarbe };
}
