// @vitest-environment jsdom
import { nativeAttrappeZuruecksetzen, io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { useTabGesetzBestand } from '@/hooks/tabs/useTabGesetzBestand';
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// OverlayNavigation.test.tsx
// Echte Overlays und Host schließen genau einmal vor der erfolgreichen Navigation.
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { useRef, act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VerlaufOverlay } from './VerlaufOverlay';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { useGesetzVerwaltung } from '@/hooks/tabs/useGesetzVerwaltung';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

const { laden, importieren } = vi.hoisted(() => ({
  laden: vi.fn(),
  importieren: vi.fn(),
}));
vi.mock('@/components/overlays/overlays.index', async (original) => ({
  useVolltextSuchtext: (await original<typeof import('@/components/overlays/overlays.index')>())
    .useVolltextSuchtext,
  ...(await import('../suche/OeffnenOverlay')),
  ...(await import('./VerlaufOverlay')),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetze: laden,
}));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  ladeAlleGesetzeskurzbefehle: async () => ({}),
}));
vi.mock('@/lib/plattform/menu/menu.index', () => ({ setzeAktiv: vi.fn() }));
vi.mock('@/lib/import/import.index', async (original) => ({
  ...(await original<typeof import('@/lib/import/import.index')>()),
  istVerbindungsFehler: (await original<typeof import('@/lib/import/import.index')>())
    .istVerbindungsFehler,
  importiereGesetze: importieren,
  istImportindexSuchbestandAktuell: () => true,
  sucheKandidatenAlleQuellen: async () => ({
    'de-bund': [
      {
        kurztitel: gesetz.kurztitel,
        langtitel: gesetz.langtitel,
        abrufkennung: `${gesetz.kurztitel}.xml`,
      },
    ],
    'de-bw': [],
    eu: [],
  }),
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));

const gesetz: GesetzDarstellung = gesetzDarstellung({
  kurztitel: 'BGB',
  langtitel: 'Bürgerliches Gesetzbuch',
  hatGliederungsartikel: false,
  elemente: [
    { typ: 'norm', data: normaleNorm({ id: 'n1', xmlId: 'p1', bezeichnung: '§ 1', absaetze: [] }) },
  ],
});
let root: Root;
let verlaufBestand: ReturnType<typeof erzeugeGeladeneGesetze>;
let ablauf: string[];
let props: ComponentProps<typeof AppOverlayHost> & { gesetze: GesetzDarstellung[] };
beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<main></main>';
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  nativeAttrappeZuruecksetzen();
  verlaufBestand = erzeugeGeladeneGesetze();
  verlaufBestand.uebernehmeGeladenes(gesetz);
  setzeSuchverzeichnisTestdaten([gesetz]);
  root = createRoot(document.querySelector('main')!);
  ablauf = [];
  props = {
    ladeGesetz: verlaufBestand.ladeGesetz,
    textDarstellung: {
      schriftgroesse: 19,
      silbentrennung: true,
      schriftart: 'serif',
      zeilenabstand: 1.5,
      blocksatz: false,
      satzNeuZeile: true,
    },
    aktivesOverlay: 'oeffnen',
    onSchliessen: vi.fn(() => ablauf.push('schliessen')),
    gesetze: [gesetz],
    suchverzeichniseintraege: alsSuchverzeichniseintraege([gesetz]),
    aktiverTab: tabFuerTest({ id: 'tab', gesetz }),
    aktivesGesetz: gesetz,
    einklappZustandRef: { current: {} },
    gesetzeskurzbefehle: {},
    oeffnenOverlayInitial: 'BGB',
    verlauf: {
      eintraege: [
        {
          gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
          xmlId: 'p1',
        },
      ],
      position: 0,
    },
    elementOeffnen: vi.fn(() => ablauf.push('oeffnen')),
    gesetzesreferenzOeffnen: vi.fn(() => {
      ablauf.push('sofort-oeffnen');
      return () => {};
    }),
    verlaufNavigieren: vi.fn((_tabId, befehl, oeffnen) => {
      if (typeof befehl !== 'string') oeffnen(befehl, vi.fn());
    }),
    minimalistischerModus: false,
    onVolltextModusWechseln: vi.fn(),
    onLoeschen: vi.fn(),
    onUebersichtExportAktionAnmelden: () => {},
    onExportieren: vi.fn(),
    onDateienAbgelegt: vi.fn(),
    onGesetzeskurzbefehleGeaendert: vi.fn(),
    onNeuLadenNachImport: vi.fn(async () => {
      ablauf.push('neuladen');
    }),
    onInfoAktualisiert: vi.fn(),
    onDateiImportSchliessen: vi.fn(),
    onOeffnenNavigation: vi.fn(() => ablauf.push('einfuehrung')),
  };
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  verlaufBestand.beenden();
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});
async function rendern() {
  setzeSuchverzeichnisTestdaten(props.gesetze);
  await act(async () => root.render(<AppOverlayHost {...props} />));
  if (props.aktivesOverlay === 'oeffnen')
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(document.body.textContent).toContain('Bürgerliches Gesetzbuch');
    });
}
async function ereignis(ziel: EventTarget, typ: string, daten = {}) {
  const event = new window.Event(typ, { bubbles: true, cancelable: true });
  Object.assign(event, daten);
  await act(async () => {
    ziel.dispatchEvent(event);
  });
}
it.each([false, true])('Gesetz installiert, neuer Tab=%s', async (neu) => {
  await rendern();
  await ereignis(window, 'keydown', { key: 'Enter', ctrlKey: neu });
  expect(ablauf).toEqual(['schliessen', 'einfuehrung', 'sofort-oeffnen']);
  expect(props.gesetzesreferenzOeffnen).toHaveBeenCalledWith(
    {
      gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
      xmlId: undefined,
      nurInstalliert: true,
    },
    neu ? 'immer-neu' : 'aktiver-tab',
  );
  expect(importieren).not.toHaveBeenCalled();
});
it.each([false, true])('Gesetz importiert, neuer Tab=%s', async (neu) => {
  props.gesetze = [];
  importieren.mockResolvedValue({ erfolgreiche: [gesetz], fehlgeschlagene: [] });
  await rendern();
  await ereignis(window, 'keydown', { key: 'Enter', metaKey: neu });
  expect(importieren).toHaveBeenCalledOnce();
  expect(ablauf).toEqual(['schliessen', 'einfuehrung', 'oeffnen']);
  expect(props.elementOeffnen).toHaveBeenCalledWith({
    gesetz,
    xmlId: undefined,
    modus: neu ? 'immer-neu' : 'aktiver-tab',
  });
});
it.each(['Fehlerergebnis', 'Ausnahme', 'Abbruch'])(
  'Öffnen-Overlay ohne Erfolgsnavigation: %s',
  async (ende) => {
    props.gesetze = [];
    if (ende === 'Ausnahme') importieren.mockRejectedValue(new Error('Netzwerkfehler'));
    else
      importieren.mockResolvedValue({
        erfolgreiche: [],
        fehlgeschlagene: [{ fehler: { meldung: 'Importfehler' } }],
      });
    await rendern();
    await ereignis(window, 'keydown', {
      key: ende === 'Abbruch' ? 'Escape' : 'Enter',
    });
    expect(props.elementOeffnen).not.toHaveBeenCalled();
    expect(props.onOeffnenNavigation).not.toHaveBeenCalled();
    expect(ablauf).toEqual(ende === 'Abbruch' ? ['schliessen'] : []);
  },
);
it.each(['dblclick', 'ctrl', 'meta', 'fehlend-dblclick', 'fehlend-ctrl'])(
  'Verlauf schließt vor Navigation: %s',
  async (weg) => {
    props.aktivesOverlay = 'verlauf';
    if (weg.startsWith('fehlend')) {
      props.gesetze = [];
      verlaufBestand.entferneGesetze([gesetz]);
    }
    await rendern();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(document.body.textContent).toContain(
        props.gesetze.length ? '§\u00a01 BGB' : 'Eintrag nicht verfügbar BGB',
      );
    });
    const zeile = Array.from(document.querySelectorAll('span')).find(
      (el) =>
        el.textContent === (props.gesetze.length ? '§\u00a01 BGB' : 'Eintrag nicht verfügbar BGB'),
    )!.parentElement!;
    await ereignis(zeile, weg.endsWith('dblclick') ? 'dblclick' : 'mousedown', {
      ctrlKey: weg.endsWith('ctrl'),
      metaKey: weg === 'meta',
    });
    expect(ablauf).toEqual(['schliessen', 'sofort-oeffnen']);
    expect(props.elementOeffnen).not.toHaveBeenCalled();
    expect(props.gesetzesreferenzOeffnen).toHaveBeenCalledWith(
      {
        gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
        xmlId: 'p1',
        ...(weg.endsWith('dblclick') ? { ohneVerlauf: true } : {}),
      },
      weg.endsWith('dblclick') ? 'immer-aktiver-tab' : 'immer-neu',
      ...(weg.endsWith('dblclick') ? ['tab', expect.any(Function)] : []),
    );
  },
);
it('Verlauf-Vorschau navigiert nicht', async () => {
  props.aktivesOverlay = 'verlauf';
  await rendern();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.body.textContent).toContain('§\u00a01 BGB');
  });
  const zeile = Array.from(document.querySelectorAll('span')).find(
    (el) => el.textContent === '§\u00a01 BGB',
  )!.parentElement!;
  await ereignis(zeile, 'click');
  expect(ablauf).toEqual([]);
});

