// useTiefenLinks.test.ts
// Links beim App-Start, bei laufender App und interne Navigation erhalten die vollständige Zielreferenz.
import {
  gliederungsartikel,
  normaleNorm,
  gesetzDarstellung,
  gesetzMitNormen,
} from '@/test/gesetz/gesetzFabriken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { useTiefenLinks } from './useTiefenLinks';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  getCurrent: vi.fn(),
  listen: vi.fn(),
  label: 'main',
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (fn: () => void) => fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: native.getCurrent }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: native.listen }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: native.label, listen: native.listen }),
}));

function gesetz(normgeber = 'de-bund'): GesetzDarstellung {
  return {
    kurztitel: 'A/B',
    normgeber,
    langtitel: '',
    hatGliederungsartikel: false,
    elemente: [],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  alleBannerSchliessen();
  native.label = 'main';
  native.listen.mockResolvedValue(vi.fn());
});

describe('Tiefenlink-Navigation', () => {
  it('öffnet den richtigen BGB-Link mit passender Referenz, XML-ID und Verlauf', async () => {
    const bgb: GesetzDarstellung = gesetzDarstellung({
      ...gesetz('de-bund'),
      kurztitel: 'BGB',
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: 'norm', xmlId: 'bgb-1', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    });
    native.getCurrent.mockResolvedValue(['LEXLATA://DE-Bund/bgb/1']);
    const oeffnen = vi.fn();
    const hook = useTiefenLinks({
      gesetze: [{ ...bgb, normgeber: 'de-bw' }, bgb],
      elementOeffnen: oeffnen,
    });
    const ziel = await hook.leseAppStartZiel();
    hook.oeffneTiefenLinkZiel(ziel!, [{ ...bgb, normgeber: 'de-bw' }, bgb], 'aktiver-tab');
    expect(oeffnen).toHaveBeenCalledExactlyOnceWith({
      gesetz: bgb,
      xmlId: 'bgb-1',
      modus: 'aktiver-tab',
    });
  });
  it('öffnet den untergeordneten Paragrafen eines Gliederungsartikels', async () => {
    const egbgb: GesetzDarstellung = gesetzDarstellung({
      ...gesetz('de-bund'),
      kurztitel: 'EGBGB',
      hatGliederungsartikel: true,
      elemente: [
        {
          typ: 'norm',
          data: gliederungsartikel({
            art: 'gliederungsartikel',
            ueberschriftartig: false,
            id: 'artikel',
            xmlId: '249',
            bezeichnung: 'Art. 249',
            gliederungsEbene: 0,
            absaetze: [],
          }),
        },
        {
          typ: 'norm',
          data: normaleNorm({
            id: 'paragraf',
            xmlId: '249-3',
            bezeichnung: 'Art. 249 § 3',
            absaetze: [],
          }),
        },
      ],
    });
    native.getCurrent.mockResolvedValue(['lexlata://de-bund/egbgb/249/3']);
    const oeffnen = vi.fn();
    const hook = useTiefenLinks({ gesetze: [egbgb], elementOeffnen: oeffnen });
    hook.oeffneTiefenLinkZiel((await hook.leseAppStartZiel())!, [egbgb]);
    expect(oeffnen).toHaveBeenCalledExactlyOnceWith({
      gesetz: egbgb,
      xmlId: '249-3',
      modus: undefined,
    });
  });
  it.each(['gesetz-neu', 'gesetz-restore', 'einstellungen'])(
    'liest im Fenster %s keine Plugin-Start-URL',
    async (label) => {
      native.label = label;
      native.getCurrent.mockResolvedValue(['lexlata://de-bund/bgb/1']);
      const hook = useTiefenLinks({ gesetze: [], elementOeffnen: vi.fn() });
      expect(await hook.leseAppStartZiel()).toBeNull();
      expect(native.getCurrent).not.toHaveBeenCalled();
    },
  );
  it('öffnet bei App-Start das namensgleiche Gesetz des angegebenen Normgebers', async () => {
    const bw = gesetz('de-bw');
    native.getCurrent.mockResolvedValue(['lexlata://de-bw/a%2Fb']);
    const oeffnen = vi.fn();
    const hook = useTiefenLinks({ gesetze: [gesetz('de-bund'), bw], elementOeffnen: oeffnen });
    const ziel = await hook.leseAppStartZiel();
    expect(ziel).toEqual(expect.objectContaining({ normgeber: 'de-bw', kurztitel: 'a/b' }));
    hook.oeffneTiefenLinkZiel(ziel!, [gesetz('de-bund'), bw]);
    expect(oeffnen).toHaveBeenCalledWith(expect.objectContaining({ gesetz: bw }));
  });
  it('verarbeitet das Link-Ereignis bei laufender App einschließlich unbekanntem Normgeber', async () => {
    const unbekannt = gesetz('unbekannt');
    const oeffnen = vi.fn();
    useTiefenLinks({ gesetze: [gesetz('de-bund'), unbekannt], elementOeffnen: oeffnen });
    await vi.waitFor(() => expect(native.listen).toHaveBeenCalled());
    const callback = native.listen.mock.calls[0]![1] as (event: { payload: string[] }) => void;
    callback({ payload: ['lexlata://unbekannt/a%2Fb'] });
    expect(oeffnen).toHaveBeenCalledWith(expect.objectContaining({ gesetz: unbekannt }));
  });
  it('übergibt fehlende konkrete Desktopziele unmittelbar an den gemeinsamen Öffnungspfad', () => {
    const oeffnen = vi.fn();
    const hook = useTiefenLinks({
      gesetze: [],
      elementOeffnen: vi.fn(),
      gesetzesreferenzOeffnen: oeffnen,
    });
    hook.oeffneTiefenLinkZiel(
      { kurztitel: 'BGB', normgeber: 'de-bund', bezeichnung: '433' },
      [],
      'aktiver-tab',
    );
    expect(oeffnen).toHaveBeenCalledExactlyOnceWith(
      {
        gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' },
        bezeichnung: '433',
        tiefenlink: true,
      },
      'aktiver-tab',
    );
  });
  it('öffnet auf Mobile keine ähnliche Ersatznorm und kein fehlendes Gesetz', () => {
    const oeffnen = vi.fn();
    const bgb = {
      ...gesetz('de-bund'),
      elemente: [
        {
          typ: 'norm' as const,
          data: normaleNorm({ id: 'n', xmlId: '90', bezeichnung: '§ 90', absaetze: [] }),
        },
      ],
    };
    const hook = useTiefenLinks({ gesetze: [bgb], elementOeffnen: oeffnen });
    hook.oeffneTiefenLinkZiel({ kurztitel: 'A/B', normgeber: 'de-bund', bezeichnung: '9' }, [bgb]);
    hook.oeffneTiefenLinkZiel({ kurztitel: 'Fehlend', normgeber: 'de-bund' }, [bgb]);
    expect(oeffnen).not.toHaveBeenCalled();
  });
});

