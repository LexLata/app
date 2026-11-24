// gesetzSpeicher.test.ts
//
// Unit-Tests für gesetzSpeicher.ts (reines CRUD: speichereGesetz, ladeAlleGesetze,
// ladeGesetzesXML und loescheGesetz)
// sowie den fensterübergreifenden 'gesetze-geaendert'-Broadcast, der beim
// Modul-Import an gesetzSpeicherEreignisse.beiSpeicherBatchAbgeschlossen
// angemeldet wird.
//
// Gemockt: appDatenZugriff (In-Memory), gesetzSpeicherEreignisse
// (nachSpeichernPruefen als einfacher Passthrough - die eigentliche
// Zähler-/Debounce-Logik ist bereits in gesetzSpeicherEreignisse.test.ts
// abgedeckt; beiSpeicherBatchAbgeschlossen zum Abfangen des Broadcast-
// Subscribers), '@tauri-apps/api/event' (emitTo), nichtamtlicheTitelSpeicher
// (eigene, hier nicht zu testende Zuständigkeit).
// Real bleibt: parseGesetzesXML (bereits umfassend in gesetzesXMLParser.*.test.ts
// getestet) - einfacher als Mock, liefert realistischere Fixtures.

import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Gesetzesreferenz, GesetzDarstellung } from '@/lib/domain/gesetzTypes';

vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mitDateiSperre: (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('gesetz-token'),
  sicherstelleOrdner: (ordner: string) => sicherstelleOrdner(ordner),
  appDatenExistiert: vi.fn((pfad: string) =>
    Promise.resolve(
      appDatenSpeicher.has(pfad) ||
        [...appDatenSpeicher.keys()].some((k) => k.startsWith(`${pfad}/`)),
    ),
  ),
  sichereBeiUngueltigemInhalt: (...args: unknown[]) => sichereBeiUngueltigemInhalt(...args),
  appDatenLesen: vi.fn((pfad: string) => {
    const inhalt = appDatenSpeicher.get(pfad);
    if (inhalt === undefined) return Promise.reject(new Error('Datei nicht gefunden'));
    return Promise.resolve(inhalt);
  }),
  appDatenVerarbeitungszeitAuffrischen: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenLoeschen: vi.fn((pfad: string) => {
    if (!appDatenSpeicher.has(pfad)) return Promise.reject(new Error('nicht gefunden'));
    appDatenSpeicher.delete(pfad);
    return Promise.resolve();
  }),
  appDatenOrdnerLesen: vi.fn((ordner: string) => {
    const praefix = `${ordner}/`;
    const namen = [...appDatenSpeicher.keys()]
      .filter((k) => k.startsWith(praefix))
      .map((k) => ({ name: k.slice(praefix.length) }));
    if (namen.length === 0) return Promise.reject(new Error('Ordner existiert nicht'));
    return Promise.resolve(namen);
  }),
}));
const empfaenger = { vormerken: async () => 'gesetz-vorgang', abschliessen: async () => {} };

const appDatenSpeicher = new Map<string, string>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string) =>
    befehl === 'gesetz_dateistempel_lesen'
      ? gesetzDateistempelAttrappe(appDatenSpeicher)
      : undefined,
}));

const sicherstelleOrdner = vi.fn((_ordner: string) => Promise.resolve());

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sichereBeiUngueltigemInhalt: (...args: unknown[]) => sichereBeiUngueltigemInhalt(...args),
}));

const sichereBeiUngueltigemInhalt = vi.fn<(...args: unknown[]) => Promise<unknown>>();

const emitTo = vi.fn((_ereignis: string, _target: string, _payload: unknown) => Promise.resolve());
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: (target: string, ereignis: string, payload: unknown) => emitTo(target, ereignis, payload),
}));

// nachSpeichernPruefen als reiner Passthrough (ruft nur den Vorgang auf) -
// die eigentliche Zähler-/Debounce-Logik ist bereits andernorts getestet
// (siehe gesetzSpeicherEreignisse.test.ts). Aufrufe werden mitgeschnitten,
// um zu prüfen, mit welchen Argumenten speichereGesetz/loescheGesetz sie
// aufrufen.
const nachSpeichernPruefen = vi.fn(
  (_kurztitel: Gesetzesreferenz, _inhaltGeaendert: boolean, vorgang: () => Promise<unknown>) =>
    vorgang(),
);
// vi.hoisted, da beiSpeicherBatchAbgeschlossen bereits beim (unten
// stehenden) Import von gesetzSpeicher.ts auf Modul-Top-Level aufgerufen
// wird - ein normales `let` wäre zu diesem Zeitpunkt noch im TDZ.
const zustand = vi.hoisted(() => ({
  broadcastSubscriber: undefined as
    ((betroffene: Gesetzesreferenz[]) => void | Promise<void>) | undefined,
}));
vi.mock('@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicherEreignisse', () => ({
  nachSpeichernPruefen: (
    kurztitel: Gesetzesreferenz,
    inhaltGeaendert: boolean,
    vorgang: () => Promise<unknown>,
  ) => nachSpeichernPruefen(kurztitel, inhaltGeaendert, vorgang),
  beiSpeicherBatchAbgeschlossen: vi.fn((fn: (betroffene: Gesetzesreferenz[]) => void) => {
    zustand.broadcastSubscriber = fn;
    return () => {};
  }),
}));

const hatNormenOhneTitel = vi.fn<(g: GesetzDarstellung) => boolean>(() => false);
const ladeNichtamtlicheTitel = vi.fn<(k: Gesetzesreferenz) => Promise<Map<string, string> | null>>(
  () => Promise.resolve(null),
);
const wendeNichtamtlicheTitelAn = vi.fn();
const synchronisiereEinNichtamtlicheTitel = vi.fn((_k: Gesetzesreferenz) => Promise.resolve(false));
vi.mock('@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.laden', () => ({
  hatNormenOhneTitel: (g: GesetzDarstellung) => hatNormenOhneTitel(g),
  ladeNichtamtlicheTitel: (k: Gesetzesreferenz) => ladeNichtamtlicheTitel(k),
  wendeNichtamtlicheTitelAn: (gesetz: GesetzDarstellung, titelMap: Map<string, string>) =>
    wendeNichtamtlicheTitelAn(gesetz, titelMap),
}));
vi.mock(
  '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.synchronisieren',
  () => ({
    synchronisiereEinNichtamtlicheTitel: (kurztitel: Gesetzesreferenz) =>
      synchronisiereEinNichtamtlicheTitel(kurztitel),
  }),
);

import {
  registrierePruefpflichtigeAenderung,
  appDatenSchreiben,
  appDatenLoeschen,
  appDatenLesen,
  appDatenExistiert,
  appDatenOrdnerLesen,
} from '@/lib/persistenz/kern/kern.index';
import { speichereGesetz, loescheGesetz } from './gesetzSpeicher.schreiben';
import { ladeGesetzesXML } from './gesetzSpeicher';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { pruefeGesetzDatei, sichereUngueltigeGesetzDatei } from './gesetzSpeicher.sicherung';
import { ladeGesetzFuerVerknuepfung } from './gesetzSpeicher.pruefladen';

