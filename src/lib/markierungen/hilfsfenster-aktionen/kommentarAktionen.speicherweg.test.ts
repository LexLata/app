// Kommentaraktionen verwenden den echten Markierungsspeicher und Persistenzkern.
// Native Datei-I/O, Ausgangsgesetz-Laden und die Historien-IPC-Grenze sind ersetzt.
import { normaleNorm, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import { speichereKommentar } from './hilfsfenster-aktionen.index';
import {
  mitGesetzDateiSperren,
  registrierePruefpflichtigeAenderung,
} from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import { hinzufuegenMarkierung, ladeMarkierungen } from '@/lib/markierungen/eintrag/eintrag.index';
import type { KommentarKontext } from './markierungen.hilfsfensterKontext';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

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
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn() }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: m.banner,
  meldeDateibefund: m.banner,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetze: vi.fn(async () =>
    ['BGB', 'StGB'].map((kurztitel) => ({
      normgeber: 'de-bund',
      kurztitel,
      langtitel: 'BGB',
      hatGliederungsartikel: false,
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: 'n', xmlId: 'n', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    })),
  ),
}));
vi.mock('./markierungsUebertragung', () => ({
  schliesseGespeicherteMarkierungsAktionAb: m.historie,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: m.lesen,
  exists: async (pfad: string) => m.dateien.has(pfad.replace('/daten/LexLata/', '')),
  mkdir: vi.fn(),
  readDir: async (ordner: string) =>
    [...m.dateien.keys()]
      .filter((pfad) => pfad.startsWith(ordner.replace('/daten/LexLata/', '') + '/'))
      .map((pfad) => ({ name: pfad.split('/').at(-1), isDirectory: false })),
}));
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
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
  vi.resetAllMocks();
  registrierePruefpflichtigeAenderung(kanal);
  m.dateien.clear();
  for (const kurztitel of ['BGB', 'StGB'])
    m.dateien.set(
      `gesetze/${kurztitel}_de-bund.xml`,
      `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>${kurztitel}</kurztitel></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung></norm></inhalt></gesetz>`,
    );
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
it.each(['referenz', 'datei'])(
  'meldet Sperrwartefrist an der %s-Sperre ohne Speicherung oder Historienaktion',
  async (stufe) => {
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (
        befehl === 'datei_sperre_erwerben' &&
        (stufe === 'referenz' || args.relativerPfad === pfad)
      )
        throw 'wartefrist';
      return nativ(befehl, args);
    });
    await expect(speichern()).rejects.toBe('wartefrist');
    expect(meldungen).toEqual([
      expect.objectContaining({
        anlass: 'dateisperre',
        art: 'fehler',
        aenderungsstand: 'keine',
        text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
      }),
    ]);
    expect(schreibaufrufe()).toHaveLength(0);
    expect(m.historie).not.toHaveBeenCalled();
    expect(m.banner).not.toHaveBeenCalled();
  },
);
it('meldet Lesefehler der vorhandenen Markierungsdatei lokal und erhält den Fehler', async () => {
  m.dateien.set(pfad, '<markierungen></markierungen>');
  const fehler = new Error('Zugriff verweigert');
  const vorher = m.lesen.getMockImplementation();
  if (!vorher) throw new Error('Lesefunktion fehlt');
  m.lesen.mockImplementation(async (absolut: string) =>
    absolut.endsWith(pfad) ? Promise.reject(fehler) : vorher(absolut),
  );
  await expect(speichern()).rejects.toBe(fehler);
  expect(meldungen).toEqual([
    expect.objectContaining({ anlass: 'lesen', art: 'fehler', aenderungsstand: 'keine' }),
  ]);
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});
it('meldet fehlenden Prüfbedarf vor Quellsperre und Speicherung', async () => {
  const fehler = new Error('Bedarf');
  m.vormerken.mockRejectedValue(fehler);
  await expect(speichern()).rejects.toBe(fehler);
  expect(meldungen).toEqual([
    expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler', aenderungsstand: 'keine' }),
  ]);
  expect(m.invoke).not.toHaveBeenCalled();
  expect(m.historie).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});
