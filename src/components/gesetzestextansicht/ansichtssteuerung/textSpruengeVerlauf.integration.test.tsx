import { schreibeSpeicherbareNorm } from '@/lib/domain/aktives-element/aktives-element.index';
// @vitest-environment jsdom
// Echte Textansicht und Verlaufssteuerung prüfen interne Sprünge samt Rückweg.
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { act, useLayoutEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, assert, expect, it, vi } from 'vitest';
import { useAnsichtssteuerung, StrukturKontextLeiste } from './ansichtssteuerung.index';
import { erstelleTestTextMessung, testAbsaetze } from '@/test/gesetz/testDarstellung';
import {
  FavoritSchnellaktion,
  Favoritenleiste,
} from '@/components/seitenleisten/seitenleisten.index';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/Gesetzestextansicht';
import { useVerlaufSteuerung } from '@/hooks/tabs/useVerlaufSteuerung';
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import type { GesetzestextansichtProps } from '@/components/gesetzestextansicht/Gesetzestextansicht.types';

vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  ladeFavoriten: async () => ['§ 3'],
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (o: { count: number; getItemKey: (i: number) => string }) => ({
    getVirtualItems: () =>
      Array.from({ length: o.count }, (_, index) => ({
        index,
        key: o.getItemKey(index),
        start: index * 100,
        size: 100,
      })),
    getTotalSize: () => o.count * 100,
    getOffsetForIndex: (i: number) => [i * 100],
    measureElement: () => {},
  }),
}));
const gesetz = gesetzDarstellung({
  elemente: [
    {
      typ: 'ueberschrift',
      data: {
        id: 'oben',
        xmlId: 'ueberschrift:001',
        ebene: 1,
        gliederungskennzahl: '001',
        bezeichnung: 'Teil',
      },
    },
    {
      typ: 'ueberschrift',
      data: {
        id: 'unten',
        xmlId: 'ueberschrift:001001',
        ebene: 2,
        gliederungskennzahl: '001001',
        bezeichnung: 'Kapitel',
      },
    },
    ...['A', 'B', 'C'].map((xmlId, i) => ({
      typ: 'norm' as const,
      data: normaleNorm({ id: xmlId, xmlId, bezeichnung: `§ ${i + 1}`, absaetze: testAbsaetze }),
    })),
  ],
});
const eintrag = (xmlId: string) => ({
  gesetzesreferenz: { normgeber: gesetz.normgeber, kurztitel: gesetz.kurztitel },
  xmlId,
});
let root: Root;
let host: HTMLDivElement;
let steuerung: ReturnType<typeof useVerlaufSteuerung>;
let klappstufen: Parameters<NonNullable<GesetzestextansichtProps['onKlappstufenStatusAendern']>>[0];
let initialNorm: string | undefined;
let draw: () => void;
async function starten() {
  const tabsRef = { current: [tabFuerTest({ id: 'tab', gesetz })] };
  initialNorm = undefined;
  function Probe() {
    const verlauf = useVerlaufSteuerung(tabsRef);
    const [favoriten, setFavoriten] = useState<
      Parameters<NonNullable<GesetzestextansichtProps['onFavoritenStatusAendern']>>[0]
    >({
      istAktuellFavorit: false,
      favoritenleisteSichtbar: false,
      favoritenEintraege: [],
      favoritAufrufen: () => {},
    });
    useLayoutEffect(() => {
      steuerung = verlauf;
    });
    return (
      <>
        <Gesetzestextansicht
          onSpeicherbareNormAendern={schreibeSpeicherbareNorm}
          onFavoritenStatusAendern={setFavoriten}
          gesetz={gesetz}
          initialAktivesElementId="A"
          initialNorm={initialNorm}
          markierungenDeaktiviert
          onKlappstufenStatusAendern={(s) => {
            klappstufen = s;
          }}
          onAktivierung={({ xmlId, art }) => verlauf.verlaufAktivierung('tab', eintrag(xmlId), art)}
        />
        <Favoritenleiste
          gesetz={gesetz}
          eintraege={favoriten.favoritenEintraege}
          onKlick={favoriten.favoritAufrufen}
          seite="rechts"
          schnellaktionenAnzahl={1}
          schnellaktionen={<FavoritSchnellaktion onFavoritKlick={() => {}} />}
        />
      </>
    );
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  draw = () => root.render(<Probe />);
  await act(async () => {
    draw();
  });
  await act(async () => vi.dynamicImportSettled());
  act(() =>
    steuerung.verlaufSetzen('tab', {
      eintraege: [eintrag('A')],
      position: 0,
      aktivesElement: eintrag('A'),
    }),
  );
}
const liste = () => steuerung.verlaufLesen('tab')?.eintraege.map((e) => e.xmlId);
async function taste(key: string, optionen: KeyboardEventInit = {}) {
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key, ...optionen })));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('P8-A1/A5: Favoritenklick trägt die verlassene Stelle vor dem Ziel nach; zurück erreicht sie', async () => {
  await starten();
  await taste('ArrowDown', { altKey: true });
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('B'));
  expect(liste()).toEqual(['A']);
  const favorit = Array.from(host.querySelectorAll('button')).find((b) =>
    b.title.replaceAll('\u00a0', ' ').includes('§ 3'),
  );
  assert(favorit);
  await act(async () => favorit.click());
  expect(liste()).toEqual(['C', 'B', 'A']);
  const vorher = steuerung.verlaufLesen('tab')?.eintraege;
  await act(async () => favorit.click());
  expect(steuerung.verlaufLesen('tab')?.eintraege).toBe(vorher);
  await act(async () =>
    steuerung.verlaufNavigieren('tab', 'zurueck', (ziel, fertig) => {
      initialNorm = ziel.xmlId;
      draw();
      fertig(true);
      return () => {};
    }),
  );
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('B'));
  expect(liste()).toEqual(['C', 'B', 'A']);
});
it.each([false, true])(
  'P8-A3: Elternaktivierung mit links (shift: %s) ist ein Sprung',
  async (shiftKey) => {
    await starten();
    await taste('ArrowDown', { altKey: true });
    await taste('ArrowLeft', { shiftKey });
    expect(liste()).toEqual(['ueberschrift:001001', 'B', 'A']);
    await taste('ArrowLeft', { shiftKey });
    expect(liste()).toEqual(['ueberschrift:001', 'ueberschrift:001001', 'B', 'A']);
    await taste('ArrowLeft', { shiftKey });
    expect(liste()).toEqual(['ueberschrift:001', 'ueberschrift:001001', 'B', 'A']);
  },
);
it('P8-A3: stufenweises Zuklappen trägt erst Eltern- und oberste Überschrift ein', async () => {
  await starten();
  await taste('ArrowDown', { altKey: true });
  await act(async () => klappstufen.zuklappen());
  expect(liste()).toEqual(['A']);
  await act(async () => klappstufen.zuklappen());
  expect(liste()).toEqual(['ueberschrift:001001', 'B', 'A']);
  await act(async () => klappstufen.zuklappen());
  expect(liste()).toEqual(['ueberschrift:001', 'ueberschrift:001001', 'B', 'A']);
});

