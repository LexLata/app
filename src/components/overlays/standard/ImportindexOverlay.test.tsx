// @vitest-environment jsdom
// ImportindexOverlay.test.tsx
// Die dritte Kategorie verwendet dieselben Verwaltungsaktionen und Sperren.
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
const m = vi.hoisted(() => ({
  aktualisieren: vi.fn().mockResolvedValue({ erfolg: true, anzahl: 1000 }),
}));
vi.mock('@/lib/import/import.index', () => ({
  importindexStatus: vi.fn().mockResolvedValue({ herkunft: 'standard', verarbeitungszeit: null }),
  istImportindexAktiv: () => false,
  stelleStandardWieder: vi.fn(),
  aktualisiereImportindex: m.aktualisieren,
}));
import { ImportindexOverlay } from './ImportindexOverlay';
const dom = domTestWurzel();
it('zeigt Europarecht als dritte Kategorie und startet dessen Aktualisierung', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await act(async () => dom.root.render(<ImportindexOverlay onSchliessen={() => undefined} />));
  expect(dom.host.textContent).toContain('Importindex Europarecht');
  const buttons = [...dom.host.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) => b.textContent === 'Aktualisieren',
  );
  expect(buttons).toHaveLength(3);
  await act(async () => buttons[2]!.click());
  expect(m.aktualisieren).toHaveBeenCalledWith('eu');
  expect(buttons[2]!.disabled).toBe(true);
  expect(dom.host.textContent).toContain('Wird aktualisiert');
  vi.restoreAllMocks();
});
