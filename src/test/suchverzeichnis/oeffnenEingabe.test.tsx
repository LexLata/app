// @vitest-environment jsdom
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { suchverzeichnisTestdatei } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// Öffnen-Overlay über echte Tastenkürzel, Eingabefeld und Trefferliste bedienen.
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import { artikelkontextGesetz } from '@/test/gesetz/artikelkontext';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OeffnenOverlay } from '@/components/overlays/overlays.index';
import { OeffnenScreen } from '@/mobile/screens/OeffnenScreen';
import { useTastenkuerzel } from '@/hooks/eingabe/useTastenkuerzel';
import type { AktivesOverlay } from '@/lib/domain/appTypes';
import { gesetzDarstellung, normaleNorm, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: async () => () => {} }),
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setFocus: async () => {} }),
}));
// Die Tests benötigen keinen Importindex. Sein echter Ladeweg bleibt an der
// Dateisystemgrenze stehen; sämtliche eigenen Suchmodule laufen unverändert.
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { europaRessourceFixture } = await import('@/test/import/europaImportFixtures');
  return {
    exists: async () => true,
    readDir: async () => [],
    readTextFile: async (pfad: string) => {
      if (pfad.endsWith('/cache/suchverzeichnis.json'))
        return suchverzeichnisTestdatei(suchbestand);
      if (pfad.includes('praefixstrukturen'))
        return `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>${pfad.endsWith('de-bund.xml') ? 'de-bund' : 'de-bw'}</normgeber></infos><inhalt/></praefixstrukturen>`;
      return europaRessourceFixture(pfad);
    },
  };
});
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {}, emitTo: async () => {} }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => 'sperre' }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/test',
  appDataDir: async () => '/test',
  resourceDir: async () => '/test',
  resolveResource: async (pfad: string) => pfad,
  join: async (...teile: string[]) => teile.join('/'),
}));

const gesetze = ['G', 'GG'].map((kurztitel) =>
  gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    elemente: [{ typ: 'norm', data: normaleNorm({ id: '1', xmlId: '1', bezeichnung: '§ 1' }) }],
  }),
);
let suchbestand = gesetze;
let root: Root;
const oeffnen = vi.fn();
function ohneAktion() {}
function Host() {
  const [overlay, setAktivesOverlay] = useState<AktivesOverlay | null>(null);
  const [initial, setOeffnenOverlayInitial] = useState('');
  useTastenkuerzel({
    setAktivesOverlay,
    setOeffnenOverlayInitial,
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: null },
    gesetzeskurzbefehle: {},
    gesetze: alsSuchverzeichniseintraege(gesetze),
    gesetzesreferenzOeffnen: () => () => {},
    elementOeffnen: ohneAktion,
    setAktiverTabId: ohneAktion,
    lesezeichenEintraege: [],
    handleLesezeichenOeffnen: ohneAktion,
    verlaufSchrittUndOeffnen: ohneAktion,
    handleZuklappen: ohneAktion,
    handleAufklappen: ohneAktion,
    einfuehrungAktiv: false,
    einfuehrungTeilaktion: 0,
    handleExportOeffnen: ohneAktion,
    tabOderFensterSchliessen: ohneAktion,
    fensterSchliessen: ohneAktion,
    handleFavoritSpeichern: ohneAktion,
    handleLesezeichenSpeichern: ohneAktion,
    handleAlleLesezeichenEntfernen: ohneAktion,
    handleUnterstreichen: ohneAktion,
    handleHervorheben: ohneAktion,
    handleVerweismarkierungAnfrage: ohneAktion,
    handleKommentarAnfrage: ohneAktion,
    handleMarkierungRueckgaengig: ohneAktion,
    handleMarkierungWiederholen: ohneAktion,
    erstelleLeerenTab: ohneAktion,
    tabWiederherstellen: ohneAktion,
    handleDateiImportAnfrage: ohneAktion,
  });
  return (
    <>
      <textarea aria-label="Kommentar" />
      {overlay === 'oeffnen' && (
        <OeffnenOverlay
          gesetze={gesetze}
          aktivesGesetz={null}
          initialInput={initial}
          onSchliessen={() => {}}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={vi.fn()}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest(gesetze, oeffnen, vi.fn())}
        />
      )}
    </>
  );
}
beforeEach(() => {
  suchbestand = gesetze;
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: { transformCallback: () => 1, unregisterCallback: () => {}, invoke: async () => 1 },
  });
  Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
    configurable: true,
    value: { unregisterListener: () => {} },
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const container = document.createElement('main');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Host />));
});
afterEach(async () => {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  oeffnen.mockClear();
});

function feld<T extends HTMLElement = HTMLInputElement>(selektor: string): T {
  const element = document.querySelector<T>(selektor);
  if (!element) throw new Error(`Eingabeelement fehlt: ${selektor}`);
  return element;
}