beforeEach(() => {
  registrierePruefpflichtigeAenderung(empfaenger);
  appDatenSpeicher.clear();
  sichereBeiUngueltigemInhalt.mockReset();
  sichereBeiUngueltigemInhalt.mockImplementation(async (pfad) => {
    appDatenSpeicher.delete(String(pfad));
    return { status: 'archiviert', sicherungspfad: 'gesetze/sicherung_de-bund.xml' };
  });
  vi.clearAllMocks();
  emitTo.mockReset().mockResolvedValue(undefined);
  hatNormenOhneTitel.mockReturnValue(false);
  ladeNichtamtlicheTitel.mockResolvedValue(null);
  synchronisiereEinNichtamtlicheTitel.mockResolvedValue(false);
  nachSpeichernPruefen.mockImplementation(
    (_k: Gesetzesreferenz, _g: boolean, vorgang: () => Promise<unknown>) => vorgang(),
  );
});

it('misst Bestandsladen und XML-Parsing mit den vorgesehenen Namen', async () => {
  appDatenSpeicher.set('gesetze/A_de-bund.xml', gesetzesXML('A', 'A'));
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    expect(await ladeAlleGesetze()).toHaveLength(1);
    const ausgabe = info.mock.calls.map(([text]) => text).join('\n');
    expect(ausgabe).toMatch(/\[perf\] ladeAlleGesetze: [\d.]+ ms \(1 Gesetze, 0 Befunde\)/);
    expect(ausgabe).toMatch(/\[perf\] parseGesetzesXML: [\d.]+ ms/);
    expect(ausgabe).toMatch(/\[perf\] Gesetz lesen: A_de-bund: [\d.]+ ms \(\d+ Bytes\)/);
    expect(ausgabe).toMatch(/\[perf\] Gesetz parsen und zuordnen: A_de-bund: [\d.]+ ms/);
    expect(ausgabe).toMatch(/\[perf\] Gesetz vollständig: A_de-bund: [\d.]+ ms/);
  } finally {
    info.mockRestore();
  }
});

// ---------------------------------------------------------------------------
// Fixture-Helfer
// ---------------------------------------------------------------------------

function gesetzesXML(
  id: string,
  kurztitel: string,
  overrides: { langtitel?: string; hatKeinTitel?: boolean } = {},
): string {
  const titel = overrides.hatKeinTitel ? '' : '<titel>Ein Titel</titel>';
  return `<?xml version="1.0"?>
<gesetz id="${id}">
  <infos><normgeber>de-bund</normgeber><langtitel>${overrides.langtitel ?? `Testgesetz ${kurztitel}`}</langtitel><kurztitel>${kurztitel}</kurztitel></infos>
  <inhalt><norm><bezeichnung>§ 1</bezeichnung>${titel}<text><absatz></absatz></text></norm></inhalt>
</gesetz>`;
}

// ---------------------------------------------------------------------------
// Gesetzesdateinamen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// speichereGesetz
// ---------------------------------------------------------------------------

describe('speichereGesetz', () => {
  it('ruft nachSpeichernPruefen mit kurztitel und inhaltGeaendert=true (Default) auf', async () => {
    await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), gesetzesXML('BGB', 'BGB'));

    expect(nachSpeichernPruefen).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      true,
      expect.any(Function),
    );
  });

  it('gibt ein explizites inhaltGeaendert=false unverändert an nachSpeichernPruefen weiter', async () => {
    await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), gesetzesXML('BGB', 'BGB'), {
      inhaltGeaendert: false,
    });

    expect(nachSpeichernPruefen).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      false,
      expect.any(Function),
    );
  });

  it('stellt den Ordner sicher, schreibt die Datei unter gesetze/{id}.xml und synchronisiert nichtamtliche Titel', async () => {
    const xml = gesetzesXML('BGB', 'BGB');
    await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), xml);

    expect(sicherstelleOrdner).toHaveBeenCalledWith('gesetze');
    expect(appDatenSchreiben).toHaveBeenCalledWith(
      'gesetze/BGB_de-bund.xml',
      xml,
      'gesetz-token',
      'gesetz-vorgang',
    );
    expect(synchronisiereEinNichtamtlicheTitel).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
    );
  });
});

// ---------------------------------------------------------------------------
// ladeAlleGesetze
// ---------------------------------------------------------------------------

