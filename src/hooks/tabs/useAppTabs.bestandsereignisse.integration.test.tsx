// @vitest-environment jsdom
// Echte Einzel- und Sammelwege: Tabstellen werden vor dem ersten Bestandsaustausch gesichert.
import { nativeAttrappeZuruecksetzen, io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useLayoutEffect } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useAppTabs } from './useAppTabs';
import { useGesetzVerwaltung } from './useGesetzVerwaltung';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
const dom = domTestWurzel();
const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
let zustand: ReturnType<typeof useAppTabs> & ReturnType<typeof useGesetzVerwaltung>;
function Probe() {
  const tabs = useAppTabs();
  const verwaltung = useGesetzVerwaltung(tabs);
  useLayoutEffect(() => {
    zustand = { ...tabs, ...verwaltung };
  });
  return (
    <output>
      {tabs.tabs
        .map((tab) => `${tab.id}:${tab.reloadVersion ?? 0}:${tab.initialNorm ?? ''}`)
        .join('|')}
    </output>
  );
}
function xml(text = 'Alt') {
  return `<gesetz version="1"><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt>${['p1', 'p2'].map((id) => `<norm id="${id}"><bezeichnung>§ ${id.slice(1)}</bezeichnung><titel>Amtlicher Titel</titel><text><absatz>${text}</absatz></text></norm>`).join('')}</inhalt></gesetz>`;
}
function sperre() {
  let freigeben = () => {};
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  return { warten, freigeben };
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  io.dateien.set('gesetze/BGB_de-bund.xml', xml());
  await act(async () => dom.root.render(<Probe />));
  await act(async () => {
    await zustand.ladeGesetz(referenz);
  });
});
it.each([true, false])(
  'sichert beide eigenen Tabstellen vor dem früher fertigen Einzelzugriff (geändert=%s)',
  async (geaendert) => {
    const reloadVersion = Number(geaendert);
    const initialNorm = (xmlId: string | undefined) => (geaendert ? xmlId : undefined);
    const gesetz = zustand.holeGeladenes(referenz);
    assert(gesetz);
    let ids: string[] = [];
    await act(async () => {
      ids = [
        zustand.gesetzOeffnen(gesetz, undefined, 'immer-neu'),
        zustand.gesetzOeffnen(gesetz, undefined, 'immer-neu'),
      ];
      zustand.setTabs((tabs) =>
        tabs
          .filter((tab) => ids.includes(tab.id))
          .map((tab) => ({ ...tab, initialNorm: undefined })),
      );
    });
    const vorher = ids.map((id, index) => {
      const element = gesetz.elemente[index];
      assert(element);
      const key = id + '-' + gesetzesreferenzSchluessel(referenz);
      const klappen = {
        aktivesElementId: element.data.id,
        normen: new Set([element.data.id]),
        ueberschriften: new Set<string>(),
      };
      zustand.einklappZustandRef.current[key] = klappen;
      zustand.scrollPositionenRef.current[key] = { index, offset: 17 };
      return { id, key, klappen, xmlId: element.data.xmlId };
    });
    io.dateien.set('gesetze/BGB_de-bund.xml', xml(geaendert ? 'Neu' : 'Alt'));
    const sammelweg = sperre();
    let zugriffe = 0;
    io.vorLesen = (pfad) => {
      if (!pfad.endsWith('/gesetze/BGB_de-bund.xml')) return;
      if (++zugriffe === 2) return sammelweg.warten;
    };
    try {
      await act(async () => {
        await sendeGlobal('gesetze-geaendert', [referenz]);
        // Unabhängiger alter Verbraucher fordert weiterhin ausdrücklich die Liste an.
        void zustand.gleicheGesetzeAb();
        await vi.waitFor(() => expect(zugriffe).toBe(2));
      });
      // Der Sammelweg wartet noch; sämtliche Änderungen müssen bereits der Einzelweg sichern.
      for (const { id, key, klappen, xmlId } of vorher) {
        const tab = zustand.tabs.find((t) => t.id === id);
        assert(tab);
        expect(JSON.stringify(zustand.holeTabGesetz(tab))).toContain(geaendert ? 'Neu' : 'Alt');
        expect(tab.reloadVersion ?? 0).toBe(reloadVersion);
        expect(tab.initialNorm).toBe(initialNorm(xmlId));
        if (geaendert) {
          expect(zustand.einklappZustandRef.current[key]).toBeUndefined();
          expect(zustand.scrollPositionenRef.current[key]).toBeUndefined();
        } else {
          expect(zustand.holeTabGesetz(tab)).toBe(gesetz);
          expect(zustand.einklappZustandRef.current[key]).toBe(klappen);
          expect(zustand.scrollPositionenRef.current[key]).toEqual({
            index: vorher.findIndex((p) => p.id === id),
            offset: 17,
          });
        }
      }
      expect(dom.host.textContent).toContain(geaendert ? `${ids[1]}:1:p2` : `${ids[1]}:0:`);
    } finally {
      await act(async () => {
        sammelweg.freigeben();
        await zustand.gleicheGesetzeAb();
      });
    }
    for (const { id, xmlId } of vorher) {
      expect(zustand.tabs.find((t) => t.id === id)?.reloadVersion ?? 0).toBe(reloadVersion);
      expect(zustand.tabs.find((t) => t.id === id)?.initialNorm).toBe(
        geaendert ? xmlId : undefined,
      );
    }
  },
);
it('erhält bei Lesefehlern im Einzel- und Sammelweg die letzte brauchbare offene Ansicht', async () => {
  const gesetz = zustand.holeGeladenes(referenz);
  assert(gesetz);
  const element = gesetz.elemente[1];
  assert(element);
  let id = '';
  await act(async () => {
    id = zustand.gesetzOeffnen(gesetz, undefined, 'immer-neu');
    zustand.setTabs((tabs) => tabs.map((tab) => ({ ...tab, initialNorm: undefined })));
  });
  const key = id + '-' + gesetzesreferenzSchluessel(referenz);
  const klappen = {
    aktivesElementId: element.data.id,
    normen: new Set([element.data.id]),
    ueberschriften: new Set<string>(),
  };
  zustand.einklappZustandRef.current[key] = klappen;
  zustand.scrollPositionenRef.current[key] = { index: 1, offset: 17 };
  let zugriffe = 0;
  io.vorLesen = (pfad) => {
    if (pfad.endsWith('/gesetze/BGB_de-bund.xml')) {
      zugriffe++;
      throw new Error('Datei vorübergehend nicht lesbar');
    }
    return undefined;
  };
  await act(async () => {
    await sendeGlobal('gesetze-geaendert', [referenz]);
    await zustand.gleicheGesetzeAb();
  });
  expect(zugriffe).toBeGreaterThanOrEqual(2);
  const tab = zustand.tabs.find((t) => t.id === id);
  expect(zustand.holeTabGesetz(tab)).toBe(gesetz);
  expect(tab?.reloadVersion ?? 0).toBe(0);
  expect(tab?.initialNorm).toBeUndefined();
  expect(zustand.einklappZustandRef.current[key]).toBe(klappen);
  expect(zustand.scrollPositionenRef.current[key]).toEqual({ index: 1, offset: 17 });
});
