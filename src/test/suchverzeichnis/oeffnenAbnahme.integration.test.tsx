// @vitest-environment jsdom
import {
  tabFuerTest,
  holeTabGesetzFuerTest,
  bestandszugriffFuerTest,
} from '@/test/tabs/tabBestandFuerTest';
import { suchverzeichnisTestdatei } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// Gesamtabnahme durch Bedienung des echten Overlays und seiner Trefferzeilen.
import { act, useState, useEffect, useRef } from 'react';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import { strToU8, zipSync } from 'fflate';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { ladeLesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { EinklappZustand, Tab } from '@/lib/domain/appTypes';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { OeffnenOverlay } from '@/components/overlays/overlays.index';
import { OeffnenScreenFixture } from '@/test/suchverzeichnis/OeffnenScreenFixture';
import { importiereGesetze } from '@/lib/import/import.index';
import { loeseNormzielNachImportAuf } from '@/lib/gesetz-laden/gesetz-laden.index';
import {
  parseSuchanfrage,
  leiteSuchverzeichniseintragAb,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { MELDUNGSGRUND_HINWEIS } from '@/lib/domain/app/aktionsMeldung';
import { gesetzDarstellung, normaleNorm, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { artikelkontextGesetz } from '@/test/gesetz/artikelkontext';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';

// Ausschließlich externe Grenzen ersetzen; Suche, Index, Import und Speicher laufen echt.
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  fetch: vi.fn(),
  cacheSchreibenFehler: false,
  /** Native Gesetzsperre, die ein anderer Vorgang hält. */
  fremdGesperrt: false,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {}, emitTo: async () => {} }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'hauptfenster',
    onDragDropEvent: async () => () => {},
    isMaximized: async () => false,
    onResized: async () => () => {},
  }),
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  appDataDir: async () => '/daten',
  resolveResource: async (pfad: string) => pfad,
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  const { europaRessourceFixture, importindexFixture } =
    await import('@/test/import/europaImportFixtures');
  const fs = dateiAttrappen(io.dateien, async (pfad) => {
    const relativ = pfad.replace('/daten/LexLata/', '');
    const datei = io.dateien.get(relativ);
    if (datei !== undefined) return datei;
    if (pfad.startsWith('/daten/')) throw new Error('Datei fehlt: ' + pfad);
    if (pfad.includes('praefixstrukturen'))
      return `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>${pfad.endsWith('de-bund.xml') ? 'de-bund' : 'de-bw'}</normgeber></infos><inhalt><gesetz>LBO</gesetz></inhalt></praefixstrukturen>`;
    if (pfad.endsWith('de-bund.xml'))
      return importindexFixture(
        'de-bund',
        '<gesetz><kurztitel>LBO</kurztitel><langtitel>Landesbauordnung</langtitel><abrufkennung>lbo</abrufkennung></gesetz>',
      );
    return europaRessourceFixture(pfad);
  });
  return {
    ...fs,
    exists: async (pfad: string) =>
      (pfad.startsWith('resources/') && !pfad.includes('nichtamtliche-titel')) || fs.exists(pfad),
  };
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (name: string, args?: { relativerPfad: string; inhalt: string }) => {
    if (name === 'atomar_datei_schreiben' && args) {
      if (io.cacheSchreibenFehler && args.relativerPfad === 'cache/suchverzeichnis.json')
        throw new Error('Cache schreibgeschützt');
      io.dateien.set(args.relativerPfad, args.inhalt);
      return;
    }
    if (name === 'gesetz_dateistempel_lesen')
      return [...io.dateien]
        .filter(([p]) => p.startsWith('gesetze/') && p.endsWith('.xml'))
        .map(([p, t]) => ({
          name: p.slice(8),
          dateistempel: { groesse: String(t.length), aenderungszeit: '1' },
        }));
    if (name === 'datei_sperre_erwerben' || name === 'import_aktualisierung_starten')
      return 'token';
    if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return !io.fremdGesperrt;
    if (name === 'pruefvorgang_registrieren') return 'pruefvorgang';
    if (name === 'pruefvorgang_wiederholung_uebernehmen') return false;
    if (name === 'pruefvorgang_quellen_abwarten') return;
    if (name.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    if (
      [
        'datei_sperre_freigeben',
        'gesetz_import_sperre_freigeben',
        'import_aktualisierung_beenden',
        'set_menu_item_enabled',
      ].includes(name)
    )
      return;
    throw new Error('Unerwarteter nativer Befehl: ' + name);
  },
}));
const bundXML =
  '<dokumente doknr="lbo"><norm doknr="lbo"><metadaten><jurabk>LBO</jurabk><langue>Landesbauordnung</langue></metadaten></norm><norm doknr="anlage"><metadaten><enbez>Anlage 1</enbez></metadaten><textdaten><text><Content><P>Anlage.</P></Content></text></textdaten></norm><norm doknr="paragraph"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Hauptnorm.</P></Content></text></textdaten></norm></dokumente>';
