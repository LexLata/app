// importindexZugriff.test.ts
// Wiederherstellung und konkurrierende Installationen mit kontrollierten Wartepunkten.
import { beforeEach, describe, expect, it, vi } from 'vitest';
const speicher = new Map<string, string>();
const bundle = new Map<string, string>();
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: vi.fn(async (pfad: string) => {
    if (!speicher.has(pfad)) throw new Error('fehlt');
    return speicher.get(pfad)!;
  }),
  appDatenSchreiben: vi.fn(async (pfad: string, xml: string) => {
    speicher.set(pfad, xml);
  }),
  sicherstelleOrdner: vi.fn(async () => {}),
}));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: vi.fn(async (pfad: string) => pfad) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async (pfad: string) => {
    if (!bundle.has(pfad)) throw new Error('Bundle fehlt');
    return bundle.get(pfad)!;
  }),
}));
import { getSnapshot, alleBannerSchliessen } from '@/lib/banner/banner.index';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { appDatenLesen, appDatenSchreiben } from '@/lib/persistenz/kern/kern.index';
import { leseImportindexEintraege } from './importindexZugriff';
import {
  leseReferenzVerzeichnis,
  mitImportindexVorgang,
  leseImportindexAbgleichsSnapshot,
} from './importindex.index';
import {
  uebernehmeImportindexDatei,
  sucheImImportindex,
  importindexStatus,
} from './importindexSuche';
import { speichereImportindexAktualisierung } from './importindexErstellung.persistenz';
import { synchronisiereEineDatei, stelleStandardWieder } from './importindexVorinstallation';
import { leseImportindizesFuerExport } from './importindexExport';
import { mitImportindexSchreibabschnitt } from './importindexSchreibkoordination';
const pfad = 'importindizes/de-bund.xml';
const resource = 'resources/importindizes/de-bund.xml';
function xml(jahr: number, normgeber = 'de-bund', name = 'BGB') {
  return `<importindex version="1"><infos><verarbeitungszeit>${jahr}-01-01T00:00:00Z</verarbeitungszeit><normgeber>${normgeber}</normgeber><datenquelle/></infos><inhalt><gesetz><kurztitel>${name}</kurztitel><abrufkennung>L1</abrufkennung></gesetz></inhalt></importindex>`;
}
function tor() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  speicher.clear();
  bundle.clear();
  bundle.set(resource, xml(2025));
});
describe('geprüfter Zugriff', () => {
  it.each(['Suche', 'Referenzen'])(
    'verwendet geprüfte Dokumente beim Zugriff für %s weiter',
    async (zugriff) => {
      speicher.set(pfad, xml(2026));
      const parsen = vi.spyOn(DOMParser.prototype, 'parseFromString');
      try {
        if (zugriff === 'Suche')
          expect((await sucheImImportindex('de-bund', 'BGB'))?.kurztitel).toBe('BGB');
        else expect((await leseReferenzVerzeichnis('de-bund')).eintraege[0]?.kurztitel).toBe('BGB');
        // Anfangsbestand, Bundle und erneuter Bestand unter Schreibkoordination.
        expect(parsen).toHaveBeenCalledTimes(3);
        expect(appDatenSchreiben).not.toHaveBeenCalled();
      } finally {
        parsen.mockRestore();
      }
    },
  );
  it('wertet einen beim Bundle-Abgleich veränderten Bestand frisch aus', async () => {
    speicher.set(pfad, xml(2020));
    bundle.set(resource, xml(2025, 'de-bund', 'Neu'));
    expect(await sucheImImportindex('de-bund', 'BGB')).toBeNull();
    expect((await sucheImImportindex('de-bund', 'Neu'))?.kurztitel).toBe('Neu');
  });
  it.each(['fehlt', 'abgeschnitten', 'falsche Quelle'])(
    'repariert %s einmal und liest erneut',
    async (fall) => {
      if (fall !== 'fehlt')
        speicher.set(pfad, fall === 'abgeschnitten' ? xml(2026).slice(0, -14) : xml(2026, 'de-bw'));
      expect(await sucheImImportindex('de-bund', 'BGB')).toEqual({
        kurztitel: 'BGB',
        langtitel: '',
        abrufkennung: 'L1',
      });
      expect(appDatenSchreiben).toHaveBeenCalledTimes(1);
      expect(readTextFile).toHaveBeenCalledTimes(1);
    },
  );
  it('scheitert nach genau einem erfolglosen Reparaturversuch statt fehlenden Treffer vorzutäuschen', async () => {
    vi.mocked(appDatenLesen)
      .mockRejectedValueOnce(new Error('fehlt'))
      .mockRejectedValueOnce(new Error('fehlt'))
      .mockRejectedValueOnce(new Error('erneut unlesbar'));
    await expect(sucheImImportindex('de-bund', 'Unbekannt')).rejects.toThrow('Wiederherstellung');
    expect(readTextFile).toHaveBeenCalledTimes(1);
    expect(appDatenSchreiben).toHaveBeenCalledTimes(1);
  });
  it('bewahrt gültigen Bestand bei defektem optionalen Standard', async () => {
    speicher.set(pfad, xml(2026, 'de-bund', 'Bestand'));
    bundle.set(resource, xml(2030).slice(0, -14));
    expect(await leseImportindexEintraege('de-bund')).toEqual([
      { kurztitel: 'Bestand', langtitel: '', abrufkennung: 'L1' },
    ]);
    expect(speicher.get(pfad)).toBe(xml(2026, 'de-bund', 'Bestand'));
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });
  it('installiert einen unbrauchbaren Standard niemals', async () => {
    bundle.set(resource, xml(2030).slice(0, -14));
    await expect(leseImportindexEintraege('de-bund')).rejects.toThrow();
    await expect(stelleStandardWieder('de-bund')).rejects.toThrow();
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });
  it('Metadaten und Export installieren keinen fehlenden Standard', async () => {
    expect((await importindexStatus('de-bund')).verarbeitungszeit).toBeNull();
    expect(await leseImportindizesFuerExport()).toEqual([]);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });
  it('liefert geprüfte Abgleichsgrundlage ohne Installation, auch bei neuerem Bundle', async () => {
    expect((await leseImportindexAbgleichsSnapshot('de-bund')).xml).toBe(xml(2025));
    speicher.set(pfad, xml(2020));
    expect((await leseImportindexAbgleichsSnapshot('de-bund')).xml).toBe(xml(2020));
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });
  it.each([
    xml(2030).slice(0, -14),
    xml(2030).replace('</gesetz>', '</inhalt>'),
    xml(2030).replace('version="1"', 'version="2"'),
    xml(2030).replace('2030-01-01', 'unlesbar'),
  ])('ungültige Datei liest weder Bestand noch Standard und schreibt nichts', async (inhalt) => {
    speicher.set(pfad, xml(2026));
    await expect(uebernehmeImportindexDatei(inhalt)).rejects.toThrow();
    expect(appDatenLesen).not.toHaveBeenCalled();
    expect(readTextFile).not.toHaveBeenCalled();
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });
});
describe('konkurrierende Installationen', () => {
  it.each(['Reparatur', 'Bundle-Abgleich'])(
    'verzögerter %s überschreibt neueren Live-Abschluss nicht',
    async (art) => {
      if (art === 'Bundle-Abgleich') speicher.set(pfad, xml(2020));
      const geladen = tor(),
        weiter = tor();
      vi.mocked(readTextFile).mockImplementationOnce(async () => {
        geladen.resolve();
        await weiter.promise;
        return xml(2025);
      });
      const zugriff =
        art === 'Reparatur'
          ? leseImportindexEintraege('de-bund')
          : synchronisiereEineDatei('de-bund.xml');
      await geladen.promise;
      await speichereImportindexAktualisierung('de-bund', xml(2026));
      const live = speicher.get(pfad);
      weiter.resolve();
      await zugriff;
      expect(speicher.get(pfad)).toBe(live);
    },
  );
  it('Dateiübernahme prüft nach Warten den aktuellen Stand erneut', async () => {
    const betreten = tor(),
      weiter = tor();
    const live = mitImportindexSchreibabschnitt('de-bund', async () => {
      betreten.resolve();
      await weiter.promise;
      speicher.set(pfad, xml(2030));
    });
    await betreten.promise;
    const datei = uebernehmeImportindexDatei(xml(2028));
    weiter.resolve();
    await live;
    expect((await datei).aktion).toBe('unveraendert');
    expect(speicher.get(pfad)).toBe(xml(2030));
  });
  it('BW-Abgleich erkennt inzwischen übernommene Datei vor Backup/Schreiben', async () => {
    const bwPfad = 'importindizes/de-bw.xml';
    const basis = xml(2025, 'de-bw');
    speicher.set(bwPfad, basis);
    await uebernehmeImportindexDatei(xml(2030, 'de-bw'));
    vi.mocked(appDatenSchreiben).mockClear();
    await expect(
      speichereImportindexAktualisierung('de-bw', xml(2026, 'de-bw'), {
        erwarteterBestand: basis,
        sichereVorherigeVersion: true,
      }),
    ).rejects.toThrow('erneut');
    expect(appDatenSchreiben).not.toHaveBeenCalled();
    expect(speicher.get(bwPfad)).toBe(xml(2030, 'de-bw'));
  });
});

