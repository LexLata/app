// @vitest-environment jsdom
// euEinstellungen.test.ts
// Gemeinsame Lese-, Hook- und Exportverträge der EU-Einstellungen.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEuFassung } from '@/hooks/einstellungen/useEuFassung';
import { useEuDurchfuehrungsaktSuche } from '@/hooks/einstellungen/useEuDurchfuehrungsaktSuche';
import {
  EU_DURCHFUEHRUNGSAKT_SUCHE_KEY,
  baueEinstellungenXML,
  leseEuFassung,
  wendeEinstellungenXMLAn,
} from '@/lib/einstellungen/einstellungen.index';
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
it.each([null, 'falsch', 'original', 'konsolidiert', 'konsolidiert-mit-erwaegungsgruenden'])(
  'Hook und synchrones Lesen stimmen bei %s überein',
  async (roh) => {
    if (roh !== null) localStorage.setItem('lexlata.euFassung', roh);
    let zustand!: ReturnType<typeof useEuFassung> & ReturnType<typeof useEuDurchfuehrungsaktSuche>;
    function Ansicht() {
      zustand = { ...useEuFassung(), ...useEuDurchfuehrungsaktSuche() };
      return null;
    }
    await act(async () => root.render(createElement(Ansicht)));
    expect(zustand.euFassung).toBe(leseEuFassung());
    expect(zustand.euFassung).toBe(
      roh === 'original' || roh === 'konsolidiert' ? roh : 'konsolidiert-mit-erwaegungsgruenden',
    );
    expect(zustand.euDurchfuehrungsaktSuche).toBe(false);
    await act(async () => {
      zustand.setEuFassung('konsolidiert-mit-erwaegungsgruenden');
      zustand.setEuDurchfuehrungsaktSuche(true);
    });
    expect(localStorage.getItem(EU_DURCHFUEHRUNGSAKT_SUCHE_KEY)).toBe('true');
    const xml = baueEinstellungenXML();
    expect(xml).toContain('<euFassung>konsolidiert-mit-erwaegungsgruenden</euFassung>');
    expect(xml).toContain('<euDurchfuehrungsaktSuche>true</euDurchfuehrungsaktSuche>');
    localStorage.clear();
    await act(async () => wendeEinstellungenXMLAn(xml));
    expect(zustand.euFassung).toBe('konsolidiert-mit-erwaegungsgruenden');
    expect(zustand.euDurchfuehrungsaktSuche).toBe(true);
    expect(leseEuFassung()).toBe('konsolidiert-mit-erwaegungsgruenden');
  },
);
