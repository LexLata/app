import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
// useAnsichtssteuerung.test.ts
// Die gemeinsame Grenze koordiniert Ziele, Renderabwarten, Initialnorm und Tab-Restore.
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { act, createElement, Fragment, StrictMode, useLayoutEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, assert, expect, it, vi } from 'vitest';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import * as KontextLogik from './useStrukturKontext';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import { useAnsichtssteuerung, StrukturKontextLeiste } from './ansichtssteuerung.index';
import { type KontextEintrag } from './useStrukturKontext.helpers';
import {
  type Ansichtssteuerung,
  type AnsichtssteuerungOptionen,
  type BaumSteuerung,
  type KlappstufenStatus,
  type KontextLeistenModell,
} from '@/components/gesetzestextansicht/ansichtssteuerung/Ansichtssteuerung.types';
const virtual = vi.hoisted(() => ({
  count: 0,
  zeilenHoehe: 1000,
  key: (_index: number): string | number => '',
  adjust: (): boolean => true,
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; getItemKey(index: number): string | number }) => {
    virtual.count = options.count;
    virtual.key = options.getItemKey;
    return useMemo(
      () => ({
        getVirtualItems: () =>
          Array.from({ length: virtual.count }, (_, index) => ({
            index,
            key: virtual.key(index),
            start: index * virtual.zeilenHoehe,
            size: virtual.zeilenHoehe,
          })),
        getOffsetForIndex: (index: number) => [index * virtual.zeilenHoehe],
        getTotalSize: () => virtual.count * virtual.zeilenHoehe,
        measureElement: () => {},
        indexFromElement: (element: HTMLElement) => Number(element.dataset.index),
        resizeItem: () => {},
        set shouldAdjustScrollPositionOnItemSizeChange(
          callback: (
            zeile: { key: number; start: number; end: number },
            delta: number,
            instanz: {
              scrollOffset: number;
              scrollDirection: null;
              itemSizeCache: Map<number, number>;
            },
          ) => boolean,
        ) {
          virtual.adjust = () =>
            callback({ key: 0, start: 0, end: 1000 }, 30, {
              scrollOffset: 1500,
              scrollDirection: null,
              itemSizeCache: new Map(),
            });
        },
      }),
      [],
    );
  },
}));
const elemente: DarstellungsElement[] = [
  {
    typ: 'ueberschrift',
    data: {
      id: 'kapitel',
      xmlId: 'xml-kapitel',
      bezeichnung: 'Kapitel',
      ebene: 1,
      gliederungskennzahl: '000000',
    },
  },
  ...Array.from({ length: 4 }, (_, i): DarstellungsElement => ({
    typ: 'norm',
    data: normaleNorm({ id: `norm-${i}`, xmlId: `xml-${i}`, bezeichnung: `§ ${i}`, absaetze: [] }),
  })),
];
let frames: Map<number, FrameRequestCallback>;
let id: number;
let cleanup: () => Promise<void>;
let beobachter: { callback: ResizeObserverCallback; element: Element | null; beendet: boolean }[];
beforeEach(() => {
  virtual.zeilenHoehe = 1000;
  vi.useFakeTimers();
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('HTMLElement', window.HTMLElement);
  vi.stubGlobal('HTMLInputElement', window.HTMLInputElement);
  vi.stubGlobal('HTMLTextAreaElement', window.HTMLTextAreaElement);
  const tops = new WeakMap<object, number>();
  Object.defineProperties(window.HTMLElement.prototype, {
    clientHeight: { configurable: true, get: () => 400 },
    clientTop: { configurable: true, get: () => 0 },
    clientWidth: { configurable: true, get: () => 800 },
    offsetHeight: { configurable: true, get: () => 0 },
    scrollTop: {
      configurable: true,
      get() {
        return tops.get(this) ?? 0;
      },
      set(value: number) {
        tops.set(this, value);
      },
    },
  });
  beobachter = [];
  frames = new Map();
  id = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++id, fn);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (n: number) => frames.delete(n));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      eintrag: (typeof beobachter)[number];
      constructor(callback: ResizeObserverCallback) {
        this.eintrag = { callback, element: null, beendet: false };
        beobachter.push(this.eintrag);
      }
      observe(element: Element) {
        this.eintrag.element = element;
      }
      disconnect() {
        this.eintrag.beendet = true;
      }
    },
  );
});
afterEach(async () => {
  await cleanup?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function settle() {
  await act(async () => vi.advanceTimersByTime(20));
  for (let n = 0; n < 10; n++) {
    const callbacks = [...frames.values()];
    frames.clear();
    await act(async () => callbacks.forEach((fn) => fn(performance.now() + 1000)));
  }
}
async function render(
  options: Partial<AnsichtssteuerungOptionen> = {},
  strict = false,
  mitLeiste = false,
) {
  const root = createRoot(document.getElementById('root')!);
  let s!: Ansichtssteuerung;
  let opts: AnsichtssteuerungOptionen = {
    gesetz: gesetzDarstellung({
      kurztitel: 'G',
      langtitel: 'Gesetz',
      hatGliederungsartikel: false,
      elemente,
    }),
    schriftgroesse: 16,
    zeilenabstand: 1.6,
    randInline: 52,
    maxTextSpalteBreite: 720,
    lesbareZeilenlaenge: true,
    messung: erstelleTestTextMessung(),
    strukturKontextLeisteGroesse: 0.85,
    inhaltEinzug: 12,
    satzNeuZeile: true,
    textAlign: 'left',
    hyphens: 'auto',
    lang: 'de',

    ...options,
  };
  function Probe() {
    s = useAnsichtssteuerung(opts);
    useLayoutEffect(() => {
      if (!mitLeiste) {
        s.kontextLeiste.meldeGemesseneHoehe(0);
        s.kontextLeiste.messung?.bestaetigen(0);
      }
    });
    const text = createElement(
      'div',
      { ref: s.containerRef },
      s.textListe.zeilen.map((zeile) =>
        createElement(
          'div',
          {
            key: zeile.key,
            'data-index': zeile.index,
            ref: (dom: HTMLDivElement | null) => {
              if (dom)
                dom.getBoundingClientRect = () =>
                  ({
                    top: 40 + zeile.start - (s.containerRef.current?.scrollTop ?? 0),
                    bottom: 440,
                  }) as DOMRect;
            },
          },
          createElement('div', {
            className: 'gt-klapp-zeile',
            ref: (dom: HTMLDivElement | null) => {
              if (dom)
                dom.getBoundingClientRect = () => {
                  const top = 40 + zeile.start - (s.containerRef.current?.scrollTop ?? 0);
                  return {
                    top,
                    bottom: top + 30,
                    left: 0,
                    right: 800,
                    width: 800,
                    height: 30,
                    x: 0,
                    y: top,
                    toJSON: () => ({}),
                  };
                };
            },
          }),
        ),
      ),
    );
    return mitLeiste
      ? createElement(
          Fragment,
          null,
          text,
          createElement(StrukturKontextLeiste, {
            modell: s.kontextLeiste,
            schrift: 16,
            skalierungsFaktor: 0.85,
            maxBreite: 720,
            randInline: 52,
            minimalistischerModus: false,
          }),
        )
      : text;
  }
  const draw = () =>
    root.render(
      strict ? createElement(StrictMode, null, createElement(Probe)) : createElement(Probe),
    );
  await act(async () => draw());
  cleanup = async () => {
    await act(async () => root.unmount());
  };
  return {
    get s() {
      return s;
    },
    async update(delta: Partial<AnsichtssteuerungOptionen>) {
      opts = { ...opts, ...delta };
      await act(async () => draw());
    },
  };
}
describe('Ansichtssteuerung über ihre öffentliche Grenze', () => {
  it('Favorit öffnet verborgene Vorfahren, wartet auf den neuen Baum und springt zur richtigen Parse-ID', async () => {
    const h = await render({ initialEingeklappteUeberschriften: new Set(['kapitel']) });
    await act(async () => {
      expect(h.s.springeZuXmlId('xml-2', 'schritt')).toBe(true);
    });
    expect(h.s.textListe.zeilen.map((zeile) => zeile.element.data.id)).toContain('norm-2');
    await settle();
    const baum: BaumSteuerung = h.s.baum;
    expect(baum.aktivesElementId).toBe('norm-2');
    expect(h.s.containerRef.current?.scrollTop).toBe(3032);
  });
  it('Initialnorm funktioniert in StrictMode und meldet genau einen erfolgreichen Abschluss', async () => {
    const fertig = vi.fn();
    const h = await render(
      {
        initialNorm: 'xml-3',
        initialEingeklappteUeberschriften: new Set(['kapitel']),
        onInitialNormScrolled: fertig,
      },
      true,
    );
    await settle();
    expect(h.s.baum.aktivesElementId).toBe('norm-3');
    expect(h.s.bereit).toBe(true);
    expect(fertig).toHaveBeenCalledTimes(1);
    await h.update({ initialNorm: undefined });
    await h.update({ initialNorm: 'xml-1' });
    await settle();
    expect(h.s.baum.aktivesElementId).toBe('norm-1');
    expect(fertig).toHaveBeenCalledTimes(2);
  });
  it('ein überholtes initiales Ziel meldet keinen Erfolg und überschreibt keine gespeicherte Position', async () => {
    const fertig = vi.fn();
    const position = vi.fn();
    const h = await render({
      initialNorm: 'xml-0',
      onInitialNormScrolled: fertig,
      onScrollIndexChange: position,
    });
    position.mockClear();
    await act(async () => {
      h.s.springeZuXmlId('xml-3', 'schritt');
    });
    expect(position).not.toHaveBeenCalled();
    await settle();
    expect(fertig).not.toHaveBeenCalled();
    expect(h.s.containerRef.current?.scrollTop).toBe(4032);
    expect(position).toHaveBeenCalledTimes(1);
  });
  it('Restore verwendet den rohen Offset ohne Animation und verändert die getrennte Aktivierung nicht', async () => {
    const position = vi.fn();
    const h = await render(
      {
        initialScrollIndex: 2,
        initialScrollOffsetInItem: 27,
        initialAktivesElementId: 'norm-3',
        onScrollIndexChange: position,
      },
      true,
    );
    position.mockClear();
    await settle();
    expect(h.s.containerRef.current?.scrollTop).toBe(2067);
    expect(h.s.baum.aktivesElementId).toBe('norm-3');
    expect(position).toHaveBeenCalledTimes(1);
    expect(position).toHaveBeenLastCalledWith(2, 27);
  });
  it('externe Set-Rückmeldungen sind detached Snapshots und können den Textbaum nicht verändern', async () => {
    const callback = vi.fn((ueberschriften: Set<string>, normen: Set<string>) => {
      ueberschriften.add('kapitel');
      normen.add('norm-0');
    });
    const h = await render({ onEinklappZustandChange: callback });
    expect(callback).toHaveBeenCalled();
    expect(h.s.baum.eingeklappteUeberschriften.size).toBe(0);
    expect(h.s.baum.eingeklappteNormen.size).toBe(0);
    const position = h.s.containerRef.current?.scrollTop;
    await act(async () => h.s.baum.onNormTextKlick('norm-3'));
    expect(h.s.baum.aktivesElementId).toBe('norm-3');
    expect(h.s.containerRef.current?.scrollTop).toBe(position);
  });
  it('Pfeilnavigation verwendet dieselbe Auftragsgrenze', async () => {
    const h = await render({ initialAktivesElementId: 'norm-0' });
    await act(async () => {
      const event = new window.Event('keydown', { cancelable: true });
      Object.assign(event, { key: 'ArrowDown', altKey: true });
      window.dispatchEvent(event);
    });
    await settle();
    expect(h.s.baum.aktivesElementId).toBe('norm-1');
    expect(h.s.containerRef.current?.scrollTop).toBe(2032);
  });
});

it('Klappstufen- und Leistenmodelle erlauben dieselben Bedienaktionen ohne innere Steuerungstypen', async () => {
  const h = await render();
  const stufen: KlappstufenStatus = h.s.klappstufen;
  await act(async () => stufen.zuklappen());
  expect(h.s.baum.eingeklappteNormen.size).toBe(4);
  await act(async () => {
    h.s.springeZuXmlId('xml-2', 'schritt');
  });
  await settle();
  const leiste: KontextLeistenModell = h.s.kontextLeiste;
  const eintrag: KontextEintrag = leiste.pfad[0]!;
  expect(eintrag.ueberschrift?.id).toBe('kapitel');
  await act(async () => leiste.waehleEintrag(eintrag));
  await settle();
  expect(h.s.baum.aktivesElementId).toBe('kapitel');
});

it('wiederholte Tab-Wiederherstellung hält Index und rohen Offset ohne Drift', async () => {
  let index = 2;
  let offset = 27;
  for (let wechsel = 0; wechsel < 5; wechsel++) {
    const position = vi.fn((i: number, o: number) => {
      index = i;
      offset = o;
    });
    const h = await render(
      {
        initialScrollIndex: index,
        initialScrollOffsetInItem: offset,
        initialAktivesElementId: 'norm-3',
        onScrollIndexChange: position,
      },
      true,
    );
    await settle();
    expect(h.s.containerRef.current?.scrollTop).toBe(2067);
    expect([index, offset]).toEqual([2, 27]);
    expect(h.s.baum.aktivesElementId).toBe('norm-3');
    await cleanup();
    cleanup = async () => {};
  }
});

it.each([false, true])(
  'alle vier Klappstufen bleiben integriert bedienbar (Vorfahren verborgen: %s)',
  async (verborgen) => {
    const u = (id: string, ebene: number): DarstellungsElement => ({
      typ: 'ueberschrift',
      data: { id, xmlId: `xml-${id}`, bezeichnung: id, ebene, gliederungskennzahl: '000000' },
    });
    const n = (id: string): DarstellungsElement => ({
      typ: 'norm',
      data: normaleNorm({ id, xmlId: `xml-${id}`, bezeichnung: id, absaetze: [] }),
    });
    const nested = [u('u1', 1), u('u2', 2), n('n1'), n('n2'), u('u3', 1), n('n3')];
    const status = vi.fn();
    const h = await render({
      gesetz: gesetzDarstellung({
        kurztitel: 'G',
        langtitel: 'Gesetz',
        hatGliederungsartikel: false,
        elemente: nested,
      }),
      initialEingeklappteUeberschriften: new Set(verborgen ? ['u2'] : []),
      onKlappstufenStatusAendern: status,
    });
    const ids = () => h.s.textListe.zeilen.map((zeile) => zeile.element.data.id);
    await act(async () => h.s.klappstufen.zuklappen());
    await settle();
    expect(h.s.baum.eingeklappteNormen).toEqual(new Set(['n1', 'n2', 'n3']));
    expect(ids()).toEqual(
      verborgen ? ['u1', 'u2', 'u3', 'n3'] : ['u1', 'u2', 'n1', 'n2', 'u3', 'n3'],
    );
    await act(async () => h.s.klappstufen.zuklappen());
    await settle();
    expect(ids()).toEqual(['u1', 'u2', 'u3']);
    await act(async () => h.s.klappstufen.zuklappen());
    await settle();
    expect(ids()).toEqual(['u1', 'u3']);
    expect(h.s.klappstufen.kannZuklappen).toBe(false);
    expect(status.mock.lastCall?.[0].kannZuklappen).toBe(false);
    await act(async () => h.s.klappstufen.aufklappen());
    await settle();
    expect(ids()).toEqual(['u1', 'u2', 'u3']);
    await act(async () => h.s.klappstufen.aufklappen());
    await settle();
    expect(ids()).toHaveLength(6);
    await act(async () => h.s.klappstufen.aufklappen());
    await settle();
    expect(h.s.baum.eingeklappteNormen.size).toBe(0);
    expect(h.s.klappstufen.kannAufklappen).toBe(false);
  },
);

it.each([false, true])(
  'nachträgliches Einklappen beendet einen Zielauftrag; Aufklappen setzt ihn nicht fort (Initialnorm: %s)',
  async (initial) => {
    const position = vi.fn();
    const fertig = vi.fn();
    const h = await render({
      initialNorm: initial ? 'xml-2' : undefined,
      onInitialNormScrolled: fertig,
      onScrollIndexChange: position,
    });
    const vorher = h.s.containerRef.current!.scrollTop;
    if (!initial)
      await act(async () => {
        h.s.springeZuXmlId('xml-2', 'schritt');
      });
    await act(async () => h.s.baum.onUeberschriftKlick('kapitel'));
    expect(h.s.textListe.zeilen).toHaveLength(1);
    await settle();
    expect(h.s.containerRef.current!.scrollTop).toBe(vorher);
    expect(fertig).not.toHaveBeenCalled();
    expect(virtual.adjust()).toBe(true);
    await act(async () => h.s.baum.onUeberschriftKlick('kapitel'));
    await settle();
    expect(h.s.containerRef.current!.scrollTop).toBe(vorher);
    position.mockClear();
    await act(async () => {
      h.s.containerRef.current!.scrollTop = 2050;
      h.s.containerRef.current!.dispatchEvent(new window.Event('scroll'));
    });
    await settle();
    expect(position).toHaveBeenLastCalledWith(2, 10);
    expect(virtual.adjust()).toBe(true);
  },
);

it.each([-1, 99])(
  'ein ungültiger Restoreindex %s hält nach dem initialen Fallback keine Scrollsperre fest',
  async (index) => {
    const position = vi.fn();
    const h = await render({ initialScrollIndex: index, onScrollIndexChange: position }, true);
    await act(async () => vi.advanceTimersByTime(300));
    expect(h.s.bereit).toBe(true);
    expect(h.s.containerRef.current!.scrollTop).toBe(0);
    expect(virtual.adjust()).toBe(true);
    position.mockClear();
    await act(async () => {
      h.s.containerRef.current!.scrollTop = 2050;
      h.s.containerRef.current!.dispatchEvent(new window.Event('scroll'));
    });
    await settle();
    expect(position).toHaveBeenLastCalledWith(2, 10);
  },
);

it.each([false, true])(
  'Normsprünge berücksichtigen das Wachstum der StrukturKontextLeiste von drei auf fünf Zeilen (StrictMode: %s)',
  async (strict) => {
    const ueberschrift = (id: string, ebene: number): DarstellungsElement => ({
      typ: 'ueberschrift',
      data: { id, xmlId: id, bezeichnung: id, ebene, gliederungskennzahl: '001'.repeat(ebene) },
    });
    const norm = (zahl: number): DarstellungsElement => ({
      typ: 'norm',
      data: normaleNorm({
        id: `n${zahl}`,
        xmlId: `n${zahl}`,
        bezeichnung: `§ ${zahl}`,
        absaetze: [],
      }),
    });
    const h = await render(
      {
        gesetz: gesetzDarstellung({
          kurztitel: 'BGB',
          langtitel: 'BGB',
          hatGliederungsartikel: false,
          elemente: [
            ...[1, 2, 3, 4, 5].map((ebene) => ueberschrift(`a${ebene}`, ebene)),
            norm(25),
            ueberschrift('b3', 3),
            norm(310),
          ],
        }),
      },
      strict,
      true,
    );
    const leiste = beobachter.find(
      (b) => !b.beendet && b.element && b.element !== h.s.containerRef.current,
    )!;
    const hoehe = () => h.s.kontextLeiste.pfad.length * 24 + 17;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return (
          (this.firstElementChild?.firstElementChild?.firstElementChild?.children.length ?? 0) *
            24 +
          17
        );
      },
    });
    let letzteHoehe = -1;
    const abwarten = async () => {
      await act(async () => vi.advanceTimersByTime(20));
      for (let n = 0; n < 12; n++) {
        if (hoehe() !== letzteHoehe) {
          letzteHoehe = hoehe();
          leiste.callback([], {} as ResizeObserver);
        }
        const callbacks = [...frames.values()];
        frames.clear();
        await act(async () => callbacks.forEach((fn) => fn(performance.now() + 1000)));
      }
    };
    for (const [zahl, anzahlZeilen] of [
      [310, 3],
      [25, 5],
      [310, 3],
    ]) {
      await act(async () => h.s.springeZuXmlId(`n${zahl}`, 'schritt'));
      await abwarten();
      expect(h.s.kontextLeiste.pfad).toHaveLength(anzahlZeilen!);
      expect(h.s.kontextLeiste.effektiveHoehe).toBe(hoehe());
      const zeile = h.s.textListe.zeilen.find((z) => z.element.data.xmlId === `n${zahl}`)!;
      const dom = h.s.containerRef.current!.querySelector<HTMLElement>(
        `[data-index="${zeile.index}"]`,
      )!;
      expect(dom.getBoundingClientRect().top).toBeCloseTo(hoehe() + 8);
    }
  },
);

