import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { europaRessourceFixture, importindexFixture } from '@/test/import/europaImportFixtures';

const io = vi.hoisted(() => ({
  lokal: new Map<string, string>(),
  fehler: new Set<string>(),
  lesen: vi.fn(),
  ressourcen: vi.fn(),
  schreiben: vi.fn(),
  ordner: vi.fn(),
  vorhanden: vi.fn(),
  listener: vi.fn(),
  senden: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: io.listener, emitTo: io.senden }));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: io.lesen,
  appDatenSchreiben: io.schreiben,
  sicherstelleOrdner: async () => {},
}));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (p: string) => p }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: io.ressourcen,
  exists: io.vorhanden,
  readDir: io.ordner,
}));
afterEach(() => vi.unstubAllGlobals());
let api: typeof import('../import.index');
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  io.listener.mockResolvedValue(() => {});
  io.senden.mockResolvedValue(undefined);
  io.fehler.clear();
  io.lokal.clear();
  for (const name of ['de-bund.xml', 'de-bw.xml', 'eu.xml'])
    io.lokal.set(`importindizes/${name}`, europaRessourceFixture(name));
  io.lesen.mockImplementation(async (p: string) => {
    if (io.fehler.has(p) || !io.lokal.has(p)) throw Error(p);
    return io.lokal.get(p);
  });
  io.schreiben.mockImplementation(async (p: string, xml: string) => {
    if (io.fehler.has('schreiben')) throw Error('Schreibfehler');
    io.lokal.set(p, xml);
  });
  io.ressourcen.mockImplementation(async (p: string) => {
    if (io.fehler.has(p)) throw Error(p);
    if (p.includes('praefixstrukturen'))
      return `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>${p.endsWith('de-bund.xml') ? 'de-bund' : 'de-bw'}</normgeber></infos><inhalt/></praefixstrukturen>`;
    return europaRessourceFixture(p);
  });
  io.vorhanden.mockImplementation(async (p: string) => !io.fehler.has(`fehlt:${p}`));
  io.ordner.mockImplementation(async () => {
    if (io.fehler.has('ordner')) throw Error('Ordnerfehler');
    return [{ name: 'EMRK_europarat.xml', isFile: true }];
  });
  api = await import('../import.index');
});

it('teilt paralleles Laden und bewahrt vollständige Ergebnisse synchron ohne weitere Lesungen', async () => {
  const [a, b] = await Promise.all([
    api.sucheKandidatenAlleQuellen(),
    api.sucheKandidatenAlleQuellen(),
  ]);
  expect(a).toBe(b);
  expect(api.leseImportindexZwischenspeicher()).toBe(a);
  const anzahl = io.lesen.mock.calls.length + io.ressourcen.mock.calls.length;
  expect(await api.sucheKandidatenAlleQuellen()).toBe(a);
  expect(io.lesen.mock.calls.length + io.ressourcen.mock.calls.length).toBe(anzahl);
});

it.each([
  ['Bundesindex', ['importindizes/de-bund.xml', 'resources/importindizes/de-bund.xml']],
  ['Landesindex', ['importindizes/de-bw.xml', 'resources/importindizes/de-bw.xml']],
  ['Europaindex', ['importindizes/eu.xml', 'resources/importindizes/eu.xml']],
  ['Europa-Ordner', ['ordner']],
  ['Europa-Datei', ['resources/europa/EMRK_europarat.xml']],
  ['kuratierte Liste', ['resources/europa/europaKuratiert.json']],
  ['Bund-Präfixergänzung', ['resources/praefixstrukturen/de-bund.xml']],
  ['BW-Präfixergänzung', ['resources/praefixstrukturen/de-bw.xml']],
  ['fehlende Bund-Präfixressource', ['fehlt:resources/praefixstrukturen/de-bund.xml']],
  ['fehlende BW-Präfixressource', ['fehlt:resources/praefixstrukturen/de-bw.xml']],
])(
  'behält verfügbare Einträge bei Fehler in %s, wiederholt erst beim nächsten Aufruf',
  async (_name, fehler) => {
    fehler.forEach((f) => io.fehler.add(f));
    const [a, b] = await Promise.all([
      api.sucheKandidatenAlleQuellen(),
      api.sucheKandidatenAlleQuellen(),
    ]);
    expect(a).toBe(b);
    expect(Object.values(a).flat().length).toBeGreaterThan(0);
    expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
    const lesungen = io.lesen.mock.calls.length + io.ressourcen.mock.calls.length;
    await new Promise((fertig) => setTimeout(fertig, 0));
    expect(io.lesen.mock.calls.length + io.ressourcen.mock.calls.length).toBe(lesungen);
    io.fehler.clear();
    const neu = await api.sucheKandidatenAlleQuellen();
    expect(neu).not.toBe(a);
    expect(api.leseImportindexZwischenspeicher()).toBe(neu);
  },
);

