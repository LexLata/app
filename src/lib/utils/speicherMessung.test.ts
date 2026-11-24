// @vitest-environment jsdom
// Prüft die Speicheraufschlüsselung des Messmodus an durchgerechneten Schätzungen und echtem DOM.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import {
  SPEICHERMESSUNG_ANSICHT_ATTRIBUT,
  beobachteTestweisesBereithaltungsbudget,
  erstelleSpeicherbericht,
  gibSpeicherberichtAus,
  holeTestweisesBereithaltungsbudget,
  meldeSpeicherauskunft,
  richteMesskonsoleEin,
} from './speicherMessung';

const abmeldungen: Array<() => void> = [];
afterEach(() => {
  for (const abmelden of abmeldungen.splice(0)) abmelden();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  globalThis.bereithaltungsbudget?.();
  Reflect.deleteProperty(globalThis, 'speicherbericht');
  Reflect.deleteProperty(globalThis, 'bereithaltungsbudget');
});

const posten = (name: string, liefere: () => unknown) =>
  meldeSpeicherauskunft({ art: 'posten', name, liefere });
const fensterbestand = (
  gesetze: Array<{ gesetz: GesetzDarstellung; zustand: 'in Tabs' | 'vorgeladen' | 'behalten' }>,
) =>
  meldeSpeicherauskunft({
    art: 'fensterbestand',
    liefere: () => ({ fenstertyp: 'hauptfenster', gesetze }),
  });
const ansicht = (id: string, gesetz: GesetzDarstellung, messstand = leererMessstand) =>
  meldeSpeicherauskunft({ art: 'ansicht', id, gesetz, messstand });

function gesetzMitNormen(kurztitel: string, anzahl: number): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    elemente: Array.from({ length: anzahl }, (_, i) => ({
      typ: 'norm' as const,
      data: normaleNorm({
        id: `${kurztitel}${i}`,
        xmlId: `p${i}`,
        bezeichnung: `§ ${i}`,
        absaetze: [],
      }),
    })),
  });
}

function ansichtImDom(id: string, kinder: number, verdeckt = false) {
  const wurzel = document.createElement('div');
  wurzel.setAttribute(SPEICHERMESSUNG_ANSICHT_ATTRIBUT, id);
  for (let i = 0; i < kinder; i++) wurzel.append(document.createElement('span'));
  // React Activity verdeckt die oberste Ebene mit display: none.
  const huelle = document.createElement('section');
  if (verdeckt) huelle.style.setProperty('display', 'none', 'important');
  huelle.append(wurzel);
  document.body.append(huelle);
}

const leererMessstand = () => ({
  grenze: 20_000,
  spalten: { eintraege: 0, zeichen: 0 },
  zeilen: { eintraege: 0, zeichen: 0 },
});

describe('Schätzung der Datengröße', () => {
  it('rechnet Objekte, Felder, Listen und Zeichen nach JavaScriptCore-Richtwerten', () => {
    // Objekt 24 + 2 Felder × 8 = 40; „ab“ 2 + 24 = 26; Liste 24 + 1 × 8 = 32;
    // „„x“ enthält ein Zeichen außerhalb Latin-1, daher 2 × 2 + 24 = 28. Summe 126.
    abmeldungen.push(posten('Probe', () => ({ a: 'ab', b: ['„x'] })));
    expect(erstelleSpeicherbericht().posten).toEqual([{ name: 'Probe', bytes: 126, zeichen: 4 }]);
  });

  it('zählt mehrfach erreichbare Objekte nur einmal', () => {
    const geteilt = { x: 'a' };
    // Hülle 24 + 16 = 40; geteiltes Objekt 24 + 8 = 32; „a“ 1 + 24 = 25. Summe 97.
    abmeldungen.push(posten('Geteilt', () => ({ p: geteilt, q: geteilt })));
    expect(erstelleSpeicherbericht().posten[0]).toMatchObject({ bytes: 97, zeichen: 1 });
  });

  it('fasst Posten gleichen Namens zusammen und zählt denselben Inhalt nicht doppelt', () => {
    const verzeichnis = { eintraege: ['ab'] };
    abmeldungen.push(posten('Suchverzeichnis', () => verzeichnis));
    abmeldungen.push(posten('Suchverzeichnis', () => verzeichnis));
    // Objekt 32 + Liste 32 + „ab“ 26 = 90.
    expect(erstelleSpeicherbericht().posten).toEqual([
      { name: 'Suchverzeichnis', bytes: 90, zeichen: 2 },
    ]);
  });
});

