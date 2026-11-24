// seitenleistenTestAufbau.ts
// Gemeinsame Layout-/Plattformumgebung für reale Leisten-Anzeigetests.
import { beforeEach, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useTextRollen', () => ({ useIconGroessen: () => ({ standard: 16 }) }));
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => ({ istMac: true }) }));
vi.mock('@/hooks/utils/useAdaptivesLeistenLayout', () => ({
  useAdaptivesLeistenLayout: () => ({
    lineHeight: 1,
    paddingBlock: 2,
    zeilenMehrhoehe: 4,
    zweiSpaltig: false,
    scroll: false,
  }),
}));

export function seitenleistenTestAufbau() {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  return domTestWurzel();
}
