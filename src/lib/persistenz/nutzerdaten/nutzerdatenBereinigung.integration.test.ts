// Prüft die Bestandsbereinigung über öffentliche Speicher mit echten Parsern und nativen Dateigrenzen.
import { beforeEach, expect, it, vi } from 'vitest';
import {
  ladeAlleGesetzeskurzbefehle,
  bereinigeGesetzeskurzbefehleBeimStart,
  pruefeGesetzeskurzbefehleImport,
} from './gesetzeskurzbefehlSpeicher';
import { ladeLesezeichen } from './lesezeichenSpeicher';
import { ladeFavoriten } from './favoritenSpeicher';
import { bereinigeGesetzeskurzbefehleNachAbgleich } from '@/lib/gesetz-laden/gesetz-laden.index';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { sicherungenImDatenordnerSatz } from '@/lib/domain/app/meldungsgruppen';
import { holePlattform } from '@/lib/plattform/tauriHelpers';

const m = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: m.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: m.emit }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (pfad: string) => {
    const xml = m.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (xml === undefined) throw new Error('fehlt');
    return xml;
  }),
  exists: vi.fn(async (pfad: string) => m.dateien.has(pfad.replace('/daten/LexLata/', ''))),
  mkdir: vi.fn(),
  readDir: async (ordner: string) =>
    [...m.dateien.keys()]
      .filter((pfad) => pfad.startsWith(ordner.replace('/daten/LexLata/', '') + '/'))
      .map((pfad) => ({ name: pfad.split('/').at(-1), isDirectory: false })),
}));
const pfad = 'einstellungen/gesetzeskurzbefehle.xml';
const gesetz = { normgeber: 'de-bund', kurztitel: 'BGB' };
const kurzbefehl = (normgeber: string, kurztitel: string, taste: string) =>
  `<gesetzeskurzbefehl><gesetz normgeber="${normgeber}">${kurztitel}</gesetz><taste primaer="true">${taste}</taste></gesetzeskurzbefehl>`;
const datei = (inhalt: string) =>
  `<gesetzeskurzbefehle><inhalt>${inhalt}</inhalt></gesetzeskurzbefehle>`;
