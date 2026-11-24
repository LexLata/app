// Native Datei- und Sperrattrappe für öffentliche Suchverzeichnis- und Importabnahmen.
import { beforeEach, vi } from 'vitest';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  invoke: vi.fn(),
  lesen: vi.fn(),
  ordnerFehler: false,
  zeit: 1,
  sperrfehler: 0,
  stempel: new Map<string, number>(),
  sperren: new Map<string, Promise<void>>(),
  freigaben: new Map<string, () => void>(),
  nummer: 0,
  pruefwarte: Promise.resolve(),
  pruefungBlockieren: false,
  /** Ordnerauflistungen (readDir und nativer Stempelbefehl) in Aufrufreihenfolge. */
  auflistungen: new Array<string>(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke, isTauri: () => false }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...t: string[]) => t.join('/'),
  resolveResource: async (p: string) => p,
}));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), emitTo: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
const relativ = (p: string) => p.replace('/daten/LexLata/', '');
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (p: string) => io.dateien.has(relativ(p)),
  mkdir: async () => {},
  readTextFile: (p: string) => io.lesen(relativ(p)),
  readDir: async (pfad: string) => {
    io.auflistungen.push(relativ(pfad));
    if (io.ordnerFehler) throw Error('gesperrt');
    return [...io.dateien.keys()]
      .filter(
        (p) =>
          p.startsWith(relativ(pfad) + '/') && !p.slice(relativ(pfad).length + 1).includes('/'),
      )
      .map((p) => ({ name: p.slice(relativ(pfad).length + 1), isFile: true }));
  },
}));
export const ref = { kurztitel: 'Probe', normgeber: 'de-bund' };
export const xml =
  '<gesetz><infos><kurztitel>Probe</kurztitel><langtitel>Probegesetz</langtitel><normgeber>de-bund</normgeber><verarbeitungszeit>2025-01-02T03:04:05Z</verarbeitungszeit></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>';
async function erwerbeSperre(pfad: string): Promise<string> {
  if (pfad === 'markierungskonflikte.xml' && io.pruefungBlockieren) await io.pruefwarte;
  if (pfad === 'cache/suchverzeichnis.json' && io.sperrfehler > 0) {
    io.sperrfehler--;
    throw 'wartefrist';
  }
  const vor = io.sperren.get(pfad);
  const token = `${pfad}-${++io.nummer}`;
  const jetzt = new Promise<void>((resolve) => io.freigaben.set(token, resolve));
  io.sperren.set(pfad, jetzt);
  await vor;
  return token;
}

beforeEach(() => {
  initialisiereMarkierungen();
  io.dateien.clear();
  io.stempel.clear();
  io.sperren.clear();
  io.freigaben.clear();
  io.sperrfehler = 0;
  io.ordnerFehler = false;
  io.pruefwarte = Promise.resolve();
  io.pruefungBlockieren = false;
  io.zeit = 1;
  io.auflistungen = [];
  io.invoke.mockReset();
  io.lesen.mockReset();
  io.lesen.mockImplementation(async (p) => {
    const t = io.dateien.get(p);
    if (t === undefined) throw Error('fehlt');
    return t;
  });
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') {
      io.auflistungen.push('gesetze');
      if (io.ordnerFehler) throw Error('gesperrt');
      return [...io.dateien]
        .filter(([p]) => p.startsWith('gesetze/') && p.toLowerCase().endsWith('.xml'))
        .map(([p, t]) => ({
          name: p.slice(8),
          dateistempel: {
            groesse: String(t.length),
            aenderungszeit: String(io.stempel.get(p) ?? 1),
          },
        }));
    }
    if (name === 'datei_sperre_erwerben') return erwerbeSperre(args.relativerPfad);
    if (name === 'datei_sperre_freigeben') io.freigaben.get(args.token)?.();
    if (name === 'datei_sperre_fortsetzen') return true;
    if (name === 'atomar_datei_schreiben') {
      io.dateien.set(args.relativerPfad, args.inhalt);
      io.stempel.set(args.relativerPfad, ++io.zeit);
    }
    if (name === 'app_daten_loeschen') io.dateien.delete(args.relativerPfad);
    if (name === 'pruefvorgang_registrieren') return `v-${++io.nummer}`;
    if (name === 'pruefvorgang_quellen_abwarten') return io.pruefwarte;
    // Dieser Befehl liefert einen booleschen Budgetentscheid, keinen Prüfstand.
    if (name === 'pruefvorgang_wiederholung_uebernehmen') return false;
    if (name.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    if (name === 'archiviere_beschaedigte_datei') {
      const inhalt = io.dateien.get(args.relativerPfad);
      if (inhalt === undefined || inhalt !== args.erwarteterInhalt)
        return { status: 'veraendert', sicherungspfad: null };
      const sicherungspfad = `${args.relativerPfad}.bak`;
      io.dateien.set(sicherungspfad, inhalt);
      io.dateien.delete(args.relativerPfad);
      return { status: 'archiviert', sicherungspfad };
    }
  });
});

export { io };
