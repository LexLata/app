// importindexEuropa.test.ts
// EU-Suchsicht, kuratierte Überlagerung und begrenztes Referenzverzeichnis.
import {
  europaRessourceFixture,
  kuratierteEuropaFixture,
} from '@/test/import/europaImportFixtures';
import { beforeEach, expect, it, vi } from 'vitest';
const { dateien } = vi.hoisted(() => ({ dateien: new Map<string, string>() }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetze: async () => [],
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
}));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: async (pfad: string) => {
    if (!dateien.has(pfad)) throw new Error('fehlt');
    return dateien.get(pfad)!;
  },
  appDatenSchreiben: async (pfad: string, xml: string) => {
    dateien.set(pfad, xml);
  },
  sicherstelleOrdner: async () => {},
}));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (pfad: string) => pfad }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    if (!dateien.has(pfad)) throw new Error('fehlt');
    return dateien.get(pfad)!;
  },
  readDir: async () => [{ name: 'EMRK_europarat.xml', isFile: true }],
}));
beforeEach(() => {
  vi.resetModules();
  dateien.clear();
  for (const pfad of [
    'importindizes/de-bund.xml',
    'importindizes/de-bw.xml',
    'importindizes/eu.xml',
    'europa/europaKuratiert.json',
    'europa/EMRK_europarat.xml',
  ]) {
    dateien.set(`resources/${pfad}`, europaRessourceFixture(pfad));
  }
  dateien.set('importindizes/eu.xml', dateien.get('resources/importindizes/eu.xml')!);
});
it('liefert Suche und Gesamtliste kuratiert und hält abgeleitete Angebote aus Referenzen heraus', async () => {
  const { serialisiereImportindex } = await import('./importindexErstellung');
  const { alleImportindexEintraege, sucheImImportindex, leseReferenzVerzeichnis } =
    await import('./importindex.index');
  const abgeleitet = {
    kurztitel: 'DVO 2020/123',
    langtitel: 'Weiterer Rechtsakt',
    abrufkennung: '32020R0123',
    typ: 'durchfuehrungsverordnung',
  };
  dateien.set(
    'importindizes/eu.xml',
    serialisiereImportindex(
      [
        {
          kurztitel: 'alter Titel',
          langtitel: 'alt',
          abrufkennung: '32016R0679',
          typ: 'durchfuehrungsverordnung',
        },
        abgeleitet,
      ],
      'eu',
    ),
  );
  const eintraege = await alleImportindexEintraege('eu');
  const dsgvo = await sucheImImportindex('eu', 'DSGVO');
  expect(dsgvo).toMatchObject({ kurztitel: 'DSGVO', abrufkennung: '32016R0679', normgeber: 'eu' });
  expect(dsgvo).not.toHaveProperty('typ');
  expect(dsgvo).toMatchObject({
    alternativen: ['Datenschutz-Test'],
    abgeleiteterKurztitel: 'alter Titel',
  });
  expect(eintraege.find((e) => e.kurztitel === 'AEUV')).not.toHaveProperty('alternativen');
  expect(eintraege.find((e) => e.kurztitel === 'GRCh')).toMatchObject({
    alternativen: ['Charta-Test'],
  });
  expect(eintraege.find((e) => e.kurztitel === 'DSGVO')).toEqual(dsgvo);
  expect(eintraege).toContainEqual(abgeleitet);
  expect(eintraege.some((e) => e.kurztitel === 'AEUV')).toBe(true);
  const referenzen = await leseReferenzVerzeichnis('eu');
  expect(referenzen.eintraege).toHaveLength(kuratierteEuropaFixture.length + 1);
  expect(referenzen.eintraege.some((e) => e.abrufkennung === abgeleitet.abrufkennung)).toBe(false);
  expect(referenzen.eintraege.find((e) => e.kurztitel === 'EMRK')?.normgeber).toBe('europarat');
});
it('ergänzt auch einen leeren Index um alle kuratierten Angebote', async () => {
  const { serialisiereImportindex } = await import('./importindexErstellung');
  dateien.set('importindizes/eu.xml', serialisiereImportindex([], 'eu'));
  const { alleImportindexEintraege } = await import('./importindex.index');
  expect(await alleImportindexEintraege('eu')).toHaveLength(kuratierteEuropaFixture.length);
});
it('erhält den Index bei fehlender kuratierter Liste', async () => {
  dateien.delete('resources/europa/europaKuratiert.json');
  const { alleImportindexEintraege, importindexDateiPfad } = await import('./importindexSuche');
  const { parseImportindex } = await import('./importindexValidierung');
  expect(importindexDateiPfad('eu')).toBe('importindizes/eu.xml');
  expect(await alleImportindexEintraege('eu')).toEqual(
    parseImportindex(dateien.get('importindizes/eu.xml')!),
  );
});
it.each([
  ['durchfuehrungsverordnung', true],
  ['durchfuehrungsrichtlinie', true],
  ['verordnung', false],
  [undefined, false],
] as const)('erkennt den Dokumenttyp %s', async (typ, erwartet) => {
  const { istDurchfuehrungsakt } = await import('@/lib/domain/euRechtsakt');
  expect(istDurchfuehrungsakt(typ)).toBe(erwartet);
});

it('weist den ausgelieferten Quellen über den bestehenden Referenzleser Normgeber eindeutig zu', async () => {
  const { mitReferenzKontext } = await import('@/lib/import/importabschluss/importabschluss.index');
  const melden = vi.fn();
  await mitReferenzKontext(async (kontext) => {
    const eu = await kontext.referenzenFuer('eu');
    const bund = await kontext.referenzenFuer('de-bund');
    const bw = await kontext.referenzenFuer('de-bw');
    for (const referenzen of [eu, bund, bw]) {
      expect(referenzen.length).toBeGreaterThan(0);
      expect(referenzen.every((r) => Boolean(r.normgeber))).toBe(true);
    }
    expect(eu.filter((r) => r.normgeber === 'eu')).toHaveLength(kuratierteEuropaFixture.length);
    expect(eu.find((r) => r.kurztitel === 'EMRK')?.normgeber).toBe('europarat');
    expect(bund.find((r) => r.kurztitel === 'BGB')?.normgeber).toBe('de-bund');
    expect(bw.find((r) => r.kurztitel === 'PolG')?.normgeber).toBe('de-bw');
  }, melden);
  expect(melden).not.toHaveBeenCalled();
});

it('liefert im Referenzimport genau die Kurztitel und keine Alternativen als Kandidaten', async () => {
  const { ladeGesetzeskandidaten } = await import('@/lib/import/dispatch/gesetzesreferenzImport');
  const kandidaten = await ladeGesetzeskandidaten();
  expect(kandidaten.filter((e) => e.normgeber === 'eu')).toEqual(
    kuratierteEuropaFixture.map(({ celex, kurztitel }) => ({
      kurztitel,
      normgeber: 'eu',
      abrufkennung: celex,
    })),
  );
  expect(kandidaten.find((e) => e.kurztitel === 'EMRK')).toMatchObject({ normgeber: 'europarat' });
  for (const eintrag of kuratierteEuropaFixture) {
    for (const alternative of eintrag.alternativen ?? []) {
      expect(kandidaten.some((e) => e.kurztitel === alternative)).toBe(false);
    }
  }
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: async () => [],
}));