it('erkennt auch einen veränderten defekten Rohbestand vor Speicherbeginn', async () => {
  speicher.set(pfad, 'defekt vorher');
  const basis = await leseImportindexAbgleichsSnapshot('de-bund');
  expect(basis).toEqual({ xml: xml(2025), bestand: 'defekt vorher' });
  speicher.set(pfad, 'defekt danach');
  const beginneSpeichern = vi.fn();
  await expect(
    speichereImportindexAktualisierung('de-bund', xml(2026), {
      erwarteterBestand: basis.bestand,
      beginneSpeichern,
    }),
  ).rejects.toThrow('erneut');
  expect(beginneSpeichern).not.toHaveBeenCalled();
  expect(appDatenSchreiben).not.toHaveBeenCalled();
});

it('gibt den Schreibabschnitt nach einem tatsächlichen Schreibfehler frei', async () => {
  vi.mocked(appDatenSchreiben).mockRejectedValueOnce(new Error('Platte voll'));
  await expect(uebernehmeImportindexDatei(xml(2026))).rejects.toThrow('Platte voll');
  expect((await uebernehmeImportindexDatei(xml(2027))).aktion).toBe('neu');
  expect(speicher.get(pfad)).toBe(xml(2027));
});

it('Abbruch beim Warten auf den Schreibabschnitt verhindert Backup und Speicherbeginn', async () => {
  const betreten = tor(),
    weiter = tor();
  const halter = mitImportindexSchreibabschnitt('de-bund', async () => {
    betreten.resolve();
    await weiter.promise;
  });
  await betreten.promise;
  let abgebrochen = false;
  const beginneSpeichern = vi.fn();
  const speichern = speichereImportindexAktualisierung('de-bund', xml(2026), {
    sichereVorherigeVersion: true,
    pruefeAbbruch: () => abgebrochen,
    beginneSpeichern,
  });
  const erwartung = expect(speichern).rejects.toThrow('abgebrochen');
  abgebrochen = true;
  weiter.resolve();
  await halter;
  await erwartung;
  expect(beginneSpeichern).not.toHaveBeenCalled();
  expect(appDatenSchreiben).not.toHaveBeenCalled();
});

