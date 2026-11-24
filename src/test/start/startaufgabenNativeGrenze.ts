// Fenstergetrennte native Grenzen; Dateispeicher, Startaufgaben und Markierungsprüfung laufen echt.
import { vi } from 'vitest';
import { richteNativeEreignisgrenzeEin } from './nativeEreignisgrenze';

type Auftrag = { kennung: number; schritt: number };
type Anmeldung = { label: string; anmeldung: string };
export function startaufgabenGrenze() {
  localStorage.clear();
  const dateien = new Map<string, string>();
  const quellen = new Set<string>();
  const pruefungen = new Set<string>();
  let vollbedarf = false;
  let nummer = 0;
  function aktualisiereVorgang(name: string, id: string) {
    if (name === 'pruefvorgang_quelle_abschliessen' && quellen.delete(id)) pruefungen.add(id);
    if (name === 'pruefvorgang_teilpruefung_abschliessen') pruefungen.delete(id);
    if (name === 'pruefvorgang_abbrechen') quellen.delete(id);
    if (name === 'pruefvorgang_fehler') {
      quellen.delete(id);
      pruefungen.delete(id);
      vollbedarf = true;
    }
  }
  function pruefvorgang(name: string, args: Record<string, unknown>) {
    if (name === 'pruefvorgang_registrieren') {
      const id = `v-${++nummer}`;
      quellen.add(id);
      return id;
    }
    if (name === 'pruefvorgang_wiederholung_uebernehmen') return false;
    for (const id of Array.isArray(args.vorgaenge) ? args.vorgaenge : [])
      aktualisiereVorgang(name, id);
    if (name === 'pruefvorgang_vollbedarf') vollbedarf = true;
    if (name === 'pruefvorgang_vollpruefung_abschliessen') {
      pruefungen.clear();
      vollbedarf = false;
    }
    return { offeneQuellen: quellen.size, offenePruefungen: pruefungen.size, vollbedarf };
  }
  const native = async (name: string, args: Record<string, unknown>) => {
    if (name === 'interne_navigation_anzeigen') return false;
    if (name === 'fenster_menu_status_aktualisieren') return;
    if (name === 'datei_sperre_erwerben') return `token-${++nummer}`;
    if (name === 'datei_sperre_freigeben' || name === 'datei_sperre_unterbrechen') return;
    if (name === 'datei_sperre_fortsetzen') return true;
    if (name === 'atomar_datei_schreiben') {
      dateien.set(String(args.relativerPfad), String(args.inhalt));
      return;
    }
    if (name === 'app_daten_loeschen') {
      dateien.delete(String(args.relativerPfad));
      return;
    }
    if (name === 'archiviere_beschaedigte_datei') {
      const pfad = String(args.relativerPfad);
      dateien.set(pfad + '.sicherung', String(args.erwarteterInhalt));
      dateien.delete(pfad);
      return { status: 'archiviert', sicherungspfad: pfad + '.sicherung' };
    }
    if (name.startsWith('pruefvorgang_')) return pruefvorgang(name, args);
    throw new Error(`Unerwarteter nativer Aufruf: ${name}`);
  };
  const anmeldungen: Anmeldung[] = [];
  const listener = new Map<string, Map<string, Set<(event: { payload: unknown }) => void>>>();
  const protokoll: Array<{ label: string; name: string; pfad?: string; schritt?: number }> = [];
  let besitzer: Anmeldung | undefined;
  let kennung = 0;
  let schritt = 0;
  let vorLesen: (label: string, pfad: string) => Promise<void> | undefined = () => undefined;
  let vorBefehl: (label: string, name: string, pfad: string) => Promise<void> | undefined = () =>
    undefined;
  let vorListener: (label: string, name: string) => Promise<void> | undefined = () => undefined;
  let anzeigen: (label: string) => Promise<void> = () => Promise.resolve();
  const relativ = (pfad: string) => pfad.replace('/daten/LexLata/', '');
  richteNativeEreignisgrenzeEin(
    async (name, args) => native(name, args ?? {}),
    async (name, callback) => {
      let gruppe = listener.get('*');
      if (!gruppe) {
        gruppe = new Map();
        listener.set('*', gruppe);
      }
      const menge = gruppe.get(name) ?? new Set();
      const empfangen = (event: { payload: unknown }) =>
        callback({ event: name, id: 1, payload: event.payload });
      menge.add(empfangen);
      gruppe.set(name, menge);
      return () => {
        menge.delete(empfangen);
      };
    },
    async (_name, args) => {
      for (const gruppe of listener.values())
        for (const empfangen of gruppe.get(String(args?.event)) ?? [])
          empfangen({ payload: args?.payload });
    },
  );
  function waehlen() {
    if (!besitzer && schritt < 5) {
      besitzer = anmeldungen[0];
      kennung++;
    }
  }
  function wecken() {
    for (const a of anmeldungen)
      for (const empfangen of listener.get(a.label)?.get('startaufgaben-verfuegbar') ?? [])
        empfangen({ payload: undefined });
  }
  function entfernen(label: string, anmeldung?: string) {
    const passt = (a: Anmeldung) => a.label === label && (!anmeldung || a.anmeldung === anmeldung);
    for (let i = anmeldungen.length - 1; i >= 0; i--) {
      const eintrag = anmeldungen[i];
      if (eintrag && passt(eintrag)) anmeldungen.splice(i, 1);
    }
    if (besitzer && passt(besitzer)) {
      besitzer = undefined;
      waehlen();
    }
    wecken();
  }
  function auftrag(label: string, anmeldung: unknown): Auftrag | null {
    return besitzer?.label === label && besitzer.anmeldung === anmeldung && schritt < 5
      ? { kennung, schritt }
      : null;
  }
  async function kontext(label: string) {
    vi.resetModules();
    vi.doMock('@tauri-apps/api/path', () => ({
      localDataDir: async () => '/daten',
      join: async (...teile: string[]) => teile.join('/'),
      resolveResource: async (pfad: string) => pfad,
      downloadDir: async () => '/export',
      dirname: async () => '/export',
    }));
    vi.doMock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
    vi.doMock('@tauri-apps/plugin-dialog', () => ({
      save: async () => null,
      confirm: async () => true,
    }));
    const registrieren = async (name: string, handler: (event: { payload: unknown }) => void) => {
      await vorListener(label, name);
      let fenster = listener.get(label);
      if (!fenster) {
        fenster = new Map();
        listener.set(label, fenster);
      }
      const menge = fenster.get(name) ?? new Set();
      menge.add(handler);
      fenster.set(name, menge);
      return () => {
        menge.delete(handler);
      };
    };
    vi.doMock('@tauri-apps/api/core', () => ({
      isTauri: () => true,
      invoke: async (name: string, args: Record<string, unknown> = {}) => {
        protokoll.push({ label, name, pfad: String(args.relativerPfad ?? ''), schritt });
        await vorBefehl(label, name, String(args.relativerPfad ?? ''));
        if (name === 'startaufgaben_anmelden') {
          anmeldungen.push({ label, anmeldung: String(args.anmeldung) });
          waehlen();
          return auftrag(label, args.anmeldung);
        }
        if (name === 'startaufgaben_lesen') {
          const antwort = auftrag(label, args.anmeldung);
          protokoll.push({ label, name: 'startaufgaben_lesen_abgeschlossen', schritt });
          return antwort;
        }
        if (name === 'startaufgaben_fortschritt') return schritt;
        if (name === 'startaufgaben_abmelden') {
          entfernen(label, String(args.anmeldung));
          return;
        }
        if (name === 'startaufgaben_abschliessen') {
          if (
            !auftrag(label, args.anmeldung) ||
            args.kennung !== kennung ||
            args.schritt !== schritt
          )
            return null;
          schritt++;
          wecken();
          return auftrag(label, args.anmeldung);
        }
        if (name === 'gesetz_dateistempel_lesen')
          return [...dateien]
            .filter(([p]) => p.startsWith('gesetze/') && p.endsWith('.xml'))
            .map(([p, xml]) => ({
              name: p.slice(8),
              dateistempel: { groesse: String(xml.length), aenderungszeit: '1' },
            }));
        if (name === 'tab_uebertragung_abholen') return null;
        if (name === 'letzter_tab_anfrage_lesen') return false;
        if (name === 'fenster_alle_positionen') return [];
        if (name === 'plugin:event|listen') return 1;
        if (name === 'plugin:event|unlisten') return;
        return native?.(name, args);
      },
    }));
    vi.doMock('@tauri-apps/api/window', () => ({
      getCurrentWindow: () => ({
        label,
        show: () => anzeigen(label),
        hide: async () => {},
        listen: registrieren,
        onCloseRequested: async () => () => {},
        onResized: async () => () => {},
        onMoved: async () => () => {},
        isFullscreen: async () => true,
        setPosition: async () => {},
        setSize: async () => {},
        unmaximize: async () => {},
        center: async () => {},
      }),
    }));
    vi.doMock('@tauri-apps/api/webview', () => ({
      getCurrentWebview: () => ({ label, listen: registrieren }),
    }));
    vi.doMock('@tauri-apps/api/event', () => ({
      listen: registrieren,
      emitTo: async (_ziel: unknown, name: string, payload: unknown) => {
        for (const fenster of listener.values())
          for (const h of fenster.get(name) ?? []) h({ payload });
      },
    }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readTextFile: async (pfad: string) => {
        protokoll.push({ label, name: 'lesen', pfad: relativ(pfad), schritt });
        await vorLesen(label, relativ(pfad));
        const xml = dateien.get(relativ(pfad));
        if (xml === undefined) throw new Error('Datei fehlt');
        return xml;
      },
      writeTextFile: async (pfad: string, xml: string) => {
        dateien.set(relativ(pfad), xml);
      },
      exists: async (pfad: string) => dateien.has(relativ(pfad)),
      mkdir: async () => {},
      readDir: async (pfad: string) =>
        [...dateien.keys()]
          .filter(
            (p) =>
              p.startsWith(relativ(pfad) + '/') && !p.slice(relativ(pfad).length + 1).includes('/'),
          )
          .map((p) => ({
            name: p.slice(relativ(pfad).length + 1),
            isFile: true,
            isDirectory: false,
          })),
    }));
    const persistenz = await import('@/lib/persistenz/gesetz/gesetz.index');
    const markierungen = await import('@/lib/markierungen/markierungen.index');
    const start = await import('@/hooks/app-start/startaufgaben');
    const laden = await import('@/lib/gesetz-laden/gesetz-laden.index');
    markierungen.initialisiereMarkierungen();
    const banner = await import('@/lib/banner/banner.index');
    return { persistenz, markierungen, start, laden, banner };
  }
  function ressourcen() {
    for (const k of ['de-bund', 'de-bw', 'eu'])
      dateien.set(
        `resources/importindizes/${k}.xml`,
        `<importindex version="1"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>${k}</normgeber><datenquelle name="Probe"/></infos><inhalt/></importindex>`,
      );
  }
  dateien.set(
    'markierungskonflikte.xml',
    '<markierungskonflikte version="1" pruefstatus="aktuell"><inhalt/></markierungskonflikte>',
  );
  ressourcen();
  return {
    dateien,
    protokoll,
    kontext,
    get schritt() {
      return schritt;
    },
    zerstoeren: entfernen,
    vorLesen: (fn: typeof vorLesen) => {
      vorLesen = fn;
    },
    vorBefehl: (fn: typeof vorBefehl) => {
      vorBefehl = fn;
    },
    vorListener: (fn: typeof vorListener) => {
      vorListener = fn;
    },
    anzeigen: (fn: typeof anzeigen) => {
      anzeigen = fn;
    },
  };
}
