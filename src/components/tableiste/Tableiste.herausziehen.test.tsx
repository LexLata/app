// @vitest-environment jsdom
// Verhalten der echten Tableiste beim Verlassen und Wiederbetreten des Fensters.
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import type { Tab } from '@/lib/domain/appTypes';
import { act, useState } from 'react';
import { assert, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { scrollNachfuehrungMessung } from '@/test/hauptfenster/scrollNachfuehrungMessung';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { erzeugeRadiusRollen } from '@/lib/stil/radiusRollen';
import { UiGroesseContext } from '@/hooks/einstellungen/useUiGroesse';
import { Tableiste } from './Tableiste';
import { useFensterUebertragung } from '@/hooks/fenster/useFensterUebertragung';
const dom = domTestWurzel();
const herausziehen = vi.fn();
const aktivieren = vi.fn();
const aufnehmen = vi.fn();
let anzahl = 2;
let mitGesetz = false;
let mitTransport = false;
let uiFaktor = 1;
const vorschauFrames = new Map<number, FrameRequestCallback>();
let frameNummer = 0;
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  herausziehen.mockClear();
  aktivieren.mockClear();
  aufnehmen.mockClear();
  uiFaktor = 1;
  anzahl = 2;
  mitGesetz = false;
  mitTransport = false;
  Element.prototype.scrollIntoView = () => {};
  vorschauFrames.clear();
  scrollNachfuehrungMessung((fn) => {
    vorschauFrames.set(++frameNummer, fn);
    return frameNummer;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => vorschauFrames.delete(id));
  io.invoke.mockImplementation(async (name) =>
    name === 'fenster_alle_positionen' ? [] : undefined,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function Probe() {
  const [tabs, setTabs] = useState<Tab[]>(
    Array.from({ length: anzahl }, (_, i) =>
      tabFuerTest({
        id: String.fromCharCode(97 + i),
        gesetz: mitGesetz ? gesetzDarstellung() : undefined,
      }),
    ),
  );
  const transport = useFensterUebertragung({
    tabFuerUebertragungKopieren: (id) =>
      tabs.some((t) => t.id === id) ? { verlauf: { eintraege: [], position: 0 } } : null,
    tabUebertragungAbschliessen: (id) => {
      setTabs((vorher) => vorher.filter((t) => t.id !== id));
      return false;
    },
    fensterSchliessen: async () => {},
    tabAusUebertragungUebernehmen: async () => false,
  });
  const props = {
    tabs,
    aktiverTabId: 'a',
    tabTitel: {},
    onTabAktivieren: aktivieren,
    onTabSchliessen: vi.fn(),
    onNeuenTabOeffnen: vi.fn(),
    onTabsNeuAnordnen: setTabs,
    onUebersichtOeffnen: () => {},
    onTabHerausziehen: mitTransport ? transport.handleTabHerausziehen : herausziehen,
    onTabInFensterAufnehmen: mitTransport ? transport.handleTabInFensterAufnehmen : aufnehmen,
    fremdVorschauIndexRef: { current: null },
    minimalistischerModus: false,
    plattformfremdeUiAnzeigen: false,
    kannVerlaufZurueck: false,
    kannVerlaufVorwaerts: false,
    onVerlaufZurueck: () => {},
    onVerlaufVorwaerts: () => {},
  };

  return <Tableiste {...props} />;
}
async function zeige() {
  await act(async () =>
    dom.root.render(
      <UiGroesseContext.Provider
        value={{ faktor: uiFaktor, uiGroesse: 'normal', setUiGroesse: () => {} }}
      >
        <Probe />
      </UiGroesseContext.Provider>,
    ),
  );
  await act(async () => vi.dynamicImportSettled());
}
async function pointer(
  typ: string,
  x: number,
  y: number,
  ziel: EventTarget = window,
  screenX = x,
  screenY = y,
) {
  await act(async () => {
    ziel.dispatchEvent(
      new MouseEvent(typ, { bubbles: true, button: 0, clientX: x, clientY: y, screenX, screenY }),
    );
  });
}
function tab(id = 'a') {
  const element = dom.host.querySelector<HTMLElement>(`[data-tab-id="${id}"]`);
  assert(element);
  return element;
}
function klone() {
  return dom.host.querySelectorAll('[style*="position: fixed"]');
}
async function starte(id = 'a') {
  await pointer('pointerdown', 10, 10, tab(id));
  await pointer('pointermove', 12, 10);
  expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(false);
  await pointer('pointermove', 20, 10);
}
it.each([
  [10, 6],
  [10, 14],
  [13, 13],
])('beginnt den Zug ab vier Pixeln Abstand auch senkrecht oder diagonal (%s,%s)', async (x, y) => {
  await zeige();
  await pointer('pointerdown', 10, 10, tab());
  await pointer('pointermove', x, y);
  expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(true);
  await pointer('pointermove', 10, -1);
  expect(tab().style.display).toBe('none');
  await pointer('pointerup', 10, -1);
  expect(herausziehen).toHaveBeenCalledExactlyOnceWith('a');
});
it.each([
  [10, 10],
  [10, 7],
  [10, 13],
  [12, 12],
])('bleibt unter vier Pixeln Abstand ohne Zug und Fensteraktion (%s,%s)', async (x, y) => {
  await zeige();
  await pointer('pointerdown', 10, 10, tab());
  await pointer('pointermove', x, y);
  expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(false);
  await pointer('pointerup', x, y);
  expect(aktivieren).toHaveBeenCalledExactlyOnceWith('a');
  expect(herausziehen).not.toHaveBeenCalled();
  expect(aufnehmen).not.toHaveBeenCalled();
});
it.each([
  [-1, 10],
  [1025, 10],
  [10, -1],
  [10, 769],
])(
  'entfernt den gezogenen Tab außerhalb (%s,%s) ohne Platzhalter und zeigt ihn bei Rückkehr',
  async (x, y) => {
    await zeige();
    await starte();
    await pointer('pointermove', x, y);
    expect(tab().style.display).toBe('none');
    expect(klone()).toHaveLength(0);
    await pointer('pointermove', 30, 200);
    expect(tab().style.display).not.toBe('none');
    expect(klone()).toHaveLength(1);
    await pointer('pointerup', 30, 200);
    expect(herausziehen).not.toHaveBeenCalled();
    expect(aufnehmen).not.toHaveBeenCalled();
  },
);
it('lässt den Klon unterhalb der Leiste im Fenster und zieht sofort außerhalb heraus', async () => {
  await zeige();
  await starte();
  await pointer('pointermove', 30, 500);
  expect(klone()).toHaveLength(1);
  expect(tab().style.display).toBe('flex');
  await pointer('pointerup', -1, 20);
  expect(herausziehen).toHaveBeenCalledExactlyOnceWith('a');
});
it.each([true, false])(
  'bricht innen oder außen ohne Aktion ab und entfernt die Faust (%s)',
  async (aussen) => {
    await zeige();
    await starte();
    expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(true);
    await pointer('pointermove', aussen ? -1 : 30, 20);
    await pointer('pointercancel', aussen ? -1 : 30, 20);
    expect(herausziehen).not.toHaveBeenCalled();
    expect(aufnehmen).not.toHaveBeenCalled();
    expect(tab().style.opacity).not.toBe('0');
    expect(tab().style.display).not.toBe('none');
    expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(false);
  },
);
it('entfernt beim Abbau die Faust', async () => {
  await zeige();
  await starte();
  await act(async () => dom.root.render(null));
  expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(false);
});
it('blendet den einzigen Tab draußen aus und zeigt ihn nach Abbruch ohne Fensteraktion wieder', async () => {
  anzahl = 1;
  await zeige();
  await starte();
  await pointer('pointermove', -1, 20);
  expect(tab().style.display).toBe('none');
  expect(klone()).toHaveLength(0);
  await pointer('pointerup', -1, 20);
  expect(tab().style.display).not.toBe('none');
  expect(herausziehen).not.toHaveBeenCalled();
  expect(aufnehmen).not.toHaveBeenCalled();
});

it.each([1, 2])(
  'überträgt %s Tab(s) sofort und erhält bis zur Übernahme die Live-Lücke',
  async (zahl) => {
    anzahl = zahl;
    io.invoke.mockImplementation(async (name) =>
      name === 'fenster_alle_positionen'
        ? [{ label: 'ziel', x: 1500, y: 0, breite: 500, hoehe: 500 }]
        : undefined,
    );
    const frames = new Map<number, FrameRequestCallback>();
    let nummer = 0;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frames.set(++nummer, fn);
      return nummer;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    await zeige();
    await starte();
    await pointer('pointermove', 1200, 20, window, 1600, 20);
    await act(async () => {
      const offen = [...frames.values()];
      frames.clear();
      offen.forEach((fn) => fn(0));
    });
    expect(
      io.emitTo.mock.calls.some(([ziel, name]) => ziel === 'ziel' && name === 'tab-drag-betreten'),
    ).toBe(true);
    let fertig!: () => void;
    aufnehmen.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          fertig = resolve;
        }),
    );
    await pointer('pointerup', 1200, 20, window, 1600, 20);
    expect(aufnehmen).toHaveBeenCalledExactlyOnceWith('a', 'ziel');
    expect(herausziehen).not.toHaveBeenCalled();
    expect(io.emitTo.mock.calls.some(([, name]) => name === 'tab-drag-verlassen')).toBe(false);
    await act(async () => fertig());
    expect(io.emitTo.mock.calls.some(([, name]) => name === 'tab-drag-verlassen')).toBe(true);
  },
);
it('zählt die native Titelleiste zum Fenster und erst den Bereich darüber als draußen', async () => {
  io.invoke.mockImplementation(async (name) =>
    name === 'fenster_alle_positionen'
      ? [{ label: 'main', x: 100, y: 50, breite: 1024, hoehe: 800 }]
      : undefined,
  );
  await zeige();
  await starte();
  await pointer('pointermove', 20, -10, window, 120, 60);
  expect(tab().style.display).not.toBe('none');
  expect(klone()).toHaveLength(1);
  await pointer('pointerup', 20, -10, window, 120, 60);
  expect(herausziehen).not.toHaveBeenCalled();
  await starte();
  await pointer('pointermove', 20, -21, window, 120, 49);
  expect(tab().style.display).toBe('none');
});
it('friert draußen Reihenfolge und Autoscroll ein und kehrt direkt am Ziel mit bisherigem Scrollstand zurück', async () => {
  anzahl = 3;
  const frames = new Map<number, FrameRequestCallback>();
  let nummer = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++nummer, fn);
    return nummer;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  await zeige();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const eltern = this.parentElement;
    const sichtbar = eltern
      ? [...eltern.querySelectorAll<HTMLElement>('[data-tab-id]')].filter(
          (el) => el.style.display !== 'none',
        )
      : [];
    const index = sichtbar.indexOf(this);
    const links = index < 0 ? 0 : index * 100;
    return {
      left: links,
      right: index < 0 ? 200 : links + 100,
      width: index < 0 ? 200 : 100,
      top: 0,
      bottom: 40,
      height: 40,
      x: links,
      y: 0,
      toJSON() {},
    };
  });
  const leiste = tab('a').parentElement;
  assert(leiste);
  leiste.scrollLeft = 50;
  await starte('b');
  // Innerhalb des Fensters am rechten Leistenrand beginnt Autoscroll.
  await pointer('pointermove', 199, 20);
  const vorher = [...dom.host.querySelectorAll<HTMLElement>('[data-tab-id]')].map(
    (el) => el.dataset.tabId,
  );
  const mitAutoscroll = frames.size;
  await pointer('pointermove', 1025, 20);
  expect(frames.size).toBeLessThan(mitAutoscroll);
  expect(vorher).toEqual(['a', 'b', 'c']);
  const nachVerlassen = frames.size;
  leiste.scrollLeft = 0; // simuliert das Schrumpfen der Scrollbreite ohne den Tab.
  await pointer('pointermove', 2000, 20);
  await pointer('pointermove', -1000, 20);
  expect(frames.size).toBe(nachVerlassen);
  expect(
    [...dom.host.querySelectorAll<HTMLElement>('[data-tab-id]')].map((el) => el.dataset.tabId),
  ).toEqual(vorher);
  await pointer('pointermove', 250, 20);
  expect(
    [...dom.host.querySelectorAll<HTMLElement>('[data-tab-id]')].map((el) => el.dataset.tabId),
  ).toEqual(['a', 'c', 'b']);
  expect(tab('b').style.display).not.toBe('none');
  expect(leiste.scrollLeft).toBe(50);
  await pointer('pointercancel', 250, 20);
});

