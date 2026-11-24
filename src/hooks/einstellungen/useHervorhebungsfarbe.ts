// useHervorhebungsfarbe.ts
//
// Verwaltet die Einstellung "Markierungsfarbe" (Einstellungen >
// Hervorhebungsfarbe, siehe HervorhebungsfarbeAbschnitt.tsx): betrifft ALLE
// Markierungsarten im Gesetzestext – Hervorheben-Hintergrund, Unterstreichen,
// sowie die Unterstreichungen von Normzitaten und Kommentaren (inkl. deren
// Textfarbe, siehe textBlatt.tsx und
// --markierungsfarbe/--hervorheben-bg in index.css).
//
// Feste Auswahlpalette (siehe farbpalette.ts) statt vormals freiem Hex-Wert
// + dreistufigem Fallback (explizit gesetzt → macOS-Systemfarbe → Standard-
// Blau, siehe Absprache): der macOS-Import entfällt, "Zurücksetzen" entfällt
// (Blau ist einfach die Standard-Option in der Liste). Details zur
// Persistenz siehe useFarbwahlEinstellung.ts.

import { HERVORHEBUNGSFARBE_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useFarbwahlEinstellung } from '@/hooks/einstellungen/useFarbwahlEinstellung';

export function useHervorhebungsfarbe() {
  const [hervorhebungsfarbe, setHervorhebungsfarbe] = useFarbwahlEinstellung(
    HERVORHEBUNGSFARBE_KEY,
    'data-markierungsfarbe',
  );
  return { hervorhebungsfarbe, setHervorhebungsfarbe };
}
