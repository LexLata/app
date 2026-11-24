// Sammel-Export übernimmt fertige Nutzerdatendateien ohne deren Speicherpfade.
import { beforeEach, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
const favoriten = vi.fn(async () => [{ name: 'BGB-favoriten.xml', inhalt: 'Favoriten roh' }]);
const lesezeichen = vi.fn(async () => [{ name: 'lesezeichen.xml', inhalt: 'Lesezeichen roh' }]);
const gesetzeskurzbefehle = vi.fn(async () => [
  { name: 'gesetzeskurzbefehle.xml', inhalt: 'Gesetzeskurzbefehle roh' },
]);
const writeFile = vi.fn();
const writeTextFile = vi.fn();
const rohLesen = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args),
  writeTextFile: (...args: unknown[]) => writeTextFile(...args),
}));
vi.mock('@tauri-apps/api/path', () => ({ join: async (...teile: string[]) => teile.join('/') }));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: (...args: unknown[]) => rohLesen(...args),
  appDatenOrdnerLesen: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeAlleGesetze: vi.fn(),
  ladeGesetzesXML: vi.fn(),
  leseGesetzInfos: vi.fn(),
  leseNichtamtlicheTitelFuerExport: vi.fn(),
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({ MARKIERUNGEN_ORDNER: 'markierungen' }));
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  leseFavoritenFuerExport: () => favoriten(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher', () => ({
  leseLesezeichenFuerExport: () => lesezeichen(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  leseGesetzeskurzbefehleFuerExport: () => gesetzeskurzbefehle(),
}));
vi.mock('@/lib/import/import.index', () => ({ leseImportindizesFuerExport: vi.fn() }));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  baueEinstellungenXML: vi.fn(),
}));
import { exportiere } from './exportSpeicher';
beforeEach(() => {
  vi.clearAllMocks();
});
it('übernimmt rohe Inhalte und bisherige ZIP-Namen über die drei Speicherabfragen', async () => {
  await expect(
    exportiere(new Set(['alleFavoriten', 'lesezeichen', 'gesetzeskurzbefehle']), {}),
  ).resolves.toBe('exportiert');
  const zip = unzipSync(writeFile.mock.calls[0]![1] as Uint8Array);
  expect(
    Object.fromEntries(Object.entries(zip).map(([name, inhalt]) => [name, strFromU8(inhalt)])),
  ).toEqual({
    'Favoriten/BGB-favoriten.xml': 'Favoriten roh',
    'lesezeichen.xml': 'Lesezeichen roh',
    'Einstellungen/gesetzeskurzbefehle.xml': 'Gesetzeskurzbefehle roh',
  });
  expect(favoriten).toHaveBeenCalledOnce();
  expect(lesezeichen).toHaveBeenCalledOnce();
  expect(gesetzeskurzbefehle).toHaveBeenCalledOnce();
  expect(rohLesen).not.toHaveBeenCalled();
});
it('leere Speicherabfrage liefert keineDaten und schreibt keine Exportdatei', async () => {
  gesetzeskurzbefehle.mockResolvedValueOnce([]);
  await expect(exportiere(new Set(['gesetzeskurzbefehle']), {})).resolves.toBe('keineDaten');
  expect(writeFile).not.toHaveBeenCalled();
  expect(writeTextFile).not.toHaveBeenCalled();
  expect(rohLesen).not.toHaveBeenCalled();
  expect(favoriten).not.toHaveBeenCalled();
  expect(lesezeichen).not.toHaveBeenCalled();
});

vi.mock('@/lib/import-export/exportZiel', () => ({
  waehleExportZiel: async (name: string) => `/export/${name}`,
}));

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: vi.fn(),
}));
