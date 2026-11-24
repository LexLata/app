import { menuText } from '@/lib/plattform/menu/menu.index';
import { getSnapshot } from '@/lib/banner/banner.index';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { liesSpeicherbareNorm } from '@/lib/domain/aktives-element/aktives-element.index';
import { umschaltenLesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
// @vitest-environment jsdom
// Prüft echte Tabansichten und React Activity; nur native Grenzen und Browsergeometrie sind ersetzt.
import * as nativ from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { act, useLayoutEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import {
  gesetzDarstellung,
  normaleNorm,
  gesetzMitNormen,
  gliederungsartikel,
} from '@/test/gesetz/gesetzFabriken';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useSeitenleistenStatus } from '@/hooks/useSeitenleistenStatus';
import { useHauptfensterDarstellung } from '@/hooks/useHauptfensterDarstellung';
import { Hauptansicht } from './Hauptansicht';
import type { HauptansichtProps } from './Hauptansicht.types';
import {
  hinzufuegenFavoriten,
  umschaltenFavorit,
} from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { SCHRIFT_KEY } from '@/lib/einstellungen/einstellungen.index';
import { erstelleSpeicherbericht } from '@/lib/utils/speicherMessung';
import { TAB_BEREITHALTUNGSBUDGET } from '@/lib/domain/app/tab-bereithaltung/tab-bereithaltung.index';
import { hinzufuegenMarkierung } from '@/lib/markierungen/markierungen.index';
import { hervorhebung } from '@/test/markierungen/markierungsFabriken';
const dom = domTestWurzel();
let tabs: ReturnType<typeof useAppTabs>;
let status: ReturnType<typeof useSeitenleistenStatus>;
const meldungen: Array<{ favorit: boolean; klappen: boolean }> = [];
const favoritenMeldungen: HauptansichtProps['status']['favoritenStatus'][] = [];
const noop = vi.fn();
/** Minimalistischer Modus des Fensters; wirkt nach erneutem Rendern. */
let minimalistisch = false;
let getauscht = false;
function Fenster() {
  const tabsteuerung = useAppTabs();
  const seitenleistenStatus = useSeitenleistenStatus(
    !!tabsteuerung.holeTabGesetz(
      tabsteuerung.tabs.find((t) => t.id === tabsteuerung.aktiverTabId) ?? null,
    ),
  );
  useLayoutEffect(() => {
    tabs = tabsteuerung;
    status = seitenleistenStatus;
  });
  const darstellung = useHauptfensterDarstellung();
  const lesezeichenSteuerung = useLesezeichenUndFavoriten(tabsteuerung);
  useLayoutEffect(() => {
    meldungen.push({
      favorit: status.favoritenStatus.istAktuellFavorit,
      klappen: status.klappstufenStatus.kannZuklappen,
    });
  });
  const props: HauptansichtProps = {
    tabsteuerung,
    status: {
      ...seitenleistenStatus,
      setFavoritenStatus: (wert) => {
        favoritenMeldungen.push(wert);
        seitenleistenStatus.setFavoritenStatus(wert);
      },
    },
    darstellung,
    fensterUebertragung: {
      handleTabHerausziehen: noop,
      handleTabInFensterAufnehmen: noop,
      fremdVorschauIndexRef: { current: null },
    },
    lesezeichenSteuerung,
    einfuehrung: {
      einfuehrungTeilaktion: 0,
      einfuehrungAktiv: false,
      favoritSpeichernMitEinfuehrung: async () => {
        await lesezeichenSteuerung.handleFavoritSpeichern();
      },
      lesezeichenSpeichernMitEinfuehrung: async () => {
        await lesezeichenSteuerung.handleLesezeichenSpeichern();
      },
      meldeEinklappAenderung: noop,
      leistenTauschenEffektiv: getauscht,
      minimalistischerModusEffektiv: minimalistisch,
      einfuehrungErlaubtFuerUI: {
        suche: true,
        favorit: true,
        lesezeichen: true,
        zuklappen: true,
        aufklappen: true,
      },
      einfuehrungSperrenFuerGesetzestextansicht: undefined,
      einfuehrungFavoritErlaubtFuerGesetzestextansicht: true,
    },
    markierungen: {
      handleUnterstreichen: noop,
      handleHervorheben: noop,
      handleMarkierungLoeschen: noop,
    },
    hilfsfenster: {
      handleVerweismarkierungAnfrage: noop,
      handleVerweismarkierungBearbeiten: noop,
      handleKommentarAnfrage: noop,
      handleKommentarBearbeiten: noop,
    },
    navigation: { handleVerweisKlick: noop, handleLesezeichenOeffnen: noop },
    verlaufSchrittUndOeffnen: noop,
    verlaufAktivierung: tabsteuerung.verlaufAktivierung,
    verlaufBedienung: tabsteuerung.verlaufBedienung,
    onUebersichtOeffnen: noop,
    onOeffnenOverlayUmschalten: noop,
  };
  return <Hauptansicht {...props} />;
}
function auswahlnorm(index: number) {
  const i = index + 1;
  return {
    xmlId: `p${i}`,
    absaetze: [{ id: `abs${i}`, saetze: [{ id: `satz${i}`, text: 'Auswahltext', eintraege: [] }] }],
  };
}
const a = gesetzMitNormen(['§ 1', '§ 2', '§ 3'], {
  kurztitel: 'A',
  langtitel: gesetzDarstellung().langtitel,
  kennung: (i) => `a${i + 1}`,
  norm: auswahlnorm,
});
const b = gesetzMitNormen(['§ 1', '§ 2', '§ 3'], {
  kurztitel: 'B',
  langtitel: gesetzDarstellung().langtitel,
  kennung: (i) => `b${i + 1}`,
  norm: auswahlnorm,
});
const beobachter = new Set<object>();
beforeEach(() => {
  nativ.bereiteNativeAttrappeVor();
  document.body.append(dom.host);
  vi.useFakeTimers();
  meldungen.length = 0;
  favoritenMeldungen.length = 0;
  minimalistisch = false;
  getauscht = false;
  beobachter.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        beobachter.add(this);
      }
      unobserve() {
        beobachter.delete(this);
      }
      disconnect() {
        beobachter.delete(this);
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 100, bottom: 120, left: 20, right: 100, width: 80, height: 20 }),
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [{ top: 100, bottom: 120, left: 20, right: 100, width: 80, height: 20 }],
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = Number(this.dataset.index ?? 0);
    return {
      top: index * 70,
      bottom: index * 70 + 70,
      left: 0,
      right: 800,
      width: 800,
      height: 70,
      x: 0,
      y: index * 70,
      toJSON() {},
    };
  });
  Object.defineProperties(HTMLElement.prototype, {
    clientHeight: { configurable: true, get: () => 400 },
    clientWidth: { configurable: true, get: () => 800 },
    offsetHeight: { configurable: true, get: () => 70 },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
    configurable: true,
    value: function (this: HTMLElement, o: ScrollToOptions) {
      this.scrollTop += o.top ?? 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value() {},
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: function (this: HTMLElement, o: ScrollToOptions) {
      this.scrollTop = o.top ?? 0;
    },
  });
});
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  window.getSelection()?.removeAllRanges();
  dom.host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function zeit() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}
