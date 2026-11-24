// Prüft echte getrennte Fenster-Modulzustände gegen denselben Dateibestand.
// Nur Dateisystem, native Sperre und Tauri-Ereignisbus werden ersetzt;
// Bestandsladen, Titelergänzung, Speicherabschluss und Importentscheidungen bleiben real.

import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const umgebung = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  ressourcen: new Map<string, string>(),
  ereignisse: [] as { name: string; payload: string[] }[],
  lesen: vi.fn(),
  ordnerLesen: vi.fn(),
  emit: vi.fn(),
  sperren: new Set<string>(),
  vorSperre: undefined as (() => Promise<void>) | undefined,
  nativeAufrufe: [] as string[],
  titelFehler: 0,
}));

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  sichereBeiUngueltigemInhalt: async (
    pfad: string,
    inhalt: string,
    gueltig: (inhalt: string) => boolean,
  ) => {
    if (!inhalt.trim()) return { status: 'leer' };
    if (gueltig(inhalt)) return { status: 'gueltig', inhalt };
    umgebung.dateien.delete(pfad);
    return { status: 'archiviert', sicherungspfad: `${pfad}.sicherung` };
  },
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sicherstelleOrdner: async () => {},
  appDatenLesen: async (pfad: string) => {
    umgebung.lesen(pfad);
    if (pfad.startsWith('nichtamtliche-titel/') && umgebung.titelFehler > 0) {
      umgebung.titelFehler--;
      throw new Error('Titelzugriff');
    }
    const inhalt = umgebung.dateien.get(pfad);
    if (inhalt === undefined) throw new Error('Fehlt');
    return inhalt;
  },
  appDatenLesenOderNull: async (pfad: string) => umgebung.dateien.get(pfad) ?? null,
  appDatenExistiert: async (pfad: string) => umgebung.dateien.has(pfad),
  appDatenOrdnerLesen: async (ordner: string) => {
    umgebung.ordnerLesen(ordner);
    return [...umgebung.dateien.keys()]
      .filter((p) => p.startsWith(`${ordner}/`))
      .map((p) => ({ name: p.slice(ordner.length + 1) }));
  },
  appDatenVerarbeitungszeitAuffrischen: async (pfad: string, inhalt: string) => {
    umgebung.dateien.set(pfad, inhalt);
  },
  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    umgebung.dateien.set(pfad, inhalt);
  },
  appDatenLoeschen: async (pfad: string) => {
    umgebung.dateien.delete(pfad);
  },
}));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: async (_ziel: string, name: string, payload: string[] = []) => {
    await umgebung.emit(name);
    umgebung.ereignisse.push({ name, payload });
  },
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string, args?: { kurztitel: string }) => {
    umgebung.nativeAufrufe.push(befehl);
    if (befehl === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(umgebung.dateien);
    if (befehl === 'gesetz_import_sperre_versuchen_zu_erhalten') {
      const davor = umgebung.vorSperre;
      umgebung.vorSperre = undefined;
      await davor?.();
      if (umgebung.sperren.has(args!.kurztitel)) return false;
      umgebung.sperren.add(args!.kurztitel);
      return true;
    }
    if (befehl === 'gesetz_import_sperre_freigeben') umgebung.sperren.delete(args!.kurztitel);
    return 'vorgang';
  },
}));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: async (pfad: string) => pfad }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    const inhalt = umgebung.ressourcen.get(pfad);
    if (inhalt === undefined) throw new Error('Keine Ressource');
    return inhalt;
  },
}));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));
const internet = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: internet }));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  sucheImImportindex: async () => ({ kurztitel: 'BGB', abrufkennung: 'bgb' }),
  ImportindexFormatFehler: class extends Error {},
  leseReferenzVerzeichnis: async () => ({ eintraege: [], fehler: [] }),
}));

