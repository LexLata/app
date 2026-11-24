// @vitest-environment jsdom
// Favoriten-Tasten lesen den echten Einführungsmarker bei unverändertem Dateispeicher.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { umschaltenFavorit } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { EinfuehrungsOverlay } from '@/components/einfuehrung/EinfuehrungsOverlay';
import { useFavoritenleiste } from './useFavoritenleiste';
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
afterEach(() => vi.unstubAllGlobals());
it('Favoriten-Tasten folgen in allen Teilaktionen der Normwechsel-Spalte und bleiben außerhalb frei', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  nativeAttrappeZuruecksetzen();
  const gesetz = gesetzDarstellung({
    elemente: [
      { typ: 'norm', data: normaleNorm({ id: 'n1', xmlId: 'xml-1', bezeichnung: '§ 1' }) },
    ],
  });
  await umschaltenFavorit(gesetz, '1');
  const scrollen = vi.fn();
  function Probe({ teilaktion }: { teilaktion: number | null }) {
    const { favoritenEintraege } = useFavoritenleiste({
      gesetz,
      favoritenVersion: 0,
      seitenleistenTastenkuerzel: true,
      normScrollen: scrollen,
    });
    return (
      <>
        <span>{favoritenEintraege.length}</span>
        {teilaktion !== null && (
          <EinfuehrungsOverlay
            teilaktion={teilaktion}
            fertig={teilaktion === 8}
            appName="LexLata"
            istAktuellFavorit
            onFertig={() => {}}
            onUeberspringen={() => {}}
          />
        )}
      </>
    );
  }
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  try {
    for (const teilaktion of [0, 1, 2, 3, 4, 5, 6, 7, 8, null]) {
      await act(async () => root.render(<Probe teilaktion={teilaktion} />));
      await vi.waitFor(() => expect(host.querySelector('span')?.textContent).toBe('1'));
      scrollen.mockClear();
      await act(async () =>
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })),
      );
      expect(scrollen.mock.calls, `Teilaktion ${teilaktion}`).toEqual(
        [2, 4, 5, 6, 7, 8, null].includes(teilaktion) ? [['xml-1']] : [],
      );
    }
    await act(async () => root.render(<Probe teilaktion={null} />));
    host.setAttribute('data-overlay-aktiv', '');
    scrollen.mockClear();
    await act(async () =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })),
    );
    expect(scrollen).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