it.each(['archiviert', 'gesichert_aber_nicht_entfernt'])(
  'bewahrt Sicherung %s und unterscheidet die anschließend abgebrochene Speicherung',
  async (status) => {
    m.dateien.set(pfad, 'defekt');
    const fehler = new Error('Schreiben gescheitert');
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        m.dateien.set('kopie', m.dateien.get(pfad) ?? '');
        if (status === 'archiviert') m.dateien.delete(pfad);
        return { status, sicherungspfad: 'kopie' };
      }
      if (befehl === 'atomar_datei_schreiben') throw fehler;
      return nativ(befehl, args);
    });
    await expect(speichern()).rejects.toThrow(
      status === 'archiviert' ? 'Schreiben gescheitert' : 'nicht entfernt',
    );
    expect(meldungen).toEqual([
      expect.objectContaining({
        anlass: 'sicherung',
        art: status === 'archiviert' ? 'hinweis' : 'fehler',
        aenderungsstand: 'teilweise',
        grund: status === 'archiviert' ? 'imDatenordnerGesichert' : 'nichtBereinigt',
        sicherung: 'kopie',
      }),
    ]);
    expect(JSON.stringify(meldungen, (k, v) => (k === 'sicherung' ? undefined : v))).not.toContain(
      'kopie',
    );
    expect(m.historie).not.toHaveBeenCalled();
    expect(m.banner).not.toHaveBeenCalled();
    expect(schreibaufrufe()).toHaveLength(status === 'archiviert' ? 1 : 0);
  },
);
it('meldet Sicherungsfehler ohne Schreiben', async () => {
  m.dateien.set(pfad, 'defekt');
  const fehler = new Error('Sicherung');
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei') throw fehler;
    return nativ(befehl, args);
  });
  await expect(speichern()).rejects.toBe(fehler);
  expect(meldungen).toEqual([
    expect.objectContaining({ anlass: 'sicherung', art: 'fehler', aenderungsstand: 'keine' }),
  ]);
  expect(schreibaufrufe()).toHaveLength(0);
  expect(m.historie).not.toHaveBeenCalled();
  expect(m.banner).not.toHaveBeenCalled();
});
it.each([false, true])(
  'erhält gespeicherten Kommentar und Historienaktion bei fehlendem Prüfabschluss (Bearbeiten=%s)',
  async (bearbeiten) => {
    const vorher = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar' as const,
      ausgangsstelle: normAusgangsstelle('§ 1'),

      kommentarText: 'Vorher',
    });
    if (bearbeiten) {
      await hinzufuegenMarkierung(gesetz, vorher);
      m.invoke.mockClear();
    }
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.abschliessen.mockRejectedValue(new Error('IPC'));
    const k = bearbeiten
      ? {
          ...kontext,
          bearbeiten: {
            kommentarText: 'Vorher',
            vorher: { elementstand: testElementstand(), kommentarText: 'Vorher' },
          },
        }
      : kontext;
    await expect(speichern(k)).resolves.toEqual({ art: 'erfolg' });
    expect((await ladeMarkierungen(gesetz))[0]!.kommentarText).toBe('Kommentar');
    expect(meldungen).toEqual([
      expect.objectContaining({
        anlass: 'pruefabschluss',
        art: 'hinweis',
        aenderungsstand: 'vollstaendig',
      }),
    ]);
    expect(schreibaufrufe()).toHaveLength(1);
    expect(m.historie).toHaveBeenCalledTimes(1);
    expect(m.historie.mock.calls[0]![0]).toMatchObject({
      art: bearbeiten ? 'kommentarBearbeiten' : 'hinzufuegen',
    });
    expect(m.banner).not.toHaveBeenCalled();
    protokoll.mockRestore();
  },
);
it('meldet gemeinsame Gesetzdateisperren ebenfalls an den Vorgang', async () => {
  m.invoke.mockRejectedValue('wartefrist');
  await expect(
    mitGesetzDateiSperren(
      [{ gesetz, ordner: 'markierungen', suffix: '-markierungen.xml' }],
      vi.fn(),
      empfangen,
    ),
  ).rejects.toBe('wartefrist');
  expect(meldungen).toEqual([expect.objectContaining({ anlass: 'dateisperre' })]);
  expect(m.banner).not.toHaveBeenCalled();
});