it('prüft Live-XML vor Backup und Schreiben, einschließlich Quellenwiderspruch', async () => {
  speicher.set(pfad, xml(2025));
  await expect(
    speichereImportindexAktualisierung('de-bund', xml(2026, 'de-bw'), {
      sichereVorherigeVersion: true,
    }),
  ).rejects.toThrow();
  expect(appDatenSchreiben).not.toHaveBeenCalled();
  expect(appDatenLesen).not.toHaveBeenCalled();
});

it('Dateiübernahme erhält BW-Zusatzattribute unverändert', async () => {
  const bw = xml(2026, 'de-bw')
    .replace('<gesetz>', '<gesetz duplikatArt="unaufgeloest" permalinkArt="schlecht">')
    .replace(
      '<kurztitel>',
      '<kurztitel bwZusatz="BW 2020" kurztitelOriginal="Alt" kurztitelDuplikat="L2">',
    );
  expect((await uebernehmeImportindexDatei(bw)).kategorie).toBe('de-bw');
  expect(speicher.get('importindizes/de-bw.xml')).toBe(bw);
});

it('gültige gleich alte Datei lässt Zeit und Herkunft unangetastet', async () => {
  const bestand = xml(2026).replace(
    '<verarbeitungszeit>',
    '<verarbeitungszeit herkunft="standard">',
  );
  speicher.set(pfad, bestand);
  expect((await uebernehmeImportindexDatei(xml(2026))).aktion).toBe('unveraendert');
  expect(speicher.get(pfad)).toBe(bestand);
  expect(appDatenSchreiben).not.toHaveBeenCalled();
});

