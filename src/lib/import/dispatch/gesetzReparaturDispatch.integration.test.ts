// Reale Reparaturkette von Dispatch über Quellen, Verweisaufbereitung und Bestand.
// Nur Netzwerk, native I/O und Indexdaten sind ersetzt; der Titelsync läuft echt.
import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alleBannerSchliessen } from '@/lib/banner/banner.index';
import { meldeGezeigteBanner } from '@/test/banner/gezeigteBanner';
import { zipSync, strToU8 } from 'fflate';
import { readFile } from '@tauri-apps/plugin-fs';
const daten = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  fetch: vi.fn(),
  emit: vi.fn(),
  banner: vi.fn(),
  // Prüft der echte Titelsync den Bestand, meldet er den Titelpfad; optional scheitert die Prüfung.
  sync: vi.fn(),
  syncFehler: vi.fn<() => Error | undefined>(),
  lesen: vi.fn(),
  indexTitel: 'TestG',
  archivStatus: 'archiviert',
  referenzFehler: false,
  referenzWarten: undefined as Promise<void> | undefined,
  referenzLesen: vi.fn(),
  importindexFehler: false,
  reihenfolge: [] as string[],
  rohdateien: new Map<string, string>(),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sicherstelleOrdner: async () => {},
  appDatenLesen: async (pfad: string) => {
    daten.lesen(pfad);
    const inhalt = daten.dateien.get(pfad);
    if (inhalt === undefined) throw new Error('fehlt');
    return inhalt;
  },
  appDatenExistiert: async (pfad: string) => {
    if (pfad.startsWith('nichtamtliche-titel/')) {
      daten.sync(pfad);
      const fehler = daten.syncFehler();
      if (fehler) throw fehler;
    }
    return daten.dateien.has(pfad);
  },
  appDatenVerarbeitungszeitAuffrischen: async (pfad: string, inhalt: string) => {
    daten.dateien.set(pfad, inhalt);
  },
  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    if (pfad.startsWith('gesetze/')) daten.reihenfolge.push(pfad);
    daten.dateien.set(pfad, inhalt);
  },
  appDatenLoeschen: async (pfad: string) => {
    daten.dateien.delete(pfad);
  },
  appDatenOrdnerLesen: async (ordner: string) =>
    [...daten.dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1) })),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => daten.rohdateien.get(pfad),
  readFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: daten.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: daten.emit }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: daten.fetch }));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  sucheImImportindex: async (_quelle: string, kurztitel: string) => {
    if (daten.importindexFehler) throw new Error('Index endgültig unlesbar');
    return {
      kurztitel: daten.indexTitel === 'TestG' ? kurztitel : daten.indexTitel,
      abrufkennung: 'testg',
    };
  },
  sucheImImportindexPerLangtitel: async () => {
    if (daten.importindexFehler) throw new Error('Index endgültig unlesbar');
    return null;
  },
  uebernehmeImportindexDatei: async (inhalt: string) => {
    daten.reihenfolge.push('index');
    if (inhalt.includes('ungueltig')) throw new Error('Ungültiger Index');
    return { kategorie: 'de-bund', aktion: 'neu' };
  },
  leseReferenzVerzeichnis: async (quelle: string) => {
    daten.referenzLesen(quelle);
    await daten.referenzWarten;
    return {
      eintraege: daten.referenzFehler
        ? []
        : [{ kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch' }],
      fehler: daten.referenzFehler
        ? [{ quelle, meldung: 'Referenzverzeichnis endgültig unlesbar' }]
        : [],
    };
  },
  ImportindexFormatFehler: class extends Error {},
}));
import {
  mitGesetzDateiImport,
  importiereGesetze,
  aktualisiereGesetze,
  type GesetzDateiImport,
} from '@/lib/import/import.index';
/** Einzelne Datei über den Datei-Import, wie ihn der App-Code verwendet. */
const importiereGesetzDatei: GesetzDateiImport = (...args) =>
  mitGesetzDateiImport((importiereDatei) => importiereDatei(...args));
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
async function verarbeiteDateien(dateien: { name: string; inhalt: string }[]) {
  daten.rohdateien = new Map(dateien.map((datei) => [datei.name, datei.inhalt]));
  return importierePfade(dateien.map((datei) => datei.name));
}
import { repariereGesetze } from '@/lib/import/dispatch/gesetzReparaturDispatch';
import {
  warteAufSpeicherBatchAbschluss,
  beiSpeicherBatchAbgeschlossen,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
const pruefEmpfaenger = { vormerken: async () => 'pruefvorgang', abschliessen: async () => {} };
import type { GesetzReparaturZiel } from '@/lib/import/importVertrag.types';
const ziel: GesetzReparaturZiel = {
  dateiBasis: 'TestG_de-bund',
  kurztitel: 'TestG',
  quelle: 'de-bund',
};
const kaputt =
  '<parsererror/><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/>';
const bundesXML = `<dokumente doknr="G001"><norm doknr="G001"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue></metadaten></norm>
<norm doknr="N001"><metadaten><enbez>§ 1</enbez><titel>Anwendung</titel></metadaten><Content><P>Es gilt § 2 BGB.</P></Content></norm></dokumente>`;
const bwHTML =
  '<html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000 | gültig ab: 2000-01-01</title></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1 Anwendung</h4><p>Es gilt § 2 BGB.</p></div></body></html>';
let bannerProtokollEnde: () => void = () => {};
beforeEach(() => {
  bannerProtokollEnde = meldeGezeigteBanner(daten.banner);
  registrierePruefpflichtigeAenderung(pruefEmpfaenger);
  vi.clearAllMocks();
  daten.dateien.clear();
  daten.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  daten.dateien.set('gesetze/TestG_de-bund.xml', kaputt);
  daten.indexTitel = 'TestG';
  daten.referenzFehler = false;
  daten.referenzWarten = undefined;
  daten.importindexFehler = false;
  daten.reihenfolge.length = 0;
  daten.archivStatus = 'archiviert';
  daten.emit.mockResolvedValue(undefined);
  const zip = zipSync({ 'testg.xml': strToU8(bundesXML) });
  daten.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => zip.buffer });
  daten.invoke.mockImplementation(async (befehl: string, args: Record<string, string>) => {
    if (befehl === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(daten.dateien);
    if (befehl === 'datei_sperre_erwerben') return 'quelltoken';
    if (befehl === 'import_aktualisierung_starten') return 'Vorgang';
    if (befehl === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (befehl === 'lade_gesetz_html_bw') return bwHTML;
    if (befehl === 'archiviere_beschaedigte_datei') {
      expect(daten.dateien.get(args.relativerPfad!)).toBe(args.erwarteterInhalt);
      daten.dateien.set('gesetze/Sicherung.xml', args.erwarteterInhalt!);
      if (daten.archivStatus === 'archiviert') daten.dateien.delete(args.relativerPfad!);
      return { status: daten.archivStatus, sicherungspfad: 'gesetze/Sicherung.xml' };
    }
    return undefined;
  });
});
afterEach(async () => {
  bannerProtokollEnde();
  alleBannerSchliessen();
  await warteAufSpeicherBatchAbschluss();
  vi.unstubAllGlobals();
});
describe('Reparaturintegration', () => {
  it('repariert Bund und BW getrennt, taggt Verweise und meldet den echten Bestand ohne Reparaturbanner', async () => {
    daten.dateien.set(
      'gesetze/TestG_de-bw.xml',
      '<parsererror/><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/>',
    );
    const reload = vi.fn(async () => {
      await ladeAlleGesetze();
    });
    const abmelden = beiSpeicherBatchAbgeschlossen(reload);
    try {
      expect(
        await repariereGesetze([ziel, { ...ziel, dateiBasis: 'TestG_de-bw', quelle: 'de-bw' }]),
      ).toMatchObject([
        {
          status: 'repariert',
          gesetz: {
            kurztitel: 'TestG',
            normgeber: 'de-bund',
            datenquelle: { name: 'Gesetze im Internet' },
          },
        },
        {
          status: 'repariert',
          gesetz: {
            kurztitel: 'TestG',
            normgeber: 'de-bw',
            datenquelle: { name: 'Landesrecht BW' },
          },
        },
      ]);
      await warteAufSpeicherBatchAbschluss();
      expect((await ladeAlleGesetze()).map((gesetz) => gesetz.normgeber)).toEqual([
        'de-bund',
        'de-bw',
      ]);
      expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toContain('<verweis');
      expect(daten.dateien.get('gesetze/TestG_de-bw.xml')).toContain('<verweis');
      expect(
        daten.lesen.mock.calls.filter(([pfad]) => pfad === 'gesetze/TestG_de-bw.xml').length,
      ).toBeGreaterThan(2);
      expect(reload).toHaveBeenCalled();
      const gemeldeteGesetze = daten.emit.mock.calls
        .filter(([, ereignis]) => ereignis === 'gesetze-geaendert')
        .flatMap(([, , gesetze]) => gesetze as Gesetzesreferenz[]);
      expect(gemeldeteGesetze).toEqual([
        { kurztitel: 'TestG', normgeber: 'de-bund' },
        { kurztitel: 'TestG', normgeber: 'de-bw' },
      ]);
      expect(daten.banner).not.toHaveBeenCalled();
      expect(daten.invoke).toHaveBeenCalledWith('datei_sperre_erwerben', {
        relativerPfad: 'gesetze/TestG_de-bund.xml',
      });
      expect(daten.invoke).toHaveBeenCalledWith('datei_sperre_erwerben', {
        relativerPfad: 'gesetze/TestG_de-bw.xml',
      });
      expect(daten.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', {
        vorgangskennung: 'Vorgang',
      });
    } finally {
      abmelden();
    }
  });
  it('blockiert eine abweichende Zielidentität vor jedem Schreiben', async () => {
    daten.indexTitel = 'AnderesG';
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'archiviert' }]);
    expect(daten.dateien.has('gesetze/AnderesG_de-bund.xml')).toBe(false);
    expect(daten.dateien.get('gesetze/Sicherung.xml')).toBe(kaputt);
    expect(daten.sync).not.toHaveBeenCalled();
    await warteAufSpeicherBatchAbschluss();
    expect(daten.emit).toHaveBeenCalledWith({ kind: 'Any' }, 'gesetze-geaendert', [
      { kurztitel: 'TestG', normgeber: 'de-bund' },
    ]);
    expect(daten.banner).not.toHaveBeenCalled();
  });
  it('behält bei Netzausfall das Original und repariert es bei erneutem Versuch', async () => {
    daten.fetch.mockRejectedValueOnce(new TypeError('offline'));
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'verbindungsfehler' }]);
    expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toBe(kaputt);
    expect(
      daten.invoke.mock.calls.some(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
    ).toBe(false);
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'repariert' }]);
    await warteAufSpeicherBatchAbschluss();
    expect(daten.banner).not.toHaveBeenCalled();
  });
  it.each(['zip_abbruch', 'bw_webview_fehler', 'http_fehler'] as const)(
    'erhält bei ungeklärtem Downloadfehler (%s) die Datei und ermöglicht spätere Reparatur',
    async (fall) => {
      const bw = fall === 'bw_webview_fehler';
      const reparaturziel: GesetzReparaturZiel = bw
        ? { ...ziel, dateiBasis: 'TestG_de-bw', quelle: 'de-bw' }
        : ziel;
      const pfad = `gesetze/${reparaturziel.dateiBasis}.xml`;
      const original = bw
        ? '<parsererror/><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/>'
        : kaputt;
      daten.dateien.set(pfad, original);
      if (bw) {
        const invoke = daten.invoke.getMockImplementation()!;
        daten.invoke.mockImplementationOnce(invoke);
        // Vorgangsregistrierung und Gesetzsperre vor dem WebView-Aufruf.
        daten.invoke.mockImplementationOnce(invoke);
        daten.invoke.mockRejectedValueOnce('Zeitüberschreitung beim Warten auf den Tab-Link.');
      } else {
        daten.fetch.mockResolvedValueOnce({
          ok: fall !== 'http_fehler',
          arrayBuffer: async () => {
            throw new TypeError('Verbindung während ZIP-Übertragung abgebrochen');
          },
        });
      }
      expect(await repariereGesetze([reparaturziel])).toMatchObject([
        { status: 'fehler', ziel: reparaturziel, fehler: { grund: 'download' } },
      ]);
      expect(daten.dateien.get(pfad)).toBe(original);
      expect(
        daten.invoke.mock.calls.some(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
      ).toBe(false);
      await warteAufSpeicherBatchAbschluss();
      expect(daten.emit).not.toHaveBeenCalled();
      expect(await repariereGesetze([reparaturziel])).toMatchObject([{ status: 'repariert' }]);
    },
  );
  it('erhält den Reparaturerfolg nach gescheiterter Titelergänzung', async () => {
    daten.syncFehler.mockReturnValueOnce(new Error('Titel-Sync fehlgeschlagen'));
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'repariert' }]);
    expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toContain('<gesetz');
    expect(
      daten.invoke.mock.calls.some(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
    ).toBe(false);
    expect(daten.reihenfolge.filter((pfad) => pfad === 'gesetze/TestG_de-bund.xml')).toHaveLength(
      1,
    );
    // Der echte Titelsync hat den vorgegebenen Fehler tatsächlich erreicht.
    expect(daten.sync).toHaveBeenCalled();
    expect(daten.syncFehler).toHaveReturnedWith(expect.any(Error));
    expect(daten.banner).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Das Gesetz wurde gespeichert.') }),
    );
    await warteAufSpeicherBatchAbschluss();
  });
  it('verhindert Überschreiben einer während des Downloads gültig gewordenen Datei', async () => {
    const gesund =
      '<gesetz><infos><kurztitel>TestG</kurztitel><normgeber>de-bund</normgeber><langtitel>Extern repariert</langtitel><datenquelle name="Gesetze im Internet"/></infos><inhalt/></gesetz>';
    daten.fetch.mockImplementationOnce(async () => {
      daten.dateien.set('gesetze/TestG_de-bund.xml', gesund);
      const zip = zipSync({ 'testg.xml': strToU8(bundesXML) });
      return { ok: true, arrayBuffer: async () => zip.buffer };
    });
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'bereits_gueltig' }]);
    expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toBe(gesund);
    expect(daten.sync).not.toHaveBeenCalled();
    expect(daten.banner).not.toHaveBeenCalled();
  });
  it('sendet bei nicht entferntem Original keine Bestandsänderung', async () => {
    daten.indexTitel = 'AnderesG';
    daten.archivStatus = 'gesichert_aber_nicht_entfernt';
    expect(await repariereGesetze([ziel])).toMatchObject([
      { status: 'gesichert_aber_nicht_entfernt' },
    ]);
    expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toBe(kaputt);
    await warteAufSpeicherBatchAbschluss();
    expect(daten.emit).not.toHaveBeenCalled();
    expect(daten.banner).not.toHaveBeenCalled();
  });
});