it('P8-A1: Favorit auf ein nur durch Schritte aktives Ziel erzeugt keinen Eintrag', async () => {
  await starten();
  await taste('ArrowDown', { altKey: true });
  await taste('ArrowDown', { altKey: true });
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('C'));
  const favorit = Array.from(host.querySelectorAll('button')).find((b) =>
    b.title.replaceAll('\u00a0', ' ').includes('§ 3'),
  );
  assert(favorit);
  await act(async () => favorit.click());
  expect(liste()).toEqual(['A']);
});
it.each([
  ['ArrowDown', { altKey: true }],
  ['ArrowUp', { altKey: true }],
  ['ArrowDown', { metaKey: true }],
  ['ArrowUp', { metaKey: true }],
  ['ArrowRight', {}],
  ['ArrowRight', { shiftKey: true }],
] as const)('P8-A4: %s %j bleibt ein Schritt', async (key, optionen) => {
  await starten();
  await taste(key, optionen);
  expect(liste()).toEqual(['A']);
});
it('P8-A4: stufenweises Aufklappen erzeugt keinen Eintrag', async () => {
  await starten();
  for (let stufe = 2; stufe <= 4; stufe++) await act(async () => klappstufen.zuklappen());
  const vorher = liste();
  for (let stufe = 3; stufe >= 1; stufe--) await act(async () => klappstufen.aufklappen());
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('ueberschrift:001'));
  expect(liste()).toEqual(vorher);
});
it('P8-A4: Text-, Normzeile- und Überschriftenklick bleiben Schritte, auch nach einem Sprung', async () => {
  await starten();
  await taste('ArrowLeft');
  const vorher = liste();
  const text = host.querySelector<HTMLElement>('[data-xml-id="B"] [data-absatz="(1)"]');
  assert(text);
  await act(async () => text.click());
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('B'));
  expect(liste()).toEqual(vorher);
  const titel = Array.from(host.querySelectorAll<HTMLElement>('[data-xml-id="C"] *')).find(
    (e) => e.textContent?.replaceAll('\u00a0', ' ') === '§ 3',
  );
  assert(titel);
  await act(async () => titel.click());
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('C'));
  expect(liste()).toEqual(vorher);
  const ueberschrift = host.querySelector<HTMLElement>('[data-xml-id="ueberschrift:001"]');
  assert(ueberschrift);
  await act(async () => ueberschrift.click());
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('ueberschrift:001'));
  expect(liste()).toEqual(vorher);
});

