// Suchbestand aus der Datei; Hintergrundfortschritt und Fensterereignisse lösen frisches Lesen aus.
import { useEffect, useState } from 'react';
import { leseSuchverzeichnis, type Suchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
import { hoereGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import {
  beiSuchverzeichnisVorbereitung,
  holeSuchverzeichnisFortschritt,
  bereiteSuchverzeichnisVor,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import { meldeSpeicherauskunft } from '@/lib/utils/speicherMessung';

export function useSuchverzeichnisAbgleich(startAbgeschlossen: boolean) {
  useEffect(() => {
    if (startAbgeschlossen) void bereiteSuchverzeichnisVor();
  }, [startAbgeschlossen]);
}

export function useSuchverzeichnis(startAbgeschlossen = true) {
  const [verzeichnis, setVerzeichnis] = useState<Suchverzeichnis>({
    abgeglichen: false,
    eintraege: [],
  });
  const [wirdAktualisiert, setWirdAktualisiert] = useState(true);
  const [fortschritt, setFortschritt] = useState(holeSuchverzeichnisFortschritt);
  useEffect(() => {
    if (!startAbgeschlossen) return;
    let aktiv = true;
    let generation = 0;
    const aktualisiere = () => {
      const angefordert = ++generation;
      setWirdAktualisiert(true);
      setFortschritt(holeSuchverzeichnisFortschritt());
      void leseSuchverzeichnis().then((stand) => {
        if (aktiv && angefordert === generation) {
          setVerzeichnis(stand);
          setWirdAktualisiert(false);
        }
      });
    };
    const abmelden = beiSuchverzeichnisVorbereitung((abschluss, veroeffentlicht) => {
      setFortschritt(holeSuchverzeichnisFortschritt());
      if (abschluss || veroeffentlicht) aktualisiere();
    });
    const geaendert = hoereGlobal('gesetze-geaendert', aktualisiere);
    const geloescht = hoereGlobal('gesetze-geloescht', aktualisiere);
    void Promise.allSettled([geaendert.bereit, geloescht.bereit]).then((anmeldungen) => {
      for (const anmeldung of anmeldungen) {
        if (anmeldung.status === 'rejected')
          console.error('Suchverzeichnislistener fehlgeschlagen:', anmeldung.reason);
      }
      if (aktiv) aktualisiere();
    });
    aktualisiere();
    return () => {
      aktiv = false;
      abmelden();
      geaendert.abmelden();
      geloescht.abmelden();
    };
  }, [startAbgeschlossen]);
  // Messmodus: Auskunft für speicherbericht(); jede Hookinstanz hält eine eigene Kopie.
  useEffect(
    () =>
      meldeSpeicherauskunft({ art: 'posten', name: 'Suchverzeichnis', liefere: () => verzeichnis }),
    [verzeichnis],
  );
  return {
    eintraege: verzeichnis.eintraege,
    wirdAktualisiert,
    wirdVorbereitet: !verzeichnis.abgeglichen,
    vorbereitungsText: fortschritt
      ? `Gesetzesliste wird vorbereitet … (${fortschritt.erledigt} von ${fortschritt.gesamt})`
      : 'Gesetzesliste wird vorbereitet …',
  };
}
