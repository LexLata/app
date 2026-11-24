// @vitest-environment jsdom
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { seitenleistenGroessenBeobachtung } from '@/test/hauptfenster/seitenleistenGroessenBeobachtung';
// Favoriten gehören der Hauptansicht und folgen dem aktiven Gesetz.
import { act, useLayoutEffect, type ComponentProps } from 'react';
import { assert, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { nativeAttrappeZuruecksetzen, io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { scrollNachfuehrungMessung } from '@/test/hauptfenster/scrollNachfuehrungMessung';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useSeitenleistenStatus } from '@/hooks/useSeitenleistenStatus';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { gesetzDarstellung, normaleNorm, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { umschaltenFavorit } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { FavoritSchnellaktion } from '@/components/seitenleisten/Schnellaktionen';
import { Favoritenleiste } from './Favoritenleiste';
import { useFavoritenleiste } from './useFavoritenleiste';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import { ladeHilfsfensterWurzel } from '@/components/hilfsfenster/hilfsfenster.index';
const EinstellungenFenster = await ladeHilfsfensterWurzel('einstellungen').then((wurzel) => {
  assert(wurzel);
  return wurzel;
});
import { useHauptfensterDarstellung } from '@/hooks/useHauptfensterDarstellung';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { exportiere } from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { setzeEinstellungenZurueck } from '@/lib/einstellungen/einstellungen.index';
import {
  ladeLesezeichen,
  umschaltenLesezeichen,
} from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { BannerHost } from '@/components/hauptfenster/BannerHost';
import { zeigeBanner, alleBannerSchliessen } from '@/lib/banner/banner.index';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
const dom = domTestWurzel();
const gesetze = ['BGB', 'GG'].map((kurztitel, i) =>
  gesetzMitNormen(['§ 1', '§ 2'], {
    kurztitel,
    langtitel: gesetzDarstellung().langtitel,
    kennung: (index) => `${i}-${index + 1}`,
    norm: (index) => {
      const n = index + 1;
      return {
        xmlId: `xml-${i}-${n}`,
        absaetze: [
          { id: `abs-${n}`, saetze: [{ id: `satz-${n}`, text: `Normtext ${n}`, eintraege: [] }] },
        ],
      };
    },
  }),
);
let tabs: ReturnType<typeof useAppTabs>;
const meldungen = vi.fn();
const aktivierungen = vi.fn();
const nichts = () => {};
let minimalistischerModus = false;
let leistenTauschen: boolean | undefined = false;
let zeigeEinstellungen = false;
function Probe() {
  const tabsteuerung = useAppTabs();
  const darstellung = useHauptfensterDarstellung();
  const navigation = useGesetzOeffnen({
    ...gesetzOeffnenFixture(tabsteuerung, gesetze),

    ladeGesetz: einzelzugriffFuerTest(async () => ({
      liste: gesetze,
      befunde: [],
      ordnerLesbar: true,
    })),
  });
  useLayoutEffect(() => {
    tabs = tabsteuerung;
  });
  const speicher = useLesezeichenUndFavoriten(tabsteuerung);
  const status = useSeitenleistenStatus(
    !!tabsteuerung.holeTabGesetz(tabsteuerung.tabs.find((t) => t.id === tabsteuerung.aktiverTabId)),
  );
  return (
    <>
      {zeigeEinstellungen && <EinstellungenFenster />}
      <HauptansichtFixture
        minimalistischerModus={minimalistischerModus}
        leistenTauschen={leistenTauschen ?? darstellung.leistenTauschen}
        seitenleistenTastenkuerzel={darstellung.seitenleistenTastenkuerzel}
        tabsteuerung={tabsteuerung}
        lesezeichen={speicher}
        setFavoritenStatus={nichts}
        status={{
          ...status,
          setFavoritenStatus: (s) => {
            meldungen(s);
            status.setFavoritenStatus(s);
          },
        }}
        navigation={navigation}
        verlaufSchrittUndOeffnen={nichts}
        verlaufBedienung={nichts}
        verlaufAktivierung={aktivierungen}
      />
      <BannerHost />
    </>
  );
}
beforeEach(async () => {
  Element.prototype.scrollIntoView = () => {};
  document.body.append(dom.host);
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  localStorage.setItem('lexlata.seitenleistenTastenkuerzel', 'true');
  alleBannerSchliessen();
  minimalistischerModus = false;
  leistenTauschen = false;
  zeigeEinstellungen = false;
  meldungen.mockClear();
  aktivierungen.mockClear();
  scrollNachfuehrungMessung(() => 1);
  const erstes = gesetze[0];
  assert(erstes);
  await umschaltenFavorit(erstes, '§ 1');
  const zweites = gesetze[1];
  assert(zweites);
  await umschaltenFavorit(zweites, '§ 2');
});
afterEach(() => {
  dom.host.remove();
  vi.restoreAllMocks();
});
async function zeichnen() {
  await act(async () => dom.root.render(<Probe />));
  await act(async () => vi.dynamicImportSettled());
}
async function oeffnen(index: number) {
  await act(async () => tabs.setTabs([tabFuerTest({ id: 'eins', gesetz: gesetze[index] }, tabs)]));
  await act(async () => tabs.setAktiverTabId('eins'));
  await act(async () => vi.dynamicImportSettled());
}
it('zeigt rechts die aktiven Favoriten, ruft ihr Ziel auf und räumt vor dem Laden des nächsten Gesetzes auf', async () => {
  await zeichnen();
  await oeffnen(0);
  let rechts = dom.host.querySelector('[data-einfuehrung-grenze="rechts"]');
  assert(rechts);
  const button = rechts.querySelector('button');
  assert(button);
  expect(button.textContent).toBe('a1');
  expect(button.title).toBeTruthy();
  await act(async () => button.click());
  expect(aktivierungen.mock.calls.some((c) => c[1].xmlId === 'xml-0-1')).toBe(true);
  meldungen.mockClear();
  await oeffnen(1);
  expect(
    meldungen.mock.calls.map((c) => c[0].favoritenEintraege.map((e: { xmlId: string }) => e.xmlId)),
  ).toEqual([[], [], ['xml-1-2']]);
  rechts = dom.host.querySelector('[data-einfuehrung-grenze="rechts"]');
  expect(rechts?.textContent).toBe('a2');
  await act(async () => tabs.setTabs([{ id: 'eins' }]));
  expect(dom.host.querySelector('[data-einfuehrung-grenze="rechts"]')).toBeNull();
});
it('meldet bei erneutem Rendern unveränderter Textansicht keinen neuen Status und zeigt selbst keine Leiste', async () => {
  const gesetz = gesetze[0];
  assert(gesetz);
  const props: ComponentProps<typeof Gesetzestextansicht> = {
    gesetz,
    markierungenDeaktiviert: true,
    onFavoritenStatusAendern: meldungen,
  };
  await act(async () => dom.root.render(<Gesetzestextansicht {...props} />));
  await act(async () => vi.dynamicImportSettled());
  expect(meldungen.mock.calls.at(-1)?.[0].favoritenEintraege).toHaveLength(1);
  const anzahl = meldungen.mock.calls.length;
  const springen = meldungen.mock.calls.at(-1)?.[0].favoritAufrufen;
  for (let i = 0; i < 3; i++)
    await act(async () => dom.root.render(<Gesetzestextansicht {...props} />));
  expect(meldungen).toHaveBeenCalledTimes(anzahl);
  expect(meldungen.mock.calls.at(-1)?.[0].favoritAufrufen).toBe(springen);
  expect(dom.host.querySelector('[data-einfuehrung-grenze="rechts"]')).toBeNull();
  await act(async () => dom.root.render(null));
  expect(meldungen.mock.calls.at(-1)?.[0].favoritenEintraege).toEqual([]);
  await act(async () => springen('xml-0-1'));
});

it('zeigt zweispaltig alle Kürzel und Sterne; jedes angezeigte Kürzel ruft genau sein Favoritenziel auf', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.push(fn);
    return frames.length;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: (entries: ResizeObserverEntry[]) => void) {}
      observe() {
        this.callback([]);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 800,
  });
  const gesetz = gesetzDarstellung({
    kurztitel: 'VIELE',
    elemente: Array.from({ length: 79 }, (_, i) => ({
      typ: 'norm',
      data: normaleNorm({
        id: `n-${i}`,
        xmlId: `ziel-${i}`,
        bezeichnung: `§ ${i + 1}`,
        absaetze: [],
      }),
    })),
  });
  for (let i = 0; i < 79; i++) await umschaltenFavorit(gesetz, String(i + 1));
  await zeichnen();
  await act(async () => tabs.setTabs([tabFuerTest({ id: 'viele', gesetz }, tabs)]));
  await act(async () => tabs.setAktiverTabId('viele'));
  await act(async () => vi.dynamicImportSettled());
  await act(async () => {
    const wartend = frames.splice(0);
    wartend.forEach((fn) => fn(0));
  });
  const rechts = dom.host.querySelector('[data-einfuehrung-grenze="rechts"]');
  assert(rechts);
  expect(rechts.querySelector('[data-einfuehrung-ziel="favorit"]')).not.toBeNull();
  const liste = rechts.firstElementChild;
  assert(liste);
  expect(liste.children).toHaveLength(3);
  const buttons = Array.from(rechts.querySelectorAll<HTMLButtonElement>('button')).filter(
    (b) => !b.dataset.einfuehrungZiel,
  );
  expect(buttons).toHaveLength(79);
  const spruenge = vi.fn();
  function FavoritenProbe() {
    const { favoritenEintraege } = useFavoritenleiste({
      gesetz,
      favoritenVersion: 0,
      seitenleistenTastenkuerzel: true,
      normScrollen: spruenge,
    });
    return (
      <Favoritenleiste
        gesetz={gesetz}
        eintraege={favoritenEintraege}
        seitenleistenTastenkuerzel
        onKlick={spruenge}
        seite="rechts"
        schnellaktionenAnzahl={1}
        schnellaktionen={<FavoritSchnellaktion onFavoritKlick={nichts} />}
      />
    );
  }
  await act(async () => dom.root.render(<FavoritenProbe />));
  await act(async () => vi.dynamicImportSettled());
  const modulButtons = Array.from(dom.host.querySelectorAll('button')).filter(
    (button) => !button.dataset.einfuehrungZiel,
  );
  for (let i = 0; i < 78; i++) {
    const b = modulButtons[i];
    assert(b);
    const span = b.querySelector('span');
    assert(span);
    const buchstabe = String.fromCharCode((i >= 26 && i < 52 ? 65 : 97) + (i % 26));
    expect(span.textContent).toBe(buchstabe);
    expect(b.title).toBeTruthy();
    spruenge.mockClear();
    await act(async () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: i >= 52 ? 'ä' : buchstabe,
          code: `Key${buchstabe.toUpperCase()}`,
          altKey: i >= 52,
          shiftKey: i >= 26 && i < 52,
        }),
      ),
    );
    expect(spruenge.mock.calls, `Index ${i}`).toEqual([[`ziel-${i}`]]);
    await act(async () => b.click());
    expect(spruenge.mock.calls).toEqual([[`ziel-${i}`], [`ziel-${i}`]]);
  }
  expect(buttons[78]?.querySelector('span')?.style.visibility).toBe('hidden');
});

