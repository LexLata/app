// @vitest-environment jsdom
// Bedient die echte Neuprüfung mit nativen Abschlussfehlern und beobachtet ihren Aktionsfehler.
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { expect, it, vi } from 'vitest';

it.each([true, false])(
  'meldet im Formular das endgültige Ergebnis der Neuprüfung (Erfolg: %s)',
  async (erfolgreich) => {
    vi.resetModules();
    vorbereiten();
    const markierungen = await import('@/lib/markierungen/markierungen.index');
    const banner = await import('@/lib/banner/banner.index');
    banner.alleBannerSchliessen();
    markierungen.initialisiereMarkierungen();
    io.dateien.set('markierungskonflikte.xml', '<markierungskonflikte pruefstatus="ausstehend"/>');
    const nativ = io.invoke.getMockImplementation();
    if (!nativ) throw new Error('Native Grenze fehlt.');
    let ersterAbschluss = true;
    let uebernommen = false;
    io.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'pruefvorgang_wiederholung_uebernehmen') {
        if (uebernommen) return false;
        uebernommen = true;
        return true;
      }
      if (
        befehl === 'pruefvorgang_vollpruefung_abschliessen' &&
        (ersterAbschluss || !erfolgreich)
      ) {
        ersterAbschluss = false;
        throw new Error('Abschluss nicht bestätigt');
      }
      return nativ(befehl, args);
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { createElement, act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useKonfliktaktionslauf } = await import('./useKonfliktaktionslauf');
    const nichts = () => {};
    function Anzeige() {
      const lauf = useKonfliktaktionslauf({
        auswahl: null,
        gesetze: [],
        wirdGeladen: false,
        aktionsAbschlussOffen: false,
        onAlleGeprueft: async () => {},
        onErfolgreicherImport: nichts,
        verknuepfungsMeldung: null,
        verknuepfungsFehler: null,
        setVerknuepfungsFehler: nichts,
        setAllgemeineRueckmeldung: nichts,
        setHilfeOffen: nichts,
      });
      return createElement(
        'div',
        {},
        createElement('button', { onClick: lauf.alleMarkierungenNeuPruefen }, 'Neu prüfen'),
        createElement('p', {}, lauf.aktionsFehler?.text),
      );
    }
    const dom = document.createElement('div');
    document.body.appendChild(dom);
    const root = createRoot(dom);
    try {
      await act(async () => root.render(createElement(Anzeige)));
      await act(async () => {
        const knopf = dom.querySelector('button');
        if (!knopf) throw new Error('Neuprüfung fehlt.');
        knopf.click();
      });
      await vi.waitFor(() => {
        expect(io.dateien.get('markierungskonflikte.xml')).toContain(
          `pruefstatus="${erfolgreich ? 'aktuell' : 'fehlgeschlagen'}"`,
        );
        if (!erfolgreich) expect(dom.querySelector('p')?.textContent).toBeTruthy();
      });
      expect(dom.querySelector('p')?.textContent).toBe(
        erfolgreich ? '' : 'Die Markierungen konnten nicht vollständig geprüft werden.',
      );
      expect(banner.getSnapshot()).toEqual([]);
    } finally {
      await act(async () => root.unmount());
      dom.remove();
      vi.unstubAllGlobals();
    }
  },
);
