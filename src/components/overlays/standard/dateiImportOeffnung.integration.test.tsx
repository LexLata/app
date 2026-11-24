import { useTabGesetzBestand } from '@/hooks/tabs/useTabGesetzBestand';
// @vitest-environment jsdom
// Echte Menü- und Dropverdrahtung über den Overlay-Host bis zum XML-/ZIP-Import,
// Einstellungenbestand, sichtbaren Bericht und Abschluss im Hintergrund.
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { io } from '@/test/einstellungen/einstellungenImportNativeAttrappe';
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import type { EventCallback } from '@tauri-apps/api/event';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import type { DragDropEvent } from '@tauri-apps/api/webview';
import { useMenueEvents } from '@/hooks/eingabe/useMenueEvents';
import { useAppAktionen } from '@/hooks/useAppAktionen';
import { useGesetzVerwaltung } from '@/hooks/tabs/useGesetzVerwaltung';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import type { AktivesOverlay, Tab } from '@/lib/domain/appTypes';
import {
  leseDateiImportZustand,
  verwerfeDateiImportErgebnis,
} from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
const nativ = vi.hoisted<{
  listener: Map<string, EventCallback<unknown>>;
  drop: EventCallback<DragDropEvent> | undefined;
}>(() => ({ listener: new Map(), drop: undefined }));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(async () => {}),
  listen: async () => () => {},
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, handler: EventCallback<unknown>) => {
      nativ.listener.set(name, handler);
      return () => nativ.listener.delete(name);
    },
    onDragDropEvent: async (handler: EventCallback<DragDropEvent>) => {
      nativ.drop = handler;
      return () => {
        nativ.drop = undefined;
      };
    },
  }),
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
let root: Root, container: HTMLDivElement;
const noop = () => {};
const steuerung: { overlay: (ziel: AktivesOverlay | null) => void } = { overlay: noop };
function Anwendung() {
  const tabsRef = useRef<Tab[]>([]),
    aktiverTabIdRef = useRef<string | null>(null);
  const [overlay, setAktivesOverlay] = useState<AktivesOverlay | null>('uebersicht');
  steuerung.overlay = setAktivesOverlay;
  const verwaltung = useGesetzVerwaltung({
    ...useTabGesetzBestand(tabsRef),
    gesetzeTabsSchliessen: noop,
  });
  const aktionen = useAppAktionen({
    uebersichtExportAktionRef: { current: null },
    tabsRef,
    aktiverTabIdRef,
    tabSchliessen: noop,
    tabWiederherstellen: noop,
    fensterSchliessen: noop,
    verlaufNavigieren: () => {},
    gesetzesreferenzOeffnen: () => noop,
    gesetzInfoInTabsPatchen: noop,
    aktivesOverlay: overlay,
    setAktivesOverlay,
  });
  useMenueEvents({
    ...aktionen,
    setAktivesOverlay,
    setOeffnenOverlayInitial: noop,
    handleFavoritSpeichern: noop,
    handleLesezeichenSpeichern: noop,
    handleAlleLesezeichenEntfernen: noop,
    handleUnterstreichen: noop,
    handleHervorheben: noop,
    handleVerweismarkierungAnfrage: noop,
    handleKommentarAnfrage: noop,
    handleMarkierungRueckgaengig: noop,
    handleMarkierungWiederholen: noop,
    erstelleLeerenTab: noop,
    tabWiederherstellen: noop,
    einfuehrungNeuStarten: noop,
    einfuehrungAktiv: false,
    einfuehrungTeilaktion: 0,
  });
  return (
    <AppOverlayHost
      {...appOverlayHostFixture({
        aktivesOverlay: overlay,
        onSchliessen: () => setAktivesOverlay(null),
        onDateienAbgelegt: aktionen.handleDateiImportStart,
        onDateiImportSchliessen: aktionen.handleDateiImportSchliessen,
        onNeuLadenNachDateiImport: verwaltung.ladeGesetzeNachDateiImport,
      })}
    />
  );
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  richteNativeEreignisgrenzeEin(io.invoke, async (name, callback) => {
    if (name === 'tauri://drag-drop') nativ.drop = callback;
    else nativ.listener.set(name, callback);
    return () => nativ.listener.delete(name);
  });
  io.dateien.clear();
  io.archive.clear();
  nativ.listener.clear();
  nativ.drop = undefined;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === 'datei_sperre_erwerben') return 'token';
      if (name === 'atomar_datei_schreiben') io.dateien.set(args.relativerPfad, args.inhalt);
      return undefined;
    },
  );
  await importierePfade([]);
  verwerfeDateiImportErgebnis();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Anwendung />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function vorbereiten(format: string, problem: string) {
  const xml =
    '<einstellungen version="1"><verarbeitungszeit>2026-10-24T00:00:00Z</verarbeitungszeit><farbschema>hell</farbschema><schriftgroesse>18</schriftgroesse></einstellungen>';
  io.dateien.set('/import/Einstellungen.xml', xml);
  io.archive.set(
    '/import/Sicherung.zip',
    zipSync({
      'Optionen/Einstellungen.xml': strToU8(xml),
      ...(problem === 'gemischt' ? { 'Defekt.xml': strToU8('<defekt/>') } : {}),
    }),
  );
  if (problem === 'teilweise') {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, wert) {
      if (key === 'lexlata.schriftgroesse') throw new Error('Wert verweigert');
      original.call(this, key, wert);
    });
  }
  if (problem === 'backup') {
    const original = io.invoke.getMockImplementation();
    if (!original) throw new Error('Native Testimplementation fehlt');
    io.invoke.mockImplementation(async (name, args) => {
      if (name === 'atomar_datei_schreiben') throw new Error('Platte voll');
      return original(name, args);
    });
  }
  if (problem === 'konflikt') localStorage.setItem('lexlata.farbschema', 'dunkel');
  return format === 'ZIP' ? '/import/Sicherung.zip' : '/import/Einstellungen.xml';
}
async function ausloesen(weg: string, pfad: string) {
  await act(async () => {
    if (weg === 'Menü') {
      io.dialog.mockResolvedValue([pfad]);
      const handler = nativ.listener.get('dateien-importieren-anfrage');
      if (!handler) throw new Error('Menülistener fehlt');
      handler({ event: 'dateien-importieren-anfrage', id: 1, payload: undefined });
    } else {
      if (!nativ.drop) throw new Error('Droplistener fehlt');
      nativ.drop({
        event: 'tauri://drag-drop',
        id: 1,
        payload: { type: 'drop', paths: [pfad], position: new PhysicalPosition(0, 0) },
      });
    }
    await vi.advanceTimersByTimeAsync(1000);
  });
}
it.each(
  ['Menü', 'Drop'].flatMap((weg) =>
    ['XML', 'ZIP'].flatMap((format) =>
      ['gesund', 'teilweise', 'backup', 'konflikt'].map((problem) => ({ weg, format, problem })),
    ),
  ),
)(
  '$weg/$format/$problem durchläuft echte Öffnung und zeigt das richtige Ergebnis',
  async ({ weg, format, problem }) => {
    const pfad = vorbereiten(format, problem);
    await ausloesen(weg, pfad);
    if (problem === 'gesund') {
      expect(container.textContent).toContain(
        weg === 'Menü' ? 'importiert' : '1 Datei erfolgreich importiert',
      );
      expect(io.dateien.get('einstellungen/einstellungen-backup.xml')).toContain(
        '<farbschema>hell</farbschema>',
      );
    } else {
      expect(container.textContent).toContain('Dateien importieren');
      // Konflikte nennen die Herkunft, Erfolge im Bericht nur den Namen.
      if (problem === 'konflikt')
        expect(container.textContent).toContain(
          format === 'ZIP' ? 'Sicherung.zip → Optionen/Einstellungen.xml' : 'Einstellungen.xml',
        );
      else expect(container.querySelector('[data-kategorie="einstellungen"]')).not.toBeNull();
      expect(container.textContent).toContain(
        problem === 'konflikt'
          ? 'Importkonflikte'
          : problem === 'teilweise'
            ? 'unvollständig übernommen'
            : 'Backup konnte nicht geschrieben werden',
      );
    }
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('Drop eines gemischten ZIP zeigt Übernahme und Fehler gemeinsam', async () => {
  await ausloesen('Drop', vorbereiten('ZIP', 'gemischt'));
  expect(container.textContent).toContain('importiert');
  expect(container.textContent).toContain('Defekt.xml');
  expect(io.dateien.get('einstellungen/einstellungen-backup.xml')).toContain(
    '<farbschema>hell</farbschema>',
  );
});
it('Menüdialog-Abbruch belässt die Übersicht ohne Fehler oder Erfolgsmeldung', async () => {
  io.dialog.mockResolvedValue(null);
  await act(async () => {
    nativ.listener.get('dateien-importieren-anfrage')?.({
      event: 'dateien-importieren-anfrage',
      id: 1,
      payload: undefined,
    });
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(container.textContent).not.toContain('Dateien importieren');
  expect(container.textContent).not.toContain('erfolgreich importiert');
  expect(io.banner).not.toHaveBeenCalled();
});

function menueAnfrage() {
  const handler = nativ.listener.get('dateien-importieren-anfrage');
  if (!handler) throw new Error('Menülistener fehlt');
  handler({ event: 'dateien-importieren-anfrage', id: 1, payload: undefined });
}
function schliessenKreuz() {
  const kreuz = container.querySelector<HTMLButtonElement>('button');
  if (!kreuz) throw new Error('Schließen-Kreuz fehlt');
  return kreuz;
}
it('P2-A3/P2-A4: Menü öffnet das Overlay sofort mit Fortschritt; Schließen und erneutes Anfragen zeigen den laufenden Import ohne Dialog', async () => {
  const xml = vorbereiten('XML', 'gesund');
  io.dateien.set('/import/Zweite.xml', '<unbekannt/>');
  let freigeben!: () => void;
  const sperre = new Promise<void>((resolve) => (freigeben = resolve));
  const original = io.invoke.getMockImplementation();
  if (!original) throw new Error('Native Testimplementation fehlt');
  io.invoke.mockImplementation(async (name, args) => {
    // Das Einstellungen-Backup der ersten Datei wartet auf die Dateisperre.
    if (name === 'datei_sperre_erwerben') await sperre;
    return original(name, args);
  });
  io.dialog.mockResolvedValue([xml, '/import/Zweite.xml']);

  await act(async () => menueAnfrage());
  await vi.waitFor(() =>
    expect(container.textContent).toContain('Datei 1 von 2 wird importiert: Einstellungen.xml'),
  );
  expect(io.dialog).toHaveBeenCalledTimes(1);

  await act(async () => schliessenKreuz().click());
  expect(container.textContent).not.toContain('Dateien importieren');
  expect(leseDateiImportZustand().art).toBe('laeuft');

  await act(async () => {
    menueAnfrage();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(io.dialog).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Datei 1 von 2 wird importiert');

  await act(async () => {
    freigeben();
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(container.textContent).toContain('Importbericht');
  expect(container.querySelector('[data-kategorie="fehler"]')?.textContent).toContain('Zweite.xml');
  expect(container.textContent).not.toContain('wird importiert');

  await act(async () => schliessenKreuz().click());
  expect(leseDateiImportZustand().art).toBe('kein');
});
it('P2-A5: Dialogabbruch öffnet kein Overlay und erzeugt keinen Zustand', async () => {
  io.dialog.mockResolvedValue(null);
  await act(async () => {
    menueAnfrage();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(container.textContent).not.toContain('Dateien importieren');
  expect(leseDateiImportZustand().art).toBe('kein');
});

/** Hält das Einstellungen-Backup der ersten Datei an der Dateisperre an. */
function sperreDateisperre() {
  let freigeben!: () => void;
  const sperre = new Promise<void>((resolve) => (freigeben = resolve));
  const original = io.invoke.getMockImplementation();
  if (!original) throw new Error('Native Testimplementation fehlt');
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'datei_sperre_erwerben') await sperre;
    return original(name, args);
  });
  return async () =>
    act(async () => {
      freigeben();
      await vi.advanceTimersByTimeAsync(1000);
    });
}
async function starteUndSchliesse(pfade: string[]) {
  io.dialog.mockResolvedValue(pfade);
  await act(async () => menueAnfrage());
  await vi.waitFor(() => expect(container.textContent).toContain('wird importiert'));
  await act(async () => schliessenKreuz().click());
  expect(container.textContent).not.toContain('Dateien importieren');
  expect(leseDateiImportZustand().art).toBe('laeuft');
}
function abgelegt(pfade: string[]) {
  if (!nativ.drop) throw new Error('Droplistener fehlt');
  nativ.drop({
    event: 'tauri://drag-drop',
    id: 1,
    payload: { type: 'drop', paths: pfade, position: new PhysicalPosition(0, 0) },
  });
}
it('P3-A1: reiner Erfolg bei geschlossenem Overlay zeigt nur das Banner', async () => {
  const freigeben = sperreDateisperre();
  await starteUndSchliesse([vorbereiten('XML', 'gesund')]);
  await freigeben();
  expect(io.banner).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      text: '1 Datei erfolgreich importiert.',
      art: 'erfolg',
    }),
  );
  expect(container.textContent).not.toContain('Dateien importieren');
  expect(leseDateiImportZustand().art).toBe('kein');
});
it('P3-A2: Fehlerzeile bei geschlossenem Overlay ohne anderes Overlay öffnet den Bericht', async () => {
  const freigeben = sperreDateisperre();
  io.dateien.set('/import/Zweite.xml', '<unbekannt/>');
  await starteUndSchliesse([vorbereiten('XML', 'gesund'), '/import/Zweite.xml']);
  await freigeben();
  expect(container.textContent).toContain('Importbericht');
  expect(container.querySelector('[data-kategorie="fehler"]')?.textContent).toContain('Zweite.xml');
  expect(io.banner).not.toHaveBeenCalled();
});
it('P3-A3: bei offener Gesetzesübersicht bleibt sie offen; „Bericht anzeigen“ öffnet den Bericht', async () => {
  const freigeben = sperreDateisperre();
  io.dateien.set('/import/Zweite.xml', '<unbekannt/>');
  await starteUndSchliesse([vorbereiten('XML', 'gesund'), '/import/Zweite.xml']);
  await act(async () => steuerung.overlay('uebersicht'));
  expect(container.textContent).toContain('Gesetze verwalten');
  await freigeben();
  expect(container.textContent).toContain('Gesetze verwalten');
  expect(container.textContent).not.toContain('Importbericht');
  expect(io.banner).toHaveBeenCalledOnce();
  const aktion: { label: string; onClick: () => void } | undefined =
    io.banner.mock.calls[0]?.[0]?.aktion;
  expect(aktion?.label).toBe('Bericht anzeigen');
  await act(async () => aktion?.onClick());
  expect(container.textContent).not.toContain('Gesetze verwalten');
  expect(container.textContent).toContain('Importbericht');
  expect(container.querySelector('[data-kategorie="fehler"]')?.textContent).toContain('Zweite.xml');
});
it('P3-A4: Ablegen öffnet sofort das Overlay mit Fortschritt; erneutes Ablegen startet keinen zweiten Import', async () => {
  const freigeben = sperreDateisperre();
  const pfad = vorbereiten('XML', 'gesund');
  io.dateien.set('/import/Zweite.xml', '<unbekannt/>');
  await act(async () => abgelegt([pfad]));
  await vi.waitFor(() =>
    expect(container.textContent).toContain('Datei 1 von 1 wird importiert: Einstellungen.xml'),
  );
  expect(container.textContent).not.toContain('Gesetze verwalten');

  await act(async () => schliessenKreuz().click());
  await act(async () => steuerung.overlay('uebersicht'));
  await act(async () => abgelegt(['/import/Zweite.xml']));
  expect(container.textContent).not.toContain('Gesetze verwalten');
  expect(container.textContent).toContain('Datei 1 von 1 wird importiert: Einstellungen.xml');

  await freigeben();
  expect(container.textContent).toContain('1 Datei erfolgreich importiert.');
  expect(container.textContent).not.toContain('Zweite.xml');
  expect(io.banner).not.toHaveBeenCalled();
});