describe('gemeinsame Referenzvorgänge', () => {
  it.each([
    ['unbekannt', false],
    ['unbekannt', true],
    ['fremd', false],
    ['fremd', true],
  ])(
    'importiert unbestimmten Normgeber %s auch mit Nachbereitung %s getrennt vom Bundesrecht',
    async (normgeber, nachbereitungBeiImport) => {
      daten.dateien.clear();
      daten.dateien.set(
        'cache/suchverzeichnis.json',
        JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
      );
      const xml = `<gesetz version="1"><infos><kurztitel>TestG</kurztitel>${normgeber === undefined ? '' : `<normgeber>${normgeber}</normgeber>`}</infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><text><absatz>Siehe § 2 und beachte die Regel. Weiterer Satz.</absatz></text></norm><norm><bezeichnung>§ 2</bezeichnung><text><absatz>Text.</absatz></text></norm></inhalt></gesetz>`;
      daten.dateien.set('gesetze/TestG_de-bund.xml', 'Bundesrecht bleibt erhalten');
      await expect(
        importiereGesetzDatei('kanonisch-xml', xml, {
          nachbereitungBeiImport: nachbereitungBeiImport ? 'saetze-und-verweise' : 'aus',
        }),
      ).resolves.toMatchObject({
        art: 'neu',
        kurztitel: 'TestG',
      });
      expect(daten.referenzLesen).not.toHaveBeenCalled();
      expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toBe('Bundesrecht bleibt erhalten');
      const dateiBasis = normgeber === undefined ? 'TestG_unbekannt' : `TestG_${normgeber}`;
      const gespeichert = daten.dateien.get(`gesetze/${dateiBasis}.xml`)!;
      expect(gespeichert).toBeDefined();
      expect(gespeichert.includes('<satz zahl="1">')).toBe(nachbereitungBeiImport);
      expect(gespeichert.includes('<verweis norm="§ 2">')).toBe(nachbereitungBeiImport);
      expect(
        (await ladeAlleGesetze()).find((g) =>
          istGleichesGesetz(g, { kurztitel: 'TestG', normgeber }),
        ),
      ).toMatchObject({
        kurztitel: 'TestG',
        langtitel: '',
        normgeber,
      });
    },
  );

  it.each(['', '<kurztitel/>', '<kurztitel>   </kurztitel>'])(
    'lehnt fehlenden oder leeren Kurztitel trotz vorhandenem Langtitel ab: %s',
    async (kurztitel) => {
      daten.dateien.clear();
      daten.dateien.set(
        'cache/suchverzeichnis.json',
        JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
      );
      const xml = `<gesetz><infos><langtitel>Nur Langtitel</langtitel>${kurztitel}</infos><inhalt/></gesetz>`;
      const ergebnis = await importiereGesetzDatei('kanonisch-xml', xml, {
        nachbereitungBeiImport: 'saetze-und-verweise',
      });
      expect(ergebnis).toMatchObject({
        art: 'fehler',
        fehler: { grund: 'format', meldung: expect.stringContaining('Kurztitel') },
      });
      expect([...daten.dateien.keys()]).toEqual(['cache/suchverzeichnis.json']);
      expect(daten.referenzLesen).not.toHaveBeenCalled();
    },
  );

  it('importiert und meldet einen Konflikt erneut bei XML mit ausschließlich Kurztitel', async () => {
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const xml =
      '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>Eigenes</kurztitel></infos><inhalt/></gesetz>';
    expect(await verarbeiteDateien([{ name: 'eigenes.xml', inhalt: xml }])).toMatchObject({
      berichtEintraege: [{ kategorie: 'gesetz', aktion: 'neu', name: 'Eigenes' }],
      fehler: [],
      konflikte: [],
    });
    const geaendert = xml.replace(
      '<inhalt/>',
      '<inhalt><norm><bezeichnung>§ 1</bezeichnung></norm></inhalt>',
    );
    expect(await verarbeiteDateien([{ name: 'eigenes.xml', inhalt: geaendert }])).toMatchObject({
      berichtEintraege: [],
      fehler: [],
      konflikte: [{ art: 'gesetz', neuesGesetz: { kurztitel: 'Eigenes', normgeber: 'de-bund' } }],
    });
    expect(daten.dateien.get('gesetze/Eigenes_de-bund.xml')).toBe(xml);
  });

  it('importiert mehrere lokale Quelldateien und ordnet Index-/Referenzfehler dateiweise zu', async () => {
    daten.importindexFehler = true;
    daten.referenzFehler = true;
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const ergebnis = await verarbeiteDateien([
      { name: 'de-bund.xml', inhalt: bundesXML },
      { name: 'land.html', inhalt: bwHTML.replaceAll('TestG', 'LandG') },
    ]);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.berichtEintraege.map((b) => b.meldungen?.length)).toEqual([1, 1]);
    expect(
      ergebnis.berichtEintraege.every((b) =>
        b.meldungen?.[0]?.text.includes('abweichenden Dateizuordnung'),
      ),
    ).toBe(true);
    expect(ergebnis.konflikte).toEqual([]);
    expect(ergebnis.berichtEintraege).toMatchObject([
      { kategorie: 'gesetz', aktion: 'neu', name: 'TestG' },
      { kategorie: 'gesetz', aktion: 'neu', name: 'LandG' },
    ]);
    expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toContain('<verweis');
    expect(daten.dateien.get('gesetze/LandG_de-bw.xml')).toContain('<verweis');
    expect(daten.banner).not.toHaveBeenCalled();
    expect(
      daten.invoke.mock.calls.filter(([befehl]) => befehl === 'import_aktualisierung_starten'),
    ).toHaveLength(1);
    expect(
      daten.invoke.mock.calls.filter(([befehl]) => befehl === 'import_aktualisierung_beenden'),
    ).toHaveLength(1);
  });

  it('bewahrt die Reihenfolge mit einer Indexdatei zwischen Gesetzdateien', async () => {
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const index =
      '<importindex schemaversion="1" quelle="https://www.gesetze-im-internet.de/"><erstellt>2026-10-01</erstellt></importindex>';
    const ergebnis = await verarbeiteDateien([
      { name: 'erstes.xml', inhalt: bundesXML },
      { name: 'index.xml', inhalt: index },
      { name: 'zweites.xml', inhalt: bundesXML.replaceAll('TestG', 'ZweitesG') },
    ]);
    expect(ergebnis.fehler).toEqual([]);
    expect(daten.reihenfolge).toEqual([
      'gesetze/TestG_de-bund.xml',
      'index',
      'gesetze/ZweitesG_de-bund.xml',
    ]);
    expect(ergebnis.berichtEintraege.map((eintrag) => eintrag.kategorie)).toEqual([
      'gesetz',
      'index',
      'gesetz',
    ]);
  });

  it('berichtet ungültigen Indeximport und verarbeitet die folgende Gesetzdatei', async () => {
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const ergebnis = await verarbeiteDateien([
      { name: 'index.xml', inhalt: '<importindex><ungueltig/></importindex>' },
      { name: 'gesetz.xml', inhalt: bundesXML },
    ]);
    expect(ergebnis.fehler).toEqual([
      { grund: 'unerwartet', datei: 'index.xml', detail: 'Ungültiger Index' },
    ]);
    expect(ergebnis.berichtEintraege).toMatchObject([{ kategorie: 'gesetz', aktion: 'neu' }]);
  });

  it('bewahrt bei Callbackausnahme Diagnose, ursprünglichen Fehler und Freigabe', async () => {
    daten.referenzFehler = true;
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    const ursache = new Error('Sammelcallback');
    await expect(
      mitGesetzDateiImport(async (importiereDatei) => {
        await importiereDatei('bja-xml', bundesXML);
        throw ursache;
      }),
    ).rejects.toBe(ursache);
    expect(daten.banner).toHaveBeenCalledTimes(1);
    expect(daten.invoke).toHaveBeenCalledWith('gesetz_import_sperre_freigeben', {
      kurztitel: '["de-bund","testg"]',
    });
    expect(daten.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', {
      vorgangskennung: 'Vorgang',
    });
  });

  it('verarbeitet GesetzesXML mit Nachbereitung trotz endgültigem Referenzfehler', async () => {
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    await importiereGesetzDatei('bja-xml', bundesXML);
    const xml = daten.dateien.get('gesetze/TestG_de-bund.xml')!;
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    daten.referenzFehler = true;
    await expect(
      importiereGesetzDatei('kanonisch-xml', xml, {
        nachbereitungBeiImport: 'saetze-und-verweise',
      }),
    ).resolves.toMatchObject({ art: 'neu' });
    expect(daten.banner).toHaveBeenCalledTimes(1);
    expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).toContain('<verweis');
  });

  it('erfindet bei endgültig unlesbarem Quellenindex keinen Internetdownload', async () => {
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    daten.importindexFehler = true;
    const ergebnis = await importiereGesetze(['TestG']);
    expect(ergebnis.erfolgreiche).toEqual([]);
    expect(ergebnis.fehlgeschlagene).toMatchObject([{ fehler: { grund: 'sonstiger' } }]);
    expect(daten.fetch).not.toHaveBeenCalled();
    expect(daten.invoke.mock.calls.some(([befehl]) => befehl === 'lade_gesetz_html_bw')).toBe(
      false,
    );
  });

  it('repariert trotz Hilfsreferenzfehler ohne Archivierung und mit einem Banner', async () => {
    daten.referenzFehler = true;
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'repariert' }]);
    expect(daten.banner).toHaveBeenCalledTimes(1);
    expect(
      daten.invoke.mock.calls.some(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
    ).toBe(false);
  });

  it('bündelt Referenzfehler bei Internetbatch und Aktualisierungsbatch', async () => {
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    daten.referenzFehler = true;
    const importiert = await importiereGesetze(['TestG', 'AnderesG'], 'de-bund');
    expect(importiert.erfolgreiche).toHaveLength(2);
    expect(daten.banner).toHaveBeenCalledTimes(1);
    daten.banner.mockClear();
    const ergebnis = await aktualisiereGesetze(importiert.erfolgreiche);
    expect(ergebnis.fehlgeschlagene).toEqual([]);
    expect(daten.banner).toHaveBeenCalledTimes(1);
  });
});