it.each(['de-bund', 'de-bw'])(
  'merkt keine Formatfehler der Präfixergänzung %s',
  async (normgeber) => {
    const lesen =
      io.ressourcen.getMockImplementation() ??
      (() => {
        throw Error('Leser fehlt');
      });
    io.ressourcen.mockImplementation((p: string) =>
      p === `resources/praefixstrukturen/${normgeber}.xml`
        ? Promise.resolve('<falsch/>')
        : lesen(p),
    );
    const a = await api.sucheKandidatenAlleQuellen();
    expect(a[normgeber === 'de-bund' ? 'de-bund' : 'de-bw']).toHaveLength(1);
    expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
    io.ressourcen.mockImplementation(lesen);
    expect(await api.sucheKandidatenAlleQuellen()).not.toBe(a);
    expect(api.leseImportindexZwischenspeicher()).toBeDefined();
  },
);

it('merkt gültige leere Quellen einschließlich leerer Präfixlisten', async () => {
  for (const [datei, quelle] of [
    ['de-bund', 'de-bund'],
    ['de-bw', 'de-bw'],
    ['eu', 'eu'],
  ])
    io.lokal.set(`importindizes/${datei}.xml`, importindexFixture(quelle, ''));
  const lesen =
    io.ressourcen.getMockImplementation() ??
    (() => {
      throw Error('Leser fehlt');
    });
  io.ressourcen.mockImplementation((p: string) =>
    p.endsWith('europaKuratiert.json') ? Promise.resolve('[]') : lesen(p),
  );
  io.ordner.mockResolvedValue([]);
  const a = await api.sucheKandidatenAlleQuellen();
  expect(a).toEqual({ 'de-bund': [], 'de-bw': [], eu: [] });
  expect(await api.sucheKandidatenAlleQuellen()).toBe(a);
});

function neuerBund(kurztitel = 'Neu') {
  return importindexFixture(
    'de-bund',
    `<gesetz><kurztitel>${kurztitel}</kurztitel><langtitel>Neues Gesetz</langtitel><abrufkennung>neu</abrufkennung></gesetz>`,
  ).replace('2026-10-01', '2026-10-28');
}

it.each(['Standard', 'Dateiübernahme', 'Erstellung', 'Zeitstempelauffrischung'])(
  'invalidiert und benachrichtigt nach tatsächlicher Schreibung: %s',
  async (weg) => {
    const alt = await api.sucheKandidatenAlleQuellen();
    const empfangen = vi.fn();
    const abmelden = api.beiImportindexInvalidiert(empfangen);
    if (weg === 'Standard') await api.stelleStandardWieder('de-bund');
    if (weg === 'Dateiübernahme') await api.uebernehmeImportindexDatei(neuerBund());
    if (weg === 'Erstellung' || weg === 'Zeitstempelauffrischung') {
      const { speichereImportindexAktualisierung } = await import('./importindex.index');
      await speichereImportindexAktualisierung(
        'de-bund',
        weg === 'Erstellung' ? neuerBund() : europaRessourceFixture('de-bund.xml'),
      );
    }
    expect(empfangen).toHaveBeenCalledTimes(1);
    expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
    const neu = await api.sucheKandidatenAlleQuellen();
    expect(neu).not.toBe(alt);
    expect(neu['de-bund'][0]?.kurztitel).toBe(
      ['Standard', 'Zeitstempelauffrischung'].includes(weg) ? 'BGB' : 'Neu',
    );
    abmelden();
    await api.stelleStandardWieder('de-bund');
    expect(empfangen).toHaveBeenCalledTimes(1);
  },
);

