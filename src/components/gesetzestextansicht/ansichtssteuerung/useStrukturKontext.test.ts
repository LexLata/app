import { describe, it, expect, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import {
  berechneSichtbarenKontextPfad,
  type KontextEintrag,
  type VirtualItemAusschnitt,
} from './useStrukturKontext.helpers';
import { useStrukturKontext } from './useStrukturKontext';
import type { UeberschriftDarstellung } from '@/lib/domain/gesetzTypes';

// zeilenHoehe für schrift=16, siehe geschaetzteEintragHoehe (privat):
// Math.round(16 * 0.85 * 1.2) + 4 = 20
const SCHRIFT = 16;
const ZEILENHOEHE = 20;

function eintrag(id: string, ebene: number, index: number): KontextEintrag {
  return {
    ueberschrift: {
      id,
      xmlId: id,
      bezeichnung: `Titel ${id}`,
      ebene,
      gliederungskennzahl: '000000',
    } as UeberschriftDarstellung,
    ebene,
    index,
  };
}

function item(index: number, start: number, size: number): VirtualItemAusschnitt {
  return { index, start, size };
}

describe('berechneSichtbarenKontextPfad', () => {
  it('gibt vorherigePfad unverändert zurück, wenn kein firstVisibleEintrag vorliegt', () => {
    const vorherigePfad = [eintrag('a', 1, 0)];
    const ergebnis = berechneSichtbarenKontextPfad(vorherigePfad, null, [], 0, SCHRIFT);
    expect(ergebnis).toEqual(vorherigePfad);
  });

  it('gibt vorherigePfad unverändert zurück, wenn kein VirtualItem zum Index existiert', () => {
    const vorherigePfad = [eintrag('a', 1, 0)];
    const kandidat = eintrag('b', 2, 5);
    const ergebnis = berechneSichtbarenKontextPfad(
      vorherigePfad,
      kandidat,
      [item(0, 0, 100)], // enthält Index 5 nicht
      0,
      SCHRIFT,
    );
    expect(ergebnis).toEqual(vorherigePfad);
  });

  it('nimmt den Kandidaten NICHT auf, solange sein eigenes Wachstum ihn noch nicht verdrängen würde', () => {
    const kandidat = eintrag('b', 2, 1);
    // item.start + item.size = 120 > contentOffset + zeilenHoehe (= 20) -> (noch) nicht verdrängt
    const ergebnis = berechneSichtbarenKontextPfad([], kandidat, [item(1, 20, 100)], 0, SCHRIFT);
    expect(ergebnis).toEqual([]);
  });

  it('nimmt den Kandidaten auf, sobald item.start+size <= contentOffset+zeilenHoehe (Grenzfall inklusive)', () => {
    const kandidat = eintrag('b', 2, 1);
    // item.start + item.size = ZEILENHOEHE = contentOffset + zeilenHoehe -> Grenzfall, <= erfüllt
    const ergebnis = berechneSichtbarenKontextPfad(
      [],
      kandidat,
      [item(1, 3, ZEILENHOEHE - 3)],
      0,
      SCHRIFT,
    );
    expect(ergebnis).toEqual([kandidat]);
  });

  it('bereitsAlsAktivBestaetigt=true überspringt die geometrische Prüfung und nimmt sofort auf', () => {
    const kandidat = eintrag('b', 2, 1);
    // Geometrisch NICHT verdrängt (item.start+size=500 >> 20), aber Sticky-Flag erzwingt Aufnahme
    const ergebnis = berechneSichtbarenKontextPfad(
      [],
      kandidat,
      [item(1, 400, 100)],
      0,
      SCHRIFT,
      true,
    );
    expect(ergebnis).toEqual([kandidat]);
  });

  it('entfernt beim Aufnehmen alle Einträge aus vorherigePfad mit ebene >= Kandidat-ebene (gleichrangig/tiefer)', () => {
    const flacher = eintrag('flach', 1, 0); // Ebene 1 < 2 -> bleibt erhalten
    const gleichrangig = eintrag('gleich', 2, 1); // Ebene 2 >= 2 -> wird entfernt
    const kandidat = eintrag('neu', 2, 2);
    const ergebnis = berechneSichtbarenKontextPfad(
      [flacher, gleichrangig],
      kandidat,
      [item(2, 3, 17)], // verdrängt (start+size=20 <= 0+20)
      0,
      SCHRIFT,
    );
    expect(ergebnis).toEqual([flacher, kandidat]);
  });

  it('behält tiefere Vorfahren, deren Ebene echt kleiner als der Kandidat ist', () => {
    const ebene1 = eintrag('e1', 1, 0);
    const ebene2 = eintrag('e2', 2, 1);
    const kandidatEbene3 = eintrag('e3', 3, 2);
    const ergebnis = berechneSichtbarenKontextPfad(
      [ebene1, ebene2],
      kandidatEbene3,
      [item(2, 3, 17)],
      0,
      SCHRIFT,
    );
    expect(ergebnis).toEqual([ebene1, ebene2, kandidatEbene3]);
  });

  it('mutiert vorherigePfad nicht (gibt bei Nicht-Aufnahme eine Kopie zurück)', () => {
    const vorherigePfad = [eintrag('a', 1, 0)];
    const kandidat = eintrag('b', 2, 1);
    const ergebnis = berechneSichtbarenKontextPfad(
      vorherigePfad,
      kandidat,
      [item(1, 400, 100)], // nicht verdrängt
      0,
      SCHRIFT,
    );
    expect(ergebnis).not.toBe(vorherigePfad);
    expect(vorherigePfad).toEqual([eintrag('a', 1, 0)]);
  });
});

it('optionaler innerer Beobachter meldet denselben negativen Restoreabstand', async () => {
  const { window } = parseHTML('<html><body><div></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(window.document.body.firstElementChild!);
  const beobachter = vi.fn();
  function Probe() {
    useStrukturKontext({
      stand: {
        scrollTop: 2030,
        viewportHoehe: 400,
        sichtbarkeitsliste: [],
        zeilen: [item(0, 0, 1000), item(1, 1000, 1000), item(2, 2000, 1000)],
      },
      sichtbareElemente: [],
      schrift: SCHRIFT,
      scrollMargin: 40,
      echteHoeheRef: { current: 60 },
      auftragAktiv: false,
      setKontextPfad: () => {},
      onFirstVisible: beobachter,
    });
    return null;
  }
  try {
    await act(async () => root.render(createElement(Probe)));
    expect(beobachter).toHaveBeenLastCalledWith(2, -10);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each([0.7, 0.85, 1])('Vorausschauschwelle folgt Faktor %s', (faktor) => {
  const kandidat = eintrag('b', 2, 1);
  const hoehe = Math.round(16 * faktor * 1.2) + 4;
  expect(
    berechneSichtbarenKontextPfad([], kandidat, [item(1, 0, hoehe)], 0, 16, false, faktor),
  ).toEqual([kandidat]);
  expect(
    berechneSichtbarenKontextPfad([], kandidat, [item(1, 0, hoehe + 1)], 0, 16, false, faktor),
  ).toEqual([]);
});

it('Größenwechsel bewertet bestätigten Index ohne Scroll neu; normales Aufwärtsscrollen bleibt stabil', async () => {
  const { window } = parseHTML('<html><body><div></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(window.document.body.firstElementChild!);
  const kandidat = eintrag('b', 1, 0);
  const elemente = [{ typ: 'ueberschrift' as const, data: kandidat.ueberschrift! }];
  let stand = {
    scrollTop: 0,
    viewportHoehe: 400,
    sichtbarkeitsliste: [],
    zeilen: [item(0, 0, 20)],
  };
  let faktor = 0.85;
  let pfad: KontextEintrag[] = [];
  const setPfad = vi.fn((update: React.SetStateAction<KontextEintrag[]>) => {
    pfad = typeof update === 'function' ? update(pfad) : update;
  });
  const echteHoeheRef = { current: 0 };
  function Probe() {
    useStrukturKontext({
      stand,
      sichtbareElemente: elemente,
      schrift: 16,
      skalierung: faktor,
      scrollMargin: 0,
      echteHoeheRef,
      auftragAktiv: false,
      setKontextPfad: setPfad,
    });
    return null;
  }
  try {
    await act(async () => root.render(createElement(Probe)));
    expect(pfad).toEqual([kandidat]);
    faktor = 0.7;
    await act(async () => root.render(createElement(Probe)));
    expect(pfad).toEqual([]);
    faktor = 1;
    await act(async () => root.render(createElement(Probe)));
    expect(pfad).toEqual([kandidat]);
    // Eintritt von unten in eine längere (ggf. mehrzeilige) Überschrift.
    stand = { ...stand, scrollTop: 80, zeilen: [item(0, 0, 100)] };
    await act(async () => root.render(createElement(Probe)));
    expect(pfad).toEqual([kandidat]);
    stand = { ...stand, scrollTop: 10 };
    await act(async () => root.render(createElement(Probe)));
    expect(pfad).toEqual([kandidat]);
    faktor = 0.7;
    await act(async () => root.render(createElement(Probe)));
    expect(pfad).toEqual([]);
    // Abwärts über die neue Schwelle: geometrische Aufnahme funktioniert wieder.
    stand = { ...stand, scrollTop: 83 };
    await act(async () => root.render(createElement(Probe)));
    expect(pfad).toEqual([kandidat]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('berechnet nur bei Messstand, Struktur, Schrift, Skalierung oder Auftragswechsel neu', async () => {
  const { window } = parseHTML('<html><body><div></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(window.document.body.firstElementChild!);
  const setzen = vi.fn();
  let params = {
    stand: { scrollTop: 0, viewportHoehe: 400, sichtbarkeitsliste: [], zeilen: [item(0, 0, 100)] },
    sichtbareElemente: [] as Parameters<typeof useStrukturKontext>[0]['sichtbareElemente'],
    schrift: 16,
    skalierung: 0.85,
    scrollMargin: 0,
    echteHoeheRef: { current: 0 },
    auftragAktiv: false,
    setKontextPfad: setzen,
    onFirstVisible: vi.fn(),
  };
  function Probe() {
    useStrukturKontext(params);
    return null;
  }
  const rendern = () => act(async () => root.render(createElement(Probe)));
  try {
    await rendern();
    expect(setzen).toHaveBeenCalledTimes(1);
    params = {
      ...params,
      onFirstVisible: vi.fn(),
      setKontextPfad: vi.fn(),
      echteHoeheRef: { current: 0 },
      scrollMargin: 10,
    };
    await rendern();
    expect(params.setKontextPfad).not.toHaveBeenCalled();
    expect(params.onFirstVisible).not.toHaveBeenCalled();
    for (const aenderung of [
      { stand: { ...params.stand } },
      { sichtbareElemente: [] },
      { schrift: 18 },
      { skalierung: 1 },
      { auftragAktiv: true },
      { auftragAktiv: false },
    ]) {
      const vorher = params.setKontextPfad.mock.calls.length;
      params = { ...params, ...aenderung };
      await rendern();
      expect(params.setKontextPfad).toHaveBeenCalledTimes(vorher + (params.auftragAktiv ? 0 : 1));
    }
    expect(params.onFirstVisible).toHaveBeenLastCalledWith(0, -10);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