it('der stabile Höhenanschluss erhält einen ausstehenden Messframe über unabhängige Ansichtsrender hinweg', async () => {
  const h = await render({}, false, true);
  const leiste = beobachter.find(
    (b) => !b.beendet && b.element && b.element !== h.s.containerRef.current,
  )!;
  Object.defineProperty(leiste.element, 'offsetHeight', { configurable: true, value: 60 });
  const callback = h.s.kontextLeiste.meldeGemesseneHoehe;
  const anzahl = beobachter.length;
  leiste.callback([], {} as ResizeObserver);
  expect(frames.size).toBe(1);
  await act(async () => h.s.baum.onNormTextKlick('norm-3'));
  expect(h.s.kontextLeiste.meldeGemesseneHoehe).toBe(callback);
  expect(beobachter).toHaveLength(anzahl);
  expect(leiste.beendet).toBe(false);
  expect(frames.size).toBe(1);
  await settle();
  expect(h.s.kontextLeiste.effektiveHoehe).toBe(60);
});

it('der unveränderte Höhen-Callback verwendet nach Darstellungsänderung den aktuellen inneren Anschluss', async () => {
  const original = KontextLogik.useStrukturKontext;
  let renderStand = 0;
  const anschluss = vi.fn();
  vi.spyOn(KontextLogik, 'useStrukturKontext').mockImplementation((options) => {
    const result = original(options);
    const stand = ++renderStand;
    return {
      ...result,
      kontextAktualisieren: () => {
        anschluss(stand);
        result.kontextAktualisieren();
      },
    };
  });
  const h = await render({}, false, true);
  const callback = h.s.kontextLeiste.meldeGemesseneHoehe;
  await h.update({ schriftgroesse: 32 });
  expect(h.s.kontextLeiste.meldeGemesseneHoehe).toBe(callback);
  const letzterStand = renderStand;
  anschluss.mockClear();
  await act(async () => callback(72));
  expect(anschluss).toHaveBeenCalledWith(letzterStand);
  expect(h.s.kontextLeiste.effektiveHoehe).toBe(72);
});

