// Prüft gezielte Statusanfragen und vollständige lokale Snapshots über die produktive Fassade.
import { beforeEach, expect, it, vi } from 'vitest';
import type { EventCallback } from '@tauri-apps/api/event';
const ipc = vi.hoisted(() => ({
  label: 'main',
  listen: vi.fn(),
  invoke: vi.fn(),
  globalListen: vi.fn(),
  normstatus: vi.fn(),
}));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ listen: ipc.listen }) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: ipc.globalListen }));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  menuItemAktivieren: ipc.invoke,
  menuNormstatusMelden: ipc.normstatus,
}));
let listener: Map<string, EventCallback<unknown>>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  listener = new Map();
  ipc.label = 'main';
  ipc.invoke.mockResolvedValue(undefined);
  ipc.listen.mockImplementation(async (_name, handler) => {
    const label = ipc.label;
    listener.set(label, handler);
    return () => listener.delete(label);
  });
});
it('beantwortet die gezielte Anfrage nur mit allen aktuellen Werten dieses Fensters und hält das Hamburger-Menü lokal aktuell', async () => {
  const a = await import('./menu.index');
  a.meldeNormstatus({ bezeichnung: '§ 1', ist_favorit: true, ist_lesezeichen: false });
  a.meldeGesetzOffenStatus(true);
  a.meldeTextAuswahlStatus(true);
  a.setzeAktiv('markierung-rueckgaengig', true);
  a.setzeAktiv('markierung-wiederholen', false);
  a.setzeAktiv('gesetze-aktualisieren', true);
  a.setzeAktiv('alle-lesezeichen-entfernen', true);
  const cleanupA = a.registriereMenuZustandAnfrageListener(vi.fn());
  await vi.waitFor(() => expect(ipc.invoke).toHaveBeenCalledTimes(14));
  vi.resetModules();
  ipc.label = 'fenster-zwei';
  const b = await import('./menu.index');
  b.meldeNormstatus({ bezeichnung: '§ 2', ist_favorit: false, ist_lesezeichen: true });
  b.meldeGesetzOffenStatus(false);
  b.meldeTextAuswahlStatus(false);
  b.setzeAktiv('markierung-rueckgaengig', false);
  b.setzeAktiv('markierung-wiederholen', true);
  b.setzeAktiv('gesetze-aktualisieren', false);
  b.setzeAktiv('alle-lesezeichen-entfernen', false);
  const synchronisiereStapel = vi.fn();
  const cleanupB = b.registriereMenuZustandAnfrageListener(synchronisiereStapel);
  await vi.waitFor(() => expect(ipc.invoke).toHaveBeenCalledTimes(28));
  expect(a.istAktiv('gesetz-info')).toBe(true);
  expect(b.istAktiv('gesetz-info')).toBe(false);
  expect(a.istAktiv('markierung-rueckgaengig')).toBe(true);
  expect(b.istAktiv('markierung-rueckgaengig')).toBe(false);
  ipc.invoke.mockClear();
  ipc.normstatus.mockClear();
  listener.get('fenster-zwei')!({ event: 'menu-zustand-anfordern', payload: undefined, id: 1 });
  await vi.waitFor(() => expect(ipc.invoke).toHaveBeenCalledTimes(14));
  const werte = Object.fromEntries(ipc.invoke.mock.calls.map(([id, aktiv]) => [id, aktiv]));
  expect(werte).toMatchObject({
    'gesetz-info': false,
    unterstreichen: false,
    'markierung-rueckgaengig': false,
    'markierung-wiederholen': true,
    'gesetze-aktualisieren': false,
    'alle-lesezeichen-entfernen': false,
  });
  expect(ipc.normstatus).toHaveBeenCalledExactlyOnceWith({
    bezeichnung: '§ 2',
    ist_favorit: false,
    ist_lesezeichen: true,
  });
  expect(synchronisiereStapel).toHaveBeenCalledExactlyOnceWith();
  expect(ipc.globalListen).not.toHaveBeenCalled();
  cleanupA();
  cleanupB();
  await vi.waitFor(() => expect(listener.size).toBe(0));
});

it.each([
  [false, false],
  [true, false],
  [true, true],
])('meldet Markierungsaktionen bei Gesetz %s und Textauswahl %s', async (gesetz, auswahl) => {
  const menu = await import('./menu.index');
  menu.meldeGesetzOffenStatus(gesetz);
  menu.meldeTextAuswahlStatus(auswahl);
  const werte = Object.fromEntries(ipc.invoke.mock.calls.map(([id, aktiv]) => [id, aktiv]));
  expect(werte).toMatchObject({
    verweismarkierung: gesetz,
    kommentar: gesetz,
    unterstreichen: auswahl,
    hervorheben: auswahl,
  });
});
