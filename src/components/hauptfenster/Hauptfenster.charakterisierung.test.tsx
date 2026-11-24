import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// @vitest-environment jsdom
// Charakterisiert vor dem Schnitt die App-Anbindung, Einstellungen und Reihenfolge der Starteffekte.

import { gesetzesreferenzSchluessel, referenzVon } from '@/lib/domain/gesetzesreferenz';
import { act, useEffect, type ComponentProps } from 'react';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import type { Gesetzestextansicht } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import type { Tableiste } from '@/components/tableiste/Tableiste';
import type { Seitenleistenanordnung } from '@/components/seitenleisten/seitenleisten.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { useHintergrundAktualisierung } from '@/hooks/useHintergrundAktualisierung';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { ladeAnzeigezeitpunkte } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const nativ = vi.hoisted(() => ({
  tabs: null as ReturnType<typeof useAppTabs> | null,
  text: null as ComponentProps<typeof Gesetzestextansicht> | null,
  leiste: null as ComponentProps<typeof Tableiste> | null,
  seitenleisten: null as ComponentProps<typeof Seitenleistenanordnung> | null,
  protokoll: [] as string[],
  aktion: vi.fn(),
  aktivierung: vi.fn(),
  startFertig: false,
}));
vi.mock('@/hooks/utils/usePlattform', () => ({
  usePlattform: () => ({ istLinux: false }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  geschlosseneTabsMenuStatusSynchronisieren: () => {},
}));
vi.mock('@/lib/plattform/menu/menu.index', () => ({
  setzeAktiv: vi.fn(),
  meldeGesetzOffenStatus: vi.fn(),
  registriereMenuZustandAnfrageListener: () => () => {},
}));
vi.mock('@/hooks/tabs/useAppTabs', async (original) => {
  const echt = await original<typeof import('@/hooks/tabs/useAppTabs')>();
  return {
    useAppTabs: () => {
      const tabs = echt.useAppTabs();
      nativ.tabs = tabs;
      return tabs;
    },
  };
});
vi.mock('@/hooks/fenster/useFensterRestore', () => ({
  useFensterRestore: () => {
    useEffect(() => {
      nativ.protokoll.push('restore:mount');
      return () => {
        nativ.protokoll.push('restore:cleanup');
      };
    }, []);
    useEffect(() => {
      nativ.protokoll.push('restore:update');
    });
    return {};
  },
}));
vi.mock('@/hooks/einstellungen/useLinuxTitelleistenPraeferenz', async (original) => ({
  ...(await original<typeof import('@/hooks/einstellungen/useLinuxTitelleistenPraeferenz')>()),
  linuxTitelleistenPraeferenzSofortAnwenden: vi.fn(),
}));
vi.mock('@/hooks/tabs/useGesetzVerwaltung', () => ({
  useGesetzVerwaltung: () => ({ gesetze: [] }),
}));
vi.mock('@/hooks/useLesezeichenUndFavoriten', () => ({
  useLesezeichenUndFavoriten: () => ({
    lesezeichen: [],
    favoritenVersion: 0,
  }),
}));
vi.mock('@/hooks/markierungen/useMarkierungen', () => ({
  useMarkierungen: () => ({
    handleUnterstreichen: nativ.aktion,
    handleHervorheben: nativ.aktion,
    handleMarkierungLoeschen: nativ.aktion,
  }),
}));
vi.mock('@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster', () => ({
  useVerweismarkierungUndKommentarHilfsfenster: () => ({
    handleVerweismarkierungBearbeiten: nativ.aktion,
    handleKommentarBearbeiten: nativ.aktion,
    handleVerweismarkierungAnfrage: nativ.aktion,
    handleKommentarAnfrage: nativ.aktion,
  }),
}));
vi.mock('@/hooks/fenster/useFensterUebertragung', () => ({ useFensterUebertragung: () => ({}) }));
vi.mock('@/hooks/tabs/useGesetzOeffnen', () => ({ useGesetzOeffnen: () => ({}) }));
vi.mock('@/hooks/useAppAktionen', () => ({ useAppAktionen: () => ({}) }));
vi.mock('@/hooks/useTiefenLinks', () => ({
  useTiefenLinks: () => {
    useEffect(() => {
      nativ.protokoll.push('tiefenlinks:mount');
      return () => {
        nativ.protokoll.push('tiefenlinks:cleanup');
      };
    }, []);
    return {};
  },
}));
vi.mock('@/hooks/useFensterstartInitialisierung', () => ({
  useFensterstartInitialisierung: () => {
    useEffect(() => {
      nativ.protokoll.push('beimAppStart:mount');
      return () => {
        nativ.protokoll.push('beimAppStart:cleanup');
      };
    }, []);
    useEffect(() => {
      nativ.protokoll.push('beimAppStart:update');
    });
    return { startAbgeschlossen: nativ.startFertig, startaufgabenBereit: nativ.startFertig };
  },
}));
vi.mock('@/hooks/fenster/useOeffnenLinkNavigation', () => ({
  useOeffnenLinkNavigation: () => {
    useEffect(() => {
      nativ.protokoll.push('oeffnenLink:mount');
      return () => {
        nativ.protokoll.push('oeffnenLink:cleanup');
      };
    }, []);
  },
}));
vi.mock('@/hooks/fenster/useInterneNavigation', () => ({
  useInterneNavigation: () => {
    useEffect(() => {
      nativ.protokoll.push('intern:mount');
      return () => {
        nativ.protokoll.push('intern:cleanup');
      };
    }, []);
    useEffect(() => {
      nativ.protokoll.push('intern:update');
    });
  },
}));
vi.mock('@/hooks/useHintergrundAktualisierung', () => ({
  useHintergrundAktualisierung: vi.fn(() => false),
}));
vi.mock('@/hooks/utils/useTextauswahl', () => ({ useTextauswahl: vi.fn() }));
vi.mock('@/hooks/einfuehrung/useEinfuehrungsAblauf', () => ({
  useEinfuehrungsAblauf: (werte: {
    minimalistischerModus: boolean;
    seitenleistenTastenkuerzel: boolean;
  }) => ({
    einfuehrungAktiv: false,
    meldeEinklappAenderung: nativ.aktion,
    minimalistischerModusEffektiv: werte.minimalistischerModus,
  }),
}));
vi.mock('@/hooks/eingabe/useTastenkuerzel', () => ({ useTastenkuerzel: vi.fn() }));
vi.mock('@/hooks/eingabe/useMenueEvents', () => ({ useMenueEvents: vi.fn() }));
vi.mock('@/components/tableiste/Tableiste', () => ({
  Tableiste: (props: ComponentProps<typeof Tableiste>) => {
    nativ.leiste = props;
    return null;
  },
}));
vi.mock('@/components/hauptfenster/Willkommensansicht', () => ({
  Willkommensansicht: () => <p>Willkommen</p>,
}));
vi.mock('@/components/hauptfenster/OverlayHost', () => ({ AppOverlayHost: () => null }));
// Die echten Seitenleisten rendern; die Attrappe hält nur die übergebenen Werte fest.
vi.mock('@/components/seitenleisten/seitenleisten.index', async (importOriginal) => {
  const echt =
    await importOriginal<typeof import('@/components/seitenleisten/seitenleisten.index')>();
  return {
    ...echt,
    Seitenleistenanordnung: (props: ComponentProps<typeof Seitenleistenanordnung>) => {
      nativ.seitenleisten = props;
      return <echt.Seitenleistenanordnung {...props} />;
    },
  };
});
vi.mock('@/components/hauptfenster/BannerHost', () => ({ BannerHost: () => null }));

vi.mock('@/components/gesetzestextansicht/gesetzestextansicht.index', () => ({
  Gesetzestextansicht: (props: ComponentProps<typeof Gesetzestextansicht>) => {
    nativ.text = props;
    useEffect(() => {
      nativ.protokoll.push('text:mount');
      return () => {
        nativ.protokoll.push('text:cleanup');
      };
    }, []);
    return <p>Gesetzestext</p>;
  },
}));
vi.mock('@/lib/persistenz/nutzerdaten/aktivierungSpeicher', () => ({
  speichereAktivierung: nativ.aktivierung,
}));
const dom = domTestWurzel();
const gesetz: GesetzDarstellung = {
  kurztitel: 'BGB',
  normgeber: 'de-bund',
  langtitel: '',
  hatGliederungsartikel: false,
  elemente: [
    { typ: 'norm', data: normaleNorm({ id: 'n1', xmlId: 'p1', bezeichnung: '§ 1', absaetze: [] }) },
  ],
};
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.clear();
  nativ.protokoll.length = 0;
  nativ.aktion.mockClear();
  nativ.aktivierung.mockClear();
  nativ.text = null;
  nativ.startFertig = false;
});
async function anzeigen() {
  await act(async () => dom.root.render(<App />));
}
async function gesetzAnzeigen() {
  await anzeigen();
  await act(async () => nativ.tabs!.gesetzOeffnen(gesetz, 'p1', 'aktiver-tab'));
}
function pruefeAktualisierungen(aktualisierungen: string[]) {
  expect(aktualisierungen.length).toBeGreaterThan(0);
  expect(aktualisierungen.length % 3).toBe(0);
  for (let i = 0; i < aktualisierungen.length; i += 3)
    expect(aktualisierungen.slice(i, i + 3)).toEqual([
      'restore:update',
      'beimAppStart:update',
      'intern:update',
    ]);
}
it('erhält Mount-, Aktualisierungs- und Aufräumreihenfolge der Starteffekte', async () => {
  await anzeigen();
  expect(nativ.protokoll.slice(0, 8)).toEqual([
    'restore:mount',
    'restore:update',
    'tiefenlinks:mount',
    'oeffnenLink:mount',
    'beimAppStart:mount',
    'beimAppStart:update',
    'intern:mount',
    'intern:update',
  ]);
  // Die Anzahl zusätzlicher React-Abschlüsse ist kein öffentlicher Vertrag;
  // jeder tatsächlich erfolgte Abschluss erhält die Reihenfolge der Starteffekte.
  pruefeAktualisierungen(nativ.protokoll.slice(8));
  nativ.protokoll.length = 0;
  nativ.startFertig = true;
  await anzeigen();
  pruefeAktualisierungen(nativ.protokoll);
  nativ.protokoll.length = 0;
  await act(async () => dom.root.render(null));
  expect(nativ.protokoll).toEqual([
    'restore:cleanup',
    'tiefenlinks:cleanup',
    'oeffnenLink:cleanup',
    'beimAppStart:cleanup',
    'intern:cleanup',
  ]);
});
it('übergibt den Startabschluss und ohne vorbereitetes Suchverzeichnis keine Gesetze an die Hintergrundaktualisierung', async () => {
  await anzeigen();
  expect(useHintergrundAktualisierung).toHaveBeenLastCalledWith(
    expect.objectContaining({ startAbgeschlossen: false, gesetze: [] }),
  );
  nativ.startFertig = true;
  await anzeigen();
  expect(useHintergrundAktualisierung).toHaveBeenLastCalledWith(
    expect.objectContaining({ startAbgeschlossen: true, gesetze: [] }),
  );
});
it('übernimmt gespeicherte Farben und Text-/Anzeigeeinstellungen sowie Änderungen anderer Fenster', async () => {
  const werte = {
    appAkzentfarbe: 'rot',
    hervorhebungsfarbe: 'gelb',
    gesetzestextAkzentfarbe: 'gruen',
    schriftgroesse: '19',
    leistenSchriftgroesse: '15',
    schriftart: 'serif',
    zeilenabstand: '1.7',
    blocksatz: 'true',
    satzNeuZeile: 'false',
    silbentrennung: 'false',
    markierungenDeaktiviert: 'true',
    minimalistischerModus: 'true',
    seitenleistenTastenkuerzel: 'true',
    plattformfremdeUiAnzeigen: 'true',
  };
  for (const [key, wert] of Object.entries(werte)) localStorage.setItem('lexlata.' + key, wert);
  await gesetzAnzeigen();
  expect(document.documentElement.getAttribute('data-app-akzent')).toBe('rot');
  expect(document.documentElement.getAttribute('data-markierungsfarbe')).toBe('gelb');
  expect(document.documentElement.getAttribute('data-gesetzestext-akzent')).toBe('gruen');
  expect(nativ.text).toMatchObject({
    schriftgroesse: 19,
    schriftart: 'serif',
    zeilenabstand: 1.7,
    blocksatz: true,
    satzNeuZeile: false,
    silbentrennungAktiviert: false,
    markierungenDeaktiviert: true,
    minimalistischerModus: true,
  });
  expect(nativ.leiste!.plattformfremdeUiAnzeigen).toBe(true);
  await act(async () => {
    for (const [key, wert] of Object.entries({
      appAkzentfarbe: 'lila',
      hervorhebungsfarbe: 'orange',
      gesetzestextAkzentfarbe: 'pink',
      schriftgroesse: '22',
      minimalistischerModus: 'false',
      markierungenDeaktiviert: 'false',
    })) {
      localStorage.setItem('lexlata.' + key, wert);
      window.dispatchEvent(new StorageEvent('storage', { key: 'lexlata.' + key, newValue: wert }));
    }
  });
  expect(nativ.seitenleisten?.lesezeichen).toMatchObject({
    fontGroesse: 15,
    seitenleistenTastenkuerzel: true,
  });
  expect(document.documentElement.getAttribute('data-app-akzent')).toBe('lila');
  expect(document.documentElement.getAttribute('data-markierungsfarbe')).toBe('orange');
  expect(document.documentElement.getAttribute('data-gesetzestext-akzent')).toBe('pink');
  expect(nativ.text).toMatchObject({
    schriftgroesse: 22,
    minimalistischerModus: false,
    markierungenDeaktiviert: false,
  });
});
it('löscht nach einem Sprung nur dessen Ziel und nur, solange der Tab noch dieses Gesetz zeigt', async () => {
  await gesetzAnzeigen();
  const tabs = nativ.tabs;
  const melden = nativ.text?.onInitialNormScrolled;
  assert(tabs && melden);
  const tab = tabs.aktiverTabId;
  const ziel = () => nativ.tabs?.tabs.find((t) => t.id === tab)?.initialNorm;
  expect(ziel()).toBe('p1');
  await act(async () => melden('p2'));
  expect(ziel()).toBe('p1');
  // Gesetzwechsel im Tab: das neue Ziel bleibt trotz verspäteter Meldung der alten Ansicht.
  await act(async () =>
    tabs.setTabs((liste) =>
      liste.map((t) =>
        t.id === tab
          ? {
              ...t,
              gesetzesreferenz: { kurztitel: 'HGB', normgeber: 'de-bund' },
              initialNorm: 'p1',
            }
          : t,
      ),
    ),
  );
  await act(async () => melden('p1'));
  expect(ziel()).toBe('p1');
});
it('hält die Tabansicht über einen Leertab bereit und baut sie erst bei geändertem Neuaufbauschlüssel neu', async () => {
  await gesetzAnzeigen();
  const tab = nativ.tabs!.aktiverTabId!;
  const key = tab + '-' + gesetzesreferenzSchluessel(gesetz);
  await act(async () => {
    nativ.text!.onScrollIndexChange!(3, 42);
    const aktivierungMelden = nativ.text?.onAktivierung;
    assert(aktivierungMelden);
    aktivierungMelden({ xmlId: 'p1', art: 'schritt' });
    nativ.text!.onEinklappZustandChange!(new Set(['u1']), new Set(['n2']), 'n1');
    nativ.text!.onTabBezeichnung!('§ 1');
    nativ.text!.onFavoritenStatusAendern!({
      istAktuellFavorit: true,
      favoritenleisteSichtbar: true,
      favoritenEintraege: [],
      favoritAufrufen: () => {},
    });
    nativ.text!.onKlappstufenStatusAendern!({
      zuklappen: nativ.aktion,
      aufklappen: nativ.aktion,
      kannZuklappen: true,
      kannAufklappen: true,
    });
    nativ.text!.onInitialNormScrolled!('p1');
  });
  expect(nativ.tabs!.scrollPositionenRef.current[key]).toEqual({ index: 3, offset: 42 });
  expect(nativ.tabs!.einklappZustandRef.current[key]?.aktivesElementId).toBe('n1');
  expect(nativ.aktivierung).toHaveBeenCalledWith(gesetz, gesetz.elemente[0]);
  expect(nativ.tabs!.verlaufLesen(tab)?.aktivesElement).toEqual({
    gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    xmlId: 'p1',
  });
  expect(nativ.leiste!.tabTitel[tab]).toBe('§ 1');
  expect(nativ.tabs!.tabs[0]!.initialNorm).toBeUndefined();
  expect(nativ.seitenleisten?.schnellaktionen).toMatchObject({
    gesetzOffen: true,
    kannZuklappen: true,
  });
  const textbereich = [...dom.host.querySelectorAll('p')].find(
    (el) => el.textContent === 'Gesetzestext',
  );
  await act(async () => nativ.leiste!.onNeuenTabOeffnen());
  expect(dom.host.textContent).toContain('Willkommen');
  expect(nativ.seitenleisten?.schnellaktionen).toMatchObject({
    gesetzOffen: false,
    kannZuklappen: false,
  });
  await act(async () => nativ.leiste!.onTabAktivieren(tab));
  expect([...dom.host.querySelectorAll('p')].find((el) => el.textContent === 'Gesetzestext')).toBe(
    textbereich,
  );
  expect(nativ.text).toMatchObject({
    initialScrollIndex: 3,
    initialScrollOffsetInItem: 42,
    initialAktivesElementId: 'n1',
  });
  nativ.protokoll.length = 0;
  await act(async () =>
    nativ.tabs!.gesetzInfoInTabsPatchen([{ ...gesetz }], [referenzVon(gesetz)]),
  );
  expect(nativ.protokoll).not.toContain('text:cleanup');
  // Neuaufbauschlüssel folgt dem Datenstand im Fensterbestand, nicht mehr der tabweiten reloadVersion.
  await act(async () =>
    nativ.tabs!.setTabs((tabs) => tabs.map((t) => (t.id === tab ? { ...t, reloadVersion: 1 } : t))),
  );
  expect(nativ.protokoll).not.toContain('text:cleanup');
  const steuerung = nativ.tabs;
  assert(steuerung);
  await act(async () =>
    steuerung.gesetzeAktualisierenInTabs(
      [{ ...gesetz, langtitel: 'Geänderte Fassung' }],
      [referenzVon(gesetz)],
    ),
  );
  expect(nativ.protokoll.filter((eintrag) => eintrag.startsWith('text:'))).toEqual([
    'text:cleanup',
    'text:mount',
  ]);
});
it('bindet Markierungsaktionen unverändert an die bisherigen Verantwortlichen', async () => {
  await gesetzAnzeigen();
  const eintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),
  }) as Parameters<
    NonNullable<ComponentProps<typeof Gesetzestextansicht>['onMarkierungLoeschen']>
  >[1];
  nativ.text!.onMarkierungLoeschen!('p1', eintrag);
  nativ.text!.onVerweisBearbeiten!('p1', eintrag as never);
  nativ.text!.onKommentarKlick!('p1', eintrag as never);
  expect(nativ.aktion.mock.calls).toEqual([
    [gesetz, eintrag],
    [gesetz, eintrag],
    [gesetz, eintrag],
  ]);
  expect(nativ.text!.onUnterstreichen).toBe(nativ.aktion);
  expect(nativ.text!.onHervorheben).toBe(nativ.aktion);
  expect(nativ.text!.onVerweismarkierungAnfrage).toBe(nativ.aktion);
  expect(nativ.text!.onKommentarAnfrage).toBe(nativ.aktion);
});

