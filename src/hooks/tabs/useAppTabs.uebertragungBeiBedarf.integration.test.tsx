// @vitest-environment jsdom
// Echte Tabs und Persistenz; nur die native Dateisystem-/Ereignisgrenze ist simuliert.
import { nativeAttrappeZuruecksetzen, io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useLayoutEffect } from 'react';
import { assert, beforeEach, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useAppTabs } from './useAppTabs';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
const dom = domTestWurzel();
const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
let tabs: ReturnType<typeof useAppTabs>;
const ersteTextanzeigen: { id: string; offset?: number; aktivesElementId?: string | null }[] = [];
function Probe() {
  const zustand = useAppTabs();
  useLayoutEffect(() => {
    tabs = zustand;
    for (const tab of zustand.tabs) {
      if (
        tab.ladezustand !== 'geladen' ||
        !tab.gesetzesreferenz ||
        ersteTextanzeigen.some((a) => a.id === tab.id)
      )
        continue;
      const key = tab.id + '-' + gesetzesreferenzSchluessel(tab.gesetzesreferenz);
      ersteTextanzeigen.push({
        id: tab.id,
        offset: zustand.scrollPositionenRef.current[key]?.offset,
        aktivesElementId: zustand.einklappZustandRef.current[key]?.aktivesElementId,
      });
    }
  });
  return (
    <output>
      {zustand.tabs.map((t) => `${t.gesetzesreferenz?.kurztitel}:${t.ladezustand}`).join('|')}
    </output>
  );
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  ersteTextanzeigen.length = 0;
  localStorage.clear();
  io.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz version="1"><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  await act(async () => dom.root.render(<Probe />));
});
it.each([false, true])(
  'übernimmt die XML-Ansicht vor der ersten geladenen Anzeige (anhängen=%s)',
  async (anhaengen) => {
    let fertig = () => {};
    const warten = new Promise<void>((resolve) => {
      fertig = resolve;
    });
    io.vorLesen = (pfad) => (pfad.endsWith('/gesetze/BGB_de-bund.xml') ? warten : undefined);
    await act(async () => {
      expect(
        await tabs.tabAusUebertragungUebernehmen(
          {
            gesetzesreferenz: referenz,
            scrollPosition: { index: 0, offset: 31 },
            einklappZustand: {
              ueberschriftenXmlId: [],
              normenXmlId: ['p1'],
              aktivesElementXmlId: 'p1',
            },
            verlauf: { eintraege: [{ gesetzesreferenz: referenz, xmlId: 'p1' }], position: 0 },
          },
          anhaengen,
        ),
      ).toBe(true);
    });
    const tab = tabs.tabsRef.current.find((t) => t.gesetzesreferenz);
    assert(tab);
    expect(tab.ladezustand).toBe('ladend');
    expect(dom.host.textContent).toContain('BGB:ladend');
    expect(tabs.holeTabGesetz(tab)).toBeUndefined();
    expect(tab.ausstehendeAnsicht).toBeDefined();
    await act(async () => {
      fertig();
      await tabs.ladeGesetz(referenz);
    });
    const geladen = tabs.tabsRef.current.find((t) => t.id === tab.id);
    assert(geladen);
    expect(geladen.ladezustand).toBe('geladen');
    expect(geladen.ausstehendeAnsicht).toBeUndefined();
    const element = tabs.holeTabGesetz(geladen)?.elemente[0];
    assert(element);
    expect(ersteTextanzeigen.find((a) => a.id === tab.id)).toEqual({
      id: tab.id,
      offset: 31,
      aktivesElementId: element.data.id,
    });
    const key = tab.id + '-' + gesetzesreferenzSchluessel(referenz);
    expect(tabs.scrollPositionenRef.current[key]).toEqual({ index: 0, offset: 31 });
    expect(tabs.einklappZustandRef.current[key]).toEqual({
      ueberschriften: new Set(),
      normen: new Set([element.data.id]),
      aktivesElementId: element.data.id,
    });
    expect(tabs.verlaufLesen(tab.id)?.eintraege).toEqual([
      { gesetzesreferenz: referenz, xmlId: 'p1' },
    ]);
  },
);
it.each(['fehlt', 'unbekannt'])(
  'lehnt die Übernahme bei %s ohne Tabänderung ab',
  async (status) => {
    if (status === 'fehlt') io.dateien.clear();
    else {
      const original = io.invoke.getMockImplementation();
      assert(original);
      io.invoke.mockImplementation((name, args) => {
        if (name === 'gesetz_dateistempel_lesen') throw new Error('nicht lesbar');
        return original(name, args);
      });
    }
    const vorher = tabs.tabsRef.current;
    await act(async () => {
      expect(await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz: referenz })).toBe(false);
    });
    expect(tabs.tabsRef.current).toBe(vorher);
  },
);
it.each(['ladend', 'fehlt', 'nicht-lesbar'] as const)(
  'kopiert einen %s Tab als Referenz ohne Ansichtszustand',
  async (ladezustand) => {
    act(() => tabs.setTabs([{ id: 'quelle', gesetzesreferenz: referenz, ladezustand }]));
    expect(tabs.tabFuerUebertragungKopieren('quelle')).toMatchObject({
      gesetzesreferenz: referenz,
    });
    expect(tabs.tabFuerUebertragungKopieren('quelle')?.scrollPosition).toBeUndefined();
    expect(tabs.tabFuerUebertragungKopieren('quelle')?.verlauf).toBeUndefined();
  },
);