it('bewahrt Reihenfolge und Seiten der Schnellaktionen und blendet sie minimalistisch aus', async () => {
  const ziele = (seite: string) =>
    Array.from(
      dom.host.querySelectorAll(
        `[data-einfuehrung-grenze="${seite}"] button[data-einfuehrung-ziel]`,
      ),
      (e) => e.getAttribute('data-einfuehrung-ziel'),
    );
  await zeichnen();
  expect(ziele('links')).toEqual(['favorit', 'lesezeichen', 'zuklappen', 'aufklappen', 'oeffnen']);
  expect(ziele('rechts')).toEqual([]);
  await oeffnen(0);
  expect(ziele('links')).toEqual(['lesezeichen', 'zuklappen', 'aufklappen', 'oeffnen']);
  expect(ziele('rechts')).toEqual(['favorit']);
  minimalistischerModus = true;
  await zeichnen();
  expect(ziele('links')).toEqual([]);
  expect(ziele('rechts')).toEqual([]);
  expect(dom.host.querySelector('[data-einfuehrung-grenze="rechts"]')?.textContent).toBe('a1');
});

it('tauscht Favoriten und Schnellaktionen und blendet die Aktionen minimalistisch aus', async () => {
  leistenTauschen = true;
  await zeichnen();
  const ziele = (seite: string) =>
    Array.from(
      dom.host.querySelectorAll(
        `[data-einfuehrung-grenze="${seite}"] button[data-einfuehrung-ziel]`,
      ),
      (e) => e.getAttribute('data-einfuehrung-ziel'),
    );
  expect(ziele('links')).toEqual(['lesezeichen', 'favorit', 'zuklappen', 'aufklappen', 'oeffnen']);
  await oeffnen(0);
  expect(dom.host.querySelector('[data-einfuehrung-grenze="links"]')?.textContent).toContain('a1');
  expect(dom.host.querySelector('[data-einfuehrung-grenze="rechts"]')).toBeNull();
  minimalistischerModus = true;
  await zeichnen();
  expect(ziele('links')).toEqual([]);
  expect(dom.host.querySelector('[data-einfuehrung-grenze="links"]')?.textContent).toBe('a1');
});