describe('ladeAlleGesetze', () => {
  it('gibt eine leere Liste zurück, wenn der Ordner noch nicht existiert', async () => {
    expect(await ladeAlleGesetze()).toEqual([]);
  });

  it('lädt nur Dateien mit .xml-Endung', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('zufaellige-uuid', 'BGB'));
    appDatenSpeicher.set('gesetze/Notizen.txt', 'kein Gesetz');

    const gesetze = await ladeAlleGesetze();

    expect(gesetze.map((g) => g.kurztitel)).toEqual(['BGB']);
  });

  it('lädt ein Gesetz ohne eigene Kennung trotz unbekanntem XML-Wurzelattribut', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('zufaellige-alte-uuid', 'BGB'));

    const gesetze = await ladeAlleGesetze();

    expect(gesetze[0]).not.toHaveProperty('id');
  });

  it('sortiert das Ergebnis alphabetisch nach kurztitel', async () => {
    appDatenSpeicher.set('gesetze/ZPO_de-bund.xml', gesetzesXML('ZPO', 'ZPO'));
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('BGB', 'BGB'));
    appDatenSpeicher.set('gesetze/Äh-Gesetz_de-bund.xml', gesetzesXML('Aeh', 'Äh-Gesetz'));

    const gesetze = await ladeAlleGesetze();

    expect(gesetze.map((g) => g.kurztitel)).toEqual(['Äh-Gesetz', 'BGB', 'ZPO']);
  });

  it('überspringt Dateien, die nicht geparst werden können, ohne die übrigen zu verwerfen', async () => {
    appDatenSpeicher.set('gesetze/Kaputt_de-bund.xml', 'kein XML {{{ ohne infos-block');
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('BGB', 'BGB'));

    const gesetze = await ladeAlleGesetze();

    expect(gesetze.map((g) => g.kurztitel)).toEqual(['BGB']);
  });

  it('ergänzt nichtamtliche Titel NUR bei Gesetzen mit hatNormenOhneTitel === true', async () => {
    appDatenSpeicher.set('gesetze/GG_de-bund.xml', gesetzesXML('GG', 'GG', { hatKeinTitel: true }));
    hatNormenOhneTitel.mockReturnValue(true);
    const titelMap = new Map([['§ 1', 'Menschenwürde']]);
    ladeNichtamtlicheTitel.mockResolvedValue(titelMap);

    const gesetze = await ladeAlleGesetze();

    expect(ladeNichtamtlicheTitel).toHaveBeenCalledWith(gesetze[0]);
    expect(wendeNichtamtlicheTitelAn).toHaveBeenCalledWith(gesetze[0], titelMap);
  });

  it('ruft ladeNichtamtlicheTitel NICHT auf, wenn hatNormenOhneTitel false liefert', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('BGB', 'BGB'));
    hatNormenOhneTitel.mockReturnValue(false);

    await ladeAlleGesetze();

    expect(ladeNichtamtlicheTitel).not.toHaveBeenCalled();
    expect(wendeNichtamtlicheTitelAn).not.toHaveBeenCalled();
  });

  it('wendeNichtamtlicheTitelAn wird NICHT aufgerufen, wenn ladeNichtamtlicheTitel null liefert', async () => {
    appDatenSpeicher.set('gesetze/GG_de-bund.xml', gesetzesXML('GG', 'GG', { hatKeinTitel: true }));
    hatNormenOhneTitel.mockReturnValue(true);
    ladeNichtamtlicheTitel.mockResolvedValue(null);

    await ladeAlleGesetze();

    expect(wendeNichtamtlicheTitelAn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ladeGesetzesXML
// ---------------------------------------------------------------------------

describe('ladeGesetzesXML', () => {
  it('gibt den rohen XML-Inhalt zurück, wenn die Datei existiert', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', '<gesetz normgeber="de-bund">roh</gesetz>');
    expect(await ladeGesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' }))).toBe(
      '<gesetz normgeber="de-bund">roh</gesetz>',
    );
  });

  it('gibt null zurück, wenn die Datei nicht existiert', async () => {
    expect(await ladeGesetzesXML(gesetzesreferenz({ kurztitel: 'Unbekannt' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loescheGesetz
// ---------------------------------------------------------------------------

describe('loescheGesetz', () => {
  it('meldet ausschließlich die bestätigte Entfernung global mit vollständiger Referenz', async () => {
    appDatenSpeicher.set('gesetze/PolG_de-bw.xml', 'inhalt');
    const ergebnis = await loescheGesetz({ kurztitel: 'polg', normgeber: 'de-bw' });
    expect(appDatenSpeicher.has('gesetze/PolG_de-bw.xml')).toBe(false);
    expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'gesetze-geloescht', [
      { kurztitel: 'polg', normgeber: 'de-bw' },
    ]);
    expect(ergebnis).toEqual({ benachrichtigung: 'gesendet' });
  });

  it('sendet bei fehlgeschlagener Entfernung keine Löschmeldung', async () => {
    await expect(loescheGesetz(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toThrow();
    expect(emitTo).not.toHaveBeenCalled();
  });

  it('wartet auf die Benachrichtigung und unterscheidet deren Fehler von einem Löschfehler', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', 'inhalt');
    let ablehnen!: (fehler: Error) => void;
    emitTo.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          ablehnen = reject;
        }),
    );
    let fertig = false;
    const loeschung = loescheGesetz(gesetzesreferenz({ kurztitel: 'BGB' })).then((ergebnis) => {
      fertig = true;
      return ergebnis;
    });
    await vi.waitFor(() => expect(ablehnen).toBeDefined());
    expect(fertig).toBe(false);
    expect(appDatenSpeicher.has('gesetze/BGB_de-bund.xml')).toBe(false);
    const fehler = new Error('Fensterabgleich nicht möglich');
    ablehnen(fehler);
    await expect(loeschung).resolves.toEqual({ benachrichtigung: 'fehlgeschlagen', fehler });
  });

  it('ruft nachSpeichernPruefen IMMER mit inhaltGeaendert=true auf (auch das Löschen selbst kann Konfliktstatus ändern)', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', 'inhalt');
    await loescheGesetz(gesetzesreferenz({ kurztitel: 'BGB' }));

    expect(nachSpeichernPruefen).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      true,
      expect.any(Function),
    );
  });

  it('löscht die Datei unter gesetze/{id}.xml', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', 'inhalt');
    await loescheGesetz(gesetzesreferenz({ kurztitel: 'BGB' }));

    expect(appDatenLoeschen).toHaveBeenCalledWith(
      'gesetze/BGB_de-bund.xml',
      'gesetz-token',
      'gesetz-vorgang',
    );
    expect(appDatenSpeicher.has('gesetze/BGB_de-bund.xml')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Modul-Top-Level: 'gesetze-geaendert'-Broadcast bei beiSpeicherBatchAbgeschlossen
// ---------------------------------------------------------------------------

describe("'gesetze-geaendert'-Broadcast (Modul-Anmeldung bei beiSpeicherBatchAbgeschlossen)", () => {
  it('meldet beim Modul-Import einen Subscriber an', () => {
    expect(zustand.broadcastSubscriber).toBeTypeOf('function');
  });

  it("sendet emitTo({ kind: 'Any' }, 'gesetze-geaendert', Array.from(betroffene)) mit den betroffenen Kurztitel", async () => {
    await zustand.broadcastSubscriber!([
      gesetzesreferenz({ kurztitel: 'BGB' }),
      gesetzesreferenz({ kurztitel: 'StGB' }),
    ]);

    expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'gesetze-geaendert', [
      gesetzesreferenz({ kurztitel: 'BGB' }),
      gesetzesreferenz({ kurztitel: 'StGB' }),
    ]);
  });

  it('meldet den Broadcast erst nach Abschluss von emitTo als fertig', async () => {
    let freigeben!: () => void;
    emitTo.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        freigeben = resolve;
      }),
    );
    const fertig = zustand.broadcastSubscriber!([gesetzesreferenz({ kurztitel: 'BGB' })]);
    expect(fertig).toBeInstanceOf(Promise);
    let abgeschlossen = false;
    void Promise.resolve(fertig).then(() => {
      abgeschlossen = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(emitTo).toHaveBeenCalledOnce();
    expect(abgeschlossen).toBe(false);
    freigeben();
    await fertig;
    expect(abgeschlossen).toBe(true);
  });

  it('schluckt einen Fehler von emitTo still (kein Tauri-Kontext) statt eine unhandled rejection zu erzeugen', async () => {
    emitTo.mockRejectedValueOnce(new Error('kein Tauri-Kontext'));
    expect(() =>
      zustand.broadcastSubscriber!([gesetzesreferenz({ kurztitel: 'BGB' })]),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('Gesetz-Ladebefunde', () => {
  it('verweigert automatische Reparatur ohne eindeutigen Normgeber auch bei bekanntem Quellentext', async () => {
    appDatenSpeicher.set(
      'gesetze/BGB_unbekannt.xml',
      '<kaputt><datenquelle name="Gesetze im Internet"/>',
    );
    const melden = vi.fn();
    await ladeAlleGesetze(melden);
    expect(melden).toHaveBeenCalledWith([
      {
        status: 'archiviert',
        dateiBasis: 'BGB_unbekannt',
        sicherungspfad: 'gesetze/sicherung_de-bund.xml',
      },
    ]);
  });
  it('liefert gültige Gesetze und gesammelte Befunde mit exakter Dateibasis', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('alt', 'BGB'));
    appDatenSpeicher.set('gesetze/PolG_de-bw.xml', '<kaputt><normgeber>de-bw</normgeber>');
    appDatenSpeicher.set('gesetze/Fremd_de-bund.xml', '<kaputt/>');
    const melden = vi.fn();
    expect((await ladeAlleGesetze(melden)).map((g) => g.kurztitel)).toEqual(['BGB']);
    expect(melden).toHaveBeenCalledWith([
      { status: 'reparierbar', dateiBasis: 'PolG_de-bw', kurztitel: 'PolG', quelle: 'de-bw' },
      {
        status: 'archiviert',
        dateiBasis: 'Fremd_de-bund',
        sicherungspfad: 'gesetze/sicherung_de-bund.xml',
      },
    ]);
    expect(sichereBeiUngueltigemInhalt).toHaveBeenCalledWith(
      'gesetze/Fremd_de-bund.xml',
      '<kaputt/>',
      expect.any(Function),
      { bannerAnzeigen: false, token: 'gesetz-token', vorgang: 'gesetz-vorgang' },
    );
    expect(nachSpeichernPruefen).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'Fremd' }),
      true,
      expect.any(Function),
    );
  });

  it.each([
    ['Nam_de-bw_de-bund', '<normgeber>de-bund</normgeber>', 'Nam_de-bw', 'de-bund'],
    ['Nam_de-bw_de-bw', '<normgeber>de-bw</normgeber>', 'Nam_de-bw', 'de-bw'],
  ])('bewahrt Bund-/BW-Namenskollisionen: %s', async (id, quelle, kurztitel, quelleId) => {
    appDatenSpeicher.set(`gesetze/${id}.xml`, `<kaputt>${quelle}`);
    const melden = vi.fn();
    await ladeAlleGesetze(melden);
    expect(melden).toHaveBeenCalledWith([
      { status: 'reparierbar', dateiBasis: id, kurztitel, quelle: quelleId },
    ]);
    expect(sichereBeiUngueltigemInhalt).not.toHaveBeenCalled();
  });

  it.each([
    ['Nam', '<datenquelle name="Landesrecht BW"/>'],
    ['Nam', '<datenquelle name="Gesetze im Internet"/><datenquelle name="Landesrecht BW"/>'],
    ['Nam', '<datenquelle name="Gesetze im Internet"/><kurztitel>Anderes</kurztitel>'],
    ['Nam', '<datenquelle name="EU-Recht"/>'],
    ['Nam', 'ohne Quelle'],
  ])('archiviert unbekannte oder unplausible Herkunft: %s / %s', async (id, xml) => {
    appDatenSpeicher.set(`gesetze/${id}.xml`, `<kaputt>${xml}`);
    expect(await pruefeGesetzDatei(id)).toMatchObject({ status: 'ungueltig', dateiBasis: id });
    await expect(sichereUngueltigeGesetzDatei(id, `<kaputt>${xml}`)).resolves.toMatchObject({
      status: 'archiviert',
      sicherungspfad: 'gesetze/sicherung_de-bund.xml',
    });
  });

  it('trennt fehlt, leer und unlesbar bei der öffentlichen, schreibfreien Prüfung', async () => {
    expect(await pruefeGesetzDatei('Fehlt_de-bund')).toEqual({
      status: 'fehlt',
      dateiBasis: 'Fehlt_de-bund',
    });
    appDatenSpeicher.set('gesetze/Leer_de-bund.xml', '  ');
    expect(await pruefeGesetzDatei('Leer_de-bund')).toEqual({
      status: 'leer',
      dateiBasis: 'Leer_de-bund',
    });
    appDatenSpeicher.set('gesetze/Defekt_de-bund.xml', '<fremd/>');
    expect(await pruefeGesetzDatei('Defekt_de-bund')).toEqual({
      status: 'ungueltig',
      dateiBasis: 'Defekt_de-bund',
      inhalt: '<fremd/>',
    });
    vi.mocked(appDatenLesen).mockRejectedValueOnce(new Error('Zugriff verweigert'));
    expect(await pruefeGesetzDatei('Defekt_de-bund')).toEqual({
      status: 'unlesbar',
      dateiBasis: 'Defekt_de-bund',
      fehler: 'Zugriff verweigert',
    });
    expect(sichereBeiUngueltigemInhalt).not.toHaveBeenCalled();
  });

  it('maskiert einen Fehler der Existenzprüfung nicht als fehlt', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', '<fremd/>');
    vi.mocked(appDatenLesen).mockRejectedValueOnce(new Error('Lesefehler'));
    vi.mocked(appDatenExistiert).mockRejectedValueOnce(new Error('Existenzfehler'));
    expect(await pruefeGesetzDatei('X_de-bund')).toEqual({
      status: 'unlesbar',
      dateiBasis: 'X_de-bund',
      fehler: 'Lesefehler',
    });
  });

  it.each(['gesichert_aber_nicht_entfernt', 'fehlt', 'leer'])(
    'übernimmt tatsächlichen Sicherungszustand %s ohne Bestandsmeldung',
    async (status) => {
      appDatenSpeicher.set('gesetze/X_de-bund.xml', '<fremd/>');
      sichereBeiUngueltigemInhalt.mockResolvedValue({
        status,
        ...(status === 'gesichert_aber_nicht_entfernt' ? { sicherungspfad: 'sicherung.xml' } : {}),
      });
      const melden = vi.fn();
      await ladeAlleGesetze(melden);
      expect(melden).toHaveBeenCalledWith([
        {
          status,
          dateiBasis: 'X_de-bund',
          ...(status === 'gesichert_aber_nicht_entfernt'
            ? { sicherungspfad: 'sicherung.xml' }
            : {}),
        },
      ]);
      expect(nachSpeichernPruefen.mock.calls.filter(([, geaendert]) => geaendert)).toEqual([]);
    },
  );

  it('erhält gültige Gesetze bei Sicherungs-, Titel- und Callbackfehlern', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', '<fremd/>');
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('alt', 'BGB'));
    sichereBeiUngueltigemInhalt.mockRejectedValue(new Error('Sicherung fehlgeschlagen'));
    hatNormenOhneTitel.mockReturnValue(true);
    ladeNichtamtlicheTitel.mockRejectedValue(new Error('Titelfehler'));
    const melden = vi.fn(() => {
      throw new Error('Meldungsfehler');
    });
    expect((await ladeAlleGesetze(melden)).map((g) => g.kurztitel)).toEqual(['BGB']);
    expect(melden).toHaveBeenCalledWith([
      {
        status: 'sicherung_fehlgeschlagen',
        dateiBasis: 'X_de-bund',
        fehler: 'Sicherung fehlgeschlagen',
      },
    ]);
  });

  it('lädt inzwischen gültigen Inhalt statt ihn als archiviert zu melden', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', '<fremd/>');
    sichereBeiUngueltigemInhalt.mockResolvedValue({
      status: 'gueltig',
      inhalt: gesetzesXML('alt', 'X'),
    });
    const melden = vi.fn();
    expect((await ladeAlleGesetze(melden)).map((g) => g.kurztitel)).toEqual(['X']);
    expect(nachSpeichernPruefen.mock.calls.filter(([, geaendert]) => geaendert)).toEqual([]);
  });

  it('meldet nach echter Archivierung im nächsten Durchlauf keine erneute Beschädigung', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', '<fremd/>');
    await ladeAlleGesetze();
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('BGB', 'BGB'));
    const melden = vi.fn();
    await ladeAlleGesetze(melden);
    expect(melden).toHaveBeenCalledWith([]);
    expect(sichereBeiUngueltigemInhalt).toHaveBeenCalledTimes(1);
  });

  it('übergibt Reparaturtoken und validiert aktuellen Inhalt mit vorhandenem Parser', async () => {
    await sichereUngueltigeGesetzDatei('X_de-bund', '<fremd/>', {
      token: 'sperre',
      vorgang: 'bestehend',
    });
    const [, , validieren, optionen] = sichereBeiUngueltigemInhalt.mock.calls[0]!;
    expect(optionen).toEqual({ bannerAnzeigen: false, token: 'sperre', vorgang: 'bestehend' });
    expect((validieren as (s: string) => boolean)(gesetzesXML('X', 'X'))).toBe(true);
    expect((validieren as (s: string) => boolean)('<fremd/>')).toBe(false);
  });
});

describe('Fehlerisolation beim Gesetzladen', () => {
  it('meldet Ordnerfehler getrennt von Einzeldateifehlern', async () => {
    sicherstelleOrdner.mockRejectedValueOnce(new Error('Ordnerzugriff'));
    const melden = vi.fn();
    expect(await ladeAlleGesetze(melden)).toEqual([]);
    expect(melden).toHaveBeenCalledWith([{ status: 'ordner_unlesbar', fehler: 'Ordnerzugriff' }]);
  });

  it('behält gültige Gesetze bei unlesbarer anderer Datei und asynchroner Meldungsausnahme', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', 'nicht lesbar');
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('BGB', 'BGB'));
    vi.mocked(appDatenLesen).mockRejectedValueOnce(new Error('Lesefehler'));
    const melden = vi.fn().mockRejectedValue(new Error('Bannerfehler'));
    expect((await ladeAlleGesetze(melden)).map((g) => g.kurztitel)).toEqual(['BGB']);
    expect(melden).toHaveBeenCalledWith([
      { status: 'unlesbar', dateiBasis: 'X_de-bund', fehler: 'Lesefehler' },
    ]);
  });

  it('meldet einen Lesefehler während der Sicherung als unlesbar', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', '<fremd/>');
    sichereBeiUngueltigemInhalt.mockImplementation(async () => {
      vi.mocked(appDatenLesen).mockRejectedValueOnce(new Error('Neuer Lesefehler'));
      throw new Error('Neuer Lesefehler');
    });
    const melden = vi.fn();
    await ladeAlleGesetze(melden);
    expect(melden).toHaveBeenCalledWith([
      { status: 'unlesbar', dateiBasis: 'X_de-bund', fehler: 'Neuer Lesefehler' },
    ]);
  });

  it('behandelt Parserausnahmen als ungültigen Inhalt ohne zu schreiben', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', gesetzesXML('X', 'X'));
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementationOnce(() => {
      throw new Error('Parserausnahme');
    });
    expect(await pruefeGesetzDatei('X_de-bund')).toEqual({
      status: 'ungueltig',
      dateiBasis: 'X_de-bund',
      inhalt: gesetzesXML('X', 'X'),
    });
    parse.mockRestore();
    expect(sichereBeiUngueltigemInhalt).not.toHaveBeenCalled();
  });

  it('respektiert einen Browser-parsererror ohne den Parserumfang zu erweitern', async () => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', gesetzesXML('X', 'X'));
    const original = DOMParser.prototype.parseFromString;
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementationOnce(function (
      this: DOMParser,
    ) {
      return original.call(this, '<parsererror>XML-Fehler</parsererror>', 'application/xml');
    });
    expect((await pruefeGesetzDatei('X_de-bund')).status).toBe('ungueltig');
    parse.mockRestore();
  });
});

