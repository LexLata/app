// @vitest-environment jsdom
// Sofortige Anzeige geänderter Einstellungen in bereits gezeichneten Elementblöcken.
// Die Elementliste bleibt dabei unverändert (gleiche Elementobjekte); erwartet wird
// dieselbe Darstellung wie bei frischem Aufbau mit den neuen Einstellungen.
// Ersetzt ist nur die externe Virtualisierungsbibliothek (alle Elemente sichtbar).
import { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/Gesetzestextansicht';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (o: { count: number; getItemKey(i: number): string }) => {
    const anzahl = o.count;
    const schluessel = o.getItemKey;
    return useMemo(
      () => ({
        getVirtualItems: () =>
          Array.from({ length: anzahl }, (_, index) => ({
            index,
            key: schluessel(index),
            start: index * 100,
            size: 100,
          })),
        getOffsetForIndex: (i: number) => [i * 100],
        getTotalSize: () => anzahl * 100,
        measureElement() {},
        indexFromElement: (element: HTMLElement) => Number(element.dataset.index),
        resizeItem() {},
        scrollToOffset() {},
        scrollToIndex() {},
      }),
      [anzahl, schluessel],
    );
  },
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));

const gesetz = gesetzDarstellung({
  elemente: [
    {
      typ: 'norm',
      data: normaleNorm({
        id: 'n1',
        xmlId: 'n1',
        bezeichnung: '§ 1',
        absaetze: [
          {
            id: 'a1',
            bezeichnung: '(1)',
            saetze: [
              { id: 's1', zahl: 1, text: 'Erster Satz.', eintraege: [] },
              { id: 's2', zahl: 2, text: 'Zweiter Satz.', eintraege: [] },
            ],
          },
        ],
      }),
    },
  ],
});

let roots: { root: Root; host: HTMLDivElement }[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(async () => {
  for (const { root, host } of roots) {
    await act(async () => root.unmount());
    host.remove();
  }
  roots = [];
  vi.unstubAllGlobals();
});

async function zeichne(schriftgroesse: number, satzNeuZeile: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push({ root, host });
  const zeige = (groesse: number, neuZeile: boolean) =>
    act(async () =>
      root.render(
        <Gesetzestextansicht gesetz={gesetz} schriftgroesse={groesse} satzNeuZeile={neuZeile} />,
      ),
    );
  await zeige(schriftgroesse, satzNeuZeile);
  const block = () => host.querySelector('[data-index="0"]')?.innerHTML;
  return { zeige, block };
}

it('zeigt eine geänderte Schriftgröße im gezeichneten Elementblock sofort an', async () => {
  const ansicht = await zeichne(15, true);
  const vorher = ansicht.block();
  await ansicht.zeige(22, true);
  const erwartet = (await zeichne(22, true)).block();
  expect(erwartet).not.toBe(vorher);
  expect(ansicht.block()).toBe(erwartet);
});

it('zeigt eine geänderte Einstellung „Satz in neuer Zeile“ im gezeichneten Elementblock sofort an', async () => {
  const ansicht = await zeichne(15, true);
  const vorher = ansicht.block();
  await ansicht.zeige(15, false);
  const erwartet = (await zeichne(15, false)).block();
  expect(erwartet).not.toBe(vorher);
  expect(ansicht.block()).toBe(erwartet);
});