const lbo = gesetzMitNormen(['Anlage 1', '§ 1', '§ 2', 'Anhang 1'], {
  kurztitel: 'LBO',
  langtitel: 'Bürgerliches Gesetzbuch',
  kennung: (i) => `lbo-${i}`,
});
const eg = artikelkontextGesetz();
const dom = domTestWurzel();
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('__TAURI_INTERNALS__', {
    invoke: async (name: string) => {
      if (name === 'plugin:event|emit_to') return;
      throw new Error('Unerwarteter Tauri-Ereignisbefehl: ' + name);
    },
  });
  localStorage.clear();
  initialisiereMarkierungen();
  io.dateien.clear();
  io.cacheSchreibenFehler = false;
  io.fremdGesperrt = false;
  alleBannerSchliessen();
  io.dateien.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei([lbo, eg]));
  io.fetch.mockClear();
  io.fetch.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => zipSync({ 'lbo.xml': strToU8(bundXML) }).buffer,
  });
  document.body.append(dom.host);
});
afterEach(async () => {
  await vi.dynamicImportSettled();
  dom.host.remove();
});
async function taste(key: string) {
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
  );
}
async function tippen(text: string) {
  const input = dom.host.querySelector('input');
  const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  assert(input && setzen);
  await act(async () => {
    setzen.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it.each([
  ['1', lbo, undefined, 0, 'lbo-1'],
  ['1', lbo, undefined, 1, 'lbo-0'],
  ['1 LBO', eg, undefined, 2, 'lbo-3'],
  ['§ 1', lbo, undefined, 0, 'lbo-1'],
  ['§ 4', eg, '246a-3', 0, '246a-4'],
] as const)(
  'öffnet %s über Tippen, Pfeiltasten und Enter',
  async (text, aktiv, aktivesElementId, schritte, ziel) => {
    const oeffnen = vi.fn();
    await act(async () =>
      dom.root.render(
        <OeffnenOverlay
          gesetze={[lbo, eg]}
          aktivesGesetz={aktiv}
          aktivesElementId={aktivesElementId}
          onSchliessen={() => {}}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={() => {}}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([lbo, eg], oeffnen, () => {})}
        />,
      ),
    );
    await tippen(text);
    expect(dom.host.textContent?.replaceAll('\u00a0', ' ')).toContain(
      text === '§ 4' ? 'Art. 246a' : '§ 1',
    );
    for (let i = 0; i < schritte; i++) await taste('ArrowDown');
    await taste('Enter');
    expect(oeffnen).toHaveBeenCalledWith(text === '§ 4' ? eg : lbo, ziel);
  },
);
it('zeigt nur das Importangebot und öffnet nach Import die Hauptnorm', async () => {
  io.dateien.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei([]));
  const oeffnen = vi.fn();
  await act(async () =>
    dom.root.render(
      <OeffnenOverlay
        gesetze={[]}
        aktivesGesetz={null}
        onSchliessen={() => {}}
        onGesetzOeffnen={oeffnen}
        onNeuenTabOeffnen={() => {}}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], oeffnen, () => {})}
      />,
    ),
  );
  await tippen('1 LBO');
  expect(dom.host.textContent?.replaceAll('\u00a0', ' ')).toContain('§ 1');
  expect(dom.host.textContent?.replaceAll('\u00a0', ' ')).not.toContain('Anlage 1');
  expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(1);
  await taste('Enter');
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  await act(async () => {
    await vi.waitFor(() => expect(oeffnen, dom.host.textContent ?? '').toHaveBeenCalled());
  });
  expect(io.fetch).toHaveBeenCalledTimes(1);
  expect(oeffnen).toHaveBeenCalledWith(expect.objectContaining({ kurztitel: 'LBO' }), '1');
  const gespeichert = io.dateien.get('gesetze/LBO_de-bund.xml');
  expect(gespeichert).toContain('id="1"');
  expect(gespeichert).toContain('Anlage 1');
});

