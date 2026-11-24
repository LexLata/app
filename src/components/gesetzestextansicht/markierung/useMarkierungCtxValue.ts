// useMarkierungCtxValue.ts
// Baut den Value für MarkierungCtx.Provider zusammen (siehe
// markierungContext.ts) – inkl. der Rechtsklick-Kontextmenü-
// Logik (welche Einträge je nach Markierungstyp erscheinen). Ausgelagert aus
// Gesetzestextansicht.tsx, da das keine reine Verdrahtung mehr ist, sondern
// eigene (wenn auch kleine) Fachlogik.

import { useMemo } from 'react';
import type { MarkierungState } from '@/components/gesetzestextansicht/markierung/markierungContext';
import type { GesetzestextansichtProps } from '@/components/gesetzestextansicht/Gesetzestextansicht.types';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import { zeigeMarkierungKontextMenu } from '@/components/gesetzestextansicht/markierung/kontextMenu';

export function useMarkierungCtxValue({
  markierungenNachXmlId,
  onVerweisKlick,
  onVerweisBearbeiten,
  onKommentarKlick,
  onMarkierungLoeschen,
}: Pick<
  GesetzestextansichtProps,
  'onVerweisKlick' | 'onVerweisBearbeiten' | 'onKommentarKlick' | 'onMarkierungLoeschen'
> & {
  markierungenNachXmlId: Map<string, MarkierungsEintrag[]>;
}): MarkierungState {
  return useMemo(
    () => ({
      markierungenNachXmlId,
      onVerweisKlick,
      onMarkierungRechtsklick: (ausgangsXmlId: string, eintrag: MarkierungsEintrag) => {
        const items = [];
        if (eintrag.typ === 'verweismarkierung' && onVerweisBearbeiten) {
          items.push({
            text: 'Verweis bearbeiten',
            action: () => onVerweisBearbeiten(ausgangsXmlId, eintrag),
          });
        }
        if (onMarkierungLoeschen) {
          items.push({
            text: 'Markierung löschen',
            action: () => onMarkierungLoeschen(ausgangsXmlId, eintrag),
          });
        }
        void zeigeMarkierungKontextMenu(items).catch((fehler: unknown) => {
          console.error('Markierungs-Kontextmenü konnte nicht geöffnet werden:', fehler);
        });
      },
      onKommentarKlick,
    }),
    [
      markierungenNachXmlId,
      onVerweisKlick,
      onVerweisBearbeiten,
      onKommentarKlick,
      onMarkierungLoeschen,
    ],
  );
}