describe('Fensterbestand', () => {
  it('zählt geladene Gesetze nach Zustand und schätzt jedes einzeln', () => {
    const a = gesetzMitNormen('A', 3);
    const b = gesetzMitNormen('B', 1);
    abmeldungen.push(
      fensterbestand([
        { gesetz: a, zustand: 'in Tabs' },
        { gesetz: b, zustand: 'vorgeladen' },
      ]),
    );
    const [bestand] = erstelleSpeicherbericht().fensterbestaende;
    expect(bestand?.fenstertyp).toBe('hauptfenster');
    expect(bestand?.anzahl).toEqual({ gesamt: 2, 'in Tabs': 1, vorgeladen: 1, behalten: 0 });
    expect(bestand?.gesetze.map((g) => [g.gesetz, g.zustand, g.elemente])).toEqual([
      ['A (de-bund)', 'in Tabs', 3],
      ['B (de-bund)', 'vorgeladen', 1],
    ]);
    const [ga, gb] = bestand?.gesetze ?? [];
    expect(ga?.bytes).toBeGreaterThan(gb?.bytes ?? Infinity);
    expect(ga?.zeichen).toBeGreaterThan(0);
    expect(bestand?.bytes).toBe((ga?.bytes ?? 0) + (gb?.bytes ?? 0));
  });

  it('vergisst einen abgemeldeten Fensterbestand', () => {
    fensterbestand([])();
    expect(erstelleSpeicherbericht().fensterbestaende).toEqual([]);
  });
});

describe('Gesetzestextansichten', () => {
  it('zählt DOM-Knoten, Sichtbarkeit, Bereithaltungskosten und Messzwischenspeicher je Ansicht', () => {
    const a = gesetzMitNormen('A', 3);
    const b = gesetzMitNormen('B', 2);
    ansicht('v1', a);
    ansicht('v2', b, () => ({
      grenze: 20_000,
      spalten: { eintraege: 2, zeichen: 10 },
      zeilen: { eintraege: 1, zeichen: 100 },
    }));
    ansichtImDom('v1', 4);
    ansichtImDom('v2', 2, true);
    abmeldungen.push(
      meldeSpeicherauskunft({
        art: 'bereithaltung',
        liefere: () => ({
          budget: 100,
          vorgabe: 100,
          ansichten: [
            { gesetz: a, kosten: 3 },
            { gesetz: b, kosten: 2 },
          ],
        }),
      }),
    );
    const bericht = erstelleSpeicherbericht();
    expect(
      bericht.ansichten.map((x) => [x.gesetz, x.aktiv, x.domKnoten, x.bereithaltungskosten]),
    ).toEqual([
      ['A (de-bund)', true, 5, 3],
      ['B (de-bund)', false, 3, 2],
    ]);
    // Je Eintrag Zeichen × 2 (Obergrenze UTF-16) + 64 Verwaltung: (10 + 100) × 2 + 3 × 64 = 412.
    expect(bericht.ansichten[1]?.messzwischenspeicher).toMatchObject({
      spalten: { eintraege: 2 },
      zeilen: { eintraege: 1 },
      bytes: 412,
    });
    expect(bericht.bereithaltung).toEqual({ kostenBereitgehalten: 2, budget: 100, vorgabe: 100 });
    // Wurzel und Hüllen gehören nicht zu den Ansichten: body, 2 section, Knoten 5 + 3.
    expect(bericht.dom.inAnsichten).toBe(8);
    expect(bericht.dom.gesamt).toBe(document.getElementsByTagName('*').length);
  });

  it('kennzeichnet Bereithaltungskosten ohne Bereithaltungsbuchhaltung als unbekannt', () => {
    ansicht('v1', gesetzMitNormen('A', 3));
    ansichtImDom('v1', 1);
    const bericht = erstelleSpeicherbericht();
    expect(bericht.ansichten[0]?.bereithaltungskosten).toBeUndefined();
    expect(bericht.bereithaltung.budget).toBeUndefined();
  });

  it('übergeht gemeldete Ansichten, die nicht mehr im Dokument stehen', () => {
    ansicht('weg', gesetzMitNormen('A', 1));
    expect(erstelleSpeicherbericht().ansichten).toEqual([]);
  });

  it('rechnet Gesetzesdaten, die Ansicht und Fensterbestand teilen, nur einmal', () => {
    const a = gesetzMitNormen('A', 3);
    abmeldungen.push(fensterbestand([{ gesetz: a, zustand: 'in Tabs' }]));
    ansicht('v1', a);
    ansichtImDom('v1', 1);
    const bericht = erstelleSpeicherbericht();
    expect(bericht.summeBytes).toBe(
      (bericht.fensterbestaende[0]?.bytes ?? 0) +
        (bericht.ansichten[0]?.messzwischenspeicher?.bytes ?? 0),
    );
  });
});

