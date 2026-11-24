// Einführung verbindet echte Suche, Navigation, Speicherhandler und Gesetzestextbedienung.
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { act, createElement } from 'react';
import { EinfuehrungBedienungProbe } from './EinfuehrungBedienungProbe';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import type { useEinfuehrungsAblauf } from '@/hooks/einfuehrung/useEinfuehrungsAblauf';
import { assert, beforeEach, afterEach, expect, vi } from 'vitest';
import { umschaltenFavorit } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { scrollNachfuehrungMessung } from '@/test/hauptfenster/scrollNachfuehrungMessung';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/hauptfenster/scrollNachfuehrungMessung'))
    .scrollVirtualizerMessung,
}));
const { abruf } = vi.hoisted(() => ({ abruf: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: abruf }));
const dom = domTestWurzel();
const gesetz = gesetzDarstellung({
  kurztitel: 'GG',
  elemente: [
    {
      typ: 'norm',
      data: normaleNorm({ id: 'p', xmlId: 'p', bezeichnung: 'Präambel', absaetze: [] }),
    },
    {
      typ: 'ueberschrift',
      data: {
        id: 'u',
        xmlId: 'ueberschrift:001',
        gliederungskennzahl: '001',
        ebene: 1,
        bezeichnung: 'Teil',
      },
    },
    {
      typ: 'norm',
      data: normaleNorm({
        id: 'a',
        xmlId: 'a1',
        bezeichnung: 'Art. 1',
        absaetze: [{ id: 'abs', saetze: [{ id: 'satz', text: 'Art. 2', eintraege: [] }] }],
        getaggteVerweise: [
          {
            textstelle: {
              pfad: { typ: 'normtext' },
              zeichenbereichStart: 0,
              zeichenbereichEnde: 6,
            },
            bezugstext: 'Art. 2',
            zielBezeichnung: 'Art. 2',
          },
        ],
      }),
    },
    {
      typ: 'norm',
      data: normaleNorm({
        id: 'b',
        xmlId: 'a2',
        bezeichnung: 'Art. 2',
        absaetze: [{ id: 'abs2', saetze: [{ id: 'satz2', text: 'Inhalt.', eintraege: [] }] }],
      }),
    },
  ],
});
let tabs: ReturnType<typeof useAppTabs>;
let einfuehrung: ReturnType<typeof useEinfuehrungsAblauf>;
let frames: FrameRequestCallback[];
let aktivesElementId: string | undefined;
let eingeklappt: number;
let nachfuehrungTest = false;
let hauptansichtTest = false;
beforeEach(async () => {
  document.body.append(dom.host);
  nativeAttrappeZuruecksetzen();
  setzeSuchverzeichnisTestdaten([gesetz]);
  localStorage.clear();
  frames = [];
  aktivesElementId = undefined;
  eingeklappt = 0;
  nachfuehrungTest = false;
  hauptansichtTest = false;
  Element.prototype.scrollIntoView = () => {};
  scrollNachfuehrungMessung((fn) => {
    frames.push(fn);
    return frames.length;
  });
  await umschaltenFavorit(gesetz, '2');
  await act(async () => dom.root.render(zeichneProbe()));
  await act(async () => vi.dynamicImportSettled());
});
afterEach(() => {
  dom.host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const button = (ziel: string) => {
  const el = document.querySelector<HTMLButtonElement>(`button[data-einfuehrung-ziel="${ziel}"]`);
  assert(el);
  return el;
};
async function suchen() {
  await act(async () => button('oeffnen').click());
  expect(einfuehrung.einfuehrungTeilaktion).toBe(1);
  expect(einfuehrung.einfuehrungSperrenFuerGesetzestextansicht?.normAuswahlGesperrt).toBe(true);
  const input = document.querySelector('input');
  assert(input);
  await act(async () => {
    const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    assert(setzen);
    setzen.call(input, 'GG');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
}
async function bis(teilaktion: number) {
  if (teilaktion === 0) return;
  if (teilaktion === 1) {
    await act(async () => button('oeffnen').click());
    return;
  }
  await suchen();
  if (teilaktion === 2) return;
  await act(async () => einfuehrung.favoritSpeichernMitEinfuehrung());
  if (teilaktion === 3) return;
  await act(async () => einfuehrung.favoritSpeichernMitEinfuehrung());
  if (teilaktion === 4) return;
  await act(async () => einfuehrung.lesezeichenSpeichernMitEinfuehrung());
  if (teilaktion === 5) return;
  await act(async () => einfuehrung.meldeEinklappAenderung(1));
  if (teilaktion === 6) return;
  await act(async () => einfuehrung.meldeEinklappAenderung(2));
  if (teilaktion === 7) return;
  await act(async () => einfuehrung.meldeEinklappAenderung(0));
}
async function hauptansicht() {
  await suchen();
  hauptansichtTest = true;
  await act(async () => dom.root.render(zeichneProbe()));
  await act(async () => einfuehrung.einfuehrungNeuStarten());
}
function aktiveNorm() {
  const tab = tabs.tabs.find((t) => t.id === tabs.aktiverTabId);
  assert(tabs.holeTabGesetz(tab));
  return tabs.einklappZustandRef.current[
    tab!.id + '-' + gesetzesreferenzSchluessel(tabs.holeTabGesetz(tab)!)
  ]?.aktivesElementId;
}
async function einzelnKlappen() {
  const titel = dom.host.querySelectorAll<HTMLElement>('.gt-klapp-zeile')[2];
  assert(titel);
  await act(async () => titel.click());
}
async function hauptansichtBis(t: number) {
  await hauptansicht();
  await bis(Math.min(t, 5));
  if (t >= 6) await einzelnKlappen();
  if (t >= 7) await act(async () => button('zuklappen').click());
  if (t >= 8) await act(async () => button('aufklappen').click());
  expect(einfuehrung.einfuehrungTeilaktion).toBe(t);
}

export function aktiviereNachfuehrungTest() {
  nachfuehrungTest = true;
}
export {
  abruf,
  dom,
  gesetz,
  tabs,
  einfuehrung,
  aktivesElementId,
  eingeklappt,
  button,
  suchen,
  bis,
  hauptansicht,
  hauptansichtBis,
  aktiveNorm,
  einzelnKlappen,
};
export function entnehmeFrames() {
  const callbacks = frames;
  frames = [];
  return callbacks;
}

export function zeichneProbe() {
  return createElement(EinfuehrungBedienungProbe, {
    gesetz,
    nachfuehrungTest,
    hauptansichtTest,
    onStand: (tabsteuerung, ablauf) => {
      tabs = tabsteuerung;
      einfuehrung = ablauf;
    },
    onAnsicht: (id, anzahl) => {
      aktivesElementId = id;
      eingeklappt = anzahl;
    },
  });
}