async function start() {
  await act(async () => dom.root.render(<Fenster />));
  await act(async () => hinzufuegenFavoriten(a, ['§ 1', '§ 2', '§ 3']));
  await act(async () => tabs.gesetzOeffnen(a, undefined, 'aktiver-tab'));
  await zeit();
  return vorhanden(tabs.aktiverTabId);
}
async function zweiterTab() {
  await act(async () => hinzufuegenFavoriten(b, ['§ 1', '§ 2', '§ 3']));
  await act(async () => tabs.gesetzOeffnen(b, undefined, 'immer-neu'));
  await zeit();
  return vorhanden(tabs.aktiverTabId);
}
function scrollbereiche() {
  return [...dom.host.querySelectorAll<HTMLElement>('[aria-label="Gesetzestext"]')];
}
function vorhanden<T>(wert: T | null | undefined): T {
  if (wert === null || wert === undefined) throw new Error('Testvoraussetzung fehlt');
  return wert;
}
it('erhält bei A–B–A denselben Textbereich, Klappzustand und das aktive Element ohne erneute Wiederherstellung', async () => {
  const id = await start();
  const bereich = vorhanden(scrollbereiche()[0]);
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    ),
  );
  await zeit();
  await act(async () =>
    vorhanden(bereich.querySelectorAll<HTMLElement>('.gt-klapp-zeile')[1]).click(),
  );
  await zeit();
  const key = vorhanden(Object.keys(tabs.einklappZustandRef.current)[0]);
  const geklappt = vorhanden(tabs.einklappZustandRef.current[key]);
  const aktiv = geklappt.aktivesElementId;
  expect(geklappt.normen.size).toBeGreaterThan(0);
  await zweiterTab();
  // Eine neu gebaute Ansicht müsste diese abweichenden Wiederherstellungsdaten verwenden.
  tabs.einklappZustandRef.current[key] = {
    ueberschriften: new Set(),
    normen: new Set(),
    aktivesElementId: 'a3',
  };
  await act(async () => tabs.setAktiverTabId(id));
  expect(scrollbereiche()[0]).toBe(bereich);
  expect(
    vorhanden(
      tabs.einklappZustandRef.current[vorhanden(Object.keys(tabs.einklappZustandRef.current)[0])],
    ).aktivesElementId,
  ).toBe(aktiv);
  expect(vorhanden(tabs.einklappZustandRef.current[key]).normen).toEqual(geklappt.normen);
  expect(bereich.style.visibility).toBe('visible');
});
it('setzt den vor Verdeckung gemerkten Scrollstand vor dem ersten sichtbaren Bild zurück', async () => {
  const id = await start();
  const bereich = vorhanden(scrollbereiche()[0]);
  bereich.scrollTop = 145;
  await zweiterTab();
  bereich.scrollTop = 0;
  await act(async () => tabs.setAktiverTabId(id));
  expect(bereich.scrollTop).toBe(145);
});
it('liest Favoriten im Hintergrund nach und meldet beim Rückwechsel weder einen leeren Sternstatus noch leere Schnellaktionen', async () => {
  const id = await start();
  expect(status.favoritenStatus.istAktuellFavorit).toBe(true);
  const klappen = status.klappstufenStatus.kannZuklappen;
  const titel = tabs.tabTitel[id];
  await zweiterTab();
  const original = vorhanden(nativ.native.invoke.getMockImplementation());
  const freigaben: Array<() => void> = [];
  nativ.native.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'plugin:fs|read_text_file')
      await new Promise<void>((resolve) => freigaben.push(resolve));
    return original(befehl, args);
  });
  meldungen.length = 0;
  favoritenMeldungen.length = 0;
  await act(async () => tabs.setAktiverTabId(id));
  // Maßgeblich ist der dargestellte Stand: Kein Bild zeigt einen leeren Stern
  // oder leere Schnellaktionen; die letzte Meldung stammt von der aktiven Ansicht.
  expect(meldungen.length).toBeGreaterThan(0);
  expect(meldungen.every((m) => m.favorit && m.klappen === klappen)).toBe(true);
  expect(favoritenMeldungen.at(-1)?.favoritenEintraege).toHaveLength(3);
  expect(freigaben.length).toBeGreaterThan(0);
  expect(status.favoritenStatus.istAktuellFavorit).toBe(true);
  expect(status.klappstufenStatus.kannZuklappen).toBe(klappen);
  expect(tabs.tabTitel[id]).toBe(titel);
  expect(vorhanden(scrollbereiche()[0]).style.visibility).toBe('visible');
  await act(async () => freigaben.splice(0).forEach((fertig) => fertig()));
  expect(status.favoritenStatus.istAktuellFavorit).toBe(true);
});
it('lässt Pfeile und Favoritentasten nur den aktiven Tab bedienen und erhält den Tabfokus', async () => {
  localStorage.setItem('lexlata.seitenleistenTastenkuerzel', 'true');
  const erster = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  const zweiter = await zweiterTab();
  const bereichB = vorhanden(scrollbereiche()[1]);
  const scrollA = bereichA.scrollTop;
  const scrollB = bereichB.scrollTop;
  const schluesselA = vorhanden(
    Object.keys(tabs.einklappZustandRef.current).find((k) => k.startsWith(erster)),
  );
  const vorherA = vorhanden(tabs.einklappZustandRef.current[schluesselA]);
  const tabButton = vorhanden(dom.host.querySelector<HTMLElement>(`[data-tab-id="${zweiter}"]`));
  const fokusVorher = document.activeElement;
  tabButton.click();
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(bereichA.scrollTop).toBe(scrollA);
  expect(bereichB.scrollTop).toBeGreaterThan(scrollB);
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })),
  );
  await zeit();
  expect(tabs.einklappZustandRef.current[schluesselA]).toEqual(vorherA);
  expect(bereichA.scrollTop).toBe(scrollA);
  await act(async () => tabs.setAktiverTabId(erster));
  expect(document.activeElement).toBe(fokusVorher);
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(bereichA.scrollTop).toBeGreaterThan(0);
});
it('übernimmt bei demselben Gesetz in zwei Tabs eine Favoritenänderung im verdeckten Tab bei dessen Aktivierung und lässt Tasten nur den aktiven Tab bedienen', async () => {
  localStorage.setItem('lexlata.seitenleistenTastenkuerzel', 'true');
  const erster = await start();
  const bereichErster = vorhanden(scrollbereiche()[0]);
  await act(async () => tabs.gesetzOeffnen(a, undefined, 'immer-neu'));
  await zeit();
  const zweiter = vorhanden(tabs.aktiverTabId);
  expect(zweiter).not.toBe(erster);
  const bereichZweiter = vorhanden(scrollbereiche().find((b) => b !== bereichErster));
  const schluesselErster = vorhanden(
    Object.keys(tabs.einklappZustandRef.current).find((k) => k.startsWith(erster)),
  );
  const vorherErster = vorhanden(tabs.einklappZustandRef.current[schluesselErster]);
  const scrollErster = bereichErster.scrollTop;
  // Tasten wirken nur im aktiven zweiten Tab.
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  expect(bereichZweiter.scrollTop).toBeGreaterThan(0);
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })),
  );
  await zeit();
  expect(aktivesElementIn(zweiter, 'a')).toBe('a3');
  expect(tabs.einklappZustandRef.current[schluesselErster]).toEqual(vorherErster);
  expect(bereichErster.scrollTop).toBe(scrollErster);
  // Favoritenänderung, während der erste Tab verdeckt ist: § 1 ist danach kein Favorit mehr.
  await act(async () => umschaltenFavorit(a, '§ 1'));
  await zeit();
  await act(async () => tabs.setAktiverTabId(erster));
  await zeit();
  expect(scrollbereiche()).toContain(bereichErster);
  expect(favoritenMeldungen.at(-1)?.favoritenEintraege).toHaveLength(2);
  expect(status.favoritenStatus.istAktuellFavorit).toBe(false);
});
it('zeigt bei demselben Gesetz in zwei Tabs eine im aktiven Tab gespeicherte Markierung dort sofort und im verdeckten Tab nach dessen Aktivierung ohne Neuaufbau', async () => {
  // Gespeicherte Markierungen werden gegen die Gesetzesdatei geprüft; sie entspricht dem Testgesetz A.
  nativ.native.texte.set(
    nativ.basis + 'gesetze/A_de-bund.xml',
    `<gesetz version="1"><infos><kurztitel>A</kurztitel><normgeber>de-bund</normgeber><langtitel>A</langtitel></infos><inhalt>${[
      1, 2, 3,
    ]
      .map(
        (i) =>
          `<norm id="p${i}"><bezeichnung>§ ${i}</bezeichnung><text><absatz><satz>Auswahltext</satz></absatz></text></norm>`,
      )
      .join('')}</inhalt></gesetz>`,
  );
  const verdeckt = await start();
  const bereichVerdeckt = vorhanden(scrollbereiche()[0]);
  await act(async () => tabs.gesetzOeffnen(a, undefined, 'immer-neu'));
  await zeit();
  const bereichAktiv = vorhanden(scrollbereiche().find((b) => b !== bereichVerdeckt));
  const hervorhebungen = (bereich: HTMLElement) =>
    bereich.querySelectorAll('span[style*="hervorheben-bg"]').length;
  const markierung = hervorhebung({
    textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 0, zeichenbereichEnde: 11 },
    bezugstext: 'Auswahltext',
  });
  expect((await act(async () => hinzufuegenMarkierung(a, markierung))).erfolgreich).toBe(true);
  // Wie nach dem Speichern in der App: Die Änderung wird gemeldet. Die native Attrappe stellt
  // fensterübergreifende Ereignisse nicht selbst zu; die Meldung erreicht hier das Fenster.
  await act(async () =>
    nativ.native.listener.get('main')?.get('markierungen-geaendert')?.({ payload: { gesetz: a } }),
  );
  await act(async () => vi.dynamicImportSettled());
  await zeit();
  expect(hervorhebungen(bereichAktiv)).toBeGreaterThan(0);
  expect(hervorhebungen(bereichVerdeckt)).toBe(0);
  await act(async () => tabs.setAktiverTabId(verdeckt));
  await act(async () => vi.dynamicImportSettled());
  await zeit();
  expect(scrollbereiche()).toContain(bereichVerdeckt);
  expect(bereichVerdeckt.isConnected).toBe(true);
  expect(hervorhebungen(bereichVerdeckt)).toBeGreaterThan(0);
});
it('meldet globale Listener, Ereignisabos und Größenbeobachter beim Verdecken vollständig ab', async () => {
  const an = vi.spyOn(window, 'addEventListener');
  const aus = vi.spyOn(window, 'removeEventListener');
  const dokumentAn = vi.spyOn(document, 'addEventListener');
  const dokumentAus = vi.spyOn(document, 'removeEventListener');
  function aktiveListener() {
    const anzahl = (anmeldungen: typeof an, abmeldungen: typeof aus, namen: string[]) =>
      anmeldungen.mock.calls.filter(([n]) => namen.includes(n)).length -
      abmeldungen.mock.calls.filter(([n]) => namen.includes(n)).length;
    return (
      anzahl(an, aus, ['keydown']) + anzahl(dokumentAn, dokumentAus, ['keydown', 'selectionchange'])
    );
  }
  const id = await start();
  const einzel = { listener: aktiveListener(), beobachter: beobachter.size };
  expect(einzel.listener).toBeGreaterThan(0);
  expect(nativ.native.listener.get('main')?.has('markierungen-geaendert')).toBe(true);
  await zweiterTab();
  expect({ listener: aktiveListener(), beobachter: beobachter.size }).toEqual(einzel);
  await act(async () => tabs.setAktiverTabId(id));
  expect({ listener: aktiveListener(), beobachter: beobachter.size }).toEqual(einzel);
  await act(async () => tabs.erstelleLeerenTab());
  expect(aktiveListener()).toBeLessThan(einzel.listener);
  expect(beobachter.size).toBeLessThan(einzel.beobachter);
  expect(nativ.native.listener.get('main')?.has('markierungen-geaendert')).toBe(false);
});
it('erhält Verlauf und stoppt die Verweildauer beim Tabwechsel', async () => {
  const id = await start();
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    ),
  );
  await zeit();
  const vorher = tabs.verlaufLesen(id);
  await zweiterTab();
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(tabs.verlaufLesen(id)).toEqual(vorher);
  await act(async () => tabs.setAktiverTabId(id));
  expect(tabs.verlaufLesen(id)).toEqual(vorher);
});
it('lässt Auswahlleisten- und Markierungsereignisse einer aktiven Ansicht die verdeckte Auswahlleiste nicht verändern', async () => {
  const id = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  const blatt = vorhanden(
    [...bereichA.querySelectorAll('[data-leaf]')].find((el) => el.textContent === 'Auswahltext'),
  );
  await act(async () => {
    nativ.waehleTextImBlatt(blatt, 'Auswahltext');
    bereichA.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 120 }),
    );
  });
  const leisteA = vorhanden(dom.host.querySelector<HTMLElement>('[title="Unterstreichen"]'));
  expect(leisteA).not.toBeNull();
  await zweiterTab();
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    nativ.native.listener.get('main')?.get('markierungen-geaendert')?.({ payload: { gesetz: b } });
    document.dispatchEvent(new Event('selectionchange'));
  });
  expect(leisteA.isConnected).toBe(true);
  await act(async () => tabs.setAktiverTabId(id));
  expect(dom.host.querySelector('[title="Unterstreichen"]')).toBe(leisteA);
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(dom.host.querySelector('[title="Unterstreichen"]')).toBeNull();
});
function listenerZaehler() {
  const an = vi.spyOn(window, 'addEventListener');
  const aus = vi.spyOn(window, 'removeEventListener');
  return () =>
    an.mock.calls.filter(([n]) => n === 'keydown').length -
    aus.mock.calls.filter(([n]) => n === 'keydown').length;
}
it('entfernt die verdeckte Ansicht eines geschlossenen Tabs samt Abos und Beobachtern', async () => {
  const aktive = listenerZaehler();
  const erster = await start();
  const einzel = { listener: aktive(), beobachter: beobachter.size };
  const bereichA = vorhanden(scrollbereiche()[0]);
  await zweiterTab();
  await act(async () => tabs.tabSchliessen(erster));
  expect(bereichA.isConnected).toBe(false);
  expect(scrollbereiche()).toHaveLength(1);
  expect({ listener: aktive(), beobachter: beobachter.size }).toEqual(einzel);
  expect(nativ.native.listener.get('main')?.has('markierungen-geaendert')).toBe(true);
});
it('verwirft bei inhaltlicher Aktualisierung nur die verdeckte Ansicht des Gesetzes und verbraucht das Sprungziel beim Neuaufbau genau einmal', async () => {
  const erster = await start();
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    ),
  );
  await zeit();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await zweiterTab();
  const bereichB = vorhanden(scrollbereiche()[1]);
  const geaendert = { ...a, langtitel: 'Neue Fassung' };
  await act(async () => tabs.gesetzeAktualisierenInTabs([geaendert], [a]));
  expect(bereichA.isConnected).toBe(false);
  expect(bereichB.isConnected).toBe(true);
  const ziel = tabs.tabs.find((t) => t.id === erster)?.initialNorm;
  expect(ziel).toBe('p2');
  await act(async () => tabs.setAktiverTabId(erster));
  await zeit();
  const neu = vorhanden(scrollbereiche()[0]);
  expect(neu).not.toBe(bereichA);
  expect(tabs.tabs.find((t) => t.id === erster)?.initialNorm).toBeUndefined();
  const schluessel = vorhanden(
    Object.keys(tabs.einklappZustandRef.current).find((k) => k.startsWith(erster)),
  );
  expect(tabs.einklappZustandRef.current[schluessel]?.aktivesElementId).toBe('a2');
  // Verbraucht: Ein weiterer Rückwechsel springt nicht erneut zum Ziel.
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    ),
  );
  await zeit();
  await act(async () => tabs.setAktiverTabId(vorhanden(tabs.tabs.find((t) => t.id !== erster)).id));
  await act(async () => tabs.setAktiverTabId(erster));
  await zeit();
  expect(scrollbereiche()[0]).toBe(neu);
  expect(tabs.einklappZustandRef.current[schluessel]?.aktivesElementId).toBe('a3');
});
it('erhält aktive und bereitgehaltene Ansicht bei reiner Metadatenänderung und reicht die neue Verarbeitungszeit weiter', async () => {
  const erster = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  const zweiter = await zweiterTab();
  const bereichB = vorhanden(scrollbereiche()[1]);
  const zeitpunkt = new Date('2030-01-01T00:00:00Z');
  await act(async () =>
    tabs.gesetzInfoInTabsPatchen(
      [
        { ...a, verarbeitungszeit: zeitpunkt },
        { ...b, verarbeitungszeit: zeitpunkt },
      ],
      [a, b],
    ),
  );
  await zeit();
  expect(bereichA.isConnected).toBe(true);
  expect(bereichB.isConnected).toBe(true);
  for (const id of [erster, zweiter])
    expect(tabs.holeTabGesetz(tabs.tabs.find((t) => t.id === id))?.verarbeitungszeit).toEqual(
      zeitpunkt,
    );
  await act(async () => tabs.setAktiverTabId(erster));
  expect(scrollbereiche()[0]).toBe(bereichA);
});
it('baut verdeckte Ansichten nach geänderter Schriftgröße mit der neuen Darstellung neu', async () => {
  const erster = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await zweiterTab();
  const bereichB = vorhanden(scrollbereiche()[1]);
  await act(async () => {
    localStorage.setItem(SCHRIFT_KEY, '31');
    window.dispatchEvent(new StorageEvent('storage', { key: SCHRIFT_KEY, newValue: '31' }));
  });
  expect(bereichA.isConnected).toBe(false);
  expect(bereichB.isConnected).toBe(true);
  await act(async () => tabs.setAktiverTabId(erster));
  await zeit();
  const neu = vorhanden(scrollbereiche()[0]);
  expect(neu).not.toBe(bereichA);
  expect(neu.innerHTML).toContain('31px');
  localStorage.removeItem(SCHRIFT_KEY);
});
it('baut verdeckte Ansichten nach Umschalten des minimalistischen Modus neu und erhält die aktive', async () => {
  const erster = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await zweiterTab();
  const bereichB = vorhanden(scrollbereiche()[1]);
  minimalistisch = true;
  await act(async () => dom.root.render(<Fenster />));
  expect(bereichA.isConnected).toBe(false);
  expect(bereichB.isConnected).toBe(true);
  await act(async () => tabs.setAktiverTabId(erster));
  await zeit();
  expect(vorhanden(scrollbereiche()[0])).not.toBe(bereichA);
});
// Sprungregel bei Aktivierung: 40 Normen à 70 px, Bildschirmhöhe 400 px; zwei
// Bildschirmhöhen (800 px) trennen nah und weit. Textgrenzen folgen der Zeile.
const lang = gesetzDarstellung({
  kurztitel: 'L',
  elemente: Array.from({ length: 40 }, (_, i) => ({
    typ: 'norm' as const,
    data: normaleNorm({
      id: `l${i}`,
      xmlId: `p${i}`,
      bezeichnung: `§ ${i}`,
      absaetze: [{ id: `labs${i}`, saetze: [{ id: `lsatz${i}`, text: 'Text', eintraege: [] }] }],
    }),
  })),
});
function zeilengeometrie() {
  // Scrollhöhe des Textbereichs: 40 Zeilen samt Seitenrändern.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 40 * 70 + 80,
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Range) {
      const start = this.startContainer;
      const knoten = start instanceof Element ? start : start.parentElement;
      const zeile = knoten?.closest<HTMLElement>('[data-index]');
      const bereich = knoten?.closest<HTMLElement>('[aria-label="Gesetzestext"]');
      const top = Number(zeile?.dataset.index ?? 0) * 70 - (bereich?.scrollTop ?? 0);
      return { top, bottom: top + 20, left: 20, right: 100, width: 80, height: 20 };
    },
  });
}
async function langerTabVerdeckt() {
  zeilengeometrie();
  await act(async () => dom.root.render(<Fenster />));
  await act(async () => tabs.gesetzOeffnen(lang, undefined, 'aktiver-tab'));
  await zeit();
  const bereich = vorhanden(scrollbereiche()[0]);
  await zweiterTab();
  const schreibvorgaenge: number[] = [];
  let stand = bereich.scrollTop;
  Object.defineProperty(bereich, 'scrollTop', {
    configurable: true,
    get: () => stand,
    set(wert: number) {
      stand = wert;
      schreibvorgaenge.push(wert);
    },
  });
  return { bereich, schreibvorgaenge };
}
it('schreibt beim erneuten Anzeigen eines gescrollten Tabs nicht erneut die Startposition', async () => {
  zeilengeometrie();
  await act(async () => dom.root.render(<Fenster />));
  await act(async () => tabs.gesetzOeffnen(lang, undefined, 'aktiver-tab'));
  await zeit();
  const bereich = vorhanden(scrollbereiche()[0]);
  const schreibvorgaenge: number[] = [];
  let stand = 0;
  Object.defineProperty(bereich, 'scrollTop', {
    configurable: true,
    get: () => stand,
    set(wert: number) {
      stand = wert;
      schreibvorgaenge.push(wert);
    },
  });
  stand = 600;
  await act(async () => bereich.dispatchEvent(new Event('scroll')));
  await zeit();
  await zweiterTab();
  schreibvorgaenge.length = 0;
  const id = vorhanden(tabs.tabs.find((t) => t.gesetzesreferenz?.kurztitel === 'L')).id;
  await act(async () => tabs.setAktiverTabId(id));
  await zeit();
  expect(bereich.scrollTop).toBe(600);
  expect(schreibvorgaenge.filter((wert) => wert !== 600)).toEqual([]);
});
it('verdeckt bei weitem Sprung in einen bereitgehaltenen Tab vor dem ersten Bild und zeigt die Zielstelle direkt', async () => {
  const { bereich, schreibvorgaenge } = await langerTabVerdeckt();
  await act(async () => tabs.gesetzOeffnen(lang, 'p30', 'bevorzugt-vorhanden'));
  expect(scrollbereiche()[0]).toBe(bereich);
  expect(bereich.style.visibility).toBe('hidden');
  expect(bereich.scrollTop).toBe(0);
  await zeit();
  expect(bereich.style.visibility).toBe('visible');
  expect(bereich.scrollTop).toBeGreaterThan(1600);
  // Direkt statt animiert: kein Zwischenstand zwischen Start und Ziel (die
  // Wiederherstellung beim Anzeigen schreibt nur Werte bis zum Seitenrand von 40 px).
  expect(schreibvorgaenge.filter((wert) => wert > 40 && wert < 1600)).toEqual([]);
});
it('scrollt bei nahem Sprung in einen bereitgehaltenen Tab sichtbar und animiert', async () => {
  const { bereich, schreibvorgaenge } = await langerTabVerdeckt();
  await act(async () => tabs.gesetzOeffnen(lang, 'p9', 'bevorzugt-vorhanden'));
  expect(bereich.style.visibility).toBe('visible');
  await zeit();
  expect(bereich.style.visibility).toBe('visible');
  expect(bereich.scrollTop).toBeGreaterThan(200);
  expect(new Set(schreibvorgaenge.filter((wert) => wert > 40)).size).toBeGreaterThan(1);
});
it('springt nicht und schließt das Tor nicht, wenn die Zielnorm im bereitgehaltenen Tab schon vollständig sichtbar ist', async () => {
  const { bereich, schreibvorgaenge } = await langerTabVerdeckt();
  await act(async () => tabs.gesetzOeffnen(lang, 'p4', 'bevorzugt-vorhanden'));
  expect(bereich.style.visibility).toBe('visible');
  await zeit();
  expect(bereich.style.visibility).toBe('visible');
  expect(schreibvorgaenge.filter((wert) => wert > 40)).toEqual([]);
  expect(bereich.scrollTop).toBe(0);
});
it('öffnet das geschlossene Tor nach 300 ms, wenn der weite Sprung nicht abschließt', async () => {
  const { bereich } = await langerTabVerdeckt();
  await act(async () => tabs.gesetzOeffnen(lang, 'p30', 'bevorzugt-vorhanden'));
  expect(bereich.style.visibility).toBe('hidden');
  // Eine Bediengeste bricht den Sprung ab; sein Abschluss bleibt damit aus.
  await act(async () => bereich.dispatchEvent(new WheelEvent('wheel')));
  await act(async () => vi.advanceTimersByTimeAsync(299));
  expect(bereich.style.visibility).toBe('hidden');
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(bereich.style.visibility).toBe('visible');
});
it('schließt im durchgehend aktiven Tab auch bei weitem Sprung kein Tor', async () => {
  zeilengeometrie();
  await act(async () => dom.root.render(<Fenster />));
  await act(async () => tabs.gesetzOeffnen(lang, undefined, 'aktiver-tab'));
  await zeit();
  const bereich = vorhanden(scrollbereiche()[0]);
  await act(async () => tabs.gesetzOeffnen(lang, 'p30', 'bevorzugt-vorhanden'));
  expect(bereich.style.visibility).toBe('visible');
  await zeit();
  expect(bereich.style.visibility).toBe('visible');
  expect(bereich.scrollTop).toBeGreaterThan(1600);
});
function aktivesElementIn(tabId: string, kurztitel: string) {
  const schluessel = Object.keys(tabs.einklappZustandRef.current).find(
    (k) => k.startsWith(tabId) && k.includes(`"${kurztitel}"`),
  );
  return schluessel && tabs.einklappZustandRef.current[schluessel]?.aktivesElementId;
}
it('lässt beim Gesetzwechsel im Tab vor Ende eines Sprungs das neue Sprungziel bestehen', async () => {
  await langerTabVerdeckt();
  await act(async () => tabs.gesetzOeffnen(lang, 'p30', 'bevorzugt-vorhanden'));
  const id = vorhanden(tabs.aktiverTabId);
  expect(tabs.tabs.find((t) => t.id === id)?.initialNorm).toBe('p30');
  await act(async () => tabs.gesetzOeffnen(c, 'p2', 'aktiver-tab'));
  await zeit();
  expect(tabs.aktiverTabId).toBe(id);
  expect(aktivesElementIn(id, 'c')).toBe('c2');
  // Zurück zur verlassenen Ansicht mit neuem Ziel: der abgebrochene Sprung verdrängt es nicht.
  await act(async () => tabs.gesetzOeffnen(lang, 'p7', 'aktiver-tab'));
  await zeit();
  expect(tabs.aktiverTabId).toBe(id);
  expect(aktivesElementIn(id, 'l')).toBe('l7');
  expect(tabs.tabs.find((t) => t.id === id)?.initialNorm).toBeUndefined();
});
it('führt einen beim Tabwechsel ausstehenden Sprung nach der Rückkehr genau einmal aus', async () => {
  await langerTabVerdeckt();
  const anderer = vorhanden(tabs.aktiverTabId);
  await act(async () => tabs.gesetzOeffnen(lang, 'p30', 'bevorzugt-vorhanden'));
  const id = vorhanden(tabs.aktiverTabId);
  expect(tabs.tabs.find((t) => t.id === id)?.initialNorm).toBe('p30');
  await act(async () => tabs.setAktiverTabId(anderer));
  await zeit();
  await act(async () => tabs.setAktiverTabId(id));
  await zeit();
  expect(aktivesElementIn(id, 'l')).toBe('l30');
  expect(tabs.tabs.find((t) => t.id === id)?.initialNorm).toBeUndefined();
  // Verbraucht: nach einem Schritt springt ein erneuter Rückwechsel nicht wieder zum Ziel.
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    ),
  );
  await zeit();
  expect(aktivesElementIn(id, 'l')).toBe('l31');
  await act(async () => tabs.setAktiverTabId(anderer));
  await act(async () => tabs.setAktiverTabId(id));
  await zeit();
  expect(aktivesElementIn(id, 'l')).toBe('l31');
});
// Tab-Bereithaltungsbudget: 12.000 Elemente. Drei Gesetze zu je 7.000 Elementen:
// Der zuletzt verlassene Tab ist garantiert (7.000), ein weiterer passt nicht mehr ins Restbudget.
function grossesGesetz(kurztitel: string) {
  return gesetzDarstellung({
    kurztitel,
    elemente: Array.from({ length: 7000 }, (_, i) => ({
      typ: 'norm' as const,
      data: normaleNorm({
        id: `${kurztitel}${i}`,
        xmlId: `p${i}`,
        bezeichnung: `§ ${i}`,
        absaetze: [
          {
            id: `${kurztitel}abs${i}`,
            saetze: [{ id: `${kurztitel}s${i}`, text: 'Text', eintraege: [] }],
          },
        ],
      }),
    })),
  });
}
it('verwirft über dem Budget die älteste Ansicht samt Effekten und baut sie später mit Klappzustand und aktivem Element neu auf', async () => {
  const aktive = listenerZaehler();
  await act(async () => dom.root.render(<Fenster />));
  await act(async () => tabs.gesetzOeffnen(grossesGesetz('X'), undefined, 'aktiver-tab'));
  await zeit();
  const erster = vorhanden(tabs.aktiverTabId);
  const einzel = { listener: aktive(), beobachter: beobachter.size };
  const bereichX = vorhanden(scrollbereiche()[0]);
  for (let i = 0; i < 2; i++) {
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
      ),
    );
    await zeit();
  }
  await act(async () =>
    vorhanden(bereichX.querySelectorAll<HTMLElement>('.gt-klapp-zeile')[1]).click(),
  );
  await zeit();
  const key = vorhanden(Object.keys(tabs.einklappZustandRef.current)[0]);
  const geklappt = vorhanden(tabs.einklappZustandRef.current[key]);
  await act(async () => tabs.gesetzOeffnen(grossesGesetz('Y'), undefined, 'immer-neu'));
  await zeit();
  expect(bereichX.isConnected).toBe(true);
  await act(async () => tabs.gesetzOeffnen(grossesGesetz('Z'), undefined, 'immer-neu'));
  await zeit();
  expect(bereichX.isConnected).toBe(false);
  expect(scrollbereiche()).toHaveLength(2);
  expect({ listener: aktive(), beobachter: beobachter.size }).toEqual(einzel);
  await act(async () => tabs.setAktiverTabId(erster));
  await zeit();
  const neu = vorhanden(scrollbereiche()[0]);
  expect(neu).not.toBe(bereichX);
  expect(vorhanden(tabs.einklappZustandRef.current[key]).normen).toEqual(geklappt.normen);
  expect(vorhanden(tabs.einklappZustandRef.current[key]).aktivesElementId).toBe(
    geklappt.aktivesElementId,
  );
});
it('hält kleine Gesetze in mehr als zwei Tabs gleichzeitig bereit', async () => {
  await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await zweiterTab();
  await act(async () => tabs.gesetzOeffnen(lang, undefined, 'immer-neu'));
  await zeit();
  expect(bereichA.isConnected).toBe(true);
});

