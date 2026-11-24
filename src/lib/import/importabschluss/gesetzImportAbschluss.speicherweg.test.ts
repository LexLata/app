// Echter Importabschluss mit Gesetz-/Titelpersistenz; nur native I/O und Prüfkoordinator ersetzt.
import { readFileSync } from 'node:fs';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { dateiAttrappen, gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import {
  taggeUndSpeichereGesetzesXML,
  importiereGesetzesXML,
  type ReferenzKontext,
} from './importabschluss.index';
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  banner: vi.fn(),
  vormerken: vi.fn(),
  abschliessen: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
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

const kontext: ReferenzKontext = {
  merkeGespeichertesGesetz: () => {},
  mitMeldungsempfaenger: async () => {
    throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
  },
  referenzenFuer: async () => [],
  meldeEinschraenkung: () => {},
};
const pruefempfaenger = { vormerken: io.vormerken, abschliessen: io.abschliessen };
let meldungen: AktionsMeldung[];
const empfangen = (meldung: AktionsMeldung) => meldungen.push(meldung);
function xml(normgeber = 'de-bund', text = 'Text', zeit = '2026-01-01T00:00:00Z') {
  return `<gesetz version="1"><infos><kurztitel>GG</kurztitel><langtitel>Grundgesetz</langtitel><normgeber>${normgeber}</normgeber><verarbeitungszeit>${zeit}</verarbeitungszeit></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung><text><absatz>${text}</absatz></text></norm></inhalt></gesetz>`;
}
function schreiben() {
  return io.invoke.mock.calls.filter(([name]) => name === 'atomar_datei_schreiben');
}
function titelScheitert(normgeber = 'de-bund') {
  io.dateien.set(
    `resources/nichtamtliche-titel/${normgeber.toLowerCase()}/GG.xml`,
    '<nichtamtlicheTitel/>',
  );
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === 'datei_sperre_erwerben' && args.relativerPfad.startsWith('nichtamtliche-titel/'))
        throw 'wartefrist';
      return original(name, args);
    },
  );
}
function importieren(empfaenger: AktionsMeldungEmpfaenger | undefined = empfangen) {
  return taggeUndSpeichereGesetzesXML(
    xml(),
    'GG',
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    kontext,
    empfaenger,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  io.dateien.clear();
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  meldungen = [];
  registrierePruefpflichtigeAenderung(pruefempfaenger);
  io.vormerken.mockResolvedValue('vorgang');
  io.abschliessen.mockResolvedValue(undefined);
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(io.dateien);
      if (name === 'datei_sperre_erwerben') return 'token';
      if (name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        io.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      throw new Error(`Unerwarteter Aufruf: ${name}`);
    },
  );
});
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});
it('meldet abgewiesenen Prüfbedarf lokal und schreibt nicht', async () => {
  io.vormerken.mockRejectedValueOnce(new Error('Prüfbedarf'));
  expect(await importieren()).toMatchObject({ art: 'fehler', fehler: { grund: 'speichern' } });
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'pruefbedarf', art: 'fehler' }),
  );
  expect(schreiben()).toHaveLength(0);
  expect(io.banner).not.toHaveBeenCalled();
});
it('erhält den Importerfolg bei fehlendem Prüfabschluss und sammelt den Hinweis', async () => {
  io.abschliessen.mockRejectedValueOnce(new Error('Abschluss'));
  expect(await importieren()).toMatchObject({
    art: 'erfolg',
    gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
  });
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'pruefabschluss', art: 'hinweis' }),
  );
  expect(schreiben()).toHaveLength(1);
  expect(io.banner).not.toHaveBeenCalled();
});
it.each(['neu', 'aktualisiert', 'unveraendert'] as const)(
  'erhält %s nach gescheiterter Titelergänzung ohne zweite Speicherung',
  async (fall) => {
    if (fall !== 'neu')
      io.dateien.set(
        'gesetze/GG_de-bund.xml',
        xml('de-bund', fall === 'aktualisiert' ? 'Alt' : 'Text'),
      );
    titelScheitert();
    const result =
      fall === 'neu'
        ? await importieren()
        : await taggeUndSpeichereGesetzesXML(
            xml(),
            'GG',
            undefined,
            undefined,
            true,
            undefined,
            undefined,
            kontext,
            empfangen,
          );
    expect(result).toMatchObject({
      art: 'erfolg',
      gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
      ...(fall === 'neu' ? {} : { kategorie: fall }),
    });
    expect(io.dateien.get('gesetze/GG_de-bund.xml')).toContain('Text');
    expect(schreiben()).toHaveLength(1);
    expect(meldungen.filter((m) => m.anlass === 'synchronisation')).toHaveLength(1);
    expect(meldungen).toContainEqual(
      expect.objectContaining({
        anlass: 'synchronisation',
        art: 'hinweis',
        text: expect.stringContaining(fall === 'unveraendert' ? 'Prüfzeitpunkt' : 'gespeichert'),
      }),
    );
    expect(JSON.parse(JSON.stringify(meldungen))).toEqual(meldungen);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('echter Schreibfehler bestätigt keinen Importerfolg', async () => {
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(async (name: string, args: unknown) => {
    if (name === 'atomar_datei_schreiben') throw new Error('Datenträger');
    return original(name, args);
  });
  expect(await importieren()).toMatchObject({ art: 'fehler', fehler: { grund: 'speichern' } });
  expect(io.dateien.has('gesetze/GG_de-bund.xml')).toBe(false);
  expect(io.abschliessen).toHaveBeenCalledWith('vorgang', 'fehlgeschlagen', empfangen);
});
it('EU-Bundle erhält Erfolg und Hinweis nach gescheiterter Titelergänzung', async () => {
  titelScheitert('eu');
  expect(await importiereGesetzesXML(xml('eu'), undefined, empfangen)).toMatchObject({
    art: 'erfolg',
    gesetz: { kurztitel: 'GG', normgeber: 'eu' },
  });
  expect(io.dateien.get('gesetze/GG_eu.xml')).toContain('Text');
  expect(schreiben()).toHaveLength(1);
  expect(meldungen).toContainEqual(
    expect.objectContaining({ anlass: 'synchronisation', art: 'hinweis' }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});
it('EU-Bundle importiert ohne unbetroffene Dateien anzufassen', async () => {
  io.dateien.set('gesetze/Fremd_de-bund.xml', 'kaputt');
  expect(await importiereGesetzesXML(xml('eu'), undefined, empfangen)).toMatchObject({
    art: 'erfolg',
  });
  expect(meldungen).toEqual([]);
  expect(io.dateien.get('gesetze/Fremd_de-bund.xml')).toBe('kaputt');
  expect(io.banner).not.toHaveBeenCalled();
});
it('Hauptfensterstandard erhält bei Titel-Folgefehler den Erfolg und einen verständlichen Hinweis', async () => {
  titelScheitert();
  expect(
    await taggeUndSpeichereGesetzesXML(
      xml(),
      'GG',
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      kontext,
    ),
  ).toMatchObject({ art: 'erfolg' });
  expect(io.banner).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining('Das Gesetz wurde gespeichert.') }),
  );
  expect(schreiben()).toHaveLength(1);
});
it('defekter Meldungsempfänger löst keine weitere Speicherung aus', async () => {
  titelScheitert();
  expect(
    await importieren(() => {
      throw new Error('Empfänger');
    }),
  ).toMatchObject({ art: 'erfolg' });
  expect(schreiben()).toHaveLength(1);
});

it('unveränderte Aktualisierung bewahrt Darstellung und meldet fertig trotz Titel-Folgefehler', async () => {
  const { parseGesetzesXML } = await import('@/lib/darstellung/darstellung.index');
  const bestehendes = parseGesetzesXML(xml())!;
  io.dateien.set('gesetze/GG_de-bund.xml', xml());
  titelScheitert();
  const phasen: string[] = [];
  const ergebnis = await taggeUndSpeichereGesetzesXML(
    xml(),
    'GG',
    (f) => phasen.push(f.phase),
    undefined,
    true,
    bestehendes,
    undefined,
    kontext,
    empfangen,
  );
  expect(ergebnis.art).toBe('erfolg');
  if (ergebnis.art !== 'erfolg') throw new Error('Erfolg erwartet');
  expect(ergebnis.kategorie).toBe('unveraendert');
  expect(ergebnis.gesetz.elemente).toBe(bestehendes.elemente);
  expect(phasen).toEqual(['vertaggen', 'speichern', 'fertig']);
  // Nur die gescheiterte Titelergänzung braucht einen Prüfbedarf, nicht der Gesetz-Refresh.
  expect(io.vormerken).toHaveBeenCalledTimes(1);
  expect(schreiben()).toHaveLength(1);
});
it('Titelschreibfehler erhält den EU-Importerfolg einschließlich neuerer Version', async () => {
  io.dateien.set('gesetze/GG_eu.xml', xml('eu', 'Alt'));
  io.dateien.set('resources/nichtamtliche-titel/eu/GG.xml', '<nichtamtlicheTitel/>');
  const original = io.invoke.getMockImplementation()!;
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (
        name === 'atomar_datei_schreiben' &&
        args.relativerPfad.startsWith('nichtamtliche-titel/')
      )
        throw new Error('Titel-Datenträger');
      return original(name, args);
    },
  );
  const ergebnis = await importiereGesetzesXML(
    xml('eu', 'Neu', '2026-02-01T00:00:00Z'),
    undefined,
    empfangen,
  );
  expect(ergebnis).toMatchObject({ art: 'erfolg', gesetz: { kurztitel: 'GG', normgeber: 'eu' } });
  expect(io.dateien.get('gesetze/GG_eu.xml')).toContain('Neu');
  expect(schreiben().filter(([, args]) => args.relativerPfad === 'gesetze/GG_eu.xml')).toHaveLength(
    1,
  );
  expect(meldungen).toContainEqual(
    expect.objectContaining({
      anlass: 'synchronisation',
      text: expect.stringContaining('Titel-Datenträger'),
    }),
  );
  expect(io.banner).not.toHaveBeenCalled();
});
it('Hauptfensterstandard nennt bei Prüfzeitpunktauffrischung keine Inhaltsänderung', async () => {
  io.dateien.set('gesetze/GG_de-bund.xml', xml());
  titelScheitert();
  expect(
    await taggeUndSpeichereGesetzesXML(
      xml(),
      'GG',
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      kontext,
    ),
  ).toMatchObject({ art: 'erfolg', kategorie: 'unveraendert' });
  expect(io.banner).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining('Der Prüfzeitpunkt des Gesetzes wurde aktualisiert.'),
    }),
  );
  expect(schreiben()).toHaveLength(1);
});
it('zielgerichteter Abbruch unmittelbar vor Schreiben bleibt erkennbar und schreibt nichts', async () => {
  const abbruch = new Error('Ziel verändert');
  const zielpruefung = {
    ziel: { dateiBasis: 'GG_de-bund', kurztitel: 'GG', quelle: 'de-bund' as const },
    vorSchreiben: async () => {
      throw abbruch;
    },
  };
  await expect(
    taggeUndSpeichereGesetzesXML(
      xml(),
      'GG',
      undefined,
      undefined,
      false,
      undefined,
      zielpruefung,
      kontext,
      empfangen,
    ),
  ).rejects.toBe(abbruch);
  expect(schreiben()).toHaveLength(0);
  expect(meldungen).toEqual([]);
});