it('öffentlicher Restore erhält den negativen Abstand an verdeckter Elementgrenze', async () => {
  const position = vi.fn();
  const h = await render(
    { initialScrollIndex: 2, initialScrollOffsetInItem: -10, onScrollIndexChange: position },
    false,
    true,
  );
  await act(async () => h.s.kontextLeiste.meldeGemesseneHoehe(60));
  await settle();
  expect(h.s.containerRef.current!.scrollTop).toBe(2030);
  expect(position).toHaveBeenLastCalledWith(2, -10);
});

it.each([false, true])(
  'fünf öffentliche Tab-Mounts erhalten verdeckte Grenze mit gemessener Leiste (Polster: %s)',
  async (polster) => {
    let index = 2;
    let offset = -10;
    for (let mount = 0; mount < 5; mount++) {
      const tabbezeichnung = vi.fn();
      const position = vi.fn((i: number, o: number) => {
        index = i;
        offset = o;
      });
      const h = await render(
        {
          initialScrollIndex: index,
          initialScrollOffsetInItem: offset,
          initialAktivesElementId: 'norm-3',
          onScrollIndexChange: position,
          onTabBezeichnung: tabbezeichnung,
        },
        true,
        true,
      );
      expect(h.s.kontextLeiste.effektiveHoehe).toBe(0);
      const observer = beobachter.find(
        (b) => !b.beendet && b.element && b.element !== h.s.containerRef.current,
      )!;
      Object.defineProperty(observer.element, 'offsetHeight', { configurable: true, value: 60 });
      await act(async () => observer.callback([], {} as ResizeObserver));
      await settle();
      if (polster) {
        // Ein kürzerer Kontextpfad lässt das vorhandene 60px-Polster bestehen.
        Object.defineProperty(observer.element, 'offsetHeight', { configurable: true, value: 20 });
        await act(async () => observer.callback([], {} as ResizeObserver));
        await settle();
        expect(h.s.kontextLeiste.effektiveHoehe).toBe(60);
      }
      expect(h.s.containerRef.current!.scrollTop).toBe(2030);
      expect([index, offset]).toEqual([2, -10]);
      expect(tabbezeichnung).toHaveBeenLastCalledWith('§ 3');
      expect(h.s.baum.aktivesElementId).toBe('norm-3');
      await cleanup();
      cleanup = async () => {};
    }
  },
);

it.each([
  [2039, 60, 2, -1],
  [2040, 60, 2, 0],
  [2041, 60, 2, 1],
  [2039, 0, 1, 999],
  [2040, 0, 2, 0],
  [2041, 0, 2, 1],
  [2750, 60, 2, 710],
  [0, 60, 0, -40],
])(
  'öffentliche Rückmeldung und Restore erhalten Rohposition %s bei Leistenhöhe %s',
  async (top, hoehe, index, offset) => {
    const position = vi.fn();
    const h = await render({ onScrollIndexChange: position }, false, true);
    await act(async () => h.s.kontextLeiste.meldeGemesseneHoehe(hoehe));
    await act(async () => {
      h.s.containerRef.current!.scrollTop = top;
      h.s.containerRef.current!.dispatchEvent(new window.Event('scroll'));
    });
    await settle();
    expect(position).toHaveBeenLastCalledWith(index, offset);
    await cleanup();
    cleanup = async () => {};
    const restored = await render(
      { initialScrollIndex: index, initialScrollOffsetInItem: offset },
      false,
      true,
    );
    await act(async () => restored.s.kontextLeiste.meldeGemesseneHoehe(hoehe));
    await settle();
    expect(restored.s.containerRef.current!.scrollTop).toBe(top);
  },
);