function xml(zeit: string, normgeber = 'de-bund', letzteNeuerung?: string): string {
  return `<gesetz><infos><langtitel>Testgesetz</langtitel><kurztitel>BGB</kurztitel><normgeber>${normgeber}</normgeber><verarbeitungszeit>${zeit}T00:00:00Z</verarbeitungszeit>${letzteNeuerung ? `<letzteNeuerung>${letzteNeuerung}T00:00:00Z</letzteNeuerung>` : ''}</infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><absatz>Text</absatz></norm></inhalt></gesetz>`;
}
function titel(text: string): string {
  return `<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>${text}</titel></norm></inhalt></nichtamtlicheTitel>`;
}
const pruefEmpfaenger = { vormerken: async () => 'pruefvorgang', abschliessen: async () => {} };
async function fenster() {
  vi.resetModules();
  const kern = await import('@/lib/persistenz/kern/kern.index');
  kern.registrierePruefpflichtigeAenderung(pruefEmpfaenger);
  const speicher = await import('@/test/tabs/gesetzSpeicherTestzugang');
  const sammel = await import('@/test/tabs/gesetzSammelladen');
  const dispatch = await import('./gesetzImportDispatch');
  const abschluss = await import('@/lib/import/importabschluss/importabschluss.index');
  return { speicher: { ...speicher, ...sammel }, dispatch, abschluss };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  umgebung.dateien.clear();
  umgebung.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  umgebung.ressourcen.clear();
  umgebung.ereignisse.length = 0;
  umgebung.nativeAufrufe.length = 0;
  umgebung.sperren.clear();
  umgebung.vorSperre = undefined;
  umgebung.titelFehler = 0;
  umgebung.emit.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Bestandsfrische unter der Gesetz-Sperre', () => {
  it('erkennt fremdes Speichern nach Sperrfreigabe vor ausstehendem Batch-Broadcast', async () => {
    const a = await fenster();
    const b = await fenster();
    expect(a.speicher.ladeAlleGesetze).not.toBe(b.speicher.ladeAlleGesetze);
    expect(await b.speicher.ladeAlleGesetze()).toEqual([]);
    umgebung.vorSperre = async () => {
      umgebung.sperren.add('["de-bund","bgb"]');
      await a.speicher.speichereGesetz(
        { kurztitel: 'BGB', normgeber: 'de-bund' },
        xml('2026-09-30'),
      );
      umgebung.sperren.delete('["de-bund","bgb"]');
      expect(umgebung.ereignisse.some((e) => e.name === 'gesetze-geaendert')).toBe(false);
      expect(a.speicher.istSpeicherBatchRuhig()).toBe(false);
      expect((await b.speicher.ladeAlleGesetze()).map((g) => g.kurztitel)).toEqual(['BGB']);
    };
    const ergebnis = await b.dispatch.importiereGesetze(['BGB'], 'de-bund');
    expect(ergebnis.fehlgeschlagene[0]?.fehler.grund).toBe('bereitsVorhanden');
    expect(internet).not.toHaveBeenCalled();
    expect(umgebung.sperren.size).toBe(0);
    expect(umgebung.nativeAufrufe).toContain('gesetz_import_sperre_freigeben');
  });

  it.each(['letzteNeuerung', 'verarbeitungszeit'] as const)(
    'kanonischer Import schützt neueren fremden Bestand anhand %s',
    async (feld) => {
      const alt = xml('2026-01-01', 'eu', feld === 'letzteNeuerung' ? '2026-01-01' : undefined);
      const neu = xml('2026-03-01', 'eu', feld === 'letzteNeuerung' ? '2026-03-01' : undefined);
      const dazwischen = xml(
        '2026-02-01',
        'eu',
        feld === 'letzteNeuerung' ? '2026-02-01' : undefined,
      );
      umgebung.dateien.set('gesetze/BGB_eu.xml', alt);
      const a = await fenster();
      const b = await fenster();
      await b.speicher.ladeAlleGesetze();
      await a.speicher.speichereGesetz({ kurztitel: 'BGB', normgeber: 'eu' }, neu, {
        inhaltGeaendert: false,
      });
      expect((await b.speicher.ladeAlleGesetze())[0]!.verarbeitungszeit).toEqual(
        new Date('2026-03-01'),
      );
      expect((await b.abschluss.importiereGesetzesXML(dazwischen)).art).toBe('fehler');
      expect(umgebung.dateien.get('gesetze/BGB_eu.xml')).toBe(neu);
    },
  );
});

