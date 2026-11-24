import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { MELDUNGSGRUND_HINWEIS } from '@/lib/domain/app/aktionsMeldung';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
// euErwaegungsgruende.ui.test.tsx
// Tatsächliche UI-Aufrufer, Dispatch, Download, Formex und Persistenz bis zum sichtbaren Hinweis.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { alleBannerSchliessen } from '@/lib/banner/banner.index';
import { meldeGezeigteBanner } from '@/test/banner/gezeigteBanner';
import { dateiAttrappen } from '@/test/plattform/dateiAttrappen';
import { importindexFixture } from '@/test/import/europaImportFixtures';
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  fetch: vi.fn(),
  invoke: vi.fn(),
  vormerken: vi.fn(),
  banner: vi.fn(),
  listener: new Map<string, (event: { payload: unknown }) => void>(),
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
    io.listener.set(name, callback);
    return () => io.listener.delete(name);
  },
  emitTo: async (_ziel: string, name: string, payload: unknown) => {
    io.listener.get(name)?.({ payload });
  },
}));
vi.mock('@/components/overlays/OverlayRahmen', () => ({
  OverlayRahmen: ({ children }: { children: import('react').ReactNode }) => children,
  OVERLAY_BREITE_NORMAL: 600,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () =>
  dateiAttrappen(io.dateien, async (pfad) => {
    const inhalt = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  }),
);
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';

const pruefempfaenger = { vormerken: io.vormerken, abschliessen: async () => {} };
registrierePruefpflichtigeAenderung(pruefempfaenger);
let bannerProtokollEnde: () => void = () => {};
beforeEach(() => {
  bannerProtokollEnde = meldeGezeigteBanner(io.banner);
  io.dateien.clear();
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  const index = importindexFixture(
    'eu',
    '<gesetz><kurztitel>DSGVO</kurztitel><langtitel>Verordnung</langtitel><abrufkennung>32016R0679</abrufkennung></gesetz>' +
      '<gesetz><kurztitel>Weitere DSGVO</kurztitel><langtitel>Weitere Verordnung</langtitel><abrufkennung>32004L0038</abrufkennung></gesetz>',
  );
  io.dateien.set('importindizes/eu.xml', index);
  io.dateien.set('resources/importindizes/eu.xml', index);
  io.dateien.set('resources/europa/europaKuratiert.json', '[]');
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('lexlata.nachbereitungBeiImport', 'aus');
  io.listener.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  io.vormerken.mockResolvedValue('vorgang');
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (
        name === 'import_aktualisierung_starten' ||
        name === 'import_aktualisierung_automatisch_starten'
      )
        return 'vorgang';
      if (name === 'import_aktualisierung_beenden' || name === 'gesetz_import_sperre_freigeben')
        return;
      if (name === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(io.dateien);
      if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
      if (name === 'datei_sperre_erwerben') return 'token';
      if (name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        io.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      throw new Error(`Unerwarteter Aufruf: ${name}`);
    },
  );
});

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach } from 'vitest';
import { useOeffnenAuswahl } from '@/hooks/useOeffnenAuswahl';
import { useHintergrundAktualisierung } from '@/hooks/useHintergrundAktualisierung';
import { AktualisierenOverlay } from './AktualisierenOverlay';
import { parseSuchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { importiereGesetze } from '@/lib/import/import.index';
import { warteAufSpeicherBatchAbschluss } from '@/lib/persistenz/gesetz/gesetz.index';
import * as importAPI from '@/lib/import/import.index';
const eintrag = {
  kurztitel: 'DSGVO',
  langtitel: 'Verordnung',
  abrufkennung: '32016R0679',
  normgeber: 'eu',
};
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
afterEach(async () => {
  bannerProtokollEnde();
  alleBannerSchliessen();
  await warteAufSpeicherBatchAbschluss();
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function mockDownload(originalFehler: boolean) {
  io.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/sparql?'))
      return Response.json({
        results: {
          bindings: [{ kons: { value: '02016R0679-20160504' }, datum: { value: '2016-05-04' } }],
        },
      });
    const original = decodeURIComponent(url).endsWith('/32016R0679');
    if (original && originalFehler) throw new TypeError('Failed to fetch');
    const datei = original ? '32016R0679' : '02016R0679-20160504';
    return new Response(
      new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${datei}.fmx4`)),
      { headers: { 'content-type': 'application/zip' } },
    );
  });
}
async function mount(element: import('react').ReactNode) {
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root!.render(element));
}
async function bestand() {
  mockDownload(false);
  const ergebnis = await importiereGesetze(
    [{ kurztitel: eintrag.kurztitel, abrufkennung: eintrag.abrufkennung }],
    'eu',
  );
  const gesetz = ergebnis.erfolgreiche[0];
  if (!gesetz) throw new Error(JSON.stringify(ergebnis));
  io.dateien.set(
    'markierungen/DSGVO_eu-markierungen.xml',
    '<markierungen version="1"><infos><gesetz normgeber="eu">DSGVO</gesetz><verarbeitungszeit>2026-10-21T00:00:00Z</verarbeitungszeit></infos><inhalt><kommentar><bezeichnung>E1</bezeichnung><kommentartext>Kommentar zu E1</kommentartext></kommentar></inhalt></markierungen>',
  );
  io.dateien.set(
    'markierungskonflikte.xml',
    '<markierungskonflikte version="1" pruefstatus="aktuell"><gesetz kurztitel="DSGVO" normgeber="eu"><kommentar><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>E1</bezeichnung><kommentartext>Kommentar zu E1</kommentartext></kommentar></gesetz></markierungskonflikte>',
  );
  await warteAufSpeicherBatchAbschluss();
  io.vormerken.mockClear();
  io.banner.mockClear();
  mockDownload(true);
  return gesetz;
}
/** Fehlerbanner: DSGVO in der Gruppe „keine Verbindung“ (Erwägungsgründe). */
function dsgvoOhneVerbindung() {
  return expect.objectContaining({
    typ: 'fehler',
    gliederung: expect.objectContaining({
      kategorien: expect.arrayContaining([
        expect.objectContaining({
          gruppen: [
            expect.objectContaining({
              schluessel: 'keineVerbindung',
              namen: [expect.objectContaining({ name: 'DSGVO' })],
            }),
          ],
        }),
      ]),
    }),
    text: expect.stringContaining('Erwägungsgründe konnten nicht geladen werden'),
  });
}
it('zeigt nach erfolgreichem Gesetzimport über das Öffnen-Overlay die Ergänzungswarnung', async () => {
  mockDownload(true);
  let auswaehlen!: ReturnType<typeof useOeffnenAuswahl>;
  function Ansicht() {
    auswaehlen = useOeffnenAuswahl();
    return null;
  }
  await mount(createElement(Ansicht));
  let ergebnis;
  await act(async () => {
    ergebnis = await auswaehlen({ art: 'index', quelle: 'eu', eintrag }, parseSuchanfrage('DSGVO'));
  });
  expect(ergebnis).toMatchObject({
    gesetz: gesetzesreferenz({ kurztitel: 'DSGVO', normgeber: 'eu' }),
  });
  expect(io.dateien.has('gesetze/DSGVO_eu.xml')).toBe(true);
  expect(io.banner).toHaveBeenCalledWith(
    expect.objectContaining({
      typ: 'warnung',
      gliederung: expect.objectContaining({
        kategorien: [
          expect.objectContaining({
            gruppen: [
              expect.objectContaining({
                namen: [
                  {
                    name: 'DSGVO',
                    hinweise: [MELDUNGSGRUND_HINWEIS.euOhneErwaegungsgruende],
                  },
                ],
              }),
            ],
          }),
        ],
      }),
    }),
  );
});
it('Einzelaktualisierung zeigt Ergänzungsfehler und erhält Gesetz sowie Nutzerdaten bytegleich', async () => {
  const gesetz = await bestand();
  const vorher = new Map(io.dateien);
  await mount(
    createElement(AktualisierenOverlay, {
      gesetze: alsSuchverzeichniseintraege([gesetz]),
      onSchliessen: vi.fn(),
      onInfoAktualisiert: vi.fn(),
    }),
  );
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Aktualisieren',
  )!;
  await act(async () => {
    button.click();
  });
  expect(container.textContent).toContain('Erwägungsgründe konnten nicht geladen werden');
  expect(container.textContent).toContain('Bestehende Fassung wurde beibehalten');
  expect(io.dateien).toEqual(vorher);
  expect(io.vormerken).not.toHaveBeenCalled();
});
function weiteresGesetzVorbereiten() {
  // Zweites Gesetz (im Importindex mit 32004L0038) hat eigene Erwägungsgründe: sein Original wird nicht benötigt.
  const vorherigerDownload = io.fetch.getMockImplementation()!;
  io.fetch.mockImplementation(async (url: string, ...args: unknown[]) => {
    if (url.includes('/sparql?') && decodeURIComponent(url).includes('32004L0038'))
      return Response.json({ results: { bindings: [] } });
    if (decodeURIComponent(url).endsWith('/32004L0038'))
      return new Response(
        new Uint8Array(readFileSync('src/lib/import/eu/testdaten/formex/02004L0038-20110616.fmx4')),
        { headers: { 'content-type': 'application/zip' } },
      );
    return vorherigerDownload(url, ...args);
  });
}
it('Sammelaktualisierung bündelt benannte Fehler, zählt die Fehlerzeile und führt anderes Gesetz fort', async () => {
  const gesetz = await bestand();
  const anderes = { ...gesetz, kurztitel: 'Weitere DSGVO' };
  const info = vi.fn();
  weiteresGesetzVorbereiten();
  const batch = vi.spyOn(importAPI, 'aktualisiereGesetze');
  await mount(
    createElement(AktualisierenOverlay, {
      gesetze: alsSuchverzeichniseintraege([gesetz, anderes]),
      onSchliessen: vi.fn(),
      onInfoAktualisiert: info,
    }),
  );
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Alle aktualisieren',
  )!;
  await act(async () => {
    button.click();
  });
  expect(container.textContent).toContain('Bestehende Fassung wurde beibehalten');
  expect(container.textContent).toContain('✓ Aktualisiert');
  expect(io.dateien.has('gesetze/Weitere DSGVO_eu.xml')).toBe(true);
  expect(io.banner).toHaveBeenCalledWith(dsgvoOhneVerbindung());
  expect(info).toHaveBeenCalled();
  expect((await batch.mock.results[0]!.value).fehlgeschlagene).toHaveLength(1);
});
it('Hintergrundaktualisierung zeigt den benannten Fehler nach Abschluss im Banner', async () => {
  const gesetz = await bestand();
  await warteAufSpeicherBatchAbschluss();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

  localStorage.setItem('lexlata.autoAktualisierungsIntervall', 'taeglich');
  const anderes = {
    ...gesetz,
    kurztitel: 'Weitere DSGVO',
    verarbeitungszeit: new Date('2020-01-01'),
  };
  weiteresGesetzVorbereiten();
  const automatisch = vi.spyOn(importAPI, 'aktualisiereGesetzeAutomatisch');
  function Ansicht() {
    useHintergrundAktualisierung({
      startAbgeschlossen: true,
      gesetze: alsSuchverzeichniseintraege([
        { ...gesetz, verarbeitungszeit: new Date('2020-01-01') },
        anderes,
      ]),
      onInfoAktualisiert: vi.fn(),
    });
    return null;
  }
  await mount(createElement(Ansicht));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  await vi.waitFor(() => expect(automatisch).toHaveBeenCalled());
  let abgeschlossen = false;
  void automatisch.mock.results[0]?.value.then(async () => {
    await warteAufSpeicherBatchAbschluss();
    abgeschlossen = true;
  });
  await vi.waitFor(() => expect(abgeschlossen).toBe(true));
  vi.useRealTimers();
  await vi.waitFor(() => expect(io.banner).toHaveBeenCalledWith(dsgvoOhneVerbindung()));
  expect(io.dateien.has('gesetze/Weitere DSGVO_eu.xml')).toBe(true);
  const ergebnis = await automatisch.mock.results[0]!.value;
  expect(ergebnis.art).toBe('ausgefuehrt');
  if (ergebnis.art === 'ausgefuehrt') {
    expect(ergebnis.ergebnis.fehlgeschlagene).toHaveLength(1);
    expect(ergebnis.ergebnis.aktualisierteReferenzen).toHaveLength(1);
  }
});
