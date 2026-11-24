// @vitest-environment jsdom
// Installierte Suchtreffer bleiben während echter Importindexvorbereitung nutzbar; nur native Grenzen ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { OeffnenOverlay } from '@/components/overlays/overlays.index';
import { useImportindizesBereithalten } from '@/hooks/useImportindizesBereithalten';
import { suchverzeichnisTestdatei } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { importindexFixture } from './europaImportFixtures';
const vorbereitung = { current: Promise.resolve() };
function Suche() {
  const bereit = useImportindizesBereithalten(true, vorbereitung);
  return (
    <div data-bereit={bereit}>
      <OeffnenOverlay
        gesetze={[]}
        aktivesGesetz={null}
        initialInput="Mess"
        onSchliessen={() => {}}
        onInstalliertOeffnen={() => {}}
        onGesetzOeffnen={() => {}}
        onNeuenTabOeffnen={() => {}}
      />
    </div>
  );
}
it('zeigt installierte Gesetze sofort, ausstehende Importangebote ausdrücklich und nach dem Bereithalten den vollständigen Suchbestand', async () => {
  nativeAttrappeZuruecksetzen();
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  io.dateien.set(
    'cache/suchverzeichnis.json',
    suchverzeichnisTestdatei([
      {
        kurztitel: 'MessInstalliert',
        normgeber: 'de-bund',
        langtitel: 'Installiert',
        hatGliederungsartikel: false,
        elemente: [],
      },
    ]),
  );
  for (const name of ['de-bund', 'de-bw', 'eu']) {
    io.dateien.set(
      `importindizes/${name}.xml`,
      importindexFixture(
        name,
        name === 'de-bund'
          ? '<gesetz><kurztitel>MessImportiert</kurztitel><langtitel>Importangebot</langtitel><abrufkennung>mess.xml</abrufkennung></gesetz>'
          : '',
      ),
    );
    if (name !== 'eu')
      io.dateien.set(
        `resources/praefixstrukturen/${name}.xml`,
        `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>${name}</normgeber></infos><inhalt/></praefixstrukturen>`,
      );
  }
  io.dateien.set('resources/europa/europaKuratiert.json', '[]');
  let weiter = () => {};
  const warten = new Promise<void>((r) => {
    weiter = r;
  });
  io.vorLesen = (pfad) => (pfad.includes('/importindizes/') ? warten : undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Suche />));
    await vi.waitFor(() => expect(container.textContent).toContain('MessInstalliert'));
    expect(container.textContent).toContain('Importangebote werden geladen');
    expect(container.textContent).not.toContain('MessImportiert');
    expect(container.querySelector('[data-bereit]')?.getAttribute('data-bereit')).toBe('false');
    await act(async () => weiter());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.querySelector('[data-bereit]')?.getAttribute('data-bereit')).toBe('true');
    });
    expect(container.textContent).toContain('MessInstalliert');
    expect(container.textContent).toContain('MessImportiert');
    expect(container.textContent).not.toContain('Importangebote werden geladen');
  } finally {
    weiter();
    await act(async () => root.unmount());
    container.remove();
    if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    vi.unstubAllGlobals();
  }
});
