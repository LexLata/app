// Titelquellen: echter Vorabkanal und echte Dateisperren mit ersetzter nativer I/O.
import { readTextFile, exists } from '@tauri-apps/plugin-fs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ladeNichtamtlicheTitel } from './nichtamtlicheTitelSpeicher.laden';
import {
  ersetzeNichtamtlicheTitelDatei,
  synchronisiereEinNichtamtlicheTitel,
} from './nichtamtlicheTitelSpeicher.synchronisieren';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import {
  BeschaedigteTiteldateiFehler,
  ladeNichtamtlicheTitelFuerPruefung,
  existierenNichtamtlicheTitelFuerPruefung,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { TitelquellenPruefungFehler } from './nichtamtlicheTitelSpeicher.pruefen';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { beiNichtamtlicheTitelGeschrieben } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicherEreignisse';
const { dateien, invoke, zeigeBanner, readDir, sperrabschluss } = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  zeigeBanner: vi.fn(),
  readDir: vi.fn(),
  sperrabschluss: { fehler: null as Error | null },
}));
// Der reale Sperrhelfer protokolliert native Freigabefehler. Für den
// gesonderten Fehlerfall eines werfenden Sperrabschlusses läuft zuerst die
// echte Sperre einschließlich Freigabeversuch, danach wird der Fehler injiziert.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>();
  return {
    ...original,
    mitDateiSperre: async <T>(pfad: string, aktion: (token: string) => Promise<T>) => {
      const ergebnis = await original.mitDateiSperre(pfad, aktion);
      if (sperrabschluss.fehler && pfad.endsWith('-nichtamtliche-titel.xml'))
        throw sperrabschluss.fehler;
      return ergebnis;
    },
  };
});
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner,
  meldeDateibefund: zeigeBanner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (pfad: string) => {
    const inhalt = dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  }),
  exists: vi.fn(async (pfad: string) => dateien.has(pfad.replace('/daten/LexLata/', ''))),
  mkdir: vi.fn(),
  readDir,
}));
const vormerken = vi.fn(async () => 'titel-vorgang');
const abschliessen = vi.fn(async () => {});
const empfaenger = { vormerken, abschliessen };
const gesetz = { kurztitel: 'GG', normgeber: 'de-bund' };
const pfad = 'nichtamtliche-titel/GG_de-bund-nichtamtliche-titel.xml';
const gueltig =
  '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">GG</gesetz></infos><inhalt><norm><bezeichnung>Art. 1</bezeichnung><titel>Würde</titel></norm></inhalt></nichtamtlicheTitel>';