it('stoppt laufenden Autoscroll auch beim Abbruch innerhalb des Fensters', async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nummer = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++nummer, fn);
    return nummer;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  await zeige();
  const vorDrag = frames.size;
  await starte();
  expect(frames.size).toBeGreaterThan(vorDrag);
  await pointer('pointercancel', 20, 10);
  const leiste = tab().parentElement;
  assert(leiste);
  const scrollstand = leiste.scrollLeft;
  await act(async () => {
    const offen = [...frames.values()];
    frames.clear();
    offen.forEach((fn) => fn(0));
  });
  expect(leiste.scrollLeft).toBe(scrollstand);
  expect(frames.size).toBe(0);
  expect(tab().style.opacity).not.toBe('0');
});

it('verwendet bis zum Snapshot nur die Webansicht und ignoriert verspätete Snapshots beendeter Züge', async () => {
  let snapshot!: (fenster: unknown[]) => void;
  io.invoke.mockImplementation((name) =>
    name === 'fenster_alle_positionen'
      ? new Promise((resolve) => {
          snapshot = resolve;
        })
      : Promise.resolve(undefined),
  );
  await zeige();
  await starte();
  const alterSnapshot = snapshot;
  await pointer('pointermove', 20, -10, window, 120, 60);
  expect(tab().style.display).toBe('none');
  await pointer('pointercancel', 20, -10);
  await starte();
  await act(async () =>
    alterSnapshot([{ label: 'main', x: 100, y: 50, breite: 1024, hoehe: 800 }]),
  );
  await pointer('pointermove', 20, -10, window, 120, 60);
  expect(tab().style.display).toBe('none');
  await pointer('pointercancel', 20, -10);
});

