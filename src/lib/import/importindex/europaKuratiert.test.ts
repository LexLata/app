// europaKuratiert.test.ts
// Kuratierte EU-Angebote prüfen, ohne die öffentlichen Bundle-Leser umzustellen.
import fc from 'fast-check';
import { beforeEach, expect, it, vi } from 'vitest';
const { readTextFile } = vi.hoisted(() => ({ readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile }));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (pfad: string) => pfad }));
import { parseKuratierteListe, legeKuratierteListeUeber } from './europaKuratiert';
import { fuehreEuropaAngeboteZusammen } from './europaVerzeichnis';
const eintrag = { celex: '12016E/TXT', kurztitel: 'AEUV', langtitel: 'Vertrag' };
const angebot = {
  normgeber: 'eu',
  abrufkennung: eintrag.celex,
  kurztitel: 'AEUV',
  langtitel: 'Vertrag',
};
beforeEach(() => vi.resetModules());
it('liest die zulässigen CELEX-Formate und weist ungültige Listen zurück', () => {
  expect(parseKuratierteListe(JSON.stringify([eintrag]))).toEqual([eintrag]);
  for (const wert of [
    '{',
    '{}',
    '[{}]',
    JSON.stringify([{ ...eintrag, langtitel: ' ' }]),
    JSON.stringify([eintrag, eintrag]),
    JSON.stringify([{ ...eintrag, celex: 'falsch' }]),
  ]) {
    expect(() => parseKuratierteListe(wert)).toThrow();
  }
});
it('überlagert vollständig nach CELEX und ergänzt fehlende Einträge ohne Mutation', () => {
  const alt = {
    abrufkennung: eintrag.celex,
    kurztitel: 'alt',
    langtitel: 'alt',
    typ: 'durchfuehrungsverordnung',
    praefixstruktur: 'paragraph' as const,
  };
  expect(legeKuratierteListeUeber([alt], [eintrag])).toEqual([
    { ...angebot, abgeleiteterKurztitel: 'alt' },
  ]);
  expect(legeKuratierteListeUeber([], [eintrag])).toEqual([angebot]);
  expect(legeKuratierteListeUeber([alt], [])).toEqual([alt]);
  expect(
    legeKuratierteListeUeber(
      [{ abrufkennung: 'anderer', kurztitel: 'X', langtitel: 'X' }],
      [eintrag],
    ),
  ).toHaveLength(2);
  expect(alt.kurztitel).toBe('alt');
});
it('führt vorbereitete Angebote zusammen und erhält Diagnosen sowie EMRK', () => {
  const emrk = { abrufkennung: 'EMRK_europarat.xml', kurztitel: 'EMRK', langtitel: 'Konvention' };
  const bundle = { eintraege: [emrk], fehler: [] };
  expect(
    fuehreEuropaAngeboteZusammen(bundle, { eintraege: [angebot], fehler: [] }).eintraege,
  ).toEqual([angebot, emrk]);
  const fehler = { quelle: 'eu' as const, meldung: 'JSON fehlt' };
  expect(fuehreEuropaAngeboteZusammen(bundle, { eintraege: [], fehler: [fehler] })).toEqual({
    ...bundle,
    fehler: [fehler],
  });
});
it('meldet Lesefehler und ungültiges JSON, wiederholt danach und cached erst Erfolg', async () => {
  const { leseKuratierteListe: lesen } = await import('./europaKuratiert');
  readTextFile
    .mockReset()
    .mockRejectedValueOnce(new Error('fehlt'))
    .mockResolvedValueOnce('{}')
    .mockResolvedValueOnce(JSON.stringify([eintrag]));
  expect(await lesen()).toMatchObject({
    eintraege: [],
    fehler: [expect.objectContaining({ quelle: 'eu' })],
  });
  expect((await lesen()).fehler).toHaveLength(1);
  expect(await lesen()).toEqual({ eintraege: [angebot], fehler: [] });
  expect(await lesen()).toEqual({ eintraege: [angebot], fehler: [] });
  expect(readTextFile).toHaveBeenCalledTimes(3);
});

it('liest Alternativen und weist ungültige oder doppelte Namen und CELEX zurück', () => {
  const lesen = (werte: unknown[]) => parseKuratierteListe(JSON.stringify(werte));
  expect(lesen([{ ...eintrag, alternativen: ['Vertrag A'] }])[0]).toMatchObject({
    alternativen: ['Vertrag A'],
  });
  for (const alternativen of [
    null,
    'Name',
    [],
    [''],
    [' '],
    [7],
    ['AEUV'],
    [' aeuv '],
    ['X', ' x '],
  ]) {
    expect(() => lesen([{ ...eintrag, alternativen }])).toThrow();
  }
  expect(() => lesen([eintrag, { ...eintrag, kurztitel: 'Anders' }])).toThrow(/12016E/);
  expect(lesen([{ ...eintrag, unbekannt: 42 }])).toEqual([eintrag]);
  expect(() => lesen([eintrag, { ...eintrag, celex: '32024R0001', kurztitel: ' aeuv ' }])).toThrow(
    /aeuv/i,
  );
  expect(() =>
    lesen([
      eintrag,
      { celex: '32024R0001', kurztitel: 'Zwei', langtitel: 'Zwei', alternativen: [' aeuv '] },
    ]),
  ).toThrow(/aeuv/i);
});
it('erhält beliebige eindeutige Namen und lehnt jede Verdopplung ab', () => {
  const namen = fc.uniqueArray(
    fc.string({ minLength: 1, maxLength: 30 }).filter((name) => Boolean(name.trim())),
    {
      minLength: 2,
      maxLength: 30,
      selector: (name) => name.trim().toLowerCase(),
    },
  );
  fc.assert(
    fc.property(namen, fc.nat(), (werte, auswahl) => {
      const liste = werte.map((name, i) => ({
        celex: `32024R${String(i + 1).padStart(4, '0')}`,
        kurztitel: `Titel ${name}`,
        alternativen: [`Alternative ${name}`],
        langtitel: 'Titel',
      }));
      expect(parseKuratierteListe(JSON.stringify(liste))).toEqual(liste);
      const index = auswahl % liste.length;
      const quelle = liste[index];
      if (!quelle) throw new Error('Generierte Liste darf nicht leer sein.');
      const ziel = (index + 1) % liste.length;
      const mitCelex = liste.map((e, i) => (i === ziel ? { ...e, celex: quelle.celex } : e));
      expect(() => parseKuratierteListe(JSON.stringify(mitCelex))).toThrow(/CELEX/);
      for (const name of [quelle.kurztitel, ...quelle.alternativen]) {
        const mitName = liste.map((e, i) =>
          i === ziel ? { ...e, alternativen: [...e.alternativen, ` ${name.toLowerCase()} `] } : e,
        );
        expect(() => parseKuratierteListe(JSON.stringify(mitName))).toThrow(/Name/);
      }
    }),
  );
});
it('erhält Alternativen bei Überlagerung, Ergänzung und Zusammenführung', () => {
  const neu = { ...eintrag, alternativen: ['Vertrag A'] };
  for (const bestand of [
    [],
    [{ abrufkennung: eintrag.celex, kurztitel: 'abgeleitet', langtitel: 'Alt' }],
  ]) {
    expect(legeKuratierteListeUeber(bestand, [neu])[0]).toMatchObject({
      alternativen: neu.alternativen,
    });
  }
});
