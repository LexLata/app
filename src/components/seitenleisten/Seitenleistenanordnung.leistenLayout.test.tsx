// @vitest-environment jsdom
// Seitenleistenanordnung.leistenLayout.test.tsx
// Charakterisiert beide Leisten mit echten adaptiven Berechnungen.
import { beginneScrollDiagnose } from '@/lib/utils/scrollAufzeichnungDiagnose';
import { Seitenleistenanordnung } from './Seitenleistenanordnung';
import { act } from 'react';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { Favoritenleiste } from './favoriten/Favoritenleiste';
import { Schnellaktionen, FavoritSchnellaktion, LesezeichenSchnellaktion } from './Schnellaktionen';
import { Seitenleiste } from './Seitenleiste';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import { UI_GROESSE_KEY } from '@/lib/einstellungen/einstellungen.index';
import { Lesezeichenleiste } from './lesezeichen/Lesezeichenleiste';
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
const h = domTestWurzel();
let hoehe = 1000;
let groessenBeobachter: (() => void)[] = [];
beforeEach(() => {
  groessenBeobachter = [];
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => hoehe);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0);
    return 1;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private fn: () => void) {
        groessenBeobachter.push(fn);
      }
      observe() {
        this.fn();
      }
      disconnect() {}
    },
  );
});
afterEach(() => vi.restoreAllMocks());
const aktionen = {
  onFavoritKlick: vi.fn(),
  gesetzOffen: true,
  favoritenleisteSichtbar: false,
  lesezeichen: [],
  onLesezeichenKlick: vi.fn(),
  kannZuklappen: true,
  onZuklappenKlick: vi.fn(),
  kannAufklappen: true,
  onAufklappenKlick: vi.fn(),
  onSucheKlick: vi.fn(),
};
for (const getauscht of [false, true]) {
  for (const seite of ['links', 'rechts'] as const) {
    for (const fall of [
      { hoehe: 1000, scroll: false, spalten: 1, zeilen: [20] },
      // 20 Zeilen, Mindesthöhe 12,1; Reserve links 150, rechts 30.
      { hoehe: 220, scroll: false, spalten: 2, zeilen: seite === 'links' ? [16, 4] : [9, 11] },
      { hoehe: 100, scroll: true, spalten: 1, zeilen: [20] },
    ]) {
      it(`${getauscht ? 'getauscht' : 'Standard'} ${seite}: ${fall.hoehe}px bewahrt Spaltenaufteilung, Reserve und Scrollen`, async () => {
        hoehe = fall.hoehe;
        const eintraege = Array.from({ length: 20 }, (_, i) => ({
          xmlId: String(i),
          bezeichnung: String(i),
        }));
        await act(async () =>
          h.root.render(
            (seite === 'rechts') !== getauscht ? (
              <Favoritenleiste
                gesetz={{ normgeber: 'DE', kurztitel: 'BGB' }}
                eintraege={eintraege}
                onKlick={vi.fn()}
                seite={seite}
                schnellaktionenAnzahl={seite === 'links' ? 5 : 1}
                schnellaktionen={
                  seite === 'links' ? (
                    <Schnellaktionen {...aktionen} leistenTauschen />
                  ) : (
                    <FavoritSchnellaktion {...aktionen} />
                  )
                }
              />
            ) : (
              <Lesezeichenleiste
                eintraege={eintraege
                  .slice(1)
                  .map((e) => ({ ...e, gesetz: { normgeber: 'DE', kurztitel: 'BGB' } }))}
                onKlick={vi.fn()}
                seitenleistenTastenkuerzel={true}
                seite={seite}
                schnellaktionenAnzahl={seite === 'links' ? 5 : 1}
                schnellaktionen={
                  seite === 'rechts' ? (
                    <LesezeichenSchnellaktion {...aktionen} />
                  ) : (
                    <Schnellaktionen {...aktionen} />
                  )
                }
              />
            ),
          ),
        );
        const rahmen = h.host.querySelector(`[data-einfuehrung-grenze="${seite}"]`);
        assert(rahmen);
        const inhalt = rahmen.querySelector<HTMLElement>(':scope > div');
        assert(inhalt);
        expect(inhalt.style.overflowY).toBe(fall.scroll ? 'auto' : 'hidden');
        expect(inhalt.style.flexDirection).toBe(fall.spalten === 1 ? 'column' : '');
        if (fall.spalten === 2) {
          const links = inhalt.children[0];
          const rechts = inhalt.children[2];
          assert(links);
          assert(rechts);
          const spalten = [links, rechts];
          expect(
            spalten.map(
              (s) =>
                Array.from(s.children).filter(
                  (e) => e.tagName === 'BUTTON' || e.textContent === 'BGB',
                ).length,
            ),
          ).toEqual(fall.zeilen);
          const aktionsSpalte = seite === 'links' ? rechts : links;
          expect(
            aktionsSpalte.querySelector(
              `[data-einfuehrung-ziel="${getauscht && seite === 'rechts' ? 'lesezeichen' : 'favorit'}"]`,
            ),
          ).not.toBeNull();
        }
      });
    }
  }
}