// Die vollständige Tableiste benutzt die echte Vorschau-Steuerung; nur Tauri ist ersetzt.
function vorschauAufrufe() {
  return io.invoke.mock.calls.filter(([name]) => String(name).startsWith('ziehvorschau_'));
}
async function naechsterFrame() {
  await act(async () => {
    const frames = [...vorschauFrames.values()];
    vorschauFrames.clear();
    frames.forEach((fn) => fn(0));
  });
}
it.each(['pointerup', 'pointercancel', 'unmount'])(
  'zeigt den Kurztitel draußen, verbirgt innen und über anderen Fenstern und schließt bei %s',
  async (ende) => {
    io.invoke.mockImplementation(async (name) =>
      name === 'fenster_alle_positionen'
        ? [{ label: 'ziel', x: 1500, y: 0, breite: 500, hoehe: 500 }]
        : undefined,
    );
    await zeige();
    await starte();
    expect(vorschauAufrufe()[0]).toEqual([
      'ziehvorschau_oeffnen',
      expect.objectContaining({ titel: 'Neuer Tab' }),
    ]);
    await pointer('pointermove', -1, 20);
    await naechsterFrame();
    expect(vorschauAufrufe().at(-1)).toEqual([
      'ziehvorschau_bewegen',
      expect.objectContaining({ x: -1, y: 20 }),
    ]);
    await pointer('pointermove', 30, 20);
    await naechsterFrame();
    expect(vorschauAufrufe().at(-1)?.[0]).toBe('ziehvorschau_verbergen');
    await pointer('pointermove', -1, 20);
    await naechsterFrame();
    await pointer('pointermove', 1200, 20, window, 1600, 20);
    await naechsterFrame();
    expect(vorschauAufrufe().at(-1)?.[0]).toBe('ziehvorschau_verbergen');
    if (ende === 'unmount') await act(async () => dom.root.render(null));
    else await pointer(ende, -1, 20);
    expect(vorschauAufrufe().at(-1)?.[0]).toBe('ziehvorschau_schliessen');
  },
);
it('zeigt auch für einen einzigen Tab die native Vorschau und schließt sie bei Abbruch', async () => {
  anzahl = 1;
  await zeige();
  await starte();
  await pointer('pointermove', -1, 20);
  await naechsterFrame();
  await pointer('pointercancel', -1, 20);
  expect(vorschauAufrufe().map(([name]) => name)).toEqual([
    'ziehvorschau_oeffnen',
    'ziehvorschau_bewegen',
    'ziehvorschau_schliessen',
  ]);
});