describe('Konservative rohe Herkunftserkennung', () => {
  it.each([
    '<!-- <datenquelle name="Gesetze im Internet"/> -->',
    '<!-- <datenquelle name="Gesetze im Internet"/>',
    '<![CDATA[<datenquelle name="Gesetze im Internet"/>]]>',
    '<![CDATA[<datenquelle name="Gesetze im Internet"/>',
  ])('nutzt keine Quellenangabe aus Kommentar oder CDATA: %s', async (xml) => {
    appDatenSpeicher.set('gesetze/X_de-bund.xml', `<kaputt>${xml}`);
    const melden = vi.fn();
    await ladeAlleGesetze(melden);
    expect(melden).toHaveBeenCalledWith([
      {
        status: 'archiviert',
        dateiBasis: 'X_de-bund',
        sicherungspfad: 'gesetze/sicherung_de-bund.xml',
      },
    ]);
  });

  it('meldet nach Archivierung die erkennbare fachliche Kurztitel', async () => {
    appDatenSpeicher.set(
      'gesetze/Altname_de-bw.xml',
      '<kaputt><normgeber>de-bw</normgeber><kurztitel>PolG</kurztitel>',
    );
    await ladeAlleGesetze();
    expect(nachSpeichernPruefen).toHaveBeenCalledWith(
      { kurztitel: 'PolG', normgeber: 'de-bw' },
      true,
      expect.any(Function),
    );
  });
});

