// Erzeugt den Fensterbestand nach dem Mount; StrictMode hinterlässt keine nativen Listener.
import { useEffect, useState } from 'react';
import {
  erzeugeGeladeneGesetze,
  type GeladeneGesetzeOptionen,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import { meldeSpeicherauskunft } from '@/lib/utils/speicherMessung';
export function useGeladeneGesetze(
  optionen?: GeladeneGesetzeOptionen,
  beiLebensdauer?: (bestand: ReturnType<typeof erzeugeGeladeneGesetze> | null) => void,
) {
  const [konfiguration] = useState(optionen);
  const [bestand, setBestand] = useState<ReturnType<typeof erzeugeGeladeneGesetze> | null>(null);
  const [, meldeStand] = useState(0);
  useEffect(() => {
    const eigenerBestand = erzeugeGeladeneGesetze(konfiguration);
    const abmelden = eigenerBestand.abonnieren(() => meldeStand((stand) => stand + 1));
    // Messmodus: speicherbericht() fragt die Bestandsauskunft erst beim Abruf ab.
    const speicherauskunftAbmelden = meldeSpeicherauskunft({
      art: 'fensterbestand',
      liefere: () => eigenerBestand.holeBestandsauskunft(),
    });
    setBestand(eigenerBestand);
    beiLebensdauer?.(eigenerBestand);
    return () => {
      beiLebensdauer?.(null);
      speicherauskunftAbmelden();
      abmelden();
      eigenerBestand.beenden();
    };
  }, [konfiguration, beiLebensdauer]);
  return bestand;
}
