// @vitest-environment jsdom
// Vollständiges Konfliktfenster: native, gerichtete und Escape-Schließwünsche warten auf Aktionen und Hinweise.
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  markierungsFensterNativeAttrappe,
  markierungsFensterBedienung,
  bereiteMarkierungsFensterDateienVor,
  bereiteMarkierungsFensterPruefverwaltungVor,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';

const m = markierungsFensterNativeAttrappe();
const dom = domTestWurzel();
const { knopf } = markierungsFensterBedienung(() => dom.host);
const n = vi.hoisted(() => ({
  destroy: vi.fn(),
  nativeAnfrage: undefined as undefined | ((e: { preventDefault: () => void }) => Promise<void>),
}));

beforeEach(async () => {
  // Browser-Geometrie als externe Grenze; diese Tests beginnen nach der Erklärung.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.setItem('lexlata.markierungskonfliktErklaerungGelesen', 'true');
  vi.resetModules();
  vi.doUnmock('@/hooks/fenster/useSchliessenAnfrageSchliesstFenster');
  vi.doMock('@tauri-apps/api/core', () => ({ invoke: m.invoke, isTauri: () => true }));
  vi.doMock('@tauri-apps/api/window', () => ({
    getCurrentWindow: () => ({
      get label() {
        return m.label;
      },
      close: m.close,
      destroy: n.destroy,
      setTitle: async () => {},
      onCloseRequested: async (callback: typeof n.nativeAnfrage) => {
        n.nativeAnfrage = callback;
        return () => {
          n.nativeAnfrage = undefined;
        };
      },
    }),
  }));
  vi.clearAllMocks();
  m.dateien.clear();
  m.empfang.clear();
  m.label = 'markierungskonflikte';
  bereiteMarkierungsFensterDateienVor();
  bereiteMarkierungsFensterPruefverwaltungVor();
  m.close.mockImplementation(async () => {
    await n.nativeAnfrage?.({ preventDefault() {} });
  });
  m.dateien.set(
    'markierungen/BGB_de-bund-markierungen.xml',
    '<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><elementstand><textlaenge>99</textlaenge></elementstand><kommentartext>Kommentar</kommentartext></kommentar></inhalt></markierungen>',
  );
  m.dateien.set('markierungskonflikte.xml', '<markierungskonflikte pruefstatus="aktuell"/>');
  const markierungen = await import('@/lib/markierungen/markierungen.index');
  markierungen.initialisiereMarkierungen();
  await markierungen.pruefeAlleMarkierungen(() => {});
});

function tor() {
  let freigeben!: () => void;
  const wartet = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  return { wartet, freigeben };
}
async function starten() {
  const Fenster = (await import('./MarkierungskonfliktFenster')).default;
  await act(async () => dom.root.render(<Fenster />));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(knopf('Alle Markierungen neu prüfen')?.disabled).toBe(false);
  });
}
async function schliesswunsch(weg: string) {
  await act(async () => {
    if (weg === 'nativ') {
      const verhindern = vi.fn();
      void n.nativeAnfrage?.({ preventDefault: verhindern });
      expect(verhindern).toHaveBeenCalledOnce();
    }
    if (weg === 'gerichtet') m.empfang.get('schliessen-anfrage')?.({ payload: undefined });
    if (weg === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
}
it.each(['nativ', 'gerichtet', 'Escape'])(
  '%s wartet auf die vollständige Prüfaktion und Hinweisannahme',
  async (weg) => {
    await starten();
    expect(n.nativeAnfrage).toBeTypeOf('function');
    const pruefknopf = knopf('Alle Markierungen neu prüfen');
    const arbeit = tor();
    const annahme = tor();
    let begonnen = false;
    const nativ = m.invoke.getMockImplementation()!;
    m.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'datei_sperre_erwerben' && args.relativerPfad === 'markierungskonflikte.xml') {
        begonnen = true;
        await arbeit.wartet;
      }
      return nativ(befehl, args);
    });
    // Eine tatsächliche Sicherung während der Vollprüfung erzeugt den wichtigen Hinweis.
    m.dateien.set('gesetze/Beschaedigt_unbekannt.xml', '<kaputt>');
    m.hinweise.mockImplementation(() => annahme.wartet);
    await act(async () => pruefknopf.click());
    await vi.waitFor(() => expect(begonnen).toBe(true));
    await schliesswunsch(weg);
    await schliesswunsch(weg);
    expect(n.destroy).not.toHaveBeenCalled();
    const anzahl = m.invoke.mock.calls.length;
    await act(async () => pruefknopf.click());
    expect(m.invoke.mock.calls).toHaveLength(anzahl);
    await act(async () => arbeit.freigeben());
    await vi.waitFor(() => expect(m.hinweise).toHaveBeenCalled());
    expect(n.destroy).not.toHaveBeenCalled();
    await act(async () => annahme.freigeben());
    await vi.waitFor(() => expect(n.destroy).toHaveBeenCalledTimes(1));
  },
);

