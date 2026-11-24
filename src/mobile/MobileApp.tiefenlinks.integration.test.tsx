// @vitest-environment jsdom
// Echte Mobile-Wurzel, Parser, Dateilader und Anzeige; nur native Grenzen ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import MobileApp from './MobileApp';
import { ladeAnzeigezeitpunkte } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
const native = vi.hoisted(() => ({ getCurrent: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: native.getCurrent }));
const dom = domTestWurzel();
function richteResizeObserverEin(zeilenweise = false) {
  vi.stubGlobal(
    'ResizeObserver',
    class implements ResizeObserver {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() => {
          const groesse = [
            {
              inlineSize: 390,
              blockSize: zeilenweise && target.hasAttribute('data-index') ? 40 : 800,
            },
          ];
          this.callback(
            [
              {
                target,
                contentRect: target.getBoundingClientRect(),
                borderBoxSize: groesse,
                contentBoxSize: groesse,
                devicePixelContentBoxSize: groesse,
              },
            ],
            this,
          );
        });
      }
      unobserve() {}
      disconnect() {}
    },
  );
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  alleBannerSchliessen();
  native.getCurrent.mockResolvedValue(null);
  richteResizeObserverEin();
  Object.defineProperties(HTMLElement.prototype, {
    clientHeight: { configurable: true, get: () => 800 },
    clientWidth: { configurable: true, get: () => 390 },
    offsetHeight: { configurable: true, get: () => 40 },
    offsetWidth: { configurable: true, get: () => 390 },
  });
  HTMLElement.prototype.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 390,
    bottom: 800,
    width: 390,
    height: 800,
    x: 0,
    y: 0,
    toJSON() {},
  });
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  for (const kategorie of ['de-bund', 'de-bw', 'eu'])
    io.dateien.set(
      `resources/importindizes/${kategorie}.xml`,
      '<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Test"/></infos><inhalt/></importindex>',
    );
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const code of ['de-bund', 'bund'])
    io.dateien.set(
      `gesetze/BGB_${code}.xml`,
      `<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>${code}</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text>Anfang ${code}</text></norm><norm id="p433"><bezeichnung>§ 433</bezeichnung><text>Ziel ${code}</text></norm></inhalt></gesetz>`,
    );
});
async function starten(url?: string) {
  native.getCurrent.mockResolvedValue(url ? [url] : null);
  await act(async () => dom.root.render(<MobileApp />));
  await vi.waitFor(() => expect(dom.host.textContent).not.toContain('Lädt …'));
  await act(async () => {
    await vi.waitFor(() => {
      const datei = io.dateien.get('cache/suchverzeichnis.json');
      expect(datei && JSON.parse(datei).abgeglichen).toBe(true);
    });
  });
}
async function zustellen(url: string, art: 'kalt' | 'warm') {
  if (art === 'kalt') await starten(url);
  else {
    await starten();
    await warm(url);
  }
}
async function warm(url: string) {
  await act(async () => {
    const empfaenger = io.listener.get('tiefenlink-oeffnen');
    expect(empfaenger?.size).toBeGreaterThan(0);
    for (const callback of empfaenger ?? []) callback({ payload: [url] });
  });
}
for (const art of ['kalt', 'warm'] as const) {
  it.each([
    'de-bund',
    'DE-Bund',
    'bund',
    'Bund' /* normgeber-link: Großschreibung ausschließlich in der Linkeingabe. */,
  ])(`${art}: öffnet %s in der echten Textansicht`, async (code) => {
    await zustellen(`lexlata://${code}/bgb/433`, art);
    await vi.waitFor(() =>
      expect(dom.host.textContent?.replaceAll('\u00a0', ' ')).toContain(
        `Ziel ${code.toLowerCase()}`,
      ),
    );
    expect(dom.host.textContent).not.toContain(
      `Ziel ${code.toLowerCase() === 'bund' ? 'de-bund' : 'bund'}`,
    );
    expect(dom.host.querySelector('[aria-label="Zurück"]')).not.toBeNull();
    expect(
      dom.host.querySelector('[data-xml-id="p433"] [style*="var(--aktiv-element)"]'),
    ).not.toBeNull();
    expect(dom.host.querySelector('[data-xml-id="p1"] [style*="var(--aktiv-element)"]')).toBeNull();
  });
  it.each(['de_bund', 'İ'])(`${art}: zeigt den Formathinweis für %s im DOM`, async (code) => {
    await zustellen(`lexlata://${code}/bgb/433`, art);
    await vi.waitFor(() => expect(dom.host.textContent).toContain('Das gültige Format'));
    expect(dom.host.textContent).toContain('lexlata://de-bund/bgb/433');
    expect(dom.host.textContent).not.toContain('Ziel de-bund');
  });
  it.each(['bund/bgb/433', 'de-bund/fehlt/433', 'de-bund/bgb/999'])(
    `${art}: meldet fehlendes Ziel %s und öffnet ein lesbares Gesetz`,
    async (ziel) => {
      io.dateien.delete('gesetze/BGB_bund.xml');
      await zustellen(`lexlata://${ziel}`, art);
      await vi.waitFor(() =>
        expect(dom.host.textContent).toContain('Das Linkziel konnte nicht geöffnet werden'),
      );
      expect(dom.host.textContent).toContain('lexlata://de-bund/bgb/433');
      if (ziel.endsWith('/999')) {
        expect(dom.host.textContent).toContain('Ziel de-bund');
        expect(
          dom.host.querySelector('[data-xml-id="p1"] [style*="var(--aktiv-element)"]'),
        ).not.toBeNull();
      } else expect(dom.host.textContent).not.toContain('Ziel de-bund');
    },
  );
}
it.each(['1', '999'])(
  'öffnet das erneute Linkziel %s im bereits behaltenen Gesetz ohne weiteres XML',
  async (ziel) => {
    await starten('lexlata://de-bund/bgb/433');
    expect(
      dom.host.querySelector('[data-xml-id="p433"] [style*="var(--aktiv-element)"]'),
    ).not.toBeNull();
    const gelesen: string[] = [];
    io.vorLesen = (pfad) => {
      if (pfad.includes('/gesetze/')) gelesen.push(pfad);
      return undefined;
    };
    await warm(`lexlata://de-bund/bgb/${ziel}`);
    expect(
      dom.host.querySelector('[data-xml-id="p1"] [style*="var(--aktiv-element)"]'),
    ).not.toBeNull();
    expect(
      dom.host.querySelector('[data-xml-id="p433"] [style*="var(--aktiv-element)"]'),
    ).toBeNull();
    expect(gelesen).toEqual([]);
    if (ziel === '999')
      expect(dom.host.textContent).toContain('Das Linkziel konnte nicht geöffnet werden');
  },
);