it('Tab, Suche und gespeichertes Lesezeichen verwenden dasselbe aktive EG-Element', async () => {
  const key = 'tab-' + gesetzesreferenzSchluessel(eg);
  const tabsRef: { current: Tab[] } = { current: [tabFuerTest({ id: 'tab', gesetz: eg })] };
  const einklappZustandRef: { current: Record<string, EinklappZustand> } = {
    current: {
      [key]: { ueberschriften: new Set(), normen: new Set(), aktivesElementId: '246a-3' },
    },
  };
  const ohneAktion = async () => {};
  let speichern: (() => Promise<boolean>) | undefined;
  const oeffnen = vi.fn();
  function Probe() {
    const [tabs, setTabs] = useState(tabsRef.current);
    const [tabTitel, setTabTitel] = useState<Record<string, string>>({});
    const lesezeichen = useLesezeichenUndFavoriten({
      holeTabGesetz: holeTabGesetzFuerTest,
      tabsRef,
      aktiverTabIdRef: { current: 'tab' },
      einklappZustandRef,
    });
    useEffect(() => {
      speichern = lesezeichen.handleLesezeichenSpeichern;
    }, [lesezeichen.handleLesezeichenSpeichern]);
    return (
      <>
        <HauptansichtFixture
          tabsteuerung={{
            holeTabGesetz: holeTabGesetzFuerTest,
            ...bestandszugriffFuerTest,
            tabs,
            setTabs,
            aktiverTabId: 'tab',
            tabTitel,
            setTabTitel,
            setAktiverTabId: ohneAktion,
            tabSchliessen: ohneAktion,
            erstelleLeerenTab: ohneAktion,
            scrollPositionenRef: { current: {} },
            einklappZustandRef,
            verlaufLesen: () => undefined,
          }}
          lesezeichen={lesezeichen}
          setFavoritenStatus={ohneAktion}
          navigation={{ handleVerweisKlick: ohneAktion, handleLesezeichenOeffnen: ohneAktion }}
          verlaufSchrittUndOeffnen={ohneAktion}
          verlaufAktivierung={ohneAktion}
          verlaufBedienung={ohneAktion}
        />
        <output data-gemeldeter-tabtitel>{tabTitel.tab}</output>
        <OeffnenOverlay
          gesetze={[eg]}
          aktivesGesetz={eg}
          aktivesElementId={einklappZustandRef.current[key]?.aktivesElementId}
          initialInput="§ 4"
          onSchliessen={() => {}}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={() => {}}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([eg], oeffnen, () => {})}
        />
      </>
    );
  }
  await act(async () => dom.root.render(<Probe />));
  await act(async () => vi.dynamicImportSettled());
  expect(dom.host.querySelector('[data-gemeldeter-tabtitel]')?.textContent).toBe('Art. 246a § 3');
  assert(speichern);
  await act(async () => {
    await speichern?.();
  });
  expect(await ladeLesezeichen()).toEqual([
    { gesetz: { kurztitel: 'EG', normgeber: 'de-bund' }, bezeichnung: 'Art. 246a § 3' },
  ]);
  const xml = io.dateien.get('lesezeichen/lesezeichen.xml');
  expect(xml).toContain('<bezeichnung>Art. 246a § 3</bezeichnung>');
  expect(xml).toContain('<gesetz normgeber="de-bund">EG</gesetz>');
  await taste('Enter');
  expect(oeffnen).toHaveBeenCalledWith(eg, '246a-4');
});