it('bewahrt beim mehrfachen Leistenwechsel Textposition, aktives Element und Einklappzustand', async () => {
  leistenTauschen = true;
  await zeichnen();
  await oeffnen(0);
  let norm = dom.host.querySelector('[data-xml-id="xml-0-1"]');
  assert(norm);
  const zweiteNorm = dom.host.querySelector<HTMLElement>('[data-xml-id="xml-0-2"] .gt-klapp-zeile');
  const normtext = norm.querySelector<HTMLElement>('[data-leaf]');
  const scrollbereich = norm.closest<HTMLElement>('[style*="overflow: auto"]');
  assert(zweiteNorm);
  assert(normtext);
  assert(scrollbereich);
  await act(async () => zweiteNorm.click());
  await act(async () => normtext.click());
  await act(async () => {
    scrollbereich.scrollTop = 75;
    scrollbereich.dispatchEvent(new Event('scroll'));
  });
  const zustand = Object.values(tabs.einklappZustandRef.current)[0];
  assert(zustand);
  expect(zustand.normen.has('0-2')).toBe(true);
  expect(zustand.aktivesElementId).toBe('0-1');
  norm = dom.host.querySelector('[data-xml-id="xml-0-1"]');
  assert(norm);
  for (const wert of [false, true, false, true]) {
    leistenTauschen = wert;
    await zeichnen();
    expect(dom.host.querySelector('[data-xml-id="xml-0-1"]')).toBe(norm);
    expect(scrollbereich.scrollTop).toBe(75);
    expect(Object.values(tabs.einklappZustandRef.current)[0]).toEqual(zustand);
    expect(
      dom.host.querySelector<SVGElement>('[data-xml-id="xml-0-2"] .gt-chevron')?.style.transform,
    ).toBe('rotate(0deg)');
  }
});