it('öffnet nach dem Schließen kein verspätet empfangenes App-Startziel', async () => {
  let freigeben = () => {};
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  native.getCurrent.mockImplementation(async () => {
    await warten;
    return ['lexlata://de-bund/bgb/433'];
  });
  await act(async () => dom.root.render(<MobileApp />));
  await vi.waitFor(() => expect(native.getCurrent).toHaveBeenCalledTimes(1));
  await act(async () => dom.root.render(null));
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad);
    return undefined;
  };
  await act(async () => {
    freigeben();
    await warten;
  });
  expect(gelesen).toEqual([]);
  expect(getSnapshot()).toEqual([]);
});

it('zeigt Warmfehler über der geöffneten Textansicht und schließt den Hinweis per Bedienung', async () => {
  await starten('lexlata://de-bund/bgb/433');
  await warm('lexlata://de-bund/bgb/999');
  await vi.waitFor(() =>
    expect(dom.host.textContent).toContain('Das Linkziel konnte nicht geöffnet werden'),
  );
  expect(dom.host.textContent?.replaceAll('\u00a0', ' ')).toContain('Ziel de-bund');
  const text = [...dom.host.querySelectorAll('div')].find(
    (el) => el.textContent?.startsWith('Das Linkziel') && el.style.position === 'relative',
  );
  assert(text);
  await act(async () => text.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  const schliessen = dom.host.querySelector<HTMLButtonElement>('[aria-label="Banner schließen"]');
  assert(schliessen);
  await act(async () => schliessen.click());
  expect(dom.host.textContent).not.toContain('Das Linkziel konnte nicht geöffnet werden');
  expect(dom.host.textContent?.replaceAll('\u00a0', ' ')).toContain('Ziel de-bund');
});

for (const art of ['kalt', 'warm'] as const) {
  it(`${art}: erfasst das per Tiefenlink angezeigte Gesetz`, async () => {
    await zustellen('lexlata://de-bund/bgb/433', art);
    expect(ladeAnzeigezeitpunkte().has(JSON.stringify(['de-bund', 'bgb']))).toBe(true);
  });
}

async function klicke(selector: string) {
  const element = dom.host.querySelector<HTMLElement>(selector);
  assert(element);
  await act(async () => element.click());
}
it('erfasst Suchauswahl und Verweis; Suche und erneute Anzeige schreiben nichts', async () => {
  io.dateien.set(
    'gesetze/A_de-bund.xml',
    '<gesetz><infos><kurztitel>A</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text>Siehe <verweis gesetz="BGB" normgeber="de-bund" norm="§ 433">Kaufrecht</verweis></text></norm></inhalt></gesetz>',
  );
  await starten();
  const schreiben = vi.spyOn(Storage.prototype, 'setItem');
  await klicke('[data-idx="0"]');
  expect(ladeAnzeigezeitpunkte().has(JSON.stringify(['de-bund', 'a']))).toBe(true);
  const verweis = [...dom.host.querySelectorAll<HTMLElement>('span')].find(
    (e) => e.textContent === 'Kaufrecht' && e.onclick,
  );
  assert(verweis);
  await act(async () => verweis.click());
  expect(ladeAnzeigezeitpunkte().has(JSON.stringify(['de-bund', 'bgb']))).toBe(true);
  const anzahlSchreibzugriffe = () =>
    schreiben.mock.calls.filter(([key]) => key === 'lexlata.zuletztAngezeigt').length;
  const vorher = anzahlSchreibzugriffe();
  await klicke('[aria-label="Zurück"]');
  expect(anzahlSchreibzugriffe()).toBe(vorher);
  const zeile = [...dom.host.querySelectorAll<HTMLElement>('[data-idx]')].find((e) =>
    e.textContent?.startsWith('BGB'),
  );
  assert(zeile);
  await act(async () => zeile.click());
  expect(anzahlSchreibzugriffe()).toBe(vorher);
});

it('erzeugt beim mobilen Start ohne Cachedatei das Suchverzeichnis im Hintergrund und zeigt installierte Treffer', async () => {
  expect(io.dateien.has('cache/suchverzeichnis.json')).toBe(false);
  const abgleichLesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) abgleichLesen.push(pfad.split('/').at(-1) ?? pfad);
    return undefined;
  };
  await starten();
  expect(abgleichLesen).toEqual(['BGB_de-bund.xml', 'BGB_bund.xml']);
  await act(async () => {
    await vi.waitFor(() => {
      const datei = io.dateien.get('cache/suchverzeichnis.json');
      expect(datei).toBeDefined();
      assert(datei);
      expect(JSON.parse(datei).abgeglichen).toBe(true);
    });
  });
  expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(2);
  expect(dom.host.textContent).toContain('BGB');
  expect(dom.host.textContent).not.toContain('Gesetzesliste wird vorbereitet');
});

