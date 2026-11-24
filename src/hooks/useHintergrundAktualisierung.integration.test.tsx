import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
// Automatik über öffentliche Importoperationen mit nativen Datei-/Netz-/Koordinationsattrappen.
import { act, useState } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { dateiAttrappen } from '@/test/plattform/dateiAttrappen';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import * as importAPI from '@/lib/import/import.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { alleBannerSchliessen, bannerDauerMs, getSnapshot } from '@/lib/banner/banner.index';
import { useHintergrundAktualisierung } from './useHintergrundAktualisierung';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  lesen: vi.fn(),
  fetch: vi.fn(),
  invoke: vi.fn(),
  emit: vi.fn(),
  registriert: false,
  listener: new Map<string, Set<(ereignis: { payload: unknown }) => void>>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
// Erreichbarkeitsvorabprüfung (Teilliste) beantwortet das Netz-Double selbst; io.fetch zählt nur Gesetzesabrufe.
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (url: string, ...rest: unknown[]) =>
    url.endsWith('/Teilliste_A.html')
      ? Promise.resolve(new Response(null))
      : io.fetch(url, ...rest),
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => dateiAttrappen(io.dateien, io.lesen));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, callback: (ereignis: { payload: unknown }) => void) => {
    const menge = io.listener.get(name) ?? new Set();
    menge.add(callback);
    io.listener.set(name, menge);
    return () => menge.delete(callback);
  },
  emitTo: io.emit,
}));
const dom = domTestWurzel();
const JETZT = new Date('2026-11-04T12:00:00Z');
const ALT = new Date('2026-10-01T12:00:00Z');
const STUNDE = 3_600_000;
const WOCHE = 7 * 24 * STUNDE;
const grundgesetz: GesetzDarstellung = {
  kurztitel: 'TestG',
  normgeber: 'de-bund',
  langtitel: 'Testgesetz',
  elemente: [],
  hatGliederungsartikel: false,
  verarbeitungszeit: ALT,
};
const bundesXML =
  '<dokumente doknr="G001"><norm doknr="G001"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue></metadaten></norm><norm doknr="N001"><metadaten><enbez>§ 1</enbez><titel>Anwendung</titel></metadaten><textdaten><text><Content><P>Ein Satz.</P></Content></text></textdaten></norm></dokumente>';
const index = importindexFixture(
  'de-bund',
  '<gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>testg</abrufkennung></gesetz>',
);
const befehle = (name: string) => io.invoke.mock.calls.filter(([befehl]) => befehl === name);
const indexLesen = () =>
  io.lesen.mock.calls.filter(([pfad]) => pfad.endsWith('/importindizes/de-bund.xml')).length;
