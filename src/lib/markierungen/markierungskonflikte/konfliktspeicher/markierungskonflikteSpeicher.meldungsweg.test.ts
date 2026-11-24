// Echte Vorab-/Quellabschluss- und Konfliktdateiketten; nur native I/O-Grenzen ersetzt.
import { beforeEach, expect, it, vi } from 'vitest';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';

const io = vi.hoisted(() => ({
  xml: '<markierungskonflikte pruefstatus="aktuell"/>',
  vorhanden: true,
  lesefehler: undefined as unknown,
  schreibfehler: undefined as unknown,
  sperrfehler: undefined as unknown,
  sicherungsfehler: undefined as unknown,
  archivstatus: 'archiviert',
  syncfehler: undefined as unknown,
  abschlussfehler: undefined as unknown,
  gehalten: false,
  invoke: vi.fn(),
  banner: vi.fn(),
  schreiben: vi.fn(),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: io.emit }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: io.banner,
  meldeDateibefund: io.banner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async () => {
    if (io.lesefehler) throw io.lesefehler;
    if (!io.vorhanden) throw Error('fehlt');
    return io.xml;
  },
  exists: async () => io.vorhanden,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(io, {
    xml: '<markierungskonflikte pruefstatus="aktuell"/>',
    vorhanden: true,
    lesefehler: undefined,
    schreibfehler: undefined,
    sperrfehler: undefined,
    sicherungsfehler: undefined,
    archivstatus: 'archiviert',
    syncfehler: undefined,
    abschlussfehler: undefined,
    gehalten: false,
  });
  io.schreiben.mockImplementation(async (_: string, xml: string) => {
    if (io.schreibfehler) throw io.schreibfehler;
    io.xml = xml;
    io.vorhanden = true;
  });
  io.emit.mockImplementation(async () => {
    if (io.syncfehler) throw io.syncfehler;
  });
  io.invoke.mockImplementation(
    async (befehl: string, args?: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'atomar_datei_schreiben')
        return io.schreiben(args?.relativerPfad, args?.inhalt);
      if (befehl === 'datei_sperre_erwerben') {
        if (io.sperrfehler) throw io.sperrfehler;
        expect(io.gehalten).toBe(false);
        io.gehalten = true;
        return 'token';
      }
      if (befehl === 'datei_sperre_freigeben') {
        io.gehalten = false;
        return;
      }
      if (befehl === 'archiviere_beschaedigte_datei') {
        if (io.sicherungsfehler) throw io.sicherungsfehler;
        if (io.archivstatus === 'archiviert') io.vorhanden = false;
        return { status: io.archivstatus, sicherungspfad: 'sicherung.xml' };
      }
      if (befehl === 'pruefvorgang_registrieren') return 'v1';
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') return false;
      if (befehl === 'pruefvorgang_quelle_abschliessen' && io.abschlussfehler)
        throw io.abschlussfehler;
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    },
  );
});

async function kanal() {
  const speicher = await ladeSpeicherMitKette();
  speicher.initialisiereMarkierungen();
  return { kern: await import('@/lib/persistenz/kern/kern.index'), speicher };
}

it.each(['wartefrist', 'IPC'])('meldet innere Vorabsperre %s dem Vorgang', async (fehler) => {
  const { kern } = await kanal();
  io.sperrfehler = fehler;
  const empfangen = vi.fn();
  await expect(kern.merkePruefpflichtigeAenderungVor(empfangen)).rejects.toBe(fehler);
  expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'dateisperre' }));
  expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'pruefbedarf' }));
  expect(io.schreiben).not.toHaveBeenCalled();
  expect(io.banner).not.toHaveBeenCalled();
});

it('erhält Archivierungsbefund im realen Vorababschluss', async () => {
  const { kern } = await kanal();
  io.xml = '<fremd/>';
  const empfangen = vi.fn();
  expect(await kern.merkePruefpflichtigeAenderungVor(empfangen)).toBe('v1');
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'sicherung',
      art: 'hinweis',
      aenderungsstand: 'teilweise',
    }),
  );
  expect(io.xml).toContain('pruefstatus="ausstehend"');
  expect(io.banner).not.toHaveBeenCalled();
});

it('erhält erfolgreiche Sicherung neben abgewiesenem Vorabschreiben', async () => {
  const { kern } = await kanal();
  io.xml = '<fremd/>';
  io.schreibfehler = Error('Statusschreiben');
  const empfangen = vi.fn();
  await expect(kern.merkePruefpflichtigeAenderungVor(empfangen)).rejects.toBe(io.schreibfehler);
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'sicherung',
      aenderungsstand: 'teilweise',
    }),
  );
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'pruefbedarf',
      aenderungsstand: 'keine',
    }),
  );
  expect(io.vorhanden).toBe(false);
  expect(io.banner).not.toHaveBeenCalled();
});

it('meldet den unlesbaren Konfliktbestand ohne leeren Ersatz', async () => {
  const { kern } = await kanal();
  io.lesefehler = Error('Leserechte');
  const empfangen = vi.fn();
  await expect(kern.merkePruefpflichtigeAenderungVor(empfangen)).rejects.toBe(io.lesefehler);
  expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'lesen' }));
  expect(io.schreiben).not.toHaveBeenCalled();
  expect(io.banner).not.toHaveBeenCalled();
});

