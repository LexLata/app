// @vitest-environment jsdom
// Tatsächlicher Suchabschluss nach technischen Fehlern der nativen Startanmeldung.
import { expect, it, vi } from 'vitest';
import { startaufgabenGrenze } from './startaufgabenNativeGrenze';
import type { SuchOverlayVorbelegung } from '@/lib/domain/appTypes';
async function richteStartfehlerEin(n: ReturnType<typeof startaufgabenGrenze>, befehl: string) {
  let abgelehnt = false;
  let uebernehmen = false;
  let freigeben = () => {};
  let altenEmpfangBeenden = () => Promise.resolve();
  const spaet = befehl === 'spätere Übernahme';
  const ablehnen = () => {
    abgelehnt = true;
    return Promise.reject(new Error('Startanmeldung abgelehnt'));
  };
  n.vorListener((_label, name) =>
    befehl === 'Listener' && name === 'startaufgaben-verfuegbar' ? ablehnen() : undefined,
  );
  n.vorBefehl((label, name) =>
    name === befehl || (uebernehmen && label === 'zweites' && name === 'startaufgaben_lesen')
      ? ablehnen()
      : undefined,
  );
  if (spaet) {
    const warten = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    n.vorLesen((label, pfad) =>
      label === 'main' && pfad.startsWith('resources/importindizes/') ? warten : undefined,
    );
    const a = await n.kontext('main');
    const e = a.start.empfangeAppStartAufgaben(() => {});
    altenEmpfangBeenden = e.abmelden;
    await e.bereit;
  }
  await n.kontext(spaet ? 'zweites' : 'main');
  return {
    get abgelehnt() {
      return abgelehnt;
    },
    uebernehmen: async () => {
      if (!spaet) return;
      await vi.waitFor(() =>
        expect(
          n.protokoll.some(
            (p) => p.label === 'zweites' && p.name === 'startaufgaben_lesen_abgeschlossen',
          ),
        ).toBe(true),
      );
      uebernehmen = true;
      void altenEmpfangBeenden();
      n.zerstoeren('main');
    },
    beenden: async () => {
      freigeben();
      await altenEmpfangBeenden();
    },
  };
}
it.each([
  'Listener',
  'startaufgaben_anmelden',
  'startaufgaben_fortschritt',
  'startaufgaben_lesen',
  'startaufgaben_abschliessen',
  'spätere Übernahme',
])(
  'beendet einen wartenden Öffnen-Link bei technischer Ablehnung von %s mit konkretem Fehler',
  async (befehl) => {
    const n = startaufgabenGrenze();
    const szenario = await richteStartfehlerEin(n, befehl);
    const { act, createElement, useRef, useEffect, useState, useCallback } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useAppTabs } = await import('@/hooks/tabs/useAppTabs');
    const { useFensterRestore } = await import('@/hooks/fenster/useFensterRestore');
    const { useFensterstartInitialisierung } =
      await import('@/hooks/useFensterstartInitialisierung');
    const { useOeffnenLinkNavigation } = await import('@/hooks/fenster/useOeffnenLinkNavigation');
    const oeffnen = vi.fn();
    function Fenster() {
      const tabs = useAppTabs();
      const fensterRestore = useFensterRestore(
        tabs.tabs,
        tabs.aktiverTabId,
        tabs.tabsRef,
        tabs.aktiverTabIdRef,
        tabs.verlaufLesen,
        tabs.verlaufSetzen,
        tabs.uebernehmeTabGesetz,
      );
      const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
      const { startAbgeschlossen: gestartet } = useFensterstartInitialisierung({
        ...tabs,
        // Dieser Start fordert keine Tabwiederöffnung an.
        tabWiederherstellen: () => {},
        fensterRestore,
        importindexVorbereitungRef,
        leseAppStartZiel: async () => null,
        oeffneTiefenLinkZiel: () => {},
      });
      const [meldung, setMeldung] = useState('wartend');
      const [beendet, setBeendet] = useState(false);
      const zeigeSuchfehler = useCallback(
        (zustand: SuchOverlayVorbelegung) =>
          setMeldung(typeof zustand === 'string' ? zustand : (zustand.meldung ?? 'ohne Meldung')),
        [],
      );
      const ausfuehren = useOeffnenLinkNavigation({ importindexVorbereitungRef, zeigeSuchfehler });
      const begonnen = useRef(false);
      useEffect(() => {
        if (!gestartet || begonnen.current) return;
        begonnen.current = true;
        void ausfuehren(
          { type: 'oeffnen', suchtext: '999 BGB' },
          () => Promise.resolve(true),
          oeffnen,
        ).then(setBeendet);
      }, [gestartet, ausfuehren]);
      return createElement('output', null, `${beendet ? 'beendet' : 'wartend'}: ${meldung}`);
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const fehlerprotokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => root.render(createElement(Fenster)));
      await szenario.uebernehmen();
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(container.textContent).toBe('beendet: Importangebote konnten nicht geladen werden.');
      });
      expect(szenario.abgelehnt).toBe(true);
      expect(n.schritt).toBe(0);
      expect(oeffnen).not.toHaveBeenCalled();
      expect(n.protokoll.some((p) => p.name === 'gesetz_dateistempel_lesen')).toBe(false);
    } finally {
      await act(async () => root.unmount());
      await szenario.beenden();
      fehlerprotokoll.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);