it('verbindet Textbedienung ohne Aktivwechsel mit der Entwertung laufender Verlaufsbefehle', async () => {
  await gesetzAnzeigen();
  const tabs = nativ.tabs;
  assert(tabs);
  const tabId = tabs.aktiverTabId;
  assert(tabId);
  const aktuell = { gesetzesreferenz: referenzVon(gesetz), xmlId: 'p1' };
  const ziel = { ...aktuell, xmlId: 'p2' };
  await act(async () =>
    tabs.verlaufSetzen(tabId, {
      eintraege: [aktuell, ziel],
      position: 0,
      aktivesElement: aktuell,
    }),
  );
  let abschliessen!: (erfolg: boolean) => void;
  const abbrechen = vi.fn();
  await act(async () =>
    tabs.verlaufNavigieren(tabId, 'zurueck', (_ziel, melden) => {
      abschliessen = melden;
      return abbrechen;
    }),
  );
  const vorher = tabs.verlaufLesen(tabId);
  const bedienung = nativ.text?.onBedienung;
  assert(bedienung);
  await act(async () => bedienung());
  expect(abbrechen).toHaveBeenCalledOnce();
  await act(async () => abschliessen(true));
  expect(tabs.verlaufLesen(tabId)).toEqual(vorher);
});

it('erfasst beim Wechsel des aktiven Tabs in App das jeweils angezeigte Gesetz', async () => {
  await gesetzAnzeigen();
  const tabs = nativ.tabs;
  assert(tabs);
  const ersterTab = tabs.aktiverTabId;
  assert(ersterTab);
  expect(ladeAnzeigezeitpunkte().has(gesetzesreferenzSchluessel(gesetz))).toBe(true);
  const anderes = { ...gesetz, kurztitel: 'StGB' };
  await act(async () => tabs.gesetzOeffnen(anderes, 'p1', 'immer-neu'));
  const zweiteZeit = ladeAnzeigezeitpunkte().get(gesetzesreferenzSchluessel(anderes));
  assert(zweiteZeit !== undefined);
  await act(async () => tabs.setAktiverTabId(ersterTab));
  expect(ladeAnzeigezeitpunkte().get(gesetzesreferenzSchluessel(gesetz))).toBeGreaterThan(
    zweiteZeit,
  );
});