describe('Bestandsladen ohne Fenster-Cache', () => {
  it('liest bei jedem Aufruf neu und erkennt Änderungen ohne Ereigniszustellung', async () => {
    appDatenSpeicher.set('gesetze/A_de-bund.xml', gesetzesXML('A', 'A', { langtitel: 'Alt' }));
    const vorher = await ladeAlleGesetze();
    appDatenSpeicher.set('gesetze/A_de-bund.xml', gesetzesXML('A', 'A', { langtitel: 'Neu' }));
    const nachher = await ladeAlleGesetze();
    expect(nachher[0]!.langtitel).toBe('Neu');
    expect(vorher[0]!.langtitel).toBe('Alt');
    expect(nachher[0]).not.toBe(vorher[0]);
    expect(appDatenOrdnerLesen).toHaveBeenCalledTimes(2);
  });

  it('liest und parst auch für parallele Aufrufer getrennt', async () => {
    appDatenSpeicher.set('gesetze/A_de-bund.xml', gesetzesXML('A', 'A'));
    const [a, b] = await Promise.all([ladeAlleGesetze(), ladeAlleGesetze()]);
    expect(a.map((g) => g.kurztitel)).toEqual(b.map((g) => g.kurztitel));
    expect(a[0]).not.toBe(b[0]);
    expect(appDatenOrdnerLesen).toHaveBeenCalledTimes(2);
  });

  it('erkennt entfernte Dateien ohne Invalidierung', async () => {
    appDatenSpeicher.set('gesetze/A_de-bund.xml', gesetzesXML('A', 'A'));
    await ladeAlleGesetze();
    appDatenSpeicher.delete('gesetze/A_de-bund.xml');
    expect(await ladeAlleGesetze()).toEqual([]);
  });
});

