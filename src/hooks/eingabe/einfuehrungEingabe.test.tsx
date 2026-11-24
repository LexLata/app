// @vitest-environment jsdom
// Prüft Einführungserlaubnisse über echte Eingabehooks und native Ereignisgrenzen.
import { act } from 'react';
import { menueUndTastenAktionenFuerTest } from '@/test/plattform/menueUndTastenAktionenFuerTest';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { EventCallback } from '@tauri-apps/api/event';
import { useTastenkuerzel } from './useTastenkuerzel';
import { useMenueEvents } from './useMenueEvents';

const native = vi.hoisted(() => ({ listener: new Map<string, EventCallback<unknown>>() }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, handler: EventCallback<unknown>) => {
      native.listener.set(name, handler);
      return () => native.listener.delete(name);
    },
  }),
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
afterEach(() => vi.unstubAllGlobals());

it.each(Array.from({ length: 9 }, (_, i) => i))(
  'Menü erlaubt genau die vorgesehenen Ereignisse in Teilaktion %s',
  async (teilaktion) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const a = {
      ...menueUndTastenAktionenFuerTest(),
      einfuehrungNeuStarten: vi.fn(),
      einfuehrungAktiv: true,
      einfuehrungTeilaktion: teilaktion,
    };
    function Probe() {
      useMenueEvents(a);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      await act(async () => root.render(<Probe />));
      expect(native.listener.size).toBeGreaterThan(20);
      for (const [ereignis, handler] of native.listener) {
        vi.clearAllMocks();
        await act(async () => handler({ payload: undefined, event: ereignis, id: 1 }));
        const erwartet =
          ereignis === 'einfuehrung-neu-starten-anfrage' ||
          (ereignis === 'oeffnen-overlay-oeffnen' && teilaktion === 0) ||
          (ereignis === 'favorit-speichern' && [2, 3].includes(teilaktion)) ||
          (ereignis === 'lesezeichen-speichern' && teilaktion === 4);
        const anzahl = Object.values(a).reduce<number>(
          (summe, wert) => summe + (vi.isMockFunction(wert) ? wert.mock.calls.length : 0),
          0,
        );
        expect(anzahl, ereignis).toBe(
          erwartet ? (ereignis === 'oeffnen-overlay-oeffnen' ? 2 : 1) : 0,
        );
      }
    } finally {
      await act(async () => root.unmount());
    }
  },
);
it.each([...Array.from({ length: 9 }, (_, i) => i), null])(
  'Klappstufen brauchen keinen Einführungsmarker und wirken nur in 6/7 oder außerhalb (%s)',
  async (teilaktion) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const zu = vi.fn();
    const auf = vi.fn();
    const optionen: Parameters<typeof useTastenkuerzel>[0] = {
      ...menueUndTastenAktionenFuerTest(),
      tabsRef: { current: [] },
      aktiverTabIdRef: { current: null },
      gesetzeskurzbefehle: {},
      gesetze: [],
      elementOeffnen: vi.fn(),
      gesetzesreferenzOeffnen: () => () => {},
      setAktiverTabId: vi.fn(),
      lesezeichenEintraege: [],
      handleLesezeichenOeffnen: vi.fn(),
      verlaufSchrittUndOeffnen: vi.fn(),
      handleZuklappen: zu,
      handleAufklappen: auf,
      einfuehrungAktiv: teilaktion !== null,
      einfuehrungTeilaktion: teilaktion ?? 0,
    };
    function Probe() {
      useTastenkuerzel(optionen);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      await act(async () => root.render(<Probe />));
      expect(document.querySelector('[data-overlay-aktiv]')).toBeNull();
      for (const primaer of ['metaKey', 'ctrlKey']) {
        for (const key of ['ArrowLeft', 'ArrowRight']) {
          await act(async () =>
            window.dispatchEvent(new KeyboardEvent('keydown', { key, [primaer]: true })),
          );
        }
      }
      expect(zu).toHaveBeenCalledTimes([6, 7, null].includes(teilaktion) ? 2 : 0);
      expect(auf).toHaveBeenCalledTimes([6, 7, null].includes(teilaktion) ? 2 : 0);
      // Ein gewöhnliches Overlay sperrt die Klappstufen auch außerhalb weiterhin.
      document.body.setAttribute('data-overlay-aktiv', '');
      zu.mockClear();
      auf.mockClear();
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', metaKey: true })),
      );
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true })),
      );
      expect(zu).not.toHaveBeenCalled();
      expect(auf).not.toHaveBeenCalled();
      document.body.removeAttribute('data-overlay-aktiv');
    } finally {
      await act(async () => root.unmount());
    }
  },
);