it('verwirft einen noch laufenden Einzelzugriff nach dem Schließen der mobilen Ansicht', async () => {
  await starten();
  let freigeben = () => {};
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  let liest = false;
  io.vorLesen = (pfad) => {
    if (!pfad.endsWith('/gesetze/BGB_de-bund.xml')) return;
    liest = true;
    return warten;
  };
  try {
    await warm('lexlata://de-bund/bgb/433');
    await vi.waitFor(() => expect(liest).toBe(true));
    await act(async () => dom.root.render(null));
  } finally {
    await act(async () => freigeben());
  }
  expect(getSnapshot()).toEqual([]);
});
it('erhält beim fehlenden Fremdgesetz die bisherige Textstelle über den Ladezustand und zeigt den Importhinweis', async () => {
  // Native Geometrie: Textzeilen sind 40px hoch, der sichtbare Bereich 800px.
  // Die übrigen Tiefenlinktests benötigen keine tatsächliche Scrollposition.
  richteResizeObserverEin(true);
  const geometrie = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const block = this.closest<HTMLElement>('[data-index]');
    if (!block) return geometrie.call(this);
    const scroll = block.closest<HTMLElement>('[aria-label="Gesetzestext"]');
    const top = Number(block.dataset.index) * 40 - (scroll?.scrollTop ?? 0);
    return {
      top,
      bottom: top + 40,
      left: 0,
      right: 390,
      width: 390,
      height: 40,
      x: 0,
      y: top,
      toJSON() {},
    };
  });
  io.dateien.set(
    'gesetze/A_de-bund.xml',
    `<gesetz><infos><kurztitel>A</kurztitel><normgeber>de-bund</normgeber></infos><inhalt>${Array.from({ length: 30 }, (_, index) => `<norm id="p${index + 1}"><bezeichnung>§ ${index + 1}</bezeichnung><text>Ausgang <verweis gesetz="Fehlt" normgeber="de-bund" norm="§ 2">Fremdziel</verweis></text></norm>`).join('')}</inhalt></gesetz>`,
  );
  await starten();
  await klicke('[data-idx="0"]');
  const textstelle = dom.host.querySelector<HTMLElement>('[aria-label="Gesetzestext"]');
  assert(textstelle);
  await act(async () => vi.waitFor(() => expect(textstelle.style.visibility).toBe('visible')));
  await act(async () => {
    textstelle.scrollTop = 237;
    textstelle.dispatchEvent(new Event('scroll'));
  });
  const verweis = [...dom.host.querySelectorAll<HTMLElement>('span')].find(
    (e) => e.textContent === 'Fremdziel' && e.onclick,
  );
  assert(verweis);
  let freigeben = () => {};
  const halten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') await halten;
    return nativ?.(name, args);
  });
  await act(async () => verweis.click());
  expect(dom.host.textContent).toContain('Fehlt wird geladen');
  expect(textstelle.closest('[inert]')).not.toBeNull();
  await act(async () => {
    freigeben();
    await halten;
  });
  await vi.waitFor(() => expect(dom.host.textContent).not.toContain('wird geladen'));
  expect(dom.host.querySelector('[aria-label="Gesetzestext"]')).toBe(textstelle);
  expect(textstelle.scrollTop).toBe(237);
  expect(dom.host.textContent).toContain('Ausgang');
  expect(dom.host.textContent).toContain(
    'Fehlt ist noch nicht importiert. Bitte über „Gesetz oder Norm öffnen“ importieren.',
  );
});

