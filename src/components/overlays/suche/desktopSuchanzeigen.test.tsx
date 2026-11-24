// @vitest-environment jsdom
// desktopSuchanzeigen.test.tsx
// Allgemeine Desktop-Suchanzeigen schützen Normangaben ohne Trefferaktionen zu verändern.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TrefferZeile } from './OeffnenTrefferZeile';
import { SuchleisteKeinErgebnis } from './SuchleisteKeinErgebnis';

vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => ({ istMac: false }) }));
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => vi.unstubAllGlobals());

it('schützt vollständige Treffertexte und Normhinweise bei ursprünglicher Auswahl', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onClick = vi.fn();
  const onMausBewegung = vi.fn();
  await act(async () =>
    root.render(
      <TrefferZeile
        idx={2}
        treffer={{
          art: 'index',
          quelle: 'de-bund',
          eintrag: {
            kurztitel: 'Art. 1',
            langtitel: 'Gesetz zu § 9999 Abs. 1',
            abrufkennung: 'original.xml',
            praefixstruktur: 'gliederungsartikel',
          },
        }}
        markiert
        artikelNummer="229"
        anfrage={{
          normNummer: '3',
          artikelNummer: '229',
          erwaegungsgrundNummer: null,
          gesetzQuery: 'G',
        }}
        onClick={onClick}
        onMausBewegung={onMausBewegung}
      />,
    ),
  );
  expect(host.textContent).toContain('Art.\u00a0229');
  expect(host.textContent).toContain('§\u00a03');
  expect(host.textContent).toContain('Art.\u00a01');
  expect(host.textContent).toContain('Gesetz zu §\u00a09999 Abs.\u00a01');
  expect(host.querySelector('kbd')?.title).toBe(
    'Wird bei Auswahl von gesetze-im-internet.de importiert',
  );
  expect(host.textContent).toContain('neuer Tab');
  await act(async () => {
    host.querySelector<HTMLElement>('[data-idx="2"]')!.click();
    host
      .querySelector<HTMLElement>('[data-idx="2"]')!
      .dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  });
  expect(onClick).toHaveBeenCalledOnce();
  expect(onMausBewegung).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});

it('schützt Meldung einschließlich mehrfacher Abstände', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<SuchleisteKeinErgebnis text="§  9999 fehlt" />));
  expect(host.textContent).toBe('§\u00a0\u00a09999 fehlt');
  await act(async () => root.unmount());
});
