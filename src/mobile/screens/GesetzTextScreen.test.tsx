// GesetzTextScreen.test.tsx
// Prüft Verweisklicks am gerenderten Mobil-Screen mit echtem React-Zustand.
import { gesetzesreferenz, gesetzDarstellung, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { Verweisziel } from '@/lib/markierungen/markierungen.index';
import { GesetzTextScreen } from './GesetzTextScreen';

vi.mock('@/components/gesetzestextansicht/gesetzestextansicht.index', () => ({
  Gesetzestextansicht: (
    props: ComponentProps<
      typeof import('@/components/gesetzestextansicht/gesetzestextansicht.index').Gesetzestextansicht
    >,
  ) => (
    <div data-ziel={props.initialNorm ?? ''}>
      <button onClick={() => props.onVerweisKlick?.('start', verweis, false)}>Verweis</button>
    </div>
  ),
}));
vi.mock('@/mobile/components/MobileSeitenleiste', () => ({ MobileSeitenleiste: () => null }));

const gesetz: GesetzDarstellung = gesetzMitNormen(['§ 312', '§ 31a', '§ 31', 'Art. 31'], {
  kurztitel: 'G',
  langtitel: 'G',
  kennung: (i) => `n${i}`,
});
let root: Root;
let verweis: Verweisziel;
let props: ComponentProps<typeof GesetzTextScreen>;
beforeEach(() => {
  vi.useFakeTimers();
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.querySelector('main')!);
  verweis = verweisziel({
    typ: 'zielnormOhneElementstand',
    bezeichnung: '§ 31',
    verweistextZeichenbereich: [0, 5],
  });
  props = {
    gesetz,

    initialNorm: 'start',
    schriftgroesse: 16,
    randInline: 16,
    seitenleistenGroesse: 16,
    onZurueckZuOeffnen: vi.fn(),
    onEinstellungenOeffnen: vi.fn(),
    onAnderesGesetzOeffnen: vi.fn(),
  };
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function klicken() {
  act(() => root.render(<GesetzTextScreen {...props} />));
  act(() => document.querySelector<HTMLButtonElement>('button:last-child')!.click());
}
it.each([
  { bezeichnung: '§ 31', ziel: 'n2' },
  { bezeichnung: '§ 31', ziel: 'n2' },
  { bezeichnung: 'Art. 31', ziel: 'n3' },
])('springt im eigenen Gesetz genau zu $ziel', ({ ziel, ...angabe }) => {
  verweis = verweisziel({
    typ: 'zielnormOhneElementstand',
    verweistextZeichenbereich: [0, 1],
    ...angabe,
  });
  klicken();
  expect(document.querySelector('[data-ziel]')?.getAttribute('data-ziel')).toBe(ziel);
  expect(props.onAnderesGesetzOeffnen).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('Norm nicht gefunden.');
});
it.each(['unbekannt', 'de-bund'])(
  'erkennt dasselbe Gesetz bei anderer Schreibweise (Normgeber: %s)',
  (normgeber) => {
    props.gesetz = { ...gesetz, normgeber };
    const zielgesetz = {
      ...gesetz,

      kurztitel: 'g',
      normgeber: normgeber?.toLowerCase(),
    };
    verweis.gesetz = zielgesetz;
    klicken();
    expect(document.querySelector('[data-ziel]')?.getAttribute('data-ziel')).toBe('n2');
    expect(props.onAnderesGesetzOeffnen).not.toHaveBeenCalled();
  },
);
it('öffnet in einem anderen Gesetz das vollständige Ziel', () => {
  const anderes = gesetzDarstellung({ ...gesetz, kurztitel: 'Anderes' });
  verweis.gesetz = anderes;
  klicken();
  expect(props.onAnderesGesetzOeffnen).toHaveBeenCalledExactlyOnceWith(anderes, '§ 31');
});
it.each(['§ 32', '31'])(
  'zeigt bei fehlendem oder mehrdeutigem Ziel %s einen Hinweis und navigiert nicht',
  (bezeichnung) => {
    verweis.bezeichnung = bezeichnung;
    klicken();
    expect(document.querySelector('[data-ziel]')?.getAttribute('data-ziel')).toBe('start');
    expect(props.onAnderesGesetzOeffnen).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Norm nicht gefunden.');
  },
);
it('übergibt ein ungeladenes Zielgesetz sofort an die Referenzöffnung', () => {
  verweis.gesetz = gesetzesreferenz({ kurztitel: 'Fehlt' });
  klicken();
  expect(props.onAnderesGesetzOeffnen).toHaveBeenCalledExactlyOnceWith(verweis.gesetz, '§ 31');
});

it.each([false, true])(
  'öffnet bei fehlendem § 31 auch neben § 312 kein Ersatz-Ziel (anderes Gesetz: %s)',
  (anderesGesetz) => {
    const zielgesetz = {
      ...gesetz,

      kurztitel: anderesGesetz ? 'Anderes' : gesetz.kurztitel,
      elemente: gesetz.elemente.slice(0, 2),
    };
    if (anderesGesetz) verweis.gesetz = zielgesetz;
    else props.gesetz = zielgesetz;
    klicken();
    expect(document.querySelector('[data-ziel]')?.getAttribute('data-ziel')).toBe('start');
    if (anderesGesetz)
      expect(props.onAnderesGesetzOeffnen).toHaveBeenCalledWith(zielgesetz, '§ 31');
    else {
      expect(props.onAnderesGesetzOeffnen).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain('Norm nicht gefunden.');
    }
  },
);

// Anzeigegrenze: Kurztitel und Hinweis schützen, fachliche Verweiswerte erhalten.
it('schützt Normangaben im mobilen Kurztitel und zeigt ein fehlendes eigenes Normziel', () => {
  props.gesetz = gesetzDarstellung({ ...gesetz, kurztitel: 'Art. 1 Abs. 1' });
  verweis.gesetz = props.gesetz;
  verweis.bezeichnung = '§ 9999 Abs. 1';
  klicken();
  expect(document.body.textContent).toContain('Art.\u00a01 Abs.\u00a01');
  expect(document.body.textContent).toContain('Norm nicht gefunden.');
  expect(props.onAnderesGesetzOeffnen).not.toHaveBeenCalled();
});

it('erhält beide Aktionen und ihre barrierefreien Namen in der mobilen Seitenleiste', async () => {
  const { MobileSeitenleiste } = await vi.importActual<
    typeof import('@/mobile/components/MobileSeitenleiste')
  >('@/mobile/components/MobileSeitenleiste');
  const suche = vi.fn();
  const einstellungen = vi.fn();
  act(() =>
    root.render(
      <MobileSeitenleiste onOeffnenOverlayOeffnen={suche} onEinstellungenOeffnen={einstellungen} />,
    ),
  );
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Einstellungen"]')!.click());
  act(() =>
    document.querySelector<HTMLButtonElement>('[aria-label="Gesetz oder Norm öffnen"]')!.click(),
  );
  expect(einstellungen).toHaveBeenCalledTimes(1);
  expect(suche).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toBe('☰');
});