it('Rand und Zeilenlängendeckel wirken über die effektive Breite, Einzug separat', async () => {
  const h = await render({ schriftgroesse: 15, maxTextSpalteBreite: 600, randInline: 24 });
  const key = () => String(h.s.textListe.zeilen[1]!.key);
  const ausgang = key();
  expect(ausgang).toContain(',600,12,true,');
  await h.update({ randInline: 88 }); // 800 - 176 bleibt größer als der Deckel.
  expect(key()).toBe(ausgang);
  await h.update({ lesbareZeilenlaenge: false });
  expect(key()).toContain(',624,12,true,');
  await h.update({ randInline: 24 });
  expect(key()).toContain(',752,12,true,'); // Rand wird genau einmal abgezogen.
  await h.update({ inhaltEinzug: 21 });
  expect(key()).toContain(',752,21,true,');
  await h.update({ satzNeuZeile: false, lang: 'en', hyphens: 'none', textAlign: 'justify' });
  expect(key()).toContain(',752,21,false,"justify","none","en"]');
});

it('gewählte Kontextleistengröße erreicht die Logik und verändert keine Dokumenthöhenkeys', async () => {
  const original = KontextLogik.useStrukturKontext;
  const logik = vi.spyOn(KontextLogik, 'useStrukturKontext').mockImplementation(original);
  const h = await render({ strukturKontextLeisteGroesse: 0.7 });
  const keys = h.s.textListe.zeilen.map((zeile) => zeile.key);
  expect(logik.mock.lastCall?.[0].skalierung).toBe(0.7);
  for (const faktor of [0.85, 1]) {
    await h.update({ strukturKontextLeisteGroesse: faktor });
    expect(logik.mock.lastCall?.[0].skalierung).toBe(faktor);
    expect(h.s.textListe.zeilen.map((zeile) => zeile.key)).toEqual(keys);
  }
});

it('Fensterbreite 800 → 400 wird erst nach der Ruhephase in die Höhenkeys übernommen', async () => {
  const h = await render();
  const container = h.s.containerRef.current!;
  const key = () => String(h.s.textListe.zeilen[1]!.key);
  expect(key()).toContain(',696,12,true,');
  const observer = beobachter.find((eintrag) => eintrag.element === container && !eintrag.beendet)!;
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
  await act(async () => observer.callback([], {} as ResizeObserver));
  await act(async () => vi.advanceTimersByTime(149));
  expect(key()).toContain(',696,12,true,');
  await act(async () => vi.advanceTimersByTime(1));
  await settle();
  expect(key()).toContain(',296,12,true,');
});

it.each([
  [24, 600, true, 1200, 600],
  [24, 600, true, 400, 352],
  [52, 720, true, 1200, 720],
  [52, 720, true, 400, 296],
  [88, 900, true, 1200, 900],
  [88, 900, true, 400, 224],
  [24, 600, false, 1200, 1152],
  [24, 600, false, 400, 352],
  [52, 720, false, 1200, 1096],
  [52, 720, false, 400, 296],
  [88, 900, false, 1200, 1024],
  [88, 900, false, 400, 224],
  [16, 720, false, 320, 288],
  [24, 720, true, 320, 272],
  [52, 720, true, 320, 216],
  [88, 720, true, 320, 200],
  [16, 720, false, 160, 200],
  [52, 720, false, 399, 296],
  [52, 720, false, 403, 296],
  [52, 720, false, 404, 304],
])(
  'Rand %s, Deckel %s (aktiv: %s), Container %s ergibt freigegebene Breite %s',
  async (randInline, maxTextSpalteBreite, lesbareZeilenlaenge, breite, erwartet) => {
    const h = await render({
      schriftgroesse: 15,
      randInline,
      maxTextSpalteBreite,
      lesbareZeilenlaenge,
    });
    const container = h.s.containerRef.current!;
    const keyVorher = h.s.textListe.zeilen[1]!.key;
    const observer = beobachter.find((b) => b.element === container && !b.beendet)!;
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: breite });
    await act(async () => observer.callback([], {} as ResizeObserver));
    await act(async () => vi.advanceTimersByTime(149));
    expect(h.s.textListe.zeilen[1]!.key).toBe(keyVorher);
    await act(async () => vi.advanceTimersByTime(1));
    await settle();
    expect(String(h.s.textListe.zeilen[1]!.key)).toContain(`,${erwartet},12,true,`);
  },
);

it('oberhalb des Deckels bleiben Keys und tatsächlich gemountete Zeilen erhalten', async () => {
  const h = await render({ schriftgroesse: 15, maxTextSpalteBreite: 600 });
  const container = h.s.containerRef.current!;
  const observer = beobachter.find((b) => b.element === container && !b.beendet)!;
  const vorher = h.s.textListe.zeilen.map((z) => z.key);
  const dom = container.querySelector('[data-index="1"]');
  for (const breite of [1200, 1600, 804, 800]) {
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: breite });
    await act(async () => observer.callback([], {} as ResizeObserver));
    await act(async () => vi.advanceTimersByTime(150));
    await settle();
    expect(h.s.textListe.zeilen.map((z) => z.key)).toEqual(vorher);
    expect(container.querySelector('[data-index="1"]')).toBe(dom);
  }
  await h.update({ randInline: 88 });
  expect(h.s.textListe.zeilen.map((z) => z.key)).toEqual(vorher);
  expect(container.querySelector('[data-index="1"]')).toBe(dom);
});

it('Rand und Deckelwechsel während der Resizegeste verwenden die neueste Containerbreite', async () => {
  const h = await render();
  const container = h.s.containerRef.current!;
  const observer = beobachter.find((b) => b.element === container && !b.beendet)!;
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
  await act(async () => observer.callback([], {} as ResizeObserver));
  await h.update({
    randInline: 24,
    lesbareZeilenlaenge: false,
    maxTextSpalteBreite: 900,
    schriftgroesse: 22,
  });
  await act(async () => vi.advanceTimersByTime(150));
  await settle();
  expect(String(h.s.textListe.zeilen[1]!.key)).toContain('[22,');
  expect(String(h.s.textListe.zeilen[1]!.key)).toContain(',352,12,true,');
  expect(h.s.textListe.maxTextBreite).toBe('none');
});

it.each([false, true])(
  'Resize während öffentlichem Normsprung übernimmt nach dessen Abschluss die ausstehende Breite (StrictMode: %s)',
  async (strict) => {
    const position = vi.fn();
    const h = await render({ onScrollIndexChange: position }, strict);
    const container = h.s.containerRef.current!;
    await act(async () => {
      h.s.springeZuXmlId('xml-3', 'schritt');
    });
    const observer = beobachter.find((b) => b.element === container && !b.beendet)!;
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
    await act(async () => observer.callback([], {} as ResizeObserver));
    expect(virtual.adjust()).toBe(false);
    await settle();
    await act(async () => vi.advanceTimersByTime(500));
    await settle();
    expect(String(h.s.textListe.zeilen[1]!.key)).toContain(',296,12,true,');
    expect(container.scrollTop).toBe(4032);
    expect(virtual.adjust()).toBe(true);
    position.mockClear();
    await act(async () => {
      container.scrollTop = 4050;
      container.dispatchEvent(new window.Event('scroll'));
    });
    await settle();
    expect(position).toHaveBeenLastCalledWith(4, 10);
  },
);

it('ein neuer öffentlicher Zielauftrag verdrängt den alten und übernimmt anschließend die ausstehende Breite', async () => {
  const fertig = vi.fn();
  const position = vi.fn();
  const h = await render({
    initialNorm: 'xml-0',
    onInitialNormScrolled: fertig,
    onScrollIndexChange: position,
  });
  const container = h.s.containerRef.current!;
  const observer = beobachter.find((b) => b.element === container && !b.beendet)!;
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
  await act(async () => observer.callback([], {} as ResizeObserver));
  position.mockClear();
  await act(async () => {
    h.s.springeZuXmlId('xml-3', 'schritt');
  });
  await settle();
  await act(async () => vi.advanceTimersByTime(500));
  await settle();
  expect(fertig).not.toHaveBeenCalled();
  expect(position).toHaveBeenCalled();
  expect(position.mock.calls.every(([index, offset]) => index * 1000 + 40 + offset === 4032)).toBe(
    true,
  );
  expect(container.scrollTop).toBe(4032);
  expect(String(h.s.textListe.zeilen[1]!.key)).toContain(',296,12,true,');
  expect(virtual.adjust()).toBe(true);
});

it.each([false, true])(
  'Unmount beendet Ziel oder nachfolgenden Breitenübergang (Ziel abgeschlossen: %s)',
  async (abgeschlossen) => {
    const position = vi.fn();
    const h = await render({ onScrollIndexChange: position });
    const container = h.s.containerRef.current!;
    await act(async () => {
      h.s.springeZuXmlId('xml-3', 'schritt');
    });
    const observer = beobachter.find((b) => b.element === container && !b.beendet)!;
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
    await act(async () => observer.callback([], {} as ResizeObserver));
    if (abgeschlossen) await settle();
    await cleanup();
    cleanup = async () => {};
    position.mockClear();
    const top = container.scrollTop;
    await act(async () => vi.advanceTimersByTime(500));
    await settle();
    expect(container.scrollTop).toBe(top);
    expect(position).not.toHaveBeenCalled();
    expect(observer.beendet).toBe(true);
    expect(frames.size).toBe(0);
  },
);