it('lädt bei Änderungsereignissen nur betroffene geladene Gesetze und schließt gelöschte Tabs', async () => {
  const datei = io.dateien.get('gesetze/BGB_de-bund.xml');
  assert(datei);
  const zpo = { kurztitel: 'ZPO', normgeber: 'de-bund' };
  const stgb = { kurztitel: 'StGB', normgeber: 'de-bund' };
  io.dateien.set('gesetze/ZPO_de-bund.xml', datei.replaceAll('BGB', 'ZPO'));
  io.dateien.set('gesetze/StGB_de-bund.xml', datei.replaceAll('BGB', 'StGB'));
  await act(async () => {
    await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz: referenz });
    await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz: zpo }, true);
    await tabs.ladeGesetz(referenz);
    await tabs.ladeGesetz(zpo);
  });
  const unveraendert = tabs.holeGeladenes(zpo);
  const zugriffe: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) zugriffe.push(pfad);
    return undefined;
  };
  io.dateien.set('gesetze/BGB_de-bund.xml', datei.replace('>Text<', '>Neu<'));
  await act(async () => {
    await sendeGlobal('gesetze-geaendert', [referenz, stgb]);
    await tabs.ladeGesetz(referenz);
  });
  expect(zugriffe).toEqual(['/daten/LexLata/gesetze/BGB_de-bund.xml']);
  expect(tabs.holeGeladenes(stgb)).toBeUndefined();
  expect(tabs.holeGeladenes(zpo)).toBe(unveraendert);
  const tab = tabs.tabsRef.current.find((t) => t.gesetzesreferenz?.kurztitel === 'BGB');
  assert(tab);
  expect(JSON.stringify(tabs.holeTabGesetz(tab))).toContain('Neu');
  expect(tab.reloadVersion).toBe(1);
  await act(async () => {
    await sendeGlobal('gesetze-geloescht', [referenz]);
  });
  expect(tabs.tabsRef.current.map((t) => t.gesetzesreferenz)).toEqual([zpo]);
  expect(tabs.holeGeladenes(referenz)).toBeUndefined();
  expect(zugriffe).toHaveLength(1);
});

