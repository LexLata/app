// Gemeinsame native I/O- und Sperrattrappen für Dateiimportproben mit realen Nutzerdatenspeichern.
import { vi } from 'vitest';
export const dateien = new Map<string, string>();
let gesperrt = false;
export const sperrstatusBeimVersand: boolean[] = [];
export const emit = vi.fn(async (..._args: unknown[]) => {
  sperrstatusBeimVersand.push(gesperrt);
});
vi.mock('@tauri-apps/api/event', () => ({ emitTo: (...args: unknown[]) => emit(...args) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({ holePlattform: async () => 'macos' }));
export const schreiben = vi.fn(async (pfad: string, inhalt: string) => {
  dateien.set(pfad, inhalt);
});
export const lesen = vi.fn(async (pfad: string) => {
  if (!dateien.has(pfad)) throw Error('nicht lesbar');
  return dateien.get(pfad)!;
});
export const geschuetztLesen = vi.fn(async (pfad: string) => dateien.get(pfad) ?? null);
export const ordnerLesen = vi.fn(async (ordner: string) =>
  [...dateien.keys()]
    .filter((p) => p.startsWith(`${ordner}/`))
    .map((p) => ({ name: p.slice(ordner.length + 1) })),
);
export const loeschen = vi.fn(async (pfad: string) => {
  dateien.delete(pfad);
});
async function mitTestSperre(aktion: (token: string) => Promise<unknown>) {
  gesperrt = true;
  try {
    return await aktion('token');
  } finally {
    gesperrt = false;
  }
}
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    mitTestSperre(aktion),
  mitGesetzDateiSperre: async (
    _ref: unknown,
    _ordner: string,
    _suffix: string,
    aktion: (token: string) => Promise<unknown>,
  ) => mitTestSperre(aktion),
  appDatenLesenGeschuetzt: (pfad: string) => geschuetztLesen(pfad),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  sicherstelleOrdner: async () => undefined,
  appDatenLesenOderNull: async (pfad: string) => dateien.get(pfad) ?? null,
  appDatenLesen: (pfad: string) => lesen(pfad),
  appDatenLesenOhneHinweis: (pfad: string) => lesen(pfad),
  appDatenOrdnerLesen: (ordner: string) => ordnerLesen(ordner),
  appDatenExistiert: async (pfad: string) => dateien.has(pfad),
  appDatenSchreiben: (...args: [string, string]) => schreiben(...args),
  appDatenLoeschen: (pfad: string) => loeschen(pfad),
}));