it('invalidiert weder beim Lesen noch beim unveränderten Abgleich, Dateiimport oder fehlgeschlagenen Schreiben', async () => {
  const alt = await api.sucheKandidatenAlleQuellen();
  const empfangen = vi.fn();
  api.beiImportindexInvalidiert(empfangen);
  const { alleImportindexEintraege } = await import('./importindex.index');
  await alleImportindexEintraege('de-bund');
  await api.synchronisiereStartupImportindizes();
  expect((await api.uebernehmeImportindexDatei(europaRessourceFixture('de-bund.xml'))).aktion).toBe(
    'unveraendert',
  );
  io.fehler.add('schreiben');
  await expect(api.stelleStandardWieder('de-bund')).rejects.toThrow('Schreibfehler');
  await expect(api.uebernehmeImportindexDatei(neuerBund())).rejects.toThrow('Schreibfehler');
  const { speichereImportindexAktualisierung } = await import('./importindex.index');
  await expect(speichereImportindexAktualisierung('de-bund', neuerBund())).rejects.toThrow(
    'Schreibfehler',
  );
  expect(empfangen).not.toHaveBeenCalled();
  expect(api.leseImportindexZwischenspeicher()).toBe(alt);
});

it.each([false, true])(
  'liefert bei mehreren Invalidierungen allen Wartenden nur die aktuelle Generation (Teilfehler: %s)',
  async (teilfehler) => {
    let freigeben!: () => void;
    let angefangen!: () => void;
    const gestartet = new Promise<void>((r) => {
      angefangen = r;
    });
    const sperre = new Promise<void>((r) => {
      freigeben = r;
    });
    const lesen =
      io.ressourcen.getMockImplementation() ??
      (() => {
        throw Error('Leser fehlt');
      });
    let erster = true;
    io.ressourcen.mockImplementation(async (p: string) => {
      if (erster && p === 'resources/praefixstrukturen/de-bund.xml') {
        erster = false;
        angefangen();
        await sperre;
      }
      return lesen(p);
    });
    const a = api.sucheKandidatenAlleQuellen();
    const b = api.sucheKandidatenAlleQuellen();
    await gestartet;
    await api.uebernehmeImportindexDatei(neuerBund('Zwischenstand'));
    const { speichereImportindexAktualisierung } = await import('./importindex.index');
    await speichereImportindexAktualisierung('de-bund', neuerBund('Aktuell'));
    if (teilfehler) io.fehler.add('ordner');
    const c = api.sucheKandidatenAlleQuellen();
    // Der neue Ladevorgang darf auch vor dem überholten fertig werden.
    const aktuell = await c;
    freigeben();
    expect(await a).toBe(aktuell);
    expect(await b).toBe(aktuell);
    expect(aktuell['de-bund'][0]?.kurztitel).toBe('Aktuell');
    expect(io.lesen.mock.calls.filter(([p]) => p === 'importindizes/de-bund.xml')).toHaveLength(8); // zweimal drei Lesen, eine Prüfung der Dateiübernahme und ein Lesen der Aktualisierung
    const anzahl = io.lesen.mock.calls.length;
    await new Promise((r) => setTimeout(r, 0));
    expect(io.lesen).toHaveBeenCalledTimes(anzahl);
    expect(api.leseImportindexZwischenspeicher()).toBe(teilfehler ? undefined : aktuell);
  },
);

