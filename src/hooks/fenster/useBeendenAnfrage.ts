// useBeendenAnfrage.ts
//
// Beantwortet die Beenden-Anfrage aus Rust (fenster/beenden_anfrage.rs) für
// dieses Fenster: `vorbereiten` entscheidet, ob das Fenster bereit ist
// (Fehler gelten als nicht bereit); das Fenster schließt dabei nicht selbst.
// Nach einer Abbruchnachricht endet die Vorbereitung über ihr Abbruchsignal.
// Je Fenster genau eine Stelle, die diesen Hook nutzt:
// Hauptfenster über useFensterRestore, Hilfsfenster mit Schließschutz über
// useFensterSchliessenAbsichern, übrige Hilfsfenster direkt.

import { useEffect, useRef } from 'react';
import { hoereImEigenenFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

export function useBeendenAnfrage(
  vorbereiten: (signal: AbortSignal, rueckfrageMelden: () => void) => Promise<boolean> = () =>
    Promise.resolve(true),
) {
  const vorbereitenRef = useRef(vorbereiten);
  vorbereitenRef.current = vorbereiten;

  useEffect(() => {
    let letzteId = 0;
    let laufend: AbortController | undefined;
    const anfrage = hoereImEigenenFenster('beenden-anfrage', ({ payload: { id } }) => {
      if (id <= letzteId) return;
      letzteId = id;
      laufend?.abort();
      const abbruch = new AbortController();
      laufend = abbruch;
      const { signal } = abbruch;
      function rueckfrageMelden() {
        if (signal.aborted) return;
        void rufeBefehl('beenden_anfrage_rueckfrage', { id }).catch((fehler) =>
          console.error('Rückfrage zur Beenden-Anfrage nicht gemeldet:', fehler),
        );
      }
      void (async () => {
        let bereit = false;
        try {
          bereit = await vorbereitenRef.current(signal, rueckfrageMelden);
        } catch (fehler) {
          console.error('Vorbereitung auf das Beenden fehlgeschlagen:', fehler);
        }
        if (signal.aborted) return;
        if (!bereit) {
          abbruch.abort();
          laufend = undefined;
        }
        try {
          await rufeBefehl('beenden_anfrage_antworten', { id, bereit });
        } catch (fehler) {
          console.error('Antwort auf die Beenden-Anfrage nicht zugestellt:', fehler);
        }
      })();
    });
    const abbruch = hoereImEigenenFenster('beenden-anfrage-abbruch', ({ payload: { id } }) => {
      if (id < letzteId) return;
      letzteId = id;
      laufend?.abort();
      laufend = undefined;
    });
    for (const anmeldung of [anfrage, abbruch]) {
      void anmeldung.bereit.catch((fehler) =>
        console.error('Listener für die Beenden-Anfrage konnte nicht eingerichtet werden:', fehler),
      );
    }
    return () => {
      laufend?.abort();
      anfrage.abmelden();
      abbruch.abmelden();
    };
  }, []);
}