// Vollständige Höhen werden aus den ausgegebenen Zeilenstyles nachgerechnet.
for (const seite of ['links', 'rechts'] as const) {
  for (const containerHoehe of [508, 528]) {
    it(`${seite}: 60 Zeilen mit 20 zweizeiligen Köpfen bei ${containerHoehe}px`, async () => {
      hoehe = containerHoehe;
      const abstaende = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 6 : 0));
      const teilungen = Array.from({ length: 19 }, (_, i) => (i + 1) * 3);
      await act(async () =>
        h.root.render(
          <Seitenleiste
            seite={seite}
            anzahl={60}
            schnellaktionenAnzahl={5}
            schnellaktionen={<div />}
            layoutAngaben={{ erlaubteTeilungen: teilungen, zusatzabstaende: abstaende }}
            renderSpalte={(von, bis, lineHeight, paddingBlock) =>
              Array.from({ length: bis - von }, (_, i) => (
                <div
                  key={von + i}
                  data-zeile={von + i}
                  style={{ lineHeight, paddingBlock, marginTop: i === 0 ? 0 : abstaende[von + i] }}
                />
              ))
            }
          />,
        ),
      );
      const inhalt = h.host.querySelector<HTMLElement>('[data-einfuehrung-grenze] > div');
      assert(inhalt);
      expect(inhalt.style.overflowY).toBe(containerHoehe === 508 ? 'auto' : 'hidden');
      if (containerHoehe === 528) {
        const spalten = [inhalt.children[0], inhalt.children[2]];
        expect(
          spalten.map((s) => {
            assert(s);
            return s.querySelectorAll('[data-zeile]').length;
          }),
        ).toEqual(seite === 'rechts' ? [24, 36] : [36, 24]);
        spalten.forEach((spalte, i) => {
          assert(spalte);
          const zeilen = Array.from(spalte.querySelectorAll<HTMLElement>('[data-zeile]'));
          const gerendert = zeilen.reduce(
            (summe, zeile) =>
              summe +
              Number(zeile.style.lineHeight) * 11 +
              2 * parseFloat(zeile.style.paddingBlock) +
              parseFloat(zeile.style.marginTop),
            0,
          );
          // 5 Aktionen à 30px und die echte 1px-Trennlinie.
          const reserve = (seite === 'rechts' ? i === 0 : i === 1) ? 151 : 0;
          expect(gerendert + reserve).toBeLessThanOrEqual(520 + 1e-9);
          const erste = zeilen[0];
          const letzte = zeilen.at(-1);
          assert(erste);
          assert(letzte);
          expect(Number(erste.dataset.zeile) % 3).toBe(0);
          expect(Number(letzte.dataset.zeile) % 3).toBe(2);
        });
      }
    });
  }
}
for (const fall of [
  // Von Hand bestimmte Teilungen bei 12,1px Mindesthöhe; keine Layoutattrappen.
  {
    name: 'trennt nicht zwischen zwei Kopfzeilen',
    anzahl: 8,
    teilungen: [3, 6],
    hoehe: 100,
    erwartet: 3,
  },
  {
    name: 'trennt nicht vor dem ersten Lesezeichen',
    anzahl: 8,
    teilungen: [3, 5, 6],
    hoehe: 100,
    erwartet: 3,
  },
  {
    name: 'behält eine optimale Teilung zwischen Lesezeichen',
    anzahl: 8,
    teilungen: [3, 4, 6],
    hoehe: 100,
    erwartet: 4,
  },
  {
    name: 'nimmt die weiter entfernte passende Teilung',
    anzahl: 8,
    teilungen: [3, 6],
    hoehe: 100,
    erwartet: 6,
    abstaende: [0, 0, 0, 0, 0, 0, 50, 0],
  },
  {
    name: 'scrollt ohne innere erlaubte Teilung',
    anzahl: 8,
    teilungen: [],
    hoehe: 100,
    erwartet: null,
  },
  {
    name: 'passt genau bei Mindestzeilenhöhe',
    anzahl: 8,
    teilungen: [4],
    hoehe: 64.4,
    erwartet: 4,
  },
  {
    name: 'scrollt knapp unter Mindesthöhe',
    anzahl: 8,
    teilungen: [4],
    hoehe: 64.3,
    erwartet: null,
  },
]) {
  it(fall.name, async () => {
    hoehe = fall.hoehe;
    await act(async () =>
      h.root.render(
        <Seitenleiste
          seite="rechts"
          anzahl={fall.anzahl}
          schnellaktionenAnzahl={0}
          schnellaktionen={null}
          layoutAngaben={{
            erlaubteTeilungen: fall.teilungen,
            zusatzabstaende: fall.abstaende ?? Array.from({ length: fall.anzahl }, () => 0),
          }}
          renderSpalte={(von, bis) =>
            Array.from({ length: bis - von }, (_, i) => <div key={von + i} data-zeile={von + i} />)
          }
        />,
      ),
    );
    const inhalt = h.host.querySelector<HTMLElement>('[data-einfuehrung-grenze] > div');
    assert(inhalt);
    expect(inhalt.style.overflowY).toBe(fall.erwartet === null ? 'auto' : 'hidden');
    if (fall.erwartet !== null) {
      const ersteSpalte = inhalt.children[0];
      assert(ersteSpalte);
      expect(ersteSpalte.querySelectorAll('[data-zeile]')).toHaveLength(fall.erwartet);
    }
  });
}
it('reagiert auf Größenänderungen zwischen einer Spalte, zwei Spalten und Scrollen', async () => {
  hoehe = 200;
  await act(async () =>
    h.root.render(
      <Seitenleiste
        seite="links"
        anzahl={8}
        schnellaktionenAnzahl={0}
        schnellaktionen={null}
        layoutAngaben={{ erlaubteTeilungen: [4], zusatzabstaende: Array(8).fill(0) }}
        renderSpalte={(von, bis) =>
          Array.from({ length: bis - von }, (_, i) => <div key={von + i} data-zeile={von + i} />)
        }
      />,
    ),
  );
  const inhalt = h.host.querySelector<HTMLElement>('[data-einfuehrung-grenze] > div');
  assert(inhalt);
  expect(inhalt.style.flexDirection).toBe('column');
  for (const fall of [
    { hoehe: 80, scroll: 'hidden', richtung: '' },
    { hoehe: 60, scroll: 'auto', richtung: 'column' },
    { hoehe: 200, scroll: 'hidden', richtung: 'column' },
  ]) {
    await act(async () => {
      hoehe = fall.hoehe;
      groessenBeobachter.forEach((beobachter) => beobachter());
    });
    expect(inhalt.style.overflowY).toBe(fall.scroll);
    expect(inhalt.style.flexDirection).toBe(fall.richtung);
    expect(inhalt.querySelectorAll('[data-zeile]')).toHaveLength(8);
  }
});
it('berechnet bei großer UI die skalierten Schnellaktionen und geänderten Zeilenlisten neu', async () => {
  hoehe = 536;
  localStorage.setItem(UI_GROESSE_KEY, 'gross');
  const anzeigen = async (anzahl: number) => {
    await act(async () =>
      h.root.render(
        <UiGroesseProvider>
          <Seitenleiste
            seite="rechts"
            fontGroesse={13}
            anzahl={anzahl}
            schnellaktionenAnzahl={5}
            schnellaktionen={<div />}
            layoutAngaben={{
              erlaubteTeilungen: Array.from({ length: anzahl / 3 - 1 }, (_, i) => (i + 1) * 3),
              zusatzabstaende: Array.from({ length: anzahl }, (_, i) => (i % 3 === 0 ? 6 : 0)),
            }}
            renderSpalte={(von, bis) =>
              Array.from({ length: bis - von }, (_, i) => (
                <div key={von + i} data-zeile={von + i} />
              ))
            }
          />
        </UiGroesseProvider>,
      ),
    );
  };
  try {
    await anzeigen(60);
    const inhalt = h.host.querySelector<HTMLElement>('[data-einfuehrung-grenze] > div');
    assert(inhalt);
    // 500px nutzbar; bei 14,3px Mindesthöhe passt keine geschützte Teilung.
    expect(inhalt.style.overflowY).toBe('auto');
    await anzeigen(30);
    // 30 × 14,3 + 9 × 6 + 171 = 654px: eine Spalte passt nicht.
    // Zwei Spalten passen; 5 Buttons à 34px plus Trennlinie sind berücksichtigt.
    expect(inhalt.style.overflowY).toBe('hidden');
    expect(inhalt.style.flexDirection).toBe('');
    expect(inhalt.querySelectorAll('[data-zeile]')).toHaveLength(30);
    await anzeigen(3);
    expect(inhalt.style.flexDirection).toBe('column');
    expect(inhalt.querySelectorAll('[data-zeile]')).toHaveLength(3);
    hoehe = 220;
    await anzeigen(9);
    // 204px nutzbar: schon 3 × 14,3 + 171 = 213,9px passen nicht.
    // Mit unskalierten 151px würde die Teilung 3/6 fälschlich passen.
    expect(inhalt.style.overflowY).toBe('auto');
  } finally {
    localStorage.removeItem(UI_GROESSE_KEY);
  }
});
it('hält Schnellaktionen auch ohne Lesezeichen bei Platzmangel durch Scrollen erreichbar', async () => {
  hoehe = 100;
  await act(async () =>
    h.root.render(
      <Seitenleiste
        seite="links"
        anzahl={0}
        schnellaktionenAnzahl={5}
        schnellaktionen={<div />}
        layoutAngaben={{ erlaubteTeilungen: [], zusatzabstaende: [] }}
        renderSpalte={() => []}
      />,
    ),
  );
  const inhalt = h.host.querySelector<HTMLElement>('[data-einfuehrung-grenze] > div');
  assert(inhalt);
  expect(inhalt.style.overflowY).toBe('auto');
});

