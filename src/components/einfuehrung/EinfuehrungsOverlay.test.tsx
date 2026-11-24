// @vitest-environment jsdom
// EinfuehrungsOverlay.test.tsx
// Prüft vollständige Texte und Inlinehinweise bei unveränderten Abschlussaktionen.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiGroesseContext } from '@/hooks/einstellungen/useUiGroesse';
import { afterEach, expect, it, vi } from 'vitest';
import { EINFUEHRUNGS_TEILAKTIONEN } from './EinfuehrungsOverlay.teilaktionen';
import { EinfuehrungsOverlay } from './EinfuehrungsOverlay';
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
afterEach(() => vi.unstubAllGlobals());
it('schützt Teilaktionstexte, Inlinehinweise und den zusammengesetzten Abschluss bei erhaltenen Aktionen', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const ueberspringen = vi.fn();
  const fertig = vi.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  const props = {
    teilaktion: 0,
    fertig: false,
    appName: '§ 9999',
    istAktuellFavorit: false,
    onUeberspringen: ueberspringen,
    onFertig: fertig,
  };
  try {
    await act(async () => root.render(<EinfuehrungsOverlay {...props} />));
    expect(host.textContent).toContain('Schritt 1 von 5');
    for (const el of host.querySelectorAll<HTMLElement>('[style]')) {
      if (el.style.fontSize && el.style.fontSize.endsWith('px')) {
        expect(el.style.fontSize).toBe('15px');
      }
    }
    expect(host.textContent).toContain('Alternativ: eine Zahl eingeben oder ⌘\u202fO drücken.');
    for (const [teilaktion, zahl] of [1, 2, 3, 3, 4, 5, 5, 5].entries()) {
      await act(async () =>
        root.render(<EinfuehrungsOverlay {...props} teilaktion={teilaktion} />),
      );
      expect(host.textContent).toContain(`Schritt ${zahl} von 5`);
      expect(host.firstElementChild?.hasAttribute('data-overlay-aktiv')).toBe(
        [0, 1, 3].includes(teilaktion),
      );
    }
    await act(async () => root.render(<EinfuehrungsOverlay {...props} teilaktion={2} />));
    expect(host.textContent).toContain('Schritt 3 von 5');
    expect(host.textContent).toContain(
      'Die geöffnete Norm ist jetzt ausgewählt – zu erkennen am blauen Zeiger',
    );
    expect(host.textContent).toContain(
      'Klicken Sie auf den Stern, um sie als Favorit zu speichern.',
    );
    expect(host.querySelectorAll('br')).toHaveLength(1);
    expect(host.querySelector('[aria-hidden="true"]')).not.toBeNull();
    await act(async () =>
      root.render(<EinfuehrungsOverlay {...props} teilaktion={2} istAktuellFavorit />),
    );
    expect(host.textContent).toContain('Schritt 3 von 5');
    expect(host.textContent).toContain(
      'Klicken Sie auf den ausgefüllten Stern, um den Favorit wieder zu löschen.',
    );
    await act(async () => root.render(<EinfuehrungsOverlay {...props} teilaktion={4} />));
    expect(host.textContent).toContain('Schritt 4 von 5');
    await act(async () => root.render(<EinfuehrungsOverlay {...props} teilaktion={6} />));
    expect(host.textContent).toContain(
      'Eingeklappte Elemente werden blasser dargestellt. Klicken Sie auf dieses Symbol',
    );
    expect(host.textContent).toContain(', um schrittweise alles einzuklappen.');
    const symbol = host.querySelector('svg');
    expect(symbol?.getAttribute('width')).toBe('1em');
    expect(symbol?.getAttribute('stroke')).toBe('currentColor');
    expect(symbol?.querySelectorAll('path')).toHaveLength(2);
    const rahmen = [...host.querySelectorAll<HTMLElement>('[style]')].filter((el) =>
      el.style.border.includes('var(--akzent-blass)'),
    );
    expect(rahmen).toHaveLength(2);
    for (const element of rahmen)
      expect(element.style.border).toBe('3px solid var(--akzent-blass)');

    await act(async () => root.render(<EinfuehrungsOverlay {...props} teilaktion={3} />));
    expect(host.textContent).toContain(
      'Der Stern ist ausgefüllt, wenn die ausgewählte Norm ein Favorit ist.',
    );
    expect(host.textContent).not.toContain('per Taste');
    expect(host.textContent).not.toContain('ersten Favoriten');
    await act(async () => host.querySelector('button')!.click());
    expect(ueberspringen).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<EinfuehrungsOverlay {...props} teilaktion={8} fertig />));
    expect(host.textContent).toContain('Einführung abgeschlossen');
    expect(host.firstElementChild?.hasAttribute('data-overlay-aktiv')).toBe(false);
    expect(host.textContent).toContain(
      'Sie kennen jetzt die wichtigsten Funktionen. Viel Freude mit §\u00a09999.',
    );
    await act(async () => host.querySelector('button')!.click());
    expect(fertig).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<EinfuehrungsOverlay {...props} teilaktion={6} />));
    expect(host.firstElementChild!.hasAttribute('data-overlay-aktiv')).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});

it('zeigt den Verbindungshinweis nur bei fehlender Verbindung in Teilaktion 1', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    for (const teilaktion of [0, 1, 2, 8]) {
      for (const keineVerbindung of [true, false]) {
        await act(async () =>
          root.render(
            <EinfuehrungsOverlay
              teilaktion={teilaktion}
              fertig={teilaktion === 8}
              appName="LexLata"
              istAktuellFavorit={false}
              keineVerbindung={keineVerbindung}
              onUeberspringen={() => {}}
              onFertig={() => {}}
            />,
          ),
        );
        expect(
          host.textContent?.includes('Ohne Internetverbindung lässt sich das Gesetz nicht laden.'),
        ).toBe(teilaktion === 1 && keineVerbindung);
      }
    }
  } finally {
    await act(async () => root.unmount());
  }
});

it.each([
  [0.9, 13],
  [1, 15],
  [1.15, 17],
])('skaliert alle Einführungstexte mit 1,15 und dem UI-Faktor %s', (faktor, erwartet) => {
  for (const fertig of [false, true]) {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <UiGroesseContext.Provider value={{ uiGroesse: 'normal', setUiGroesse: () => {}, faktor }}>
          <EinfuehrungsOverlay
            teilaktion={fertig ? 8 : 0}
            fertig={fertig}
            appName="LexLata"
            istAktuellFavorit={false}
            onUeberspringen={() => {}}
            onFertig={() => {}}
          />
        </UiGroesseContext.Provider>,
      ),
      'text/html',
    );
    const texte = [...doc.querySelectorAll<HTMLElement>('[style]')].filter((el) =>
      el.style.fontSize.endsWith('px'),
    );
    expect(texte.length).toBeGreaterThanOrEqual(3);
    expect(texte.every((el) => el.style.fontSize === `${erwartet}px`)).toBe(true);
  }
});

it('enthält in keiner Teilaktion mehr Favoritentasten oder Tastenkappen-Tokens', () => {
  for (const teilaktion of EINFUEHRUNGS_TEILAKTIONEN) {
    expect(teilaktion.haupttext + (teilaktion.zusatztext ?? '')).not.toMatch(
      /\{taste:|per Taste|ersten Favoriten/,
    );
  }
});
