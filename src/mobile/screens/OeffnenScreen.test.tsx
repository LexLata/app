import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import {
  setzeSuchverzeichnisTestdaten,
  erfolgreicherSuchTestImport,
} from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
import { suchtrefferKopfangaben } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// OeffnenScreen.test.tsx
// Mobile Anzeigen schützen; Suchwert, Tastaturwert und Cursor-Messkopie bleiben original.
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OeffnenScreen } from './OeffnenScreen';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';

const mocks = vi.hoisted(() => ({
  fertigAnzeigen: false,
  importieren: vi.fn(),
  kandidaten: vi.fn(),
  tastatur: vi.fn(),
  treffer: vi.fn(),
  brauchtIndex: vi.fn(),
  anfrage: {
    suchtext: undefined as string | undefined,
    artikelNummer: null as string | null,
    normNummer: null as string | null,
    erwaegungsgrundNummer: null,
    gesetzQuery: 'G',
  },
}));
vi.mock('@/lib/import/import.index', async (original) => ({
  ...(await original<typeof import('@/lib/import/import.index')>()),
  istImportindexSuchbestandAktuell: () => true,
  istImportindexSuchbestandVollstaendig: () => true,
  sucheKandidatenAlleQuellen: mocks.kandidaten,
  importiereGesetze: mocks.importieren,
}));
vi.mock('@/lib/domain/app/oeffnen/oeffnen.index', async (original) => ({
  ...(await original<typeof import('@/lib/domain/app/oeffnen/oeffnen.index')>()),
  parseSuchanfrage: () => mocks.anfrage,
  brauchtImportindexPruefung: mocks.brauchtIndex,
  berechneTreffer: mocks.treffer,
}));
vi.mock('@/components/overlays/overlays.index', async (original) => ({
  ...(await original<typeof import('@/components/overlays/overlays.index')>()),
  TrefferZeile: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick}>Treffer</button>
  ),
}));
vi.mock('@/mobile/useCustomTastatur', () => ({ useCustomTastatur: mocks.tastatur }));
vi.mock('@/mobile/components/CustomTastatur', () => ({
  CustomTastatur: ({ onFertig }: { onFertig: () => void }) =>
    mocks.fertigAnzeigen ? <button onClick={onFertig}>Fertig</button> : null,
}));
let root: Root;
let eingeben: (wert: string) => void;
let aktiverWert: string;
let cursorPosition: number;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.fertigAnzeigen = false;
  Object.assign(mocks.anfrage, {
    suchtext: undefined,
    normNummer: null,
    artikelNummer: null,
    erwaegungsgrundNummer: null,
    gesetzQuery: 'G',
  });
  mocks.brauchtIndex.mockReturnValue(false);
  mocks.treffer.mockReturnValue([
    { art: 'index', eintrag: { kurztitel: 'Art. 1 Abs. 1', abrufkennung: 'original-link' } },
  ]);
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 0,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 200,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: 0,
  });
  nativeAttrappeZuruecksetzen();
  setzeSuchverzeichnisTestdaten([]);
  root = createRoot(document.querySelector('main')!);
  cursorPosition = 7;
  mocks.tastatur.mockImplementation(({ wert, onWertAendern }) => {
    aktiverWert = wert;
    eingeben = onWertAendern;
    return {
      tastaturSichtbar: true,
      cursorPosition,
      inputProps: { readOnly: true },
      schliessen: vi.fn(),
    };
  });
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const leereGesetze: GesetzDarstellung[] = [];
async function rendern(gesetze = leereGesetze, onGesetzGewaehlt = vi.fn()) {
  setzeSuchverzeichnisTestdaten(gesetze);
  await act(async () =>
    root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onGesetzGewaehlt={onGesetzGewaehlt}
        onGesetzImportiert={vi.fn()}
        customTastaturAktiv
        onReferenzGewaehlt={(referenz, xmlId) =>
          suchtrefferOeffnenFuerTest(gesetze, onGesetzGewaehlt, onGesetzGewaehlt)(
            referenz,
            xmlId,
            false,
          )
        }
      />,
    ),
  );
}
it('misst den originalen Suchwert und erhält ihn auch beim gesperrten Import', async () => {
  let abschliessen!: (wert: unknown) => void;
  mocks.importieren.mockImplementation(
    () =>
      new Promise((resolve) => {
        abschliessen = resolve;
      }),
  );
  await rendern();
  const original = '§  9999 Abs. 1\tArt. 2\n';
  act(() => eingeben(original));
  const input = document.querySelector('input')!;
  const mirror = document.querySelector<HTMLSpanElement>('span[aria-hidden]')!;
  expect(input.value).toBe(original);
  expect(input.getAttribute('readOnly')).toBe('');
  expect(aktiverWert).toBe(original);
  expect(mirror.textContent).toBe(original.slice(0, cursorPosition));
  expect(mirror.style.visibility).toBe('hidden');
  // Reale Breite wird vom Browser geliefert; hier wird deren Verbrauch geprüft.
  Object.defineProperty(mirror, 'offsetWidth', { get: () => 73 });
  Object.defineProperty(input, 'clientWidth', { get: () => 200 });
  input.scrollLeft = 0;
  cursorPosition++;
  await rendern();
  expect(document.querySelector<HTMLElement>('.custom-cursor')!.style.left).toBe('85px');
  act(() => document.querySelectorAll('button')[1]!.click());
  expect(document.body.textContent).toContain('„Art.\u00a01 Abs.\u00a01" wird importiert …');
  expect(input.disabled).toBe(true);
  expect(input.value).toBe(original);
  expect(mocks.importieren).toHaveBeenCalledWith(
    [{ kurztitel: 'Art. 1 Abs. 1', abrufkennung: 'original-link' }],
    'de-bund',
  );
  await act(async () =>
    abschliessen({
      erfolgreiche: [],
      fehlgeschlagene: [{ fehler: { meldung: '§ 9999 Abs. 1 fehlt' } }],
    }),
  );
  expect(document.body.textContent).toContain('§\u00a09999 Abs.\u00a01 fehlt');
  expect(input.value).toBe(original);
  act(() => document.querySelector<HTMLButtonElement>('[aria-label="Eingabe löschen"]')!.click());
  expect(input.value).toBe('');
  expect(aktiverWert).toBe('');
  expect(mirror.textContent).toBe('');
});