it('meldet das Ausblenden der Lesezeichenleiste nach Entfernen ihres letzten Eintrags', async () => {
  const rendern = (vorhanden: boolean) =>
    act(async () =>
      h.root.render(
        <Seitenleistenanordnung
          leistenTauschen={false}
          minimal={true}
          favoriten={{ gesetz: null, eintraege: [], onKlick: vi.fn() }}
          lesezeichen={{
            seitenleistenTastenkuerzel: true,
            eintraege: vorhanden
              ? [{ gesetz: { normgeber: 'DE', kurztitel: 'BGB' }, bezeichnung: '1' }]
              : [],
            onKlick: vi.fn(),
          }}
          schnellaktionen={aktionen}
          einfuehrungAktiv={false}
          einfuehrungFavoritErlaubt={false}
        >
          <div />
        </Seitenleistenanordnung>,
      ),
    );
  await rendern(true);
  const diagnose = beginneScrollDiagnose(h.host);
  try {
    expect(h.host.querySelector('[data-einfuehrung-grenze="links"]')).not.toBeNull();
    await rendern(false);
    expect(h.host.querySelector('[data-einfuehrung-grenze="links"]')).toBeNull();
    expect(diagnose.beenden().ereignisse).toContainEqual(
      expect.objectContaining({
        art: 'seitenleisten-geaendert',
        zustand: '-:-;lesezeichen=false;favoriten=false;minimal=true;getauscht=false',
      }),
    );
  } finally {
    diagnose.beenden();
  }
});
