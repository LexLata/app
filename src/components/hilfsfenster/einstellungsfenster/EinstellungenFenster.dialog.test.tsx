// @vitest-environment jsdom
// EinstellungenFenster.dialog.test.tsx
// Prüft die zentrale native Bestätigung und Zurücksetzen ausschließlich nach Zustimmung.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EinstellungenFenster from './EinstellungenFenster';
import { getSnapshot, alleBannerSchliessen } from '@/lib/banner/banner.index';
import {
  FARBSCHEMA_KEY,
  meldeEinstellungenGeaendert,
} from '@/lib/einstellungen/einstellungen.index';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  native: vi.fn(),
  meldung: vi.fn(),
  zuruecksetzen: vi.fn(),
  schreiben: vi.fn(),
  fensterLabel: 'einstellungen',
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: mocks.fensterLabel }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: mocks.confirm }));
vi.mock('@/lib/plattform/tauriHelpers', async (original) => {
  const modul = await original<typeof import('@/lib/plattform/tauriHelpers')>();
  return {
    ...modul,
    nativeMeldung: mocks.meldung,
    nativeBestaetigung: mocks.native.mockImplementation(modul.nativeBestaetigung),
  };
});
vi.mock('@/hooks/fenster/useFensterSichtbarMachen', () => ({ useFensterSichtbarMachen: () => {} }));
vi.mock('@/hooks/fenster/useSchliessenAnfrageSchliesstFenster', () => ({
  useSchliessenAnfrageSchliesstFenster: () => {},
}));
vi.mock('@/hooks/fenster/useBeendenAnfrage', () => ({ useBeendenAnfrage: () => {} }));
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => ({ istLinux: false }) }));
vi.mock('@/hooks/einstellungen/useAktiverEinstellungenAbschnitt', () => ({
  useAktiverEinstellungenAbschnitt: () => 'allgemein',
}));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  setzeEinstellungenZurueck: mocks.zuruecksetzen,
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenSchreiben: mocks.schreiben,
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('test'),
}));

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  mocks.confirm.mockReset();
  mocks.native.mockClear();
  mocks.zuruecksetzen.mockReset().mockResolvedValue({ erfolgreich: true });
  mocks.meldung.mockReset();
  mocks.schreiben.mockReset().mockResolvedValue(undefined);
  mocks.fensterLabel = 'einstellungen';
  alleBannerSchliessen();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('übergibt den Zurücksetzungsdialog an den geschützten Weg und erhält Abbruch und Zustimmung', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<EinstellungenFenster />));
    const button = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('zurücksetzen'),
    )!;
    expect(button).toBeDefined();
    mocks.confirm.mockResolvedValueOnce(false);
    await act(async () => button.click());
    expect(mocks.native).toHaveBeenCalledWith(
      'Wirklich alle Einstellungen auf die Standardwerte zurücksetzen?',
      {
        title: 'Einstellungen zurücksetzen',
        kind: 'warning',
        okLabel: 'Zurücksetzen',
        cancelLabel: 'Abbrechen',
      },
    );
    expect(mocks.confirm).toHaveBeenCalledWith(...mocks.native.mock.calls[0]!);
    expect(mocks.zuruecksetzen).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce(true);
    await act(async () => button.click());
    expect(mocks.zuruecksetzen).toHaveBeenCalledExactlyOnceWith();
    expect(button.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});

it('zeigt bei fehlgeschlagenem Zurücksetzen die Meldung und gibt die Bedienung wieder frei', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  mocks.confirm.mockResolvedValue(true);
  mocks.zuruecksetzen.mockResolvedValue({ erfolgreich: false });
  try {
    await act(async () => root.render(<EinstellungenFenster />));
    const button = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('zurücksetzen'),
    )!;
    await act(async () => button.click());
    expect(mocks.meldung).not.toHaveBeenCalled();
    expect(host.querySelector('nav [role="alert"]')?.textContent).toBe(
      'Die Einstellungen konnten nicht zurückgesetzt werden, weil das Backup nicht gelöscht werden konnte. Bitte erneut versuchen.',
    );
    expect(button.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});

// Der echte Änderungs-/Timer-/Backup-Meldepfad bleibt aktiv; nur die Dateigrenze ist ersetzt.
it('zeigt Backupfehler unten neben dem Scrollinhalt und entfernt sie nach erfolgreichem Backup', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div');
  const root = createRoot(host);
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await act(async () => root.render(<EinstellungenFenster />));
    mocks.schreiben.mockRejectedValue(new Error('Platte voll'));
    // Änderung aus dem echten UiGroesseProvider erreicht Timer und Backup.
    await act(async () => {
      const auswahl = host.querySelector<HTMLSelectElement>('#ui-groesse-select')!;
      auswahl.value = 'gross';
      auswahl.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1000);
    });
    const meldung = host.querySelector('nav [role="alert"]');
    expect(meldung?.textContent).toContain('Backup konnte nicht geschrieben werden');
    expect(meldung?.parentElement?.style.marginTop).toBe('auto');
    expect(meldung?.parentElement?.style.overflowY).toBe('auto');
    expect(meldung?.parentElement?.style.minHeight).toBe('0px');
    expect(meldung?.parentElement?.style.flexShrink).toBe('1');
    expect((meldung as HTMLElement).style.fontSize).toBe('15px');
    expect(mocks.schreiben).toHaveBeenCalledTimes(1);
    expect(host.querySelector('nav')?.style.overflowY).toBe('hidden');
    expect(getSnapshot()).toEqual([]);
    expect(protokoll).not.toHaveBeenCalled();
    await act(async () => {
      meldeEinstellungenGeaendert();
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(host.querySelectorAll('nav [role="alert"]')).toHaveLength(1);
    expect(mocks.schreiben).toHaveBeenCalledTimes(2);
    mocks.confirm.mockResolvedValue(true);
    mocks.zuruecksetzen.mockResolvedValue({ erfolgreich: false });
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent?.includes('zurücksetzen'))!
        .click(),
    );
    expect(host.querySelectorAll('nav [role="alert"]')).toHaveLength(2);
    mocks.schreiben.mockResolvedValue(undefined);
    await act(async () => {
      meldeEinstellungenGeaendert(FARBSCHEMA_KEY);
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(host.querySelector('nav')?.textContent).not.toContain(
      'Backup konnte nicht geschrieben werden',
    );
    expect(host.querySelector('nav [role="alert"]')?.textContent).toContain('nicht zurückgesetzt');
    await act(async () => root.unmount());
    // Nach dem Abmelden erhält das Hauptfenster wieder seinen bisherigen Banner.
    mocks.fensterLabel = 'main';
    mocks.schreiben.mockRejectedValue(new Error('voll'));
    meldeEinstellungenGeaendert(FARBSCHEMA_KEY);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]?.text).toContain('Backup konnte nicht geschrieben werden');
    mocks.schreiben.mockResolvedValue(undefined);
    meldeEinstellungenGeaendert(FARBSCHEMA_KEY);
    await vi.advanceTimersByTimeAsync(1000);
  } finally {
    await act(async () => root.unmount());
    protokoll.mockRestore();
  }
});
