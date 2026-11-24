// Nur Ablaufzustand; Reihenfolge aus bestehenden Anzeigezeitpunkten, Bestand aus dem Tabbesitzer.
import { useEffect, useRef } from 'react';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { ladeAnzeigezeitpunkte } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { vergleicheSuchverzeichnisDateistempel } from '@/lib/persistenz/gesetz/gesetz.index';
import { messeAsync } from '@/lib/utils/perfMessung';
export function useFensterVorladen(
  startAbgeschlossen: boolean,
  importindizesBereit: boolean,
  vorladen: (referenzen: readonly Gesetzesreferenz[]) => Promise<void>,
) {
  const begonnen = useRef(false);
  useEffect(() => {
    if (!startAbgeschlossen || !importindizesBereit || begonnen.current) return;
    let aktiv = true;
    void messeAsync('Fensterstart: Dateistempelvergleich', vergleicheSuchverzeichnisDateistempel)
      .then(async ({ referenzen }) => {
        if (!aktiv) return;
        begonnen.current = true;
        const zeitpunkte = ladeAnzeigezeitpunkte();
        const zuletzt = referenzen.filter((ref) => zeitpunkte.has(gesetzesreferenzSchluessel(ref)));
        zuletzt.sort(
          (a, b) =>
            (zeitpunkte.get(gesetzesreferenzSchluessel(b)) ?? 0) -
            (zeitpunkte.get(gesetzesreferenzSchluessel(a)) ?? 0),
        );
        await messeAsync('Fensterstart: Vorladen', () => vorladen(zuletzt));
      })
      .catch((fehler: unknown) => console.error('Vorladen fehlgeschlagen:', fehler));
    return () => {
      aktiv = false;
    };
  }, [startAbgeschlossen, importindizesBereit, vorladen]);
}
