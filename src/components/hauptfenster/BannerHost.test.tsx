// @vitest-environment jsdom
// BannerHost.test.tsx
// Prüft Schutz an der realen Banneranzeige und unveränderte Aktionsdaten.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { BannerHost } from './BannerHost';
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import {
  alleBannerSchliessen,
  getSnapshot,
  zeigeBanner,
  bannerAktualisieren,
} from '@/lib/banner/banner.index';
vi.mock('@/components/tableiste/Tableiste.hoehe', () => ({
  useTableisteHoehe: () => ({ gesamt: 30 }),
}));
afterEach(() => {
  alleBannerSchliessen();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('entfernt den beim Öffnen angezeigten Normfehler nach genau fünf Sekunden', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  richteNativeEreignisgrenzeEin(async () => undefined);
  const gesetz = gesetzMitNormen(['§ 90']);
  let navigation: ReturnType<typeof useGesetzOeffnen>;
  function Probe() {
    const tabs = useAppTabs();
    navigation = useGesetzOeffnen({
      ...gesetzOeffnenFixture(tabs, [gesetz]),
      ladeGesetz: einzelzugriffFuerTest(async () => ({
        liste: [gesetz],
        befunde: [],
        ordnerLesbar: true,
      })),
    });
    return <BannerHost />;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    vi.useFakeTimers();
    await act(async () => navigation.handleLesezeichenOeffnen('§ 9', gesetz));
    expect(host.textContent).toContain('Norm nicht gefunden.');
    await act(async () => vi.advanceTimersByTime(4999));
    expect(host.textContent).toContain('Norm nicht gefunden.');
    await act(async () => vi.advanceTimersByTime(1));
    expect(host.textContent).toBe('');
    expect(getSnapshot()).toEqual([]);
  } finally {
    await act(async () => root.unmount());
  }
});
it('zeigt den Ladeindikator links in Akzentfarbe ohne Importaktion und blendet ihn nach Ladeende aus', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const id = zeigeBanner({ art: 'systemfehler', text: 'BGB wird importiert …' });
  bannerAktualisieren(id, { laedt: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BannerHost />));
    const indikator = host.querySelector('.banner-ladeindikator') as HTMLElement;
    expect(indikator).not.toBeNull();
    expect(indikator.getAttribute('aria-hidden')).toBe('true');
    expect(indikator.style.borderColor).toContain('var(--akzent)');
    expect(indikator.nextElementSibling?.textContent).toBe('BGB wird importiert …');
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(readFileSync('src/index.css', 'utf8')).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.banner-ladeindikator\s*\{\s*animation:\s*none;/,
    );
    await act(async () => bannerAktualisieren(id, { laedt: false }));
    expect(host.querySelector('.banner-ladeindikator')).toBeNull();
    expect(getSnapshot()[0]?.text).toBe('BGB wird importiert …');
  } finally {
    await act(async () => root.unmount());
  }
});
it('zeigt Zielbezeichnung Art. 1 Abs. 1 geschützt und wahrt Rohtext, Aktion und Ladezustand', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const roh = 'Die Bezeichnung führt zu Art. 1 Abs. 1 GG.';
  const aktion = { label: 'Art. 1 öffnen', onClick: vi.fn() };
  const id = zeigeBanner({ art: 'systemfehler', text: roh, aktion });
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BannerHost />));
    expect(host.textContent).toContain('Art.\u00a01 Abs.\u00a01');
    expect(
      [...host.querySelectorAll('span')]
        .filter((n) => n.style.whiteSpace === 'nowrap')
        .map((n) => n.textContent),
    ).toContain('Art.\u00a01');
    const button = host.querySelector('button')!;
    expect(button.textContent).toBe('Art.\u00a01 öffnen');
    await act(async () => button.click());
    expect(aktion.onClick).toHaveBeenCalledExactlyOnceWith(expect.anything());
    await act(async () => bannerAktualisieren(id, { laedt: true }));
    expect(button.disabled).toBe(true);
    expect(getSnapshot()[0]).toMatchObject({ text: roh, aktion });
  } finally {
    await act(async () => root.unmount());
  }
});
async function mitBannerHost(ablauf: (host: HTMLDivElement) => Promise<void>) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<BannerHost />));
    await ablauf(host);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}
const warte = (ms: number) => act(async () => vi.advanceTimersByTime(ms));
function ueberfahre(element: Element | undefined, betreten: boolean) {
  return act(async () =>
    element?.dispatchEvent(
      new MouseEvent(betreten ? 'mouseover' : 'mouseout', {
        bubbles: true,
        relatedTarget: document.body,
      }),
    ),
  );
}
/** Zeigt einen Bedienhinweis, wartet 3 s und überfährt sein innerstes Textelement. */
async function hinweisNachDreiSekundenUeberfahren(host: HTMLDivElement) {
  await act(async () => zeigeBanner({ art: 'bedienhinweis', text: 'Hinweis' }));
  await warte(3000);
  const text = Array.from(host.querySelectorAll('*'))
    .reverse()
    .find((e) => e.textContent === 'Hinweis');
  await ueberfahre(text, true);
  return text;
}
it('pausiert die Bedienhinweis-Zeit beim Überfahren und setzt sie danach fort', async () => {
  vi.useFakeTimers();
  await mitBannerHost(async (host) => {
    const text = await hinweisNachDreiSekundenUeberfahren(host);
    await warte(10_000);
    expect(host.textContent).toContain('Hinweis');
    await ueberfahre(text, false);
    await warte(1999);
    expect(host.textContent).toContain('Hinweis');
    await warte(1);
    expect(getSnapshot()).toEqual([]);
  });
});
it('startet die Zeit eines erneut ausgelösten gleichen Bedienhinweises neu', async () => {
  vi.useFakeTimers();
  await mitBannerHost(async (host) => {
    await act(async () => zeigeBanner({ art: 'bedienhinweis', text: 'Hinweis' }));
    await warte(4000);
    await act(async () => zeigeBanner({ art: 'bedienhinweis', text: 'Hinweis' }));
    await warte(4000);
    expect(host.textContent).toContain('Hinweis');
    expect(getSnapshot()).toHaveLength(1);
    await warte(1000);
    expect(getSnapshot()).toEqual([]);
  });
});
it('gewährt nach erneutem Auslösen während des Überfahrens die volle Dauer ab Verlassen', async () => {
  vi.useFakeTimers();
  await mitBannerHost(async (host) => {
    const text = await hinweisNachDreiSekundenUeberfahren(host);
    await warte(1000);
    await act(async () => zeigeBanner({ art: 'bedienhinweis', text: 'Hinweis' }));
    await warte(1000);
    await ueberfahre(text, false);
    await warte(4999);
    expect(getSnapshot()).toHaveLength(1);
    await warte(1);
    expect(getSnapshot()).toEqual([]);
  });
});
it('lässt Vorgangsergebnis und Bedienhinweis mit Aktion stehen', async () => {
  vi.useFakeTimers();
  await mitBannerHost(async () => {
    await act(async () => {
      zeigeBanner({ art: 'vorgangsergebnis', text: 'Ergebnis' });
      zeigeBanner({
        art: 'bedienhinweis',
        text: 'Mit Aktion',
        aktion: { label: 'X', onClick: vi.fn() },
      });
    });
    await warte(60_000);
    expect(getSnapshot()).toHaveLength(2);
  });
});
