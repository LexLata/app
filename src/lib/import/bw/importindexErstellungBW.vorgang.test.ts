// importindexErstellungBW.vorgang.test.ts
// Kontrollierte Ladegrenzen mit echten Banner- und XML-Abgleichsoperationen.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
const { snapshot, speichern, invoke, warten, eintraege, verzogerung, erreichbarkeit } = vi.hoisted(
  () => ({
    erreichbarkeit: vi.fn(),
    snapshot: vi.fn(),
    speichern: vi.fn(),
    invoke: vi.fn(),
    warten: vi.fn(),
    eintraege: [
      {
        kurztitel: 'Neu',
        langtitel: 'Neues Gesetz',
        abrufkennung: 'https://landesrecht-bw.de/perma?d=neu',
      },
    ],
    verzogerung: vi.fn(),
  }),
);
vi.mock('@/lib/import/importindex/importindex.index', async (original) => ({
  ...(await original<object>()),
  leseImportindexAbgleichsSnapshot: snapshot,
  speichereImportindexAktualisierung: speichern,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@/lib/import/basis/basis.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pruefeErreichbarkeit: erreichbarkeit,
  berechneVerzoegerungMs: verzogerung,
  warte: warten,
}));
vi.mock('./importindexErstellungBW.parsing', () => ({
  LANDESRECHT_BW_URL: 'https://landesrecht-bw.de',
  leseUebersichtsseiteSchlechteLinks: () => eintraege.map((e) => ({ ...e })),
  leseGuterPermalink: () => 'https://landesrecht-bw.de/perma?j=neu',
}));
import { erstelleLandesrechtBWImportindexNeu } from './importindexErstellungBW';
const basisXml =
  '<importindex version="1"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>Alt</kurztitel><langtitel>Altes Gesetz</langtitel><abrufkennung>https://landesrecht-bw.de/perma?j=alt</abrufkennung></gesetz></inhalt></importindex>';
function abbrechen() {
  getSnapshot()
    .find((b) => b.aktion?.label === 'Abbrechen')!
    .aktion!.onClick();
}
beforeEach(() => {
  vi.resetAllMocks();
  alleBannerSchliessen();
  erreichbarkeit.mockResolvedValue({});
  invoke.mockResolvedValue('HTML');
  snapshot.mockResolvedValue({ xml: basisXml, bestand: basisXml });
  verzogerung.mockReturnValue(1);
  warten.mockResolvedValue(undefined);
  speichern.mockResolvedValue({ unveraendert: false });
});
describe('BW-Abbruchgrenzen', () => {
  it.each(['Bestandslesen', 'Pause', 'Permalink'])(
    'bricht nach %s ohne Speicheraufruf ab',
    async (grenze) => {
      if (grenze === 'Bestandslesen')
        snapshot.mockImplementation(async () => {
          abbrechen();
          return { xml: basisXml, bestand: basisXml };
        });
      if (grenze === 'Pause')
        warten.mockImplementation(async () => {
          abbrechen();
        });
      if (grenze === 'Permalink')
        invoke.mockImplementation(async (kommando: string) => {
          if (kommando === 'lade_landesrecht_dokumentseite') abbrechen();
          return 'HTML';
        });
      expect(await erstelleLandesrechtBWImportindexNeu()).toEqual({
        erfolg: false,
        fehler: 'Abgebrochen.',
      });
      expect(snapshot).toHaveBeenCalledTimes(1);
      expect(speichern).not.toHaveBeenCalled();
      expect(getSnapshot()).toHaveLength(0);
    },
  );
  it.each([null, 'defekter Bestand', basisXml])(
    'Abbruch vor Speicherung erhält auch den Rohbestand %s',
    async (bestand) => {
      snapshot.mockResolvedValue({ xml: basisXml, bestand });
      invoke.mockImplementation(async (kommando: string) => {
        if (kommando === 'lade_landesrecht_dokumentseite') abbrechen();
        return 'HTML';
      });
      expect((await erstelleLandesrechtBWImportindexNeu()).erfolg).toBe(false);
      expect(speichern).not.toHaveBeenCalled();
      expect(snapshot).toHaveBeenCalledTimes(1);
    },
  );
  it('verwendet genau den gelesenen Snapshot und übergibt die letzte Speichergrenze', async () => {
    speichern.mockImplementation(async (_kategorie, _xml, optionen) => {
      expect(optionen.erwarteterBestand).toBe(basisXml);
      expect(optionen.pruefeAbbruch()).toBe(false);
      optionen.beginneSpeichern();
      expect(getSnapshot().every((b) => !b.aktion)).toBe(true);
      return { unveraendert: false };
    });
    expect((await erstelleLandesrechtBWImportindexNeu()).erfolg).toBe(true);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(speichern).toHaveBeenCalledTimes(1);
  });
});

describe('BW-Erreichbarkeit', () => {
  it('prüft einmal vor allen neun Übersichtsseiten', async () => {
    expect((await erstelleLandesrechtBWImportindexNeu()).erfolg).toBe(true);
    expect(erreichbarkeit).toHaveBeenCalledTimes(1);
    const uebersichten = invoke.mock.calls.filter(
      ([cmd]) => cmd === 'lade_landesrecht_uebersichtsseite',
    );
    expect(uebersichten).toHaveLength(9);
    expect(erreichbarkeit.mock.invocationCallOrder[0]).toBeLessThan(
      invoke.mock.invocationCallOrder[0]!,
    );
  });
  it('beendet den Lauf bei fehlender Verbindung ohne Seitenabruf oder Speicherung', async () => {
    const fehler = 'Keine Verbindung zu landesrecht-bw.de möglich. Bitte später erneut versuchen.';
    erreichbarkeit.mockResolvedValue({ fehler });
    expect(await erstelleLandesrechtBWImportindexNeu()).toEqual({ erfolg: false, fehler });
    expect(erreichbarkeit).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(speichern).not.toHaveBeenCalled();
  });
  it('beendet den Lauf bei einem späteren Ladefehler ohne Speicherung', async () => {
    invoke.mockResolvedValueOnce('HTML').mockRejectedValueOnce('Seite nicht geladen');
    expect(await erstelleLandesrechtBWImportindexNeu()).toMatchObject({
      erfolg: false,
      fehler: expect.stringContaining('Seite nicht geladen'),
    });
    expect(erreichbarkeit).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(speichern).not.toHaveBeenCalled();
  });
});