const leiste = (seite: string) => dom.host.querySelector(`[data-einfuehrung-grenze="${seite}"]`);
const ziele = (seite: string) =>
  Array.from(leiste(seite)?.querySelectorAll('button[data-einfuehrung-ziel]') ?? [], (e) =>
    e.getAttribute('data-einfuehrung-ziel'),
  );
async function aktion(ziel: string) {
  const button = dom.host.querySelector<HTMLButtonElement>(
    `button[data-einfuehrung-ziel="${ziel}"]`,
  );
  assert(button);
  await act(async () => button.click());
  await act(async () => vi.dynamicImportSettled());
}
for (const getauscht of [true, false]) {
  it(`erkennt ein gespeichertes volles Lesezeichen am gesetzten Symbol und schaltet es ohne Duplikat um (${getauscht ? 'getauscht' : 'Standard'})`, async () => {
    leistenTauschen = getauscht;
    const gesetz = gesetze[0];
    assert(gesetz);
    await umschaltenLesezeichen(gesetz, '§ 1');
    await zeichnen();
    const symbol = () => {
      const svg = dom.host.querySelector('[data-einfuehrung-ziel="lesezeichen"] svg');
      assert(svg);
      return svg.innerHTML;
    };
    const leeresSymbol = symbol();
    await oeffnen(0);
    const ersteNorm = dom.host.querySelector<HTMLElement>(
      '[data-xml-id="xml-0-1"] .gt-klapp-zeile',
    );
    assert(ersteNorm);
    await act(async () => ersteNorm.click());
    const gesetztesSymbol = symbol();
    expect(gesetztesSymbol).not.toBe(leeresSymbol);
    expect(await ladeLesezeichen()).toEqual([
      { gesetz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber }, bezeichnung: '§ 1' },
    ]);
    await aktion('lesezeichen');
    expect(symbol()).toBe(leeresSymbol);
    expect(await ladeLesezeichen()).toEqual([]);
    await aktion('lesezeichen');
    expect(symbol()).toBe(gesetztesSymbol);
    expect(await ladeLesezeichen()).toEqual([
      { gesetz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber }, bezeichnung: '§ 1' },
    ]);
    await aktion('lesezeichen');
    expect(symbol()).toBe(leeresSymbol);
    expect(await ladeLesezeichen()).toEqual([]);
  });
  it(`speichert und entfernt Favoriten und Lesezeichen in ${getauscht ? 'getauschter' : 'Standard'}anordnung und folgt Tabwechseln`, async () => {
    leistenTauschen = getauscht;
    await zeichnen();
    await oeffnen(0);
    const ersteNorm = dom.host.querySelector<HTMLElement>(
      '[data-xml-id="xml-0-1"] .gt-klapp-zeile',
    );
    assert(ersteNorm);
    await act(async () => ersteNorm.click());
    const stern = () => dom.host.querySelector('[data-einfuehrung-ziel="favorit"] svg')?.innerHTML;
    const gespeicherterStern = stern();
    await aktion('lesezeichen');
    expect(ziele('links')).toEqual(
      getauscht
        ? ['favorit', 'zuklappen', 'aufklappen', 'oeffnen']
        : ['lesezeichen', 'zuklappen', 'aufklappen', 'oeffnen'],
    );
    expect(ziele('rechts')).toEqual([getauscht ? 'lesezeichen' : 'favorit']);
    expect(leiste(getauscht ? 'rechts' : 'links')?.textContent).toContain('BGB');
    await aktion('favorit');
    expect(stern()).not.toBe(gespeicherterStern);
    expect(leiste(getauscht ? 'links' : 'rechts')?.textContent ?? '').not.toContain('a1');
    await aktion('favorit');
    expect(leiste(getauscht ? 'links' : 'rechts')?.textContent).toContain('a1');
    expect(stern()).toBe(gespeicherterStern);
    await aktion('lesezeichen');
    expect(ziele('links')).toEqual(
      getauscht
        ? ['lesezeichen', 'favorit', 'zuklappen', 'aufklappen', 'oeffnen']
        : ['lesezeichen', 'zuklappen', 'aufklappen', 'oeffnen'],
    );
    await oeffnen(1);
    expect(leiste(getauscht ? 'links' : 'rechts')?.textContent).toContain('a2');
  });
}
it('öffnet rechts Lesezeichen neben der Willkommensansicht und sperrt dort das Speichern', async () => {
  leistenTauschen = true;
  const gesetz = gesetze[0];
  assert(gesetz);
  await umschaltenLesezeichen(gesetz, '1');
  await zeichnen();
  const rechts = leiste('rechts');
  assert(rechts);
  expect(
    rechts.querySelector<HTMLButtonElement>('[data-einfuehrung-ziel="lesezeichen"]')?.disabled,
  ).toBe(true);
  const ziel = Array.from(rechts.querySelectorAll('button')).find(
    (b) => !b.dataset.einfuehrungZiel,
  );
  assert(ziel);
  await act(async () => ziel.click());
  await act(async () => vi.dynamicImportSettled());
  expect(dom.host.querySelector('[data-xml-id="xml-0-1"]')).not.toBeNull();
});
it('übernimmt die Bedienung im Einstellungsfenster sofort und stellt nach Export und Zurücksetzen die Anordnung aus XML wieder her', async () => {
  leistenTauschen = undefined;
  zeigeEinstellungen = true;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  await zeichnen();
  await oeffnen(0);
  const label = Array.from(dom.host.querySelectorAll('label')).find((e) =>
    e.textContent?.includes('Leisten tauschen:'),
  );
  const checkbox = label?.querySelector('input');
  assert(checkbox);
  await act(async () => checkbox.click());
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lexlata.leistenTauschen', newValue: 'true' }),
    ),
  );
  expect(leiste('links')?.textContent).toContain('a1');
  expect(leiste('rechts')).toBeNull();
  await exportiere(new Set(['einstellungen']), {});
  const xml = io.dateien.get('/daten/Export.xml');
  assert(xml);
  expect(xml).toContain('<leistenTauschen>true</leistenTauschen>');
  await act(async () => {
    expect(await setzeEinstellungenZurueck()).toEqual({ erfolgreich: true });
  });
  expect(leiste('rechts')?.textContent).toContain('1');
  expect(leiste('rechts')?.textContent).not.toContain('a1');
  await act(async () => {
    await importierePfade(['/daten/Export.xml']);
  });
  expect(leiste('links')?.textContent).toContain('a1');
  expect(leiste('rechts')).toBeNull();
});