it.each(['fehlend', 'defekt'])(
  'beendet die erstmalige Wiederherstellung eines %s Index mit aktuellem Bestand',
  async (art) => {
    if (art === 'fehlend') io.lokal.delete('importindizes/de-bund.xml');
    else io.lokal.set('importindizes/de-bund.xml', '<kaputt/>');
    const empfangen = vi.fn();
    api.beiImportindexInvalidiert(empfangen);
    const [a, b] = await Promise.all([
      api.sucheKandidatenAlleQuellen(),
      api.sucheKandidatenAlleQuellen(),
    ]);
    expect(a).toBe(b);
    expect(api.leseImportindexZwischenspeicher()).toBe(a);
    expect(a['de-bund'][0]?.kurztitel).toBe('BGB');
    expect(empfangen).toHaveBeenCalledTimes(1);
    expect(io.schreiben).toHaveBeenCalledTimes(1);
  },
);

it('erhält den Fehler der EU-Überlagerung auch bei später erfolgreichem Europa-Zugriff', async () => {
  const lesen =
    io.ressourcen.getMockImplementation() ??
    (() => {
      throw Error('Leser fehlt');
    });
  let anzahl = 0;
  let freigeben: () => void = () => {};
  const sperre = new Promise<void>((r) => {
    freigeben = r;
  });
  io.ressourcen.mockImplementation(async (p: string) => {
    if (p.endsWith('europaKuratiert.json')) {
      anzahl++;
      if (anzahl === 1)
        await sperre; // Europa-Verzeichnis startet zuerst.
      else if (anzahl === 2) {
        freigeben();
        throw Error('EU-Überlagerung fehlgeschlagen');
      }
    }
    return lesen(p);
  });
  const a = await api.sucheKandidatenAlleQuellen();
  expect(a.eu.some((e) => e.kurztitel === 'VO 2016/679')).toBe(true);
  expect(a.eu.some((e) => e.kurztitel === 'EMRK')).toBe(true);
  expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
  expect(await api.sucheKandidatenAlleQuellen()).not.toBe(a);
  expect(api.leseImportindexZwischenspeicher()).toBeDefined();
});

it('aggregiert Bund, BW, kuratierte EU-Angebote und Europa-Dateien', async () => {
  const a = await api.sucheKandidatenAlleQuellen();
  expect(a['de-bund'].map((e) => e.kurztitel)).toEqual(['BGB']);
  expect(a['de-bw'].map((e) => e.kurztitel)).toEqual(['PolG']);
  expect(a.eu.map((e) => [e.kurztitel, e.praefixstruktur])).toEqual([
    ['DSGVO', 'artikel'],
    ['EUV', 'artikel'],
    ['AEUV', 'artikel'],
    ['GRCh', 'artikel'],
    ['EMRK', undefined],
  ]);
});

it('liefert bei Ausfall aller Quellen leere Kategorien ohne Ablehnung', async () => {
  for (const name of ['de-bund.xml', 'de-bw.xml', 'eu.xml']) {
    io.fehler.add(`importindizes/${name}`);
    io.fehler.add(`resources/importindizes/${name}`);
  }
  io.fehler.add('ordner');
  io.fehler.add('resources/europa/europaKuratiert.json');
  await expect(api.sucheKandidatenAlleQuellen()).resolves.toEqual({
    'de-bund': [],
    'de-bw': [],
    eu: [],
  });
});

it('invalidiert fremde Ereignisse einmal ohne Rücksendung und ignoriert verspätete eigene Rückläufer', async () => {
  await api.sucheKandidatenAlleQuellen();
  const empfangen = vi.fn();
  api.beiImportindexInvalidiert(empfangen);
  await api.stelleStandardWieder('de-bund');
  await Promise.resolve();
  await vi.waitFor(() =>
    expect(io.senden).toHaveBeenCalledWith({ kind: 'Any' }, 'importindex-geaendert', {
      kategorie: 'de-bund',
      absender: expect.any(String),
    }),
  );
  const aktuell = await api.sucheKandidatenAlleQuellen();
  const anmeldung = io.listener.mock.calls.find(([name]) => name === 'importindex-geaendert');
  const sendung = io.senden.mock.calls[0];
  if (!anmeldung || !sendung) throw Error('Ereignisanbindung fehlt');
  const handler = anmeldung[1];
  handler({ payload: sendung[2] });
  expect(api.leseImportindexZwischenspeicher()).toBe(aktuell);
  expect(empfangen).toHaveBeenCalledTimes(1);
  handler({ payload: { kategorie: 'de-bund', absender: 'anderes-fenster' } });
  expect(empfangen).toHaveBeenCalledTimes(2);
  expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
  expect(io.senden).toHaveBeenCalledTimes(1);
});