it.each([false, true])(
  'übernimmt die gespeicherte Bestandsreferenz im echten Speicherweg (Titel-Folgefehler: %s)',
  async (folgefehler) => {
    const normgeber = 'de-bund';
    if (folgefehler) {
      io.dateien.set('resources/nichtamtliche-titel/de-bund/BGB.xml', '<nichtamtlicheTitel/>');
      const original = io.invoke.getMockImplementation()!;
      io.invoke.mockImplementation(
        async (name: string, args: { relativerPfad: string; inhalt: string }) => {
          if (
            name === 'datei_sperre_erwerben' &&
            args.relativerPfad.startsWith('nichtamtliche-titel/')
          )
            throw 'wartefrist';
          return original(name, args);
        },
      );
    }
    const basis = 'BGB_de-bund';
    const vorher = xml(normgeber).replace(
      '<kurztitel>GG</kurztitel>',
      '<kurztitel>BGB</kurztitel>',
    );
    io.dateien.set(`gesetze/${basis}.xml`, vorher);
    const eingang = vorher
      .replace('<kurztitel>BGB</kurztitel>', '<kurztitel>Bgb</kurztitel>')
      .replace('>Bund<', '>bund<')
      .replace('>Text<', '>Neuer Text<');
    const ergebnis = await taggeUndSpeichereGesetzesXML(
      eingang,
      'Bgb',
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      kontext,
      empfangen,
    );
    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    });
    if (ergebnis.art !== 'erfolg') throw new Error('Erfolg erwartet');
    expect(ergebnis.gesetz.normgeber).toBe(normgeber);
    const gespeichert = io.dateien.get(`gesetze/${basis}.xml`)!;
    expect(gespeichert).toContain('<kurztitel>BGB</kurztitel>');
    expect(gespeichert).toContain('<normgeber>de-bund</normgeber>');
    expect(schreiben()).toHaveLength(1);
    expect([...io.dateien.keys()].filter((pfad) => pfad.startsWith('gesetze/'))).toEqual([
      `gesetze/${basis}.xml`,
    ]);
    if (folgefehler)
      expect(meldungen).toContainEqual(
        expect.objectContaining({ art: 'hinweis', text: expect.stringContaining('gespeichert') }),
      );
  },
);