beforeEach(async () => {
  vi.clearAllMocks();
  alleBannerSchliessen();
  await holePlattform();
  m.dateien.clear();
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'datei_sperre_erwerben') return args.relativerPfad;
    if (befehl === 'datei_sperre_freigeben') return;
    if (befehl === 'atomar_datei_schreiben') {
      m.dateien.set(args.relativerPfad, args.inhalt);
      return;
    }
    if (befehl === 'archiviere_beschaedigte_datei') {
      if (m.dateien.get(args.relativerPfad) !== args.erwarteterInhalt)
        return { status: 'veraendert', sicherungspfad: null };
      m.dateien.set(args.relativerPfad + '.bak', args.erwarteterInhalt);
      m.dateien.delete(args.relativerPfad);
      return { status: 'archiviert', sicherungspfad: args.relativerPfad + '.bak' };
    }
    throw new Error(`Unerwarteter Befehl ${befehl}`);
  });
});
it('bewahrt gültige Gesetzeskurzbefehle nach Vollsicherung und bereinigt nur einmal', async () => {
  const original = datei(
    kurzbefehl(
      'Bund' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
      'GG',
      'g',
    ) + kurzbefehl('de-bund', 'BGB', 'b'),
  );
  m.dateien.set(pfad, original);
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual(['["de-bund","bgb"]']);
  expect(m.dateien.get(pfad + '.bak')).toBe(original);
  expect(m.dateien.get(pfad)).not.toContain(
    'normgeber="Bund"' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
  );
  await ladeAlleGesetzeskurzbefehle();
  expect(
    m.invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
  expect(m.emit).toHaveBeenCalledWith('*', 'gesetzeskurzbefehle-geaendert');
  // Die Sicherung der Bereinigung trägt Schaltfläche und Ortssatz genau einmal.
  const banner = getSnapshot().find((b) => b.art === 'dateibefunde');
  expect(banner?.aktion?.label).toBe('Datenordner öffnen');
  expect(banner?.text.split(sicherungenImDatenordnerSatz(1))).toHaveLength(2);
  expect(JSON.stringify(getSnapshot())).not.toContain(pfad + '.bak');
});
it('entfernt beim Start nur nachweislich fehlende Gesetze und erhält nicht zuverlässig prüfbare', async () => {
  m.dateien.set(
    pfad,
    datei(
      kurzbefehl('de-bund', 'GG', 'g') +
        kurzbefehl('at-bund', 'ABGB', 'a') +
        kurzbefehl('de-bund', 'BGB', 'b'),
    ),
  );
  await bereinigeGesetzeskurzbefehleBeimStart((referenz) => referenz.kurztitel === 'GG');
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual([
    '["at-bund","abgb"]',
    '["de-bund","bgb"]',
  ]);
});
it('diagnostiziert importierte ungültige Kurzbefehle ohne Schreiben oder Archivierung', async () => {
  await expect(
    pruefeGesetzeskurzbefehleImport(
      datei(
        kurzbefehl(
          'Bund' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
          'BGB',
          'b',
        ),
      ),
      vi.fn(() => {}),
    ),
  ).rejects.toThrow('Normgeber');
  expect(m.invoke).not.toHaveBeenCalled();
});
it.each(['fehler', 'gesichert_aber_nicht_entfernt'])(
  'überschreibt bei Sicherungsergebnis %s das Original nicht',
  async (status) => {
    const original = datei(
      kurzbefehl(
        'Bund' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
        'GG',
        'g',
      ) + kurzbefehl('de-bund', 'BGB', 'b'),
    );
    m.dateien.set(pfad, original);
    const vorher = m.invoke.getMockImplementation();
    if (!vorher) throw new Error('Native Dateigrenze fehlt.');
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        if (status === 'fehler') throw new Error('voll');
        return { status, sicherungspfad: 'original.bak' };
      }
      return vorher(befehl, args);
    });
    await expect(ladeAlleGesetzeskurzbefehle()).rejects.toThrow();
    expect(m.dateien.get(pfad)).toBe(original);
    expect(m.invoke.mock.calls.some(([befehl]) => befehl === 'atomar_datei_schreiben')).toBe(false);
  },
);
it('übernimmt bei Veränderung während der Sicherung ausschließlich die frische Fassung', async () => {
  m.dateien.set(
    pfad,
    datei(
      kurzbefehl(
        'Bund' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
        'GG',
        'g',
      ) + kurzbefehl('de-bund', 'BGB', 'b'),
    ),
  );
  const frisch = datei(
    kurzbefehl(
      'Bund' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
      'GG',
      'g',
    ) + kurzbefehl('de-bund', 'ZPO', 'z'),
  );
  const vorher = m.invoke.getMockImplementation();
  if (!vorher) throw new Error('Native Dateigrenze fehlt.');
  let einmal = true;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'archiviere_beschaedigte_datei' && einmal) {
      einmal = false;
      m.dateien.set(pfad, frisch);
      return { status: 'veraendert', sicherungspfad: null };
    }
    return vorher(befehl, args);
  });
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual(['["de-bund","zpo"]']);
  expect(m.dateien.get(pfad + '.bak')).toBe(frisch);
  expect(getSnapshot().at(-1)?.text).toContain(
    'GG (Bund)' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
  );
});
it('meldet Schreibfehler nach Sicherung mit erreichbarem Original und ohne Erfolgsmeldung', async () => {
  const original = datei(
    kurzbefehl(
      'Bund' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
      'GG',
      'g',
    ) + kurzbefehl('de-bund', 'BGB', 'b'),
  );
  m.dateien.set(pfad, original);
  const vorher = m.invoke.getMockImplementation();
  if (!vorher) throw new Error('Native Dateigrenze fehlt.');
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'atomar_datei_schreiben') throw new Error('Schreibfehler');
    return vorher(befehl, args);
  });
  await expect(ladeAlleGesetzeskurzbefehle()).rejects.toThrow();
  expect(m.dateien.get(pfad + '.bak')).toBe(original);
  expect(m.emit).toHaveBeenCalledWith('*', 'gesetzeskurzbefehle-geaendert');
  const fehlerbanner = getSnapshot().find((banner) => banner.typ === 'fehler');
  expect(
    fehlerbanner?.gliederung?.kategorien.flatMap((k) => k.gruppen.map((g) => g.schluessel)),
  ).toContain('nichtBereinigt');
  expect(fehlerbanner?.text.split(sicherungenImDatenordnerSatz(1))).toHaveLength(2);
  expect(JSON.stringify(getSnapshot())).not.toContain(pfad + '.bak');
});
it('erhält gültige Lesezeichen neben fehlenden und ungültigen Normgebern nach Vollsicherung', async () => {
  const original =
    '<lesezeichen><inhalt><eintrag><gesetz normgeber="Bund">GG</gesetz><bezeichnung>1</bezeichnung></eintrag><eintrag><gesetz>BGB</gesetz><bezeichnung>2</bezeichnung></eintrag><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>433</bezeichnung></eintrag></inhalt></lesezeichen>'; // normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung.
  m.dateien.set('lesezeichen/lesezeichen.xml', original);
  expect(await ladeLesezeichen()).toEqual([{ gesetz, bezeichnung: '433' }]);
  expect(m.dateien.get('lesezeichen/lesezeichen.xml.bak')).toBe(original);
  await ladeLesezeichen();
  expect(
    m.invoke.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(1);
});
it.each([
  '',
  ' normgeber="Bund"' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
  ' normgeber="de-bw"',
])('archiviert Favoriten mit unbrauchbarer Gesetzeszuordnung %s', async (attribut) => {
  const original = `<favoriten><infos><gesetz${attribut}>BGB</gesetz></infos><inhalt><eintrag><bezeichnung>433</bezeichnung></eintrag></inhalt></favoriten>`;
  const pfad = 'favoriten/BGB_de-bund-favoriten.xml';
  m.dateien.set(pfad, original);
  expect(await ladeFavoriten(gesetz)).toEqual([]);
  expect(m.dateien.get(pfad + '.bak')).toBe(original);
  expect(m.dateien.has(pfad)).toBe(false);
});

it('erhält die Leertaste als gültigen Gesetzeskurzbefehl ohne Sicherung', async () => {
  const original = datei(kurzbefehl('de-bund', 'BGB', ' '));
  m.dateien.set(pfad, original);
  expect(Object.values(await ladeAlleGesetzeskurzbefehle())[0]?.taste).toBe(' ');
  expect(m.dateien.get(pfad)).toBe(original);
  expect(m.invoke).not.toHaveBeenCalled();
});

it('behält bei einem unlesbaren Gesetzordner Zuordnungen und bereinigt nach Erholung verlässlich fehlende Gesetze', async () => {
  const original = datei(
    kurzbefehl(
      'Bund' /* normgeber-negativ: Alter Normgeberwert zur Sicherungsprüfung. */,
      'GG',
      'g',
    ) +
      kurzbefehl('de-bund', 'BGB', 'b') +
      kurzbefehl('de-bund', 'ZPO', 'z'),
  );
  m.dateien.set(pfad, original);
  await bereinigeGesetzeskurzbefehleNachAbgleich();
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual([
    '["de-bund","bgb"]',
    '["de-bund","zpo"]',
  ]);
  expect(m.dateien.get(pfad + '.bak')).toBe(original);
  m.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  const vorher = m.invoke.getMockImplementation();
  m.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen')
      return [{ name: 'BGB_de-bund.xml', dateistempel: { groesse: '1', aenderungszeit: '1' } }];
    return vorher?.(name, args);
  });
  await bereinigeGesetzeskurzbefehleNachAbgleich();
  expect(Object.keys(await ladeAlleGesetzeskurzbefehle())).toEqual(['["de-bund","bgb"]']);
  expect(
    getSnapshot()
      .map((banner) => banner.text)
      .join(' '),
  ).toContain('ZPO (de-bund)');
});
