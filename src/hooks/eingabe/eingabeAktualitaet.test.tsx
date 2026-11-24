// @vitest-environment jsdom
// Prüft aktuelle Aktionsfunktionen bei unverändert angemeldeten Eingabelistenern.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useTastenkuerzel } from './useTastenkuerzel';
import { useMenueEvents } from './useMenueEvents';
import { useAppEingabe } from './useAppEingabe';
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const laufzeit = vi.hoisted(() => ({ listener: new Map<string, () => void>(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: laufzeit.listen }),
}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  plattformFallsBekannt: () => 'linux',
  einstellungenFensterOeffnen: vi.fn(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  setzeReservierteTastenkuerzel: vi.fn(),
  setzeReservierteTastenkuerzelCodes: vi.fn(),
}));

it.each(['menue', 'tastatur', 'app-menue', 'app-tastatur'])(
  '%s verwendet nach erneutem Rendern aktuelle Aktionen ohne Neuanmeldung',
  async (art) => {
    const abmelden = vi.fn();
    laufzeit.listen.mockImplementation(async (name: string, handler: () => void) => {
      laufzeit.listener.set(name, handler);
      return abmelden;
    });
    const anmelden = vi.spyOn(window, 'addEventListener');
    const entfernen = vi.spyOn(window, 'removeEventListener');
    const host = document.createElement('div');
    const root = createRoot(host);
    const vorher = vi.fn();
    const nachher = vi.fn();
    const basis = {
      tabsRef: { current: [] },
      aktiverTabIdRef: { current: null },
      gesetzeskurzbefehle: {},
      gesetze: [],
      lesezeichenEintraege: [],
    };
    const useEingabe = art.startsWith('app-')
      ? useAppEingabe
      : art === 'menue'
        ? useMenueEvents
        : useTastenkuerzel;
    function Probe({ aktion }: { aktion: () => void }) {
      const optionen = { ...basis, handleDateiImportAnfrage: aktion };
      useEingabe(
        optionen as unknown as Parameters<typeof useMenueEvents>[0] &
          Parameters<typeof useTastenkuerzel>[0],
      );
      return null;
    }
    try {
      await act(async () => root.render(<Probe aktion={vorher} />));
      const anmeldungen = laufzeit.listen.mock.calls.length;
      const tastaturanmeldungen = anmelden.mock.calls.filter(([name]) => name === 'keydown').length;
      await act(async () => root.render(<Probe aktion={nachher} />));
      if (art.endsWith('menue')) laufzeit.listener.get('dateien-importieren-anfrage')!();
      else
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, shiftKey: true }),
        );
      expect(nachher).toHaveBeenCalledOnce();
      expect(vorher).not.toHaveBeenCalled();
      expect(laufzeit.listen.mock.calls.length).toBe(anmeldungen);
      expect(anmelden.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(
        tastaturanmeldungen,
      );
      expect(abmelden).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      expect(abmelden).toHaveBeenCalledTimes(laufzeit.listen.mock.calls.length);
      expect(entfernen.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(
        anmelden.mock.calls.filter(([name]) => name === 'keydown').length,
      );
      anmelden.mockRestore();
      entfernen.mockRestore();
      vi.clearAllMocks();
    }
  },
);
