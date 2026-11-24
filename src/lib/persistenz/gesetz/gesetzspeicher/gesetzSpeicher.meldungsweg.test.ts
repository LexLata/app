import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
// Echter Gesetzesschreibweg einschließlich Titelsynchronisation; nur native I/O ist ersetzt.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  erzeugeAktionsMeldungsSammlung,
  erfasseAktionsFolgelauf,
  type AktionsMeldungEmpfaenger,
  type AktionsMeldung,
} from '@/lib/domain/app/aktionsMeldung';
import { dateiAttrappen } from '@/test/plattform/dateiAttrappen';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { speichereGesetz, GesetzSpeicherFolgefehler } from '@/lib/persistenz/gesetz/gesetz.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { synchronisiereNichtamtlicheTitelFuerGesetze } from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.synchronisieren';
import { beiSpeicherBatchAbgeschlossen } from './gesetzSpeicherEreignisse';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  banner: vi.fn(),
  vormerken: vi.fn(),
  abschliessen: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (befehl: string, ...argumente: unknown[]) =>
    befehl === 'gesetz_dateistempel_lesen'
      ? Promise.resolve(gesetzDateistempelAttrappe(io.dateien))
      : io.invoke(befehl, ...argumente),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn() }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: io.banner,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () =>
  dateiAttrappen(io.dateien, async (pfad) => {
    const inhalt = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  }),
);
const pruefempfaenger = { vormerken: io.vormerken, abschliessen: io.abschliessen };
const gesetz = () => ({ kurztitel: 'GG', normgeber: 'de-bund' });
const gesetzpfad = 'gesetze/GG_de-bund.xml';
const titelpfad = 'nichtamtliche-titel/GG_de-bund-nichtamtliche-titel.xml';
let meldungen: AktionsMeldung[];
const empfangen = (meldung: AktionsMeldung) => meldungen.push(meldung);
const abmeldungen: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  io.dateien.clear();
  meldungen = [];
  registrierePruefpflichtigeAenderung(pruefempfaenger);
  io.vormerken.mockResolvedValue('gesetz-vorgang');
  io.abschliessen.mockResolvedValue(undefined);
  io.invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
      if (befehl === 'datei_sperre_erwerben') return 'token';
      if (befehl === 'datei_sperre_freigeben') return;
      if (befehl === 'atomar_datei_schreiben') {
        io.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      throw new Error(`Unerwarteter nativer Aufruf: ${befehl}`);
    },
  );
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  for (const abmelden of abmeldungen.splice(0)) abmelden();
  vi.useRealTimers();
});
function mitTitelressource() {
  io.dateien.set('resources/nichtamtliche-titel/de-bund/GG.xml', '<nichtamtlicheTitel/>');
}
function scheitereNativeOperation(befehl: string, pfad: string, fehler: unknown) {
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === befehl && args.relativerPfad === pfad) throw fehler;
      return original(name, args);
    },
  );
}
function speichere(inhaltGeaendert = true) {
  return speichereGesetz(gesetz(), '<gesetz/>', { inhaltGeaendert, meldungEmpfangen: empfangen });
}