it('zeigt minimalistisch ausschließlich Listen mit Inhalt und lässt rechts Lesezeichen ohne linke Favoriten stehen', async () => {
  leistenTauschen = true;
  minimalistischerModus = true;
  await zeichnen();
  expect(leiste('links')).toBeNull();
  expect(leiste('rechts')).toBeNull();
  const gesetz = gesetze[0];
  assert(gesetz);
  await act(async () => {
    await umschaltenLesezeichen(gesetz, '1');
  });
  await act(async () => vi.dynamicImportSettled());
  expect(leiste('links')).toBeNull();
  expect(leiste('rechts')?.textContent).toContain('BGB');
  expect(ziele('rechts')).toEqual([]);
  await oeffnen(0);
  expect(leiste('links')?.textContent).toContain('a1');
  expect(ziele('links')).toEqual([]);
});
it('lässt Banner der rechten Liste folgen und gibt den Abstand nach dem Löschen des letzten Lesezeichens frei', async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
  seitenleistenGroessenBeobachtung();
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(83);
  const messen = () =>
    act(async () => {
      frames.splice(0).forEach((fn) => fn(0));
    });
  const abstand = () =>
    dom.host.querySelector<HTMLElement>('[style*="position: fixed"]')?.style.right;
  await zeichnen();
  await oeffnen(0);
  await act(async () => {
    zeigeBanner({ art: 'systemfehler', text: 'Gespeichert' });
  });
  await messen();
  expect(abstand()).toBe('99px');
  leistenTauschen = true;
  await zeichnen();
  await messen();
  expect(abstand()).toBe('16px');
  const gesetz = gesetze[0];
  assert(gesetz);
  await act(async () => {
    await umschaltenLesezeichen(gesetz, '1');
  });
  await act(async () => vi.dynamicImportSettled());
  await messen();
  expect(abstand()).toBe('99px');
  await act(async () => {
    await umschaltenLesezeichen(gesetz, '1');
  });
  await act(async () => vi.dynamicImportSettled());
  await messen();
  expect(abstand()).toBe('16px');
});