describe('JS-Heap', () => {
  it('meldet fehlende Heapangabe der WebView als nicht verfügbar', () => {
    expect(erstelleSpeicherbericht().heap).toEqual({ verfuegbar: false });
  });

  it('übernimmt performance.memory, wo die WebView es anbietet', () => {
    vi.stubGlobal('performance', {
      ...performance,
      memory: { usedJSHeapSize: 30, totalJSHeapSize: 50, jsHeapSizeLimit: 100 },
    });
    expect(erstelleSpeicherbericht().heap).toEqual({
      verfuegbar: true,
      belegt: 30,
      reserviert: 50,
      grenze: 100,
    });
  });
});

describe('Konsolenausgabe', () => {
  it('stellt speicherbericht() bereit und gibt Abschnitte mit Kennzeichnung der Schätzungen aus', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const tabelle = vi.spyOn(console, 'table').mockImplementation(() => {});
    abmeldungen.push(fensterbestand([{ gesetz: gesetzMitNormen('A', 2), zustand: 'behalten' }]));
    richteMesskonsoleEin();
    expect(globalThis.speicherbericht?.()).toMatchObject({ heap: { verfuegbar: false } });
    const zeilen = info.mock.calls.map(([text]) => String(text));
    expect(zeilen).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\[speicher\] JS-Heap: von dieser WebView nicht bereitgestellt/),
        expect.stringMatching(
          /^\[speicher\] Fensterbestand hauptfenster: 1 Gesetze geladen \(0 in Tabs, 0 vorgeladen, 1 behalten\); Schätzung \d+\.\d MB/,
        ),
        expect.stringMatching(/^\[speicher\] Gesetzestextansichten: 0 aufgebaut/),
        expect.stringMatching(/^\[speicher\] Summe der Schätzungen: \d+\.\d MB/),
      ]),
    );
    expect(tabelle).toHaveBeenCalled();
  });

  it('richtet im Produktionszweig nichts ein und fragt keine angemeldeten Auskünfte ab', () => {
    vi.stubEnv('DEV', false);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const liefere = vi.fn(() => ({ fenstertyp: 'hauptfenster', gesetze: [] }));
    const messstand = vi.fn(leererMessstand);
    const beobachter = vi.fn();
    meldeSpeicherauskunft({ art: 'fensterbestand', liefere })();
    meldeSpeicherauskunft({ art: 'posten', name: 'Probe', liefere })();
    ansicht('v', gesetzMitNormen('A', 1), messstand);
    ansichtImDom('v', 1);
    beobachteTestweisesBereithaltungsbudget(beobachter)();
    richteMesskonsoleEin();
    gibSpeicherberichtAus();
    expect('speicherbericht' in globalThis).toBe(false);
    expect('bereithaltungsbudget' in globalThis).toBe(false);
    expect(holeTestweisesBereithaltungsbudget()).toBeUndefined();
    expect(liefere).not.toHaveBeenCalled();
    expect(messstand).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
});

describe('testweises Tab-Bereithaltungsbudget', () => {
  const bereithaltung = (budget: number) =>
    meldeSpeicherauskunft({
      art: 'bereithaltung',
      liefere: () => ({ budget, vorgabe: 5678, ansichten: [] }),
    });

  it('setzt mit bereithaltungsbudget(n) ein testweises Budget und ohne Wert wieder die Vorgabe', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const beobachter = vi.fn();
    abmeldungen.push(beobachteTestweisesBereithaltungsbudget(beobachter));
    abmeldungen.push(bereithaltung(5678));
    richteMesskonsoleEin();
    expect(holeTestweisesBereithaltungsbudget()).toBeUndefined();
    globalThis.bereithaltungsbudget?.(11356);
    expect(holeTestweisesBereithaltungsbudget()).toBe(11356);
    expect(beobachter).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /^\[speicher\] Tab-Bereithaltungsbudget testweise 11356 \(Vorgabe 5678\)/,
      ),
    );
    globalThis.bereithaltungsbudget?.();
    expect(holeTestweisesBereithaltungsbudget()).toBeUndefined();
    expect(beobachter).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenLastCalledWith(
      '[speicher] Tab-Bereithaltungsbudget zurückgesetzt auf die Vorgabe 5678',
    );
  });

  it('weist ungültige Werte zurück und behält das bisherige Budget', () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    richteMesskonsoleEin();
    globalThis.bereithaltungsbudget?.(100);
    for (const wert of [-1, Number.NaN, Infinity, '200'])
      Reflect.apply(globalThis.bereithaltungsbudget ?? (() => {}), undefined, [wert]);
    expect(holeTestweisesBereithaltungsbudget()).toBe(100);
    expect(warnung).toHaveBeenCalledTimes(4);
  });

  it('kennzeichnet ein testweises Budget im Speicherbericht', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    richteMesskonsoleEin();
    globalThis.bereithaltungsbudget?.(11356);
    abmeldungen.push(bereithaltung(11356));
    gibSpeicherberichtAus();
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('von 11356 (Tab-Bereithaltungsbudget, testweise; Vorgabe 5678)'),
    );
  });
});
