// useGesetzestextAkzentfarbe.ts
//
// Verwaltet die Gesetzestext-Akzentfarbe für Überschriften, überschriftsartige
// Gliederungsartikel und den Zeiger des aktiven Elements.
// useFarbwahlEinstellung setzt data-gesetzestext-akzent auf <html> und
// synchronisiert die gespeicherte Farbwahl zwischen Fenstern.

import { GESETZESTEXT_AKZENTFARBE_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useFarbwahlEinstellung } from '@/hooks/einstellungen/useFarbwahlEinstellung';

export function useGesetzestextAkzentfarbe() {
  const [gesetzestextAkzentfarbe, setGesetzestextAkzentfarbe] = useFarbwahlEinstellung(
    GESETZESTEXT_AKZENTFARBE_KEY,
    'data-gesetzestext-akzent',
  );
  return { gesetzestextAkzentfarbe, setGesetzestextAkzentfarbe };
}
