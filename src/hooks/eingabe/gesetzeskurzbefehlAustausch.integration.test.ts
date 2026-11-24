import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// Gesetzeskurzbefehle vom echten Speicher über Datei-/ZIP-Austausch bis zum Tastenaufruf.
// Vertragstests mit realen Nutzerdatenspeichern und Dateisystemattrappe.
const dateien = new Map<string, string>();
let gesperrt = false;
const sperrstatusBeimVersand: boolean[] = [];
const emit = vi.fn(async (..._args: unknown[]) => {
  sperrstatusBeimVersand.push(gesperrt);
});
vi.mock('@tauri-apps/api/event', () => ({ emitTo: (...args: unknown[]) => emit(...args) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  holePlattform: async () => 'macos',
  nativeDateiSpeichern: async ({ defaultPath }: { defaultPath: string }) =>
    `/export/${defaultPath.split('/').pop()}`,
}));
const schreiben = vi.fn(async (pfad: string, inhalt: string) => {
  dateien.set(pfad, inhalt);
});
const lesen = vi.fn(async (pfad: string) => {
  if (!dateien.has(pfad)) throw Error('nicht lesbar');
  return dateien.get(pfad)!;
});
const geschuetztLesen = vi.fn(async (pfad: string) => dateien.get(pfad) ?? null);
const ordnerLesen = vi.fn(async (ordner: string) =>
  [...dateien.keys()]
    .filter((p) => p.startsWith(`${ordner}/`))
    .map((p) => ({ name: p.slice(ordner.length + 1) })),
);
const loeschen = vi.fn(async (pfad: string) => {
  dateien.delete(pfad);
});
async function mitTestSperre(aktion: (token: string) => Promise<unknown>) {
  gesperrt = true;
  try {
    return await aktion('token');
  } finally {
    gesperrt = false;
  }
}
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    mitTestSperre(aktion),
  mitGesetzDateiSperre: async (
    _ref: unknown,
    _ordner: string,
    _suffix: string,
    aktion: (token: string) => Promise<unknown>,
  ) => mitTestSperre(aktion),
  appDatenLesenGeschuetzt: (pfad: string) => geschuetztLesen(pfad),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  sicherstelleOrdner: async () => undefined,
  appDatenLesenOderNull: async (pfad: string) => dateien.get(pfad) ?? null,
  appDatenLesen: (pfad: string) => lesen(pfad),
  appDatenLesenOhneHinweis: (pfad: string) => lesen(pfad),
  appDatenOrdnerLesen: (ordner: string) => ordnerLesen(ordner),
  appDatenExistiert: async (pfad: string) => dateien.has(pfad),
  appDatenSchreiben: (...args: [string, string]) => schreiben(...args),
  appDatenLoeschen: (pfad: string) => loeschen(pfad),
}));
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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

import { exportiere } from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { behandleGesetzeskurzbefehl } from '@/hooks/eingabe/useTastenkuerzel.helpers';
const exportText = vi.fn();
const exportZip = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: (...args: unknown[]) => exportText(...args),
  writeFile: (...args: unknown[]) => exportZip(...args),
  readTextFile: async (pfad: string) => dateien.get(pfad) ?? exportText.mock.calls[0]![1],
  readFile: async () => (exportZip.mock.calls[0]![1] as Uint8Array).slice(),
}));
vi.mock('@/lib/import/import.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/import.index')>()),
  mitGesetzDateiImport: async (aktion: () => Promise<unknown>) => aktion(),
}));

