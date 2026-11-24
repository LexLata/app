// @vitest-environment jsdom
// ErweitertAbschnitt.eu.test.tsx
// Bedienvertrag der EU-Einstellungen im Abschnitt Erweitert: Anzeige und Schreiben über die Hooks.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEuFassung } from '@/hooks/einstellungen/useEuFassung';
import { useEuDurchfuehrungsaktSuche } from '@/hooks/einstellungen/useEuDurchfuehrungsaktSuche';
import {
  EU_DURCHFUEHRUNGSAKT_SUCHE_KEY,
  leseEuFassung,
} from '@/lib/einstellungen/einstellungen.index';
import { ErweitertAbschnitt } from './ErweitertAbschnitt';
// Externe Dateigrenze: Das Backup läuft echt, schreibt aber nicht in den Datenordner.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenSchreiben: async () => {},
  appDatenLoeschen: async () => {},
  appDatenExistiert: async () => false,
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('token'),
}));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
it('zeigt Select und Checkbox und schreibt Änderungen über die Hooks', async () => {
  function Ansicht() {
    const { euFassung, setEuFassung } = useEuFassung();
    const { euDurchfuehrungsaktSuche, setEuDurchfuehrungsaktSuche } = useEuDurchfuehrungsaktSuche();
    return createElement(ErweitertAbschnitt, {
      euFassung,
      onEuFassungAendern: setEuFassung,
      euDurchfuehrungsaktSuche,
      onEuDurchfuehrungsaktSucheAendern: setEuDurchfuehrungsaktSuche,
      minimalistischerModus: false,
      onMinimalistischerModusAendern: vi.fn(),
      nachbereitungBeiImport: 'aus',
      onNachbereitungBeiImportAendern: vi.fn(),
      istLinux: false,
      linuxTitelleistenPraeferenz: null,
      onLinuxTitelleistenPraeferenzAendern: vi.fn(),
      plattformfremdeUiAnzeigen: false,
      onPlattformfremdeUiAnzeigenAendern: vi.fn(),
      zuruecksetzenLaeuft: false,
      onZuruecksetzen: vi.fn(),
    });
  }
  await act(async () => root.render(createElement(Ansicht)));
  expect(container.textContent).toContain('EU-Recht');
  expect(container.querySelector('label[for="eu-fassung-select"]')?.textContent).toBe(
    'Fassung bei Import und Aktualisierung',
  );
  const select = container.querySelector<HTMLSelectElement>('#eu-fassung-select');
  if (!select) throw new Error('Fassungsauswahl fehlt');
  await act(async () => {
    select.value = 'konsolidiert-mit-erwaegungsgruenden';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(leseEuFassung()).toBe('konsolidiert-mit-erwaegungsgruenden');
  const label = Array.from(container.querySelectorAll('label')).find((el) =>
    el.textContent?.includes('Durchführungsrechtsakte in „Gesetz oder Norm öffnen“ anzeigen'),
  );
  const checkbox = label?.querySelector<HTMLInputElement>('input');
  if (!checkbox) throw new Error('Schalter für Durchführungsrechtsakte fehlt');
  await act(async () => checkbox.click());
  expect(localStorage.getItem(EU_DURCHFUEHRUNGSAKT_SUCHE_KEY)).toBe('true');
});
