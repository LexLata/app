// @vitest-environment jsdom
// Kommentaraktionen verwenden den echten Markierungsspeicher und Persistenzkern.
// Native Datei-I/O und die Historien-IPC-Grenze sind ersetzt; der gesamte Ladeweg ist echt.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, expect, it, vi } from 'vitest';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { speichereKommentar } from './hilfsfenster-aktionen.index';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import type { KommentarKontext } from './markierungen.hilfsfensterKontext';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsFensterGesetzLader } from '@/test/markierungen/markierungsFensterGesetzLader';
const markierungsEinzelzugriffFuerTest = markierungsFensterGesetzLader();

const m = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  banner: vi.fn(),
  lesen: vi.fn(),
  vormerken: vi.fn(),
  abschliessen: vi.fn(),
  historie: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: m.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(), listen: async () => () => {} }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: m.banner,
  meldeDateibefund: m.banner,
}));
vi.mock('./markierungsUebertragung', () => ({
  schliesseGespeicherteMarkierungsAktionAb: m.historie,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: m.lesen,
  exists: async (pfad: string) => m.dateien.has(pfad.replace('/daten/LexLata/', '')),
  mkdir: vi.fn(),
  readDir: vi.fn(async (ordner: string) => {
    const relativ = ordner.replace('/daten/LexLata/', '');
    return [...m.dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${relativ}/`))
      .map((pfad) => ({ name: pfad.slice(relativ.length + 1), isDirectory: false }));
  }),
}));
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const kontext: KommentarKontext = {
  gesetz,
  openerLabel: 'fenster-1',
  ausgangsstelle: normAusgangsstelle('§ 1'),
};
const kanal = { vormerken: m.vormerken, abschliessen: m.abschliessen };
let meldungen: AktionsMeldung[];
const empfangen = (meldung: AktionsMeldung) => {
  meldungen.push(meldung);
};
const speichern = (kontextOverride = kontext) =>
  speichereKommentar(
    kontextOverride,
    markierungsEinzelzugriffFuerTest,
    'Kommentar',
    false,
    undefined,
    empfangen,
  );
const schreibaufrufe = () =>
  m.invoke.mock.calls.filter(([befehl]) => befehl === 'atomar_datei_schreiben');
beforeEach(() => {
  vi.clearAllMocks();
  registrierePruefpflichtigeAenderung(kanal);
  m.dateien.clear();
  meldungen = [];
  m.vormerken.mockResolvedValue('v1');
  m.abschliessen.mockResolvedValue(undefined);
  m.historie.mockResolvedValue({ art: 'erfolg' });
  m.lesen.mockImplementation(async (absolut: string) => {
    const inhalt = m.dateien.get(absolut.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt');
    return inhalt;
  });
  m.invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'gesetz_dateistempel_lesen')
        return [...m.dateien.keys()]
          .filter((pfad) => pfad.startsWith('gesetze/'))
          .map((pfad) => ({
            name: pfad.slice(8),
            dateistempel: { groesse: '1', aenderungszeit: '1' },
          }));
      if (befehl === 'datei_sperre_erwerben') return args.relativerPfad;
      if (befehl === 'datei_sperre_freigeben') return;
      if (befehl === 'atomar_datei_schreiben') {
        m.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      throw new Error(befehl);
    },
  );
});

const gesetzXML =
  '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><absatz>Text</absatz></norm></inhalt></gesetz>';
const titelPfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
beforeEach(() => {
  m.dateien.set('gesetze/BGB_de-bund.xml', gesetzXML);
});
it.each(['archiviert', 'gesichert_aber_nicht_entfernt'])(
  'fasst unbeteiligte Gesetzdatei mit %s beim Kommentar nicht an',
  async (status) => {
    m.dateien.set('gesetze/Fremd_de-bund.xml', 'defekt');
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        if (status === 'archiviert') m.dateien.delete(args.relativerPfad);
        return { status, sicherungspfad: 'kopie' };
      }
      return nativ(befehl, args);
    });
    await expect(speichern()).resolves.toEqual({ art: 'erfolg' });
    expect(meldungen).toEqual([]);
    expect(m.dateien.get('gesetze/Fremd_de-bund.xml')).toBe('defekt');
    expect(m.banner).not.toHaveBeenCalled();
    expect(schreibaufrufe()).toHaveLength(1);
    expect(m.historie).toHaveBeenCalledOnce();
  },
);
it.each(['leer', 'unlesbar', 'sicherung', 'archiviert', 'gesichert_aber_nicht_entfernt'])(
  'erhält eigene Titelmeldung für %s ohne Kommentarabbruch',
  async (status) => {
    m.dateien.set(titelPfad, status === 'leer' ? ' ' : 'defekt');
    const lesen = m.lesen.getMockImplementation()!;
    m.lesen.mockImplementation(async (pfad) => {
      if (status === 'unlesbar' && pfad.endsWith('-nichtamtliche-titel.xml'))
        throw new Error('Lesen');
      return lesen(pfad);
    });
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        if (status === 'sicherung') throw new Error('Sicherung');
        if (status === 'archiviert') m.dateien.delete(args.relativerPfad);
        return { status, sicherungspfad: 'kopie' };
      }
      return nativ(befehl, args);
    });
    await expect(speichern()).resolves.toEqual({ art: 'erfolg' });
    const grund = {
      // Leere Titeldateien werden geprüft gesichert; die Attrappe lehnt den Status ab.
      leer: 'sicherungFehlgeschlagen',
      unlesbar: 'nichtLesbar',
      sicherung: 'sicherungFehlgeschlagen',
      archiviert: 'imDatenordnerGesichert',
      gesichert_aber_nicht_entfernt: 'gesichertNichtEntfernt',
    }[status];
    expect(meldungen).toEqual([
      expect.objectContaining({
        grund,
        betroffen: 'BGB_de-bund-nichtamtliche-titel.xml',
        text: expect.stringContaining('Titeldatei'),
      }),
    ]);
    expect(JSON.stringify(meldungen, (k, v) => (k === 'sicherung' ? undefined : v))).not.toContain(
      'kopie',
    );
    expect(m.banner).not.toHaveBeenCalled();
    expect(schreibaufrufe()).toHaveLength(1);
    expect(m.historie).toHaveBeenCalledOnce();
  },
);
it('meldet fehlenden Prüfbedarf der Gesetzessicherung und bricht bei benötigter Ausgangsquelle ab', async () => {
  m.dateien.set('gesetze/BGB_de-bund.xml', 'defekt');
  m.vormerken.mockRejectedValue(new Error('Bedarf'));
  await expect(speichern()).rejects.toThrow('Ausgangsquelle');
  expect(meldungen).toContainEqual(expect.objectContaining({ anlass: 'pruefbedarf' }));
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.invoke.mock.calls.every(([befehl]) => befehl === 'gesetz_dateistempel_lesen')).toBe(
    true,
  );
  expect(m.historie).not.toHaveBeenCalled();
});
it.each(['gesetz', 'titel'])(
  'meldet Sperrwartefrist beim Laden der %s-Quelle ausdrücklich',
  async (quelle) => {
    const quellpfad = quelle === 'gesetz' ? 'gesetze/BGB_de-bund.xml' : titelPfad;
    m.dateien.set(quellpfad, 'defekt');
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'datei_sperre_erwerben' && args.relativerPfad === quellpfad)
        throw 'wartefrist';
      return nativ(befehl, args);
    });
    if (quelle === 'gesetz') await expect(speichern()).rejects.toThrow('Ausgangsquelle');
    else await expect(speichern()).resolves.toEqual({ art: 'erfolg' });
    expect(meldungen).toContainEqual(
      expect.objectContaining({
        anlass: 'dateisperre',
        text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
      }),
    );
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it.each(['gesetz', 'titel'])(
  'erhält Kommentarerfolg bei fehlendem Quellabschluss nach %s-Archivierung',
  async (quelle) => {
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quellpfad = quelle === 'gesetz' ? 'gesetze/Fremd_de-bund.xml' : titelPfad;
    m.dateien.set(quellpfad, 'defekt');
    m.abschliessen.mockRejectedValueOnce(new Error('IPC'));
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        m.dateien.delete(args.relativerPfad);
        return { status: 'archiviert', sicherungspfad: 'kopie' };
      }
      return nativ(befehl, args);
    });
    await expect(speichern()).resolves.toEqual({ art: 'erfolg' });
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
    );
    expect(schreibaufrufe()).toHaveLength(1);
    expect(m.historie).toHaveBeenCalledOnce();
    expect(m.banner).not.toHaveBeenCalled();
    protokoll.mockRestore();
  },
);
it.each(['leer', 'unlesbar', 'sicherung'])(
  'liest eine unbeteiligte Gesetzdatei mit %s beim Kommentar nicht',
  async (status) => {
    m.dateien.set('gesetze/Fremd_de-bund.xml', status === 'leer' ? ' ' : 'defekt');
    const lesen = m.lesen.getMockImplementation()!;
    m.lesen.mockImplementation(async (pfad) => {
      if (status === 'unlesbar' && pfad.endsWith('Fremd_de-bund.xml')) throw new Error('Lesen');
      return lesen(pfad);
    });
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') throw new Error('Sicherung');
      return nativ(befehl, args);
    });
    await expect(speichern()).resolves.toEqual({ art: 'erfolg' });
    expect(meldungen).toEqual([]);
    expect(m.banner).not.toHaveBeenCalled();
    expect(m.historie).toHaveBeenCalledOnce();
  },
);
it('ein defekter Empfänger verändert Laden, Speicherung und Historienaktion nicht', async () => {
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  m.dateien.set(titelPfad, ' ');
  await expect(
    speichereKommentar(
      kontext,
      markierungsEinzelzugriffFuerTest,
      'Kommentar',
      false,
      undefined,
      () => {
        throw new Error('Empfang');
      },
    ),
  ).resolves.toEqual({ art: 'erfolg' });
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.historie).toHaveBeenCalledOnce();
  expect(m.banner).not.toHaveBeenCalled();
  expect(protokoll).toHaveBeenCalled();
  protokoll.mockRestore();
});
it('verwechselt einen Quellabschluss nach Archivierung nicht mit Kommentarerfolg', async () => {
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  m.dateien.set('gesetze/BGB_de-bund.xml', 'defekt');
  m.abschliessen.mockRejectedValueOnce(new Error('IPC'));
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei') {
      m.dateien.delete(args.relativerPfad);
      return { status: 'archiviert', sicherungspfad: 'kopie' };
    }
    return nativ(befehl, args);
  });
  await expect(speichern()).rejects.toThrow('Ausgangsquelle');
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'sicherung', art: 'hinweis', aenderungsstand: 'teilweise' }),
  );
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
  );
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
  protokoll.mockRestore();
});
it('meldet leere Titeldateien beim Hauptfensteraufruf als leer und sichert sie', async () => {
  m.dateien.set(titelPfad, ' ');
  const original = m.invoke.getMockImplementation();
  if (!original) throw new Error('Dateigrenze fehlt');
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei') {
      m.dateien.set(titelPfad + '.bak', m.dateien.get(titelPfad) ?? '');
      m.dateien.delete(titelPfad);
      return { status: 'archiviert', sicherungspfad: titelPfad + '.bak' };
    }
    return original(befehl, args);
  });
  await expect(
    speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Kommentar', false),
  ).resolves.toEqual({
    art: 'erfolg',
  });
  expect(m.banner).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      typ: 'warnung',
      grund: 'dateiLeer',
      betroffen: 'BGB_de-bund-nichtamtliche-titel.xml',
    }),
  );
  expect(
    JSON.stringify(m.banner.mock.calls, (k, v) => (k === 'sicherung' ? undefined : v)),
  ).not.toContain('.bak');
  expect(m.dateien.get(titelPfad + '.bak')).toBe(' ');
});

it('Ordnerfehler bleibt Abbruchgrund und wird ausdrücklich gemeldet', async () => {
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'gesetz_dateistempel_lesen') throw new Error('Ordner');
    return nativ(befehl, args);
  });
  await expect(speichern()).rejects.toThrow('Ausgangsquelle');
  expect(meldungen).toEqual([
    expect.objectContaining({ anlass: 'lesen', text: expect.stringContaining('Gesetzordner') }),
  ]);
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});
it('Hauptfenster-Ladecallback erhält weiterhin seine Befunde ohne zusätzliche Gesetzbanner', async () => {
  m.dateien.set('gesetze/Fremd_de-bund.xml', ' ');
  const befunde = vi.fn();
  const gesetze = await ladeAlleGesetze(befunde);
  expect(gesetze.map((gesetz) => gesetz.kurztitel)).toEqual(['BGB']);
  expect(befunde).toHaveBeenCalledExactlyOnceWith([
    { status: 'leer', dateiBasis: 'Fremd_de-bund' },
  ]);
  expect(m.banner).not.toHaveBeenCalled();
});
it('Lesefehler beim nativen Titel-Inhaltsvergleich erhält eine eigene Titelmeldung', async () => {
  m.dateien.set(titelPfad, 'defekt');
  const lesen = m.lesen.getMockImplementation()!;
  let titelLesezahl = 0;
  m.lesen.mockImplementation(async (pfad) => {
    if (pfad.endsWith('-nichtamtliche-titel.xml') && ++titelLesezahl >= 3) throw new Error('Lesen');
    return lesen(pfad);
  });
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei')
      return { status: 'veraendert', sicherungspfad: null };
    return nativ(befehl, args);
  });
  await expect(speichern()).resolves.toEqual({ art: 'erfolg' });
  expect(meldungen).toEqual([
    expect.objectContaining({
      anlass: 'lesen',
      text: 'Die Titeldatei für „BGB“ konnte nicht gelesen werden. Ihre Titel werden derzeit nicht angezeigt.',
    }),
  ]);
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.historie).toHaveBeenCalledOnce();
});

const adressierungsMeldung =
  'Diese Stelle lässt sich im Gesetz nicht eindeutig adressieren. Hier sind keine Markierungen möglich.';
it.each(['fehlendes Gesetz', 'fehlende Bezeichnung', 'doppelte Bezeichnung'])(
  'lehnt einen neuen Kommentar bei %s ohne Schreiben und Historie ab',
  async (fall) => {
    if (fall === 'fehlendes Gesetz') m.dateien.delete('gesetze/BGB_de-bund.xml');
    if (fall === 'fehlende Bezeichnung')
      m.dateien.set('gesetze/BGB_de-bund.xml', gesetzXML.replace('§ 1', '§ 2'));
    if (fall === 'doppelte Bezeichnung')
      m.dateien.set(
        'gesetze/BGB_de-bund.xml',
        gesetzXML.replace(
          '</inhalt>',
          '<norm id="p1"><bezeichnung>§ 1</bezeichnung><absatz>Doppelt</absatz></norm></inhalt>',
        ),
      );
    expect(await speichern()).toMatchObject({ art: 'fehler', text: adressierungsMeldung });
    expect(schreibaufrufe()).toEqual([]);
    expect(m.historie).not.toHaveBeenCalled();
  },
);