it('behält Quellabschluss bei fehlgeschlagener Änderungsbenachrichtigung erfolgreich', async () => {
  const { kern } = await kanal();
  const empfangen = vi.fn();
  const vorgang = await kern.merkePruefpflichtigeAenderungVor(empfangen);
  io.syncfehler = Error('Fenster weg');
  expect(await kern.schliessePruefpflichtigeQuelleAb(vorgang, 'unveraendert', empfangen)).toBe(
    true,
  );
  expect(io.xml).toContain('pruefstatus="aktuell"');
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'synchronisation',
      art: 'hinweis',
      aenderungsstand: 'vollstaendig',
    }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('ordnet gleichzeitige Vormerkungen ihren eigenen Empfängern zu', async () => {
  const { kern } = await kanal();
  const a = vi.fn();
  const b = vi.fn();
  io.sperrfehler = 'wartefrist';
  await Promise.allSettled([
    kern.merkePruefpflichtigeAenderungVor(a),
    kern.merkePruefpflichtigeAenderungVor(b),
  ]);
  expect(a.mock.calls.map(([m]) => m.anlass)).toEqual(['dateisperre', 'pruefbedarf']);
  expect(b.mock.calls.map(([m]) => m.anlass)).toEqual(['dateisperre', 'pruefbedarf']);
  expect(io.banner).not.toHaveBeenCalled();
});

it.each(['gesichert_aber_nicht_entfernt', 'Sicherungsfehler'])(
  'erhält Befund %s aus geschütztem Konfliktdateiladen',
  async (fall) => {
    const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
    io.xml = '<fremd/>';
    if (fall === 'Sicherungsfehler') io.sicherungsfehler = Error('Sicherung');
    else io.archivstatus = fall;
    const empfangen = vi.fn();
    await expect(datei.ladePruefstand('token', empfangen)).rejects.toThrow();
    expect(empfangen).toHaveBeenCalledWith(
      expect.objectContaining({
        anlass: 'sicherung',
        aenderungsstand: fall === 'Sicherungsfehler' ? 'keine' : 'teilweise',
      }),
    );
    expect(io.xml).toBe('<fremd/>');
    expect(io.schreiben).not.toHaveBeenCalled();
    expect(io.banner).not.toHaveBeenCalled();
  },
);

it('meldet gespeichertes Prüfergebnis gesondert vom fehlgeschlagenen nativen Abschluss', async () => {
  const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
  const stand = await datei.ladePruefstand();
  const empfangen = vi.fn();
  const invokeOriginal = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'pruefvorgang_vollpruefung_abschliessen') throw Error('Abschluss');
    return invokeOriginal(befehl, args);
  });
  await expect(datei.schreibePruefergebnis('token', stand, true, [], empfangen)).rejects.toThrow();
  expect(io.xml).toContain('pruefstatus="fehlgeschlagen"');
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'pruefabschluss',
      aenderungsstand: 'vollstaendig',
      art: 'hinweis',
    }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('erhält gespeicherten Prüfstand auch bei defektem Meldungsempfänger', async () => {
  const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
  io.syncfehler = Error('Sync');
  await expect(
    datei.schreibeGesetzKonflikte(new Map(), 'token', { pruefstatus: 'aktuell' }, () => {
      throw Error('Anzeige');
    }),
  ).resolves.toBeUndefined();
  expect(io.xml).toContain('pruefstatus="aktuell"');
  expect(io.banner).not.toHaveBeenCalled();
});

it('behält Hauptfensterstandard bei Archivierung ohne ausdrücklichen Empfänger', async () => {
  const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
  io.xml = '<fremd/>';
  await datei.ladePruefstand('token');
  expect(io.banner).toHaveBeenCalledWith(expect.objectContaining({ typ: 'warnung' }));
});

it('erhält fachliche Meldungen ohne zweite Prüfstatusquelle', async () => {
  const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
  const meldungen: AktionsMeldung[] = [];
  await datei.schreibeGesetzKonflikte(new Map(), 'token', { pruefstatus: 'ausstehend' }, (m) =>
    meldungen.push(m),
  );
  expect((await datei.ladePruefstand()).pruefstatus).toBe('ausstehend');
  expect(meldungen).toEqual([]);
});

it('erhält ursprünglichen Schreibfehler auch bei zusätzlichem nativem Fehlerabschluss', async () => {
  const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
  const stand = await datei.ladePruefstand();
  io.schreibfehler = Error('Originalschreiben');
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'pruefvorgang_fehler') throw Error('Nativer Fehlerabschluss');
    return original(befehl, args);
  });
  const empfangen = vi.fn();
  await expect(
    datei.schreibePruefergebnis('token', stand, false, [], empfangen),
  ).rejects.toMatchObject({
    original: io.schreibfehler,
  });
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'pruefabschluss',
      art: 'fehler',
      aenderungsstand: 'keine',
    }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});