it('Vorabfehler bleibt beim ausdrücklichen Empfänger und verhindert jegliches Schreiben', async () => {
  io.vormerken.mockRejectedValueOnce(new Error('Prüfbedarf'));
  await expect(speichere()).rejects.toThrow('Prüfbedarf');
  expect(meldungen).toEqual([
    expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler', aenderungsstand: 'keine' }),
  ]);
  expect(io.invoke).not.toHaveBeenCalled();
  expect(io.banner).not.toHaveBeenCalled();
});
it.each([true, false])(
  'Gesetzsperrfehler bei inhaltGeaendert=%s meldet lokal, ohne Speichererfolg',
  async (inhaltGeaendert) => {
    scheitereNativeOperation('datei_sperre_erwerben', gesetzpfad, 'wartefrist');
    await expect(speichere(inhaltGeaendert)).rejects.toBe('wartefrist');
    expect(meldungen).toContainEqual(
      expect.objectContaining({ anlass: 'dateisperre', art: 'fehler', aenderungsstand: 'keine' }),
    );
    expect(io.dateien.has(gesetzpfad)).toBe(false);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('offener Gesetzprüfabschluss erhält den Erfolg und erzeugt keine zweite Speicherung', async () => {
  io.abschliessen.mockRejectedValueOnce(new Error('Abschluss'));
  await expect(speichere()).resolves.toEqual({ kurztitel: 'GG', normgeber: 'de-bund' });
  expect(meldungen).toEqual([
    expect.objectContaining({
      anlass: 'pruefabschluss',
      art: 'hinweis',
      aenderungsstand: 'vollstaendig',
    }),
  ]);
  expect(io.dateien.get(gesetzpfad)).toBe('<gesetz/>');
  expect(io.invoke.mock.calls.filter(([name]) => name === 'atomar_datei_schreiben')).toHaveLength(
    1,
  );
  expect(io.banner).not.toHaveBeenCalled();
});
it('eigentliche Schreibfehler werden nicht als Folgefehler einer gespeicherten Änderung bezeichnet', async () => {
  const fehler = new Error('Datenträger');
  scheitereNativeOperation('atomar_datei_schreiben', gesetzpfad, fehler);
  await expect(speichere()).rejects.toBe(fehler);
  expect(io.dateien.has(gesetzpfad)).toBe(false);
  expect(io.abschliessen).toHaveBeenCalledWith('gesetz-vorgang', 'fehlgeschlagen', empfangen);
});
it.each([true, false])(
  'Titelsperrfehler nach Schreiben (inhaltGeaendert=%s) bewahrt den auswertbaren Gesetzeserfolg',
  async (inhaltGeaendert) => {
    mitTitelressource();
    scheitereNativeOperation('datei_sperre_erwerben', titelpfad, 'wartefrist');
    const ergebnis = await speichere(inhaltGeaendert).catch((fehler: unknown) => fehler);
    expect(ergebnis).toBeInstanceOf(GesetzSpeicherFolgefehler);
    expect(ergebnis).toMatchObject({ inhaltGeaendert, cause: 'wartefrist' });
    expect(io.dateien.get(gesetzpfad)).toBe('<gesetz/>');
    expect(io.dateien.has(titelpfad)).toBe(false);
    expect(meldungen).toContainEqual(
      expect.objectContaining({
        anlass: 'dateisperre',
        art: 'hinweis',
        aenderungsstand: 'teilweise',
        text: expect.stringContaining(
          inhaltGeaendert
            ? 'Das Gesetz wurde gespeichert.'
            : 'Der Prüfzeitpunkt des Gesetzes wurde aktualisiert.',
        ),
      }),
    );
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('Titelvorabfehler betrifft die Ergänzung, während Gesetz und dessen Änderungsereignis erhalten bleiben', async () => {
  mitTitelressource();
  io.vormerken
    .mockResolvedValueOnce('gesetz-vorgang')
    .mockRejectedValueOnce(new Error('Titelbedarf'));
  const geaendert = vi.fn();
  abmeldungen.push(beiSpeicherBatchAbgeschlossen(geaendert));
  await expect(speichere()).rejects.toMatchObject({
    name: 'GesetzSpeicherFolgefehler',
    cause: new Error('Titelbedarf'),
  });
  expect(meldungen).toContainEqual(
    expect.objectContaining({
      anlass: 'pruefbedarf',
      art: 'hinweis',
      aenderungsstand: 'teilweise',
      text: expect.stringContaining('nichtamtlichen Titel'),
    }),
  );
  await vi.runAllTimersAsync();
  expect(geaendert).toHaveBeenCalledExactlyOnceWith(
    [{ kurztitel: 'GG', normgeber: 'de-bund' }],
    ['gesetz-vorgang'],
    [
      {
        gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
        vorgang: 'gesetz-vorgang',
        meldungEmpfangen: expect.any(Function),
      },
    ],
  );
  expect(io.banner).not.toHaveBeenCalled();
});
it('Titelschreibfehler erhält Ursache und verständlichen Hinweis zur bereits gespeicherten Gesetzdatei', async () => {
  mitTitelressource();
  scheitereNativeOperation('atomar_datei_schreiben', titelpfad, new Error('Titel-Datenträger'));
  await expect(speichere()).rejects.toMatchObject({
    name: 'GesetzSpeicherFolgefehler',
    cause: new Error('Titel-Datenträger'),
  });
  expect(meldungen).toContainEqual(
    expect.objectContaining({
      anlass: 'synchronisation',
      art: 'hinweis',
      aenderungsstand: 'teilweise',
      text: expect.stringContaining('Das Gesetz wurde gespeichert.'),
    }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});
it('offener Titelprüfabschluss wird explizit empfangen; beide Dateien bleiben gespeichert', async () => {
  mitTitelressource();
  io.abschliessen
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Titelabschluss'));
  await expect(speichere()).resolves.toEqual({ kurztitel: 'GG', normgeber: 'de-bund' });
  expect(io.dateien.get(titelpfad)).toBe('<nichtamtlicheTitel/>');
  expect(meldungen).toContainEqual(
    expect.objectContaining({
      anlass: 'pruefabschluss',
      art: 'hinweis',
      aenderungsstand: 'vollstaendig',
    }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});
it('Titel-Sammelsynchronisation gibt ihren ausdrücklichen Empfänger an den echten Quellweg weiter', async () => {
  mitTitelressource();
  io.vormerken.mockRejectedValueOnce(new Error('Titelbedarf'));
  await expect(synchronisiereNichtamtlicheTitelFuerGesetze([gesetz()], empfangen)).rejects.toThrow(
    'Titelbedarf',
  );
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler', aenderungsstand: 'keine' }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});
it('Hauptfensterstandard meldet Prüfabschluss weiter als Banner', async () => {
  io.abschliessen.mockRejectedValueOnce(new Error('Abschluss'));
  await expect(speichereGesetz(gesetz(), '<gesetz/>')).resolves.toEqual({
    kurztitel: 'GG',
    normgeber: 'de-bund',
  });
  expect(io.banner).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ typ: 'fehler', text: expect.stringContaining('gespeichert') }),
  );
});
it('ein defekter Meldungsempfänger ändert den gespeicherten Zustand nicht und schreibt nicht erneut', async () => {
  io.abschliessen.mockRejectedValueOnce(new Error('Abschluss'));
  await expect(
    speichereGesetz(gesetz(), '<gesetz/>', {
      inhaltGeaendert: true,
      meldungEmpfangen: () => {
        throw new Error('Empfänger');
      },
    }),
  ).resolves.toEqual({ kurztitel: 'GG', normgeber: 'de-bund' });
  expect(io.dateien.get(gesetzpfad)).toBe('<gesetz/>');
  expect(io.invoke.mock.calls.filter(([name]) => name === 'atomar_datei_schreiben')).toHaveLength(
    1,
  );
});

// Der registrierte Quellabschluss startet seine weitere Arbeit, ohne sie selbst
// abzuwarten. Erst der äußere Aktionsaufrufer wartet auf diese Folgeketten.
it.each(['titel', 'sicherung'] as const)(
  '%s-Weiterleitung erhält registrierte Folgeketten und deren Spätmeldungen',
  async (quelle) => {
    const sammlung = erzeugeAktionsMeldungsSammlung();
    let freigeben!: () => void;
    const sperre = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    io.abschliessen.mockImplementation(
      async (_vorgang, _ergebnis, empfaenger: AktionsMeldungEmpfaenger) => {
        if (quelle === 'titel' && io.abschliessen.mock.calls.length === 1) return;
        const lauf = sperre.then(() => {
          const weiterer = Promise.resolve().then(() =>
            empfaenger({
              text: 'Später Prüfabschluss',
              typ: 'warnung',
              art: 'hinweis',
              anlass: 'pruefabschluss',
              aenderungsstand: 'vollstaendig',
            }),
          );
          erfasseAktionsFolgelauf(empfaenger, weiterer);
        });
        erfasseAktionsFolgelauf(empfaenger, lauf);
      },
    );
    if (quelle === 'titel') {
      mitTitelressource();
      await speichereGesetz(gesetz(), '<gesetz/>', {
        inhaltGeaendert: true,
        meldungEmpfangen: sammlung.meldungEmpfangen,
      });
    } else {
      io.dateien.set(gesetzpfad, '<kaputt/>');
      const original = io.invoke.getMockImplementation()!;
      io.invoke.mockImplementation(async (name, args) => {
        if (name === 'archiviere_beschaedigte_datei') {
          io.dateien.delete(args.relativerPfad);
          return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
        }
        return original(name, args);
      });
      await ladeAlleGesetze(undefined, sammlung.meldungEmpfangen);
    }
    let abgeschlossen = false;
    const ende = sammlung.warteAufAbschluss(1000).then((stand) => {
      abgeschlossen = true;
      return stand;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(abgeschlossen).toBe(false);
    freigeben();
    await vi.advanceTimersByTimeAsync(200);
    await expect(ende).resolves.toBe('abgeschlossen');
    expect(sammlung.meldungen()).toContainEqual(
      expect.objectContaining({
        text:
          quelle === 'titel'
            ? 'Das Gesetz wurde gespeichert. Beim Ergänzen der nichtamtlichen Titel: Später Prüfabschluss'
            : 'Später Prüfabschluss',
      }),
    );
    expect(io.banner).not.toHaveBeenCalled();
  },
);
