// @vitest-environment jsdom
// Prüft gespeicherte Favoriten mit echtem Resolver und aktualisiertem Gesetz.
import { normaleNorm, gesetzDarstellung, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { useFavoritenleiste } from './useFavoritenleiste';
const laden = vi.hoisted(() => vi.fn());
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({ ladeFavoriten: laden }));
afterEach(() => vi.unstubAllGlobals());
it('blendet unzuordenbare Favoriten aus, erhält die gespeicherten Einträge und prüft nach Gesetzeswechsel neu', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const gespeichert = ['9', '10'];
  laden.mockResolvedValue(gespeichert);
  const scrollen = vi.fn();
  function Anzeige({ g }: { g: GesetzDarstellung }) {
    const { favoritenEintraege } = useFavoritenleiste({
      gesetz: g,
      favoritenVersion: 0,
      seitenleistenTastenkuerzel: true,
      normScrollen: scrollen,
    });
    return <span>{favoritenEintraege.map((e) => `${e.bezeichnung}:${e.xmlId}`).join(',')}</span>;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Anzeige g={gesetzMitNormen(['§ 90', '§ 9a', '§ 10'])} />));
    expect(host.textContent).toBe('10:2');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(scrollen).toHaveBeenCalledExactlyOnceWith('2');
    await act(async () => root.render(<Anzeige g={gesetzMitNormen(['§ 9', '§ 10'])} />));
    expect(host.textContent).toBe('9:0,10:1');
    await act(async () => root.render(<Anzeige g={gesetzMitNormen(['§ 9', 'Art. 9', '§ 10'])} />));
    expect(host.textContent).toBe('10:2');
    await act(async () =>
      root.render(<Anzeige g={gesetzMitNormen(['Anlage 9', '§ 9', '§ 10'])} />),
    );
    expect(host.textContent).toBe('9:1,10:2');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(scrollen).toHaveBeenLastCalledWith('1');
    await act(async () => root.render(<Anzeige g={gesetzMitNormen(['Anlage 9', '§ 10'])} />));
    expect(host.textContent).toBe('9:0,10:1');
    expect(gespeichert).toEqual(['9', '10']);
  } finally {
    await act(async () => root.unmount());
  }
});

it('verwendet den aktuellen Sprung-Handler ohne den Favoritenlistener neu anzumelden', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  laden.mockResolvedValue(['1']);
  const gesetz: GesetzDarstellung = gesetzDarstellung({
    kurztitel: 'G',
    langtitel: 'G',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm',
        data: normaleNorm({ id: 'n', xmlId: 'xml-1', bezeichnung: '§ 1', absaetze: [] }),
      },
    ],
  });
  const alt = vi.fn();
  const neu = vi.fn();
  function Probe({ handler }: { handler: (xmlId: string) => void }) {
    useFavoritenleiste({
      gesetz,
      favoritenVersion: 0,
      seitenleistenTastenkuerzel: true,
      normScrollen: handler,
    });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const anmelden = vi.spyOn(window, 'addEventListener');
  const abmelden = vi.spyOn(window, 'removeEventListener');
  try {
    await act(async () => root.render(<Probe handler={alt} />));
    anmelden.mockClear();
    abmelden.mockClear();
    await act(async () => root.render(<Probe handler={neu} />));
    expect(anmelden.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(0);
    expect(abmelden.mock.calls.filter(([name]) => name === 'keydown')).toHaveLength(0);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })));
    expect(neu).toHaveBeenCalledExactlyOnceWith('xml-1');
    expect(alt).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
  }
});

it('lädt Favoriten bei ausgeschalteten Kürzeln und schaltet alle drei Tastengruppen sofort um', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const gesetz = gesetzMitNormen(Array.from({ length: 53 }, (_, i) => `§ ${i + 1}`));
  laden.mockResolvedValue(Array.from({ length: 53 }, (_, i) => String(i + 1)));
  const scrollen = vi.fn();
  function Probe({ aktiv }: { aktiv: boolean }) {
    const { favoritenEintraege } = useFavoritenleiste({
      gesetz,
      favoritenVersion: 0,
      normScrollen: scrollen,
      seitenleistenTastenkuerzel: aktiv,
    });
    return <span>{favoritenEintraege.length}</span>;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    for (const aktiv of [false, true, false]) {
      await act(async () => root.render(<Probe aktiv={aktiv} />));
      expect(host.textContent).toBe('53');
      scrollen.mockClear();
      for (const zusatz of [{}, { shiftKey: true, key: 'A' }, { altKey: true }]) {
        const e = new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          cancelable: true,
          ...zusatz,
        });
        await act(async () => window.dispatchEvent(e));
        expect(e.defaultPrevented).toBe(aktiv);
      }
      expect(scrollen).toHaveBeenCalledTimes(aktiv ? 3 : 0);
      if (aktiv) expect(scrollen.mock.calls.map(([id]) => id)).toEqual(['0', '26', '52']);
    }
  } finally {
    await act(async () => root.unmount());
  }
});
