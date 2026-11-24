// exportZiel.test.ts
// Native Exportübergabe: Filteranzeige geschützt, Dateidaten und Ordnerablage unverändert.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { waehleExportZiel } from './exportZiel';
const api = vi.hoisted(() => ({
  save: vi.fn(),
  download: vi.fn(),
  join: vi.fn(),
  dirname: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: api.save }));
vi.mock('@/lib/plattform/dateipfade', () => ({
  downloadsOrdner: api.download,
  verbindeDateipfad: api.join,
  ermittleDateiordner: api.dirname,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('localStorage', { getItem: api.get, setItem: api.set });
  api.download.mockResolvedValue('/Downloads/Art. 1');
  api.join.mockImplementation(async (ordner: string, datei: string) => `${ordner}/${datei}`);
  api.dirname.mockResolvedValue('/Export/§ 2');
});
afterEach(() => vi.unstubAllGlobals());
it('schützt den Filter und merkt ausschließlich den bestätigten Originalordner', async () => {
  const filter = { name: 'Art. 1 Abs. 1', extensions: ['§ 1', 'xml'] };
  api.save.mockResolvedValue('/Export/§ 2/Art. 1.xml');
  await expect(waehleExportZiel('Art. 1.xml', filter)).resolves.toBe('/Export/§ 2/Art. 1.xml');
  expect(api.save).toHaveBeenCalledWith({
    defaultPath: '/Downloads/Art. 1/Art. 1.xml',
    filters: [{ name: 'Art.\u00a01 Abs.\u00a01', extensions: filter.extensions }],
  });
  expect(filter.name).toBe('Art. 1 Abs. 1');
  expect(api.set).toHaveBeenCalledWith(expect.any(String), '/Export/§ 2');
});
it('merkt bei Abbruch nichts und gibt ursprüngliche Dialogfehler weiter', async () => {
  api.save.mockResolvedValueOnce(null);
  await expect(
    waehleExportZiel('§ 1.xml', { name: 'XML', extensions: ['xml'] }),
  ).resolves.toBeNull();
  expect(api.set).not.toHaveBeenCalled();
  const fehler = new Error('Dialog');
  api.save.mockRejectedValueOnce(fehler);
  await expect(waehleExportZiel('§ 1.xml', { name: 'XML', extensions: ['xml'] })).rejects.toBe(
    fehler,
  );
});
it('erhält den ausgewählten Pfad auch ohne Pfadauflösung oder verfügbare Einstellungsablage', async () => {
  api.get.mockImplementation(() => {
    throw new Error('Speicher');
  });
  api.download.mockRejectedValue(new Error('Pfadauflösung'));
  api.set.mockImplementation(() => {
    throw new Error('Speicher');
  });
  api.save.mockResolvedValue('/§ 1.xml');
  await expect(waehleExportZiel('Art. 1.xml', { name: 'XML', extensions: ['xml'] })).resolves.toBe(
    '/§ 1.xml',
  );
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'Art. 1.xml' }));
});
