// gesetzDateipfad.test.ts
// Tatsächliche Schreibweisen und konkurrierende Referenzen auf allen Plattformen.
import { beforeEach, expect, it, vi } from 'vitest';
import {
  normalisierteDateiBasis,
  ermittleGesetzDateipfad,
  mitGesetzDateiSperre,
  mitGesetzDateiSperren,
} from './gesetzDateipfad';
import {
  referenzAusDateiBasis,
  MARKIERUNGEN_SUFFIX,
  FAVORITEN_SUFFIX,
  NICHTAMTLICHE_TITEL_SUFFIX,
  LESEZEICHEN_DATEINAME,
  GESETZESKURZBEFEHLE_DATEINAME,
} from './gesetzDateiname';
import {
  GESETZE_ORDNER,
  MARKIERUNGEN_ORDNER,
  FAVORITEN_ORDNER,
  NICHTAMTLICHE_TITEL_ORDNER,
} from './gesetzDateipfad';
const sperre = vi.hoisted(() => vi.fn());
vi.mock('./dateizugriff/dateizugriff.index', async (original) => ({
  ...(await original<typeof import('./dateizugriff/dateizugriff.index')>()),
  mitDateiSperre: sperre,
  mitDateiSperren: async (
    pfade: string[],
    aktion: (tokens: Map<string, string>) => Promise<unknown>,
  ) => {
    pfade = [...new Set(pfade)].sort();
    const tokens = new Map<string, string>();
    const nehmen = async (i: number): Promise<unknown> =>
      i === pfade.length
        ? aktion(tokens)
        : sperre(pfade[i]!, async (token: string) => {
            tokens.set(pfade[i]!, token);
            return nehmen(i + 1);
          });
    return nehmen(0);
  },
  appDatenOrdnerLesen: fs.lesen,
  appDatenExistiert: fs.existiert,
}));
const fs = vi.hoisted(() => ({ lesen: vi.fn(), existiert: vi.fn() }));
beforeEach(() => {
  sperre
    .mockReset()
    .mockImplementation(async (pfad: string, aktion: (token: string) => Promise<unknown>) =>
      aktion(`token:${pfad}`),
    );
  fs.lesen.mockReset().mockResolvedValue([]);
  fs.existiert.mockReset().mockResolvedValue(true);
});
it('normalisiert vor der Windows-Kodierung', () => {
  expect(normalisierteDateiBasis({ kurztitel: 'CON.x', normgeber: 'de-bund' })).toBe(
    '%63on.x_de-bund',
  );
});
it.each(['gesetze', 'markierungen', 'favoriten', 'nichtamtliche-titel'])(
  'nutzt tatsächliche Schreibweise ohne installiertes Gesetz: %s',
  async (ordner) => {
    fs.lesen.mockResolvedValue([{ name: '%43ON.x_de-bund.xml', isFile: true }]);
    expect(
      await ermittleGesetzDateipfad({ kurztitel: 'con.x', normgeber: 'de-bund' }, ordner),
    ).toBe(`${ordner}/%43ON.x_de-bund.xml`);
  },
);
it('erzeugt neue Pfade mit gewünschtem Suffix', async () => {
  expect(
    await ermittleGesetzDateipfad(
      { kurztitel: 'A/B', normgeber: 'unbekannt' },
      'favoriten',
      '.favoriten.xml',
    ),
  ).toBe('favoriten/A%2FB_unbekannt.favoriten.xml');
});
it('verweigert konkurrierende Dateien auch mit anderem Encoding der Großschreibung', async () => {
  fs.lesen.mockResolvedValue([{ name: '%43ON.x_de-bund.xml' }, { name: '%63on.x_de-bund.xml' }]);
  await expect(
    ermittleGesetzDateipfad({ kurztitel: 'CON.x', normgeber: 'de-bund' }, 'gesetze'),
  ).rejects.toThrow(/Mehrere Dateien/);
});
it('unterscheidet fehlenden Ordner von Zugriffsfehlern', async () => {
  const fehler = new Error('Zugriff verweigert');
  fs.lesen.mockRejectedValue(fehler);
  await expect(
    ermittleGesetzDateipfad({ kurztitel: 'A', normgeber: 'unbekannt' }, 'gesetze'),
  ).rejects.toBe(fehler);
  fs.existiert.mockResolvedValue(false);
  expect(await ermittleGesetzDateipfad({ kurztitel: 'A', normgeber: 'unbekannt' }, 'gesetze')).toBe(
    'gesetze/A_unbekannt.xml',
  );
});
it('ignoriert Ordner und Dateien anderer Normgeber', async () => {
  fs.lesen.mockResolvedValue([
    { name: 'A_unbekannt.xml', isDirectory: true },
    { name: 'A_de-sn.xml' },
  ]);
  expect(await ermittleGesetzDateipfad({ kurztitel: 'A', normgeber: 'unbekannt' }, 'gesetze')).toBe(
    'gesetze/A_unbekannt.xml',
  );
});