it.each([0.9, 1, 1.15])(
  'übergibt bei UI-Faktor %s Kurztitel, Schrift, Tababstände und bestehende Eckenrolle',
  async (faktor) => {
    uiFaktor = faktor;
    mitGesetz = true;
    await zeige();
    const beschriftung = tab().querySelector<HTMLElement>('[data-tab-kurztitel]');
    assert(beschriftung);
    beschriftung.style.font = 'bold 17px Arial';
    beschriftung.style.color = 'rgb(1, 2, 3)';
    await starte();
    expect(vorschauAufrufe()[0]).toEqual([
      'ziehvorschau_oeffnen',
      expect.objectContaining({
        titel: 'BGB',
        aussehen: expect.objectContaining({
          schrift: '700 17px Arial',
          textfarbe: 'rgb(1, 2, 3)',
          innenabstand: getComputedStyle(tab()).padding,
          eckenradius: `${erzeugeRadiusRollen(faktor).standard}px`,
        }),
      }),
    ]);
    await pointer('pointercancel', 20, 10);
  },
);

// Der übergebene Promise bezeichnet die tatsächliche Übernahme, nicht nur den Versand.
it.each(['herausziehen', 'aufnehmen'])(
  'hält den Quelltab bis zum tatsächlichen Abschluss unsichtbar (%s)',
  async (art) => {
    let fertig!: () => void;
    const abschluss = new Promise<void>((resolve) => {
      fertig = resolve;
    });
    if (art === 'aufnehmen') {
      aufnehmen.mockReturnValueOnce(abschluss);
      io.invoke.mockImplementation(async (name) =>
        name === 'fenster_alle_positionen'
          ? [{ label: 'ziel', x: 1500, y: 0, breite: 500, hoehe: 500 }]
          : undefined,
      );
    } else herausziehen.mockReturnValueOnce(abschluss);
    await zeige();
    await starte();
    const x = art === 'aufnehmen' ? 1600 : -1;
    await pointer('pointermove', x, 20);
    await pointer('pointerup', x, 20);
    expect(tab().style.display).toBe('none');
    expect(klone()).toHaveLength(0);
    expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(false);
    await act(async () => fertig());
    // Bei nicht entfernter Quelle (etwa Ablehnung) wird derselbe Tab wieder sichtbar.
    expect(tab().style.display).not.toBe('none');
  },
);
it('lässt nach späterem Abschluss aus A den neuen Zug B mit seiner Faust und seinem Klon unverändert', async () => {
  const fertig = await beginneAusstehendesHerausziehen();
  await starte('b');
  await act(async () => fertig());
  expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(true);
  expect(klone()).toHaveLength(1);
  expect(tab('b').style.opacity).toBe('0');
  await pointer('pointercancel', 20, 10);
});
it.each(['ziel-a', 'ziel-b'])(
  'bereinigt nach spätem A-Abschluss dessen Lücke, ohne die neue B-Lücke über %s zu löschen',
  async (zielB) => {
    io.invoke.mockImplementation(async (name) =>
      name === 'fenster_alle_positionen'
        ? [
            { label: 'ziel-a', x: 1500, y: 0, breite: 400, hoehe: 500 },
            { label: 'ziel-b', x: 2000, y: 0, breite: 400, hoehe: 500 },
          ]
        : undefined,
    );
    let fertig!: () => void;
    aufnehmen.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        fertig = resolve;
      }),
    );
    await zeige();
    await starte();
    await pointer('pointermove', 1600, 20);
    await naechsterFrame();
    await pointer('pointerup', 1600, 20);
    expect(io.emitTo.mock.calls.filter(([, name]) => name === 'tab-drag-verlassen')).toHaveLength(
      0,
    );
    await starte('b');
    await pointer('pointermove', zielB === 'ziel-a' ? 1600 : 2100, 20);
    await naechsterFrame();
    await act(async () => fertig());
    const verlassen = () =>
      io.emitTo.mock.calls
        .filter(([, name]) => name === 'tab-drag-verlassen')
        .map(([ziel]) => ziel);
    expect(verlassen()).toEqual(zielB === 'ziel-a' ? [] : ['ziel-a']);
    expect(tab('b').style.display).toBe('none');
    expect(document.documentElement.classList.contains('tab-wird-gezogen')).toBe(true);
    await pointer('pointercancel', 1600, 20);
    expect(verlassen()).toEqual(zielB === 'ziel-a' ? ['ziel-a'] : ['ziel-a', 'ziel-b']);
  },
);

