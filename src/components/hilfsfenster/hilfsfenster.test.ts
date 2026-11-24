import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const geladen = vi.hoisted(() => ({
  verweismarkierung: vi.fn(),
  kommentar: vi.fn(),
  markierungskonflikte: vi.fn(),
  einstellungen: vi.fn(),
}));
const wurzeln = vi.hoisted(() => ({
  verweismarkierung: () => null,
  kommentar: () => null,
  markierungskonflikte: () => null,
  einstellungen: () => null,
}));
beforeEach(() => {
  vi.doMock('./verweismarkierung/VerweismarkierungFenster', () => {
    geladen.verweismarkierung();
    return { default: wurzeln.verweismarkierung };
  });
  vi.doMock('./kommentar/KommentarFenster', () => {
    geladen.kommentar();
    return { default: wurzeln.kommentar };
  });
  vi.doMock('./markierungskonflikte/MarkierungskonfliktFenster', () => {
    geladen.markierungskonflikte();
    return { default: wurzeln.markierungskonflikte };
  });
  vi.doMock('./einstellungsfenster/einstellungsfenster.index', () => {
    geladen.einstellungen();
    return { EinstellungenFenster: wurzeln.einstellungen };
  });
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it.each([
  ['verweismarkierung-1', 'verweismarkierung'],
  ['verweismarkierung-', 'verweismarkierung'],
  ['kommentar-1', 'kommentar'],
  ['kommentar-', 'kommentar'],
  ['markierungskonflikte', 'markierungskonflikte'],
  ['einstellungen', 'einstellungen'],
] as const)('lädt für %s ausschließlich die passende Wurzel', async (label, gruppe) => {
  const { ladeHilfsfensterWurzel } = await import('./hilfsfenster.index');
  expect(await ladeHilfsfensterWurzel(label)).toBe(wurzeln[gruppe]);
  for (const [name, aufruf] of Object.entries(geladen)) {
    expect(aufruf).toHaveBeenCalledTimes(name === gruppe ? 1 : 0);
  }
});

it.each([
  'main',
  'mobile',
  'unbekannt',
  '',
  'verweismarkierung',
  'kommentar',
  'einstellungen-1',
  'markierungskonflikte-1',
])('liefert für %s null ohne Komponentenladen', async (label) => {
  const { ladeHilfsfensterWurzel } = await import('./hilfsfenster.index');
  expect(await ladeHilfsfensterWurzel(label)).toBeNull();
  for (const aufruf of Object.values(geladen)) expect(aufruf).not.toHaveBeenCalled();
});

it('reicht einen Fehler des dynamischen Imports weiter', async () => {
  const fehler = new Error('Komponente nicht ladbar');
  geladen.kommentar.mockImplementationOnce(() => {
    throw fehler;
  });
  const { ladeHilfsfensterWurzel } = await import('./hilfsfenster.index');
  await expect(ladeHilfsfensterWurzel('kommentar-1')).rejects.toMatchObject({ cause: fehler });
  expect(geladen.verweismarkierung).not.toHaveBeenCalled();
  expect(geladen.markierungskonflikte).not.toHaveBeenCalled();
  expect(geladen.einstellungen).not.toHaveBeenCalled();
});