function OeffnenLinkProbe({
  oeffnen,
  suchtext = '1 LBO',
}: {
  oeffnen: (...args: unknown[]) => void;
  suchtext?: string;
}) {
  const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
  const navigieren = useOeffnenLinkNavigation({
    importindexVorbereitungRef,
    zeigeSuchfehler: () => {
      throw new Error('Erfolgreicher Import darf kein Suchfehler sein');
    },
  });
  useEffect(() => {
    void navigieren(
      { type: 'oeffnen', suchtext },

      async () => true,
      (ziel) => {
        if ('gesetz' in ziel) oeffnen(ziel.gesetz, ziel.xmlId);
        else throw new Error('Der importierte Treffer muss das importierte Gesetz liefern');
      },
    );
  }, [navigieren, oeffnen, suchtext]);
  return null;
}
it.each([
  ['desktop', true],
  ['mobil', true],
  ['oeffnenLink', true],
  ['desktop', false],
  ['mobil', false],
  ['oeffnenLink', false],
] as const)(
  'öffnet nach erfolgreichem Import über %s bei Cachefehler=%s das Gesetz und meldet den fehlgeschlagenen Normsprung',
  async (weg, cachefehler) => {
    io.dateien.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei([]));
    io.cacheSchreibenFehler = cachefehler;
    const suchtext = cachefehler ? '1 LBO' : '999 LBO';
    const oeffnen = vi.fn();
    await act(async () =>
      dom.root.render(
        weg === 'desktop' ? (
          <OeffnenOverlay
            gesetze={[]}
            aktivesGesetz={null}
            initialInput={suchtext}
            onSchliessen={() => {}}
            onGesetzOeffnen={oeffnen}
            onNeuenTabOeffnen={() => {}}
            onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], oeffnen, () => {})}
          />
        ) : weg === 'mobil' ? (
          <OeffnenScreenFixture onGesetzGewaehlt={oeffnen} />
        ) : (
          <OeffnenLinkProbe oeffnen={oeffnen} suchtext={suchtext} />
        ),
      ),
    );
    if (weg === 'mobil') await tippen(suchtext);
    if (weg !== 'oeffnenLink') {
      await act(async () =>
        vi.waitFor(() => expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(1)),
      );
      await act(async () => {
        const treffer = dom.host.querySelector<HTMLElement>('[data-idx]');
        assert(treffer);
        treffer.click();
      });
    }
    await act(async () => vi.waitFor(() => expect(oeffnen).toHaveBeenCalled()));
    expect(oeffnen).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kurztitel: 'LBO' }),
      undefined,
    );
    expect(io.dateien.get('gesetze/LBO_de-bund.xml')).toContain('id="1"');
    // Der fehlgeschlagene Normsprung hängt als Hinweis am importierten Gesetz
    // oder steht (mobil, ohne Vorgangsergebnis) als eigener Satz.
    const importiert = getSnapshot().flatMap(
      (banner) =>
        banner.gliederung?.kategorien.flatMap((k) => k.gruppen.flatMap((g) => g.namen)) ?? [],
    );
    expect(
      importiert
        .find((n) => n.name === 'LBO')
        ?.hinweise.includes(MELDUNGSGRUND_HINWEIS.normNichtGefunden) ||
        getSnapshot().some((banner) =>
          banner.text.includes('Sprung zur gewünschten Norm ist fehlgeschlagen'),
        ),
    ).toBe(true);
    if (!cachefehler) {
      expect(io.dateien.get('cache/suchverzeichnis.json')).toContain('LBO');
      expect(
        getSnapshot().some((banner) => banner.text.includes('Suche noch nicht vorbereitet')),
      ).toBe(false);
    }
  },
);