it('aktualisiert Treffer nach dem Laden des Importindex und berechnet bei gleichem Stand nicht neu', async () => {
  mocks.brauchtIndex.mockReturnValue(true);
  let indexLiefern!: (wert: unknown) => void;
  mocks.kandidaten.mockImplementation(
    () =>
      new Promise((resolve) => {
        indexLiefern = resolve;
      }),
  );
  mocks.treffer.mockImplementation((_suchtext, _gesetze, _zuletzt, index) =>
    index
      ? index['de-bund'].map((eintrag: { kurztitel: string }) => ({ art: 'index', eintrag }))
      : [],
  );
  await rendern();
  await act(async () => vi.dynamicImportSettled());
  const vorher = mocks.treffer.mock.calls.length;
  await rendern();
  expect(mocks.treffer).toHaveBeenCalledTimes(vorher);
  expect(document.querySelectorAll('button')).toHaveLength(0);
  const bund = [{ kurztitel: 'BGB', abrufkennung: 'bgb' }];
  await act(async () => indexLiefern({ 'de-bund': bund, 'de-bw': [], eu: [] }));
  expect(mocks.treffer).toHaveBeenCalledTimes(vorher + 1);
  expect(mocks.treffer.mock.lastCall?.[3]).toEqual({ 'de-bund': bund, 'de-bw': [], eu: [] });
  expect(document.querySelectorAll('button')).toHaveLength(1);
  await rendern();
  expect(mocks.treffer).toHaveBeenCalledTimes(vorher + 1);
});