it('wartet nach vorzeitigem Sammelcallbackfehler auf alle gestarteten Dateiarbeiten vor Banner und Freigabe', async () => {
  daten.dateien.clear();
  daten.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  daten.referenzFehler = true;
  let fortsetzen!: () => void;
  daten.referenzWarten = new Promise<void>((resolve) => {
    fortsetzen = resolve;
  });
  const ursache = new Error('Vorzeitiger Callbackfehler');
  const vorgang = mitGesetzDateiImport(async (importiereDatei) => {
    void importiereDatei('bja-xml', bundesXML);
    void importiereDatei('html-bw', bwHTML.replaceAll('TestG', 'LandG'));
    throw ursache;
  });
  const pruefung = expect(vorgang).rejects.toBe(ursache);
  await vi.waitFor(() => expect(daten.referenzLesen).toHaveBeenCalledTimes(5));
  expect(daten.banner).not.toHaveBeenCalled();
  expect(
    daten.invoke.mock.calls.some(([befehl]) => befehl === 'import_aktualisierung_beenden'),
  ).toBe(false);
  fortsetzen();
  await pruefung;
  expect(daten.dateien.has('gesetze/TestG_de-bund.xml')).toBe(true);
  expect(daten.dateien.has('gesetze/LandG_de-bw.xml')).toBe(true);
  expect(daten.banner).toHaveBeenCalledTimes(1);
  expect(
    daten.invoke.mock.calls.filter(([befehl]) => befehl === 'gesetz_import_sperre_freigeben'),
  ).toHaveLength(2);
  expect(daten.invoke).toHaveBeenCalledWith('import_aktualisierung_beenden', {
    vorgangskennung: 'Vorgang',
  });
});