const abmeldungen: (() => void)[] = [];
beforeEach(() => {
  registrierePruefpflichtigeAenderung(empfaenger);
  vi.clearAllMocks();
  dateien.clear();
  sperrabschluss.fehler = null;
  vormerken.mockResolvedValue('titel-vorgang');
  abschliessen.mockResolvedValue(undefined);
  readDir.mockImplementation(async (ordner: string) => {
    const relativ = ordner.replace('/daten/LexLata/', '');
    return [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${relativ}/`))
      .map((pfad) => ({ name: pfad.slice(relativ.length + 1), isDirectory: false }));
  });
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'datei_sperre_erwerben') return 'titel-token';
      if (befehl === 'datei_sperre_freigeben') return;
      if (befehl === 'atomar_datei_schreiben') {
        dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.set('sicherung.xml', dateien.get(args.relativerPfad) ?? '');
        dateien.delete(args.relativerPfad);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      throw new Error(`Unerwarteter nativer Aufruf: ${befehl}`);
    },
  );
});
afterEach(() => {
  for (const abmelden of abmeldungen.splice(0)) abmelden();
});
function ereignis() {
  const fn = vi.fn();
  abmeldungen.push(beiNichtamtlicheTitelGeschrieben(fn));
  return fn;
}
it('Import merkt vor Sperre vor und führt Token und Vorgang bis nach Freigabe mit', async () => {
  const fn = ereignis();
  await ersetzeNichtamtlicheTitelDatei(gesetz, gueltig);
  expect(vormerken).toHaveBeenCalledOnce();
  expect(vormerken.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]!);
  expect(invoke).toHaveBeenCalledWith(
    'atomar_datei_schreiben',
    expect.objectContaining({ token: 'titel-token', vorgang: 'titel-vorgang' }),
  );
  expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'geaendert');
  expect(abschliessen.mock.invocationCallOrder[0]).toBeGreaterThan(
    invoke.mock.invocationCallOrder.at(-1)!,
  );
  expect(fn).toHaveBeenCalledWith(gesetz, 'titel-vorgang');
  expect(fn.mock.invocationCallOrder[0]).toBeGreaterThan(abschliessen.mock.invocationCallOrder[0]!);
});
it('Vorabfehler verhindert Quellsperre, Schreibzugriff und Ereignis', async () => {
  const fn = ereignis();
  vormerken.mockRejectedValueOnce(new Error('Vorab'));
  await expect(ersetzeNichtamtlicheTitelDatei(gesetz, gueltig)).rejects.toThrow('Vorab');
  expect(invoke).not.toHaveBeenCalled();
  expect(fn).not.toHaveBeenCalled();
});
it.each([gueltig, null])('unveränderter Ladefall benötigt keine Vormerkung: %s', async (inhalt) => {
  if (inhalt !== null) dateien.set(pfad, inhalt);
  await ladeNichtamtlicheTitel(gesetz);
  expect(vormerken).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});
it.each(['', '  '])(
  'leere Titeldatei %s wird unter Quellsperre gesichert und als Änderung gemeldet',
  async (inhalt) => {
    dateien.set(pfad, inhalt);
    const fn = ereignis();
    expect(await ladeNichtamtlicheTitel(gesetz)).toBeNull();
    expect([...dateien.entries()]).toContainEqual(['sicherung.xml', inhalt]);
    expect(dateien.has(pfad)).toBe(false);
    expect(vormerken).toHaveBeenCalled();
    expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'geaendert');
    expect(fn).toHaveBeenCalledWith(gesetz, 'titel-vorgang');
  },
);
it('Archivierung führt Token und Vorgang mit und meldet erst nach Freigabe', async () => {
  const fn = ereignis();
  dateien.set(pfad, '<kaputt/>');
  await ladeNichtamtlicheTitel(gesetz);
  expect(invoke).toHaveBeenCalledWith(
    'archiviere_beschaedigte_datei',
    expect.objectContaining({ token: 'titel-token', vorgang: 'titel-vorgang' }),
  );
  expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'geaendert');
  expect(abschliessen.mock.invocationCallOrder[0]).toBeGreaterThan(
    invoke.mock.invocationCallOrder.at(-1)!,
  );
  expect(fn).toHaveBeenCalledWith(gesetz, 'titel-vorgang');
});
it('verwendet inzwischen reparierte Datei und schließt ohne Änderungsereignis', async () => {
  const fn = ereignis();
  dateien.set(pfad, '<kaputt/>');
  vormerken.mockImplementationOnce(async () => {
    dateien.set(pfad, gueltig);
    return 'titel-vorgang';
  });
  expect(await ladeNichtamtlicheTitel(gesetz)).toEqual(new Map([['Art. 1', 'Würde']]));
  expect(invoke).not.toHaveBeenCalledWith('archiviere_beschaedigte_datei', expect.anything());
  expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'unveraendert');
  expect(fn).not.toHaveBeenCalled();
});
it('native Vergleichsreparatur wird ohne Archivierung verwendet', async () => {
  dateien.set(pfad, '<kaputt/>');
  const fn = ereignis();
  invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'datei_sperre_erwerben') return 'titel-token';
    if (befehl === 'archiviere_beschaedigte_datei') {
      dateien.set(pfad, gueltig);
      return { status: 'veraendert', sicherungspfad: null };
    }
  });
  expect(await ladeNichtamtlicheTitel(gesetz)).toEqual(new Map([['Art. 1', 'Würde']]));
  expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'unveraendert');
  expect(fn).not.toHaveBeenCalled();
});
it.each(['gesichert_aber_nicht_entfernt', 'fehler'])(
  'gescheiterte Archivierung %s bleibt sichtbar und meldet keinen Erfolg',
  async (status) => {
    dateien.set(pfad, '<kaputt/>');
    const fn = ereignis();
    invoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'datei_sperre_erwerben') return 'titel-token';
      if (befehl === 'archiviere_beschaedigte_datei') {
        if (status === 'fehler') throw new Error('Sicherung');
        return { status, sicherungspfad: 'sicherung.xml' };
      }
    });
    expect(await ladeNichtamtlicheTitel(gesetz)).toBeNull();
    expect(dateien.get(pfad)).toBe('<kaputt/>');
    expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'fehlgeschlagen');
    expect(fn).not.toHaveBeenCalled();
    expect(zeigeBanner).toHaveBeenCalled();
  },
);
it('Schreibfehler erhält Originalfehler und schließt nach Freigabe fehlgeschlagen ab', async () => {
  const fehler = new Error('Datenträger');
  const fn = ereignis();
  invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'datei_sperre_erwerben') return 'titel-token';
    if (befehl === 'atomar_datei_schreiben') throw fehler;
  });
  const geschrieben = vi.fn();
  await expect(
    ersetzeNichtamtlicheTitelDatei(gesetz, gueltig, undefined, geschrieben),
  ).rejects.toBe(fehler);
  expect(geschrieben).not.toHaveBeenCalled();
  expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'fehlgeschlagen');
  expect(fn).not.toHaveBeenCalled();
});
it('Empfängerfehler unterbricht weitere Empfänger und gespeicherten Erfolg nicht', async () => {
  abmeldungen.push(
    beiNichtamtlicheTitelGeschrieben(() => {
      throw new Error('Empfänger');
    }),
  );
  const fn = ereignis();
  abschliessen.mockRejectedValueOnce(new Error('Transport'));
  await expect(ersetzeNichtamtlicheTitelDatei(gesetz, gueltig)).resolves.toBeUndefined();
  expect(dateien.get(pfad)).toBe(gueltig);
  expect(fn).toHaveBeenCalledWith(gesetz, 'titel-vorgang');
});
it('Sync überschreibt eine nach Vorbereitung entstandene Quelle nicht', async () => {
  dateien.set('resources/nichtamtliche-titel/de-bund/GG.xml', gueltig);
  const fn = ereignis();
  vormerken.mockImplementationOnce(async () => {
    dateien.set(pfad, 'Import');
    return 'titel-vorgang';
  });
  expect(await synchronisiereEinNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBe(
    false,
  );
  expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'unveraendert');
  expect(fn).not.toHaveBeenCalled();
});

it.each(['vorhanden', 'ressource-fehlt'])(
  'Sync ohne erkennbare Änderung %s merkt nichts vor',
  async (fall) => {
    if (fall === 'vorhanden') dateien.set(pfad, 'Import');
    const fn = ereignis();
    expect(await synchronisiereEinNichtamtlicheTitel(gesetz)).toBe(false);
    expect(vormerken).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
  },
);
it('Sync bereitet Ressource vor Vormerkung vor und schreibt unter eigener Sperre', async () => {
  dateien.set('resources/nichtamtliche-titel/de-bund/GG.xml', gueltig);
  const fn = ereignis();
  expect(await synchronisiereEinNichtamtlicheTitel(gesetz)).toBe(true);
  expect(vi.mocked(readTextFile).mock.invocationCallOrder[0]).toBeLessThan(
    vormerken.mock.invocationCallOrder[0]!,
  );
  expect(invoke).toHaveBeenCalledWith(
    'atomar_datei_schreiben',
    expect.objectContaining({
      relativerPfad: pfad,
      token: 'titel-token',
      vorgang: 'titel-vorgang',
    }),
  );
  expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'geaendert');
  expect(fn).toHaveBeenCalledWith(gesetz, 'titel-vorgang');
});
it('Archivierungsvorabfehler erhält Quelle, zeigt Banner und nimmt keine Quellsperre', async () => {
  dateien.set(pfad, '<kaputt/>');
  const fn = ereignis();
  vormerken.mockRejectedValueOnce(new Error('Vorab'));
  expect(await ladeNichtamtlicheTitel(gesetz)).toBeNull();
  expect(dateien.get(pfad)).toBe('<kaputt/>');
  expect(invoke).not.toHaveBeenCalled();
  expect(fn).not.toHaveBeenCalled();
  expect(zeigeBanner).toHaveBeenCalled();
});
it.each(['fehlt'])(
  'nach Vormerkung erkannter Archivierungs-noop %s schließt unverändert ab',
  async (fall) => {
    dateien.set(pfad, '<kaputt/>');
    const fn = ereignis();
    vormerken.mockImplementationOnce(async () => {
      if (fall === 'fehlt') dateien.delete(pfad);
      else dateien.set(pfad, '');
      return 'titel-vorgang';
    });
    expect(await ladeNichtamtlicheTitel(gesetz)).toBeNull();
    expect(abschliessen).toHaveBeenCalledWith('titel-vorgang', 'unveraendert');
    expect(fn).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith('archiviere_beschaedigte_datei', expect.anything());
  },
);
it.each(['lesen', 'existenz'])(
  'normaler Ladefehler %s bleibt Banner/null ohne Archivierung',
  async (fall) => {
    dateien.set(pfad, gueltig);
    vi.mocked(readTextFile).mockRejectedValueOnce(new Error('Zugriff'));
    if (fall === 'existenz') vi.mocked(exists).mockRejectedValueOnce(new Error('Existenz'));
    expect(await ladeNichtamtlicheTitel(gesetz)).toBeNull();
    expect(zeigeBanner).toHaveBeenCalled();
    expect(vormerken).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  },
);

it.each(['schreiben', 'archivieren'])(
  'erhält echte Änderung beim anschließenden Sperrabschlussfehler: %s',
  async (fall) => {
    const fehler = new Error('Sperrabschluss');
    sperrabschluss.fehler = fehler;
    const fn = ereignis();
    if (fall === 'schreiben') {
      const geschrieben = vi.fn();
      await expect(
        ersetzeNichtamtlicheTitelDatei(gesetz, gueltig, undefined, geschrieben),
      ).rejects.toBe(fehler);
      expect(geschrieben).toHaveBeenCalledOnce();
      expect(dateien.get(pfad)).toBe(gueltig);
    } else {
      dateien.set(pfad, '<kaputt/>');
      expect(await ladeNichtamtlicheTitel(gesetz)).toBeNull();
      expect(dateien.has(pfad)).toBe(false);
      expect(zeigeBanner).toHaveBeenCalled();
    }
    expect(abschliessen).toHaveBeenCalledExactlyOnceWith('titel-vorgang', 'fehlgeschlagen');
    expect(abschliessen.mock.invocationCallOrder[0]).toBeGreaterThan(
      invoke.mock.invocationCallOrder.at(-1)!,
    );
    expect(fn).toHaveBeenCalledExactlyOnceWith(gesetz, 'titel-vorgang');
    expect(fn.mock.invocationCallOrder[0]).toBeGreaterThan(
      abschliessen.mock.invocationCallOrder[0]!,
    );
  },
);

it('Prüflader meldet beschädigten gelesenen Titelinhalt ohne Quellmutation', async () => {
  dateien.set(pfad, '<kaputt/>');
  await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz)).rejects.toMatchObject({
    name: 'BeschaedigteTiteldateiFehler',
    dateityp: 'nichtamtlicheTitel',
    gesetz,
    dateiBasis: 'GG_de-bund',
    inhalt: '<kaputt/>',
  });
  expect(dateien.get(pfad)).toBe('<kaputt/>');
  expect(vormerken).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});
it('Titelprüfung sammelt Beschädigungen auch ohne installierte Gesetze', async () => {
  dateien.set(pfad, '<kaputt/>');
  dateien.set('nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml', '<falsch/>');
  await expect(
    existierenNichtamtlicheTitelFuerPruefung([gesetz, { kurztitel: 'BGB', normgeber: 'de-bund' }]),
  ).rejects.toMatchObject({
    errors: [
      expect.objectContaining({ inhalt: '<kaputt/>' }),
      expect.objectContaining({ inhalt: '<falsch/>' }),
    ],
  });
  expect(invoke).not.toHaveBeenCalled();
});

it.each(['', '  '])(
  'leere bestehende Titel bleiben sichtbarer nicht archivierungsfähiger Prüfbefund %s',
  async (inhalt) => {
    dateien.set(pfad, inhalt);
    await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz)).rejects.toMatchObject({
      grund: 'leer',
      inhalt,
    });
    expect(invoke).not.toHaveBeenCalled();
  },
);
it('leere gültige Map mit unbekannten Erweiterungen bleibt gültig', async () => {
  dateien.set(
    pfad,
    '<nichtamtlicheTitel version="99"><infos><gesetz normgeber="de-bund">GG</gesetz></infos><erweiterung/></nichtamtlicheTitel>',
  );
  await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz)).resolves.toEqual(new Map());
  await expect(existierenNichtamtlicheTitelFuerPruefung([gesetz])).resolves.toEqual(
    new Set([gesetzesreferenzSchluessel(gesetz)]),
  );
});
it('falsch zugeordnete gelesene Titel sind benannte beschädigte Quelle', async () => {
  const inhalt = gueltig.replace('>GG</gesetz>', '>BGB</gesetz>');
  dateien.set(pfad, inhalt);
  await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz)).rejects.toMatchObject({
    grund: 'falsch_zugeordnet',
    inhalt,
    gesetz,
  });
});
it('Titelprüfung unterscheidet bestätigtes Fehlen und Lesefehler', async () => {
  await expect(existierenNichtamtlicheTitelFuerPruefung([gesetz])).resolves.toEqual(new Set());
  dateien.set(pfad, gueltig);
  const zugriff = new Error('Titelzugriff');
  vi.mocked(readTextFile).mockRejectedValueOnce(zugriff);
  await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz)).rejects.toBe(zugriff);
  expect(invoke).not.toHaveBeenCalled();
});

it('gescheiterte Existenzprüfung bewahrt ursprünglichen Titel-Lesefehler', async () => {
  dateien.set(pfad, gueltig);
  const lesen = new Error('Lesefehler');
  const existenz = new Error('Existenzfehler');
  vi.mocked(readTextFile).mockRejectedValueOnce(lesen);
  vi.mocked(exists).mockRejectedValueOnce(existenz);
  await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz)).rejects.toMatchObject({
    errors: [lesen, existenz],
  });
});

it('Fassade stellt benannte Titelbefunde und Sammelfehler bereit', async () => {
  dateien.set(pfad, '<kaputt/>');
  await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz)).rejects.toBeInstanceOf(
    BeschaedigteTiteldateiFehler,
  );
  await expect(existierenNichtamtlicheTitelFuerPruefung([gesetz])).rejects.toBeInstanceOf(
    TitelquellenPruefungFehler,
  );
});

it.each(['einzeln', 'gesamt'])(
  'strikte Titelprüfung %s meldet Beschädigung ohne Sicherung oder Banner',
  async (weg) => {
    dateien.set(pfad, '<kaputt/>');
    const empfangen = vi.fn();
    await expect(
      weg === 'einzeln'
        ? ladeNichtamtlicheTitelFuerPruefung(gesetz, empfangen)
        : existierenNichtamtlicheTitelFuerPruefung([gesetz], empfangen),
    ).rejects.toThrow();
    expect(empfangen).toHaveBeenCalledOnce();
    expect(empfangen).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('GG'),
        art: 'fehler',
        anlass: 'lesen',
        aenderungsstand: 'keine',
      }),
    );
    expect(zeigeBanner).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(dateien.get(pfad)).toBe('<kaputt/>');
  },
);

it('strikter Titelzugriff meldet Lesefehler und erhält beide Ursachen bei gescheiterter Existenzprüfung', async () => {
  dateien.set(pfad, gueltig);
  const lesen = new Error('Lesefehler');
  const existenz = new Error('Existenzfehler');
  vi.mocked(readTextFile).mockRejectedValueOnce(lesen);
  vi.mocked(exists).mockRejectedValueOnce(existenz);
  const empfangen = vi.fn();
  await expect(ladeNichtamtlicheTitelFuerPruefung(gesetz, empfangen)).rejects.toMatchObject({
    errors: [lesen, existenz],
  });
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining('GG'), anlass: 'lesen' }),
  );
  expect(zeigeBanner).not.toHaveBeenCalled();
});
