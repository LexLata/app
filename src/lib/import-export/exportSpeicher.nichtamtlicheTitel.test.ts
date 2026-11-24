import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';

const titelLesen = vi.fn();
const writeFile = vi.fn();

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args),
  writeTextFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/path', () => ({
  join: (...teile: string[]) => Promise.resolve(teile.join('/')),
}));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: vi.fn(),
  appDatenOrdnerLesen: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeAlleGesetze: vi.fn(),
  ladeGesetzesXML: vi.fn(),
  leseGesetzInfos: vi.fn(),
  leseNichtamtlicheTitelFuerExport: () => titelLesen(),
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({ MARKIERUNGEN_ORDNER: 'markierungen' }));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  leseGesetzeskurzbefehleFuerExport: vi.fn(async () => []),
}));
vi.mock('@/lib/import/import.index', () => ({
  importindexDateiPfad: vi.fn(),
  IMPORTINDEX_BUNDESRECHT_DATEINAME: 'de-bund.xml',
  IMPORTINDEX_LANDESRECHT_BW_DATEINAME: 'de-bw.xml',
}));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  baueEinstellungenXML: vi.fn(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  leseFavoritenFuerExport: vi.fn(async () => []),
}));
vi.mock('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher', () => ({
  leseLesezeichenFuerExport: vi.fn(async () => []),
}));

import { exportiere } from './exportSpeicher';

beforeEach(() => {
  titelLesen.mockReset().mockResolvedValue([
    { name: 'GG-nichtamtliche-titel.xml', inhalt: '<gg/>' },
    { name: 'BGB-nichtamtliche-titel.xml', inhalt: '<bgb/>' },
  ]);
  writeFile.mockReset().mockResolvedValue(undefined);
});

describe('Export nichtamtlicher Titel', () => {
  it('legt gelesene Titel in der bisherigen ZIP-Kategorie ab', async () => {
    await expect(exportiere(new Set(['alleNichtamtlicheTitel']), {})).resolves.toBe('exportiert');

    const zip = writeFile.mock.calls[0]?.[1] as Uint8Array;
    const eintraege = unzipSync(zip);
    expect(Object.keys(eintraege).sort()).toEqual([
      'Nichtamtliche Titel/BGB-nichtamtliche-titel.xml',
      'Nichtamtliche Titel/GG-nichtamtliche-titel.xml',
    ]);
    expect(strFromU8(eintraege['Nichtamtliche Titel/GG-nichtamtliche-titel.xml']!)).toBe('<gg/>');
  });
});

vi.mock('@/lib/import-export/exportZiel', () => ({
  waehleExportZiel: async (name: string) => `/export/${name}`,
}));

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: vi.fn(),
}));