it.each(['de-bund', 'de-bw'] as const)(
  'liefert %s-Referenzfehler als Diagnose statt Ausnahme',
  async (normgeber) => {
    bundle.clear();
    const ergebnis = await leseReferenzVerzeichnis(normgeber);
    expect(ergebnis.eintraege).toEqual([]);
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0]?.quelle).toBe(normgeber);
    expect(ergebnis.fehler[0]?.meldung).toContain('Wiederherstellung');
  },
);

it('ein erfolgreich reparierter Referenzindex liefert Einträge ohne Fehlerdiagnose', async () => {
  bundle.set(resource, xml(2026));
  const ergebnis = await leseReferenzVerzeichnis('de-bund');
  expect(ergebnis.eintraege).toEqual([{ kurztitel: 'BGB', langtitel: '', abrufkennung: 'L1' }]);
  expect(ergebnis.fehler).toEqual([]);
});

it('vollendet gestartetes Schreiben; verstecktes Speicherbanner bleibt ohne Abbrechen', async () => {
  alleBannerSchliessen();
  const schreibenBegonnen = tor();
  const schreibenWeiter = tor();
  vi.mocked(appDatenSchreiben).mockImplementationOnce(async (pfad, inhalt) => {
    schreibenBegonnen.resolve();
    await schreibenWeiter.promise;
    speicher.set(pfad, inhalt);
  });
  const vorgang = mitImportindexVorgang('de-bund', 'Start', async (banner) => {
    await speichereImportindexAktualisierung('de-bund', xml(2026), {
      pruefeAbbruch: () => banner.pruefeAbbruch(),
      beginneSpeichern: () => banner.beginneSpeichern('Speichern'),
    });
    banner.abschliessen('Fertig');
    return { erfolg: true, anzahl: 1 };
  });
  await schreibenBegonnen.promise;
  expect(getSnapshot()[0]?.aktion).toBeUndefined();
  alleBannerSchliessen();
  await mitImportindexVorgang('de-bund', 'Erneut', async () => {
    throw new Error('Darf nicht starten');
  });
  expect(getSnapshot().find((banner) => banner.text === 'Speichern')?.aktion).toBeUndefined();
  expect(getSnapshot().some((banner) => banner.text === 'Speichern')).toBe(true);
  schreibenWeiter.resolve();
  expect((await vorgang).erfolg).toBe(true);
  expect(speicher.get(pfad)).toContain('BGB');
  expect(getSnapshot().find((banner) => banner.text === 'Fertig')?.aktion).toBeUndefined();
});

it('exportiert Bund/BW unter neuen Namen und übernimmt beide Dateien erneut', async () => {
  const dateien = [
    { name: 'de-bund.xml', inhalt: xml(2026) },
    { name: 'de-bw.xml', inhalt: xml(2026, 'de-bw') },
  ];
  for (const datei of dateien) speicher.set(`importindizes/${datei.name}`, datei.inhalt);
  expect(await leseImportindizesFuerExport()).toEqual(dateien);
  speicher.clear();
  for (const datei of dateien) {
    expect((await uebernehmeImportindexDatei(datei.inhalt)).aktion).toBe('neu');
    expect(speicher.get(`importindizes/${datei.name}`)).toBe(datei.inhalt);
  }
});

it('speichert und exportiert den EU-Index unter eu.xml ohne BW zu überschreiben', async () => {
  speicher.set('importindizes/de-bw.xml', xml(2025, 'de-bw'));
  await speichereImportindexAktualisierung('eu', xml(2026, 'eu'));
  expect(speicher.get('importindizes/eu.xml')).toContain('eu');
  expect(speicher.get('importindizes/de-bw.xml')).toContain('de-bw');
  expect(await leseImportindizesFuerExport()).toContainEqual({
    name: 'eu.xml',
    inhalt: speicher.get('importindizes/eu.xml'),
  });
});