describe('Frische nach Schreib- und Titelfehlern', () => {
  beforeEach(() =>
    appDatenSpeicher.set('gesetze/A_de-bund.xml', gesetzesXML('A', 'A', { langtitel: 'Alt' })),
  );

  it('lädt optionale Titel nach vorübergehendem Fehler erneut', async () => {
    hatNormenOhneTitel.mockReturnValue(true);
    ladeNichtamtlicheTitel.mockRejectedValueOnce(new Error('Titelzugriff'));
    await ladeAlleGesetze();
    const titel = new Map([['§ 1', 'Ergänzt']]);
    ladeNichtamtlicheTitel.mockResolvedValueOnce(titel);
    await ladeAlleGesetze();
    expect(wendeNichtamtlicheTitelAn).toHaveBeenCalledWith(expect.anything(), titel);
    expect(appDatenOrdnerLesen).toHaveBeenCalledTimes(2);
  });

  it('liest geschriebenes XML trotz gescheiterter Titelsynchronisierung', async () => {
    await ladeAlleGesetze();
    synchronisiereEinNichtamtlicheTitel.mockRejectedValueOnce(new Error('Sync'));
    await expect(
      speichereGesetz(
        gesetzesreferenz({ kurztitel: 'A' }),
        gesetzesXML('A', 'A', { langtitel: 'Neu' }),
      ),
    ).rejects.toThrow('Sync');
    expect((await ladeAlleGesetze())[0]!.langtitel).toBe('Neu');
  });

  it('liest nach Prüfdatum-Refresh und Löschen den aktuellen Bestand', async () => {
    await ladeAlleGesetze();
    await speichereGesetz(
      gesetzesreferenz({ kurztitel: 'A' }),
      gesetzesXML('A', 'A', { langtitel: 'Neu' }),
      { inhaltGeaendert: false },
    );
    expect((await ladeAlleGesetze())[0]!.langtitel).toBe('Neu');
    await loescheGesetz(gesetzesreferenz({ kurztitel: 'A' }));
    expect(await ladeAlleGesetze()).toEqual([]);
  });

  it('liest nach bestätigter Archivierung keine entfernte Datei', async () => {
    await ladeAlleGesetze();
    appDatenSpeicher.set('gesetze/A_de-bund.xml', '<kaputt/>');
    await sichereUngueltigeGesetzDatei('A_de-bund', '<kaputt/>');
    expect(await ladeAlleGesetze()).toEqual([]);
  });
});

it('meldet jedem parallelen Aufrufer die Befunde trotz fehlerhafter anderer Meldung', async () => {
  appDatenSpeicher.set('gesetze/Leer_de-bund.xml', '');
  const melden = vi.fn();
  const fehlermeldung = vi.fn(async () => {
    throw new Error('Meldung');
  });
  const [a, b] = await Promise.all([ladeAlleGesetze(melden), ladeAlleGesetze(fehlermeldung)]);
  expect(a).toEqual([]);
  expect(b).toEqual([]);
  expect(melden).toHaveBeenCalledWith([{ status: 'leer', dateiBasis: 'Leer_de-bund' }]);
  expect(fehlermeldung).toHaveBeenCalledWith([{ status: 'leer', dateiBasis: 'Leer_de-bund' }]);
  expect(appDatenOrdnerLesen).toHaveBeenCalledTimes(2);
});

it('reicht die vollständige Gesetzesreferenz an die Titel-Synchronisierung weiter', async () => {
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  await speichereGesetz(gesetz, gesetzesXML('BGB', 'BGB'));
  expect(synchronisiereEinNichtamtlicheTitel).toHaveBeenCalledExactlyOnceWith({
    kurztitel: 'BGB',
    normgeber: 'de-bund',
  });
});

it('meldet Archivierungen mit dem erkennbaren Normgeber und Kurztitel', async () => {
  appDatenSpeicher.set(
    'gesetze/Altname_de-bw.xml',
    '<kaputt><normgeber>de-bw</normgeber><kurztitel>PolG</kurztitel>',
  );
  await ladeAlleGesetze();
  expect(nachSpeichernPruefen).toHaveBeenCalledWith(
    { kurztitel: 'PolG', normgeber: 'de-bw' },
    true,
    expect.any(Function),
  );
});

it('dekodiert die lesbare Archivierungsreferenz genau einmal', async () => {
  appDatenSpeicher.set(
    'gesetze/Alt_de-bund.xml',
    '<kaputt><infos><normgeber>de-b&#117;nd</normgeber><kurztitel>A&amp;amp;B</kurztitel></infos>',
  );
  await ladeAlleGesetze();
  expect(nachSpeichernPruefen).toHaveBeenCalledWith(
    { kurztitel: 'A&amp;B', normgeber: 'de-bund' },
    true,
    expect.any(Function),
  );
});

// Der Dateiname und infos müssen dieselbe vollständige Referenz bezeichnen.
describe('Vollständige Dateireferenz', () => {
  it('speichert kanonische Dateinamen statt einer fremden id', async () => {
    await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), gesetzesXML('alt', 'BGB'));
    expect(appDatenSchreiben).toHaveBeenCalledWith(
      'gesetze/BGB_de-bund.xml',
      expect.any(String),
      'gesetz-token',
      'gesetz-vorgang',
    );
  });
  it('erhält tatsächliche Schreibweise unter Linux beim Lesen, Ändern und Löschen', async () => {
    appDatenSpeicher.set('gesetze/bGb_de-bund.xml', gesetzesXML('alt', 'BGB'));
    expect((await ladeAlleGesetze())[0]?.kurztitel).toBe('BGB');
    await speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), gesetzesXML('alt', 'BGB'));
    expect(appDatenSchreiben).toHaveBeenCalledWith(
      'gesetze/bGb_de-bund.xml',
      expect.any(String),
      'gesetz-token',
      'gesetz-vorgang',
    );
    expect(await ladeGesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' }))).toContain(
      '<kurztitel>bGb</kurztitel>',
    );
    await loescheGesetz(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(appDatenLoeschen).toHaveBeenCalledWith(
      'gesetze/bGb_de-bund.xml',
      'gesetz-token',
      'gesetz-vorgang',
    );
  });
  it('verweigert konkurrierende Dateien statt eine auszuwählen oder zu ändern', async () => {
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', gesetzesXML('alt', 'BGB'));
    appDatenSpeicher.set('gesetze/bgb_de-bund.xml', gesetzesXML('alt', 'BGB'));
    const melden = vi.fn();
    expect(await ladeAlleGesetze(melden)).toEqual([]);
    expect(melden).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'unlesbar',
          fehler: expect.stringContaining('Mehrere Dateien'),
        }),
      ]),
    );
    await expect(
      speichereGesetz(gesetzesreferenz({ kurztitel: 'BGB' }), gesetzesXML('alt', 'BGB')),
    ).rejects.toThrow(/Mehrere Dateien/);
    await expect(loescheGesetz(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toThrow(
      /Mehrere Dateien/,
    );
    expect(appDatenSchreiben).not.toHaveBeenCalled();
    expect(appDatenLoeschen).not.toHaveBeenCalled();
    expect(sichereBeiUngueltigemInhalt).not.toHaveBeenCalled();
  });
  it('meldet falsche infos als ungültig und bietet niemals Reparatur für das andere Gesetz an', async () => {
    const xml = gesetzesXML('alt', 'Anderes').replace(
      '</infos>',
      '<normgeber>de-bund</normgeber></infos>',
    );
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', xml);
    expect((await pruefeGesetzDatei('BGB_de-bund')).status).toBe('ungueltig');
    const melden = vi.fn();
    expect(await ladeAlleGesetze(melden)).toEqual([]);
    expect(melden).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'archiviert', dateiBasis: 'BGB_de-bund' }),
    ]);
  });
  it('validiert Dateinamen auch während einer konkurrierenden Sicherung', async () => {
    await sichereUngueltigeGesetzDatei('BGB_de-bund', '<fremd/>');
    const validieren = sichereBeiUngueltigemInhalt.mock.calls[0]![2] as (s: string) => boolean;
    expect(validieren(gesetzesXML('alt', 'Anderes'))).toBe(false);
    expect(validieren(gesetzesXML('alt', 'BGB'))).toBe(true);
  });
});

