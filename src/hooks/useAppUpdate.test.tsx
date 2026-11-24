// @vitest-environment jsdom
// Prüft das Update-Banner eines Hauptfensters gegen gemeldeten Zustand, Menüereignis
// und den Startzeitpunkt der automatischen Updateprüfung.
import { ausstehendesPromise } from '@/test/plattform/ausstehendesPromise';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { alleBannerSchliessen, bannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import type {
  AppUpdateInstallationsergebnis,
  AppUpdatePruefergebnis,
  AppUpdateZustand,
} from '@/lib/domain/app/appUpdate';
import { useAppUpdate } from './useAppUpdate';

const nativ = vi.hoisted(() => ({
  invoke: vi.fn(),
  listener: new Map<string, (event: { payload: unknown }) => void>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
      nativ.listener.set(name, callback);
      return () => nativ.listener.delete(name);
    },
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '1.0.0' }));

const dom = domTestWurzel();
let bestehenderZustand: AppUpdateZustand;
let pruefergebnis: AppUpdatePruefergebnis;
let startaufgabenFortschritt: number;
let installationsergebnis: AppUpdateInstallationsergebnis;
let abfrage: (() => Promise<number>) | undefined;
let folge: number;

beforeEach(() => {
  bestehenderZustand = { art: 'ruhe' };
  folge = 0;
  pruefergebnis = { ergebnis: 'aktuell' };
  startaufgabenFortschritt = 5;
  abfrage = undefined;
  installationsergebnis = 'abbruch';
  localStorage.clear();
  nativ.listener.clear();
  nativ.invoke.mockReset().mockImplementation(async (name: string) => {
    if (name === 'app_update_zustand') return { ...bestehenderZustand, folge: 0 };
    if (name === 'app_update_pruefen') return pruefergebnis;
    if (name === 'app_update_installieren') return installationsergebnis;
    if (name === 'startaufgaben_fortschritt') return abfrage?.() ?? startaufgabenFortschritt;
    return undefined;
  });
});
afterEach(() => {
  alleBannerSchliessen();
  vi.useRealTimers();
});

interface Start {
  startAbgeschlossen?: boolean;
  gesetzaktualisierungBeendet?: boolean;
}
function Fenster({ startAbgeschlossen = false, gesetzaktualisierungBeendet = false }: Start) {
  useAppUpdate({ startAbgeschlossen, gesetzaktualisierungBeendet });
  return null;
}
async function mounten(start: Start = {}) {
  await act(async () => dom.root.render(<Fenster {...start} />));
}
function ausloesen(name: string, payload: unknown) {
  const listener = nativ.listener.get(name);
  if (!listener) throw new Error(`Kein Listener für ${name}`);
  listener({ payload });
}
async function melden(zustand: AppUpdateZustand, reihenfolge = ++folge) {
  await act(async () => ausloesen('app-update-zustand', { ...zustand, folge: reihenfolge }));
}
async function menueWaehlen() {
  await act(async () => ausloesen('nach-updates-suchen-anfrage', undefined));
}
const verfuegbar = (ausgeblendet = false): AppUpdateZustand => ({
  art: 'verfuegbar',
  version: '1.2.3',
  installierbar: true,
  ausgeblendet,
});
const banner = () => getSnapshot().map(({ art, text, typ }) => ({ art, text, typ }));
const updateBanner = () => {
  const [einziges, ...weitere] = getSnapshot();
  if (!einziges || weitere.length) throw new Error('Genau ein Banner erwartet');
  return { id: einziges.id, text: einziges.text, typ: einziges.typ, knopf: einziges.aktion?.label };
};
async function knopfDruecken() {
  const aktion = getSnapshot()[0]?.aktion;
  if (!aktion) throw new Error('Banner ohne Knopf');
  await act(async () => aktion.onClick());
}

