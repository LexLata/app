// importindexErstellungBW.abbruch.integration.test.ts
// BW-Abbruch über echten Indexzugriff und Speicherabschluss; nur I/O ist ersetzt.
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
const mocks = vi.hoisted(() => ({
  lesen: vi.fn(),
  schreiben: vi.fn(),
  ordner: vi.fn(),
  bundle: vi.fn(),
  invoke: vi.fn(),
  warten: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: mocks.lesen,
  appDatenSchreiben: mocks.schreiben,
  sicherstelleOrdner: mocks.ordner,
}));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: async (pfad: string) => pfad }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: mocks.bundle }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/lib/import/basis/basis.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pruefeErreichbarkeit: async () => ({}),
  berechneVerzoegerungMs: () => 1,
  warte: mocks.warten,
}));
vi.mock('./importindexErstellungBW.parsing', () => ({
  LANDESRECHT_BW_URL: 'https://landesrecht-bw.de',
  leseUebersichtsseiteSchlechteLinks: () => [
    {
      kurztitel: 'Neu',
      langtitel: 'Neues Gesetz',
      abrufkennung: 'https://landesrecht-bw.de/perma?d=neu',
    },
  ],
  leseGuterPermalink: () => 'https://landesrecht-bw.de/perma?j=neu',
}));
import { erstelleLandesrechtBWImportindexNeu } from './importindexErstellungBW';
import { istImportindexAktiv } from '@/lib/import/importindex/importindex.index';
const pfad = 'importindizes/de-bw.xml';
const standard =
  '<importindex version="1"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>Alt</kurztitel><langtitel>Altes Gesetz</langtitel><abrufkennung>https://landesrecht-bw.de/perma?j=alt</abrufkennung></gesetz></inhalt></importindex>';
const alt = standard.replace('2026-01-01', '2020-01-01');
beforeEach(() => {
  vi.resetAllMocks();
  alleBannerSchliessen();
  mocks.bundle.mockResolvedValue(standard);
  mocks.invoke.mockResolvedValue('HTML');
  mocks.warten.mockResolvedValue(undefined);
});

it.each(['Bestandslesen', 'Pause', 'Permalink'])(
  'Abbruch während %s schreibt bei fehlendem, defektem oder älterem Bestand nichts',
  async (grenze) => {
    for (const bestand of [null, 'defekter Bestand', alt]) {
      vi.clearAllMocks();
      const speicher = new Map<string, string>();
      if (bestand !== null) speicher.set(pfad, bestand);
      let erreicht!: () => void;
      let fortsetzen!: () => void;
      const angehalten = new Promise<void>((resolve) => {
        erreicht = resolve;
      });
      const weiter = new Promise<void>((resolve) => {
        fortsetzen = resolve;
      });
      const anhalten = async () => {
        erreicht();
        await weiter;
      };
      mocks.lesen.mockImplementation(async (dateipfad: string) => {
        if (grenze === 'Bestandslesen') await anhalten();
        if (!speicher.has(dateipfad)) throw new Error('Datei fehlt');
        return speicher.get(dateipfad)!;
      });
      mocks.schreiben.mockImplementation(async (dateipfad: string, xml: string) => {
        speicher.set(dateipfad, xml);
      });
      mocks.warten.mockImplementation(async () => {
        if (grenze === 'Pause') await anhalten();
      });
      mocks.invoke.mockImplementation(async (kommando: string) => {
        if (grenze === 'Permalink' && kommando === 'lade_landesrecht_dokumentseite')
          await anhalten();
        return 'HTML';
      });
      const vorher = new Map(speicher);
      const lauf = erstelleLandesrechtBWImportindexNeu();
      await angehalten;
      try {
        expect(mocks.schreiben).not.toHaveBeenCalled();
        const aktion = getSnapshot().find((banner) => banner.aktion?.label === 'Abbrechen')?.aktion;
        expect(aktion).toBeDefined();
        aktion!.onClick();
      } finally {
        fortsetzen();
      }
      expect(await lauf).toEqual({ erfolg: false, fehler: 'Abgebrochen.' });
      expect(mocks.lesen).toHaveBeenCalledWith(pfad);
      expect(mocks.bundle).toHaveBeenCalledTimes(bestand === alt ? 0 : 1);
      expect(mocks.schreiben).not.toHaveBeenCalled();
      expect(mocks.ordner).not.toHaveBeenCalled();
      expect(speicher).toEqual(vorher);
      expect(getSnapshot()).toHaveLength(0);
      expect(istImportindexAktiv('de-bw')).toBe(false);
    }
  },
);

it.each([null, 'defekt'])(
  'aktualisiert BW ohne nutzbaren Bestand (%s) aus dem neuen Bundle',
  async (bestand) => {
    const speicher = new Map<string, string>([['indizes/Index Landesrecht BW.xml', alt]]);
    if (bestand !== null) speicher.set(pfad, bestand);
    mocks.lesen.mockImplementation(async (dateipfad: string) => {
      if (!speicher.has(dateipfad)) throw new Error('Datei fehlt');
      return speicher.get(dateipfad)!;
    });
    const bundleXml = readFileSync('src-tauri/resources/importindizes/de-bw.xml', 'utf8');
    mocks.bundle.mockImplementation(async (ressource: string) => {
      if (ressource !== 'resources/importindizes/de-bw.xml')
        throw new Error('Falscher Ressourcenpfad');
      return bundleXml;
    });
    mocks.schreiben.mockImplementation(async (dateipfad: string, xml: string) => {
      speicher.set(dateipfad, xml);
    });
    expect((await erstelleLandesrechtBWImportindexNeu()).erfolg).toBe(true);
    expect(speicher.get(pfad)).toContain('<kurztitel>Neu</kurztitel>');
    expect(speicher.get('indizes/Index Landesrecht BW.xml')).toBe(alt);
    expect(mocks.bundle).toHaveBeenCalledWith('resources/importindizes/de-bw.xml');
    expect(mocks.ordner).toHaveBeenCalledWith('importindizes');
  },
);