// Verlauf-Bereithaltung: Gesetzeswechsel im selben Tab (A → B) und erneutes Zeigen von A.
async function gesetzImTab(gesetz: typeof a) {
  await act(async () => tabs.gesetzOeffnen(gesetz, undefined, 'aktiver-tab'));
  await zeit();
}
it('zeigt nach Gesetzeswechsel im Tab beim erneuten Zeigen von A dieselbe Ansicht mit Position und Klappzustand', async () => {
  const id = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await act(async () =>
    vorhanden(bereichA.querySelectorAll<HTMLElement>('.gt-klapp-zeile')[1]).click(),
  );
  await zeit();
  const key = vorhanden(Object.keys(tabs.einklappZustandRef.current)[0]);
  const geklappt = vorhanden(tabs.einklappZustandRef.current[key]);
  bereichA.scrollTop = 145;
  await gesetzImTab(b);
  expect(tabs.aktiverTabId).toBe(id);
  expect(bereichA.isConnected).toBe(true);
  expect(scrollbereiche()).toHaveLength(2);
  const bereichB = vorhanden(scrollbereiche().find((bereich) => bereich !== bereichA));
  bereichA.scrollTop = 0;
  // Eine neu gebaute Ansicht müsste diese abweichenden Wiederherstellungsdaten verwenden.
  tabs.einklappZustandRef.current[key] = {
    ueberschriften: new Set(),
    normen: new Set(),
    aktivesElementId: 'a3',
  };
  await gesetzImTab(a);
  // Keine zweite Ansicht von A: weiterhin genau A und die nun verlassene Ansicht von B.
  expect(scrollbereiche()).toEqual(expect.arrayContaining([bereichA, bereichB]));
  expect(scrollbereiche()).toHaveLength(2);
  expect(bereichA.scrollTop).toBe(145);
  expect(bereichA.style.visibility).toBe('visible');
  expect(vorhanden(tabs.einklappZustandRef.current[key]).normen).toEqual(geklappt.normen);
});
it('verwirft eine verlassene Ansicht ohne verbleibende Abos, sobald der Fensterbestand ihr Gesetz über die Haltegrenze hinaus entlädt', async () => {
  const aktive = listenerZaehler();
  await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  const kleinesGesetz = (i: number) => ({ ...b, kurztitel: `K${i}` });
  // Haltegrenze des Hauptfensters: 50 geladene Gesetze ohne offenen Tab.
  for (let i = 1; i <= 50; i++) await gesetzImTab(kleinesGesetz(i));
  expect(tabs.holeGeladenes(a)).toBeDefined();
  expect(bereichA.isConnected).toBe(true);
  const vorher = { listener: aktive(), beobachter: beobachter.size };
  await gesetzImTab(kleinesGesetz(51));
  expect(tabs.holeGeladenes(a)).toBeUndefined();
  expect(bereichA.isConnected).toBe(false);
  expect(scrollbereiche()).not.toContain(bereichA);
  expect({ listener: aktive(), beobachter: beobachter.size }).toEqual(vorher);
  // Eigenes Zeitlimit: einzeln 1,3–2,3 s, im parallelen Gesamtlauf über dem Standard von 5 s.
}, 15_000);
// Ein in einem anderen Tab übernommenes Gesetz erneuert den Datenstand im Fensterbestand,
// wie es das Nachladen nach einer Dateiänderung tut.
it('verwirft eine verlassene Ansicht bei inhaltlicher Aktualisierung ihres Gesetzes und baut sie mit den aktuellen Daten neu', async () => {
  const erster = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await gesetzImTab(b);
  const geaendert = { ...a, langtitel: 'Neue Fassung' };
  await act(async () => tabs.gesetzOeffnen(geaendert, undefined, 'immer-neu'));
  await zeit();
  expect(bereichA.isConnected).toBe(false);
  await act(async () => tabs.setAktiverTabId(erster));
  // Rücksprung im selben Tab wie beim Verlauf (⌥←); 'aktiver-tab' wechselte zum Tab mit A'.
  await act(async () => tabs.gesetzOeffnen(geaendert, undefined, 'immer-aktiver-tab'));
  await zeit();
  expect(tabs.aktiverTabId).toBe(erster);
  expect(scrollbereiche()).not.toContain(bereichA);
  // Neu gebautes A' im ersten Tab, A' im zuletzt verlassenen Tab, verlassenes B im Restbudget.
  expect(scrollbereiche()).toHaveLength(3);
});
it('erhält eine verlassene Ansicht, wenn ihr Gesetz ohne fachliche Änderung erneut übernommen wird', async () => {
  await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await gesetzImTab(b);
  await act(async () => tabs.gesetzOeffnen({ ...a }, undefined, 'immer-neu'));
  await zeit();
  expect(bereichA.isConnected).toBe(true);
});
it('erhält die unveränderte verlassene Ansicht, wenn das aktuell gezeigte Gesetz aktualisiert wird', async () => {
  await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await gesetzImTab(b);
  const geaendert = { ...b, langtitel: 'Neue Fassung' };
  await act(async () => tabs.gesetzeAktualisierenInTabs([geaendert], [b]));
  await zeit();
  expect(bereichA.isConnected).toBe(true);
});
it('verwirft die verlassenen Ansichten eines geschlossenen Tabs', async () => {
  const erster = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await gesetzImTab(b);
  await act(async () => tabs.gesetzOeffnen(lang, undefined, 'immer-neu'));
  await zeit();
  expect(bereichA.isConnected).toBe(true);
  await act(async () => tabs.tabSchliessen(erster));
  expect(bereichA.isConnected).toBe(false);
  expect(scrollbereiche()).toHaveLength(1);
});
const c = gesetzDarstellung({
  kurztitel: 'C',
  elemente: [1, 2].map((i) => ({
    typ: 'norm' as const,
    data: normaleNorm({ id: `c${i}`, xmlId: `p${i}`, bezeichnung: `§ ${i}`, absaetze: [] }),
  })),
});
/** Erster Tab: A verlassen, B aktuell; zweiter Tab: `zweites`; dritter Tab mit C aktiv. */
async function dreiTabsMitVerlassenerAnsicht(zweites: typeof a) {
  const erster = await start();
  const bereichA = vorhanden(scrollbereiche()[0]);
  await gesetzImTab(b);
  const bereichB = vorhanden(scrollbereiche().find((bereich) => bereich !== bereichA));
  await act(async () => tabs.gesetzOeffnen(zweites, undefined, 'immer-neu'));
  await zeit();
  const zweiter = vorhanden(tabs.aktiverTabId);
  const bereichZweiter = vorhanden(
    scrollbereiche().find((bereich) => bereich !== bereichA && bereich !== bereichB),
  );
  await act(async () => tabs.gesetzOeffnen(c, undefined, 'immer-neu'));
  await zeit();
  expect(scrollbereiche()).toHaveLength(4);
  return { erster, zweiter, bereichA, bereichB, bereichZweiter };
}
async function uebertragen(tabId: string) {
  await act(async () => {
    expect(tabs.tabFuerUebertragungKopieren(tabId)).not.toBeNull();
    tabs.tabUebertragungAbschliessen(tabId);
  });
  await zeit();
}
it('verwirft beim Übertragen eines Tabs dessen aktuelle und verlassene Ansichten und erhält die übrigen', async () => {
  const t = await dreiTabsMitVerlassenerAnsicht(lang);
  await uebertragen(t.erster);
  expect(t.bereichA.isConnected).toBe(false);
  expect(t.bereichB.isConnected).toBe(false);
  expect(t.bereichZweiter.isConnected).toBe(true);
  expect(scrollbereiche()).toHaveLength(2);
  // Übertragen des zuletzt verlassenen, garantierten Tabs: nur die aktive Ansicht bleibt.
  await uebertragen(t.zweiter);
  expect(t.bereichZweiter.isConnected).toBe(false);
  expect(scrollbereiche()).toHaveLength(1);
});
it('verwirft beim Löschen eines Gesetzes dessen Tabansichten und verlassenen Ansichten und erhält die übrigen', async () => {
  const t = await dreiTabsMitVerlassenerAnsicht(a);
  await act(async () => tabs.gesetzeTabsSchliessen([a]));
  await zeit();
  expect(tabs.tabs.map((tab) => tab.id)).not.toContain(t.zweiter);
  expect(t.bereichZweiter.isConnected).toBe(false);
  expect(t.bereichA.isConnected).toBe(false);
  expect(t.bereichB.isConnected).toBe(true);
  // B im ersten Tab und die aktive Ansicht von C.
  expect(scrollbereiche()).toHaveLength(2);
});
it('weist dem Messmodus die sichtbare und die bereitgehaltene Gesetzestextansicht mit DOM-Knoten aus', async () => {
  await start();
  await zweiterTab();
  const { ansichten, bereithaltung, fensterbestaende } = erstelleSpeicherbericht();
  expect(fensterbestaende.map((b) => [b.fenstertyp, b.anzahl['in Tabs']])).toEqual([
    ['hauptfenster', 2],
  ]);
  expect(ansichten.map((x) => [x.gesetz, x.aktiv, x.bereithaltungskosten])).toEqual([
    ['A (de-bund)', false, 3],
    ['B (de-bund)', true, 3],
  ]);
  for (const ansicht of ansichten) {
    expect(ansicht.domKnoten).toBeGreaterThan(10);
    expect(ansicht.messzwischenspeicher?.zeilen.eintraege).toBeGreaterThan(0);
  }
  expect(bereithaltung).toEqual({
    kostenBereitgehalten: 3,
    budget: TAB_BEREITHALTUNGSBUDGET,
    vorgabe: TAB_BEREITHALTUNGSBUDGET,
  });
});
async function normWechsel(key: 'ArrowUp' | 'ArrowDown') {
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true })),
  );
  await zeit();
}
function aktiveLeisteneintraege() {
  return [
    ...dom.host.querySelectorAll<HTMLButtonElement>('[data-einfuehrung-grenze] button'),
  ].filter(
    (b) =>
      !b.dataset.einfuehrungZiel &&
      b.lastElementChild instanceof HTMLElement &&
      b.lastElementChild.style.color === 'var(--akzent)',
  );
}
async function pruefeUnbestimmbareNorm(warnung: string) {
  for (const [ziel, name] of [
    ['favorit', 'Favorit'],
    ['lesezeichen', 'Lesezeichen'],
  ]) {
    const button = vorhanden(
      dom.host.querySelector<HTMLButtonElement>(`[data-einfuehrung-ziel="${ziel}"]`),
    );
    expect(button.disabled).toBe(false);
    expect(button.title).toMatch(new RegExp(`^${name} speichern`));
    await act(async () => button.click());
    // Gleicher Bedienhinweis startet das offene Banner neu statt eines zweiten.
    expect(getSnapshot().some((b) => b.text.includes(warnung))).toBe(true);
  }
}
it('aktualisiert bei Normwechsel den Tooltip ohne zusätzliche Favoritenmeldung', async () => {
  await start();
  const vorher = favoritenMeldungen.length;
  await normWechsel('ArrowDown');
  expect(
    dom.host
      .querySelector('[data-einfuehrung-ziel="favorit"]')
      ?.getAttribute('title')
      ?.replaceAll('\u00a0', ' '),
  ).toContain('§ 2 aus Favoriten entfernen');
  expect(favoritenMeldungen).toHaveLength(vorher);
});