it('behält Konflikt und erfolgreiche Datei im Sammelergebnis trotz Referenzfehler richtig zugeordnet', async () => {
  daten.dateien.clear();
  daten.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  daten.referenzFehler = true;
  const ergebnis = await verarbeiteDateien([
    { name: 'erstes.xml', inhalt: bundesXML },
    { name: 'konflikt.xml', inhalt: bundesXML.replace('Es gilt', 'Weiterhin gilt') },
  ]);
  expect(ergebnis.berichtEintraege).toMatchObject([
    { kategorie: 'gesetz', aktion: 'neu', name: 'TestG' },
  ]);
  expect(ergebnis.konflikte).toMatchObject([
    { art: 'gesetz', kurztitel: 'TestG', neuesXML: expect.stringContaining('Weiterhin') },
  ]);
  expect(daten.dateien.get('gesetze/TestG_de-bund.xml')).not.toContain('Weiterhin');
  expect(ergebnis.fehler).toEqual([]);
  expect(ergebnis.berichtEintraege[0]?.meldungen).toEqual([
    expect.objectContaining({ text: expect.stringContaining('Die Erkennung') }),
  ]);
  expect(ergebnis.konflikte[0]?.meldungen).toEqual([
    expect.objectContaining({ text: expect.stringContaining('Die Erkennung') }),
  ]);
  expect(daten.banner).not.toHaveBeenCalled();
});

