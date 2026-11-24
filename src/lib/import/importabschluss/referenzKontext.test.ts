// referenzKontext.test.ts
// Ein gemeinsames Banner, eindeutige Diagnosen und erhaltene Arbeitsfehler.
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ lesen: vi.fn(), banner: vi.fn() }));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  leseReferenzVerzeichnis: mocks.lesen,
}));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: mocks.banner,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
}));
import { mitReferenzKontext, type ReferenzKontext } from './importabschluss.index';
beforeEach(() => {
  mocks.banner.mockReset();
  mocks.lesen.mockReset().mockImplementation(async (quelle: string) => ({
    eintraege: [],
    fehler: [{ quelle, meldung: 'Nicht lesbar' }],
  }));
});
it('bündelt mehrfach gelesene gleiche Diagnosen in genau einem Banner im finally', async () => {
  await mitReferenzKontext(async (k: ReferenzKontext) => {
    await Promise.all([k.referenzenFuer('de-bund'), k.referenzenFuer('de-bw')]);
    expect(mocks.banner).not.toHaveBeenCalled();
  });
  expect(mocks.banner).toHaveBeenCalledTimes(1);
  const { text, typ } = mocks.banner.mock.calls[0]![0];
  expect(typ).toBe('fehler');
  expect(text.match(/bund: Nicht lesbar/g)).toHaveLength(1);
  expect(text).toContain('eingeschränkt');
  expect(text).toContain('nur die verfügbaren Referenzen zur Verfügung');
  expect(text).toContain('Gesetzeszuordnungen können unvollständig oder falsch sein');
});
it('erhält den Arbeitsfehler und meldet trotzdem die Diagnose', async () => {
  const fehler = new Error('Arbeitsfehler');
  await expect(
    mitReferenzKontext(async (k: ReferenzKontext) => {
      await k.referenzenFuer('eu');
      throw fehler;
    }),
  ).rejects.toBe(fehler);
  expect(mocks.banner).toHaveBeenCalledTimes(1);
});
it('zeigt bei erfolgreichen Zugriffen kein Referenzbanner', async () => {
  mocks.lesen.mockResolvedValue({ eintraege: [], fehler: [] });
  await mitReferenzKontext((k) => k.referenzenFuer('de-bund'));
  expect(mocks.banner).not.toHaveBeenCalled();
});
it('verdeckt den Arbeitsfehler auch bei einem fehlerhaften Banner-Listener nicht', async () => {
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.banner.mockImplementation(() => {
    throw new Error('Listener');
  });
  const fehler = new Error('Arbeit');
  await expect(
    mitReferenzKontext(async (k: ReferenzKontext) => {
      await k.referenzenFuer('eu');
      throw fehler;
    }),
  ).rejects.toBe(fehler);
  protokoll.mockRestore();
});

it.each(['de-sn', 'unbekannt'])(
  'erzeugt für %s keine unpassenden Referenzen oder Diagnosen',
  async (normgeber) => {
    expect(await mitReferenzKontext((k) => k.referenzenFuer(normgeber))).toEqual([]);
    expect(mocks.lesen).not.toHaveBeenCalled();
    expect(mocks.banner).not.toHaveBeenCalled();
  },
);

it('erhält den Arbeitsfehler bei einem fehlerhaften Vorgangsempfänger ohne Bannerersatz', async () => {
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fehler = new Error('Arbeitsabbruch');
  const empfangen = vi.fn(() => {
    throw new Error('Empfänger');
  });
  try {
    await expect(
      mitReferenzKontext(async (kontext) => {
        await kontext.referenzenFuer('eu');
        throw fehler;
      }, empfangen),
    ).rejects.toBe(fehler);
    expect(empfangen).toHaveBeenCalledTimes(1);
    expect(mocks.banner).not.toHaveBeenCalled();
    expect(protokoll).toHaveBeenCalledTimes(1);
  } finally {
    protokoll.mockRestore();
  }
});
