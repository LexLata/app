// markierungsFensterNativeAttrappe.ts
// Gemeinsame native Grenzen für echte Kommentar- und Verweisformularintegration.
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { emitTo } from '@tauri-apps/api/event';
import { expect, vi } from 'vitest';
import { act } from 'react';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import type { MarkierungsAktion } from '@/lib/markierungen/markierungen.index';

type SchliessenHandler = (event: { preventDefault(): void }) => Promise<void>;

const native = vi.hoisted(() => {
  const schliessanfrage: { handler?: SchliessenHandler } = {};
  return {
    schliessschutz: false,
    schliessanfrage,
    destroy: vi.fn(),
    label: 'kommentar-1',
    dateien: new Map<string, string>(),
    invoke: vi.fn(),
    lesen: vi.fn(),
    vormerken: vi.fn(),
    abschliessen: vi.fn(),
    close: vi.fn(),
    banner: vi.fn(),
    // Echter Bannerspeicher für Tests, die den Empfang im Hauptfenster nachbilden.
    echterBanner: vi.fn<(typeof import('@/lib/banner/banner.index'))['zeigeBanner']>(),
    bannerHost: vi.fn(),
    hinweise: vi.fn(),
    kontext: null as unknown,
    bestaetigen: true,
    empfang: new Map<string, (event: { payload: unknown }) => void>(),
    historie: new Map<string, MarkierungsAktion>(),
  };
});
// Die native Fensterübergabe liefert den Kontext als JSON; die echte Eingangskontrolle prüft ihn.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (befehl: string, args?: unknown) =>
    befehl === 'kommentar_kontext_abholen' || befehl === 'verweismarkierung_kontext_abholen'
      ? Promise.resolve(native.kontext === null ? null : JSON.stringify(native.kontext))
      : native.invoke(befehl, args),
  isTauri: () => native.schliessschutz,
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  return dateiAttrappen(native.dateien, native.lesen);
});
vi.mock('@tauri-apps/api/event', () => ({
  listen: async () => () => {},
  emitTo: async (
    ziel: unknown,
    name: string,
    payload: { kennung: string; aktion: MarkierungsAktion },
  ) => {
    if (name !== 'markierung-historie-uebertragen') return;
    expect(ziel).toBe('fenster-1');
    native.historie.set(payload.kennung, payload.aktion);
    if (native.bestaetigen)
      native.empfang.get('markierung-historie-bestaetigt')?.({
        payload: { kennung: payload.kennung, empfaengerLabel: 'fenster-1' },
      });
  },
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
      native.empfang.set(name, callback);
      return () => native.empfang.delete(name);
    },
  }),
}));
vi.mock('@tauri-apps/api/window', async () => {
  const { LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize } =
    await import('@tauri-apps/api/dpi');
  return {
    LogicalPosition,
    LogicalSize,
    currentMonitor: async () => null,
    getCurrentWindow: () => ({
      close: native.close,
      destroy: native.destroy,
      label: native.label,
      setSize: async () => {},
      setPosition: async () => {},
      scaleFactor: async () => 1,
      innerSize: async () => new PhysicalSize(420, 200),
      outerSize: async () => new PhysicalSize(420, 200),
      outerPosition: async () => new PhysicalPosition(0, 0),
      onMoved: async () => () => {},
      onCloseRequested: async (handler: SchliessenHandler) => {
        native.schliessanfrage.handler = handler;
        return () => {
          native.schliessanfrage.handler = undefined;
        };
      },
    }),
  };
});
vi.mock('@/lib/banner/banner.index', async (original) => {
  const echt = await original<typeof import('@/lib/banner/banner.index')>();
  native.echterBanner.mockImplementation(echt.zeigeBanner);
  return { ...echt, zeigeBanner: native.banner };
});
vi.mock('@/components/hauptfenster/BannerHost', () => ({
  BannerHost: () => {
    native.bannerHost();
    return null;
  },
}));
vi.mock('@/hooks/fenster/useFensterSichtbarMachen', () => ({ useFensterSichtbarMachen: vi.fn() }));
vi.mock('@/hooks/einstellungen/useAppAkzentfarbe', () => ({ useAppAkzentfarbe: vi.fn() }));
vi.mock('@/hooks/fenster/useSchliessenAnfrageSchliesstFenster', () => ({
  useSchliessenAnfrageSchliesstFenster: vi.fn(),
}));
const kanal = { vormerken: native.vormerken, abschliessen: native.abschliessen };

export function markierungsFensterNativeAttrappe<Kontext>() {
  return native as Omit<typeof native, 'kontext'> & { kontext: Kontext | null };
}

export async function warteAufMarkierungsAnzeige(pruefen: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {});
    pruefen();
  });
}

export function halteFensterHinweisAn() {
  let meldeBeginn = () => {};
  let annehmen = () => {};
  const begonnen = new Promise<void>((resolve) => {
    meldeBeginn = resolve;
  });
  const annahme = new Promise<void>((resolve) => {
    annehmen = resolve;
  });
  native.hinweise.mockImplementation(() => {
    meldeBeginn();
    return annahme;
  });
  return { begonnen, annehmen };
}