it.each([bundesXML, bwHTML])(
  'liefert Index- und Referenzfehler nur für die betroffene Quelldatei',
  async (inhalt) => {
    daten.dateien.clear();
    daten.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
    );
    daten.referenzFehler = true;
    daten.importindexFehler = true;
    const gesund =
      '<gesetz version="1"><infos><normgeber>unbekannt</normgeber><kurztitel>Gesund</kurztitel><langtitel>Gesund</langtitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>Gesunder Nachbar.</absatz></text></norm></inhalt></gesetz>';
    const ergebnis = await verarbeiteDateien([
      { name: 'fehlerhaft.xml', inhalt },
      { name: 'gesund.xml', inhalt: gesund },
    ]);
    expect(ergebnis.berichtEintraege).toHaveLength(2);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.berichtEintraege[0]?.meldungen).toHaveLength(1);
    expect(ergebnis.berichtEintraege[0]?.meldungen?.[0]?.text).toContain(
      'Index endgültig unlesbar',
    );
    expect(ergebnis.berichtEintraege[0]?.meldungen?.[0]?.text).toContain(
      'Referenzverzeichnis endgültig unlesbar',
    );
    expect(ergebnis.berichtEintraege[1]?.meldungen).toEqual([]);
    expect(daten.banner).not.toHaveBeenCalled();
  },
);

