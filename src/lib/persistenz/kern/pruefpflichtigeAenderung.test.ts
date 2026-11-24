// Prüft die verpflichtende Vormerkung und die Fehlergrenze nach Quell-I/O.
import { beforeEach, expect, it, vi } from 'vitest';
import type { PruefpflichtigerQuellabschluss } from './kern.index';
import type { PruefpflichtigeAenderungEmpfaenger } from './pruefpflichtigeAenderung';

const zeigeBanner = vi.fn();
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it('verhindert ohne angemeldeten Empfänger jede Quelländerung', async () => {
  const { merkePruefpflichtigeAenderungVor } = await import('./kern.index');
  const schreiben = vi.fn();
  await expect(merkePruefpflichtigeAenderungVor().then(schreiben)).rejects.toThrow(
    'nicht initialisiert',
  );
  expect(schreiben).not.toHaveBeenCalled();
  expect(zeigeBanner).toHaveBeenCalledWith(expect.objectContaining({ typ: 'fehler' }));
});

it('registriert synchron ohne I/O und akzeptiert nur einen Empfänger', async () => {
  const { registrierePruefpflichtigeAenderung } = await import('./kern.index');
  const empfaenger: PruefpflichtigeAenderungEmpfaenger = {
    vormerken: vi.fn(),
    abschliessen: vi.fn(),
  };
  registrierePruefpflichtigeAenderung(empfaenger);
  registrierePruefpflichtigeAenderung(empfaenger);
  expect(empfaenger.vormerken).not.toHaveBeenCalled();
  expect(empfaenger.abschliessen).not.toHaveBeenCalled();
  expect(() =>
    registrierePruefpflichtigeAenderung({ vormerken: vi.fn(), abschliessen: vi.fn() }),
  ).toThrow('bereits angemeldet');
});

it('wartet auf dauerhafte Vormerkung und reicht die technische Referenz durch', async () => {
  const kanal = await import('./kern.index');
  let fertig!: (vorgang: string) => void;
  const vormerken = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        fertig = resolve;
      }),
  );
  kanal.registrierePruefpflichtigeAenderung({ vormerken, abschliessen: vi.fn() });
  const schreiben = vi.fn();
  const ergebnis = kanal.merkePruefpflichtigeAenderungVor().then(schreiben);
  await Promise.resolve();
  expect(schreiben).not.toHaveBeenCalled();
  fertig('vorgang-1');
  await ergebnis;
  expect(schreiben).toHaveBeenCalledWith('vorgang-1');
});

it('erhält den Vorabfehler und führt keine Quelldatenaktion aus', async () => {
  const kanal = await import('./kern.index');
  const fehler = new Error('Statusschreiben');
  kanal.registrierePruefpflichtigeAenderung({
    vormerken: vi.fn().mockRejectedValue(fehler),
    abschliessen: vi.fn(),
  });
  const schreiben = vi.fn();
  await expect(kanal.merkePruefpflichtigeAenderungVor().then(schreiben)).rejects.toBe(fehler);
  expect(schreiben).not.toHaveBeenCalled();
});

it.each<PruefpflichtigerQuellabschluss>(['geaendert', 'unveraendert', 'fehlgeschlagen'])(
  'übermittelt Abschluss %s mit derselben Referenz',
  async (ergebnis) => {
    const kanal = await import('./kern.index');
    const abschliessen = vi.fn().mockResolvedValue(undefined);
    kanal.registrierePruefpflichtigeAenderung({
      vormerken: vi.fn().mockResolvedValue('vorgang-1'),
      abschliessen,
    });
    const vorgang = await kanal.merkePruefpflichtigeAenderungVor();
    await expect(kanal.schliessePruefpflichtigeQuelleAb(vorgang, ergebnis)).resolves.toBe(true);
    expect(abschliessen).toHaveBeenCalledWith(vorgang, ergebnis);
  },
);

it('macht einen Transportfehler nach erfolgreichem Schreiben sichtbar ohne Speicherfehler', async () => {
  const kanal = await import('./kern.index');
  kanal.registrierePruefpflichtigeAenderung({
    vormerken: vi.fn().mockResolvedValue('vorgang-1'),
    abschliessen: vi.fn().mockRejectedValue(new Error('IPC')),
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(kanal.schliessePruefpflichtigeQuelleAb('vorgang-1', 'geaendert')).resolves.toBe(
    false,
  );
  expect(zeigeBanner).toHaveBeenCalledWith(
    expect.objectContaining({
      typ: 'fehler',
      text: expect.stringContaining('gespeichert'),
    }),
  );
});

it('lässt auch einen defekten Bannerempfänger keinen nachträglichen Speicherfehler erzeugen', async () => {
  const kanal = await import('./kern.index');
  kanal.registrierePruefpflichtigeAenderung({
    vormerken: vi.fn(),
    abschliessen: vi.fn().mockRejectedValue(new Error('IPC')),
  });
  zeigeBanner.mockImplementationOnce(() => {
    throw new Error('Banner');
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(kanal.schliessePruefpflichtigeQuelleAb('vorgang-1', 'geaendert')).resolves.toBe(
    false,
  );
});

it('meldet fehlenden Prüfbedarf dem ausdrücklichen Empfänger vor jeder Quelländerung', async () => {
  const kanal = await import('./kern.index');
  const meldungEmpfangen = vi.fn();
  const schreiben = vi.fn();
  await expect(
    kanal.merkePruefpflichtigeAenderungVor(meldungEmpfangen).then(schreiben),
  ).rejects.toThrow('nicht initialisiert');
  expect(schreiben).not.toHaveBeenCalled();
  expect(meldungEmpfangen).toHaveBeenCalledWith(
    expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler', aenderungsstand: 'keine' }),
  );
  expect(zeigeBanner).not.toHaveBeenCalled();
});
it.each<PruefpflichtigerQuellabschluss>(['geaendert', 'unveraendert', 'fehlgeschlagen'])(
  'meldet unbestätigten Abschluss %s ausdrücklich und bewahrt den Status',
  async (ergebnis) => {
    const kanal = await import('./kern.index');
    kanal.registrierePruefpflichtigeAenderung({
      vormerken: vi.fn(),
      abschliessen: vi.fn().mockRejectedValue(new Error('IPC')),
    });
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    const meldungEmpfangen = vi.fn();
    await expect(
      kanal.schliessePruefpflichtigeQuelleAb('v1', ergebnis, meldungEmpfangen),
    ).resolves.toBe(false);
    expect(meldungEmpfangen).toHaveBeenCalledWith(
      expect.objectContaining({
        anlass: 'pruefabschluss',
        art: 'hinweis',
        aenderungsstand: ergebnis === 'geaendert' ? 'vollstaendig' : 'keine',
      }),
    );
    expect(zeigeBanner).not.toHaveBeenCalled();
    protokoll.mockRestore();
  },
);