it('liest beim Start mit abgeglichenem Suchverzeichnis kein XML und beim Öffnen nur das gewählte Gesetz', async () => {
  const { gleicheSuchverzeichnisAb } = await import('@/lib/persistenz/gesetz/gesetz.index');
  await gleicheSuchverzeichnisAb();
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad.split('/').at(-1) ?? pfad);
    return undefined;
  };
  await starten();
  expect(gelesen).toEqual([]);
  const zeile =
    [...dom.host.querySelectorAll<HTMLElement>('[data-idx]')].find((e) =>
      e.textContent?.includes('de-bund'),
    ) ?? dom.host.querySelector<HTMLElement>('[data-idx]');
  assert(zeile);
  await act(async () => zeile.click());
  await vi.waitFor(() =>
    expect(dom.host.querySelector('[aria-label="Gesetzestext"]')).not.toBeNull(),
  );
  expect(gelesen).toHaveLength(1);
});

it('initialisiert nur beim Mount, auch wenn die mobile Wurzel erneut gerendert wird', async () => {
  await starten();
  expect(native.getCurrent).toHaveBeenCalledTimes(1);
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    gelesen.push(pfad);
    return undefined;
  };
  await act(async () => dom.root.render(<MobileApp />));
  expect(native.getCurrent).toHaveBeenCalledTimes(1);
  expect(gelesen.filter((pfad) => pfad.includes('importindizes/'))).toEqual([]);
});