it('erhält gespeicherte Quelländerung neben fehlgeschlagenem Koordinationsabschluss', async () => {
  const { kern, speicher } = await kanal();
  const empfangen = vi.fn();
  const vorgang = await kern.merkePruefpflichtigeAenderungVor(empfangen);
  io.abschlussfehler = Error('Quelle abschliessen');
  expect(await kern.schliessePruefpflichtigeQuelleAb(vorgang, 'geaendert', empfangen)).toBe(false);
  // Die automatische Wiederholung ist ein eigener Folgeauftrag; hier ohne neuen Prüfbedarf.
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      anlass: 'pruefabschluss',
      art: 'hinweis',
      aenderungsstand: 'vollstaendig',
    }),
  );
  expect(io.xml).toContain('pruefstatus="ausstehend"');
  expect(io.banner).not.toHaveBeenCalled();
});

it('meldet innere Quellabschluss-Schreibniederlage ausdrücklich', async () => {
  const { kern, speicher } = await kanal();
  const empfangen = vi.fn();
  const vorgang = await kern.merkePruefpflichtigeAenderungVor(empfangen);
  io.schreibfehler = Error('Statusschreiben');
  expect(await kern.schliessePruefpflichtigeQuelleAb(vorgang, 'unveraendert', empfangen)).toBe(
    false,
  );
  await speicher.reiheInPruefungsKetteEin(async () => {});
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ art: 'fehler', anlass: 'pruefabschluss' }),
  );
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ art: 'hinweis', anlass: 'pruefabschluss' }),
  );
  expect(io.xml).toContain('pruefstatus="ausstehend"');
  expect(io.banner).not.toHaveBeenCalled();
});

it('behält Hauptfensterstandard beim Prüffehler ohne Empfänger', async () => {
  const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
  const stand = await datei.ladePruefstand();
  io.schreibfehler = Error('Schreiben');
  await expect(datei.schreibePruefergebnis('token', stand, false)).rejects.toThrow();
  expect(io.banner).toHaveBeenCalledWith(expect.objectContaining({ typ: 'fehler' }));
});

it('behält bisheriges Hauptfensterprotokoll bei Benachrichtigungsfehler', async () => {
  const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
  io.syncfehler = Error('Sync');
  await expect(datei.schreibeGesetzKonflikte(new Map())).resolves.toBeUndefined();
  expect(io.xml).toContain('pruefstatus="ausstehend"');
  expect(io.banner).not.toHaveBeenCalled();
});

it('erhält Vorabschreibfehler neben gescheitertem nativen Abbruch', async () => {
  const { kern } = await kanal();
  io.schreibfehler = Error('Vorabschreiben');
  const abbruchfehler = Error('Nativer Abbruch');
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'pruefvorgang_abbrechen') throw abbruchfehler;
    return original(befehl, args);
  });
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  const empfangen = vi.fn();
  try {
    await expect(kern.merkePruefpflichtigeAenderungVor(empfangen)).rejects.toBe(io.schreibfehler);
    expect(protokoll).toHaveBeenCalledWith(expect.any(String), abbruchfehler);
    expect(empfangen).toHaveBeenCalledWith(expect.objectContaining({ anlass: 'pruefbedarf' }));
    expect(io.xml).toContain('pruefstatus="aktuell"');
    expect(io.banner).not.toHaveBeenCalled();
  } finally {
    protokoll.mockRestore();
  }
});

it('erhält Quellabschluss-Schreibfehler neben gescheitertem nativem Fehlerabschluss', async () => {
  const { kern, speicher } = await kanal();
  const empfangen = vi.fn();
  const vorgang = await kern.merkePruefpflichtigeAenderungVor(empfangen);
  io.schreibfehler = Error('Quellabschluss schreiben');
  const abschlussfehler = Error('Nativer Fehlerabschluss');
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (befehl: string, args: unknown) => {
    if (befehl === 'pruefvorgang_fehler') throw abschlussfehler;
    return original(befehl, args);
  });
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(await kern.schliessePruefpflichtigeQuelleAb(vorgang, 'unveraendert', empfangen)).toBe(
      false,
    );
    await speicher.reiheInPruefungsKetteEin(async () => {});
    expect(protokoll).toHaveBeenCalledWith(
      'Prüfpflichtiger Quellabschluss fehlgeschlagen:',
      io.schreibfehler,
    );
    expect(protokoll).toHaveBeenCalledWith(expect.any(String), abschlussfehler);
    expect(empfangen).toHaveBeenCalledWith(
      expect.objectContaining({ art: 'fehler', anlass: 'pruefabschluss' }),
    );
    expect(io.xml).toContain('pruefstatus="ausstehend"');
    expect(io.banner).not.toHaveBeenCalled();
  } finally {
    protokoll.mockRestore();
  }
});

async function ladeSpeicherMitKette() {
  const [speicher, kette] = await Promise.all([
    import('./markierungskonflikteSpeicher'),
    import('./markierungskonflikteSpeicher.pruefkette'),
  ]);
  return { ...speicher, reiheInPruefungsKetteEin: kette.reiheInPruefungsKetteEin };
}
