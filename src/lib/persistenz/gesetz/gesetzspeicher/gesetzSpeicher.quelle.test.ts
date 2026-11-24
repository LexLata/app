import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
// Gesetzquellen: echter Vorabkanal und echte Dateisperren mit ersetzter nativer I/O.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { BeschaedigteGesetzdateiFehler } from '@/lib/persistenz/gesetz/gesetz.index';
import { GesetzquellenPruefungFehler, type BeschaedigteGesetzquelle } from './gesetzSpeicher.typen';
import { readTextFile, exists, readDir, mkdir } from '@tauri-apps/plugin-fs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { speichereGesetz, loescheGesetz } from './gesetzSpeicher.schreiben';
import { sichereUngueltigeGesetzDatei, pruefeGesetzDatei } from './gesetzSpeicher.sicherung';
import { ladeAlleGesetzeFuerPruefung } from './gesetzSpeicher.pruefladen';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { beiSpeicherBatchAbgeschlossen } from './gesetzSpeicherEreignisse';
const { dateien, invoke, zeigeBanner, emitTo } = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  zeigeBanner: vi.fn(),
  emitTo: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (befehl: string, ...argumente: unknown[]) =>
    befehl === 'gesetz_dateistempel_lesen'
      ? Promise.resolve(gesetzDateistempelAttrappe(dateien))
      : invoke(befehl, ...argumente),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (pfad: string) => {
    const inhalt = dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  }),
  exists: vi.fn(async (pfad: string) => dateien.has(pfad.replace('/daten/LexLata/', ''))),
  mkdir: vi.fn(),
  remove: vi.fn(),
  readDir: vi.fn(async (ordner: string) => {
    const relativ = ordner.replace('/daten/LexLata/', '');
    return [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${relativ}/`))
      .map((pfad) => ({ name: pfad.slice(relativ.length + 1), isDirectory: false }));
  }),
}));

const vormerken = vi.fn(async () => 'markierungs-vorgang');
const abschliessen = vi.fn(async () => {});
const empfaenger = { vormerken, abschliessen };

beforeEach(() => {
  registrierePruefpflichtigeAenderung(empfaenger);
  vi.clearAllMocks();
  dateien.clear();
  emitTo.mockResolvedValue(undefined);
  invoke.mockImplementation(
    async (befehl: string, argumente: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'atomar_datei_schreiben')
        dateien.set(argumente.relativerPfad, argumente.inhalt);
      else if (befehl === 'app_daten_loeschen') dateien.delete(argumente.relativerPfad);
      else if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.delete(argumente.relativerPfad);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      } else if (befehl === 'datei_sperre_erwerben') return 'markierungstoken';
      else if (befehl === 'datei_sperre_freigeben') return;
      else throw new Error(`Unerwarteter nativer Aufruf: ${befehl}`);
    },
  );
});

const sync = vi.hoisted(() => vi.fn(async () => false));
vi.mock(
  '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.synchronisieren',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.synchronisieren')
    >()),
    synchronisiereEinNichtamtlicheTitel: sync,
  }),
);
let abmelden: (() => void) | undefined;
afterEach(async () => {
  await vi.runAllTimersAsync();
  abmelden?.();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers();
  vormerken.mockResolvedValue('markierungs-vorgang');
  sync.mockResolvedValue(false);
});

it('merkt vor Sperren vor und meldet erfolgreiche Speicherung mit Auftrag nach Freigabe', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>');
  expect(vormerken).toHaveBeenCalledOnce();
  expect(vormerken.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0]!);
  expect(invoke).toHaveBeenCalledWith(
    'atomar_datei_schreiben',
    expect.objectContaining({ token: 'markierungstoken', vorgang: 'markierungs-vorgang' }),
  );
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'geaendert');
  expect(abschliessen.mock.invocationCallOrder[0]).toBeGreaterThan(
    invoke.mock.invocationCallOrder.at(-1)!,
  );
  expect(sync.mock.invocationCallOrder[0]).toBeGreaterThan(
    abschliessen.mock.invocationCallOrder[0]!,
  );
  await vi.runAllTimersAsync();
  expect(ereignis).toHaveBeenCalledWith(
    [gesetzesreferenz({ kurztitel: 'BGB' })],
    ['markierungs-vorgang'],
  );
});
it('Vorabfehler verhindert Quelldateizugriff und Änderungsmeldung', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  vormerken.mockRejectedValueOnce(new Error('Vorab'));
  await expect(
    speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>'),
  ).rejects.toThrow('Vorab');
  expect(invoke).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(ereignis).not.toHaveBeenCalled();
});
it('erhält erfolgreich gespeicherte Änderung bei folgendem Titel-Syncfehler', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  sync.mockRejectedValueOnce(new Error('Titel'));
  await expect(
    speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>'),
  ).rejects.toThrow('Titel');
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'geaendert');
  await vi.runAllTimersAsync();
  expect(ereignis).toHaveBeenCalledOnce();
});
it('Refresh schreibt ohne Vormerkung oder Änderungsereignis', async () => {
  await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>', {
    inhaltGeaendert: false,
  });
  expect(invoke).toHaveBeenCalledWith(
    'atomar_datei_schreiben',
    expect.objectContaining({ nurVerarbeitungszeit: true, token: 'markierungstoken' }),
  );
  expect(vormerken).not.toHaveBeenCalled();
});
it('Löschen führt Auftrag und Token mit und schließt nach Freigabe ab', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  dateien.set('gesetze/BGB_de-bund.xml', 'alt');
  await loescheGesetz(gesetzesreferenz({ kurztitel: 'BGB' }));
  expect(invoke).toHaveBeenCalledWith(
    'app_daten_loeschen',
    expect.objectContaining({ token: 'markierungstoken', vorgang: 'markierungs-vorgang' }),
  );
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'geaendert');
  expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'gesetze-geloescht', [
    gesetzesreferenz({ kurztitel: 'BGB' }),
  ]);
  expect(emitTo.mock.invocationCallOrder[0]).toBeGreaterThan(
    abschliessen.mock.invocationCallOrder[0]!,
  );
  await vi.runAllTimersAsync();
  expect(ereignis).toHaveBeenCalledWith(
    [gesetzesreferenz({ kurztitel: 'BGB' })],
    ['markierungs-vorgang'],
  );
  expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'gesetze-geaendert', [
    gesetzesreferenz({ kurztitel: 'BGB' }),
  ]);
});
it.each([null, '', '  '])(
  'sicher erkennbarer Archivierungs-noop %s benötigt keinen Vorab',
  async (inhalt) => {
    await sichereUngueltigeGesetzDatei('BGB_de-bund', inhalt);
    expect(vormerken).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  },
);
it('Archivierung erhält einen eigenen Vorgang vor der Sperre', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<kaputt/>');
  await sichereUngueltigeGesetzDatei('BGB_de-bund', '<kaputt/>');
  expect(vormerken).toHaveBeenCalledOnce();
  expect(invoke).toHaveBeenCalledWith(
    'archiviere_beschaedigte_datei',
    expect.objectContaining({ token: 'markierungstoken', vorgang: 'markierungs-vorgang' }),
  );
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'geaendert');
});
it('Unteroperation verwendet vorhandenen Token und Vorgang ohne eigenen Abschluss', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<kaputt/>');
  await sichereUngueltigeGesetzDatei('BGB_de-bund', '<kaputt/>', {
    token: 'vorhanden',
    vorgang: 'bestehend',
  });
  expect(vormerken).not.toHaveBeenCalled();
  expect(abschliessen).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith(
    'archiviere_beschaedigte_datei',
    expect.objectContaining({ token: 'vorhanden', vorgang: 'bestehend' }),
  );
  expect(invoke).not.toHaveBeenCalledWith('datei_sperre_erwerben', expect.anything());
});

it('Schreibfehler erhält Bedarf, schließt nach Freigabe und meldet keine Änderung', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'datei_sperre_erwerben') return 'token';
    if (befehl === 'atomar_datei_schreiben') throw new Error('Datenträger');
  });
  await expect(
    speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>'),
  ).rejects.toThrow('Datenträger');
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'fehlgeschlagen');
  expect(abschliessen.mock.invocationCallOrder[0]).toBeGreaterThan(
    invoke.mock.invocationCallOrder.at(-1)!,
  );
  await vi.runAllTimersAsync();
  expect(ereignis).not.toHaveBeenCalled();
});
it.each(['fehlt', 'gesichert_aber_nicht_entfernt'])(
  'Archivierung mit nativem Ergebnis %s meldet keine erfolgreiche Änderung',
  async (status) => {
    const ereignis = vi.fn();
    abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
    invoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'datei_sperre_erwerben') return 'token';
      if (befehl === 'archiviere_beschaedigte_datei')
        return { status, sicherungspfad: 'sicherung.xml' };
    });
    expect((await sichereUngueltigeGesetzDatei('BGB_de-bund', '<kaputt/>')).status).toBe(status);
    expect(abschliessen).toHaveBeenCalledWith(
      'markierungs-vorgang',
      status === 'fehlt' ? 'unveraendert' : 'fehlgeschlagen',
    );
    await vi.runAllTimersAsync();
    expect(ereignis).not.toHaveBeenCalled();
  },
);
it('unter vorhandenem Token ohne Vormerkung wird keine Archivierung begonnen', async () => {
  await expect(
    sichereUngueltigeGesetzDatei('BGB_de-bund', '<kaputt/>', { token: 'vorhanden' }),
  ).rejects.toThrow('vorgemerkten Vorgang');
  expect(vormerken).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});
it('Abschlussfehler macht erfolgreiche Speicherung nicht zum Speicherfehler', async () => {
  abschliessen.mockRejectedValueOnce(new Error('Transport'));
  await expect(
    speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>'),
  ).resolves.toEqual(
    gesetzesreferenz({
      kurztitel: 'BGB',
    }),
  );
  expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe('<gesetz/>');
});

const gueltigesXML =
  '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><absatz>Text</absatz></norm></inhalt></gesetz>';
it('sicher erkennbarer gültiger Inhalt benötigt keine Vormerkung', async () => {
  expect((await sichereUngueltigeGesetzDatei('BGB_de-bund', gueltigesXML)).status).toBe('gueltig');
  expect(vormerken).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});
it('verwendet nach nativem Vergleich inzwischen reparierten Inhalt ohne Änderungsereignis', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'datei_sperre_erwerben') return 'token';
    if (befehl === 'archiviere_beschaedigte_datei') {
      dateien.set('gesetze/BGB_de-bund.xml', gueltigesXML);
      return { status: 'veraendert', sicherungspfad: null };
    }
  });
  expect(await sichereUngueltigeGesetzDatei('BGB_de-bund', '<kaputt/>')).toEqual({
    status: 'gueltig',
    inhalt: gueltigesXML,
  });
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'unveraendert');
  await vi.runAllTimersAsync();
  expect(ereignis).not.toHaveBeenCalled();
});

it('bündelt überlappende Schreibvorgänge bis auch langsame Titelsynchronisierung endet', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  let freigeben!: () => void;
  const warten = new Promise<boolean>((resolve) => {
    freigeben = () => resolve(false);
  });
  sync.mockImplementationOnce(() => warten);
  vormerken.mockResolvedValueOnce('BGB-vorgang').mockResolvedValueOnce('ZPO-vorgang');
  const erster = speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>');
  await vi.waitFor(() => expect(sync).toHaveBeenCalledOnce());
  await speichereGesetz(gesetzesreferenz({ kurztitel: 'ZPO' }), '<gesetz/>');
  await vi.advanceTimersByTimeAsync(1000);
  expect(ereignis).not.toHaveBeenCalled();
  freigeben();
  await erster;
  await vi.runAllTimersAsync();
  expect(ereignis).toHaveBeenCalledExactlyOnceWith(
    [gesetzesreferenz({ kurztitel: 'BGB' }), gesetzesreferenz({ kurztitel: 'ZPO' })],
    ['BGB-vorgang', 'ZPO-vorgang'],
  );
});
it('bündelt überlappende Vorgänge auch während eine zweite Quelle noch schreibt', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const nativeIo = invoke.getMockImplementation()!;
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'atomar_datei_schreiben' && args.relativerPfad.includes('ZPO')) await warten;
      return nativeIo(befehl, args);
    },
  );
  await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), '<gesetz/>');
  const zweiter = speichereGesetz(gesetzesreferenz({ kurztitel: 'ZPO' }), '<gesetz/>');
  await vi.advanceTimersByTimeAsync(1000);
  expect(ereignis).not.toHaveBeenCalled();
  freigeben();
  await zweiter;
  await vi.runAllTimersAsync();
  expect(ereignis).toHaveBeenCalledOnce();
  expect(ereignis.mock.calls[0]?.[0]).toHaveLength(2);
});

it('Prüflader sammelt beschädigte Gesetzdateien ohne Vormerkung oder Archivierung', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<kaputt/>');
  dateien.set('gesetze/ZPO_de-bund.xml', '  ');
  await expect(ladeAlleGesetzeFuerPruefung()).rejects.toMatchObject({
    errors: [
      expect.objectContaining({
        name: 'BeschaedigteGesetzdateiFehler',
        dateityp: 'gesetz',
        dateiBasis: 'BGB_de-bund',
        inhalt: '<kaputt/>',
      }),
      expect.objectContaining({ dateiBasis: 'ZPO_de-bund', grund: 'leer', inhalt: '  ' }),
    ],
  });
  expect(dateien.size).toBe(2);
  expect(vormerken).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it('Prüfbestand validiert Titel auch bei amtlichem Titel und sammelt beide Quelltypen', async () => {
  dateien.set(
    'gesetze/BGB_de-bund.xml',
    gueltigesXML.replace(
      '<bezeichnung>§ 1</bezeichnung>',
      '<bezeichnung>§ 1</bezeichnung><titel>Amtlich</titel>',
    ),
  );
  dateien.set('nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml', '<kaputt/>');
  dateien.set('gesetze/ZPO_de-bund.xml', '<kaputt/>');
  await expect(ladeAlleGesetzeFuerPruefung()).rejects.toMatchObject({
    beschaedigteQuellen: [
      expect.objectContaining({ dateityp: 'nichtamtlicheTitel', inhalt: '<kaputt/>' }),
      expect.objectContaining({ dateityp: 'gesetz', dateiBasis: 'ZPO_de-bund' }),
    ],
  });
  expect(invoke).not.toHaveBeenCalled();
  expect(mkdir).not.toHaveBeenCalled();
});
it('Prüflader erhält echten Zugriffsfehler neben gelesenen Beschädigungen', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', 'alt');
  dateien.set('gesetze/ZPO_de-bund.xml', '<kaputt/>');
  const zugriff = new Error('Zugriff verweigert');
  vi.mocked(readTextFile).mockRejectedValueOnce(zugriff);
  await expect(ladeAlleGesetzeFuerPruefung()).rejects.toMatchObject({
    errors: [zugriff, expect.objectContaining({ dateiBasis: 'ZPO_de-bund' })],
  });
  expect(invoke).not.toHaveBeenCalled();
});
it('bestätigtes Fehlen des Ordners ergibt leeren Prüfbestand ohne Anlage', async () => {
  vi.mocked(readDir).mockRejectedValueOnce(new Error('Fehlt'));
  await expect(ladeAlleGesetzeFuerPruefung()).resolves.toEqual([]);
  expect(mkdir).not.toHaveBeenCalled();
});
it('unzugänglicher Ordner und gescheiterte Existenzprüfung sind keine leeren Bestände', async () => {
  const zugriff = new Error('Ordnerzugriff');
  vi.mocked(readDir).mockRejectedValueOnce(zugriff);
  vi.mocked(exists).mockResolvedValueOnce(true);
  await expect(ladeAlleGesetzeFuerPruefung()).rejects.toBe(zugriff);
  vi.mocked(readDir).mockRejectedValueOnce(zugriff);
  const existenz = new Error('Existenzprüfung');
  vi.mocked(exists).mockRejectedValueOnce(existenz);
  await expect(ladeAlleGesetzeFuerPruefung()).rejects.toBe(existenz);
});
it('reparierbarer Gesetzinhalt bleibt benannter Befund ohne Heilung', async () => {
  const inhalt = '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos>';
  dateien.set('gesetze/BGB_de-bund.xml', inhalt);
  await expect(ladeAlleGesetzeFuerPruefung()).rejects.toMatchObject({
    beschaedigteQuellen: [expect.objectContaining({ grund: 'reparierbar', inhalt })],
  });
  expect(invoke).not.toHaveBeenCalled();
  expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe(inhalt);
});
it('konkurrierende vollständige Referenzen blockieren, unterschiedliche Normgeber nicht', async () => {
  dateien.set(
    'gesetze/BGB_unbekannt.xml',
    gueltigesXML.replace('<normgeber>de-bund</normgeber>', '<normgeber>unbekannt</normgeber>'),
  );
  dateien.set(
    'gesetze/bgb_unbekannt.xml',
    gueltigesXML.replace('<normgeber>de-bund</normgeber>', '<normgeber>unbekannt</normgeber>'),
  );
  await expect(ladeAlleGesetzeFuerPruefung()).rejects.toMatchObject({
    errors: expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('Mehrere Dateien') }),
    ]),
  });
  dateien.delete('gesetze/bgb_unbekannt.xml');
  dateien.set('gesetze/BGB_de-bund.xml', gueltigesXML);
  await expect(ladeAlleGesetzeFuerPruefung()).resolves.toHaveLength(2);
});

it('Fassade liefert typisierte Beschädigungsbefunde ohne Zugriffserrors als Sicherungsinhalt', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<kaputt/>');
  const ergebnis = await ladeAlleGesetzeFuerPruefung().catch((fehler: unknown) => fehler);
  expect(ergebnis).toBeInstanceOf(GesetzquellenPruefungFehler);
  if (!(ergebnis instanceof GesetzquellenPruefungFehler)) throw new Error('Falscher Fehlertyp');
  const befund: BeschaedigteGesetzquelle | undefined = ergebnis.beschaedigteQuellen[0];
  expect(befund).toBeInstanceOf(BeschaedigteGesetzdateiFehler);
});

const reparierbaresXML =
  '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos>';
it('direkte Sicherung erhält einen bereits erkennbaren Reparaturfall ohne Quellvorgang', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', reparierbaresXML);
  expect(await sichereUngueltigeGesetzDatei('BGB_de-bund', reparierbaresXML)).toEqual({
    status: 'reparierbar',
    dateiBasis: 'BGB_de-bund',
    kurztitel: 'BGB',
    quelle: 'de-bund',
  });
  expect(vormerken).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe(reparierbaresXML);
});
it('nativer Inhaltsvergleich erhält einen inzwischen reparierbaren Gesetzinhalt', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  const nativeIo = invoke.getMockImplementation()!;
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (
        befehl === 'archiviere_beschaedigte_datei' &&
        invoke.mock.calls.filter(([name]) => name === befehl).length === 1
      ) {
        dateien.set('gesetze/BGB_de-bund.xml', reparierbaresXML);
        return { status: 'veraendert', sicherungspfad: null };
      }
      return nativeIo(befehl, args);
    },
  );
  expect(await sichereUngueltigeGesetzDatei('BGB_de-bund', '<kaputt/>')).toEqual({
    status: 'reparierbar',
    dateiBasis: 'BGB_de-bund',
    kurztitel: 'BGB',
    quelle: 'de-bund',
  });
  expect(
    invoke.mock.calls.filter(([name]) => name === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
  expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe(reparierbaresXML);
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'unveraendert');
  await vi.runAllTimersAsync();
  expect(ereignis).not.toHaveBeenCalled();
});

it('normaler Lader meldet inzwischen reparierbaren Inhalt als Reparaturbefund', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<kaputt/>');
  const nativeIo = invoke.getMockImplementation()!;
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.set('gesetze/BGB_de-bund.xml', reparierbaresXML);
        return { status: 'veraendert', sicherungspfad: null };
      }
      return nativeIo(befehl, args);
    },
  );
  const befunde = vi.fn();
  expect(await ladeAlleGesetze(befunde)).toEqual([]);
  expect(befunde).toHaveBeenCalledExactlyOnceWith([
    { status: 'reparierbar', dateiBasis: 'BGB_de-bund', kurztitel: 'BGB', quelle: 'de-bund' },
  ]);
  expect(
    invoke.mock.calls.filter(([name]) => name === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
  expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe(reparierbaresXML);
});
it('native Vergleichsschleife erhält inzwischen leeren Inhalt ohne weitere Archivierung', async () => {
  const ereignis = vi.fn();
  abmelden = beiSpeicherBatchAbgeschlossen(ereignis);
  const nativeIo = invoke.getMockImplementation()!;
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        dateien.set('gesetze/BGB_de-bund.xml', '  ');
        return { status: 'veraendert', sicherungspfad: null };
      }
      return nativeIo(befehl, args);
    },
  );
  expect(await sichereUngueltigeGesetzDatei('BGB_de-bund', '<kaputt/>')).toEqual({
    status: 'leer',
  });
  expect(
    invoke.mock.calls.filter(([name]) => name === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
  expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe('  ');
  expect(abschliessen).toHaveBeenCalledWith('markierungs-vorgang', 'unveraendert');
  await vi.runAllTimersAsync();
  expect(ereignis).not.toHaveBeenCalled();
});

it('strikter Gesamtbestand meldet Gesetz- und Titelbefunde nur dem ausdrücklichen Empfänger', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<kaputt/>');
  dateien.set('nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml', '<kaputt/>');
  const empfangen = vi.fn();
  await expect(ladeAlleGesetzeFuerPruefung(empfangen)).rejects.toBeInstanceOf(
    GesetzquellenPruefungFehler,
  );
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('Gesetzdatei'),
      anlass: 'lesen',
      aenderungsstand: 'keine',
    }),
  );
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('Titeldatei'),
      anlass: 'lesen',
      aenderungsstand: 'keine',
    }),
  );
  expect(zeigeBanner).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  expect(dateien.get('gesetze/BGB_de-bund.xml')).toBe('<kaputt/>');
});

it('parallele strikte Bestandsprüfungen behalten getrennte Empfänger', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<kaputt/>');
  const erster = vi.fn();
  const zweiter = vi.fn();
  await Promise.allSettled([
    ladeAlleGesetzeFuerPruefung(erster),
    ladeAlleGesetzeFuerPruefung(zweiter),
  ]);
  expect(erster).toHaveBeenCalledTimes(1);
  expect(zweiter).toHaveBeenCalledTimes(1);
  expect(zeigeBanner).not.toHaveBeenCalled();
});

it('strikte Dateiprüfung meldet unlesbare Gesetzquelle und behält ihren Statusvertrag', async () => {
  dateien.set('gesetze/BGB_de-bund.xml', '<gesetz/>');
  vi.mocked(readTextFile).mockRejectedValueOnce(new Error('Zugriff verweigert'));
  const empfangen = vi.fn();
  await expect(pruefeGesetzDatei('BGB_de-bund', empfangen)).resolves.toMatchObject({
    status: 'unlesbar',
    fehler: 'Zugriff verweigert',
  });
  expect(empfangen).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('Zugriff verweigert'),
      anlass: 'lesen',
      aenderungsstand: 'keine',
    }),
  );
  expect(invoke).not.toHaveBeenCalled();
  expect(zeigeBanner).not.toHaveBeenCalled();
});

it('meldet eine gespeicherte Gesetzesdatei ohne Normgeber und lädt die übrigen Gesetze', async () => {
  dateien.set(
    'gesetze/BGB_unbekannt.xml',
    gueltigesXML.replace('<normgeber>de-bund</normgeber>', ''),
  );
  dateien.set('gesetze/BGB_de-bund.xml', gueltigesXML);
  dateien.set(
    'gesetze/ZPO_unbekannt.xml',
    gueltigesXML
      .replaceAll('BGB', 'ZPO')
      .replace('<normgeber>de-bund</normgeber>', '<normgeber>unbekannt</normgeber>'),
  );
  const befunde = vi.fn();
  expect(
    (await ladeAlleGesetze(befunde)).map(({ kurztitel, normgeber }) => ({ kurztitel, normgeber })),
  ).toEqual(
    expect.arrayContaining([
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      { kurztitel: 'ZPO', normgeber: 'unbekannt' },
    ]),
  );
  expect(befunde).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ dateiBasis: 'BGB_unbekannt' })]),
  );
  expect(dateien.has('gesetze/BGB_unbekannt.xml')).toBe(false);
});

it('parst den Inhalt einer beschädigten Gesetzdatei beim Lesen und Sichern nur einmal', async () => {
  const kaputt = '<gesetz><infos><kurztitel>BGB</kurztitel></infos><kaputt';
  dateien.set('gesetze/BGB_de-bund.xml', kaputt);
  const parsen = vi.spyOn(DOMParser.prototype, 'parseFromString');
  try {
    const { leseGesetz } = await import('./gesetzSpeicher.einzelweg');
    const ergebnis = await leseGesetz(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(ergebnis.status).toBe('nicht-lesbar');
    expect(dateien.has('gesetze/BGB_de-bund.xml')).toBe(false);
    expect(parsen.mock.calls.filter(([text]) => text === kaputt)).toHaveLength(1);
  } finally {
    parsen.mockRestore();
  }
});
