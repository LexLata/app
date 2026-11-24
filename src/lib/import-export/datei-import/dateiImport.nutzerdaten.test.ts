// Vertragstests mit realen Nutzerdatenspeichern und Dateisystemattrappe.
import {
  dateien,
  sperrstatusBeimVersand,
  emit,
  schreiben,
  lesen,
  geschuetztLesen,
  ordnerLesen,
  loeschen,
} from '@/test/import/nutzerdatenDateiimportAttrappe';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as f from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import * as l from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import * as k from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
beforeEach(() => {
  dateien.clear();
  sperrstatusBeimVersand.length = 0;
  vi.clearAllMocks();
  k.setzeReservierteTastenkuerzel([]);
});
afterEach(() => {
  expect(sperrstatusBeimVersand.every((status) => !status)).toBe(true);
});
describe('vollständige Nutzerdatenoperationen', () => {
  it('führt XML zusammen und meldet einmal nach Sperrfreigabe, No-op bleibt stumm', async () => {
    await f.zusammenfuehrenFavoriten(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>2</bezeichnung></eintrag><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>',
    );
    expect(await f.ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['1', '2']);
    expect(emit).toHaveBeenCalledExactlyOnceWith('*', 'favoriten-geaendert');
    await f.zusammenfuehrenFavoriten(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>2</bezeichnung></eintrag></inhalt></favoriten>',
    );
    expect(emit).toHaveBeenCalledTimes(1);
    await l.zusammenfuehrenLesezeichen(
      '<lesezeichen><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>',
    );
    expect(emit).toHaveBeenLastCalledWith('*', 'lesezeichen-geaendert');
  });
  it('exportiert rohe Inhalte und Namen ohne Schreibnebenwirkungen', async () => {
    dateien.set('favoriten/BGB_de-bund-favoriten.xml', 'kaputt');
    dateien.set('lesezeichen/lesezeichen.xml', 'roh');
    dateien.set('einstellungen/gesetzeskurzbefehle.xml', 'kurz');
    expect(await f.leseFavoritenFuerExport()).toEqual([
      { name: 'BGB_de-bund-favoriten.xml', inhalt: 'kaputt' },
    ]);
    expect(await l.leseLesezeichenFuerExport()).toEqual([
      { name: 'lesezeichen.xml', inhalt: 'roh' },
    ]);
    expect(await k.leseGesetzeskurzbefehleFuerExport()).toEqual([
      { name: 'gesetzeskurzbefehle.xml', inhalt: 'kurz' },
    ]);
    expect(schreiben).not.toHaveBeenCalled();
    expect(loeschen).not.toHaveBeenCalled();
    expect(geschuetztLesen).not.toHaveBeenCalled();
  });
  it('meldet alle ausgeführten Schreib- und Löschwege', async () => {
    await f.umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    await f.umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    await f.ersetzeFavoritenDatei(gesetzesreferenz({ kurztitel: 'BGB' }), 'roh');
    await l.umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    await l.umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    await l.ersetzeLesezeichenDatei('roh');
    await l.loescheAlleLesezeichen();
    await k.speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), {
      taste: 'e',
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
    });
    await k.loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }));
    await k.ersetzeGesetzeskurzbefehleDatei('roh');
    expect(emit).toHaveBeenCalledTimes(10);
  });
  it('meldet nicht nach Dateifehler', async () => {
    schreiben.mockRejectedValueOnce(Error('Dateifehler'));
    await expect(f.umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1')).rejects.toThrow(
      'Dateifehler',
    );
    expect(emit).not.toHaveBeenCalled();
  });
});

vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  speichereGesetz: vi.fn(),
  leseNichtamtlicheTitelRohtext: vi.fn(),
  ersetzeNichtamtlicheTitelDatei: vi.fn(),
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  zusammenfuehrenMarkierungen: vi.fn(),
  leseMarkierungenRohtext: vi.fn(),
  ersetzeMarkierungenDatei: vi.fn(),
}));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  baueEinstellungenXML: vi.fn(),
  einstellungenOhneVerarbeitungszeit: vi.fn(),
  keineEinstellungExplizitGesetzt: vi.fn(),
  wendeEinstellungenXMLAn: vi.fn(),
}));
import { verarbeiteEinfacheDatei } from '@/lib/import-export/datei-import/dateiImport.einfach';
import { loeseImportKonflikt } from '@/lib/import-export/datei-import/dateiImport.aktionen';
it('beide Datei-Importpfade melden mit realem Speicher genau einmal', async () => {
  const xml =
    '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>433</bezeichnung></eintrag></inhalt></favoriten>';
  await expect(verarbeiteEinfacheDatei('favoriten-xml', xml)).resolves.toMatchObject({
    art: 'neu',
  });
  expect(await f.ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['433']);
  expect(emit).toHaveBeenCalledExactlyOnceWith('*', 'favoriten-geaendert');
  emit.mockClear();
  await loeseImportKonflikt(
    {
      art: 'favoriten',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      kurztitel: 'BGB',
      anzeigename: 'BGB Favoriten',
      importInhalt: xml,
    },
    'ersetzen',
  );
  expect(emit).toHaveBeenCalledExactlyOnceWith('*', 'favoriten-geaendert');
});
it('Export lässt fehlende Dateien, unlesbare Einzeldateien und Ordner aus', async () => {
  expect(await f.leseFavoritenFuerExport()).toEqual([]);
  expect(await l.leseLesezeichenFuerExport()).toEqual([]);
  expect(await k.leseGesetzeskurzbefehleFuerExport()).toEqual([]);
  dateien.set('favoriten/BGB_de-bund-favoriten.xml', 'roh');
  dateien.set('favoriten/ZPO_de-bund-favoriten.xml', 'zpo');
  lesen.mockRejectedValueOnce(Error('unlesbar'));
  expect(await f.leseFavoritenFuerExport()).toEqual([
    { name: 'ZPO_de-bund-favoriten.xml', inhalt: 'zpo' },
  ]);
  ordnerLesen.mockRejectedValueOnce(Error('Ordner'));
  expect(await f.leseFavoritenFuerExport()).toEqual([]);
  expect(schreiben).not.toHaveBeenCalled();
  expect(loeschen).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});
it('Kurzbefehls-No-ops reserviert, doppelt und leerer Merge melden nicht', async () => {
  const kurzbefehl = { taste: 'e', meta: true, ctrl: false, shift: false, alt: false };
  k.setzeReservierteTastenkuerzel([kurzbefehl]);
  expect(
    await k.speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), kurzbefehl),
  ).toBe('reserviert');
  k.setzeReservierteTastenkuerzel([]);
  await k.speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), kurzbefehl);
  emit.mockClear();
  expect(
    await k.speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'ZPO' }), kurzbefehl),
  ).toBe('doppelt');
  await k.zusammenfuehrenGesetzeskurzbefehle('<gesetzeskurzbefehle/>');
  await k.loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'unbekannt' }));
  await l.hinzufuegenLesezeichen([]);
  expect(emit).not.toHaveBeenCalled();
});