it('öffentlicher Restore übernimmt die während seiner Fortsetzung beobachtete Breite nach Abschluss', async () => {
  const position = vi.fn();
  const h = await render(
    { initialScrollIndex: 2, initialScrollOffsetInItem: 27, onScrollIndexChange: position },
    true,
  );
  const container = h.s.containerRef.current!;
  const observer = beobachter.find((b) => b.element === container && !b.beendet)!;
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: 400 });
  await act(async () => observer.callback([], {} as ResizeObserver));
  await settle();
  await act(async () => vi.advanceTimersByTime(500));
  await settle();
  expect(container.scrollTop).toBe(2067);
  expect(position).toHaveBeenLastCalledWith(2, 27);
  expect(String(h.s.textListe.zeilen[1]!.key)).toContain(',296,12,true,');
  expect(virtual.adjust()).toBe(true);
});

async function pfeiltaste(key: string, modifier: Partial<KeyboardEvent> = {}) {
  const event = new window.Event('keydown', { cancelable: true });
  Object.assign(
    event,
    { key, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false },
    modifier,
  );
  await act(async () => window.dispatchEvent(event));
  return event;
}

it.each([0, 200])(
  'richtet den Überschriftenblock bei Scrollposition %s oben aus',
  async (scrollTop) => {
    virtual.zeilenHoehe = 100;
    const h = await render({
      gesetz: gesetzDarstellung({
        kurztitel: 'G',
        langtitel: 'Gesetz',
        hatGliederungsartikel: false,
        elemente: [
          ...elemente.slice(1, 5),
          ...['block', 'unterkapitel'].map((id, index): DarstellungsElement => ({
            typ: 'ueberschrift',
            data: {
              id,
              xmlId: id,
              bezeichnung: id,
              ebene: index + 1,
              gliederungskennzahl: index === 0 ? '001' : '001001',
            },
          })),
          ...Array.from({ length: 6 }, (_, index): DarstellungsElement => ({
            typ: 'norm',
            data: normaleNorm({
              id: `folge-${index}`,
              xmlId: `folge-${index}`,
              bezeichnung: `§ ${index + 10}`,
              absaetze: [],
            }),
          })),
        ],
      }),
      initialAktivesElementId: 'norm-1',
    });
    await settle();
    h.s.containerRef.current!.scrollTop = scrollTop;
    await pfeiltaste('ArrowDown', { metaKey: true });
    await settle();
    expect(h.s.baum.aktivesElementId).toBe('block');
    expect(h.s.containerRef.current!.scrollTop).toBe(432);
    // Ein normaler Elementsprung lässt bereits sichtbare Normen an ihrer Position.
    await pfeiltaste('ArrowDown', { altKey: true });
    await settle();
    expect(h.s.baum.aktivesElementId).toBe('unterkapitel');
    expect(h.s.containerRef.current!.scrollTop).toBe(432);
    await pfeiltaste('ArrowDown', { altKey: true });
    await settle();
    expect(h.s.baum.aktivesElementId).toBe('folge-0');
    expect(h.s.containerRef.current!.scrollTop).toBe(432);
  },
);

it.each([
  ['ArrowUp', -1],
  ['ArrowDown', 1],
] as const)(
  '%s scrollt drei Zeilen und beendet den Zielauftrag ohne Aktivwechsel',
  async (key, vorzeichen) => {
    const fertig = vi.fn();
    const h = await render({
      initialNorm: 'xml-3',
      initialAktivesElementId: 'norm-1',
      onInitialNormScrolled: fertig,
    });
    const container = h.s.containerRef.current!;
    const scrollBy = vi.fn();
    container.scrollBy = scrollBy;
    const aktivVorher = h.s.baum.aktivesElementId;
    const event = await pfeiltaste(key);
    expect(event.defaultPrevented).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({ top: vorzeichen * 16 * 1.6 * 3, behavior: 'instant' });
    expect(h.s.baum.aktivesElementId).toBe(aktivVorher);
    await settle();
    expect(fertig).not.toHaveBeenCalled();
    expect(virtual.adjust()).toBe(true);
    await h.update({ schriftgroesse: 20, zeilenabstand: 2 });
    await pfeiltaste(key);
    expect(scrollBy).toHaveBeenLastCalledWith({ top: vorzeichen * 120, behavior: 'instant' });
  },
);

it.each([
  ['ArrowUp', { shiftKey: true }],
  ['ArrowDown', { shiftKey: true }],
  ['ArrowUp', { metaKey: true, altKey: true }],
  ['ArrowDown', { ctrlKey: true, shiftKey: true }],
  ['ArrowLeft', { metaKey: true }],
  ['ArrowRight', { ctrlKey: true }],
  ['ArrowLeft', { altKey: true }],
  ['ArrowRight', { altKey: true }],
] as const)('überlässt %s mit %j den anderen Handlern', async (key, modifier) => {
  const h = await render({ initialAktivesElementId: 'norm-1' });
  const scrollBy = vi.fn();
  h.s.containerRef.current!.scrollBy = scrollBy;
  expect((await pfeiltaste(key, modifier)).defaultPrevented).toBe(false);
  expect(scrollBy).not.toHaveBeenCalled();
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
});

it.each([
  ['ArrowUp', { altKey: true }, 'norm-0'],
  ['ArrowDown', { altKey: true }, 'norm-2'],
  ['ArrowUp', { metaKey: true }, 'kapitel'],
  ['ArrowDown', { ctrlKey: true }, 'norm-3'],
] as const)('%s mit %j aktiviert und erreicht das Sprungziel %s', async (key, modifier, ziel) => {
  const h = await render({ initialAktivesElementId: 'norm-1' });
  expect((await pfeiltaste(key, modifier)).defaultPrevented).toBe(true);
  expect(h.s.baum.aktivesElementId).toBe(ziel);
  await settle();
  expect(virtual.adjust()).toBe(true);
  expect(h.s.containerRef.current!.scrollTop).toBe(
    ziel === 'kapitel' ? 32 : ziel === 'norm-3' ? 4032 : ziel === 'norm-0' ? 1032 : 3032,
  );
});

it.each(['overlay', 'eingabe', 'leer', 'einfuehrung'] as const)(
  'beachtet die Vorbedingung %s',
  async (fall) => {
    const h = await render(
      fall === 'leer'
        ? {
            gesetz: gesetzDarstellung({
              kurztitel: 'G',
              langtitel: 'G',
              hatGliederungsartikel: false,
              elemente: [],
            }),
          }
        : {},
    );
    if (fall === 'einfuehrung')
      await h.update({
        einfuehrungSperren: {
          normAuswahlGesperrt: true,
          einklappenGesperrt: true,
          ueberschriftenGesperrt: true,
        },
      });
    if (fall === 'overlay') document.body.setAttribute('data-overlay-aktiv', '');
    if (fall === 'eingabe')
      Object.defineProperty(document, 'activeElement', {
        configurable: true,
        value: document.createElement('input'),
      });
    const scrollBy = vi.fn();
    h.s.containerRef.current!.scrollBy = scrollBy;
    expect((await pfeiltaste('ArrowDown')).defaultPrevented).toBe(false);
    expect(scrollBy).not.toHaveBeenCalled();
  },
);

it('Handlerwechsel startet laufendes Initialziel nicht neu und verwendet beim Abschluss den aktuellen Handler', async () => {
  const original = (await import('./scrollen/scrollen.index')).useScrollSteuerung;
  const scrollModul = await import('./scrollen/scrollen.index');
  const starts = vi.fn();
  const stornos = vi.fn();
  vi.spyOn(scrollModul, 'useScrollSteuerung').mockImplementation((optionen) => {
    const scrollen = original(optionen);
    return {
      ...scrollen,
      starteAuftrag: (...args) => {
        starts();
        return scrollen.starteAuftrag(...args);
      },
      storniereFortsetzungen: () => {
        stornos();
        scrollen.storniereFortsetzungen();
      },
    };
  });
  const alt = vi.fn();
  const neu = vi.fn();
  const h = await render({ initialNorm: 'xml-3', onInitialNormScrolled: alt });
  const anzahl = starts.mock.calls.length;
  const storniert = stornos.mock.calls.length;
  await h.update({ onInitialNormScrolled: neu, onTabBezeichnung: vi.fn() });
  expect(starts).toHaveBeenCalledTimes(anzahl);
  expect(stornos).toHaveBeenCalledTimes(storniert);
  await settle();
  expect(neu).toHaveBeenCalledOnce();
  expect(alt).not.toHaveBeenCalled();
  await h.update({ initialNorm: 'xml-1' });
  await settle();
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
  expect(starts.mock.calls.length).toBeGreaterThan(anzahl);
  expect(neu).toHaveBeenCalledTimes(2);
});