it('zeigt ein gemeldetes Update an und entfernt es, sobald es ausgeblendet ist', async () => {
  await mounten();
  expect(banner()).toEqual([]);
  await melden(verfuegbar());
  expect(banner()).toEqual([
    { art: 'vorgangsfortschritt', text: 'LexLata 1.2.3 ist verfügbar.', typ: 'info' },
  ]);
  await melden({ art: 'pruefung' });
  expect(banner()).toHaveLength(1);
  await melden(verfuegbar(true));
  expect(banner()).toEqual([]);
  expect(nativ.invoke).not.toHaveBeenCalledWith('app_update_ausblenden');
});

it('übernimmt beim späteren Öffnen eines Fensters das bestehende Angebot', async () => {
  bestehenderZustand = verfuegbar();
  await mounten();
  expect(banner()).toEqual([
    { art: 'vorgangsfortschritt', text: 'LexLata 1.2.3 ist verfügbar.', typ: 'info' },
  ]);
});

it('blendet das Update in allen Hauptfenstern aus, wenn der Nutzer das Banner schließt', async () => {
  await mounten();
  await melden(verfuegbar());
  const [updateBanner] = getSnapshot();
  if (!updateBanner) throw new Error('Update-Banner fehlt');
  await act(async () => bannerSchliessen(updateBanner.id));
  expect(nativ.invoke).toHaveBeenCalledWith('app_update_ausblenden');
});

it('meldet nach manueller Prüfung ohne Fund den aktuellen Stand', async () => {
  await mounten();
  await menueWaehlen();
  expect(nativ.invoke).toHaveBeenCalledWith('app_update_pruefen', { anlass: 'manuell' });
  await vi.waitFor(() =>
    expect(banner()).toEqual([
      { art: 'erfolg', text: 'LexLata ist auf dem neuesten Stand (1.0.0).', typ: 'info' },
    ]),
  );
});

it('meldet eine bereits laufende Suche nur im auslösenden Fenster', async () => {
  pruefergebnis = { ergebnis: 'laeuftBereits', laufenderVorgang: 'pruefung' };
  await mounten();
  await menueWaehlen();
  expect(banner()).toEqual([
    { art: 'bedienhinweis', text: 'Die Suche nach Updates läuft bereits.', typ: 'info' },
  ]);
});

it('zeigt bei laufendem Download das Update-Banner ohne Suchhinweis', async () => {
  pruefergebnis = { ergebnis: 'laeuftBereits', laufenderVorgang: 'herunterladen' };
  await mounten();
  await melden({ art: 'herunterladen', version: '1.2.3', prozent: 50, ausgeblendet: true });
  await menueWaehlen();
  await melden({ art: 'herunterladen', version: '1.2.3', prozent: 50, ausgeblendet: false });
  expect(banner()).toEqual([
    { art: 'vorgangsfortschritt', text: 'LexLata 1.2.3 wird heruntergeladen … 50 %', typ: 'info' },
  ]);
});

it('behält den abgeschlossenen Download bei einer verspäteten Wiedereinblendung', async () => {
  await mounten();
  await melden({ art: 'bereit', version: '1.2.3', ausgeblendet: false }, 3);
  await melden({ art: 'herunterladen', version: '1.2.3', prozent: 95, ausgeblendet: false }, 2);
  expect(updateBanner().knopf).toBe('Jetzt neu starten');
});

it('weist nach „Jetzt neu starten“ auf eine bereits laufende Beenden-Anfrage hin', async () => {
  installationsergebnis = 'beendenLaeuftBereits';
  await mounten();
  await melden({ art: 'bereit', version: '1.2.3', ausgeblendet: false });
  await knopfDruecken();
  expect(banner()).toContainEqual({
    art: 'bedienhinweis',
    text: 'LexLata wartet bereits auf das Beenden. Bitte zuerst die offene Rückfrage beantworten.',
    typ: 'info',
  });
});