it('hält Meldungen zweier gleichzeitig laufender Kommentaraktionen getrennt', async () => {
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  m.invoke.mockImplementation(async (befehl: string, args: { relativerPfad: string }) => {
    if (befehl !== 'datei_sperre_erwerben') return;
    if (args.relativerPfad.includes('bgb_')) {
      await warten;
      throw 'wartefrist';
    }
    throw 'ipc';
  });
  const zweiteMeldungen: AktionsMeldung[] = [];
  const erste = expect(speichern()).rejects.toBe('wartefrist');
  await expect(
    speichereKommentar(
      { ...kontext, gesetz: gesetzesreferenz({ kurztitel: 'StGB' }) },
      markierungsEinzelzugriffFuerTest,
      'Zweiter Kommentar',
      false,
      undefined,
      (meldung) => {
        zweiteMeldungen.push(meldung);
      },
    ),
  ).rejects.toBe('ipc');
  expect(meldungen).toEqual([]);
  freigeben();
  await erste;
  expect(meldungen).toEqual([
    expect.objectContaining({ text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.' }),
  ]);
  expect(zweiteMeldungen).toEqual([
    expect.objectContaining({
      text: 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
    }),
  ]);
  expect(m.banner).not.toHaveBeenCalled();
  expect(m.historie).not.toHaveBeenCalled();
});
it('speichert nach erfolgreicher Archivierung genau einmal und erhält die Historienaktion', async () => {
  m.dateien.set(pfad, 'defekt');
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei') {
      m.dateien.set('kopie', m.dateien.get(pfad) ?? '');
      m.dateien.delete(pfad);
      return { status: 'archiviert', sicherungspfad: 'kopie' };
    }
    return nativ(befehl, args);
  });
  await expect(speichern()).resolves.toEqual({ art: 'erfolg' });
  expect((await ladeMarkierungen(gesetz))[0]!.kommentarText).toBe('Kommentar');
  expect(meldungen).toEqual([
    expect.objectContaining({ anlass: 'sicherung', art: 'hinweis', aenderungsstand: 'teilweise' }),
  ]);
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.historie).toHaveBeenCalledTimes(1);
  expect(m.banner).not.toHaveBeenCalled();
});
it('erhält Speichererfolg und Historienaktion auch bei einem defekten Meldungsempfänger', async () => {
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  m.abschliessen.mockRejectedValue(new Error('IPC'));
  await expect(
    speichereKommentar(
      kontext,
      markierungsEinzelzugriffFuerTest,
      'Kommentar',
      false,
      undefined,
      () => {
        throw new Error('Meldung');
      },
    ),
  ).resolves.toEqual({ art: 'erfolg' });
  expect((await ladeMarkierungen(gesetz))[0]!.kommentarText).toBe('Kommentar');
  expect(schreibaufrufe()).toHaveLength(1);
  expect(m.historie).toHaveBeenCalledTimes(1);
  expect(m.banner).not.toHaveBeenCalled();
  expect(protokoll).toHaveBeenCalled();
  protokoll.mockRestore();
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: vi.fn(async () =>
    ['BGB', 'StGB'].map((kurztitel) => ({
      normgeber: 'de-bund',
      kurztitel,
      langtitel: 'BGB',
      hatGliederungsartikel: false,
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: 'n', xmlId: 'n', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    })),
  ),
}));