it('meldet nur tatsächliche Aktivierungswechsel mit stabiler XML-ID und unterscheidet Schritte von Öffnungsechos', async () => {
  const onAktivierung = vi.fn();
  const onBedienung = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onAktivierung, onBedienung });
  expect(onBedienung).not.toHaveBeenCalled();
  expect(onAktivierung.mock.calls).toEqual([[{ xmlId: 'xml-0', art: 'vorgegeben' }]]);
  onAktivierung.mockClear();
  await act(async () => h.s.baum.onNormTextKlick('norm-0'));
  expect(onBedienung).toHaveBeenCalledTimes(1);
  expect(onAktivierung).not.toHaveBeenCalled();
  for (let n = 1; n <= 3; n++) {
    await act(async () => {
      const event = new window.Event('keydown', { cancelable: true });
      Object.assign(event, { key: 'ArrowDown', altKey: true });
      window.dispatchEvent(event);
    });
  }
  expect(onAktivierung.mock.calls).toEqual(
    [1, 2, 3].map((n) => [{ xmlId: `xml-${n}`, art: 'schritt' }]),
  );
  onAktivierung.mockClear();
  await h.update({ initialNorm: 'xml-0' });
  await settle();
  expect(onAktivierung.mock.calls).toEqual([[{ xmlId: 'xml-0', art: 'vorgegeben' }]]);
  onAktivierung.mockClear();
  await h.update({ initialNorm: undefined });
  await act(async () => h.s.baum.onUeberschriftKlick('kapitel'));
  expect(onAktivierung).toHaveBeenLastCalledWith({ xmlId: 'xml-kapitel', art: 'schritt' });
});

function scrollContainer(h: Awaited<ReturnType<typeof render>>) {
  const container = h.s.containerRef.current;
  assert(container);
  return container;
}

async function nutzerScrollt(h: Awaited<ReturnType<typeof render>>, top = 2040) {
  await act(async () => {
    const container = scrollContainer(h);
    container.scrollTop = top;
    container.dispatchEvent(new window.Event('scroll'));
  });
  const callbacks = [...frames.values()];
  frames.clear();
  await act(async () => callbacks.forEach((fn) => fn(performance.now())));
}

it('P11-A1: führt erst 250 ms nach dem letzten Nutzerscrollen genau einmal zum sichtbaren Titel nach', async () => {
  const onAktivierung = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onAktivierung });
  onAktivierung.mockClear();
  await nutzerScrollt(h);
  await act(async () => vi.advanceTimersByTime(249));
  expect(h.s.baum.aktivesElementId).toBe('norm-0');
  await nutzerScrollt(h);
  await act(async () => vi.advanceTimersByTime(249));
  expect(onAktivierung).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
  expect(onAktivierung.mock.calls).toEqual([[{ xmlId: 'xml-1', art: 'nachfuehrung' }]]);
  await act(async () => vi.advanceTimersByTime(1000));
  expect(onAktivierung).toHaveBeenCalledTimes(1);
});

it.each([
  'Favorit',
  'Suche',
  'Verlauf',
  'Tastaturschritt',
  'Klappstufe',
  'Normzeile',
  'Überschrift',
  'Fenster',
  'Schrift',
] as const)(
  'P11-A8: abgeschlossener Vorgang %s entwertet die alte Nachführung; neues Scrollen wirkt wieder',
  async (vorgang) => {
    const onAktivierung = vi.fn();
    const h = await render({ initialAktivesElementId: 'norm-0', onAktivierung });
    await nutzerScrollt(h);
    if (vorgang === 'Suche' || vorgang === 'Verlauf') await h.update({ initialNorm: 'xml-3' });
    else if (vorgang === 'Favorit') await act(async () => h.s.springeZuXmlId('xml-3', 'sprung'));
    else if (vorgang === 'Tastaturschritt') await pfeiltaste('ArrowDown', { altKey: true });
    else if (vorgang === 'Klappstufe') await act(async () => h.s.klappstufen.zuklappen());
    else if (vorgang === 'Normzeile') await act(async () => h.s.baum.onNormKlick('norm-3'));
    else if (vorgang === 'Überschrift')
      await act(async () => h.s.baum.onUeberschriftKlick('kapitel'));
    else if (vorgang === 'Schrift') await h.update({ schriftgroesse: 20 });
    else {
      const observer = beobachter.find((b) => b.element === h.s.containerRef.current && !b.beendet);
      assert(observer);
      await act(async () => observer.callback([], new ResizeObserver(() => {})));
      await act(async () => vi.advanceTimersByTime(150));
    }
    await settle();
    const vorher = h.s.baum.aktivesElementId;
    const container = h.s.containerRef.current;
    if (!container) throw new Error('Textansicht fehlt');
    await act(async () => container.dispatchEvent(new window.Event('scroll')));
    expect(vi.getTimerCount()).toBe(0);
    onAktivierung.mockClear();
    await act(async () => vi.advanceTimersByTime(250));
    expect(h.s.baum.aktivesElementId).toBe(vorher);
    expect(onAktivierung).not.toHaveBeenCalled();
    if (vorgang === 'Überschrift') await act(async () => h.s.baum.onUeberschriftKlick('kapitel'));
    await nutzerScrollt(h, 3040);
    await act(async () => vi.advanceTimersByTime(250));
    expect(h.s.baum.aktivesElementId).toBe('norm-2');
    expect(onAktivierung).toHaveBeenLastCalledWith({ xmlId: 'xml-2', art: 'nachfuehrung' });
  },
);

it('P11-A9: Beginn und Ende der Auswahlsperre lassen den alten Timer entwertet', async () => {
  const onAktivierung = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onAktivierung });
  await nutzerScrollt(h);
  await h.update({
    einfuehrungSperren: {
      normAuswahlGesperrt: true,
      einklappenGesperrt: false,
      ueberschriftenGesperrt: false,
    },
  });
  await h.update({ einfuehrungSperren: undefined });
  onAktivierung.mockClear();
  await act(async () => vi.advanceTimersByTime(250));
  expect(onAktivierung).not.toHaveBeenCalled();
  await nutzerScrollt(h);
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
});

it('P11-A9: Unmount und erneutes Einhängen starten keine Nachführung', async () => {
  const onAktivierung = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onAktivierung });
  await nutzerScrollt(h);
  await cleanup();
  cleanup = async () => {};
  onAktivierung.mockClear();
  await act(async () => vi.advanceTimersByTime(250));
  expect(onAktivierung).not.toHaveBeenCalled();
  const neu = await render({
    initialAktivesElementId: 'norm-0',
    initialScrollIndex: 2,
    onAktivierung,
  });
  await settle();
  onAktivierung.mockClear();
  await act(async () => vi.advanceTimersByTime(500));
  expect(neu.s.baum.aktivesElementId).toBe('norm-0');
  expect(onAktivierung).not.toHaveBeenCalled();
});

it.each(['Sprung', 'Tastaturschritt'] as const)(
  'P11-A2: tatsächliche Scrollereignisse nach abgeschlossenem %s bleiben programmatisch',
  async (art) => {
    const onAktivierung = vi.fn();
    const h = await render({ initialAktivesElementId: 'norm-0', onAktivierung });
    if (art === 'Sprung') await act(async () => h.s.springeZuXmlId('xml-3', 'sprung'));
    else await pfeiltaste('ArrowDown', { altKey: true });
    await settle();
    const aktiv = h.s.baum.aktivesElementId;
    onAktivierung.mockClear();
    await act(async () => scrollContainer(h).dispatchEvent(new window.Event('scroll')));
    await settle();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTime(250));
    expect(h.s.baum.aktivesElementId).toBe(aktiv);
    expect(onAktivierung).not.toHaveBeenCalled();
  },
);

it('P11-A7: laufender Zielauftrag und Auswahlsperre erlauben keine Vormerkung', async () => {
  const onAktivierung = vi.fn();
  const h = await render({ initialNorm: 'xml-3', onAktivierung });
  await nutzerScrollt(h);
  await settle();
  onAktivierung.mockClear();
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-3');
  expect(onAktivierung).not.toHaveBeenCalled();
  await h.update({
    einfuehrungSperren: {
      normAuswahlGesperrt: true,
      einklappenGesperrt: false,
      ueberschriftenGesperrt: false,
    },
  });
  await nutzerScrollt(h);
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-3');
  expect(onAktivierung).not.toHaveBeenCalled();
  await h.update({ einfuehrungSperren: undefined });
  await nutzerScrollt(h);
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
});