function Ansicht({
  gesetze,
  startAbgeschlossen = true,
  info = () => {},
}: {
  gesetze: GesetzDarstellung[];
  startAbgeschlossen?: boolean;
  info?: (gesetze: GesetzDarstellung[]) => void;
}) {
  const [bestand, setBestand] = useState(gesetze);
  useHintergrundAktualisierung({
    startAbgeschlossen,
    gesetze: alsSuchverzeichniseintraege(bestand),
    onInfoAktualisiert: (aktualisierte) => {
      info(aktualisierte);
      setBestand((vorher) =>
        vorher.map(
          (gesetz) => aktualisierte.find((g) => g.kurztitel === gesetz.kurztitel) ?? gesetz,
        ),
      );
    },
  });
  return null;
}
async function zeit(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function mount(gesetze: GesetzDarstellung[]) {
  await act(async () => dom.root.render(<Ansicht gesetze={gesetze} />));
  await zeit(10_000);
}
async function bestand() {
  vi.setSystemTime(ALT);
  const importiert = await importAPI.importiereGesetze(['TestG'], 'de-bund');
  expect(importiert.fehlgeschlagene).toEqual([]);
  await vi.advanceTimersByTimeAsync(200); // Erstimport-Broadcast vor der eigentlichen Prüfung abschließen.
  vi.setSystemTime(JETZT);
  io.invoke.mockClear();
  io.fetch.mockClear();
  io.lesen.mockClear();
  io.emit.mockClear();
  const gesetz = importiert.erfolgreiche[0];
  if (!gesetz) throw new Error('Erstimport lieferte kein Gesetz.');
  return gesetz;
}
const pruefEmpfaenger = { vormerken: async () => 'pruefung', abschliessen: async () => {} };
beforeEach(async () => {
  await import('@tauri-apps/api/event'); // Externe Ereignisattrappe vor parallelen Fenstern laden.
  vi.useFakeTimers();
  vi.setSystemTime(JETZT);
  vi.clearAllMocks();
  io.dateien.clear();
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  io.listener.clear();
  io.registriert = false;
  alleBannerSchliessen();
  localStorage.clear();
  localStorage.setItem('lexlata.autoAktualisierungIntervall', 'woechentlich');
  localStorage.setItem('lexlata.nachbereitungBeiImport', 'aus');
  registrierePruefpflichtigeAenderung(pruefEmpfaenger);
  io.lesen.mockImplementation(async (pfad: string) => {
    if (pfad.endsWith('/importindizes/de-bund.xml')) return index;
    if (pfad.endsWith('europaKuratiert.json')) return '[]';
    const inhalt = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error(`Datei fehlt: ${pfad}`);
    return inhalt;
  });
  const zip = zipSync({ 'testg.xml': strToU8(bundesXML) });
  io.fetch.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => zip.buffer }));
  io.emit.mockImplementation(async (_ziel: string, name: string, payload: unknown) => {
    io.listener.get(name)?.forEach((fn) => fn({ payload }));
  });
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === 'import_aktualisierung_automatisch_starten') {
        if (io.registriert) return null;
        io.registriert = true;
        return 'automatisch';
      }
      if (name === 'import_aktualisierung_starten') {
        if (io.registriert) throw new Error('Verschachtelte Registrierung');
        return 'manuell';
      }
      if (name === 'import_aktualisierung_beenden') {
        io.registriert = false;
        return;
      }
      if (name === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(io.dateien);
      if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
      if (name === 'datei_sperre_erwerben') return 'token';
      if (name === 'gesetz_import_sperre_freigeben' || name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        io.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      throw new Error(`Unerwarteter nativer Aufruf: ${name}`);
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

it('nennt das automatisch aktualisierte Gesetz ohne doppelte Einleitung', async () => {
  const gesetz = await bestand();
  const zip = zipSync({
    'testg.xml': strToU8(bundesXML.replace('Ein Satz.', 'Ein neuer Satz.')),
  });
  io.fetch.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => zip.buffer }));
  await mount([gesetz]);
  expect(getSnapshot()).toEqual([
    expect.objectContaining({ text: 'TestG automatisch aktualisiert.' }),
  ]);
});

it('P2-A5: zeigt reinen Erfolg als Erfolgsbanner für 5 s', async () => {
  const gesetz = await bestand();
  const zip = zipSync({
    'testg.xml': strToU8(bundesXML.replace('Ein Satz.', 'Ein neuer Satz.')),
  });
  io.fetch.mockImplementation(async () => ({ ok: true, arrayBuffer: async () => zip.buffer }));
  await mount([gesetz]);
  expect(getSnapshot().map((b) => [b.art, bannerDauerMs(b)])).toEqual([['erfolg', 5000]]);
});