it.each([false, true])(
  'verwendet nach erfolgreichem Ersetzen bei fehlgeschlagener Cachepflege kein altes Normziel aus einem Verzeichnis mit abgeglichen=%s',
  async (abgeglichen) => {
    const altXML =
      '<gesetz><infos><kurztitel>LBO</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="altes-ziel"><bezeichnung>§ 1</bezeichnung><text><absatz>Alter Text</absatz></text></norm></inhalt></gesetz>';
    const alt = gesetzDarstellung({
      kurztitel: 'LBO',
      elemente: [{ typ: 'norm', data: normaleNorm({ xmlId: 'altes-ziel', bezeichnung: '§ 1' }) }],
    });
    io.dateien.set('gesetze/LBO_de-bund.xml', altXML);
    io.dateien.set(
      'cache/suchverzeichnis.json',
      JSON.stringify({
        version: 1,
        abgeglichen,
        eintraege: [
          leiteSuchverzeichniseintragAb(alt, {
            groesse: String(altXML.length),
            aenderungszeit: '1',
          }),
        ],
      }),
    );
    io.cacheSchreibenFehler = true;
    const neuXML = altXML
      .replace('altes-ziel', 'neues-ziel')
      .replace('</infos>', '<verarbeitungszeit>2026-11-06T12:00:00Z</verarbeitungszeit></infos>');
    io.dateien.set('resources/europa/ersatz.xml', neuXML);
    const ergebnis = await importiereGesetze(
      [{ kurztitel: 'LBO', abrufkennung: 'ersatz.xml' }],
      'eu',
    );
    const importiert = ergebnis.erfolgreiche[0];
    assert(importiert);
    expect(io.dateien.get('gesetze/LBO_de-bund.xml')).toContain('id="neues-ziel"');
    const xmlId = await loeseNormzielNachImportAuf(importiert, parseSuchanfrage('1 LBO'));
    expect(xmlId).toBeUndefined();
    expect(
      getSnapshot().some((banner) =>
        banner.text.includes('Sprung zur gewünschten Norm ist fehlgeschlagen'),
      ),
    ).toBe(true);
  },
);