export function markierungsFensterBedienung(host: () => HTMLElement) {
  return {
    warteAufAnzeige: warteAufMarkierungsAnzeige,
    warteAufAbschluss: async () => {
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(
          native.close.mock.calls.length > 0 ||
            host().querySelector('textarea')?.disabled === false,
        ).toBe(true);
      });
    },
    feld: () => {
      const feld = host().querySelector('textarea');
      if (!feld) throw Error('Formular fehlt');
      return feld;
    },
    knopf: (text: string) =>
      [...host().querySelectorAll('button')].find((button) => button.textContent === text)!,
    schreibaufrufe: () =>
      native.invoke.mock.calls.filter(
        ([befehl, args]) =>
          befehl === 'atomar_datei_schreiben' && !args.relativerPfad.startsWith('cache/'),
      ),
    hinweise: () =>
      native.invoke.mock.calls
        .filter(([befehl]) => befehl === 'hauptfenster_hinweis_senden')
        .map(([, daten]) => daten),
  };
}

export function bereiteMarkierungsFensterDateienVor() {
  native.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  richteNativeEreignisgrenzeEin(
    async (befehl, args) => {
      if (befehl === 'plugin:path|resolve_directory') return args?.path ?? '/daten';
      if (befehl === 'plugin:path|join')
        return Array.isArray(args?.paths) ? args.paths.map(String).join('/') : '';
      if (befehl === 'plugin:fs|read_text_file')
        return new TextEncoder().encode(await native.lesen(String(args?.path)));
      if (befehl === 'plugin:fs|exists')
        return native.dateien.has(String(args?.path).replace('/daten/LexLata/', ''));
      if (befehl === 'plugin:fs|mkdir') return;
      if (befehl === 'plugin:fs|read_dir') {
        const pfad = String(args?.path).replace('/daten/LexLata/', '') + '/';
        return [...native.dateien.keys()]
          .filter((name) => name.startsWith(pfad))
          .map((name) => ({ name: name.slice(pfad.length), isDirectory: false, isFile: true }));
      }
      return native.invoke(befehl, args);
    },
    async (name, empfangen) => {
      native.empfang.set(name, (event) =>
        Reflect.apply(empfangen, undefined, [{ event: name, id: 0, payload: event.payload }]),
      );
      return () => native.empfang.delete(name);
    },
    async (_befehl, args) => {
      const ziel = args?.target;
      const label = typeof ziel === 'object' && ziel && 'label' in ziel ? ziel.label : ziel;
      await emitTo(String(label), String(args?.event), args?.payload);
    },
    native.label,
  );
  native.dateien.set('resources/europa/europaKuratiert.json', '[]');
  native.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>BGB</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  registrierePruefpflichtigeAenderung(kanal);
  native.vormerken.mockResolvedValue('v1');
  native.abschliessen.mockResolvedValue(undefined);
  native.close.mockResolvedValue(undefined);
  native.hinweise.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  native.lesen.mockImplementation(async (pfad: string) => {
    const inhalt = native.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Fehlt');
    return inhalt;
  });
  native.invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; inhalt: string; hinweis: unknown }) => {
      if (befehl === 'gesetz_dateistempel_lesen')
        return [...native.dateien.entries()]
          .filter(([pfad]) => pfad.startsWith('gesetze/') && pfad.endsWith('.xml'))
          .map(([pfad, inhalt]) => ({
            name: pfad.slice(8),
            dateistempel: { groesse: String(inhalt.length), aenderungszeit: '1' },
          }));
      if (befehl === 'datei_sperre_erwerben') return args.relativerPfad;
      if (befehl === 'datei_sperre_freigeben' || befehl === 'datei_sperre_unterbrechen') return;
      if (befehl === 'datei_sperre_fortsetzen') return true;
      if (befehl === 'atomar_datei_schreiben') {
        native.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (befehl === 'archiviere_beschaedigte_datei') {
        native.dateien.set('kopie', native.dateien.get(args.relativerPfad) ?? '');
        native.dateien.delete(args.relativerPfad);
        return { status: 'archiviert', sicherungspfad: 'kopie' };
      }
      if (befehl === 'hauptfenster_hinweis_senden') return native.hinweise(args.hinweis);
      throw new Error(befehl);
    },
  );
}

// Native Prüfverwaltung für Folgelauftests: Ein Fehler erlaubt genau eine
// Heilung; erst eine abgeschlossene Vollprüfung setzt das Budget zurück.
export function bereiteMarkierungsFensterPruefverwaltungVor() {
  const stand = {
    vollbedarf: false,
    wiederholung: 'kein-fehler' as 'kein-fehler' | 'offen' | 'verbraucht',
  };
  const nativ = native.invoke.getMockImplementation();
  if (!nativ) throw Error('Native Prüfverwaltung fehlt');
  native.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'pruefvorgang_registrieren') return 'quelle';
    if (befehl === 'pruefvorgang_vollbedarf') stand.vollbedarf = true;
    if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
      const uebernommen = stand.vollbedarf && stand.wiederholung === 'offen';
      if (uebernommen) stand.wiederholung = 'verbraucht';
      return uebernommen;
    }
    // Wie die native Verwaltung: ein Fehler eröffnet genau eine Heilung;
    // erst eine abgeschlossene Vollprüfung gibt ein neues Budget frei.
    if (befehl === 'pruefvorgang_fehler') {
      stand.vollbedarf = true;
      if (stand.wiederholung !== 'verbraucht') stand.wiederholung = 'offen';
    }
    if (befehl === 'pruefvorgang_vollpruefung_abschliessen') {
      stand.vollbedarf = false;
      stand.wiederholung = 'kein-fehler';
    }
    if (befehl.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: stand.vollbedarf };
    return nativ(befehl, args);
  });
  return stand;
}
