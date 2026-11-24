// favoritenTastenkuerzel.ts
// Gemeinsame Zuordnung zwischen Favoritenplatz, Anzeige und Taste.
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
export interface TastenkuerzelInfo {
  buchstabe: string; // '' wenn kein Tastenkürzel
  kursiv: boolean; // true für ⌥-Variante
  tooltip: string; // Erklärungs-Tooltip für Alt-Variante
}

// ---------------------------------------------------------------------------
// Berechnungs-Helfer
// ---------------------------------------------------------------------------

/** Gibt Tastenkürzel-Informationen für den n-ten Favoriten zurück. */
export function tastenkuerzelFuerIndex(index: number, istMac: boolean): TastenkuerzelInfo {
  if (index < 26) {
    const b = String.fromCharCode(97 + index);
    return {
      buchstabe: b,
      kursiv: false,
      tooltip: tastenkuerzelAnzeige('favoriten-1-26', istMac, index),
    };
  }
  if (index < 52) {
    const gross = String.fromCharCode(65 + (index - 26));
    return {
      buchstabe: gross,
      kursiv: false,
      tooltip: tastenkuerzelAnzeige('favoriten-27-52', istMac, index - 26),
    };
  }
  if (index < 78) {
    const b = String.fromCharCode(97 + (index - 52));
    return {
      buchstabe: b,
      kursiv: true,
      tooltip: tastenkuerzelAnzeige('favoriten-53-78', istMac, index - 52),
    };
  }
  return { buchstabe: '', kursiv: false, tooltip: '' };
}

export function favoritenIndexFuerTaste(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'shiftKey'>,
): number | null {
  if (e.altKey && !e.shiftKey) {
    const buchstabe = e.code.match(/^Key([A-Z])$/)?.[1];
    return buchstabe ? buchstabe.toLowerCase().charCodeAt(0) - 97 + 52 : null;
  }
  if (!e.altKey && !e.shiftKey && e.key.length === 1 && e.key >= 'a' && e.key <= 'z')
    return e.key.charCodeAt(0) - 97;
  if (!e.altKey && e.shiftKey && e.key.length === 1 && e.key >= 'A' && e.key <= 'Z')
    return e.key.charCodeAt(0) - 65 + 26;
  return null;
}
