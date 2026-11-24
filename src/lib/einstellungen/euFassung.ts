// euFassung.ts
// Liest die EU-Import-/Suchpräferenz ausschließlich aus localStorage.
import { EU_FASSUNG_KEY } from './speicherschluessel';
import { STANDARD_EU_FASSUNG, type EuFassung } from '@/lib/domain/euFassungsvertrag';
export function parseEuFassung(roh: string | null): EuFassung {
  return roh === 'original' || roh === 'konsolidiert' ? roh : STANDARD_EU_FASSUNG;
}
export function leseEuFassung(): EuFassung {
  try {
    return parseEuFassung(localStorage.getItem(EU_FASSUNG_KEY));
  } catch {
    return STANDARD_EU_FASSUNG;
  }
}