it('sperrt die normalisierte Referenz vor der Pfadermittlung und reicht nur den tatsächlichen Dateitoken weiter', async () => {
  const referenzPfad = 'favoriten/%63on.x_de-bund-favoriten.xml.referenz-sperre';
  const dateipfad = 'favoriten/%43ON.x_de-bund-favoriten.xml';
  const reihenfolge: string[] = [];
  sperre.mockImplementation(async (pfad: string, aktion: (token: string) => Promise<unknown>) => {
    reihenfolge.push(`erwerben:${pfad}`);
    try {
      return await aktion(`token:${pfad}`);
    } finally {
      reihenfolge.push(`freigeben:${pfad}`);
    }
  });
  fs.lesen.mockImplementation(async () => {
    reihenfolge.push('ermitteln');
    return [{ name: '%43ON.x_de-bund-favoriten.xml' }];
  });
  await expect(
    mitGesetzDateiSperre(
      { kurztitel: 'con.x', normgeber: 'de-bund' },
      'favoriten',
      '-favoriten.xml',
      async (token) => {
        expect(token).toBe(`token:${dateipfad}`);
        reihenfolge.push('aktion');
        return 42;
      },
    ),
  ).resolves.toBe(42);
  expect(reihenfolge).toEqual([
    `erwerben:${referenzPfad}`,
    'ermitteln',
    `erwerben:${dateipfad}`,
    'aktion',
    `freigeben:${dateipfad}`,
    `freigeben:${referenzPfad}`,
  ]);
});

it('gibt die Referenzsperre bei fehlerhafter Pfadermittlung frei, ohne die Aktion auszuführen', async () => {
  const fehler = new Error('Zugriff verweigert');
  const freigegeben = vi.fn();
  const aktion = vi.fn();
  sperre.mockImplementation(async (_pfad: string, aktion: (token: string) => Promise<unknown>) => {
    try {
      return await aktion('referenztoken');
    } finally {
      freigegeben();
    }
  });
  fs.lesen.mockRejectedValue(fehler);
  await expect(
    mitGesetzDateiSperre(
      { kurztitel: 'BGB', normgeber: 'unbekannt' },
      'markierungen',
      '-markierungen.xml',
      aktion,
    ),
  ).rejects.toBe(fehler);
  expect(sperre).toHaveBeenCalledTimes(1);
  expect(freigegeben).toHaveBeenCalledOnce();
  expect(aktion).not.toHaveBeenCalled();
});

// Die Kleinschreibung von İ ergänzt einen kombinierenden Punkt.
it.each(['at-bund', 'de-by'])('normalisiert gültigen Originalnormgeber %s', (normgeber) => {
  expect(normalisierteDateiBasis({ kurztitel: 'TestG', normgeber })).toBe(
    `testg_${normgeber.toLowerCase()}`,
  );
});
it.each(['at-bund', 'de-by'])('ermittelt neuen und vorhandenen Code-Pfad %s', async (normgeber) => {
  const ref = { kurztitel: 'TestG', normgeber };
  expect(await ermittleGesetzDateipfad(ref, 'gesetze')).toBe(`gesetze/TestG_${normgeber}.xml`);
  fs.lesen.mockResolvedValue([{ name: `TESTG_${normgeber}.XML` }]);
  expect(await ermittleGesetzDateipfad(ref, 'gesetze')).toBe(`gesetze/TESTG_${normgeber}.XML`);
});
it.each(['at-bund', 'de-by'])(
  'sperrt die Code-Referenz %s und ihre vorhandene Datei',
  async (normgeber) => {
    fs.lesen.mockResolvedValue([{ name: `TESTG_${normgeber}.xml` }]);
    const aktion = vi.fn(async (token: string) => token);
    await expect(
      mitGesetzDateiSperre({ kurztitel: 'TestG', normgeber }, 'gesetze', '.xml', aktion),
    ).resolves.toBe(`token:gesetze/TESTG_${normgeber}.xml`);
    expect(sperre.mock.calls.map(([pfad]) => pfad)).toEqual([
      `gesetze/testg_${normgeber.toLowerCase()}.xml.referenz-sperre`,
      `gesetze/TESTG_${normgeber}.xml`,
    ]);
  },
);
it.each(['i\u0307', 'abcdefghii\u0307', 'ABCDEFGHIJK'])(
  'verwirft weiterhin ungültige Originalnormgeber %s',
  (normgeber) => {
    expect(() => normalisierteDateiBasis({ kurztitel: 'TestG', normgeber })).toThrow(
      'Ungültiger Normgeber',
    );
  },
);

