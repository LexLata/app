// @vitest-environment jsdom
// Die native Startgröße folgt der UI-Größe und bleibt innerhalb der Monitorfläche.
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useFensterSichtbarMachen } from './useFensterSichtbarMachen';
const native = vi.hoisted(() => ({
  setSize: vi.fn(async (_groesse: { width: number; height: number }) => {}),
  center: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  invoke: vi.fn(async () => {}),
  monitor: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/api/window', async (original) => ({
  ...(await original<typeof import('@tauri-apps/api/window')>()),
  getCurrentWindow: () => native,
  currentMonitor: native.monitor,
}));
const dom = domTestWurzel();
function Probe({ faktor = 1 }: { faktor?: number }) {
  useFensterSichtbarMachen({ breite: Math.round(820 * faktor), hoehe: Math.round(682 * faktor) });
  return null;
}
beforeEach(() => {
  vi.clearAllMocks();
  native.monitor.mockResolvedValue(null);
});
it.each([
  [0.9, 738, 614],
  [1, 820, 682],
  [1.15, 943, 784],
])(
  'öffnet bei UI-Faktor %s mit passender Größe vor dem Anzeigen',
  async (faktor, width, height) => {
    await act(async () => dom.root.render(<Probe faktor={faktor} />));
    await vi.waitFor(() => expect(native.show).toHaveBeenCalledOnce());
    expect(native.setSize).toHaveBeenCalledWith(expect.objectContaining({ width, height }));
    expect(native.setSize).toHaveBeenCalledBefore(native.show);
    await act(async () => dom.root.render(<Probe faktor={1.15} />));
    expect(native.setSize).toHaveBeenCalledOnce();
  },
);
it('begrenzt die Größe auf die verfügbare Monitorfläche und zentriert das Fenster', async () => {
  native.monitor.mockResolvedValue({
    scaleFactor: 2,
    workArea: { size: { toLogical: () => ({ width: 800, height: 600 }) } },
  });
  await act(async () => dom.root.render(<Probe faktor={1.15} />));
  await vi.waitFor(() => expect(native.show).toHaveBeenCalledOnce());
  expect(native.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 776, height: 552 }));
  expect(native.center).toHaveBeenCalledOnce();
});
it('zeigt das Fenster auch bei fehlgeschlagener Größenanpassung', async () => {
  native.monitor.mockRejectedValueOnce(new Error('Monitor nicht verfügbar'));
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => dom.root.render(<Probe />));
  await vi.waitFor(() => expect(native.show).toHaveBeenCalledOnce());
  warnung.mockRestore();
});
