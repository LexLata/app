// textStile.ts
// Hält die gemeinsamen Textstile für Sätze, Unterabsätze und Aufzählungen bereit.

import { GESETZESTEXT_ABSATZABSTAND } from '@/lib/stil/gesetzTextDarstellung';
import type { CSSProperties } from 'react';

/** Gemeinsamer Stilvertrag für den fortlaufenden Inhalt von Sätzen,
 * Unterabsätzen und Aufzählungseinträgen. */
export function gesetzTextInhaltStil(schrift: number): CSSProperties {
  return {
    fontSize: schrift,
    lineHeight: 'var(--zeilen-abstand)',
    whiteSpace: 'pre-wrap',
    textAlign: 'var(--text-align)' as CSSProperties['textAlign'],
    hyphens: 'var(--hyphens)' as CSSProperties['hyphens'],
  };
}

export const gesetzTextListenStil: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
};

/** Zusätzlicher Absatzabstand folgt der lokalen Schriftgröße und Zeilenabstandseinstellung. */
export function gesetzTextAbsatzAbstand(schrift: number): string {
  return `calc(${schrift * GESETZESTEXT_ABSATZABSTAND}px * var(--zeilen-abstand))`;
}
