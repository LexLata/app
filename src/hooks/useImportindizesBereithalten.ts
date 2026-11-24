// Ein verzögerter Ladeversuch je Hauptfenster, nach beiden Startbarrieren.
import { useEffect, useRef, useState } from 'react';
import {
  sucheKandidatenAlleQuellen,
  leseImportindexZwischenspeicher,
} from '@/lib/import/import.index';
import { messeAsync } from '@/lib/utils/perfMessung';
import { meldeSpeicherauskunft } from '@/lib/utils/speicherMessung';

export function useImportindizesBereithalten(
  startAbgeschlossen: boolean,
  vorbereitung: React.RefObject<Promise<void> | null>,
) {
  const [bereit, setBereit] = useState(false);
  const begonnen = useRef(false);
  // Messmodus: speicherbericht() liest den Zwischenspeicher erst beim Abruf.
  useEffect(
    () =>
      meldeSpeicherauskunft({
        art: 'posten',
        name: 'Importindizes (Zwischenspeicher des Öffnen-Overlays)',
        liefere: leseImportindexZwischenspeicher,
      }),
    [],
  );
  useEffect(() => {
    if (!startAbgeschlossen || begonnen.current) return;
    let aktiv = true;
    let zeitgeber: ReturnType<typeof setTimeout> | undefined;
    void Promise.resolve(vorbereitung.current)
      .then(() => {
        if (!aktiv) return;
        zeitgeber = setTimeout(() => {
          begonnen.current = true;
          void messeAsync('Öffnen-Overlay: Importindizes bereithalten', sucheKandidatenAlleQuellen)
            .then((ergebnis) => {
              if (aktiv && leseImportindexZwischenspeicher() === ergebnis) setBereit(true);
            })
            .catch((fehler: unknown) =>
              console.error('Importindizes bereithalten fehlgeschlagen:', fehler),
            );
        }, 250);
      })
      .catch((fehler: unknown) =>
        console.error('Importindex-Vorbereitung fehlgeschlagen:', fehler),
      );
    return () => {
      aktiv = false;
      clearTimeout(zeitgeber);
    };
  }, [startAbgeschlossen, vorbereitung]);
  return bereit;
}