it.each(['Bedienung', 'Sperre'] as const)(
  'P11-A8/A9: %s vor dem Scrollframe entwertet auch die noch nicht vorgemerkte Nachführung',
  async (fall) => {
    const h = await render({ initialAktivesElementId: 'norm-0' });
    await act(async () => {
      scrollContainer(h).scrollTop = 2040;
      scrollContainer(h).dispatchEvent(new window.Event('scroll'));
    });
    if (fall === 'Bedienung') await act(async () => h.s.baum.onNormTextKlick('norm-3'));
    else {
      await h.update({
        einfuehrungSperren: {
          normAuswahlGesperrt: true,
          einklappenGesperrt: false,
          ueberschriftenGesperrt: false,
        },
      });
      await h.update({ einfuehrungSperren: undefined });
    }
    await settle();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTime(250));
    expect(h.s.baum.aktivesElementId).toBe(fall === 'Bedienung' ? 'norm-3' : 'norm-0');
  },
);

it('P11-A8: im selben React-Durchlauf nach dem Scrollstand ausgeführte Bedienung verhindert die Vormerkung', async () => {
  const h = await render({ initialAktivesElementId: 'norm-0' });
  await act(async () => {
    scrollContainer(h).scrollTop = 2040;
    scrollContainer(h).dispatchEvent(new window.Event('scroll'));
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((fn) => fn(performance.now()));
    h.s.baum.onNormTextKlick('norm-3');
  });
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-3');
});

it('P11-A8: neues Nutzerscrollen nach der Bedienung darf bereits im selben Frame wieder nachführen', async () => {
  const h = await render({ initialAktivesElementId: 'norm-0' });
  await act(async () => {
    const container = scrollContainer(h);
    container.scrollTop = 2040;
    container.dispatchEvent(new window.Event('scroll'));
    h.s.baum.onNormTextKlick('norm-3');
    container.scrollTop = 3040;
    container.dispatchEvent(new window.Event('scroll'));
  });
  await settle();
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-2');
});

it('misst bei Ablauf der Scroll-Nachführung mit der aktuellen natürlichen Leistenhöhe', async () => {
  virtual.zeilenHoehe = 100;
  const h = await render({ initialAktivesElementId: 'norm-0' }, false, true);
  const leiste = beobachter.find(
    (b) => !b.beendet && b.element && b.element !== h.s.containerRef.current,
  );
  assert(leiste?.element);
  const observer = new ResizeObserver(() => {});
  Object.defineProperty(leiste.element, 'offsetHeight', { configurable: true, value: 40 });
  await act(async () => leiste.callback([], observer));
  await settle();
  expect(h.s.kontextLeiste.effektiveHoehe).toBe(40);
  await nutzerScrollt(h, 80);
  expect(h.s.baum.aktivesElementId).toBe('norm-0');
  const container = h.s.containerRef.current;
  assert(container);
  const titel = container.querySelectorAll('.gt-klapp-zeile');
  assert(titel[1] && titel[2]);
  expect(titel[1].getBoundingClientRect().top).toBe(60);
  expect(titel[1].getBoundingClientRect().bottom).toBe(90);
  expect(titel[2].getBoundingClientRect().top).toBe(160);
  Object.defineProperty(leiste.element, 'offsetHeight', { configurable: true, value: 100 });
  await act(async () => leiste.callback([], observer));
  const callbacks = [...frames.values()];
  frames.clear();
  await act(async () => callbacks.forEach((fn) => fn(performance.now())));
  expect(h.s.kontextLeiste.effektiveHoehe).toBe(100);
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
});

it('meldet Nutzerscrollen als Bedienung vor dem Frame und eigene Scrollkorrekturen nicht', async () => {
  const onBedienung = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onBedienung });
  expect(onBedienung).not.toHaveBeenCalled();
  await act(async () => {
    const container = scrollContainer(h);
    container.scrollTop = 2040;
    container.dispatchEvent(new window.Event('scroll'));
  });
  expect(onBedienung).toHaveBeenCalledTimes(1);
  await settle();
  await act(async () => h.s.springeZuXmlId('xml-3', 'sprung'));
  await settle();
  onBedienung.mockClear();
  await act(async () => scrollContainer(h).dispatchEvent(new window.Event('scroll')));
  expect(onBedienung).not.toHaveBeenCalled();
});

it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, null])(
  'Einführung: Pfeile erhalten Navigation, Überschriftenziele und erlaubte Klappwirkung (%s)',
  async (teilaktion) => {
    const { istErlaubt } = await import('@/lib/domain/einfuehrung/einfuehrung.index');
    const { EinfuehrungsOverlay } = await import('@/components/einfuehrung/EinfuehrungsOverlay');
    const erlaubt = (aktion: Parameters<typeof istErlaubt>[1]) =>
      teilaktion === null || istErlaubt(teilaktion, aktion);
    const markerRoot = createRoot(document.body.appendChild(document.createElement('div')));
    try {
      if (teilaktion !== null)
        await act(async () =>
          markerRoot.render(
            createElement(EinfuehrungsOverlay, {
              teilaktion,
              fertig: teilaktion === 8,
              appName: 'LexLata',
              istAktuellFavorit: false,
              onUeberspringen: () => {},
              onFertig: () => {},
            }),
          ),
        );
      const h = await render({
        initialAktivesElementId: 'norm-0',
        initialEingeklappteNormen: new Set(['norm-0', 'norm-1']),
        einfuehrungSperren:
          teilaktion === null
            ? undefined
            : {
                normAuswahlGesperrt: !erlaubt('norm-wechseln'),
                einklappenGesperrt: !erlaubt('titel-ein-ausklappen'),
                ueberschriftenGesperrt: !erlaubt('ueberschrift-waehlen'),
              },
      });
      await pfeiltaste('ArrowRight');
      expect([...h.s.baum.eingeklappteNormen]).toEqual(
        [5, 6, 7, 8, null].includes(teilaktion) ? [] : ['norm-0', 'norm-1'],
      );
      expect(h.s.baum.aktivesElementId).toBe('norm-0');
      await pfeiltaste('ArrowLeft', { shiftKey: true });
      expect(h.s.baum.aktivesElementId).toBe(
        [2, 4, 5, 6, 7, 8, null].includes(teilaktion) ? 'kapitel' : 'norm-0',
      );
      expect([...h.s.baum.eingeklappteUeberschriften]).toEqual(
        [5, 6, 7, 8, null].includes(teilaktion) ? ['kapitel'] : [],
      );
      await pfeiltaste('ArrowRight');
      expect(h.s.baum.aktivesElementId).toBe('norm-0');
      expect([...h.s.baum.eingeklappteUeberschriften]).toEqual([]);
      await pfeiltaste('ArrowDown', { altKey: true });
      expect(h.s.baum.aktivesElementId).toBe(
        [2, 4, 5, 6, 7, 8, null].includes(teilaktion) ? 'norm-1' : 'norm-0',
      );
    } finally {
      await act(async () => markerRoot.unmount());
    }
  },
);

it.each([2, 4])(
  'gesperrtes Aufklappen navigiert nicht in verborgene Kinder (%s)',
  async (teilaktion) => {
    const { istErlaubt } = await import('@/lib/domain/einfuehrung/einfuehrung.index');
    const h = await render({
      initialAktivesElementId: 'kapitel',
      initialEingeklappteUeberschriften: new Set(['kapitel']),
      einfuehrungSperren: {
        normAuswahlGesperrt: !istErlaubt(teilaktion, 'norm-wechseln'),
        einklappenGesperrt: !istErlaubt(teilaktion, 'titel-ein-ausklappen'),
        ueberschriftenGesperrt: !istErlaubt(teilaktion, 'ueberschrift-waehlen'),
      },
    });
    await pfeiltaste('ArrowRight');
    expect(h.s.baum.aktivesElementId).toBe('kapitel');
    expect([...h.s.baum.eingeklappteUeberschriften]).toEqual(['kapitel']);
  },
);

it('skaliert die lesbare Zeilenlänge proportional zur Schriftgröße', async () => {
  const h = await render({ schriftgroesse: 15, maxTextSpalteBreite: 600 });
  expect(h.s.textListe.maxTextBreite).toBe(600);
  await h.update({ schriftgroesse: 20 });
  expect(h.s.textListe.maxTextBreite).toBe(800);
  await h.update({ schriftgroesse: 10 });
  expect(h.s.textListe.maxTextBreite).toBe(400);
  await h.update({ lesbareZeilenlaenge: false });
  expect(h.s.textListe.maxTextBreite).toBe('none');
});

it('wartet vor der ersten Zielposition auf die übernommenen Seitenleisten und gibt spätere Navigation frei', async () => {
  const fertig = vi.fn();
  const h = await render({
    initialNorm: 'xml-3',
    initialLayoutBereit: false,
    onInitialNormScrolled: fertig,
  });
  await settle();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(fertig).not.toHaveBeenCalled();
  expect(h.s.bereit).toBe(false);
  await h.update({ initialLayoutBereit: true });
  await settle();
  expect(fertig).toHaveBeenCalledTimes(1);
  expect(h.s.bereit).toBe(true);
  await h.update({ initialLayoutBereit: false, initialNorm: 'xml-1' });
  await settle();
  expect(fertig).toHaveBeenCalledTimes(2);
});