it('mobile/alter Aufrufer ignoriert Öffnen-Links ohne expliziten Desktop-Empfänger', async () => {
  native.getCurrent.mockResolvedValue(['lexlata://oeffnen/433%20BGB']);
  const oeffnen = vi.fn();
  const links = useTiefenLinks({ gesetze: [], elementOeffnen: oeffnen });
  expect(await links.leseAppStartZiel()).toBeNull();
  links.oeffneTiefenLinkZiel({ type: 'oeffnen', suchtext: '433 BGB' }, []);
  const callback = native.listen.mock.calls[0]![1];
  callback({ payload: ['lexlata://oeffnen/433%20BGB'] });
  await Promise.resolve();
  expect(oeffnen).not.toHaveBeenCalled();
});
it('gibt App-Start-Öffnen-Link ausdrücklich an den Desktop-Empfänger weiter', async () => {
  native.getCurrent.mockResolvedValue(['lexlata://oeffnen/433%20BGB']);
  const empfangen = vi.fn(async () => {});
  const links = useTiefenLinks({
    gesetze: [],
    elementOeffnen: vi.fn(),
    oeffnenLinkEmpfangen: empfangen,
  });
  expect(await links.leseAppStartZiel()).toEqual({ type: 'oeffnen', suchtext: '433 BGB' });
  expect(empfangen).toHaveBeenCalledWith({ type: 'oeffnen', suchtext: '433 BGB' }, true);
});

it.each(['beim App-Start', 'bei laufender App'] as const)(
  'meldet einen ungültigen Desktoplink %s ohne Öffnungsauftrag',
  async (art) => {
    const oeffnen = vi.fn();
    native.getCurrent.mockResolvedValue(['lexlata://de-bund/BGB/9?keinFallback']);
    const links = useTiefenLinks({
      gesetze: [],
      elementOeffnen: vi.fn(),
      gesetzesreferenzOeffnen: oeffnen,
    });
    if (art === 'beim App-Start') expect(await links.leseAppStartZiel()).toBeNull();
    else native.listen.mock.calls[0]![1]({ payload: ['lexlata://de-bund/BGB/9?keinFallback'] });
    await vi.waitFor(() =>
      expect(getSnapshot()[0]?.text).toContain('Der Link konnte nicht geöffnet werden.'),
    );
    expect(getSnapshot()[0]?.text).toContain('lexlata://oeffnen/433%20BGB');
    expect(oeffnen).not.toHaveBeenCalled();
  },
);
it.each([
  ['§ 9', '§ 9'],
  ['Art. 9', '§ 90'],
] as const)('Mobile öffnet mehrdeutige oder präfixwidrige Ziele nicht: %s/%s', (a, b) => {
  const g = gesetzMitNormen([a, b], { kurztitel: 'A/B', langtitel: '' });
  const oeffnen = vi.fn();
  const links = useTiefenLinks({ gesetze: [g], elementOeffnen: oeffnen });
  links.oeffneTiefenLinkZiel({ kurztitel: 'A/B', normgeber: 'de-bund', bezeichnung: '§ 9' }, [g]);
  expect(oeffnen).not.toHaveBeenCalled();
});