it('Gesetzeskurzbefehle übernehmen XML ohne Reservierungsprüfung und melden genau einmal', async () => {
  const kurzbefehl = { taste: 'e', meta: true, ctrl: false, shift: false, alt: false };
  k.setzeReservierteTastenkuerzel([kurzbefehl]);
  const xml =
    '<gesetzeskurzbefehle><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste primaer="true">e</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>';
  await k.zusammenfuehrenGesetzeskurzbefehle(xml);
  expect(await k.ladeAlleGesetzeskurzbefehle()).toEqual({
    [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]: kurzbefehl,
  });
  expect(emit).toHaveBeenCalledExactlyOnceWith('*', 'gesetzeskurzbefehle-geaendert');
  await k.zusammenfuehrenGesetzeskurzbefehle(xml);
  expect(emit).toHaveBeenCalledTimes(1);
});
it('Lesezeichen-Merge behält bisherige Duplikatregeln und Sortierung', async () => {
  const xml =
    '<lesezeichen><inhalt><eintrag><gesetz normgeber="de-bund">ZPO</gesetz><bezeichnung>2</bezeichnung></eintrag><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>';
  await l.zusammenfuehrenLesezeichen(xml);
  expect(await l.ladeLesezeichen()).toEqual([
    { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '1' },
    { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '1' },
    { gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }), bezeichnung: '2' },
  ]);
  expect(emit).toHaveBeenCalledExactlyOnceWith('*', 'lesezeichen-geaendert');
  await l.zusammenfuehrenLesezeichen(xml);
  expect(emit).toHaveBeenCalledTimes(1);
});
it('Meldungsfehler bleiben in beiden Importberichten erfolgreiche Übernahmen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const xml =
    '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>';
  emit.mockRejectedValueOnce(Error('Ereignis'));
  await expect(verarbeiteEinfacheDatei('favoriten-xml', xml)).resolves.toMatchObject({
    art: 'neu',
  });
  emit.mockRejectedValueOnce(Error('Ereignis'));
  await expect(
    loeseImportKonflikt(
      {
        art: 'favoriten',
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        kurztitel: 'BGB',
        anzeigename: 'BGB Favoriten',
        importInhalt: xml,
      },
      'ersetzen',
    ),
  ).resolves.toMatchObject({ aktion: 'ersetzt' });
});

it.each([
  ['Favorit umschalten', () => f.umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1')],
  [
    'Favoriten hinzufügen',
    () => f.hinzufuegenFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }), ['1']),
  ],
  [
    'Favoriten zusammenführen',
    () =>
      f.zusammenfuehrenFavoriten(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>',
      ),
  ],
  [
    'Favoriten ersetzen',
    () => f.ersetzeFavoritenDatei(gesetzesreferenz({ kurztitel: 'BGB' }), 'roh'),
  ],
  [
    'Lesezeichen umschalten',
    () => l.umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '1'),
  ],
  [
    'Lesezeichen hinzufügen',
    () =>
      l.hinzufuegenLesezeichen([
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '1' },
      ]),
  ],
  [
    'Lesezeichen zusammenführen',
    () =>
      l.zusammenfuehrenLesezeichen(
        '<lesezeichen><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>',
      ),
  ],
  ['Lesezeichen ersetzen', () => l.ersetzeLesezeichenDatei('roh')],
  [
    'Gesetzeskurzbefehle speichern',
    () =>
      k.speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), {
        taste: 'e',
        meta: true,
        ctrl: false,
        shift: false,
        alt: false,
      }),
  ],
  [
    'Gesetzeskurzbefehle zusammenführen',
    () =>
      k.zusammenfuehrenGesetzeskurzbefehle(
        '<gesetzeskurzbefehle><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste primaer="true">e</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>',
      ),
  ],
  ['Gesetzeskurzbefehle ersetzen', () => k.ersetzeGesetzeskurzbefehleDatei('roh')],
] as const)('%s meldet nach Schreibfehler keine Änderung', async (_name, aktion) => {
  schreiben.mockRejectedValueOnce(Error('Dateifehler'));
  await expect(aktion()).rejects.toThrow('Dateifehler');
  expect(emit).not.toHaveBeenCalled();
});
it.each([
  [
    'Favorit löschen',
    async () => {
      await f.umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
      return () => f.umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    },
  ],
  [
    'Lesezeichen löschen',
    async () => {
      await l.umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
      return () => l.umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    },
  ],
  ['alle Lesezeichen löschen', async () => () => l.loescheAlleLesezeichen()],
  [
    'Kurzbefehl löschen',
    async () => {
      await k.speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), {
        taste: 'e',
        meta: true,
        ctrl: false,
        shift: false,
        alt: false,
      });
      return () => k.loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }));
    },
  ],
] as const)('%s meldet nach Löschfehler keine Änderung', async (_name, vorbereiten) => {
  const aktion = await vorbereiten();
  emit.mockClear();
  loeschen.mockRejectedValueOnce(Error('Löschfehler'));
  await expect(aktion()).rejects.toThrow('Löschfehler');
  expect(emit).not.toHaveBeenCalled();
});