describe('Fensterübergreifende Bestandsfrische ohne Cache-Ereignisse', () => {
  it('liest Prüfdatum-Refresh aus einem anderen Fenster ohne Inhalts-Broadcast', async () => {
    umgebung.dateien.set('gesetze/BGB_de-bund.xml', xml('2026-01-01'));
    const a = await fenster();
    const b = await fenster();
    await b.speicher.ladeAlleGesetze();
    await a.speicher.speichereGesetz(
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      xml('2026-09-30'),
      { inhaltGeaendert: false },
    );
    expect((await b.speicher.ladeAlleGesetze())[0]!.verarbeitungszeit).toEqual(
      new Date('2026-09-30'),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(umgebung.ereignisse).toEqual([{ name: 'gesetze-geaendert', payload: [] }]);
  });

  it('liest Titeländerung aus einem anderen Fenster ohne Anzeigenreload', async () => {
    umgebung.dateien.set('gesetze/BGB_de-bund.xml', xml('2026-01-01'));
    const a = await fenster();
    const b = await fenster();
    await b.speicher.ladeAlleGesetze();
    await a.speicher.ersetzeNichtamtlicheTitelDatei(
      (await a.speicher.ladeAlleGesetze())[0]!,
      titel('Neuer Titel'),
    );
    const gesetz = (await b.speicher.ladeAlleGesetze())[0]!;
    expect(gesetz.elemente.find((e) => e.typ === 'norm')?.data.titel).toBe('Neuer Titel');
    expect(umgebung.ereignisse).toEqual([]);
  });

  it('liest nach vorübergehendem Titelzugriffsfehler und nach Titelentfernung erneut', async () => {
    umgebung.dateien.set('gesetze/BGB_de-bund.xml', xml('2026-01-01'));
    const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
    umgebung.dateien.set(titelPfad, titel('Titel'));
    umgebung.titelFehler = 1;
    const b = await fenster();
    await b.speicher.ladeAlleGesetze();
    const gesetz = (await b.speicher.ladeAlleGesetze())[0]!;
    expect(gesetz.elemente.find((e) => e.typ === 'norm')?.data.titel).toBe('Titel');
    umgebung.dateien.delete(titelPfad);
    const ohneTitel = (await b.speicher.ladeAlleGesetze())[0]!;
    expect(ohneTitel.elemente.find((e) => e.typ === 'norm')?.data.titel).toBeUndefined();
    expect(umgebung.ordnerLesen.mock.calls.filter(([ordner]) => ordner === 'gesetze')).toHaveLength(
      3,
    );
    expect(umgebung.ereignisse).toEqual([]);
  });

  it.each(['', '<kaputt/>'])(
    'lädt nach unbrauchbarem Titelinhalt %s später wieder gültige Titel',
    async (inhalt) => {
      umgebung.dateien.set('gesetze/BGB_de-bund.xml', xml('2026-01-01'));
      const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
      umgebung.dateien.set(titelPfad, inhalt);
      const b = await fenster();
      await b.speicher.ladeAlleGesetze();
      umgebung.dateien.set(titelPfad, titel('Repariert'));
      const gesetz = (await b.speicher.ladeAlleGesetze())[0]!;
      expect(gesetz.elemente.find((e) => e.typ === 'norm')?.data.titel).toBe('Repariert');
      expect(
        umgebung.ordnerLesen.mock.calls.filter(([ordner]) => ordner === 'gesetze'),
      ).toHaveLength(2);
    },
  );

  it('wartet vor Fensterabschluss auf den bestehenden Inhalts-Broadcast', async () => {
    let freigeben!: () => void;
    umgebung.emit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          freigeben = resolve;
        }),
    );
    const a = await fenster();
    await a.speicher.speichereGesetz({ kurztitel: 'BGB', normgeber: 'de-bund' }, xml('2026-09-30'));
    await vi.advanceTimersByTimeAsync(200);
    expect(umgebung.emit).toHaveBeenCalledWith('gesetze-geaendert');
    expect(a.speicher.istSpeicherBatchRuhig()).toBe(false);
    const geschlossen = vi.fn();
    const schliessen = a.speicher.warteAufSpeicherBatchAbschluss().then(geschlossen);
    await vi.advanceTimersByTimeAsync(40);
    expect(geschlossen).not.toHaveBeenCalled();
    freigeben();
    await vi.advanceTimersByTimeAsync(20);
    await schliessen;
    expect(a.speicher.istSpeicherBatchRuhig()).toBe(true);
    expect(umgebung.ereignisse.map((e) => e.name)).toEqual(['gesetze-geaendert']);
  });

  it('fehlgeschlagener Inhalts-Broadcast verhindert frisches Laden und Abschluss nicht', async () => {
    umgebung.emit.mockRejectedValueOnce(new Error('Zustellung'));
    const a = await fenster();
    const b = await fenster();
    await a.speicher.speichereGesetz({ kurztitel: 'BGB', normgeber: 'de-bund' }, xml('2026-09-30'));
    await vi.advanceTimersByTimeAsync(200);
    expect(a.speicher.istSpeicherBatchRuhig()).toBe(true);
    expect((await b.speicher.ladeAlleGesetze())[0]!.kurztitel).toBe('BGB');
  });
});

