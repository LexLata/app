// importindexErstellungEU.gesamtabnahme.test.ts
// Gesamtabnahme: EU-Erstellung, gespeichertes XML, Suche und kuratierte Überlagerung.
import { kuratierteEuropaFixture } from '@/test/import/europaImportFixtures';
import { expect, it, vi } from 'vitest';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';

const m = vi.hoisted(() => ({ dateien: new Map<string, string>(), fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: m.fetch }));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: async (pfad: string) => {
    const xml = m.dateien.get(pfad);
    if (xml === undefined) throw new Error(`Testdatei fehlt: ${pfad}`);
    return xml;
  },
  appDatenSchreiben: async (pfad: string, xml: string) => {
    m.dateien.set(pfad, xml);
  },
  sicherstelleOrdner: async () => {},
}));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (pfad: string) => pfad }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    if (pfad !== 'resources/europa/europaKuratiert.json')
      throw new Error(`Unerwarteter Ressourcenzugriff: ${pfad}`);
    return JSON.stringify(kuratierteEuropaFixture);
  },
}));
import { erstelleEuImportindex } from '@/lib/import/eu/eu.index';
import {
  alleImportindexEintraege,
  parseImportindex,
  leseImportindexAbgleichsSnapshot,
} from '@/lib/import/importindex/importindex.index';
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';

it('führt den erzeugten EU-Index durch Validierung, Suche und DSGVO-Überlagerung', async () => {
  // Mindestens 1.000 Basisakte passieren den echten Plausibilitätsschutz.
  const bindings = Array.from({ length: 1000 }, (_, i) => ({
    celex: { value: `32016R${String(i + 1).padStart(4, '0')}` },
    typ: { value: 'http://publications.europa.eu/resource/authority/resource-type/REG' },
    titel: {
      value: i === 678 ? 'Verordnung zum Schutz personenbezogener Daten' : `Verordnung ${i + 1}`,
    },
  }));
  m.fetch.mockResolvedValue(Response.json({ results: { bindings } }));

  expect(await erstelleEuImportindex()).toEqual({ erfolg: true, anzahl: 1000 });
  const gespeichert = m.dateien.get('importindizes/eu.xml');
  expect(gespeichert).toBeDefined();
  const { xml } = await leseImportindexAbgleichsSnapshot('eu');
  expect(xml).toBe(gespeichert);
  const schema = await pruefeSchema('importindex', xml);
  expect(schema.valid, JSON.stringify(schema.errors)).toBe(true);

  const rohindex = parseImportindex(xml);
  const abgeleitet = rohindex.find((e) => e.abrufkennung === '32016R0679');
  expect(abgeleitet).toMatchObject({ kurztitel: 'VO 2016/679', typ: 'verordnung' });
  expect(
    berechneTreffer('VO 2016/679', [], null, { 'de-bund': [], 'de-bw': [], eu: rohindex }),
  ).toEqual([{ art: 'index', quelle: 'eu', eintrag: abgeleitet }]);

  // Derselbe gespeicherte Index wird im regulären Leseweg kuratiert überlagert.
  const suchindex = await alleImportindexEintraege('eu');
  const datenschutz = suchindex.filter((e) => e.abrufkennung === '32016R0679');
  expect(datenschutz).toHaveLength(1);
  expect(datenschutz[0]).toMatchObject({ kurztitel: 'DSGVO', normgeber: 'eu' });
  expect(berechneTreffer('DSGVO', [], null, { 'de-bund': [], 'de-bw': [], eu: suchindex })).toEqual(
    [{ art: 'index', quelle: 'eu', eintrag: datenschutz[0] }],
  );
  expect(
    berechneTreffer('vo 2016/679', [], null, { 'de-bund': [], 'de-bw': [], eu: suchindex }),
  ).toEqual([{ art: 'index', quelle: 'eu', eintrag: datenschutz[0] }]);
  // Die Überlagerung verändert die Suchsicht, nicht das erzeugte XML.
  expect((await leseImportindexAbgleichsSnapshot('eu')).xml).toBe(xml);
  expect(m.fetch).toHaveBeenCalledOnce();
});