it.each(['nativ', 'gerichtet', 'Escape'])(
  '%s wartet auch auf Sicherungshinweise des initialen Ladens',
  async (weg) => {
    const annahme = tor();
    m.dateien.set('gesetze/BGB_de-bund.xml', '<defekt>');
    m.hinweise.mockImplementation(() => annahme.wartet);
    const Fenster = (await import('./MarkierungskonfliktFenster')).default;
    await act(async () => dom.root.render(<Fenster />));
    await vi.waitFor(() => expect(m.hinweise).toHaveBeenCalled());
    await schliesswunsch(weg);
    expect(n.destroy).not.toHaveBeenCalled();
    await act(async () => annahme.freigeben());
    await vi.waitFor(() => expect(n.destroy).toHaveBeenCalledTimes(1));
    expect(m.banner).not.toHaveBeenCalled();
  },
);

it('erhält den Hinweis einer schließenden Konfliktaktion bis zum geweckten Hauptfensterempfang', async () => {
  const { empfangeHauptfensterHinweise } =
    await import('@/lib/plattform/fensterkommunikation/fensterkommunikation.index');
  const banner = await import('@/lib/banner/banner.index');
  banner.alleBannerSchliessen();
  const uebergaben: {
    kennung: string;
    hinweis: { text: string; typ: 'info' | 'warnung' | 'fehler' };
  }[] = [];
  const annahme = tor();
  let annahmeBegonnen = false;
  const nativ = m.invoke.getMockImplementation()!;
  m.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'hauptfenster_hinweise_bereit' || befehl === 'hauptfenster_hinweise_abmelden')
      return;
    if (befehl === 'hauptfenster_hinweise_lesen') return [...uebergaben];
    if (befehl === 'hauptfenster_hinweis_bestaetigen') {
      expect(banner.getSnapshot()).toHaveLength(1);
      uebergaben.splice(0);
      return;
    }
    if (befehl === 'hauptfenster_hinweis_senden') {
      annahmeBegonnen = true;
      await annahme.wartet;
      uebergaben.push({ kennung: args.kennung, hinweis: args.hinweis });
      return;
    }
    return nativ(befehl, args);
  });
  const empfang = empfangeHauptfensterHinweise((hinweis) => {
    // Die beiden nativen WebViews haben getrennte Fensterkontexte.
    const absender = m.label;
    m.label = 'main';
    try {
      m.echterBanner({ ...hinweis, art: 'vorgangsergebnis' });
    } finally {
      m.label = absender;
    }
  });
  try {
    await empfang.bereit;
    await starten();
    m.dateien.set('gesetze/Beschaedigt_unbekannt.xml', '<kaputt>');
    await act(async () => knopf('Alle Markierungen neu prüfen').click());
    await vi.waitFor(() => expect(annahmeBegonnen).toBe(true));
    await schliesswunsch('nativ');
    expect(n.destroy).not.toHaveBeenCalled();
    await act(async () => annahme.freigeben());
    await vi.waitFor(() => expect(n.destroy).toHaveBeenCalledOnce());
    expect(uebergaben).toHaveLength(1);
    expect(banner.getSnapshot()).toHaveLength(0);
    await act(async () =>
      m.empfang.get('hauptfenster-hinweise-verfuegbar')!({ payload: undefined }),
    );
    await vi.waitFor(() => expect(banner.getSnapshot()).toHaveLength(1));
    expect(uebergaben).toHaveLength(0);
  } finally {
    empfang.abmelden();
    banner.alleBannerSchliessen();
  }
});