it('springt nach mobilem Import anhand des tatsächlichen Gesetzes zur ersten Zahl', async () => {
  mocks.anfrage.artikelNummer = '10';
  mocks.anfrage.normNummer = '5';
  const gesetz = gesetzDarstellung({
    kurztitel: 'G',
    langtitel: 'G',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm',
        data: normaleNorm({ id: '10', xmlId: '10', bezeichnung: '§ 10', absaetze: [] }),
      },
    ],
  });
  mocks.importieren.mockImplementation(async () => erfolgreicherSuchTestImport(gesetz));
  const gewaehlt = vi.fn();
  await act(async () =>
    root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onGesetzGewaehlt={gewaehlt}
        onGesetzImportiert={vi.fn()}
        customTastaturAktiv
        onReferenzGewaehlt={suchtrefferOeffnenFuerTest([], gewaehlt, gewaehlt)}
      />,
    ),
  );
  await act(async () => document.querySelectorAll('button')[0]!.click());
  expect(gewaehlt).toHaveBeenCalledWith(gesetz, '10');
  mocks.anfrage.artikelNummer = null;
  mocks.anfrage.normNummer = null;
});

it('öffnet nach dem mobilen Import die Norm vor einem exakten Zahlbeginn-Titel', async () => {
  const { berechneTreffer, parseSuchanfrage } = await vi.importActual<
    typeof import('@/lib/domain/app/oeffnen/oeffnen.index')
  >('@/lib/domain/app/oeffnen/oeffnen.index');
  const gesetz = {
    kurztitel: '2. PKHB 2012',
    langtitel: '',
    normgeber: 'de-bund',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm' as const,
        data: normaleNorm({ id: '1', xmlId: 'ziel-1', bezeichnung: '§ 1', absaetze: [] }),
      },
    ],
  };
  Object.assign(mocks.anfrage, parseSuchanfrage('1 2. PKHB 2012'));
  mocks.brauchtIndex.mockReturnValue(true);
  mocks.kandidaten.mockResolvedValue({
    'de-bund': [
      { kurztitel: 'PKHB 2012', langtitel: '', abrufkennung: 'falsch' },
      { kurztitel: gesetz.kurztitel, langtitel: '', abrufkennung: 'richtig' },
    ],
    'de-bw': [],
    eu: [],
  });
  mocks.treffer.mockImplementation(berechneTreffer);
  mocks.importieren.mockImplementation(async () => erfolgreicherSuchTestImport(gesetz));
  const gewaehlt = vi.fn();
  await act(async () =>
    root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onGesetzGewaehlt={gewaehlt}
        onGesetzImportiert={vi.fn().mockResolvedValue([gesetz])}
        customTastaturAktiv
        onReferenzGewaehlt={suchtrefferOeffnenFuerTest([], gewaehlt, gewaehlt)}
      />,
    ),
  );
  await act(async () => eingeben('1 2. PKHB 2012'));
  await act(async () => document.querySelectorAll('button')[1]!.click());
  expect(mocks.importieren).toHaveBeenCalledWith(
    [{ kurztitel: gesetz.kurztitel, abrufkennung: 'richtig' }],
    'de-bund',
  );
  expect(gewaehlt).toHaveBeenCalledWith(gesetz, 'ziel-1');
});

it('hält mobile namensgleiche Treffer verschiedener und fehlender Normgeber getrennt', async () => {
  const fehler = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const gesetze = ['de-bund', 'de-bw', 'unbekannt'].map((normgeber) => ({
    kurztitel: 'TestG',
    langtitel: '',
    normgeber,
    elemente: [],
    hatGliederungsartikel: false,
  }));
  mocks.treffer.mockReturnValue(
    gesetze.map((gesetz) => ({ art: 'installiert', ...suchtrefferKopfangaben(gesetz) })),
  );
  const gewaehlt = vi.fn();
  await act(async () =>
    root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onGesetzGewaehlt={gewaehlt}
        onGesetzImportiert={vi.fn()}
        customTastaturAktiv
        onReferenzGewaehlt={suchtrefferOeffnenFuerTest(gesetze, gewaehlt, gewaehlt)}
      />,
    ),
  );
  for (let i = 0; i < gesetze.length; i++) {
    await act(async () => document.querySelectorAll('button')[i]!.click());
    expect(gewaehlt).toHaveBeenLastCalledWith(gesetze[i], undefined);
  }
  expect(fehler).not.toHaveBeenCalled();
  fehler.mockRestore();
});