for (const anordnung of [false, true]) {
  it(`folgt Normen und Tabs mit beiden Leisten (${anordnung})`, async () => {
    getauscht = anordnung;
    const idA = await start();
    await act(async () => umschaltenLesezeichen(a, '§ 1'));
    await act(async () => umschaltenLesezeichen(a, '§ 2'));
    await act(async () => umschaltenLesezeichen(b, '§ 1'));
    await act(async () => nativ.native.emitTo('main', 'lesezeichen-geaendert'));
    await zeit();
    const titel = (ziel: string) =>
      dom.host
        .querySelector(`[data-einfuehrung-ziel="${ziel}"]`)
        ?.getAttribute('title')
        ?.replaceAll('\u00a0', ' ');
    expect(liesSpeicherbareNorm()).toMatchObject({
      gesetz: { kurztitel: 'A' },
      bezeichnung: '§ 1',
    });
    expect(aktiveLeisteneintraege()).toHaveLength(2);
    const vorher = favoritenMeldungen.length;
    await normWechsel('ArrowDown');
    expect(favoritenMeldungen).toHaveLength(vorher);
    expect(liesSpeicherbareNorm()?.bezeichnung).toBe('§ 2');
    expect(aktiveLeisteneintraege()).toHaveLength(2);
    expect(aktiveLeisteneintraege().every((b) => b.title.includes('2'))).toBe(true);
    expect(titel('lesezeichen')).toContain('§ 2 aus Lesezeichen entfernen');
    await act(async () => umschaltenLesezeichen(a, '§ 2'));
    await act(async () => nativ.native.emitTo('main', 'lesezeichen-geaendert'));
    await zeit();
    expect(titel('lesezeichen')).toContain('§ 2 als Lesezeichen speichern');
    await normWechsel('ArrowUp');
    expect(titel('lesezeichen')).toContain('§ 1 aus Lesezeichen entfernen');
    await normWechsel('ArrowDown');
    expect(titel('lesezeichen')).toContain('§ 2 als Lesezeichen speichern');
    await normWechsel('ArrowUp');
    expect(titel('lesezeichen')).toContain('§ 1 aus Lesezeichen entfernen');
    const idB = await zweiterTab();
    expect(liesSpeicherbareNorm()?.gesetz.kurztitel).toBe('B');
    await act(async () => tabs.setAktiverTabId(idA));
    expect(liesSpeicherbareNorm()?.gesetz.kurztitel).toBe('A');
    await act(async () => tabs.tabSchliessen(idB));
    expect(liesSpeicherbareNorm()?.gesetz.kurztitel).toBe('A');
    await act(async () => tabs.erstelleLeerenTab());
    expect(liesSpeicherbareNorm()).toBeNull();
    expect(menuText('favorit-speichern')).toBe('Ausgewählte Norm als Favoriten speichern');
    expect(aktiveLeisteneintraege()).toHaveLength(0);
    expect(titel('favorit')).toMatch(/^Favorit speichern/);
    expect(titel('lesezeichen')).toMatch(/^Lesezeichen speichern/);
    expect(
      dom.host.querySelector<HTMLButtonElement>('[data-einfuehrung-ziel="favorit"]')?.disabled,
    ).toBe(true);
    await act(async () => tabs.setAktiverTabId(idA));
    expect(liesSpeicherbareNorm()?.bezeichnung).toBe('§ 1');
    await act(async () => tabs.tabSchliessen(idA));
    expect(liesSpeicherbareNorm()).toBeNull();
    expect(menuText('favorit-speichern')).toBe('Ausgewählte Norm als Favoriten speichern');
  });
}

