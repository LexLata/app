// useZitatAbkuerzungen.ts
//
// Verwaltet die drei Einstellungen zur Formatierung des von "Verweis
// kopieren" erzeugten Zitats (Abschnitt "Kopieren von Zitaten" in
// EinstellungenFenster.tsx) – inkl. localStorage-Persistenz über
// useLocalStorageState.ts. In EINEM Hook statt drei getrennten
// (useMinimalistischerModus.ts-Muster), da die drei Werte immer gemeinsam
// gelesen werden (siehe zitatFormatierung.ts: formatiereZitat) und
// Option 2/3 nur bei aktivierter Option 1 überhaupt einen Effekt bzw. eine
// eigene UI-Sichtbarkeit haben (siehe ZitatKopierenAbschnitt.tsx).

import {
  ABKUERZUNGEN_AKTIV_KEY,
  OHNE_PUNKT_KEY,
  ROEMISCHE_ABSAETZE_KEY,
} from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

function parseBool(roh: string): boolean {
  return roh === 'true';
}

export function useZitatAbkuerzungen() {
  const [abkuerzungenAktiv, setAbkuerzungenAktiv] = useLocalStorageState<boolean>(
    ABKUERZUNGEN_AKTIV_KEY,
    true,
    { parse: parseBool },
  );
  const [ohnePunkt, setOhnePunkt] = useLocalStorageState<boolean>(OHNE_PUNKT_KEY, false, {
    parse: parseBool,
  });
  const [roemischeAbsaetze, setRoemischeAbsaetze] = useLocalStorageState<boolean>(
    ROEMISCHE_ABSAETZE_KEY,
    false,
    { parse: parseBool },
  );

  return {
    abkuerzungenAktiv,
    setAbkuerzungenAktiv,
    ohnePunkt,
    setOhnePunkt,
    roemischeAbsaetze,
    setRoemischeAbsaetze,
  };
}