it('ordnet echte kanonische Nachbereitungsdiagnosen und Version der ZIP-Datei zu', async () => {
  daten.dateien.clear();
  daten.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  daten.referenzFehler = true;
  vi.stubGlobal('localStorage', { getItem: () => 'saetze-und-verweise' });
  const xml =
    '<gesetz version="9"><infos><normgeber>de-bund</normgeber><kurztitel>EigenesG</kurztitel><langtitel>Eigenes Gesetz</langtitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>Es gilt § 2 BGB.</absatz></text></norm></inhalt></gesetz>';
  const zip = zipSync({ 'Ordner/EigenesG.xml': strToU8(xml) });
  vi.mocked(readFile).mockResolvedValue(zip);
  const ergebnis = await importierePfade(['Sicherung.zip']);
  expect(ergebnis.berichtEintraege).toMatchObject([
    { aktion: 'neu', quelle: 'Sicherung.zip → Ordner/EigenesG.xml' },
  ]);
  // Die abweichende Schemaversion steht als Hinweis am übernommenen Gesetz.
  expect(ergebnis.fehler).toEqual([]);
  expect(ergebnis.berichtEintraege[0]?.meldungen).toHaveLength(2);
  expect(ergebnis.berichtEintraege[0]?.meldungen).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        grund: 'schemaversionAbweichend',
        text: expect.stringContaining('Schemaversion „9“'),
      }),
      expect.objectContaining({
        text: expect.stringContaining('Referenzverzeichnis endgültig unlesbar'),
      }),
    ]),
  );
  expect(daten.banner).not.toHaveBeenCalled();
  expect(daten.emit.mock.calls.some((aufruf) => aufruf[1] === 'schemaversion-abweichend')).toBe(
    false,
  );
});