it('wartet vor haltbarem Laden auf die Ereignisanmeldung', async () => {
  let freigeben!: (abmelden: () => void) => void;
  io.listener.mockReturnValue(
    new Promise((r) => {
      freigeben = r;
    }),
  );
  const laden = api.sucheKandidatenAlleQuellen();
  await vi.waitFor(() => expect(io.listener).toHaveBeenCalled());
  expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
  expect(io.lesen).not.toHaveBeenCalled();
  freigeben(() => {});
  const bestand = await laden;
  expect(api.leseImportindexZwischenspeicher()).toBe(bestand);
});

it('nutzt bei Anmeldefehler verfügbare Einträge ohne dauerhaften Bestand', async () => {
  io.listener.mockRejectedValue(Error('Anmeldefehler'));
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const a = await api.sucheKandidatenAlleQuellen();
    expect(a['de-bund']).toHaveLength(1);
    expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
    expect(await api.sucheKandidatenAlleQuellen()).not.toBe(a);
    expect(protokoll).toHaveBeenCalledWith(
      expect.stringContaining('Ereignisanmeldung'),
      expect.any(Error),
    );
  } finally {
    protokoll.mockRestore();
  }
});

it('beendet die Ereignisanbindung beim Fensterabbau auch vor verspäteter Anmeldung', async () => {
  const fenster = new EventTarget();
  vi.stubGlobal('window', fenster);
  let freigeben!: (abmelden: () => void) => void;
  const abmelden = vi.fn();
  io.listener.mockReturnValue(
    new Promise((r) => {
      freigeben = r;
    }),
  );
  const laden = api.sucheKandidatenAlleQuellen();
  await vi.waitFor(() => expect(io.listener).toHaveBeenCalled());
  fenster.dispatchEvent(new Event('pagehide'));
  freigeben(abmelden);
  await laden;
  expect(abmelden).toHaveBeenCalledTimes(1);
  expect(api.leseImportindexZwischenspeicher()).toBeUndefined();
});

it('protokolliert Sendefehler ohne erfolgreiche Schreibungen zurückzunehmen', async () => {
  io.senden.mockRejectedValue(Error('Sendefehler'));
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(api.uebernehmeImportindexDatei(neuerBund())).resolves.toEqual({
      kategorie: 'de-bund',
      aktion: 'neu',
    });
    await vi.waitFor(() =>
      expect(protokoll).toHaveBeenCalledWith(
        expect.stringContaining('gesendet'),
        expect.any(Error),
      ),
    );
    expect(io.lokal.get('importindizes/de-bund.xml')).toContain('Neu');
  } finally {
    protokoll.mockRestore();
  }
});

it.each([false, true])(
  'prüft die Aktualität vollständiger und teilweiser Ergebnisse ohne sie festzuhalten (Teilfehler: %s)',
  async (teilfehler) => {
    const fenster = new EventTarget();
    vi.stubGlobal('window', fenster);
    if (teilfehler) io.fehler.add('resources/praefixstrukturen/de-bund.xml');
    expect(api.istImportindexSuchbestandAktuell({ 'de-bund': [], 'de-bw': [], eu: [] })).toBe(
      false,
    );
    const ergebnis = await api.sucheKandidatenAlleQuellen();
    expect(api.istImportindexSuchbestandAktuell(ergebnis)).toBe(true);
    await api.uebernehmeImportindexDatei(neuerBund());
    expect(api.istImportindexSuchbestandAktuell(ergebnis)).toBe(false);
    const aktuell = await api.sucheKandidatenAlleQuellen();
    expect(api.istImportindexSuchbestandAktuell(aktuell)).toBe(true);
    fenster.dispatchEvent(new Event('pagehide'));
    expect(api.istImportindexSuchbestandAktuell(aktuell)).toBe(false);
  },
);