it('erwirbt gemeinsame Referenzen vor tatsächlichen Dateien, dedupliziert Selbstverweise und sortiert', async () => {
  const a = {
    gesetz: { kurztitel: 'A', normgeber: 'unbekannt' },
    ordner: 'gesetze',
    suffix: '.xml',
  };
  const b = {
    gesetz: { kurztitel: 'B', normgeber: 'unbekannt' },
    ordner: 'gesetze',
    suffix: '.xml',
  };
  const m = {
    gesetz: { kurztitel: 'B', normgeber: 'unbekannt' },
    ordner: 'markierungen',
    suffix: '-markierungen.xml',
  };
  await mitGesetzDateiSperren([b, m, a, a], async (tokens) => {
    expect(tokens.size).toBe(3);
    expect(tokens.get('gesetze/A_unbekannt.xml')).toBe('token:gesetze/A_unbekannt.xml');
  });
  expect(sperre.mock.calls.map(([pfad]) => pfad)).toEqual([
    'gesetze/a_unbekannt.xml.referenz-sperre',
    'gesetze/b_unbekannt.xml.referenz-sperre',
    'markierungen/b_unbekannt-markierungen.xml.referenz-sperre',
    'gesetze/A_unbekannt.xml',
    'gesetze/B_unbekannt.xml',
    'markierungen/B_unbekannt-markierungen.xml',
  ]);
});

// Der Dateivertrag gilt auch bei der Suche im vorhandenen Verzeichnis.
it.each([
  ['markierungen', '-markierungen.xml'],
  ['favoriten', '-favoriten.xml'],
  ['nichtamtliche-titel', '-nichtamtliche-titel.xml'],
])('verwendet den vereinbarten Dateivertrag für %s', async (ordner, suffix) => {
  for (const kurztitel of ['BGB', 'AÜG', 'A/B', 'CON.x']) {
    const ref = { kurztitel, normgeber: 'de-bund' };
    const pfad = await ermittleGesetzDateipfad(ref, ordner, suffix);
    const basis = pfad.slice(ordner.length + 1, -suffix.length);
    expect(referenzAusDateiBasis(basis)).toEqual(ref);
    fs.lesen.mockResolvedValue([{ name: pfad.slice(ordner.length + 1), isFile: true }]);
    expect(await ermittleGesetzDateipfad(ref, ordner, suffix)).toBe(pfad);
    fs.lesen.mockResolvedValue([]);
  }
  expect(
    await ermittleGesetzDateipfad({ kurztitel: 'BGB', normgeber: 'de-bund' }, ordner, suffix),
  ).toBe(`${ordner}/BGB_de-bund${suffix}`);
});

it('hält die Namenstabelle aller relativen AppData-Dateitypen ein', async () => {
  const ref = { kurztitel: 'BGB', normgeber: 'de-bund' };
  const pfade = await Promise.all([
    ermittleGesetzDateipfad(ref, GESETZE_ORDNER),
    ermittleGesetzDateipfad(ref, MARKIERUNGEN_ORDNER, MARKIERUNGEN_SUFFIX),
    ermittleGesetzDateipfad(ref, FAVORITEN_ORDNER, FAVORITEN_SUFFIX),
    ermittleGesetzDateipfad(ref, NICHTAMTLICHE_TITEL_ORDNER, NICHTAMTLICHE_TITEL_SUFFIX),
    `lesezeichen/${LESEZEICHEN_DATEINAME}`,
    `einstellungen/${GESETZESKURZBEFEHLE_DATEINAME}`,
    'einstellungen/einstellungen-backup.xml',
    'importindizes/de-bund.xml',
    'markierungskonflikte.xml',
  ]);
  expect(pfade).toEqual([
    'gesetze/BGB_de-bund.xml',
    'markierungen/BGB_de-bund-markierungen.xml',
    'favoriten/BGB_de-bund-favoriten.xml',
    'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml',
    'lesezeichen/lesezeichen.xml',
    'einstellungen/gesetzeskurzbefehle.xml',
    'einstellungen/einstellungen-backup.xml',
    'importindizes/de-bund.xml',
    'markierungskonflikte.xml',
  ]);
  for (const pfad of pfade) {
    expect(pfad).not.toMatch(/\s/);
    const ohneKurztitel = pfad.replace('BGB_', '');
    expect(ohneKurztitel).toBe(ohneKurztitel.toLowerCase());
  }
});