it('P2-A5: fasst Erfolg und Fehler eines Laufs in einem bleibenden, gegliederten Banner zusammen', async () => {
  const zweitXML = bundesXML.replaceAll('TestG', 'ZweitG').replace('Testgesetz', 'Zweitgesetz');
  const doppelIndex = importindexFixture(
    'de-bund',
    '<gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>testg</abrufkennung></gesetz>' +
      '<gesetz><kurztitel>ZweitG</kurztitel><langtitel>Zweitgesetz</langtitel><abrufkennung>zweitg</abrufkennung></gesetz>',
  );
  const vorher = io.lesen.getMockImplementation();
  io.lesen.mockImplementation(async (pfad: string) =>
    pfad.endsWith('/importindizes/de-bund.xml') ? doppelIndex : vorher?.(pfad),
  );
  const zips = {
    testg: zipSync({ 'testg.xml': strToU8(bundesXML) }),
    zweitg: zipSync({ 'zweitg.xml': strToU8(zweitXML) }),
  };
  io.fetch.mockImplementation(async (url: string) => ({
    ok: true,
    arrayBuffer: async () => (url.includes('zweitg') ? zips.zweitg : zips.testg).buffer,
  }));
  vi.setSystemTime(ALT);
  const importiert = await importAPI.importiereGesetze(['TestG', 'ZweitG'], 'de-bund');
  expect(importiert.fehlgeschlagene).toEqual([]);
  await vi.advanceTimersByTimeAsync(200);
  vi.setSystemTime(JETZT);
  alleBannerSchliessen();
  const neu = zipSync({ 'testg.xml': strToU8(bundesXML.replace('Ein Satz.', 'Ein neuer Satz.')) });
  io.fetch.mockImplementation(async (url: string) =>
    url.includes('zweitg')
      ? { ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) }
      : { ok: true, arrayBuffer: async () => neu.buffer },
  );
  await mount(importiert.erfolgreiche);
  const banner = getSnapshot();
  expect(banner).toHaveLength(1);
  expect(banner.map((b) => [b.art, bannerDauerMs(b)])).toEqual([['vorgangsergebnis', undefined]]);
  const kategorien = banner[0]?.gliederung?.kategorien ?? [];
  expect(kategorien.map((k) => k.schluessel)).toEqual(['gesetze', 'fehler']);
  expect(kategorien.flatMap((k) => k.gruppen.flatMap((g) => g.namen.map((n) => n.name)))).toEqual([
    'TestG',
    'ZweitG',
  ]);
});

