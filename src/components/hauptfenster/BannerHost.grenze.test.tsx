// @vitest-environment jsdom
// BannerHost.grenze.test.tsx
// Verhindert lokale Banner auch vor dem Rendern einer Hilfsfensterwurzel.
import { afterEach, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Seitenleiste } from '@/components/seitenleisten/seitenleisten.index';
import { getSnapshot as getRechteLeisteBreite } from '@/hooks/seitenleisten/rechteSeitenleisteBreiteStore';
import { BannerHost } from '@/components/hauptfenster/BannerHost';
import {
  alleBannerSchliessen,
  getSnapshot,
  zeigeBanner,
  bannerAktualisieren,
} from '@/lib/banner/banner.index';
const fenster = vi.hoisted(() => ({ label: undefined as string | undefined }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => {
    if (fenster.label === undefined) throw new Error('Browser-Vorschau');
    return { label: fenster.label };
  },
}));
afterEach(() => {
  alleBannerSchliessen();
  vi.restoreAllMocks();
});
it.each(['kommentar-1', 'verweismarkierung-1', 'markierungskonflikte', 'einstellungen'])(
  'weist Erzeugung und BannerHost im Hilfsfenster %s ausdrücklich zurück',
  (label) => {
    fenster.label = label;
    const benachrichtigen = vi.fn();
    expect(() =>
      zeigeBanner({
        art: 'systemfehler',
        text: 'Unzulässig',
        aktion: { label: 'Aktion', onClick: benachrichtigen },
      }),
    ).toThrow(/Banner.*Hauptfenster/);
    expect(getSnapshot()).toEqual([]);
    expect(() => renderToString(<BannerHost />)).toThrow(/Banner.*Hauptfenster/);
    expect(benachrichtigen).not.toHaveBeenCalled();
  },
);
it.each(['main', 'fenster-42', undefined])(
  'bewahrt Anzeige, Aktion, Aktualisierung und Schließen in Hauptansicht %s',
  async (label) => {
    fenster.label = label;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const aktion = { label: 'Öffnen', onClick: vi.fn() };
    const id = zeigeBanner({ art: 'systemfehler', text: 'Gespeichert', aktion });
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(<BannerHost />));
      expect(host.textContent).toContain('Gespeichert');
      const knopf = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Öffnen')!;
      await act(async () => knopf.click());
      expect(aktion.onClick).toHaveBeenCalledTimes(1);
      await act(async () => bannerAktualisieren(id, { text: 'Aktualisiert', laedt: true }));
      expect(knopf.disabled).toBe(true);
      expect(host.textContent).toContain('Aktualisiert');
      expect(getSnapshot()).toEqual([expect.objectContaining({ text: 'Aktualisiert', aktion })]);
      await act(async () => bannerAktualisieren(id, { laedt: false }));
      await act(async () => knopf.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Banner schließen"]')!.click(),
      );
      expect(getSnapshot()).toEqual([]);
      expect(host.textContent).toBe('');
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);

it('weicht der rechten Leiste aus und gibt deren Breite bei Seitenwechsel und Abbau frei', async () => {
  fenster.label = 'main';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const callbacks: Array<() => void> = [];
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(fn: () => void) {
        callbacks.push(fn);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(83);
  const host = document.createElement('div');
  const root = createRoot(host);
  const anzeigen = (seite?: 'links' | 'rechts') =>
    root.render(
      <>
        {seite && (
          <Seitenleiste
            seite={seite}
            anzahl={0}
            schnellaktionen={null}
            schnellaktionenAnzahl={0}
            renderSpalte={() => []}
          />
        )}
        <BannerHost />
      </>,
    );
  const abstand = () => host.querySelector<HTMLElement>('[style*="position: fixed"]')?.style.right;
  const messen = async () =>
    act(async () => {
      callbacks.forEach((fn) => fn());
      frames.splice(0).forEach((fn) => fn(0));
    });
  try {
    zeigeBanner({ art: 'systemfehler', text: 'Gespeichert' });
    await act(async () => anzeigen('rechts'));
    await messen();
    expect(getRechteLeisteBreite()).toBe(83);
    expect(abstand()).toBe('99px');
    // Ein vor dem Wechsel geplanter Frame darf die freigegebene Breite nicht zurückschreiben.
    callbacks.forEach((fn) => fn());
    await act(async () => anzeigen('links'));
    await act(async () => frames.splice(0).forEach((fn) => fn(0)));
    expect(getRechteLeisteBreite()).toBe(0);
    expect(abstand()).toBe('16px');
    await act(async () => anzeigen('rechts'));
    await messen();
    expect(abstand()).toBe('99px');
    await act(async () => anzeigen());
    expect(getRechteLeisteBreite()).toBe(0);
    expect(abstand()).toBe('16px');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