it('eine neue Navigation während des Leistenladens verdrängt das ausstehende Anfangsziel', async () => {
  const fertig = vi.fn();
  const h = await render({
    initialNorm: 'xml-3',
    initialLayoutBereit: false,
    onInitialNormScrolled: fertig,
  });
  await act(async () => {
    h.s.springeZuXmlId('xml-1', 'sprung');
  });
  await settle();
  await h.update({ initialLayoutBereit: true });
  await settle();
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
  expect(fertig).not.toHaveBeenCalled();
});

it('P6: zeigt das aktive Element sofort und nach Scrollpause dasselbe zuvor vorläufige Element', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onTabBezeichnung: titel });
  expect(titel).toHaveBeenLastCalledWith('§ 0');
  await act(async () => vi.advanceTimersByTime(100));
  titel.mockClear();
  await nutzerScrollt(h);
  expect(titel.mock.calls).toEqual([['§ 1']]);
  expect(h.s.baum.aktivesElementId).toBe('norm-0');
  await nutzerScrollt(h);
  expect(titel).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
  expect(titel).toHaveBeenCalledTimes(1);
  await act(async () => h.s.baum.onNormTextKlick('norm-3'));
  expect(titel).toHaveBeenLastCalledWith('§ 3');
});

it('P6: drosselt vorläufige Wechsel, meldet den letzten und verwirft ihn bei Aktivierung', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onTabBezeichnung: titel });
  await act(async () => vi.advanceTimersByTime(100));
  titel.mockClear();
  await nutzerScrollt(h, 2040);
  await nutzerScrollt(h, 3040);
  await nutzerScrollt(h, 4040);
  expect(titel.mock.calls).toEqual([['§ 1']]);
  await act(async () => vi.advanceTimersByTime(99));
  expect(titel).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(1));
  expect(titel.mock.calls).toEqual([['§ 1'], ['§ 3']]);
  await nutzerScrollt(h, 3040);
  await act(async () => h.s.baum.onNormTextKlick('norm-0'));
  expect(titel).toHaveBeenLastCalledWith('§ 0');
  await act(async () => vi.advanceTimersByTime(100));
  expect(titel).toHaveBeenLastCalledWith('§ 0');
});

it('P6: behält den Titel des aktiven Elements, solange dessen Körper sichtbar bleibt', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-1', onTabBezeichnung: titel });
  await act(async () => vi.advanceTimersByTime(100));
  titel.mockClear();
  await nutzerScrollt(h, 2100);
  await act(async () => vi.advanceTimersByTime(250));
  expect(h.s.baum.aktivesElementId).toBe('norm-1');
  expect(titel).not.toHaveBeenCalled();
});

it.each(['gesperrt', 'unbereit', 'programmatisch'] as const)(
  'P6: kein vorläufiger Titel bei %s',
  async (art) => {
    const titel = vi.fn();
    const h = await render({
      initialAktivesElementId: 'norm-0',
      onTabBezeichnung: titel,
      ...(art === 'unbereit' ? { initialLayoutBereit: false } : {}),
      ...(art === 'gesperrt'
        ? {
            einfuehrungSperren: {
              normAuswahlGesperrt: true,
              ueberschriftenGesperrt: false,
              einklappenGesperrt: false,
            },
          }
        : {}),
    });
    await act(async () => vi.advanceTimersByTime(100));
    titel.mockClear();
    if (art === 'programmatisch') {
      await act(async () => h.s.springeZuXmlId('xml-2', 'sprung'));
      expect(titel).toHaveBeenLastCalledWith('§ 2');
      titel.mockClear();
      await settle();
    } else await nutzerScrollt(h, 3040);
    await act(async () => vi.advanceTimersByTime(250));
    expect(titel).not.toHaveBeenCalled();
  },
);

it('P6: räumt eine ausstehende Tab-Meldung beim Verlassen der Textansicht auf', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onTabBezeichnung: titel });
  await act(async () => vi.advanceTimersByTime(100));
  await nutzerScrollt(h, 2040);
  await nutzerScrollt(h, 3040);
  await cleanup();
  cleanup = async () => {};
  titel.mockClear();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(titel).not.toHaveBeenCalled();
});

it('P6: meldet nach Ruhe sofort, bei Tastatur und Aufruf ohne Sperrzeit', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onTabBezeichnung: titel });
  await act(async () => vi.advanceTimersByTime(100));
  await nutzerScrollt(h, 2040);
  await act(async () => vi.advanceTimersByTime(101));
  titel.mockClear();
  await nutzerScrollt(h, 3040);
  expect(titel.mock.calls).toEqual([['§ 2']]);
  await pfeiltaste('ArrowDown', { altKey: true });
  expect(titel).toHaveBeenLastCalledWith('§ 1');
  await act(async () => h.s.springeZuXmlId('xml-3', 'sprung'));
  expect(titel).toHaveBeenLastCalledWith('§ 3');
  await act(async () => vi.advanceTimersByTime(100));
  expect(titel).toHaveBeenLastCalledWith('§ 3');
});

it('P6: übernimmt nach Gesetzeswechsel keine ausstehende Bezeichnung des alten Gesetzes', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onTabBezeichnung: titel });
  await act(async () => vi.advanceTimersByTime(100));
  await nutzerScrollt(h, 2040);
  await nutzerScrollt(h, 3040);
  await h.update({
    gesetz: gesetzDarstellung({
      kurztitel: 'Neu',
      elemente: elemente.map((el) =>
        el.typ === 'norm'
          ? { ...el, data: { ...el.data, bezeichnung: 'Neu ' + el.data.bezeichnung } }
          : el,
      ),
    }),
  });
  expect(titel).toHaveBeenLastCalledWith('Neu § 0');
  titel.mockClear();
  await act(async () => vi.advanceTimersByTime(250));
  expect(titel).not.toHaveBeenCalled();
  expect(h.s.baum.aktivesElementId).toBe('norm-0');
});

it('P6: dieselbe Vorschau wird nach zwischenzeitlicher Tastaturaktivierung erneut gemeldet', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onTabBezeichnung: titel });
  await act(async () => vi.advanceTimersByTime(100));
  await nutzerScrollt(h, 3040);
  expect(titel).toHaveBeenLastCalledWith('§ 2');
  await pfeiltaste('ArrowDown', { altKey: true });
  expect(titel).toHaveBeenLastCalledWith('§ 1');
  await settle();
  await act(async () => vi.advanceTimersByTime(100));
  await nutzerScrollt(h, 3040);
  expect(titel).toHaveBeenLastCalledWith('§ 2');
});

it('behält beim fortgesetzten Mausradscrollen die Vorschau bis zur Aktivierung nach der Ruhepause', async () => {
  const titel = vi.fn();
  const h = await render({ initialAktivesElementId: 'norm-0', onTabBezeichnung: titel });
  await act(async () => vi.advanceTimersByTime(100));
  await nutzerScrollt(h);
  expect(titel).toHaveBeenLastCalledWith('§ 1');
  expect(h.s.baum.aktivesElementId).toBe('norm-0');
  titel.mockClear();
  await act(async () => scrollContainer(h).dispatchEvent(new window.Event('wheel')));
  // Der Elternteil darf auf die Tab-Meldung hin neu rendern.
  await h.update({ onTabBezeichnung: titel });
  expect(titel.mock.calls.flat()).not.toContain('§ 0');
  await nutzerScrollt(h, 3040);
  await act(async () => vi.advanceTimersByTime(100));
  expect(titel).toHaveBeenLastCalledWith('§ 2');
  expect(titel.mock.calls.flat()).not.toContain('§ 0');
  await act(async () => vi.advanceTimersByTime(149));
  expect(h.s.baum.aktivesElementId).toBe('norm-0');
  await act(async () => vi.advanceTimersByTime(1));
  expect(h.s.baum.aktivesElementId).toBe('norm-2');
  expect(titel.mock.calls.flat()).not.toContain('§ 0');
});

it.each([
  { xmlId: 'ueberschrift:100', index: 1 },
  { xmlId: '100', index: 2 },
])('aktiviert und scrollt zum getrennten Ziel $xmlId', async ({ xmlId, index }) => {
  const gesetz = parseGesetzesXML(
    '<gesetz version="1"><infos><kurztitel>G</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz>Anfang</absatz></text></norm><gliederung gliederungskennzahl="100"><bezeichnung>Teil</bezeichnung></gliederung><norm id="100"><bezeichnung>§ 100</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  assert(gesetz);
  const h = await render({ gesetz });
  await act(async () => {
    expect(h.s.springeZuXmlId(xmlId, 'schritt')).toBe(true);
  });
  await settle();
  const ziel = gesetz.elemente[index];
  assert(ziel);
  expect(h.s.baum.aktivesElementId).toBe(ziel.data.id);
  expect(h.s.containerRef.current?.scrollTop).toBe(index * 1000 + 32);
});