it('aktualisiert wöchentlich nur das fällige indexierte Gesetz und lässt MKH/MKN ohne Meldung und Prüfzeit', async () => {
  const gesetz = await bestand();
  const mKH = { ...gesetz, kurztitel: 'MKH' };
  const mKN = { ...gesetz, kurztitel: 'MKN', verarbeitungszeit: undefined };
  const frisch = { ...gesetz, kurztitel: 'Frisch', verarbeitungszeit: JETZT };
  const aufruf = vi.spyOn(importAPI, 'aktualisiereGesetzeAutomatisch');
  const gesetze = [gesetz, mKH, mKN, frisch];
  await act(async () => dom.root.render(<Ansicht gesetze={gesetze} startAbgeschlossen={false} />));
  await zeit(STUNDE);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(0);
  expect(indexLesen()).toBe(0);
  expect(io.fetch).not.toHaveBeenCalled();
  await act(async () => dom.root.render(<Ansicht gesetze={gesetze} startAbgeschlossen />));
  await zeit(9_999);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(0);
  expect(indexLesen()).toBe(0);
  expect(io.fetch).not.toHaveBeenCalled();
  await zeit(1);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(1);
  expect(indexLesen()).toBeGreaterThan(0);
  const ergebnis: Awaited<ReturnType<typeof importAPI.aktualisiereGesetzeAutomatisch>> =
    await aufruf.mock.results.at(0)?.value;
  expect(aufruf.mock.calls.at(0)?.[0]).toEqual(alsSuchverzeichniseintraege([gesetz, mKH, mKN]));
  expect(io.fetch).toHaveBeenCalledTimes(1);
  expect(io.fetch.mock.calls.at(0)?.[0]).toBe('https://www.gesetze-im-internet.de/testg/xml.zip');
  expect(ergebnis).toMatchObject({
    art: 'ausgefuehrt',
    ergebnis: {
      fehlgeschlagene: [],
      aktualisierteReferenzen: [],
      unveraenderteGesetze: [{ kurztitel: 'TestG' }],
    },
  });
  expect(getSnapshot()).toEqual([]);
  expect(mKH.verarbeitungszeit).toEqual(ALT);
  expect(mKN.verarbeitungszeit).toBeUndefined();
  io.lesen.mockClear();
  await zeit(STUNDE - 10_000);
  expect(indexLesen()).toBeGreaterThan(0); // MKH/MKN bleiben fällig, das bestätigte Gesetz nicht.
  expect(io.fetch).toHaveBeenCalledTimes(1);
  expect(getSnapshot()).toEqual([]);
  await zeit(WOCHE);
  expect(io.fetch).toHaveBeenCalledTimes(2);
});
it('registriert und liest ohne fällige Gesetze weder zuerst noch stündlich oder bei Bestandsereignissen', async () => {
  await mount([{ ...grundgesetz, verarbeitungszeit: JETZT }]);
  await zeit(STUNDE);
  io.listener.get('gesetze-geaendert')?.forEach((fn) => fn({ payload: {} }));
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(0);
  expect(io.lesen).not.toHaveBeenCalled();
  expect(io.fetch).not.toHaveBeenCalled();
});
it('prüft auch ein nie geprüftes Gesetz und erneuert ohne Indexeintrag keine Prüfzeit', async () => {
  await mount([{ ...grundgesetz, kurztitel: 'MKH', verarbeitungszeit: undefined }]);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(1);
  expect(indexLesen()).toBeGreaterThan(0);
  expect(io.fetch).not.toHaveBeenCalled();
  expect(befehle('atomar_datei_schreiben')).toHaveLength(0);
});
it('meldet einen unlesbaren Index einmal je Fenster dauerhaft und ohne Broadcast', async () => {
  io.lesen.mockRejectedValue(new Error('defekt'));
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  await mount([grundgesetz]);
  await zeit(2 * STUNDE);
  expect(getSnapshot()).toEqual([
    expect.objectContaining({
      typ: 'fehler',
      art: 'systemfehler',
      text: 'Automatische Aktualisierung nicht möglich: Der Importindex konnte nicht gelesen werden.',
    }),
  ]);
  expect(protokoll).toHaveBeenCalled();
  expect(io.emit).not.toHaveBeenCalled();
  expect(io.fetch).not.toHaveBeenCalled();
  expect(io.registriert).toBe(false);
  await act(async () => dom.root.render(null));
  await mount([grundgesetz]);
  expect(getSnapshot()).toHaveLength(2);
});
it('hält die Registrierung während des verzögerten Indexlesens und stellt weitere Fenster und Auslöser ohne Arbeit zurück', async () => {
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const lesen = io.lesen.getMockImplementation();
  if (!lesen) throw new Error('Dateiattrappe ist nicht vorbereitet.');
  io.lesen.mockImplementation(async (pfad: string) => {
    await warten;
    return lesen(pfad);
  });
  await act(async () =>
    dom.root.render(
      <>
        <Ansicht gesetze={[grundgesetz]} />
        <Ansicht gesetze={[grundgesetz]} />
      </>,
    ),
  );
  await zeit(10_000);
  expect(io.registriert).toBe(true);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(2);
  expect(io.lesen).toHaveBeenCalledTimes(1);
  expect(io.fetch).not.toHaveBeenCalled();
  await zeit(STUNDE);
  expect(io.lesen).toHaveBeenCalledTimes(1);
  await act(async () => {
    freigeben();
  });
  // Den echten dynamischen Quellenimport bis zum Abschluss abwarten.
  await act(async () => {
    await vi.waitFor(() => expect(io.registriert).toBe(false));
  });
  const anzahl = befehle('import_aktualisierung_automatisch_starten').length;
  await zeit(1_000);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(anzahl);
  expect(io.fetch).toHaveBeenCalledTimes(1);
  expect(befehle('import_aktualisierung_starten')).toHaveLength(0);
});
it.each(['unlesbar', 'leer', 'quellenfehler'] as const)(
  'gibt nach %s frei und erlaubt einen späteren Lauf ohne verschachtelte Registrierung',
  async (fall) => {
    if (fall === 'unlesbar') io.lesen.mockRejectedValue(new Error('defekt'));
    if (fall === 'quellenfehler') io.fetch.mockRejectedValue(new Error('Netz fehlt'));
    const meldung = vi.fn();
    const gesetze = [{ ...grundgesetz, kurztitel: fall === 'leer' ? 'MKH' : 'TestG' }];
    const erstes = await importAPI.aktualisiereGesetzeAutomatisch(
      alsSuchverzeichniseintraege(gesetze),
      meldung,
    );
    expect(io.registriert).toBe(false);
    if (fall === 'unlesbar') expect(erstes).toEqual({ art: 'importindexNichtLesbar' });
    if (fall === 'leer') {
      expect(erstes).toEqual({
        art: 'ausgefuehrt',
        ergebnis: {
          aktualisierteReferenzen: [],
          unveraenderteGesetze: [],
          fehlgeschlagene: [],
          nachricht: null,
        },
      });
      expect(io.fetch).not.toHaveBeenCalled();
      expect(meldung).not.toHaveBeenCalled();
    }
    if (fall === 'quellenfehler')
      expect(erstes).toMatchObject({
        art: 'ausgefuehrt',
        ergebnis: {
          fehlgeschlagene: [
            { gesetz: { kurztitel: grundgesetz.kurztitel, normgeber: grundgesetz.normgeber } },
          ],
        },
      });
    await importAPI.aktualisiereGesetzeAutomatisch(alsSuchverzeichniseintraege(gesetze), meldung);
    expect(befehle('import_aktualisierung_beenden')).toHaveLength(2);
    expect(befehle('import_aktualisierung_starten')).toHaveLength(0);
  },
);
it('übernimmt unveränderte Prüfzeiten nur lokal: ein offenes zweites Fenster wiederholt später, ein neues liest den gespeicherten Stand', async () => {
  const gesetz = await bestand();
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const lesen = io.lesen.getMockImplementation();
  if (!lesen) throw new Error('Dateiattrappe ist nicht vorbereitet.');
  io.lesen.mockImplementationOnce(async (pfad: string) => {
    await warten;
    return lesen(pfad);
  });
  await act(async () =>
    dom.root.render(
      <>
        <Ansicht gesetze={[gesetz]} />
        <Ansicht gesetze={[gesetz]} />
      </>,
    ),
  );
  await zeit(10_000);
  await act(async () => {
    freigeben();
  });
  await act(async () => {
    await vi.waitFor(() => expect(io.registriert).toBe(false));
  });
  expect(io.fetch).toHaveBeenCalledTimes(1);
  expect(io.emit.mock.calls.some(([, name]) => name === 'gesetze-geaendert')).toBe(false);
  await zeit(STUNDE - 10_000);
  expect(io.fetch).toHaveBeenCalledTimes(2);
  const gespeichert = await ladeAlleGesetze();
  expect(gespeichert.at(0)?.verarbeitungszeit?.getTime()).toBeGreaterThanOrEqual(JETZT.getTime());
  await act(async () => dom.root.render(null));
  io.lesen.mockClear();
  io.invoke.mockClear();
  await mount(gespeichert);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(0);
  expect(indexLesen()).toBe(0);
  expect(io.fetch).toHaveBeenCalledTimes(2);

  // Ein weiteres neu geöffnetes Fenster prüft die dauerhaft fälligen Nichtindexgesetze.
  await act(async () => dom.root.render(null));
  const mKH = { ...gesetz, kurztitel: 'MKH' };
  const mKN = { ...gesetz, kurztitel: 'MKN', verarbeitungszeit: undefined };
  const dateienVorher = new Map(io.dateien);
  io.lesen.mockClear();
  io.invoke.mockClear();
  await mount([...gespeichert, mKH, mKN]);
  expect(befehle('import_aktualisierung_automatisch_starten')).toHaveLength(1);
  expect(indexLesen()).toBeGreaterThan(0);
  expect(io.fetch).toHaveBeenCalledTimes(2);
  expect(befehle('atomar_datei_schreiben')).toHaveLength(0);
  expect(io.dateien).toEqual(dateienVorher);
  expect(mKH.verarbeitungszeit).toEqual(ALT);
  expect(mKN.verarbeitungszeit).toBeUndefined();
  expect(getSnapshot()).toEqual([]);
});