it('meldet einen Fehler der manuellen Prüfung mit verständlichem Grund; das Detail nur in der Konsole', async () => {
  const konsole = vi.spyOn(console, 'error').mockImplementation(() => {});
  pruefergebnis = { ergebnis: 'fehler', grund: 'keineVerbindung', detail: 'error sending request' };
  await mounten();
  await menueWaehlen();
  await vi.waitFor(() =>
    expect(banner()).toEqual([
      {
        art: 'bedienhinweis',
        text: 'Die Suche nach Updates ist fehlgeschlagen (keine Verbindung).',
        typ: 'fehler',
      },
    ]),
  );
  expect(konsole).toHaveBeenCalledWith(expect.any(String), 'error sending request');

  alleBannerSchliessen();
  pruefergebnis = { ergebnis: 'fehler', grund: 'sonstiges', detail: 'ReleaseNotFound' };
  await menueWaehlen();
  await vi.waitFor(() =>
    expect(banner()).toEqual([
      { art: 'bedienhinweis', text: 'Die Suche nach Updates ist fehlgeschlagen.', typ: 'fehler' },
    ]),
  );
  konsole.mockRestore();
});

it('zeigt bei einem Fund nur das Update-Banner aus dem gemeldeten Zustand', async () => {
  pruefergebnis = { ergebnis: 'gefunden' };
  await mounten();
  await menueWaehlen();
  await melden(verfuegbar());
  expect(banner()).toEqual([
    { art: 'vorgangsfortschritt', text: 'LexLata 1.2.3 ist verfügbar.', typ: 'info' },
  ]);
});

const STUNDE = 60 * 60 * 1000;
const automatischeAnfragen = () =>
  nativ.invoke.mock.calls.filter(
    ([name, argumente]) =>
      name === 'app_update_pruefen' && JSON.stringify(argumente) === '{"anlass":"automatisch"}',
  ).length;
