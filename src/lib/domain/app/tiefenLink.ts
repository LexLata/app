// tiefenLink.ts
// Vollständige Gesetzesreferenzen in einzeln kodierten Tiefenlink-Segmenten.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGueltigerNormgeber } from '@/lib/domain/gesetzesreferenz';

export interface TiefenLinkZiel extends Gesetzesreferenz {
  /** Normbezeichnung, z. B. "398" oder "249 3" für Gliederungsartikel. */
  bezeichnung?: string;
}

/** Öffnen-Links können nicht als Gesetzesreferenz verwendet werden. */
export interface OeffnenLinkZiel {
  type: 'oeffnen';
  suchtext: string;
}
export type OeffentlichesLinkZiel = TiefenLinkZiel | OeffnenLinkZiel;

export function parseTiefenLink(url: string): OeffentlichesLinkZiel | null {
  const normiert = url.trim();
  if (/^lexlata:\/\/oeffnen(?:\/|$)/i.test(normiert)) {
    const segment = normiert.slice('lexlata://oeffnen/'.length);
    if (!segment || /[/?#]/.test(segment)) return null;
    try {
      const suchtext = decodeURIComponent(segment);
      return suchtext.trim() ? { type: 'oeffnen', suchtext } : null;
    } catch {
      return null;
    }
  }
  if (
    !normiert.toLowerCase().startsWith('lexlata://') ||
    /[?#]/.test(normiert) ||
    normiert.slice('lexlata://'.length).startsWith('/')
  )
    return null;
  let teile: string[];
  try {
    teile = normiert.slice('lexlata://'.length).split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [geber, kurztitel, ...normTeile] = teile;
  if (!geber || !kurztitel?.trim() || normTeile.length > 2) return null;
  const normgeber = geber.toLowerCase();
  if (!istGueltigerNormgeber(normgeber)) return null;
  return {
    kurztitel,
    normgeber,
    bezeichnung: normTeile.length ? normTeile.join(' ') : undefined,
  };
}

/** Hinweis für gültige Links, deren konkretes Ziel nicht verfügbar ist. */
export const TIEFENLINK_ZIEL_HINWEIS =
  'Das Linkziel konnte nicht geöffnet werden. Prüfen Sie Normgeber, Kurztitel und gegebenenfalls die Normangabe. Links haben das Format lexlata://normgeber/kurztitel[/norm], zum Beispiel lexlata://de-bund/bgb/433.';
