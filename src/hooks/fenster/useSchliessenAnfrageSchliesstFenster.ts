// useSchliessenAnfrageSchliesstFenster.ts
//
// Schließt auf Escape oder eine ausdrücklich an dieses WebView adressierte
// Schließen-Anfrage dieses Hilfsfenster. Native Hauptfensteraktionen werden
// nicht an Hilfsfenster umgeleitet. Escape bleibt ein lokales Tastaturereignis.
//
// Genutzt von MarkierungskonfliktFenster.tsx, EinstellungenFenster.tsx,
// KommentarFenster.tsx, VerweismarkierungFenster.tsx – Escape-Handling vorher in
// KommentarFenster.tsx und VerweismarkierungFenster.tsx als bis auf Kommentare
// identischer eigener keydown-Effekt dupliziert, jetzt hier konsolidiert
// (dritter Anwendungsfall mit EinstellungenFenster.tsx gab den Ausschlag).
//
// `schliessen` optional, Standard ist ein einfaches getCurrentWindow().close().
// VerweismarkierungFenster.tsx übergibt seine eigene schliessen()-Funktion für
// die Fehleranzeige. Der CloseRequested-Listener in
// useFensterSchliessenAbsichern.ts wartet auf laufende Speicher-Batches.
//
// Ref-gespiegelt statt direkt in der Effekt-Dependency (siehe Ref-Muster in
// useMarkierungenDeaktiviert.ts): beide Listener werden EINMALIG registriert,
// bekommen bei jedem Aufruf aber die zuletzt übergebene schliessen-Funktion
// – nötig, weil z.B. VerweismarkierungFenster.tsx/KommentarFenster.tsx bei jedem
// Render eine neue schliessen-Funktionsreferenz erzeugen (schließt über
// kontext/State), ohne dass sich ihr Verhalten dadurch tatsächlich ändert.

import { hoereImEigenenFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { useEffect, useRef } from 'react';

export function useSchliessenAnfrageSchliesstFenster(schliessen?: () => void | Promise<void>) {
  const schliessenRef = useRef(schliessen);
  useEffect(() => {
    schliessenRef.current = schliessen;
  }, [schliessen]);

  // Escape – rein clientseitig, kein Tauri-Event nötig.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const fn = schliessenRef.current;
      if (fn) {
        void fn();
      } else {
        void (async () => {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().close();
        })();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Ausschließlich eigene, adressierte Schließen-Anfragen.
  useEffect(() => {
    const anmeldung = hoereImEigenenFenster('schliessen-anfrage', async () => {
      const fn = schliessenRef.current;
      if (fn) await fn();
      else {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      }
    });
    void anmeldung.bereit.catch((fehler) =>
      console.error('Listener für Schließen-Anfrage konnte nicht eingerichtet werden:', fehler),
    );
    return anmeldung.abmelden;
  }, []);
}