for (const getauscht of [false, true]) {
  it(`öffnet die Initialnorm erst nach Favoriten- und Lesezeichenladen (${getauscht ? 'getauscht' : 'Standard'})`, async () => {
    leistenTauschen = getauscht;
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frames.set(++id, fn);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
    seitenleistenGroessenBeobachtung();
    let gibFavoritenFrei = () => {};
    let gibLesezeichenFrei = () => {};
    const favoriten = new Promise<void>((resolve) => {
      gibFavoritenFrei = resolve;
    });
    const lesezeichen = new Promise<void>((resolve) => {
      gibLesezeichenFrei = resolve;
    });
    io.vorLesen = async (pfad) => {
      if (pfad.includes('favoriten/')) await favoriten;
      if (pfad.includes('lesezeichen.xml')) await lesezeichen;
    };
    async function zeichneFrames() {
      for (let i = 0; i < 12; i++)
        await act(async () => {
          const wartend = [...frames.values()];
          frames.clear();
          wartend.forEach((fn) => fn(0));
        });
    }
    await zeichnen();
    await act(async () => {
      tabs.setTabs([
        tabFuerTest({ id: 'anfang', gesetz: gesetze[0], initialNorm: 'xml-0-2' }, tabs),
      ]);
      tabs.setAktiverTabId('anfang');
    });
    await zeichneFrames();
    const text = () => dom.host.querySelector<HTMLElement>('[style*="overflow: auto"]');
    expect(text()?.style.visibility).toBe('hidden');
    expect(tabs.tabs[0]?.initialNorm).toBe('xml-0-2');
    await act(async () => gibFavoritenFrei());
    await zeichneFrames();
    expect(text()?.style.visibility).toBe('hidden');
    expect(leiste(getauscht ? 'links' : 'rechts')?.textContent).toContain('a1');
    await act(async () => gibLesezeichenFrei());
    await zeichneFrames();
    expect(tabs.tabs[0]?.initialNorm).toBeUndefined();
    expect(text()?.style.visibility).toBe('visible');
  });
}