it('erkennt wiederholte Onlineaktualisierung trotz Bestandsreferenz und erhält echte Textänderungen', async () => {
  io.dateien.set('gesetze/GG_de-bund.xml', xml('de-bund', 'Alt'));
  const quelle = xml('de-bund', 'Neuer Text').replace(
    '<kurztitel>GG</kurztitel>',
    '<kurztitel>Gg</kurztitel>',
  );
  const aktualisieren = (inhalt: string) =>
    taggeUndSpeichereGesetzesXML(
      inhalt,
      'Gg',
      undefined,
      undefined,
      true,
      undefined,
      undefined,
      kontext,
      empfangen,
    );
  expect(await aktualisieren(quelle)).toMatchObject({ art: 'erfolg', kategorie: 'aktualisiert' });
  const gespeichert = io.dateien.get('gesetze/GG_de-bund.xml')!;
  expect(gespeichert).toContain('<kurztitel>GG</kurztitel>');
  expect(gespeichert).toContain('<normgeber>de-bund</normgeber>');
  expect(await aktualisieren(quelle)).toMatchObject({ art: 'erfolg', kategorie: 'unveraendert' });
  expect(schreiben().at(-1)![1]).toMatchObject({ nurVerarbeitungszeit: true });
  expect(await aktualisieren(quelle.replace('Neuer Text', 'neuer Text'))).toMatchObject({
    art: 'erfolg',
    kategorie: 'aktualisiert',
  });
  expect(schreiben().at(-1)![1]).not.toHaveProperty('nurVerarbeitungszeit');
});