it('P8-A2: Klick in der StrukturKontextLeiste trägt die Überschrift samt verlassener Stelle ein', async () => {
  const tabsRef = { current: [tabFuerTest({ id: 'tab', gesetz })] };
  const ueberschrift = gesetz.elemente[1];
  assert(ueberschrift);
  if (ueberschrift.typ !== 'ueberschrift') throw new Error('Überschrift fehlt');
  const daten = ueberschrift.data;
  function Probe() {
    const verlauf = useVerlaufSteuerung(tabsRef);
    useLayoutEffect(() => {
      steuerung = verlauf;
    });
    const ansicht = useAnsichtssteuerung({
      gesetz,
      initialAktivesElementId: 'B',
      messung: erstelleTestTextMessung(),
      inhaltEinzug: 12,
      satzNeuZeile: true,
      textAlign: 'left',
      hyphens: 'auto',
      lang: 'de',
      strukturKontextLeisteGroesse: 1,
      onAktivierung: ({ xmlId, art }) => verlauf.verlaufAktivierung('tab', eintrag(xmlId), art),
    });
    return (
      <StrukturKontextLeiste
        modell={{
          ...ansicht.kontextLeiste,
          pfad: [{ ueberschrift: daten, ebene: 2, index: 1 }],
        }}
        schrift={16}
        skalierungsFaktor={1}
        maxBreite={720}
        randInline={52}
        minimalistischerModus={false}
      />
    );
  }
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
  act(() =>
    steuerung.verlaufSetzen('tab', {
      eintraege: [eintrag('A')],
      position: 0,
      aktivesElement: eintrag('B'),
    }),
  );
  const titel = Array.from(host.querySelectorAll<HTMLElement>('div')).find(
    (e) => e.textContent === 'Kapitel' && e.style.cursor === 'pointer',
  );
  assert(titel);
  await act(async () => titel.click());
  expect(liste()).toEqual(['ueberschrift:001001', 'B', 'A']);
});

it.each([false, true])(
  'P8-A4: rechts nach Elternsprung bleibt ein Schritt (shift: %s)',
  async (shiftKey) => {
    await starten();
    await taste('ArrowLeft');
    const vorher = liste();
    await taste('ArrowRight', { shiftKey });
    expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag('A'));
    expect(liste()).toEqual(vorher);
  },
);
