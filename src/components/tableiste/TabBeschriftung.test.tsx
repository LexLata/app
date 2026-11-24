// @vitest-environment jsdom
// TabBeschriftung.test.tsx
// Schutz an den Tab-Anzeigegrenzen erhält Rohdaten, Layout und Bedienaktionen.
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { TabBeschriftung } from './TabBeschriftung';
import { FremdTabPlatzhalter } from './FremdTabPlatzhalter';
import { Tableiste } from './Tableiste';
import { TableisteFensterButtons } from './Tableiste.fensterButtons';

const roh = 'Art. 1 Abs. 1';
const geschuetzt = 'Art.\u00a01 Abs.\u00a01';
const mocks = vi.hoisted(() => ({
  ziehen: false,
  inline: true,
  menu: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
  maximiert: false,
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => ({ istMac: true }) }));
vi.mock('@/hooks/einstellungen/useLinuxTitelleistenPraeferenz', () => ({
  useLinuxTitelleistenPraeferenz: () => ({ linuxTitelleistenPraeferenz: 'native' }),
}));
vi.mock('@/lib/plattform/tastenkuerzel/tastenkuerzel.index', () => ({
  tastenkuerzelAnzeige: () => 'Art. 1 Abs. 1',
}));
vi.mock('./hamburgerMenu', () => ({ zeigeHamburgerMenu: mocks.menu }));
vi.mock('./hooks/useTabDragUeberFenster', () => ({
  useTabDragUeberFenster: () => ({
    fremdVorschau: { index: 0, zeile1: 'Art. 1 Abs. 1', zeile2: 'Art. 1 Abs. 1' },
    dragBewegungMelden: vi.fn(),
    dragEndeMelden: vi.fn(),
  }),
}));
vi.mock('./hooks/useTableisteScrollFades', () => ({
  useTableisteScrollFades: () => ({ neuerTabButtonPasstInline: mocks.inline }),
}));
vi.mock('./hooks/useTabDragUndReihenfolge', () => ({
  useTabDragUndReihenfolge: ({ onTabAktivieren }: { onTabAktivieren: (id: string) => void }) => ({
    dragZustand: mocks.ziehen
      ? { tabId: 'Art. 1 Abs. 1', klon: { x: 20, y: 20, breite: 200 } }
      : null,
    ausstehendeTabIds: new Set<string>(),
    offsetX: { current: 0 },
    onTabPointerDown: (_event: unknown, id: string) => onTabAktivieren(id),
    startDragWindow: vi.fn(),
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => mocks.maximiert,
    onResized: async () => vi.fn(),
    minimize: mocks.minimize,
    toggleMaximize: mocks.toggleMaximize,
    close: mocks.close,
  }),
}));
const h = domTestWurzel();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ziehen = false;
  mocks.inline = true;
  mocks.maximiert = false;
});

it('schützt beide Tabzeilen trotz nowrap und erhält ihren Stil sowie fehlende Untertitel', async () => {
  await act(async () => h.root.render(<TabBeschriftung titel={roh} untertitel={roh} aktiv />));
  const zeilen = h.host.firstElementChild!.children;
  expect(Array.from(zeilen, (zeile) => zeile.textContent)).toEqual([geschuetzt, geschuetzt]);
  expect((zeilen[0] as HTMLElement).style.whiteSpace).toBe('nowrap');
  expect((zeilen[0] as HTMLElement).style.fontSize).toBe('12px');
  await act(async () => h.root.render(<TabBeschriftung titel={roh} />));
  expect(h.host.firstElementChild!.children).toHaveLength(1);
});

it('schützt den Fremdtab ohne dessen Layout oder Rohprops zu verändern', async () => {
  await act(async () => h.root.render(<FremdTabPlatzhalter zeile1={roh} zeile2={roh} />));
  expect(h.host.textContent).toBe(geschuetzt.repeat(2));
  expect((h.host.firstElementChild as HTMLElement).style.pointerEvents).toBe('none');
});

it.each([true, false])(
  'schützt Tooltips und Tabvorschauen mit inline=%s und erhält IDs, Klicks und Menüref',
  async (inline) => {
    mocks.inline = inline;
    const aktivieren = vi.fn();
    const schliessen = vi.fn();
    const neuerTab = vi.fn();
    const zurueck = vi.fn();
    const vorwaerts = vi.fn();
    const props = {
      tabs: [{ id: roh }],
      aktiverTabId: roh,
      tabTitel: { [roh]: roh },
      onTabAktivieren: aktivieren,
      onTabSchliessen: schliessen,
      onTabsNeuAnordnen: vi.fn(),
      onUebersichtOeffnen: vi.fn(),
      onNeuenTabOeffnen: neuerTab,
      plattformfremdeUiAnzeigen: true,
      onTabHerausziehen: vi.fn(),
      onTabInFensterAufnehmen: vi.fn(),
      fremdVorschauIndexRef: { current: null },
      minimalistischerModus: false,
      kannVerlaufZurueck: true,
      kannVerlaufVorwaerts: true,
      onVerlaufZurueck: zurueck,
      onVerlaufVorwaerts: vorwaerts,
    };
    await act(async () => h.root.render(<Tableiste {...props} />));
    const tab = h.host.querySelector('[data-tab-id]')!;
    expect(tab.getAttribute('data-tab-id')).toBe(roh);
    expect(tab.textContent).toBe(`Neuer Tab${geschuetzt}`);
    const buttons = Array.from(h.host.querySelectorAll('button'));
    expect(buttons[0]!.title).toBe(`Im Verlauf zurück (${geschuetzt})`);
    expect(buttons[1]!.title).toBe(`Im Verlauf vorwärts (${geschuetzt})`);
    expect(buttons[3]!.title).toBe(`Neuer Tab (${geschuetzt})`);
    await act(async () => {
      tab.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      buttons.forEach((button) => button.click());
    });
    expect(aktivieren).toHaveBeenCalledWith(roh);
    expect(schliessen).toHaveBeenCalledWith(roh);
    expect(neuerTab).toHaveBeenCalledOnce();
    expect(zurueck).toHaveBeenCalledOnce();
    expect(vorwaerts).toHaveBeenCalledOnce();
    expect(mocks.menu).toHaveBeenCalledWith(buttons[4]);
    mocks.ziehen = true;
    await act(async () => h.root.render(<Tableiste {...props} />));
    expect(h.host.querySelector('div[style*="position: fixed"]')!.textContent).toBe(
      `Neuer Tab${geschuetzt}`,
    );
    expect(h.host.textContent).toContain(geschuetzt.repeat(2));
  },
);

it.each([true, false])(
  'erhält Fensteraktionen und Maximiert-Tooltip bei maximiert=%s',
  async (maximiert) => {
    mocks.maximiert = maximiert;
    await act(async () => h.root.render(<TableisteFensterButtons />));
    const buttons = Array.from(h.host.querySelectorAll('button'));
    expect(buttons.map((button) => button.title)).toEqual([
      'Minimieren',
      maximiert ? 'Wiederherstellen' : 'Maximieren',
      'Schließen',
    ]);
    await act(async () => {
      for (const button of buttons) {
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    expect(mocks.minimize).toHaveBeenCalledOnce();
    expect(mocks.toggleMaximize).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  },
);