it.each(['übernommen', 'abgelehnt', 'frist', 'öffnungsfehler'])(
  'zeigt die Quelle mit echtem Transport erst nach gesichertem Ergebnis wieder (%s)',
  async (ergebnis) => {
    mitTransport = true;
    if (ergebnis === 'frist') vi.useFakeTimers();
    if (ergebnis === 'öffnungsfehler')
      io.invoke.mockImplementation(async (name) => {
        if (name === 'fenster_oeffnen_mit_label') throw new Error('Fensteranlage fehlgeschlagen');
        return name === 'fenster_alle_positionen' ? [] : undefined;
      });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await zeige();
      await starte();
      await pointer('pointermove', -1, 20);
      expect(tab().style.display).toBe('none');
      await pointer('pointerup', -1, 20);
      if (ergebnis !== 'öffnungsfehler') {
        expect(tab().style.display).toBe('none');
        if (ergebnis === 'frist') await act(async () => vi.advanceTimersByTimeAsync(30_000));
        else {
          const ablage = io.invoke.mock.calls.find(([name]) => name === 'tab_uebertragung_ablegen');
          assert(ablage);
          const { transport } = JSON.parse(ablage[1].payload);
          await act(async () => {
            for (const handler of io.listener.get('tab-uebertragung-bestaetigt') ?? [])
              handler({
                payload: { kennung: transport.kennung, uebernommen: ergebnis === 'übernommen' },
              });
          });
        }
      }
      if (ergebnis === 'übernommen') expect(dom.host.querySelector('[data-tab-id="a"]')).toBeNull();
      else expect(tab().style.display).not.toBe('none');
      expect(tab('b')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  },
);
it('ordnet bei Rückkehr von B anhand sichtbarer Nachbarn, während A auf Übernahme wartet', async () => {
  anzahl = 3;
  const fertig = await beginneAusstehendesHerausziehen();
  await starte('b');
  await pointer('pointermove', -1, 20);
  // Die Layoutattrappe meldet die sichtbare C-Mitte bei 400; B kehrt rechts davon zurück.
  await pointer('pointermove', 600, 20);
  expect(
    [...dom.host.querySelectorAll<HTMLElement>('[data-tab-id]')]
      .filter((el) => el.style.display !== 'none')
      .map((el) => el.dataset.tabId),
  ).toEqual(['c', 'b']);
  await pointer('pointercancel', 30, 20);
  await act(async () => fertig());
});

async function beginneAusstehendesHerausziehen() {
  let fertig!: () => void;
  herausziehen.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      fertig = resolve;
    }),
  );
  await zeige();
  await starte();
  await pointer('pointermove', -1, 20);
  await pointer('pointerup', -1, 20);
  return fertig;
}