it('prüft den Indexbedarf mit vollständigem Zahlentitel statt der vorläufigen Gesetzesangabe', async () => {
  await rendern();
  act(() => eingeben('6 2004/38/EG'));
  expect(mocks.brauchtIndex).toHaveBeenLastCalledWith('6 2004/38/EG');
});

it('öffnet mobil mit echten Treffern beim Antippen die gewählte Norm und mit Fertig die erste Norm', async () => {
  const { berechneTreffer, parseSuchanfrage } = await vi.importActual<
    typeof import('@/lib/domain/app/oeffnen/oeffnen.index')
  >('@/lib/domain/app/oeffnen/oeffnen.index');
  mocks.fertigAnzeigen = true;
  const gesetze = ['A', 'B'].map((kurztitel) =>
    gesetzDarstellung({
      kurztitel,
      elemente: [
        { typ: 'norm', data: normaleNorm({ xmlId: `ziel-${kurztitel}`, bezeichnung: '§ 1' }) },
      ],
    }),
  );
  mocks.treffer.mockImplementation(berechneTreffer);
  Object.assign(mocks.anfrage, parseSuchanfrage('1'));
  const gewaehlt = vi.fn();
  await rendern(gesetze, gewaehlt);
  act(() => eingeben('1'));
  const trefferButtons = [...document.querySelectorAll('button')].filter(
    (button) => button.textContent === 'Treffer',
  );
  act(() => trefferButtons.at(1)?.click());
  expect(gewaehlt).toHaveBeenLastCalledWith(gesetze[1], 'ziel-B');
  act(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Fertig')
      ?.click(),
  );
  expect(gewaehlt).toHaveBeenLastCalledWith(gesetze[0], 'ziel-A');
});

it('zeigt mobil alle Nebennormen des exakten Gesetzes und öffnet Anlage oder Hauptnorm ohne doppelte Schlüssel', async () => {
  const { berechneTreffer, parseSuchanfrage } = await vi.importActual<
    typeof import('@/lib/domain/app/oeffnen/oeffnen.index')
  >('@/lib/domain/app/oeffnen/oeffnen.index');
  const fehler = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const gesetz = gesetzDarstellung({
    kurztitel: 'LBO',
    elemente: [
      { typ: 'norm', data: normaleNorm({ xmlId: 'anlage', bezeichnung: 'Anlage 1' }) },
      { typ: 'norm', data: normaleNorm({ xmlId: 'paragraph', bezeichnung: '§ 1' }) },
    ],
  });
  mocks.fertigAnzeigen = true;
  mocks.treffer.mockImplementation(berechneTreffer);
  Object.assign(mocks.anfrage, parseSuchanfrage('1 LBO'));
  const gewaehlt = vi.fn();
  await rendern([gesetz], gewaehlt);
  act(() => eingeben('1 LBO'));
  const treffer = [...document.querySelectorAll('button')].filter(
    (b) => b.textContent === 'Treffer',
  );
  expect(treffer).toHaveLength(2);
  act(() => treffer.at(1)?.click());
  expect(gewaehlt).toHaveBeenLastCalledWith(gesetz, 'anlage');
  act(() =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Fertig')?.click(),
  );
  expect(gewaehlt).toHaveBeenLastCalledWith(gesetz, 'paragraph');
  expect(fehler).not.toHaveBeenCalled();
  fehler.mockRestore();
});