async function zeit(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const fertig: Start = { startAbgeschlossen: true, gesetzaktualisierungBeendet: true };

it('fragt erst nach Fensterstart, allen Startaufgaben und erster Gesetzaktualisierung genau einmal an', async () => {
  vi.useFakeTimers();
  startaufgabenFortschritt = 4;
  await mounten();
  await mounten({ startAbgeschlossen: true });
  await mounten({ gesetzaktualisierungBeendet: true });
  await mounten(fertig);
  expect(automatischeAnfragen()).toBe(0);

  // Die letzte gemeinsame Startaufgabe schließt ein anderes Fenster ab.
  startaufgabenFortschritt = 5;
  await act(async () => ausloesen('startaufgaben-verfuegbar', undefined));
  expect(nativ.invoke).toHaveBeenCalledWith('app_update_pruefen', { anlass: 'automatisch' });
  expect(automatischeAnfragen()).toBe(1);

  await act(async () => ausloesen('startaufgaben-verfuegbar', undefined));
  await mounten({ ...fertig });
  await zeit(STUNDE - 1);
  expect(automatischeAnfragen()).toBe(1);
  await zeit(1);
  expect(automatischeAnfragen()).toBe(2);
});

it('fasst Startereignisse während der Fortschrittsabfrage zu einer erneuten Abfrage zusammen', async () => {
  const ersterFortschritt = ausstehendesPromise<number>();
  const fortschritt = vi
    .fn()
    .mockImplementationOnce(() => ersterFortschritt.promise)
    .mockResolvedValue(5);
  abfrage = fortschritt;
  await mounten(fertig);
  expect(fortschritt).toHaveBeenCalledOnce();
  await act(async () => {
    ausloesen('startaufgaben-verfuegbar', undefined);
    ausloesen('startaufgaben-verfuegbar', undefined);
  });
  expect(fortschritt).toHaveBeenCalledOnce();
  expect(automatischeAnfragen()).toBe(0);

  await act(async () => ersterFortschritt.resolve(4));
  expect(fortschritt).toHaveBeenCalledTimes(2);
  expect(automatischeAnfragen()).toBe(1);
});

it('fragt ohne Gesetzaktualisierungsabschluss auch im Stundentakt nicht an', async () => {
  vi.useFakeTimers();
  await mounten({ startAbgeschlossen: true });
  await zeit(3 * STUNDE);
  expect(automatischeAnfragen()).toBe(0);
});

it('fragt bei abgeschalteter Einstellung nicht an; eine Änderung wirkt ab dem nächsten Takt', async () => {
  vi.useFakeTimers();
  localStorage.setItem('lexlata.appUpdatesAutomatischSuchen', 'false');
  await mounten(fertig);
  await zeit(STUNDE);
  expect(automatischeAnfragen()).toBe(0);

  localStorage.setItem('lexlata.appUpdatesAutomatischSuchen', 'true');
  await zeit(STUNDE);
  expect(automatischeAnfragen()).toBe(1);

  localStorage.setItem('lexlata.appUpdatesAutomatischSuchen', 'false');
  await zeit(STUNDE);
  expect(automatischeAnfragen()).toBe(1);
});

it('zeigt einen automatischen Fund über den gemeldeten Zustand, aber keinen Fehler und keinen aktuellen Stand', async () => {
  pruefergebnis = { ergebnis: 'fehler', detail: 'keine Verbindung' };
  const konsole = vi.spyOn(console, 'error').mockImplementation(() => {});
  await mounten(fertig);
  await vi.waitFor(() => expect(automatischeAnfragen()).toBe(1));
  expect(banner()).toEqual([]);
  expect(konsole).toHaveBeenCalled();
  konsole.mockRestore();

  pruefergebnis = { ergebnis: 'aktuell' };
  await act(async () => dom.root.render(null));
  await mounten(fertig);
  await vi.waitFor(() => expect(automatischeAnfragen()).toBe(2));
  expect(banner()).toEqual([]);

  // Rust meldet den Fund allen Hauptfenstern; jedes zeigt daraufhin das Banner.
  await melden(verfuegbar());
  expect(banner()).toEqual([
    { art: 'vorgangsfortschritt', text: 'LexLata 1.2.3 ist verfügbar.', typ: 'info' },
  ]);
});

it('führt vom Angebot über den Download-Fortschritt zum Neustart', async () => {
  await mounten();
  await melden(verfuegbar());
  expect(updateBanner()).toMatchObject({
    text: 'LexLata 1.2.3 ist verfügbar.',
    typ: 'info',
    knopf: 'Herunterladen',
  });
  const { id } = updateBanner();

  await knopfDruecken();
  expect(nativ.invoke).toHaveBeenCalledWith('app_update_herunterladen');

  await melden({ art: 'herunterladen', version: '1.2.3', prozent: null, ausgeblendet: false });
  expect(updateBanner()).toEqual({
    id,
    text: 'LexLata 1.2.3 wird heruntergeladen …',
    typ: 'info',
    knopf: undefined,
  });
  for (const prozent of [5, 50, 100]) {
    await melden({ art: 'herunterladen', version: '1.2.3', prozent, ausgeblendet: false });
    // Derselbe Banner wird fortgeschrieben, kein neuer angelegt.
    expect(updateBanner()).toEqual({
      id,
      text: `LexLata 1.2.3 wird heruntergeladen … ${prozent} %`,
      typ: 'info',
      knopf: undefined,
    });
  }

  await melden({ art: 'bereit', version: '1.2.3', ausgeblendet: false });
  expect(updateBanner()).toEqual({
    id,
    text: 'LexLata 1.2.3 ist bereit. LexLata wird zum Installieren neu gestartet.',
    typ: 'info',
    knopf: 'Jetzt neu starten',
  });
  expect(nativ.invoke).not.toHaveBeenCalledWith('app_update_installieren');
  await knopfDruecken();
  expect(nativ.invoke).toHaveBeenCalledWith('app_update_installieren');
});

it('sperrt den Knopf, bis der Befehl zurückkehrt', async () => {
  let freigeben = () => {};
  nativ.invoke.mockImplementation(async (name: string) => {
    if (name === 'app_update_zustand')
      return { art: 'bereit', version: '1.2.3', ausgeblendet: false, folge: 0 };
    if (name === 'app_update_installieren') {
      await new Promise<void>((resolve) => (freigeben = resolve));
    }
    return undefined;
  });
  await mounten();
  await knopfDruecken();
  expect(getSnapshot()[0]?.laedt).toBe(true);
  // Bricht ein Fenster das Schließen ab, kehrt der Befehl zurück und der Knopf wird wieder bedienbar.
  await act(async () => freigeben());
  await vi.waitFor(() => expect(getSnapshot()[0]?.laedt).toBe(false));
  expect(updateBanner().knopf).toBe('Jetzt neu starten');
});

it('zeigt Download-Fehler mit „Erneut versuchen“; bei ungültiger Signatur eigener Text', async () => {
  const konsole = vi.spyOn(console, 'error').mockImplementation(() => {});
  await mounten();
  await melden({
    art: 'fehler',
    version: '1.2.3',
    grund: 'signatur',
    detail: 'minisign error',
    ausgeblendet: false,
  });
  expect(updateBanner()).toMatchObject({
    text: 'Das heruntergeladene Update ist nicht gültig signiert und wurde verworfen.',
    typ: 'fehler',
    knopf: 'Erneut versuchen',
  });
  expect(konsole).toHaveBeenCalledWith(expect.any(String), 'minisign error');
  await knopfDruecken();
  expect(nativ.invoke).toHaveBeenCalledWith('app_update_herunterladen');

  await melden({
    art: 'fehler',
    version: '1.2.3',
    grund: 'keineVerbindung',
    detail: 'connect',
    ausgeblendet: false,
  });
  expect(updateBanner()).toMatchObject({
    text: 'Das Update auf LexLata 1.2.3 ist fehlgeschlagen (keine Verbindung).',
    typ: 'fehler',
    knopf: 'Erneut versuchen',
  });
  await melden({
    art: 'fehler',
    version: '1.2.3',
    grund: 'sonstiges',
    detail: 'x',
    ausgeblendet: false,
  });
  expect(updateBanner().text).toBe('Das Update auf LexLata 1.2.3 ist fehlgeschlagen.');

  expect(konsole).toHaveBeenCalledTimes(1);

  // Ein neuer Download-Versuch setzt den Banner auf Fortschritt zurück.
  await melden({ art: 'herunterladen', version: '1.2.3', prozent: 0, ausgeblendet: false });
  expect(updateBanner()).toMatchObject({ typ: 'info', knopf: undefined });
  konsole.mockRestore();
});

it('bietet bei deb/rpm statt des Downloads die Release-Seite an', async () => {
  await mounten();
  await melden({ art: 'verfuegbar', version: '1.2.3', installierbar: false, ausgeblendet: false });
  expect(updateBanner()).toMatchObject({
    text: 'LexLata 1.2.3 ist verfügbar.',
    knopf: 'Release-Seite öffnen',
  });
  await knopfDruecken();
  expect(nativ.invoke).toHaveBeenCalledWith('app_update_release_seite_oeffnen');
  expect(nativ.invoke).not.toHaveBeenCalledWith('app_update_herunterladen');
});

it('meldet, wenn die Release-Seite nicht geöffnet werden kann', async () => {
  const konsole = vi.spyOn(console, 'error').mockImplementation(() => {});
  nativ.invoke.mockImplementation(async (name: string) => {
    if (name === 'app_update_zustand') return { ...verfuegbar(), installierbar: false, folge: 0 };
    if (name === 'app_update_release_seite_oeffnen') throw new Error('kein Browser');
    return undefined;
  });
  await mounten();
  await vi.waitFor(() => expect(getSnapshot()).toHaveLength(1));
  await knopfDruecken();
  await vi.waitFor(() =>
    expect(banner()).toContainEqual({
      art: 'bedienhinweis',
      text: 'Die Release-Seite konnte nicht geöffnet werden.',
      typ: 'fehler',
    }),
  );
  konsole.mockRestore();
});

it('entfernt das Banner in jeder Stufe, sobald Rust es als ausgeblendet meldet', async () => {
  await mounten();
  await melden({ art: 'bereit', version: '1.2.3', ausgeblendet: false });
  expect(getSnapshot()).toHaveLength(1);
  await melden({ art: 'bereit', version: '1.2.3', ausgeblendet: true });
  expect(getSnapshot()).toEqual([]);
  await melden({ art: 'herunterladen', version: '1.2.3', prozent: 3, ausgeblendet: true });
  expect(getSnapshot()).toEqual([]);
});
