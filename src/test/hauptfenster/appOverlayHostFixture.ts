// Vollständige, jeweils frische Standard-Props für Verhaltenstests des Overlay-Hosts.
// Einzelne Tests ergänzen ausschließlich den für ihren Aufruf benötigten Kontext.
import type { ComponentProps } from 'react';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { findeGesetz } from '@/lib/domain/gesetzesreferenz';
import { vi } from 'vitest';

type Props = ComponentProps<typeof AppOverlayHost> & { gesetze: GesetzDarstellung[] };
export function appOverlayHostFixture(abweichungen: Partial<Props> = {}): Props {
  return {
    textDarstellung: {
      schriftgroesse: 19,
      silbentrennung: true,
      schriftart: 'serif',
      zeilenabstand: 1.5,
      blocksatz: false,
      satzNeuZeile: true,
    },
    aktivesOverlay: null,
    onSchliessen: vi.fn(),
    gesetze: [],
    ladeGesetz: async (ref) => {
      const gesetz = findeGesetz(abweichungen.gesetze ?? [], ref);
      return gesetz ? { status: 'geladen', gesetz, befunde: [] } : { status: 'fehlt', befunde: [] };
    },
    suchverzeichniseintraege: alsSuchverzeichniseintraege(abweichungen.gesetze ?? []),
    aktiverTab: null,
    einklappZustandRef: { current: {} },
    gesetzeskurzbefehle: {},
    oeffnenOverlayInitial: '',
    verlauf: undefined,
    verlaufNavigieren: vi.fn(),
    elementOeffnen: vi.fn(),
    gesetzesreferenzOeffnen: vi.fn(),
    minimalistischerModus: false,
    onVolltextModusWechseln: vi.fn(),
    onLoeschen: vi.fn(),
    onExportieren: vi.fn(),
    onUebersichtExportAktionAnmelden: vi.fn(),
    onDateienAbgelegt: vi.fn(),
    onGesetzeskurzbefehleGeaendert: vi.fn(),
    onNeuLadenNachImport: vi.fn(),
    onInfoAktualisiert: vi.fn(),
    onDateiImportSchliessen: vi.fn(),
    ...abweichungen,
    aktivesGesetz:
      abweichungen.aktivesGesetz ??
      (abweichungen.aktiverTab?.gesetzesreferenz
        ? findeGesetz(abweichungen.gesetze ?? [], abweichungen.aktiverTab.gesetzesreferenz)
        : undefined),
  };
}