it('lässt ausschließlich alten Bestand unangetastet und legt nur den neuen Bestand an', async () => {
  const altpfad = 'einstellungen/Kurzbefehle.xml';
  const altXML =
    '<kurzbefehle><inhalt><kurzbefehl><gesetz normgeber="de-bund">ALT</gesetz><taste primaer="true">a</taste></kurzbefehl></inhalt></kurzbefehle>';
  dateien.set(altpfad, altXML);
  expect(await k.ladeAlleGesetzeskurzbefehle()).toEqual({});
  expect(await k.leseGesetzeskurzbefehleFuerExport()).toEqual([]);
  expect(lesen).not.toHaveBeenCalledWith(altpfad);
  expect(geschuetztLesen).not.toHaveBeenCalledWith(altpfad);
  const bericht = await importierePfade([altpfad]);
  expect(bericht.berichtEintraege).toEqual([]);
  expect(bericht.konflikte).toEqual([]);
  expect(bericht.fehler).toEqual([{ grund: 'formatUnbekannt', datei: 'Kurzbefehle.xml' }]);
  await expect(k.zusammenfuehrenGesetzeskurzbefehle(altXML)).rejects.toThrow('falsche Wurzel');
  expect(await k.ladeAlleGesetzeskurzbefehle()).toEqual({});
  expect(emit).not.toHaveBeenCalled();
  await k.speichereGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }), {
    taste: 'b',
    meta: true,
    ctrl: false,
    shift: false,
    alt: false,
  });
  await k.loescheGesetzeskurzbefehl(gesetzesreferenz({ kurztitel: 'BGB' }));
  expect(dateien).toEqual(new Map([[altpfad, altXML]]));
  expect(schreiben.mock.calls.every(([pfad]) => pfad !== altpfad)).toBe(true);
  expect(loeschen.mock.calls.every(([pfad]) => pfad !== altpfad)).toBe(true);
});

it.each(['Datei', 'ZIP'])(
  'Anlegen → %s-Export → Import → Tastenaufruf nutzt den echten neuen Vertrag',
  async (art) => {
    const gesetz = {
      kurztitel: 'BGB',
      normgeber: 'de-bund',
      langtitel: 'Bürgerliches Gesetzbuch',
      hatGliederungsartikel: false,
      elemente: [],
    };
    const kurzbefehl = { taste: 'b', meta: true, ctrl: false, shift: true, alt: false };
    await k.speichereGesetzeskurzbefehl(gesetz, kurzbefehl);
    if (art === 'ZIP') await l.umschaltenLesezeichen(gesetz, '433');
    expect(
      await exportiere(
        new Set(art === 'ZIP' ? ['gesetzeskurzbefehle', 'lesezeichen'] : ['gesetzeskurzbefehle']),
        {},
      ),
    ).toBe('exportiert');
    if (art === 'ZIP') {
      const { unzipSync } = await import('fflate');
      expect(Object.keys(unzipSync(exportZip.mock.calls[0]![1] as Uint8Array))).toContain(
        'Einstellungen/gesetzeskurzbefehle.xml',
      );
    } else expect(exportText.mock.calls[0]![0]).toBe('/export/gesetzeskurzbefehle.xml');
    expect(dateien.get('einstellungen/gesetzeskurzbefehle.xml')).toContain('<gesetzeskurzbefehl>');
    dateien.clear();
    emit.mockClear();
    const importpfad = (art === 'ZIP' ? exportZip : exportText).mock.calls[0]![0] as string;
    const bericht = await importierePfade([importpfad]);
    expect(bericht.fehler).toEqual([]);
    expect(bericht.konflikte).toEqual([]);
    expect(bericht.berichtEintraege).toContainEqual({
      kategorie: 'gesetzeskurzbefehle',
      aktion: 'neu',
      name: 'Gesetzeskurzbefehle',
      quelle:
        art === 'ZIP'
          ? `${importpfad.split('/').pop()} → Einstellungen/gesetzeskurzbefehle.xml`
          : 'gesetzeskurzbefehle.xml',
    });
    expect(emit).toHaveBeenCalledWith('*', 'gesetzeskurzbefehle-geaendert');
    const geladen = await k.ladeAlleGesetzeskurzbefehle();
    expect(geladen).toEqual({ [gesetzesreferenzSchluessel(gesetz)]: kurzbefehl });
    const oeffnen = vi.fn();
    const event = {
      key: 'B',
      code: 'KeyB',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      preventDefault: vi.fn(),
    };
    behandleGesetzeskurzbefehl(
      event,
      { current: geladen },
      { current: alsSuchverzeichniseintraege([gesetz]) },
      { current: oeffnen },
    );
    expect(oeffnen).toHaveBeenCalledExactlyOnceWith(
      {
        gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
        nurInstalliert: true,
      },
      'aktiver-tab',
    );
    expect(event.preventDefault).toHaveBeenCalledOnce();
  },
);
