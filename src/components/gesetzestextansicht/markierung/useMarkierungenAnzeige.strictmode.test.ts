// useMarkierungenAnzeige.strictmode.test.ts
// Der echte StrictMode-Aufräumzyklus hinterlässt nur den aktuellen Listener.
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { expect, it, vi } from 'vitest';
import { useMarkierungenAnzeige } from './useMarkierungenAnzeige';

vi.mock('@/lib/markierungen/markierungen.index', () => ({ ladeMarkierungen: async () => [] }));
it('räumt StrictMode auf und registriert den neu gestarteten Effekt', async () => {
  const invoke = vi.fn().mockResolvedValue(1);
  const abmelden = vi.fn();
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  Object.assign(window, {
    __TAURI_INTERNALS__: { invoke, transformCallback: () => 1 },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: abmelden },
  });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.getElementById('root')!);
  function Probe() {
    useMarkierungenAnzeige(gesetzDarstellung({ kurztitel: 'Test' }));
    return null;
  }
  try {
    await act(async () => root.render(createElement(StrictMode, null, createElement(Probe))));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(invoke.mock.calls.filter(([name]) => name === 'plugin:event|listen')).toHaveLength(1);
    await act(async () => root.unmount());
    expect(abmelden).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
