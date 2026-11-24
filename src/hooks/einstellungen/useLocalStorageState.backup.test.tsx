// @vitest-environment jsdom
// Prüft den Einstellungs-Schreibweg bis zum öffentlichen Backup-Auslöser.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useLocalStorageState } from './useLocalStorageState';
import { FARBSCHEMA_KEY } from '@/lib/einstellungen/einstellungen.index';
const melden = vi.hoisted(() => vi.fn());
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  meldeEinstellungenGeaendert: melden,
}));
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
it('meldet eine über setWert gespeicherte Änderung an das Backup', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let aendern!: (wert: string) => void;
  function Probe() {
    const [, setWert] = useLocalStorageState(FARBSCHEMA_KEY, 'system');
    aendern = setWert;
    return null;
  }
  try {
    await act(async () => root.render(<Probe />));
    await act(async () => aendern('dunkel'));
    expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('dunkel');
    expect(melden).toHaveBeenCalledExactlyOnceWith(FARBSCHEMA_KEY);
  } finally {
    await act(async () => root.unmount());
  }
});