it('gibt die Bestandsreferenz zurück und lässt die Eingabe unverändert', async () => {
  appDatenSpeicher.set('gesetze/bGb_de-bund.xml', gesetzesXML('alt', 'BGB'));
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  const gespeichert = await speichereGesetz(gesetz, gesetzesXML('neu', 'BGB'));
  expect(gespeichert).toEqual(gesetzesreferenz({ kurztitel: 'bGb' }));
  expect(gesetz).toEqual(gesetzesreferenz({ kurztitel: 'BGB' }));
});
it('liest eine vorhandene XML-Dateiendung in tatsächlicher Großschreibung', async () => {
  appDatenSpeicher.set('gesetze/BGB_de-bund.XML', gesetzesXML('alt', 'BGB'));
  expect(await ladeGesetzesXML(gesetzesreferenz({ kurztitel: 'bgb' }))).toContain(
    '<kurztitel>BGB</kurztitel>',
  );
  expect((await pruefeGesetzDatei('bgb_de-bund')).status).toBe('gueltig');
  expect((await ladeAlleGesetze())[0]?.kurztitel).toBe('BGB');
});

it.each(['at-bund', 'de-by'])(
  'speichert und lädt die originale Code-Referenz %s',
  async (normgeber) => {
    const g = { kurztitel: 'TestG', normgeber };
    const xml = gesetzesXML('alt', 'TestG').replace(
      '<normgeber>de-bund</normgeber>',
      `<normgeber>${normgeber}</normgeber>`,
    );
    await speichereGesetz(g, xml);
    expect(appDatenSpeicher.get(`gesetze/TestG_${normgeber}.xml`)).toBe(xml);
    expect(await ladeGesetzesXML(g)).toBe(xml);
    const geladen = await ladeAlleGesetze();
    expect(geladen).toHaveLength(1);
    expect(geladen[0]).toMatchObject(g);
    expect((await pruefeGesetzDatei(`TestG_${normgeber}`)).status).toBe('gueltig');
  },
);

it('lädt die gesperrte Gesetzquelle strikt und ohne Titelergänzung oder Archivierung', async () => {
  appDatenSpeicher.set(
    'gesetze/BGB_de-bund.xml',
    gesetzesXML('BGB', 'BGB', { hatKeinTitel: true }),
  );
  const ref = gesetzesreferenz({ kurztitel: 'BGB' });
  const quelle = { pfad: 'gesetze/BGB_de-bund.xml', token: 'gehalten' };
  expect((await ladeGesetzFuerVerknuepfung(ref, quelle))?.kurztitel).toBe('BGB');
  expect(ladeNichtamtlicheTitel).not.toHaveBeenCalled();
  expect(sichereBeiUngueltigemInhalt).not.toHaveBeenCalled();
  appDatenSpeicher.set(quelle.pfad, '<gesetz normgeber="de-bund">kaputt</gesetz>');
  await expect(ladeGesetzFuerVerknuepfung(ref, quelle)).rejects.toThrow('Gesetzdatei');
  expect(sichereBeiUngueltigemInhalt).not.toHaveBeenCalled();
});
it('verweigert fremde Quellen und fehlende Tokens statt ungeschützt zu lesen', async () => {
  await expect(
    ladeGesetzFuerVerknuepfung(gesetzesreferenz({ kurztitel: 'BGB' }), {
      pfad: 'gesetze/HGB_de-bund.xml',
      token: 'gehalten',
    }),
  ).rejects.toThrow('Quelle');
  await expect(
    ladeGesetzFuerVerknuepfung(gesetzesreferenz({ kurztitel: 'BGB' }), {
      pfad: 'gesetze/BGB_de-bund.xml',
      token: '',
    }),
  ).rejects.toThrow('Token');
});

it('lädt XML über die vollständige Referenz unabhängig von deren Schreibweise', async () => {
  appDatenSpeicher.set('gesetze/BGB_de-bund.xml', '<gesetz normgeber="de-bund">Bund</gesetz>');
  appDatenSpeicher.set('gesetze/BGB_de-bw.xml', '<gesetz normgeber="de-bund">BW</gesetz>');
  expect(await ladeGesetzesXML({ kurztitel: 'bgb', normgeber: 'de-bund' })).toBe(
    '<gesetz normgeber="de-bund">Bund</gesetz>',
  );
  expect(await ladeGesetzesXML({ kurztitel: 'bgb', normgeber: 'eu' })).toBeNull();
});