it('behält die ausstehende XML-Ansicht nach einem Lesefehler bis zum gültigen Ladeabschluss', async () => {
  const datei = io.dateien.get('gesetze/BGB_de-bund.xml');
  assert(datei);
  io.dateien.set('gesetze/BGB_de-bund.xml', 'beschädigt');
  await act(async () => {
    await tabs.tabAusUebertragungUebernehmen({
      gesetzesreferenz: referenz,
      scrollPosition: { index: 0, offset: 27 },
    });
    await tabs.ladeGesetz(referenz);
  });
  const id = tabs.aktiverTabIdRef.current;
  assert(id);
  expect(tabs.tabsRef.current.find((t) => t.id === id)?.ladezustand).toBe('nicht-lesbar');
  io.dateien.set('gesetze/BGB_de-bund.xml', datei);
  await act(async () => {
    await tabs.ladeGesetz(referenz);
  });
  expect(tabs.tabsRef.current.find((t) => t.id === id)?.ladezustand).toBe('geladen');
  expect(tabs.scrollPositionenRef.current[id + '-' + gesetzesreferenzSchluessel(referenz)]).toEqual(
    { index: 0, offset: 27 },
  );
});

it('gibt nach bestätigter lokaler Löschung den Bestand auch ohne zugestelltes Ereignis frei', async () => {
  await act(async () => {
    await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz: referenz });
    await tabs.ladeGesetz(referenz);
  });
  expect(tabs.holeGeladenes(referenz)).toBeDefined();
  await act(async () => {
    tabs.gesetzeTabsSchliessen([referenz]);
  });
  expect(tabs.holeGeladenes(referenz)).toBeUndefined();
  expect(tabs.tabsRef.current.some((t) => t.gesetzesreferenz)).toBe(false);
});

it.each(['Löschung', 'erneuter Änderung'])(
  'übernimmt nach %s von A kein altes A-Ergebnis aus dem noch auf B wartenden Ereignis',
  async (folge) => {
    const datei = io.dateien.get('gesetze/BGB_de-bund.xml');
    assert(datei);
    const zpo = { kurztitel: 'ZPO', normgeber: 'de-bund' };
    io.dateien.set('gesetze/ZPO_de-bund.xml', datei.replaceAll('BGB', 'ZPO'));
    await act(async () => {
      await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz: referenz });
      await tabs.tabAusUebertragungUebernehmen({ gesetzesreferenz: zpo }, true);
      await tabs.ladeGesetz(referenz);
      await tabs.ladeGesetz(zpo);
    });
    let weiter = () => {};
    const warten = new Promise<void>((resolve) => {
      weiter = resolve;
    });
    io.vorLesen = (pfad) => (pfad.endsWith('/gesetze/ZPO_de-bund.xml') ? warten : undefined);
    io.dateien.set('gesetze/BGB_de-bund.xml', datei.replace('>Text<', '>A zuerst<'));
    io.dateien.set(
      'gesetze/ZPO_de-bund.xml',
      datei.replaceAll('BGB', 'ZPO').replace('>Text<', '>B neu<'),
    );
    await act(async () => {
      await sendeGlobal('gesetze-geaendert', [referenz, zpo]);
      await tabs.ladeGesetz(referenz);
    });
    expect(JSON.stringify(tabs.holeGeladenes(referenz))).toContain('A zuerst');
    await act(async () => {
      if (folge === 'Löschung') {
        io.dateien.delete('gesetze/BGB_de-bund.xml');
        await sendeGlobal('gesetze-geloescht', [referenz]);
      } else {
        io.dateien.set('gesetze/BGB_de-bund.xml', datei.replace('>Text<', '>A zuletzt<'));
        await sendeGlobal('gesetze-geaendert', [referenz]);
        await tabs.ladeGesetz(referenz);
      }
    });
    const aktuellesA = tabs.holeGeladenes(referenz);
    if (folge === 'Löschung') expect(aktuellesA).toBeUndefined();
    else expect(JSON.stringify(aktuellesA)).toContain('A zuletzt');
    await act(async () => {
      weiter();
      await tabs.ladeGesetz(zpo);
    });
    expect(tabs.holeGeladenes(referenz)).toBe(aktuellesA);
    expect(JSON.stringify(tabs.holeGeladenes(zpo))).toContain('B neu');
    expect(tabs.holeGeladenes(referenz)).toBe(aktuellesA);
  },
);