// jsdom führt die Standardaktion einer Zeichentaste nicht aus. Dieser Helfer
// ergänzt nur diese Browseraktion, und nur am tatsächlich fokussierten Feld.
function taste(key: string) {
  const ziel = document.activeElement ?? document.body;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  ziel.dispatchEvent(event);
  if (event.defaultPrevented || key.length !== 1) return;
  const feld = document.activeElement;
  if (!(feld instanceof HTMLInputElement || feld instanceof HTMLTextAreaElement)) return;
  const wert = feld.value + key;
  const prototyp =
    feld instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setzen = Object.getOwnPropertyDescriptor(prototyp, 'value')?.set;
  if (!setzen) throw new Error('Browser stellt keinen Eingabewert bereit');
  setzen.call(feld, wert);
  feld.dispatchEvent(new Event('input', { bubbles: true }));
}
it.each(['gleicher Tick', 'nach Einhängen', 'nach Fokus'])(
  'erhält 2301 genau einmal bei Folgetasten %s',
  (zeitfolge) => {
    if (zeitfolge === 'gleicher Tick')
      act(() => {
        for (const zeichen of '2301') taste(zeichen);
      });
    else {
      act(() => taste('2'));
      // Nach dem Einhängen muss der Fokus bereits gesetzt sein: es gibt
      // absichtlich keine zeitliche Lücke zwischen Einhängen und Fokus mehr.
      expect(document.activeElement).toBe(document.querySelector('input'));
      act(() => {
        for (const zeichen of '301') taste(zeichen);
      });
    }
    expect(document.querySelector('input')?.value).toBe('2301');
  },
);
it('erhält Leerzeichen, Buchstaben, Umlaute und ß direkt nach dem öffnenden Zeichen', () => {
  act(() => {
    for (const zeichen of '§ 433 bgb äß') taste(zeichen);
  });
  expect(document.querySelector('input')?.value).toBe('§ 433 bgb äß');
});
it('öffnet bei einer Ziffer im Kommentarfeld kein Öffnen-Overlay', () => {
  feld('textarea').focus();
  act(() => taste('2'));
  expect(document.querySelector('input')).toBeNull();
  expect(document.querySelector('textarea')?.value).toBe('2');
});
it('öffnet bei Enter unmittelbar nach 1 gg den Treffer zum vollständigen Text', async () => {
  // Den Sitzungsindex vorab laden: Enter während des Ladens wartet bewusst.
  await act(async () => {
    for (const zeichen of '1 g') taste(zeichen);
  });
  await act(async () => taste('Enter'));
  expect(oeffnen).toHaveBeenLastCalledWith(gesetze[0], '1');
  oeffnen.mockClear();
  act(() => feld<HTMLButtonElement>('[title="Eingabe löschen"]').click());
  await act(async () => {
    for (const zeichen of '1 gg') taste(zeichen);
    taste('Enter');
  });
  expect(document.querySelector('input')?.value).toBe('1 gg');
  expect(oeffnen).toHaveBeenCalledWith(gesetze[1], '1');
});

// Jede Geste bildet eine diskrete Browseraktion ab. Zwischen den Zeichen
// verstreicht keine Wartezeit; React verarbeitet dabei seine Ereignisgrenzen.
function bildschirmtaste(label: string) {
  const taste = [...document.querySelectorAll('button')].find(
    (b) => b.firstChild?.textContent === label,
  );
  if (!taste) throw new Error(`Bildschirmtaste fehlt: ${label}`);
  act(() => {
    for (const typ of ['pointerdown', 'pointerup']) {
      const event = new Event(typ, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'clientX', { value: 0 });
      Object.defineProperty(event, 'clientY', { value: 0 });
      taste.dispatchEvent(event);
    }
  });
}
it('öffnet mit mobilem Fertig direkt nach 1 gg den Treffer zum vollständigen Text', async () => {
  await act(async () =>
    root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onGesetzGewaehlt={oeffnen}
        onGesetzImportiert={async () => {}}
        customTastaturAktiv
        onReferenzGewaehlt={suchtrefferOeffnenFuerTest(gesetze, oeffnen, oeffnen)}
      />,
    ),
  );
  act(() => feld('input').focus());
  for (const zeichen of ['1', 'Leerzeichen', 'g']) bildschirmtaste(zeichen);
  expect(document.querySelector('input')?.value).toBe('1 g');
  // Beide Gesetze passen; das exakt bezeichnete G steht zuerst.
  bildschirmtaste('Fertig');
  expect(oeffnen).toHaveBeenLastCalledWith(gesetze[0], '1');
  act(() => feld<HTMLButtonElement>('[aria-label="Eingabe löschen"]').click());
  act(() => feld('input').blur());
  act(() => feld('input').focus());
  for (const zeichen of ['1', 'Leerzeichen', 'g', 'g']) bildschirmtaste(zeichen);
  bildschirmtaste('Fertig');
  expect(document.querySelector('input')?.value).toBe('1 gg');
  expect(oeffnen).toHaveBeenLastCalledWith(gesetze[1], '1');
});