describe('EU-Bundle durch den echten Dispatch und Speicherabschluss', () => {
  it.each(['', 'A_B'])(
    'weist den ungültigen Bundle-Normgeber %s vor dem Bestandszugriff zurück',
    async (normgeber) => {
      const { dispatch } = await fenster();
      umgebung.ressourcen.set('resources/europa/bgb.xml', xml('2026-09-30', normgeber));
      const ergebnis = await dispatch.importiereGesetze(
        [{ kurztitel: 'BGB', abrufkennung: 'bgb.xml' }],
        'eu',
      );
      expect(ergebnis.erfolgreiche).toEqual([]);
      expect(ergebnis.fehlgeschlagene).toMatchObject([{ fehler: { grund: 'format' } }]);
      expect(umgebung.ordnerLesen).not.toHaveBeenCalled();
      expect([...umgebung.dateien.keys()]).toEqual(['cache/suchverzeichnis.json']);
      expect(umgebung.sperren.size).toBe(0);
    },
  );

  it.each(['letzteNeuerung', 'verarbeitungszeit'] as const)(
    'neuere Version anhand %s erreicht den Abschluss und bewahrt die Bestandsschreibweise',
    async (vergleich) => {
      const { speicher, dispatch } = await fenster();
      const alt = xml(
        '2026-09-29',
        'eu',
        vergleich === 'letzteNeuerung' ? '2026-09-29' : undefined,
      );
      const neu = xml(
        '2026-09-30',
        'eu',
        vergleich === 'letzteNeuerung' ? '2026-09-30' : undefined,
      );
      umgebung.dateien.set('gesetze/bgb_eu.xml', alt);
      await speicher.speichereGesetz({ kurztitel: 'BGB', normgeber: 'eu' }, alt);
      await speicher.speichereGesetz({ kurztitel: 'BGB', normgeber: 'de-bund' }, xml('2026-09-30'));
      await speicher.speichereGesetz(
        { kurztitel: 'BGB', normgeber: 'de-bw' },
        xml('2026-09-30', 'de-bw'),
      );
      umgebung.ressourcen.set('resources/europa/bgb.xml', neu);
      const ergebnis = await dispatch.importiereGesetze(
        [{ kurztitel: 'bgb', abrufkennung: 'bgb.xml' }],
        'eu',
      );
      expect(ergebnis.fehlgeschlagene).toEqual([]);
      expect(
        ergebnis.erfolgreiche.map((g) => ({ kurztitel: g.kurztitel, normgeber: g.normgeber })),
      ).toEqual([{ kurztitel: 'bgb', normgeber: 'eu' }]);
      expect(await speicher.ladeGesetzesXML({ kurztitel: 'bgb', normgeber: 'eu' })).toBe(
        neu
          .replace('<normgeber>eu</normgeber>', '<normgeber>eu</normgeber>')
          .replace('<kurztitel>BGB</kurztitel>', '<kurztitel>bgb</kurztitel>'),
      );
      expect(await speicher.ladeGesetzesXML({ kurztitel: 'BGB', normgeber: 'de-bund' })).toBe(
        xml('2026-09-30'),
      );
      expect(await speicher.ladeGesetzesXML({ kurztitel: 'BGB', normgeber: 'de-bw' })).toBe(
        xml('2026-09-30', 'de-bw'),
      );
      expect(umgebung.sperren.size).toBe(0);
    },
  );
  it.each(['2026-09-29', '2026-09-30'])(
    'ältere/gleiche Bundleversion %s wird ohne Schreiben abgelehnt',
    async (datum) => {
      const { speicher, dispatch } = await fenster();
      const alt = xml('2026-09-30', 'eu');
      umgebung.dateien.set('gesetze/bgb_eu.xml', alt);
      await speicher.speichereGesetz({ kurztitel: 'BGB', normgeber: 'eu' }, alt);
      umgebung.ressourcen.set('resources/europa/bgb.xml', xml(datum, 'eu'));
      const ergebnis = await dispatch.importiereGesetze(
        [{ kurztitel: 'BGB', abrufkennung: 'bgb.xml' }],
        'eu',
      );
      expect(ergebnis.fehlgeschlagene[0]?.fehler.grund).toBe('bereitsVorhanden');
      expect(ergebnis.erfolgreiche).toEqual([]);
      expect(await speicher.ladeGesetzesXML({ kurztitel: 'bgb', normgeber: 'eu' })).toBe(
        alt
          .replace('<normgeber>eu</normgeber>', '<normgeber>eu</normgeber>')
          .replace('<kurztitel>BGB</kurztitel>', '<kurztitel>bgb</kurztitel>'),
      );
      expect(umgebung.sperren.size).toBe(0);
    },
  );
});