describe('Schreibweise der gespeicherten Referenz', () => {
  it.each([
    [
      { kurztitel: 'Bgb', normgeber: 'de-bund' },
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      'BGB_de-bund',
    ],
    [gesetzesreferenz({ kurztitel: 'Xyz' }), gesetzesreferenz({ kurztitel: 'XYZ' }), 'XYZ_de-bund'],
    [
      { kurztitel: 'A&<b', normgeber: 'de-bund' },
      { kurztitel: 'A&<B', normgeber: 'de-bund' },
      'A&%3CB_de-bund',
    ],
  ])(
    'gleicht ausschließlich die Kopfangaben an und verändert die Eingabe nicht: %j',
    async (eingabe, erwartet, basis) => {
      const xml = `<gesetz><infos><kurztitel>${eingabe.kurztitel.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</kurztitel>${'normgeber' in eingabe ? `<normgeber>${eingabe.normgeber}</normgeber>` : ''}</infos><inhalt><verweis gesetz="Bgb" normgeber="de-bund">Text &amp; mehr</verweis></inhalt></gesetz>`;
      appDatenSpeicher.set(`gesetze/${basis}.xml`, 'alter Inhalt');
      const vorher = { ...eingabe };
      const ergebnis = await speichereGesetz(eingabe, xml);
      expect(ergebnis).toEqual(erwartet);
      expect(eingabe).toEqual(vorher);
      expect([...appDatenSpeicher.keys()]).toEqual([`gesetze/${basis}.xml`]);
      const gespeichert = appDatenSpeicher.get(`gesetze/${basis}.xml`)!;
      expect(gespeichert.slice(gespeichert.indexOf('<inhalt>'))).toBe(
        xml.slice(xml.indexOf('<inhalt>')),
      );
      expect(gespeichert).toContain(
        `<kurztitel>${erwartet.kurztitel.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</kurztitel>`,
      );
      if ('normgeber' in erwartet) expect(gespeichert).toContain('<normgeber>de-bund</normgeber>');
      else expect(gespeichert).not.toContain('<normgeber>');
    },
  );
  it('erhält bei Neuanlage die übergebene Schreibweise und gibt nur die Referenz zurück', async () => {
    const eingabe = { kurztitel: 'Bgb', normgeber: 'de-bund', weitereAngabe: true };
    expect(
      await speichereGesetz(
        eingabe,
        '<gesetz><infos><kurztitel>Bgb</kurztitel><normgeber>de-bund</normgeber></infos></gesetz>',
      ),
    ).toEqual({ kurztitel: 'Bgb', normgeber: 'de-bund' });
    expect(appDatenSpeicher.has('gesetze/Bgb_de-bund.xml')).toBe(true);
  });
});

it.each([true, false])(
  'verändert bei Fehlern die Eingabe nicht; Referenz nur nach bestätigtem Schreiben (Folgefehler: %s)',
  async (folgefehler) => {
    const eingabe = { kurztitel: 'Bgb', normgeber: 'de-bund' };
    appDatenSpeicher.set('gesetze/BGB_de-bund.xml', 'alt');
    if (folgefehler) synchronisiereEinNichtamtlicheTitel.mockRejectedValueOnce(new Error('Titel'));
    else vi.mocked(appDatenSchreiben).mockRejectedValueOnce(new Error('Datenträger'));
    const ergebnis = await speichereGesetz(
      eingabe,
      '<gesetz><infos><kurztitel>Bgb</kurztitel><normgeber>bund</normgeber></infos></gesetz>',
    ).catch((fehler: unknown) => fehler);
    expect(eingabe).toEqual({ kurztitel: 'Bgb', normgeber: 'de-bund' });
    if (folgefehler)
      expect(ergebnis).toMatchObject({
        name: 'GesetzSpeicherFolgefehler',
        gespeicherteReferenz: { kurztitel: 'BGB', normgeber: 'de-bund' },
      });
    else {
      expect(ergebnis).toBeInstanceOf(Error);
      expect(ergebnis).not.toHaveProperty('gespeicherteReferenz');
      expect(appDatenSpeicher.get('gesetze/BGB_de-bund.xml')).toBe('alt');
    }
  },
);

it('erkennt Kopfangaben auch neben XML-ähnlichem Kommentar und verändert Text-Tags nicht', async () => {
  appDatenSpeicher.set('gesetze/BGB_de-bund.xml', 'alt');
  const xml =
    '<gesetz><!-- <infos><normgeber>de-bund</normgeber><kurztitel>Kommentar</kurztitel></infos> --><infos><!-- </infos> --><kurztitel>Bgb</kurztitel><normgeber>bund</normgeber></infos><inhalt><kurztitel>Bgb</kurztitel><![CDATA[<infos><normgeber>de-bund</normgeber><kurztitel>Bgb</kurztitel></infos>]]></inhalt></gesetz>';
  await speichereGesetz({ kurztitel: 'Bgb', normgeber: 'de-bund' }, xml);
  expect(appDatenSpeicher.get('gesetze/BGB_de-bund.xml')).toBe(
    xml.replace(
      '<kurztitel>Bgb</kurztitel><normgeber>bund</normgeber>',
      '<kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber>',
    ),
  );
});

it('erhält beim reinen Prüfzeitpunkt-Refresh historische XML-Schreibweise und gibt die Dateireferenz zurück', async () => {
  const xml = gesetzesXML('alt', 'Bgb').replace('</infos>', '<normgeber>bund</normgeber></infos>');
  appDatenSpeicher.set('gesetze/BGB_de-bund.xml', xml);
  const eingabe = { kurztitel: 'Bgb', normgeber: 'de-bund' };
  expect(await speichereGesetz(eingabe, xml, { inhaltGeaendert: false })).toEqual({
    kurztitel: 'BGB',
    normgeber: 'de-bund',
  });
  expect(appDatenSpeicher.get('gesetze/BGB_de-bund.xml')).toBe(xml);
  expect(eingabe).toEqual({ kurztitel: 'Bgb', normgeber: 'de-bund' });
});

it('gleicht einen gleichen Kurztitel bei anderem Normgeber nicht an', async () => {
  appDatenSpeicher.set('gesetze/BGB_de-bw.xml', 'unverändert');
  const referenz = { kurztitel: 'Bgb', normgeber: 'de-bund' };
  expect(
    await speichereGesetz(
      referenz,
      '<gesetz><infos><kurztitel>Bgb</kurztitel><normgeber>de-bund</normgeber></infos></gesetz>',
    ),
  ).toEqual(referenz);
  expect(appDatenSpeicher.get('gesetze/BGB_de-bw.xml')).toBe('unverändert');
  expect(appDatenSpeicher.has('gesetze/Bgb_de-bund.xml')).toBe(true);
});

it('liest, überschreibt und löscht den tatsächlich vorhandenen zerlegten Dateipfad', async () => {
  const ref = gesetzesreferenz({ kurztitel: 'ÄApprO 2002' });
  const pfad = `gesetze/${ref.kurztitel.normalize('NFD')}_de-bund.xml`;
  const xml = gesetzesXML('test', ref.kurztitel);
  appDatenSpeicher.set(pfad, xml);
  expect(await ladeGesetzesXML(ref)).toBe(xml);
  expect((await ladeAlleGesetze()).map((g) => g.kurztitel)).toContain(ref.kurztitel);
  const neu = gesetzesXML('test', ref.kurztitel, { langtitel: 'Neuer Titel' });
  await speichereGesetz(ref, neu);
  expect(appDatenSpeicher.get(pfad)).toBe(
    neu.replace(ref.kurztitel, ref.kurztitel.normalize('NFD')),
  );
  expect([...appDatenSpeicher.keys()].filter((p) => p.startsWith('gesetze/'))).toEqual([pfad]);
  await loescheGesetz(ref);
  expect(appDatenSpeicher.has(pfad)).toBe(false);
});