it('erhält Folgetasten auch direkt nach dem öffnenden Tastenkürzel', () => {
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'o',
        code: 'KeyO',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    for (const zeichen of 'ä ß 2301') taste(zeichen);
  });
  expect(document.querySelector('input')?.value).toBe('ä ß 2301');
});

it('öffnet Hauptnorm und Anlage durch Enter, Pfeiltaste, Klick und neuen Tab ohne doppelte Schlüssel', async () => {
  const fehler = vi.spyOn(console, 'error');
  const gesetz = gesetzDarstellung({
    kurztitel: 'LBO',
    elemente: [
      { typ: 'norm', data: normaleNorm({ xmlId: 'anlage', bezeichnung: 'Anlage 1' }) },
      { typ: 'norm', data: normaleNorm({ xmlId: 'paragraph', bezeichnung: '§ 1' }) },
    ],
  });
  const neuerTab = vi.fn();
  suchbestand = [gesetz];
  await act(async () =>
    root.render(
      <OeffnenOverlay
        gesetze={[gesetz]}
        aktivesGesetz={gesetz}
        initialInput="1"
        onSchliessen={() => {}}
        onGesetzOeffnen={oeffnen}
        onNeuenTabOeffnen={neuerTab}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest([gesetz], oeffnen, neuerTab)}
      />,
    ),
  );
  expect(document.body.textContent).toContain('Anlage');
  expect(document.body.textContent).toContain('§');
  await act(async () => taste('Enter'));
  expect(oeffnen).toHaveBeenLastCalledWith(gesetz, 'paragraph');
  act(() => taste('ArrowDown'));
  await act(async () => taste('Enter'));
  expect(oeffnen).toHaveBeenLastCalledWith(gesetz, 'anlage');
  const anlage = [...document.querySelectorAll<HTMLElement>('[data-idx]')].find((b) =>
    b.textContent?.includes('Anlage'),
  );
  expect(anlage).toBeDefined();
  await act(async () => anlage?.click());
  expect(oeffnen).toHaveBeenLastCalledWith(gesetz, 'anlage');
  for (const modifier of ['metaKey', 'ctrlKey']) {
    await act(async () =>
      document.querySelector('input')?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          [modifier]: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(neuerTab).toHaveBeenLastCalledWith(gesetz, 'anlage');
  }
  expect(fehler).not.toHaveBeenCalled();
});

it('öffnet mobil mit echter Trefferzeile und Bildschirmtastatur Hauptnorm oder Anlage', async () => {
  const fehler = vi.spyOn(console, 'error');
  const gesetz = gesetzDarstellung({
    kurztitel: 'LBO',
    elemente: [
      { typ: 'norm', data: normaleNorm({ xmlId: 'anlage', bezeichnung: 'Anlage 1' }) },
      { typ: 'norm', data: normaleNorm({ xmlId: 'paragraph', bezeichnung: '§ 1' }) },
    ],
  });
  suchbestand = [gesetz];
  await act(async () =>
    root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onGesetzGewaehlt={oeffnen}
        onGesetzImportiert={async () => {}}
        customTastaturAktiv
        onReferenzGewaehlt={suchtrefferOeffnenFuerTest([gesetz], oeffnen, oeffnen)}
      />,
    ),
  );
  act(() => feld('input').focus());
  for (const zeichen of ['1', 'Leerzeichen', 'l', 'b', 'o']) bildschirmtaste(zeichen);
  expect([...document.querySelectorAll('[data-idx]')].map((zeile) => zeile.textContent)).toEqual([
    expect.stringContaining('§'),
    expect.stringContaining('Anlage'),
  ]);
  await act(async () => document.querySelector<HTMLElement>('[data-idx="1"]')?.click());
  expect(oeffnen).toHaveBeenLastCalledWith(gesetz, 'anlage');
  bildschirmtaste('Fertig');
  expect(oeffnen).toHaveBeenLastCalledWith(gesetz, 'paragraph');
  expect(fehler).not.toHaveBeenCalled();
});

