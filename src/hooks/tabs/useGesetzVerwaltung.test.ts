// @vitest-environment jsdom
// Ein Fehler beim Laden der Gesetzeskurzbefehle lässt die Zuordnung leer und
// erzeugt weder beim Start noch beim erneuten Laden eine abgelehnte Promise.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';

const ladeAlleGesetzeskurzbefehle = vi.fn();
const mocks = vi.hoisted(() => ({
  laden: vi.fn(),
  repariere: vi.fn(),
  warte: vi.fn(),
  listen: vi.fn(),
  xml: vi.fn(),
  save: vi.fn(),
  write: vi.fn(),
  loesche: vi.fn(),
  kurzbefehlLoeschen: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeAlleGesetze: mocks.laden,
  ladeGesetzesXML: mocks.xml,
  hatNormenOhneTitel: () => false,
  leseGesetzInfos: () => ({ kurztitel: 'BGB', normgeber: 'de-bund' }),
  warteAufSpeicherBatchAbschluss: mocks.warte,
  loescheGesetz: mocks.loesche,
}));
vi.mock('@/lib/import/import.index', () => ({ repariereGesetze: mocks.repariere }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeTextFile: mocks.write }));
vi.mock('@/lib/plattform/menu/menu.index', () => ({ setzeAktiv: vi.fn() }));

vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  ladeAlleGesetzeskurzbefehle: (...args: unknown[]) => ladeAlleGesetzeskurzbefehle(...args),
  loescheGesetzeskurzbefehl: mocks.kurzbefehlLoeschen,
}));

import { useGesetzVerwaltung } from './useGesetzVerwaltung';
import { alleBannerSchliessen, bannerDauerMs, getSnapshot } from '@/lib/banner/banner.index';

const dom = domTestWurzel();
async function renderVerwaltung(params: Parameters<typeof useGesetzVerwaltung>[0]) {
  let aktuell!: ReturnType<typeof useGesetzVerwaltung>;
  function Probe() {
    aktuell = useGesetzVerwaltung(params);
    return null;
  }
  await act(async () => dom.root.render(createElement(Probe)));
  return new Proxy(aktuell, {
    get(_ziel, feld) {
      const wert = Reflect.get(aktuell, feld);
      return typeof wert === 'function'
        ? async (...argumente: unknown[]) => {
            let ergebnis: unknown;
            await act(async () => {
              ergebnis = await Reflect.apply(wert, undefined, argumente);
            });
            return ergebnis;
          }
        : wert;
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  alleBannerSchliessen();
  mocks.laden.mockReset();
  mocks.repariere.mockReset();
  mocks.warte.mockReset().mockResolvedValue(undefined);
  mocks.listen.mockReset().mockResolvedValue(vi.fn());
  let nummer = 0;
  const handler = new Map<number, unknown>();
  Object.assign(window, {
    __TAURI_INTERNALS__: {
      transformCallback: (callback: unknown) => {
        handler.set(++nummer, callback);
        return nummer;
      },
      invoke: async (befehl: string, args: { event: string; handler: number }) => {
        if (befehl === 'plugin:event|listen') {
          await mocks.listen(args.event, handler.get(args.handler));
          return args.handler;
        }
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
});

describe('Gesetzeskurzbefehle bei Lesefehler', () => {
  it('lässt die Zuordnung beim ersten Laden und beim erneuten Laden leer', async () => {
    ladeAlleGesetzeskurzbefehle.mockRejectedValue(new Error('Gesetzeskurzbefehle nicht lesbar'));
    const verwaltung = await renderVerwaltung({
      gesetzeTabsSchliessen: vi.fn(),
    });

    expect(verwaltung.gesetzeskurzbefehle).toEqual({});

    await expect(verwaltung.handleGesetzeskurzbefehleGeaendert()).resolves.toBeUndefined();
    expect(verwaltung.gesetzeskurzbefehle).toEqual({});
    expect(ladeAlleGesetzeskurzbefehle).toHaveBeenCalledTimes(2);
  });
});

describe('Gesetzexport', () => {
  it.each(['dialog', 'schreiben', 'abbruch'] as const)(
    'behandelt %s ohne austretende Rejection',
    async (fall) => {
      mocks.xml.mockResolvedValue('<gesetz />');
      mocks.save.mockReset().mockResolvedValue(fall === 'abbruch' ? null : '/export.xml');
      mocks.write.mockReset().mockResolvedValue(undefined);
      if (fall === 'dialog') mocks.save.mockRejectedValue(new Error('Dialogfehler'));
      if (fall === 'schreiben') mocks.write.mockRejectedValue(new Error('Platte voll'));
      const verwaltung = await renderVerwaltung({
        gesetzeTabsSchliessen: vi.fn(),
      });
      await expect(
        verwaltung.handleExportieren({ kurztitel: 'bgb', normgeber: 'de-bund' }),
      ).resolves.toBeUndefined();
      if (fall === 'abbruch') {
        expect(getSnapshot()).toEqual([]);
        expect(mocks.write).not.toHaveBeenCalled();
      } else {
        expect(getSnapshot()).toEqual([
          expect.objectContaining({
            text: 'Die Datei konnte nicht exportiert werden.',
            typ: 'fehler',
          }),
        ]);
        // P2-A3: fehlgeschlagener Export bleibt stehen.
        expect(getSnapshot().map((b) => bannerDauerMs(b))).toEqual([undefined]);
      }
    },
  );
});

describe('Löschen (P2-A3)', () => {
  it('meldet ein fehlgeschlagenes Löschen als Bedienhinweis für 5 s', async () => {
    mocks.loesche.mockRejectedValue(new Error('gesperrt'));
    const verwaltung = await renderVerwaltung({ gesetzeTabsSchliessen: vi.fn() });
    await verwaltung.handleLoeschen({ kurztitel: 'bgb', normgeber: 'de-bund' });
    expect(getSnapshot().map((b) => [b.art, bannerDauerMs(b)])).toEqual([['bedienhinweis', 5000]]);
  });

  it('lässt den Hinweis stehen, wenn gelöscht, aber andere Fenster nicht benachrichtigt wurden', async () => {
    mocks.loesche.mockResolvedValue({ benachrichtigung: 'fehlgeschlagen', fehler: new Error('x') });
    const verwaltung = await renderVerwaltung({ gesetzeTabsSchliessen: vi.fn() });
    await verwaltung.handleLoeschen({ kurztitel: 'bgb', normgeber: 'de-bund' });
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot().map((b) => bannerDauerMs(b))).toEqual([undefined]);
  });

  it('lässt den Hinweis stehen, wenn gelöscht, aber der Gesetzeskurzbefehl nicht entfernt wurde', async () => {
    mocks.loesche.mockResolvedValue({ benachrichtigung: 'gesendet' });
    mocks.kurzbefehlLoeschen.mockRejectedValue(new Error('nicht schreibbar'));
    ladeAlleGesetzeskurzbefehle.mockResolvedValue({});
    const verwaltung = await renderVerwaltung({ gesetzeTabsSchliessen: vi.fn() });
    await verwaltung.handleLoeschen({ kurztitel: 'bgb', normgeber: 'de-bund' });
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot().map((b) => bannerDauerMs(b))).toEqual([undefined]);
  });
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: mocks.laden,
}));
