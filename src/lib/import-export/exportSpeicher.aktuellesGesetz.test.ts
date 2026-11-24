import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { beforeEach, expect, it, vi } from 'vitest';

const leseGesetzesreferenzen = vi.fn();
const ladeGesetzesXML = vi.fn();
const writeTextFile = vi.fn();
const writeFile = vi.fn();

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args),
  writeTextFile: (...args: unknown[]) => writeTextFile(...args),
}));
vi.mock('@tauri-apps/api/path', () => ({
  join: (...teile: string[]) => Promise.resolve(teile.join('/')),
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenLesen: vi.fn(),
  appDatenOrdnerLesen: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>();
  return {
    ...original,
    leseGesetzesreferenzen: () => leseGesetzesreferenzen(),
    leseGesetz: async () => ({
      status: 'geladen',
      gesetz: (await leseGesetzesreferenzen())[0],
      befunde: [],
    }),
    ladeGesetzesXML: (referenz: Gesetzesreferenz) => ladeGesetzesXML(referenz),
  };
});
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}), emitTo: vi.fn() }));
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
  vi.clearAllMocks();
});

it.each([
  { kurztitel: 'BGB', normgeber: 'de-bund' },
  { kurztitel: 'BGB', normgeber: 'de-bw' },
  gesetzesreferenz({ kurztitel: 'Xyz' }),
])('exportiert die Referenz %j als aktuelles Gesetz und in der Sammlung', async (referenz) => {
  const xml = '<gesetz/>';
  ladeGesetzesXML.mockResolvedValue(xml);
  leseGesetzesreferenzen.mockResolvedValue([referenz]);
  for (const kategorie of ['aktuellesGesetz', 'alleGesetze'] as const) {
    vi.clearAllMocks();
    await expect(exportiere(new Set([kategorie]), { aktuellesGesetz: referenz })).resolves.toBe(
      'exportiert',
    );
    expect(ladeGesetzesXML).toHaveBeenCalledExactlyOnceWith(referenz);
    expect(writeTextFile).toHaveBeenCalledExactlyOnceWith(
      `/export/${referenz.kurztitel}_${referenz.normgeber ?? 'unbekannt'}.xml`,
      xml,
    );
  }
});

it.each([null, ''])('exportiert fehlendes oder unlesbares XML nicht: %s', async (xml) => {
  ladeGesetzesXML.mockResolvedValue(xml);
  await expect(
    exportiere(new Set(['aktuellesGesetz']), {
      aktuellesGesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    }),
  ).resolves.toBe('keineDaten');
  expect(writeTextFile).not.toHaveBeenCalled();
  expect(writeFile).not.toHaveBeenCalled();
});

vi.mock('@/lib/import-export/exportZiel', () => ({
  waehleExportZiel: async (name: string) => `/export/${name}`,
}));

it.each(['de-bund', 'de-bw', 'eu'])(
  'kodiert den Kurztitel A/B im Exportdateinamen für %s',
  async (normgeber) => {
    const referenz = { kurztitel: 'A/B', normgeber };
    const xml = `<gesetz version="1"><infos><kurztitel>A/B</kurztitel><normgeber>${normgeber}</normgeber></infos><inhalt/></gesetz>`;
    ladeGesetzesXML.mockResolvedValue(xml);
    await expect(
      exportiere(new Set(['aktuellesGesetz']), { aktuellesGesetz: referenz }),
    ).resolves.toBe('exportiert');
    expect(ladeGesetzesXML).toHaveBeenCalledExactlyOnceWith(referenz);
    expect(writeTextFile).toHaveBeenCalledExactlyOnceWith(`/export/A%2FB_${normgeber}.xml`, xml);
    expect(leseGesetzesreferenzen).not.toHaveBeenCalled();
  },
);

it('reicht einen Fehler beim Schreiben des Exports unverändert weiter', async () => {
  const fehler = new Error('Exportziel nicht beschreibbar');
  ladeGesetzesXML.mockResolvedValue('<gesetz/>');
  writeTextFile.mockRejectedValueOnce(fehler);
  await expect(
    exportiere(new Set(['aktuellesGesetz']), {
      aktuellesGesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    }),
  ).rejects.toBe(fehler);
  expect(writeTextFile).toHaveBeenCalledExactlyOnceWith('/export/BGB_de-bund.xml', '<gesetz/>');
});