it('zeigt im Rückfall mit Paragraphpräfix nur Paragraphen und ohne Präfix je Gesetz einen Treffer', async () => {
  const vorgaben: [string, string[]][] = [
    ['LBO', ['§ 1', 'Anlage 1']],
    ['GG', ['Art. 1', 'Anlage 1']],
    ['CIC', ['Can. 1']],
    ['G2', ['§ 7', 'Anlage 1', 'Anhang 1']],
    ['G4', ['§ 9']],
  ];
  const bestand = vorgaben.map(([kurztitel, normen]) =>
    gesetzMitNormen(normen, { kurztitel, langtitel: 'Bürgerliches Gesetzbuch' }),
  );
  suchbestand = bestand;
  await act(async () =>
    root.render(
      <OeffnenOverlay
        gesetze={bestand}
        aktivesGesetz={bestand[4] ?? null}
        initialInput="§ 1"
        onSchliessen={ohneAktion}
        onGesetzOeffnen={oeffnen}
        onNeuenTabOeffnen={ohneAktion}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest(bestand, oeffnen, ohneAktion)}
      />,
    ),
  );
  expect([...document.querySelectorAll('[data-idx]')].map((z) => z.textContent)).toEqual([
    expect.stringContaining('LBO'),
  ]);
  act(() => feld<HTMLButtonElement>('[title="Eingabe löschen"]').click());
  await act(async () => taste('1'));
  const zeilen = [...document.querySelectorAll('[data-idx]')];
  expect(zeilen).toHaveLength(4);
  for (const titel of ['LBO', 'GG', 'CIC', 'G2'])
    expect(zeilen.filter((z) => z.textContent?.includes(titel))).toHaveLength(1);
});

it('sucht im echten EG-Tab unter Art. 246a und hält den Kontext bis zum Schließen fest', async () => {
  const eg = artikelkontextGesetz();
  let tabs: ReturnType<typeof useAppTabs>;
  const navigation = vi.fn();
  function ArtikelHost() {
    const tabsteuerung = useAppTabs();
    useEffect(() => {
      tabs = tabsteuerung;
    });
    const tab = tabsteuerung.tabs.find((t) => t.id === tabsteuerung.aktiverTabId) ?? null;
    return tabsteuerung.holeTabGesetz(tab) ? (
      <AppOverlayHost
        {...appOverlayHostFixture({
          aktivesOverlay: 'oeffnen',
          gesetze: [eg],
          aktiverTab: tab,
          einklappZustandRef: tabsteuerung.einklappZustandRef,
          oeffnenOverlayInitial: '§ 4',
          gesetzesreferenzOeffnen: navigation,
        })}
      />
    ) : null;
  }
  suchbestand = [eg];
  await act(async () => root.render(<ArtikelHost />));
  await act(async () => {
    const tabId = tabs.aktiverTabId;
    if (!tabId) throw new Error('Aktiver Tab fehlt');
    tabs.einklappZustandRef.current[tabId + '-' + gesetzesreferenzSchluessel(eg)] = {
      ueberschriften: new Set(),
      normen: new Set(),
      aktivesElementId: '246a-3',
    };
    tabs.setTabs([tabFuerTest({ id: tabId, gesetz: eg }, tabs)]);
  });
  expect(document.body.textContent?.replace(/\s/g, ' ')).toContain('Art. 246a');
  expect(document.body.textContent?.replace(/\s/g, ' ')).toContain('§ 4');
  await act(async () => {
    const tabId = tabs.aktiverTabId;
    if (!tabId) throw new Error('Aktiver Tab fehlt');
    const zustand = tabs.einklappZustandRef.current[tabId + '-' + gesetzesreferenzSchluessel(eg)];
    if (!zustand) throw new Error('Einklapp-Zustand fehlt');
    zustand.aktivesElementId = '229';
    tabs.setTabs([...tabs.tabs]);
  });
  await act(async () => taste('Enter'));
  expect(navigation).toHaveBeenCalledWith(
    {
      gesetzesreferenz: { kurztitel: eg.kurztitel, normgeber: eg.normgeber },
      xmlId: '246a-4',
      nurInstalliert: true,
    },
    'aktiver-tab',
  );
});

it('öffnet in der mobilen Suche ohne Artikelkontext Art. 4', async () => {
  const eg = artikelkontextGesetz();
  suchbestand = [eg];
  await act(async () =>
    root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={eg}
        onGesetzGewaehlt={oeffnen}
        onGesetzImportiert={async () => {}}
        customTastaturAktiv={false}
        onReferenzGewaehlt={suchtrefferOeffnenFuerTest([eg], oeffnen, oeffnen)}
      />,
    ),
  );
  await act(async () => {
    feld('input').focus();
    for (const zeichen of '§ 4 EG') taste(zeichen);
  });
  const artikel = [...document.querySelectorAll('span')].find(
    (el) => el.textContent?.replace(/\s/g, ' ') === 'Art. 4',
  );
  if (!artikel) throw new Error('Treffer Art. 4 fehlt');
  await act(async () => artikel.click());
  expect(oeffnen).toHaveBeenCalledWith(eg, '4');
});