for (const anordnung of [false, true]) {
  it(`verwendet volle Gliederungsartikelbezeichnungen und leert bei Überschrift (${anordnung})`, async () => {
    getauscht = anordnung;
    await act(async () => dom.root.render(<Fenster />));
    const gesetz = gesetzDarstellung({
      kurztitel: 'EGBGB',
      hatGliederungsartikel: true,
      elemente: [
        {
          typ: 'ueberschrift',
          data: { id: 'u', xmlId: 'u', bezeichnung: 'Teil', ebene: 0, gliederungskennzahl: '001' },
        },
        {
          typ: 'norm',
          data: gliederungsartikel({
            id: 'art',
            xmlId: 'art',
            bezeichnung: 'Art. 229',
            ueberschriftartig: true,
          }),
        },
        { typ: 'norm', data: normaleNorm({ id: 'para', xmlId: 'para', bezeichnung: '§ 3' }) },
      ],
    });
    await act(async () => {
      await vi.waitFor(() =>
        expect(nativ.native.listener.get('main')?.has('lesezeichen-geaendert')).toBe(true),
      );
    });
    await act(async () => hinzufuegenFavoriten(gesetz, ['Art. 229 § 3']));
    await act(async () => umschaltenLesezeichen(gesetz, 'Art. 229 § 3'));
    await act(async () => nativ.native.emitTo('main', 'lesezeichen-geaendert'));
    await act(async () => tabs.gesetzOeffnen(gesetz, 'para', 'aktiver-tab'));
    await zeit();
    expect(liesSpeicherbareNorm()?.bezeichnung).toBe('Art. 229 § 3');
    for (const ziel of ['favorit', 'lesezeichen'])
      expect(
        dom.host
          .querySelector(`[data-einfuehrung-ziel="${ziel}"]`)
          ?.getAttribute('title')
          ?.replaceAll('\u00a0', ' '),
      ).toContain('Art. 229 § 3 aus');
    expect(aktiveLeisteneintraege()).toHaveLength(2);
    await normWechsel('ArrowUp');
    await normWechsel('ArrowUp');
    expect(liesSpeicherbareNorm()).toBeNull();
    expect(menuText('favorit-speichern')).toBe('Ausgewählte Norm als Favoriten speichern');
    expect(aktiveLeisteneintraege()).toHaveLength(0);
    await pruefeUnbestimmbareNorm('können nicht als');
  });
  it(`liefert ohne eindeutige Norm generische bedienbare Aktionen (${anordnung})`, async () => {
    getauscht = anordnung;
    await act(async () => dom.root.render(<Fenster />));
    const gesetz = gesetzMitNormen(['Art. 1', '§ 1'], { kurztitel: 'Doppelt' });
    await act(async () => tabs.gesetzOeffnen(gesetz, '1', 'aktiver-tab'));
    await zeit();
    expect(liesSpeicherbareNorm()).toBeNull();
    expect(menuText('favorit-speichern')).toBe('Ausgewählte Norm als Favoriten speichern');
    await pruefeUnbestimmbareNorm('Bezeichnung');
    await act(async () =>
      tabs.gesetzOeffnen(
        gesetzDarstellung({ kurztitel: 'OhneElemente' }),
        undefined,
        'aktiver-tab',
      ),
    );
    await zeit();
    expect(liesSpeicherbareNorm()).toBeNull();
    expect(menuText('favorit-speichern')).toBe('Ausgewählte Norm als Favoriten speichern');
    expect(
      dom.host.querySelector('[data-einfuehrung-ziel="lesezeichen"]')?.getAttribute('title'),
    ).toMatch(/^Lesezeichen speichern/);
  });
}

