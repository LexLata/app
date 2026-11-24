// Gesetzesreferenzen laden und vergleichen gegen einen case-sensitiven Dateibestand.
import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

const io = vi.hoisted(() => ({ dateien: new Map<string, string>(), lesen: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  return dateiAttrappen(io.dateien, io.lesen);
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string) => {
    if (befehl === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(io.dateien);
    return 'token';
  },
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn() }));
import { ladeGesetzesXML } from '@/lib/persistenz/gesetz/gesetz.index';
import { vergleicheMitBestand } from './gesetzDateiVerarbeitung';

beforeEach(() => {
  io.dateien.clear();
  io.lesen.mockReset().mockImplementation(async (pfad: string) => {
    const xml = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (xml === undefined) throw new Error('Nicht lesbar');
    return xml;
  });
});
it.each([
  ['BGB_de-bund', { kurztitel: 'bgb', normgeber: 'de-bund' }],
  ['Xyz_de-bund', gesetzesreferenz({ kurztitel: 'xyz' })],
] as const)('lädt und vergleicht %s über die Referenz', async (basis, referenz) => {
  const xml = `<gesetz><infos><kurztitel>${referenz.kurztitel}</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><text><absatz>alt</absatz></text></norm></inhalt></gesetz>`;
  io.dateien.set(`gesetze/${basis}.xml`, xml);
  expect(await ladeGesetzesXML(referenz)).toBe(xml);
  expect(await vergleicheMitBestand(xml, referenz)).toBe('unveraendert');
  expect(await vergleicheMitBestand(xml.replace('alt', 'neu'), referenz)).toBe('geaendert');
  const andereReferenz: Gesetzesreferenz = { ...referenz, normgeber: 'eu' };
  expect(await ladeGesetzesXML(andereReferenz)).toBeNull();
  expect(await vergleicheMitBestand(xml, andereReferenz)).toBe('neu');
});
it('liefert null bei unlesbarer Datei und reicht Mehrdeutigkeit weiter', async () => {
  io.dateien.set('gesetze/BGB_de-bund.xml', '<gesetz/>');
  io.lesen.mockRejectedValue(new Error('Lesefehler'));
  const referenz = { kurztitel: 'bgb', normgeber: 'de-bund' };
  expect(await ladeGesetzesXML(referenz)).toBeNull();
  io.dateien.set('gesetze/Bgb_de-bund.xml', '<gesetz/>');
  await expect(ladeGesetzesXML(referenz)).rejects.toThrow('Mehrere Dateien');
});