it('zeigt frisch keine Seitenleisten-Kürzel und schaltet sie über das Einstellungsfenster sofort ein', async () => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  localStorage.removeItem('lexlata.seitenleistenTastenkuerzel');
  zeigeEinstellungen = true;
  await zeichnen();
  await oeffnen(0);
  const gesetz = gesetze[0];
  assert(gesetz);
  await act(async () => {
    await umschaltenLesezeichen(gesetz, '1');
  });
  await act(async () => vi.dynamicImportSettled());
  const eintraege = () =>
    ['links', 'rechts'].map((seite) => {
      const eintrag = Array.from(
        dom.host.querySelectorAll<HTMLButtonElement>(`[data-einfuehrung-grenze="${seite}"] button`),
      ).find((b) => b.textContent?.endsWith('1'));
      assert(eintrag);
      return eintrag;
    });
  for (const b of eintraege()) {
    expect(b.children).toHaveLength(1);
    expect(b.title).not.toContain('(');
  }
  const label = Array.from(dom.host.querySelectorAll('label')).find(
    (l) => l.textContent === 'Tastenkürzel in Seitenleisten aktivieren',
  );
  assert(label);
  await act(async () => label.click());
  // Das Browserereignis wird nur im jeweils anderen Fenster ausgelöst.
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lexlata.seitenleistenTastenkuerzel', newValue: 'true' }),
    ),
  );
  for (const b of eintraege()) {
    expect(b.children).toHaveLength(2);
    expect(b.title).toContain('(');
  }
  expect(localStorage.getItem('lexlata.seitenleistenTastenkuerzel')).toBe('true');
});

it('färbt beim Wechsel zwischen gespeicherten Normen beide Leisten sofort und nur im aktiven Gesetz', async () => {
  const gesetz = gesetze[0];
  const anderes = gesetze[1];
  assert(gesetz && anderes);
  await umschaltenFavorit(gesetz, '§ 2');
  for (const g of [gesetz, anderes]) {
    await umschaltenLesezeichen(g, '§ 1');
    await umschaltenLesezeichen(g, '§ 2');
  }
  await zeichnen();
  await oeffnen(0);
  const farbe = (title: string) => {
    const button = [...dom.host.querySelectorAll('button')].find((b) => b.title.startsWith(title));
    assert(button, title);
    return button.lastElementChild instanceof HTMLElement
      ? button.lastElementChild.style.color
      : '';
  };
  for (const n of [1, 2, 1]) {
    const norm = dom.host.querySelector<HTMLElement>(`[data-xml-id="xml-0-${n}"] .gt-klapp-zeile`);
    assert(norm);
    await act(async () => norm.click());
    for (const m of [1, 2]) {
      const erwartet = n === m ? 'var(--akzent)' : 'var(--text-primaer)';
      expect(farbe(`§\u00a0${m} (${m === 1 ? 'a' : 'b'})`)).toBe(erwartet);
      expect(farbe(`§\u00a0${m} BGB`)).toBe(erwartet);
      expect(farbe(`§\u00a0${m} GG`)).toBe('var(--text-primaer)');
    }
  }
});
