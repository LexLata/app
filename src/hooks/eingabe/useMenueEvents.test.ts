// Prüft die produktive Menüanmeldung mit zwei getrennten Hauptfenstern und Einführungssperren.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventCallback } from '@tauri-apps/api/event';
import { useMenueEvents } from './useMenueEvents';

const laufzeit = vi.hoisted(() => ({
  label: 'main',
  effekte: [] as Array<() => void | (() => void)>,
  listen: vi.fn(),
  globalListen: vi.fn(),
}));
vi.mock('react', () => ({
  useEffectEvent: (handler: unknown) => handler,
  useEffect: (effekt: () => void | (() => void)) => laufzeit.effekte.push(effekt),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: laufzeit.listen }),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: laufzeit.globalListen }));
vi.mock('@/lib/plattform/tauriHelpers', () => ({ einstellungenFensterOeffnen: vi.fn() }));
let listener: Map<string, EventCallback<unknown>>;
function optionen() {
  return {
    setAktivesOverlay: vi.fn(),
    setOeffnenOverlayInitial: vi.fn(),
    handleExportOeffnen: vi.fn(),
    tabOderFensterSchliessen: vi.fn(),
    fensterSchliessen: vi.fn(),
    handleFavoritSpeichern: vi.fn(),
    handleLesezeichenSpeichern: vi.fn(),
    handleAlleLesezeichenEntfernen: vi.fn(),
    handleUnterstreichen: vi.fn(),
    handleHervorheben: vi.fn(),
    handleVerweismarkierungAnfrage: vi.fn(),
    handleKommentarAnfrage: vi.fn(),
    handleMarkierungRueckgaengig: vi.fn(),
    handleMarkierungWiederholen: vi.fn(),
    erstelleLeerenTab: vi.fn(),
    tabWiederherstellen: vi.fn(),
    handleDateiImportAnfrage: vi.fn(),
    einfuehrungNeuStarten: vi.fn(),
    einfuehrungAktiv: false,
    einfuehrungTeilaktion: 0,
  } satisfies Parameters<typeof useMenueEvents>[0];
}
function ausloesen(label: string, name: string) {
  listener.get(`${label}:${name}`)?.({ payload: undefined, event: name, id: 1 });
}
beforeEach(() => {
  vi.clearAllMocks();
  laufzeit.effekte = [];
  listener = new Map();
  laufzeit.label = 'main';
  laufzeit.listen.mockImplementation(async (name: string, callback: EventCallback<unknown>) => {
    const key = `${laufzeit.label}:${name}`;
    listener.set(key, callback);
    return () => listener.delete(key);
  });
});
describe('Menüaktionen im eigenen Fenster', () => {
  it('führt Undo, Auswahlaktionen und Tabaktionen ausschließlich am adressierten Fenster aus', async () => {
    const a = optionen();
    useMenueEvents(a);
    const cleanupA = laufzeit.effekte.pop()!();
    await Promise.resolve();
    laufzeit.label = 'fenster-zwei';
    const b = optionen();
    useMenueEvents(b);
    const cleanupB = laufzeit.effekte.pop()!();
    await Promise.resolve();
    ausloesen('fenster-zwei', 'markierung-rueckgaengig-anfrage');
    ausloesen('main', 'unterstreichen-anfrage');
    ausloesen('main', 'leerentab-oeffnen');
    expect(a.handleMarkierungRueckgaengig).not.toHaveBeenCalled();
    expect(b.handleMarkierungRueckgaengig).toHaveBeenCalledOnce();
    expect(a.handleUnterstreichen).toHaveBeenCalledOnce();
    expect(b.handleUnterstreichen).not.toHaveBeenCalled();
    expect(a.erstelleLeerenTab).toHaveBeenCalledOnce();
    expect(b.erstelleLeerenTab).not.toHaveBeenCalled();
    expect(laufzeit.globalListen).not.toHaveBeenCalled();
    cleanupA?.();
    cleanupB?.();
    await vi.waitFor(() => expect(listener.size).toBe(0));
  });
  it('erhält die Einführungssperre und die ausdrücklich erlaubten Favoriten-/Lesezeichenteilaktionen', async () => {
    const a = { ...optionen(), einfuehrungAktiv: true, einfuehrungTeilaktion: 2 };
    useMenueEvents(a);
    const cleanup = laufzeit.effekte.pop()!();
    await Promise.resolve();
    ausloesen('main', 'markierung-rueckgaengig-anfrage');
    ausloesen('main', 'lesezeichen-speichern');
    ausloesen('main', 'favorit-speichern');
    ausloesen('main', 'einfuehrung-neu-starten-anfrage');
    expect(a.handleMarkierungRueckgaengig).not.toHaveBeenCalled();
    expect(a.handleLesezeichenSpeichern).not.toHaveBeenCalled();
    expect(a.handleFavoritSpeichern).toHaveBeenCalledOnce();
    expect(a.einfuehrungNeuStarten).toHaveBeenCalledOnce();
    cleanup?.();
    const b = { ...optionen(), einfuehrungAktiv: true, einfuehrungTeilaktion: 4 };
    useMenueEvents(b);
    const cleanupB = laufzeit.effekte.pop()!();
    await Promise.resolve();
    ausloesen('main', 'lesezeichen-speichern');
    ausloesen('main', 'favorit-speichern');
    expect(b.handleLesezeichenSpeichern).toHaveBeenCalledOnce();
    expect(b.handleFavoritSpeichern).not.toHaveBeenCalled();
    cleanupB?.();
  });
});

it.each([
  ['datenschutz-oeffnen', 'datenschutz'],
  ['ueber-oeffnen', 'ueber'],
] as const)(
  '%s öffnet nur im adressierten Fenster und erhält die Einführungssperre',
  async (ereignis, overlay) => {
    const a = optionen();
    useMenueEvents(a);
    const cleanupA = laufzeit.effekte.pop()!();
    await Promise.resolve();
    laufzeit.label = 'fenster-zwei';
    const b = optionen();
    useMenueEvents(b);
    const cleanupB = laufzeit.effekte.pop()!();
    await Promise.resolve();
    ausloesen('fenster-zwei', ereignis);
    expect(b.setAktivesOverlay).toHaveBeenCalledWith(overlay);
    expect(a.setAktivesOverlay).not.toHaveBeenCalled();
    cleanupA?.();
    cleanupB?.();
    const gesperrt = { ...optionen(), einfuehrungAktiv: true };
    useMenueEvents(gesperrt);
    const cleanup = laufzeit.effekte.pop()!();
    await Promise.resolve();
    ausloesen('fenster-zwei', ereignis);
    expect(gesperrt.setAktivesOverlay).not.toHaveBeenCalled();
    cleanup?.();
  },
);

it.each([false, true])(
  'beachtet beim Öffnen der Tastenkürzel die Einführungssperre (%s)',
  async (einfuehrungAktiv) => {
    const a = { ...optionen(), einfuehrungAktiv };
    useMenueEvents(a);
    const cleanup = laufzeit.effekte.pop()!();
    await Promise.resolve();
    ausloesen('main', 'tastenkuerzel-oeffnen');
    if (einfuehrungAktiv) expect(a.setAktivesOverlay).not.toHaveBeenCalled();
    else expect(a.setAktivesOverlay).toHaveBeenCalledWith('tastenkuerzel');
    cleanup?.();
  },
);
