// Gemeinsame native Grenzen der beiden Markierungs-Zusammenspieltests;
// Fachmodule und React-Komponenten bleiben echt.
import { act } from 'react';
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import type { Root } from 'react-dom/client';
import { vi } from 'vitest';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
const nativeGrenze = vi.hoisted(() => ({
  texte: new Map<string, string>(),
  binaer: new Map<string, Uint8Array>(),
  invoke: vi.fn(),
  emitTo: vi.fn(),
  label: 'main',
  kontexte: new Map<string, string>(),
  listener: new Map<string, Map<string, (event: { payload: unknown }) => void>>(),
  schliessen: vi.fn(async () => {}),
}));
export const native = nativeGrenze;
export const basis = '/daten/LexLata/';
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativeGrenze.invoke, isTauri: () => false }));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: nativeGrenze.emitTo,
  listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
    const label = nativeGrenze.label;
    const listener = nativeGrenze.listener.get(label) ?? new Map();
    nativeGrenze.listener.set(label, listener);
    listener.set(name, callback);
    return () => listener.delete(name);
  },
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  downloadDir: async () => '/export',
  resolveResource: async (pfad: string) => `/ressourcen/${pfad}`,
  join: async (...teile: string[]) => teile.join('/'),
  dirname: async (pfad: string) => pfad.slice(0, pfad.lastIndexOf('/')),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: async ({ defaultPath }: { defaultPath: string }) => defaultPath,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: async () => {},
  exists: async (pfad: string) => nativeGrenze.texte.has(pfad),
  readTextFile: async (pfad: string) => {
    if (!nativeGrenze.texte.has(pfad)) throw Error(`Datei fehlt: ${pfad}`);
    return nativeGrenze.texte.get(pfad)!;
  },
  writeTextFile: async (pfad: string, inhalt: string) => nativeGrenze.texte.set(pfad, inhalt),
  writeFile: async (pfad: string, inhalt: Uint8Array) => nativeGrenze.binaer.set(pfad, inhalt),
  readFile: async (pfad: string) => nativeGrenze.binaer.get(pfad)!.slice(),
  readDir: async (ordner: string) =>
    [...nativeGrenze.texte.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isFile: true })),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: nativeGrenze.label,
    close: nativeGrenze.schliessen,
    show: async () => {},
    setSize: async () => {},
  }),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
      const label = nativeGrenze.label;
      const listener = nativeGrenze.listener.get(label) ?? new Map();
      nativeGrenze.listener.set(label, listener);
      listener.set(name, callback);
      return () => listener.delete(name);
    },
  }),
}));
export function bereiteNativeAttrappeVor() {
  native.texte.clear();
  native.texte.set(
    basis + 'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  native.binaer.clear();
  native.kontexte.clear();
  native.listener.clear();
  native.label = 'main';
  localStorage.clear();
  vi.clearAllMocks();
  native.emitTo.mockImplementation(async (label, name, payload) => {
    if (typeof label === 'string') native.listener.get(label)?.get(name)?.({ payload });
  });
  let kennung = 0;
  native.invoke.mockImplementation(async (befehl: string, args?: Record<string, unknown>) => {
    switch (befehl) {
      case 'plugin:path|resolve_directory':
        return args?.path ? `/ressourcen/${String(args.path)}` : '/daten';
      case 'plugin:path|join':
        return Array.isArray(args?.paths) ? args.paths.map(String).join('/') : '';
      case 'plugin:fs|exists':
        return native.texte.has(String(args?.path));
      case 'plugin:fs|mkdir':
        return;
      case 'plugin:fs|read_text_file': {
        const inhalt = native.texte.get(String(args?.path));
        if (inhalt === undefined) throw Error('Datei fehlt');
        return new TextEncoder().encode(inhalt);
      }
      case 'plugin:fs|read_dir': {
        const prefix = String(args?.path) + '/';
        return [...native.texte.keys()]
          .filter((pfad) => pfad.startsWith(prefix))
          .map((pfad) => ({ name: pfad.slice(prefix.length), isFile: true, isDirectory: false }));
      }
      case 'gesetz_dateistempel_lesen':
        return [...native.texte]
          .filter(([pfad]) => pfad.startsWith(basis + 'gesetze/'))
          .map(([pfad, xml]) => ({
            name: pfad.slice((basis + 'gesetze/').length),
            dateistempel: { groesse: String(xml.length), aenderungszeit: '1' },
          }));
      case 'datei_sperre_erwerben':
      case 'import_aktualisierung_starten':
      case 'pruefvorgang_registrieren':
        return `token-${++kennung}`;
      case 'gesetz_import_sperre_versuchen_zu_erhalten':
      case 'datei_sperre_fortsetzen':
        return true;
      case 'datei_sperre_unterbrechen':
        return;
      case 'archiviere_beschaedigte_datei': {
        const pfad = basis + String(args?.relativerPfad);
        const erwartet = String(args?.erwarteterInhalt);
        if (native.texte.get(pfad) !== erwartet)
          return { status: 'veraendert', sicherungspfad: null };
        const sicherungspfad = String(args?.relativerPfad) + '.bak';
        native.texte.set(basis + sicherungspfad, erwartet);
        native.texte.delete(pfad);
        return { status: 'archiviert', sicherungspfad };
      }
      case 'atomar_datei_schreiben':
        native.texte.set(basis + String(args!.relativerPfad), String(args!.inhalt));
        return;
      case 'kommentar_kontext_ablegen':
        native.kontexte.set(String(args!.label), String(args!.payload));
        return;
      case 'verweismarkierung_kontext_abholen':
      case 'kommentar_kontext_abholen':
        return native.kontexte.get(String(args!.label));
      case 'kommentar_fenster_oeffnen':
      case 'fenster_menu_status_aktualisieren':
      case 'datei_sperre_freigeben':
      case 'import_aktualisierung_beenden':
      case 'gesetz_import_sperre_freigeben':
      case 'pruefvorgang_quelle_abschliessen':
      case 'menu_item_aktivieren':
      case 'markierungskonflikte_fenster_oeffnen':
        return;
      case 'pruefvorgang_abfragen':
      case 'pruefvorgang_vollbedarf':
      case 'pruefvorgang_vollpruefung_abschliessen':
      case 'pruefvorgang_fehler':
        return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
      default:
        throw Error(`Unerwarteter nativer Aufruf: ${befehl}`);
    }
  });
  richteNativeEreignisgrenzeEin(
    native.invoke,
    async (
      name: string,
      callback: (event: { event: string; id: number; payload: unknown }) => void,
    ) => {
      const listener = native.listener.get(native.label) ?? new Map();
      native.listener.set(native.label, listener);
      listener.set(name, (event: { payload: unknown }) =>
        callback({ event: name, id: 1, payload: event.payload }),
      );
      return () => listener.delete(name);
    },
    async (_befehl, args) => {
      const ziel = args?.target;
      const label = typeof ziel === 'object' && ziel && 'label' in ziel ? ziel.label : ziel;
      await native.emitTo(label, args?.event, args?.payload);
    },
    native.label,
  );
}
registrierePruefpflichtigeAenderung({
  vormerken: async () => native.invoke('pruefvorgang_registrieren'),
  abschliessen: async (vorgang, ergebnis) => {
    await native.invoke('pruefvorgang_quelle_abschliessen', { vorgang, ergebnis });
  },
});
export async function raeumeTestFensterAuf(wurzeln: Root[]) {
  await act(async () => {
    for (const root of wurzeln.splice(0)) root.unmount();
  });
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
}

export function waehleTextImBlatt(blatt: Element, text: string) {
  const textknoten = document.createTreeWalker(blatt, NodeFilter.SHOW_TEXT);
  let knoten = textknoten.nextNode();
  while (knoten && !knoten.textContent!.includes(text)) knoten = textknoten.nextNode();
  if (!knoten) throw Error(`Auswahltext fehlt im Blatt: ${text}`);
  const start = knoten.textContent!.indexOf(text);
  const range = document.createRange();
  range.setStart(knoten, start);
  range.setEnd(knoten, start + text.length);
  window.getSelection()!.addRange(range);
}

/** Erwarteter Bezug auf „Wort“ hinter einem Emoji im verschachtelten Testgesetz. */
export const beispielTextstelle: Textstelle = {
  pfad: {
    typ: 'normtext',
    absatz: '(1)',
    satz: 1,
    eintraege: [
      { ebene: 'nummer', bezeichnung: '1.' },
      { ebene: 'litera', bezeichnung: 'a)' },
    ],
  },
  zeichenbereichStart: 3,
  zeichenbereichEnde: 7,
};