it('übernimmt eine Favoritenänderung aus einem anderen Fenster in Menü und Tooltip der eigenen aktiven Norm', async () => {
  await start();
  expect(menuText('favorit-speichern')).toBe('§ 1 aus Favoriten entfernen');
  // Nur die native Ereignisgrenze verbindet die Fenster; Speicherung und Neuladung laufen echt.
  nativ.native.label = 'fenster-a';
  await act(async () => umschaltenFavorit(a, '§ 1'));
  nativ.native.label = 'main';
  await act(async () => nativ.native.emitTo('main', 'favoriten-geaendert'));
  await zeit();
  expect(liesSpeicherbareNorm()).toMatchObject({ bezeichnung: '§ 1', istFavorit: false });
  expect(menuText('favorit-speichern')).toBe('§ 1 als Favoriten speichern');
  expect(
    dom.host
      .querySelector('[data-einfuehrung-ziel="favorit"]')
      ?.getAttribute('title')
      ?.replaceAll('\u00a0', ' '),
  ).toContain('§ 1 als Favorit speichern');
  expect(nativ.native.invoke).toHaveBeenCalledWith('menu_normstatus_melden', {
    status: { bezeichnung: '§ 1', ist_favorit: false, ist_lesezeichen: false },
  });
  await normWechsel('ArrowDown');
  expect(menuText('favorit-speichern')).toBe('§ 2 aus Favoriten entfernen');
});