it.each([false, true])('Verlauf übernimmt das Schließen selbst, neuer Tab=%s', async (neu) => {
  await act(async () =>
    root.render(
      <VerlaufOverlay
        textDarstellung={props.textDarstellung}
        ladeGesetz={verlaufBestand.ladeGesetz}
        verlauf={props.verlauf!}
        onSchliessen={props.onSchliessen}
        onOeffnen={() => ablauf.push('aktiver-tab')}
        onNeuenTabOeffnen={() => ablauf.push('immer-neu')}
      />,
    ),
  );
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.body.textContent).toContain('§\u00a01 BGB');
  });
  const zeile = Array.from(document.querySelectorAll('span')).find(
    (el) => el.textContent === '§\u00a01 BGB',
  )!.parentElement!;
  await ereignis(zeile, neu ? 'mousedown' : 'dblclick', { ctrlKey: neu });
  expect(ablauf).toEqual(['schliessen', neu ? 'immer-neu' : 'aktiver-tab']);
});

it('Anwendungspfad: Abgleich ersetzt den Sammellauf und schließt einmal vor Navigation', async () => {
  io.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  importieren.mockResolvedValue({ erfolgreiche: [gesetz], fehlgeschlagene: [] });
  laden.mockResolvedValueOnce([gesetz]).mockRejectedValueOnce(new Error('Lesefehler'));
  let verwaltung!: ReturnType<typeof useGesetzVerwaltung>;
  function Anwendungspfad() {
    const tabsRef = useRef([]);
    verwaltung = useGesetzVerwaltung({
      ...useTabGesetzBestand(tabsRef),
      gesetzeTabsSchliessen: vi.fn(),
    });
    return <AppOverlayHost {...props} onNeuLadenNachImport={verwaltung.gleicheGesetzeAb} />;
  }
  await act(async () => root.render(<Anwendungspfad />));
  await act(async () => {
    await verwaltung.gleicheGesetzeAb();
  });
  await act(async () => {
    await verwaltung.gleicheGesetzeAb();
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(document.querySelector('[data-idx="0"]')?.textContent).toContain('BGB');
  });
  await ereignis(window, 'keydown', { key: 'Enter' });
  expect(laden).not.toHaveBeenCalled();
  expect(ablauf).toEqual(['schliessen', 'einfuehrung', 'sofort-oeffnen']);
  expect(props.onSchliessen).toHaveBeenCalledOnce();
  expect(props.gesetzesreferenzOeffnen).toHaveBeenCalledWith(
    expect.objectContaining({
      gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
      nurInstalliert: true,
    }),
    'aktiver-tab',
  );
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: laden,
}));