it.each([
  ['älterem', -1000, 'erfolg'],
  ['gleichem', 0, 'fehler'],
  ['neuerem', 1000, 'fehler'],
])(
  'übernimmt die mitgelieferte EMRK bei %s Inhaltszeitpunkt der installierten Kopie: %s',
  async (_fall, abstand, art) => {
    const mitgeliefert = readFileSync('src-tauri/resources/europa/EMRK_europarat.xml', 'utf8');
    const zeit = new DOMParser()
      .parseFromString(mitgeliefert, 'application/xml')
      .querySelector('infos > letzteNeuerung')?.textContent;
    if (!zeit) throw new Error('Versionsmarke der EMRK fehlt');
    const vorher = mitgeliefert
      .replace(zeit, new Date(new Date(zeit).getTime() + Number(abstand)).toISOString())
      .replace(/<langtitel>[^<]*<\/langtitel>/, '<langtitel>Installierter Titel</langtitel>');
    const pfad = 'gesetze/EMRK_europarat.xml';
    io.dateien.set(pfad, vorher);
    expect(await importiereGesetzesXML(mitgeliefert, undefined, empfangen)).toMatchObject({ art });
    expect(io.dateien.get(pfad)).toBe(art === 'erfolg' ? mitgeliefert : vorher);
    expect(schreiben().filter(([, args]) => args.relativerPfad === pfad)).toHaveLength(
      art === 'erfolg' ? 1 : 0,
    );
  },
);