// Importweg, wenn dasselbe Gesetz gerade anderswo (etwa beim Datei-Import) gespeichert wird.
describe('Importangebot bei anderswo gespeichertem Gesetz', () => {
  const GESPEICHERT = 'gesetze/LBO_de-bund.xml';
  const LBO = { kurztitel: 'LBO', normgeber: 'de-bund' };
  let gespeichertesLBO = '';
  beforeEach(async () => {
    if (!gespeichertesLBO) {
      await importiereGesetze(['LBO'], 'de-bund');
      gespeichertesLBO = io.dateien.get(GESPEICHERT) ?? '';
      assert(gespeichertesLBO);
    }
    io.dateien.delete(GESPEICHERT);
    io.fetch.mockClear();
    io.dateien.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei([]));
  });
  afterEach(() => vi.useRealTimers());
  async function importangebotWaehlen(text: string, vorAuswahl?: () => void) {
    const geoeffnet = vi.fn();
    const installiertGeoeffnet = vi.fn();
    await act(async () =>
      dom.root.render(
        <OeffnenOverlay
          gesetze={[]}
          aktivesGesetz={null}
          onSchliessen={() => {}}
          onGesetzOeffnen={geoeffnet}
          onNeuenTabOeffnen={() => {}}
          onInstalliertOeffnen={installiertGeoeffnet}
        />,
      ),
    );
    await tippen(text);
    expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(1);
    vorAuswahl?.();
    await taste('Enter');
    return { geoeffnet, installiertGeoeffnet };
  }
  /** Erklärung, die den laufenden Ladezustand beschreibt. */
  function warteHinweis() {
    const id = dom.host.querySelector('[role="status"]')?.getAttribute('aria-describedby');
    const hinweis = id ? document.getElementById(id) : null;
    return hinweis?.textContent ? hinweis : null;
  }
  function fehlerBanner() {
    return getSnapshot().filter((banner) => banner.typ === 'fehler');
  }

  it('öffnet ein inzwischen anderswo gespeichertes Gesetz mit Normsprung ohne Fehlermeldung', async () => {
    // Das Importangebot steht noch in der Liste, das Gesetz ist inzwischen gespeichert.
    const { geoeffnet, installiertGeoeffnet } = await importangebotWaehlen('1 LBO', () =>
      io.dateien.set(GESPEICHERT, gespeichertesLBO),
    );
    await act(async () => {
      await vi.waitFor(() => expect(installiertGeoeffnet).toHaveBeenCalled());
    });
    expect(installiertGeoeffnet).toHaveBeenCalledExactlyOnceWith(LBO, '1', false);
    expect(geoeffnet).not.toHaveBeenCalled();
    expect(fehlerBanner()).toEqual([]);
    expect(io.fetch).not.toHaveBeenCalled();
  });

  it('wartet mit Erklärung auf die Sperre und öffnet danach das anderswo gespeicherte Gesetz', async () => {
    io.fremdGesperrt = true;
    const { geoeffnet, installiertGeoeffnet } = await importangebotWaehlen('1 LBO');
    await act(async () => {
      await vi.waitFor(() => expect(warteHinweis()).not.toBeNull());
    });
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 300));
    });
    expect(installiertGeoeffnet).not.toHaveBeenCalled();
    expect(warteHinweis()).not.toBeNull();
    io.dateien.set(GESPEICHERT, gespeichertesLBO);
    io.fremdGesperrt = false;
    await act(async () => {
      await vi.waitFor(() => expect(installiertGeoeffnet).toHaveBeenCalled());
    });
    expect(installiertGeoeffnet).toHaveBeenCalledExactlyOnceWith(LBO, '1', false);
    expect(geoeffnet).not.toHaveBeenCalled();
    expect(io.fetch).not.toHaveBeenCalled();
    expect(fehlerBanner()).toEqual([]);
  });

  it('importiert nach Freigabe der Sperre, wenn das Gesetz weiterhin fehlt', async () => {
    io.fremdGesperrt = true;
    const { geoeffnet } = await importangebotWaehlen('1 LBO');
    await act(async () => {
      await vi.waitFor(() => expect(warteHinweis()).not.toBeNull());
    });
    expect(io.fetch).not.toHaveBeenCalled();
    io.fremdGesperrt = false;
    await act(async () => {
      await vi.waitFor(() => expect(geoeffnet).toHaveBeenCalled());
    });
    expect(io.fetch).toHaveBeenCalledTimes(1);
    expect(geoeffnet).toHaveBeenCalledWith(expect.objectContaining(LBO), '1');
    expect(io.dateien.get(GESPEICHERT)).toContain('id="1"');
  });

  it('zeigt nach 30 Sekunden ohne Freigabe die bisherige Meldung', async () => {
    io.fremdGesperrt = true;
    // Bisheriges Verhalten: der Import meldet die fremde Sperre sofort.
    const bisher = (await importiereGesetze(['LBO'], 'de-bund')).fehlgeschlagene[0]?.fehler;
    assert(bisher?.grund === 'beschaeftigt');
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    const { geoeffnet, installiertGeoeffnet } = await importangebotWaehlen('1 LBO');
    await act(async () => {
      await vi.waitFor(() => expect(warteHinweis()).not.toBeNull());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(warteHinweis()).not.toBeNull();
    expect(dom.host.textContent).not.toContain(bisher.meldung);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await act(async () => {
      await vi.waitFor(() => expect(dom.host.textContent).toContain(bisher.meldung));
    });
    expect(warteHinweis()).toBeNull();
    expect(geoeffnet).not.toHaveBeenCalled();
    expect(installiertGeoeffnet).not.toHaveBeenCalled();
    expect(io.fetch).not.toHaveBeenCalled();
  });
});
