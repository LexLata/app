// @vitest-environment jsdom
// ImportExportTextanzeige.test.tsx
// Prüft zusammenhängende Anzeigen sowie unveränderte Eingabe- und Exportdaten.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import { Checkbox } from '@/components/Checkbox';
import { ExportOverlay } from './ExportOverlay';

const { zustand, exportieren, plattform } = vi.hoisted(() => ({
  plattform: { istMac: false },
  zustand: { werte: [] as unknown[], index: 0 },
  exportieren: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: () => undefined,
  useRef: () => ({ current: null }),
  useState: (anfang: unknown) => {
    const index = zustand.index++;
    if (!(index in zustand.werte))
      zustand.werte[index] = typeof anfang === 'function' ? anfang() : anfang;
    return [
      zustand.werte[index],
      (wert: unknown) => {
        zustand.werte[index] = typeof wert === 'function' ? wert(zustand.werte[index]) : wert;
      },
    ];
  },
}));
vi.mock('@/components/overlays/OverlayRahmen', () => ({
  OVERLAY_BREITE_NORMAL: 500,
  OVERLAY_BREITE_KOMPAKT: 400,
  OverlayRahmen: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/overlays/standard/OverlayKopfzeile', () => ({
  OverlayKopfzeile: () => null,
}));
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => plattform }));
vi.mock('@/lib/import-export/import-export.index', () => ({ exportiere: exportieren }));
vi.mock('@/hooks/stil/useTextRollen', () => ({ useTextRollen: () => ({}) }));
vi.mock('@/hooks/stil/useButtonRollen', () => ({
  useButtonRollen: () => ({ primaer: () => ({}), sekundaerKompakt: () => ({}) }),
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({ useAbstandRollen: () => ({}) }));
vi.mock('@/hooks/stil/useRadiusRollen', () => ({ useRadiusRollen: () => ({}) }));

function dom(baum: ReactNode) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(baum);
  return host;
}
function elemente(baum: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(baum)) return baum.flatMap(elemente);
  if (!baum || typeof baum !== 'object' || !('props' in baum)) return [];
  const el = baum as ReactElement<Record<string, unknown>>;
  return [el, ...elemente(el.props.children as ReactNode)];
}
beforeEach(() => {
  zustand.index = 0;
  zustand.werte = [];
  vi.clearAllMocks();
});
it('schützt die vollständige Exportbeschriftung trotz unterstrichenem Tastenkürzel und erhält die Gesetzesreferenz', async () => {
  const referenz = { kurztitel: '§ 12 Abs. 1', normgeber: 'de-bund' };
  const baum = ExportOverlay({
    aktuellesGesetz: referenz,
    onSchliessen: vi.fn(),
  });
  const host = dom(baum);
  expect(host.querySelector('label')?.textContent).toBe('Aktuelles Gesetz (§\u00a012 Abs.\u00a01)');
  expect(host.querySelector('label strong')?.textContent).toBe('A');
  expect((host.querySelector('label strong') as HTMLElement).style.textDecoration).toBe(
    'underline',
  );
  expect((host.querySelector('label strong') as HTMLElement).style.fontWeight).toBe('inherit');
  exportieren.mockResolvedValue('abgebrochen');
  const button = elemente(baum).find((el) => el.type === 'button')!;
  await (button.props.onClick as () => Promise<void>)();
  expect(exportieren).toHaveBeenCalledWith(new Set(['aktuellesGesetz']), {
    aktuellesGesetz: referenz,
  });
});
it('behält Kategorieauswahl durch Tastatur und Checkbox trotz dekorierter Anzeige', () => {
  const baum = ExportOverlay({
    aktuellesGesetz: gesetzesreferenz({ kurztitel: '§ 12' }),
    onSchliessen: vi.fn(),
  });
  const rahmen = elemente(baum).find((el) => 'onKeyDown' in el.props)!;
  const preventDefault = vi.fn();
  (rahmen.props.onKeyDown as (e: unknown) => void)({ key: 'i', preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(zustand.werte[0]).toEqual(new Set(['importindizes']));
  const checkbox = elemente(baum).find((el) => el.type === Checkbox)!;
  (checkbox.props.onChange as () => void)();
  expect(zustand.werte[0]).toEqual(new Set(['importindizes', 'aktuellesGesetz']));
});

it.each([false, true])(
  'zeigt das Kürzel bei Vollständige Sammlung und exportiert damit direkt (Mac: %s)',
  async (istMac) => {
    plattform.istMac = istMac;
    const baum = ExportOverlay({ aktuellesGesetz: null, onSchliessen: vi.fn() });
    const host = dom(baum);
    const sammlung = [...host.querySelectorAll('label')].find((el) =>
      el.textContent?.startsWith('Vollständige Sammlung'),
    )!;
    expect(sammlung.textContent).toBe(
      `Vollständige Sammlung ${istMac ? '⌘\u202f↩' : 'Strg+Enter'}`,
    );
    exportieren.mockResolvedValue('abgebrochen');
    const rahmen = elemente(baum).find((el) => 'onKeyDown' in el.props)!;
    (rahmen.props.onKeyDown as (e: unknown) => void)({
      key: 'Enter',
      metaKey: istMac,
      ctrlKey: !istMac,
      preventDefault: vi.fn(),
    });
    expect(exportieren).toHaveBeenCalledWith(new Set(['vollstaendigeSammlung']), {
      aktuellesGesetz: undefined,
    });
  },
);
