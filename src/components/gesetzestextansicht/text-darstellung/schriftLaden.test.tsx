// schriftLaden.test.tsx
// Die Textmessung wird neu aufgebaut, sobald die gewählte Schrift tatsächlich geladen ist.
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTextDarstellungsModell } from './textDarstellung.modell';
import type { TextMessung } from './textMessung';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => vi.unstubAllGlobals());

function rendereModell(schriftart: 'sans' | 'serif') {
  const messungen: TextMessung[] = [];
  function Modell() {
    messungen.push(useTextDarstellungsModell({ schriftart }).messung);
    return null;
  }
  const wurzel = createRoot(document.createElement('div'));
  act(() => wurzel.render(createElement(Modell)));
  return { messungen, abbauen: () => act(() => wurzel.unmount()) };
}

describe('Schrift laden vor der Messung', () => {
  it('lädt die gewählte Schrift in Normal und Kursiv und misst danach neu', async () => {
    let laden!: () => void;
    const geladen = new Promise<void>((auf) => (laden = auf));
    const load = vi.fn(() => geladen.then(() => []));
    vi.stubGlobal('document', Object.assign(document, { fonts: { load } }));

    const { messungen, abbauen } = rendereModell('serif');
    expect(load).toHaveBeenCalledWith("15px 'Source Serif 4', serif");
    expect(load).toHaveBeenCalledWith("italic 15px 'Source Serif 4', serif");
    const vorLaden = messungen.at(-1);

    await act(async () => laden());
    expect(messungen.at(-1)).not.toBe(vorLaden);
    abbauen();
  });

  it('bleibt bei fehlgeschlagenem Laden bei der Ersatzschrift ohne Absturz', async () => {
    const load = vi.fn(() => Promise.reject(new Error('fehlt')));
    vi.stubGlobal('document', Object.assign(document, { fonts: { load } }));
    const { messungen, abbauen } = rendereModell('serif');
    await act(async () => {});
    expect(messungen.length).toBeGreaterThan(0);
    abbauen();
  });

  it('lädt für die Standardschrift nichts nach', () => {
    const load = vi.fn(() => Promise.resolve([]));
    vi.stubGlobal('document', Object.assign(document, { fonts: { load } }));
    const { abbauen } = rendereModell('sans');
    expect(load).not.toHaveBeenCalled();
    abbauen();
  });
});