describe('Nachbereitungsfehler im echten Dateiimportbericht', () => {
  const verweis =
    'Siehe <verweis gesetz="AltesZiel" norm="§ 9">diese Regel. Eine weitere Regel</verweis> gilt.';
  const fremd = '<besondere-auszeichnung>Erster Satz. Zweiter Satz.</besondere-auszeichnung>';
  const gesetz = (inhalt: string) =>
    `<gesetz version="1"><infos><normgeber>unbekannt</normgeber><langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>${inhalt}</absatz></text></norm><norm id="n2"><bezeichnung>§ 2</bezeichnung><text><absatz>Erster Satz. Zweiter Satz.</absatz></text></norm></inhalt></gesetz>`;

  it.each([
    ['saetze', verweis],
    ['saetze', fremd],
    ['saetze-und-verweise', fremd],
  ] as const)(
    'meldet übersprungene Normen mit %s, importiert aber weiterhin sichere Ergebnisse',
    async (modus, inhalt) => {
      vi.stubGlobal('localStorage', { getItem: () => modus });
      const xml = gesetz(inhalt);
      const ergebnis = await verarbeiteDateien([{ name: 'TestG.xml', inhalt: xml }]);
      expect(ergebnis.fehler).toMatchObject([{ grund: 'nachbereitung', datei: 'TestG.xml' }]);
      expect(ergebnis.fehler[0]?.detail).toContain('§ 1: Satzaufbau nicht möglich');
      expect(ergebnis.fehler[0]?.detail).toContain('Satzstruktur der Norm bleibt unverändert');
      expect(ergebnis.berichtEintraege).toEqual([
        {
          kategorie: 'gesetz',
          aktion: 'neu',
          name: 'TestG',
          quelle: 'TestG.xml',
          meldungen: [],
          abschluss: expect.objectContaining({ abonnieren: expect.any(Function) }),
        },
      ]);
      const gespeichert = daten.dateien.get('gesetze/TestG_unbekannt.xml')!;
      expect(gespeichert).toContain(inhalt);
      expect(gespeichert).toContain('<satz zahl="2">Zweiter Satz.</satz>');
      const wiederholt = await verarbeiteDateien([{ name: 'TestG.xml', inhalt: xml }]);
      expect(wiederholt.fehler).toEqual(ergebnis.fehler);
      expect(wiederholt.berichtEintraege).toEqual([
        { kategorie: 'gesetz', aktion: 'unveraendert', name: 'TestG', quelle: 'TestG.xml' },
      ]);
    },
  );

  it('erhält die Fehlermeldung auch bei einem noch nicht übernommenen Gesetzeskonflikt', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'saetze' });
    const alt = gesetz('Anderer Text.');
    daten.dateien.set('gesetze/TestG_unbekannt.xml', alt);
    const ergebnis = await verarbeiteDateien([{ name: 'TestG.xml', inhalt: gesetz(verweis) }]);
    expect(ergebnis.fehler).toMatchObject([{ grund: 'nachbereitung', datei: 'TestG.xml' }]);
    expect(ergebnis.fehler[0]?.detail).toContain('§ 1: Satzaufbau nicht möglich');
    expect(ergebnis.konflikte).toHaveLength(1);
    expect(daten.dateien.get('gesetze/TestG_unbekannt.xml')).toBe(alt);
  });

  it.each(['aus', 'verweise', 'saetze-und-verweise'] as const)(
    'meldet mit %s keinen übersprungenen Satzaufbau beim alten übergreifenden Verweis',
    async (modus) => {
      vi.stubGlobal('localStorage', { getItem: () => modus });
      const ergebnis = await verarbeiteDateien([{ name: 'TestG.xml', inhalt: gesetz(verweis) }]);
      expect(ergebnis.fehler).toEqual([]);
      if (modus === 'saetze-und-verweise') {
        expect(daten.dateien.get('gesetze/TestG_unbekannt.xml')).toContain(
          '<satz zahl="1">Siehe diese Regel.</satz>',
        );
      }
    },
  );
});