it.each([
  ['lesezeichen/lesezeichen.xml', () => l.leseLesezeichenFuerExport()],
  ['einstellungen/gesetzeskurzbefehle.xml', () => k.leseGesetzeskurzbefehleFuerExport()],
] as const)('Export lässt unlesbare Datei %s ohne Archivierung aus', async (pfad, exportieren) => {
  dateien.set(pfad, 'beschädigt');
  lesen.mockRejectedValueOnce(Error('unlesbar'));
  expect(await exportieren()).toEqual([]);
  expect(geschuetztLesen).not.toHaveBeenCalled();
  expect(schreiben).not.toHaveBeenCalled();
  expect(loeschen).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});

it('ordnet Favoriten aus direkten infos/gesetz zu, unabhängig von Attributen und Kommentaren', async () => {
  const xml = `<favoriten version='1' extra='x'>
    <neu><infos><gesetz normgeber="de-bund">FALSCH</gesetz></infos></neu>
    <!-- <infos><gesetz normgeber="de-bund">KOMMENTAR</gesetz></infos> -->
    <infos extra='x'><neu><gesetz normgeber="de-bund">FALSCH</gesetz></neu><gesetz extra='x' normgeber='de-bund'>BGB</gesetz></infos>
    <inhalt><eintrag><bezeichnung extra='x'>433</bezeichnung></eintrag><neu><eintrag><bezeichnung>9</bezeichnung></eintrag></neu></inhalt>
  </favoriten>`;
  await expect(verarbeiteEinfacheDatei('favoriten-xml', xml)).resolves.toMatchObject({
    art: 'neu',
    name: 'BGB',
  });
  expect(await f.ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['433']);
  expect(dateien.has('favoriten/FALSCH-favoriten.xml')).toBe(false);
});

// Phase 4: Meldungen bleiben am Importergebnis, auch bei bestätigter Speicherung.
it('sammelt Broadcastfehler im Ergebnis statt im Banner', async () => {
  const { zeigeBanner } = await import('@/lib/banner/banner.index');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  emit.mockRejectedValueOnce(Error('Ereignis'));
  const ergebnis = await verarbeiteEinfacheDatei(
    'lesezeichen-xml',
    '<lesezeichen><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>',
  );
  expect(ergebnis).toMatchObject({
    art: 'neu',
    meldungen: [
      expect.objectContaining({ anlass: 'synchronisation', aenderungsstand: 'vollstaendig' }),
    ],
  });
  expect(dateien.get('lesezeichen/lesezeichen.xml')).toContain('BGB');
  expect(zeigeBanner).not.toHaveBeenCalled();
});
it('diagnostiziert unveränderte Eingänge ohne Normgeber ohne Schreiben und Banner', async () => {
  const { zeigeBanner } = await import('@/lib/banner/banner.index');
  const xml =
    '<lesezeichen><inhalt><eintrag><gesetz>BGB</gesetz><bezeichnung>9</bezeichnung></eintrag><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>';
  dateien.set('lesezeichen/lesezeichen.xml', xml);
  expect(await verarbeiteEinfacheDatei('lesezeichen-xml', xml)).toMatchObject({
    art: 'unveraendert',
    meldungen: [expect.objectContaining({ text: expect.stringContaining('ohne Normgeber') })],
  });
  expect(schreiben).not.toHaveBeenCalled();
  expect(zeigeBanner).not.toHaveBeenCalled();
});
