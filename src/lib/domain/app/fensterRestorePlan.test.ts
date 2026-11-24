import { gesetzesreferenz, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { istGleichesGesetz, referenzVon } from '@/lib/domain/gesetzesreferenz';
import { describe, expect, it } from 'vitest';
import { fensterRestorePlanErstellen, type FensterRestorePlanEingabe } from './fensterRestorePlan';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type {
  FensterGeometrie,
  GespeichertesFenster,
} from '@/lib/persistenz/fenster/fenster.index';

function gesetz(kuerzel: string): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel: `Gesetz ${kuerzel}`,
    langtitel: `Langtitel ${kuerzel}`,
    hatGliederungsartikel: false,
    elemente: [],
  });
}

function pruefeReferenzen(
  gesetze: GesetzDarstellung[],
): FensterRestorePlanEingabe['existenzFuerReferenz'] {
  return (referenz) =>
    gesetze.some((g) => istGleichesGesetz(g, referenz)) ? 'vorhanden' : 'fehlt';
}

function geometrie(ueberschreibungen: Partial<FensterGeometrie> = {}): FensterGeometrie {
  return { breite: 800, hoehe: 600, x: 0, y: 0, maximiert: false, ...ueberschreibungen };
}

function basisEingabe(
  ueberschreibungen: Partial<FensterRestorePlanEingabe> = {},
): FensterRestorePlanEingabe {
  return {
    fensterLabel: 'fenster-2',
    eigenerZustand: null,
    existenzFuerReferenz: () => 'fehlt',
    andereFensterZustaende: [],
    letzteFensterGeometrieFallback: undefined,
    ...ueberschreibungen,
  };
}

describe('fensterRestorePlanErstellen – Nicht-main-Fenster', () => {
  it('liefert leeren Plan ohne eigenen Zustand', () => {
    const plan = fensterRestorePlanErstellen(basisEingabe());
    expect(plan.wiederherzustellendeTabs).toEqual([]);
    expect(plan.aktiverIndex).toBe(-1);
    expect(plan.geometrieAktion).toEqual({ typ: 'keine' });
    expect(plan.labelsZuOeffnen).toEqual([]);
    expect(plan.labelsZuBereinigen).toEqual([]);
  });

  it('stellt vorhandene Referenzen wieder her und überspringt fehlende', () => {
    const g1 = gesetz('g1');
    const g2 = gesetz('g2');
    const eigenerZustand: GespeichertesFenster = {
      tabs: [
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) },
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz unbekannt' }) },
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g2' }) },
      ],
      aktiverIndex: 1,
    };
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        eigenerZustand,
        existenzFuerReferenz: pruefeReferenzen([g1, g2]),
      }),
    );
    expect(plan.wiederherzustellendeTabs).toEqual([
      { gesetzesreferenz: referenzVon(g1) },
      { gesetzesreferenz: referenzVon(g2) },
    ]);
    // Der aktive Tab selbst fehlt: die bisherige Begrenzungsregel bleibt erhalten.
    expect(plan.aktiverIndex).toBe(1);
  });

  it('klemmt einen zu großen aktiverIndex auf den letzten wiederhergestellten Tab', () => {
    const g1 = gesetz('g1');
    const eigenerZustand: GespeichertesFenster = {
      tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
      aktiverIndex: 7,
    };
    const plan = fensterRestorePlanErstellen(
      basisEingabe({ eigenerZustand, existenzFuerReferenz: pruefeReferenzen([g1]) }),
    );
    expect(plan.aktiverIndex).toBe(0);
  });

  it('klemmt einen negativen aktiverIndex auf 0', () => {
    const g1 = gesetz('g1');
    const eigenerZustand: GespeichertesFenster = {
      tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
      aktiverIndex: -1,
    };
    const plan = fensterRestorePlanErstellen(
      basisEingabe({ eigenerZustand, existenzFuerReferenz: pruefeReferenzen([g1]) }),
    );
    expect(plan.aktiverIndex).toBe(0);
  });

  it('wendet die eigene Geometrie an, falls vorhanden', () => {
    const eigeneGeometrie = geometrie({ x: 42 });
    const eigenerZustand: GespeichertesFenster = {
      tabs: [],
      aktiverIndex: -1,
      geometrie: eigeneGeometrie,
    };
    const plan = fensterRestorePlanErstellen(basisEingabe({ eigenerZustand }));
    expect(plan.geometrieAktion).toEqual({ typ: 'anwenden', geometrie: eigeneGeometrie });
  });

  it('ignoriert andereFensterZustaende/labelsZuOeffnen komplett (nur main-Belang)', () => {
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        andereFensterZustaende: [
          {
            label: 'main',
            zustand: {
              tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
              aktiverIndex: 0,
            },
          },
        ],
      }),
    );
    expect(plan.labelsZuOeffnen).toEqual([]);
    expect(plan.labelsZuBereinigen).toEqual([]);
  });
});

describe('fensterRestorePlanErstellen – main-Fenster', () => {
  it('verwendet eigenen Inhalt von main – unabhängig von anderen Fenstern', () => {
    const g1 = gesetz('g1');
    const eigenerZustand: GespeichertesFenster = {
      tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
      aktiverIndex: 0,
    };
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        fensterLabel: 'main',
        eigenerZustand,
        existenzFuerReferenz: pruefeReferenzen([g1]),
        andereFensterZustaende: [
          {
            label: 'fenster-2',
            zustand: {
              tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
              aktiverIndex: 0,
            },
          },
        ],
      }),
    );
    expect(plan.labelsZuOeffnen).toEqual([{ label: 'fenster-2', geometrie: undefined }]);
  });

  it('stellt keine Tabs wieder her, wenn kein Fenster Inhalt hat', () => {
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        fensterLabel: 'main',
        andereFensterZustaende: [{ label: 'fenster-2', zustand: null }],
      }),
    );
    expect(plan.labelsZuOeffnen).toEqual([]);
    expect(plan.labelsZuBereinigen).toEqual(['fenster-2']);
  });

  it('übernimmt Inhalt nach main', () => {
    const g1 = gesetz('g1');
    const quelleGeometrie = geometrie({ x: 17 });
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        fensterLabel: 'main',
        existenzFuerReferenz: pruefeReferenzen([g1]),
        andereFensterZustaende: [
          {
            label: 'fenster-2',
            zustand: {
              tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
              aktiverIndex: 0,
              geometrie: quelleGeometrie,
            },
          },
        ],
      }),
    );
    expect(plan.uebernommenesFensterLabel).toBe('fenster-2');
    expect(plan.wiederherzustellendeTabs).toEqual([{ gesetzesreferenz: referenzVon(g1) }]);
    expect(plan.aktiverIndex).toBe(0);
    expect(plan.geometrieAktion).toEqual({ typ: 'anwenden', geometrie: quelleGeometrie });
    expect(plan.labelsZuOeffnen).toEqual([]);
  });

  it('bevorzugt eigenen darstellbaren Inhalt einschließlich aktivem Tab und Geometrie', () => {
    const g1 = gesetz('g1');
    const g2 = gesetz('g2');
    const eigeneGeometrie = geometrie({ x: 44 });
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        fensterLabel: 'main',
        existenzFuerReferenz: pruefeReferenzen([g1, g2]),
        eigenerZustand: {
          tabs: [
            { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g2' }) },
            { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) },
          ],
          aktiverIndex: 1,
          geometrie: eigeneGeometrie,
        },
        andereFensterZustaende: [
          {
            label: 'a',
            zustand: {
              tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
              aktiverIndex: 0,
            },
          },
        ],
        letzteFensterGeometrieFallback: geometrie({ x: 99 }),
      }),
    );
    expect(plan.uebernommenesFensterLabel).toBeNull();
    expect(plan.wiederherzustellendeTabs.map((eintrag) => eintrag.gesetzesreferenz)).toEqual([
      referenzVon(g2),
      referenzVon(g1),
    ]);
    expect(plan.aktiverIndex).toBe(1);
    expect(plan.geometrieAktion).toEqual({ typ: 'anwenden', geometrie: eigeneGeometrie });
    expect(plan.labelsZuOeffnen).toEqual([{ label: 'a', geometrie: undefined }]);
  });

  it.each([false, true])(
    'wählt unabhängig von der Eingabereihenfolge und überspringt fehlende Gesetze: %s',
    (umgekehrt) => {
      const g1 = gesetz('g1');
      const g2 = gesetz('g2');
      const andereFensterZustaende = [
        {
          label: 'z',
          zustand: {
            tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g2' }) }],
            aktiverIndex: 0,
            geometrie: geometrie({ x: 90 }),
          },
        },
        {
          label: '0',
          zustand: {
            tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz fehlt' }) }],
            aktiverIndex: 0,
          },
        },
        {
          label: 'a',
          zustand: {
            tabs: [
              { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz fehlt' }) },
              { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g2' }) },
              { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) },
            ],
            aktiverIndex: 2,
            geometrie: geometrie({ x: 10 }),
          },
        },
      ];
      const plan = fensterRestorePlanErstellen(
        basisEingabe({
          fensterLabel: 'main',
          existenzFuerReferenz: pruefeReferenzen([g1, g2]),
          eigenerZustand: {
            tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz fehlt' }) }],
            aktiverIndex: 0,
            geometrie: geometrie({ x: 42 }),
          },
          andereFensterZustaende: umgekehrt
            ? [...andereFensterZustaende].reverse()
            : andereFensterZustaende,
          letzteFensterGeometrieFallback: geometrie({ x: 99 }),
        }),
      );
      expect(plan.uebernommenesFensterLabel).toBe('a');
      expect(plan.wiederherzustellendeTabs).toEqual([
        { gesetzesreferenz: referenzVon(g2) },
        { gesetzesreferenz: referenzVon(g1) },
      ]);
      expect(plan.aktiverIndex).toBe(1);
      expect(plan.geometrieAktion).toEqual({ typ: 'anwenden', geometrie: geometrie({ x: 10 }) });
      expect(plan.labelsZuOeffnen).toEqual(
        expect.arrayContaining([
          { label: '0', geometrie: undefined },
          { label: 'z', geometrie: geometrie({ x: 90 }) },
        ]),
      );
      expect(plan.labelsZuOeffnen).toHaveLength(2);
      expect(plan.labelsZuBereinigen).toEqual([]);
    },
  );

  it.each(['eigene', 'fallback', 'zentrieren'])(
    'übernimmt ohne Quellgeometrie mit bestehender Geometrieregel %s',
    (fall) => {
      const eigeneGeometrie = geometrie({ x: 42 });
      const fallback = geometrie({ x: 99 });
      const plan = fensterRestorePlanErstellen(
        basisEingabe({
          fensterLabel: 'main',
          existenzFuerReferenz: pruefeReferenzen([gesetz('g1')]),
          eigenerZustand: {
            tabs: [],
            aktiverIndex: -1,
            geometrie: fall === 'eigene' ? eigeneGeometrie : undefined,
          },
          andereFensterZustaende: [
            {
              label: 'a',
              zustand: {
                tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
                aktiverIndex: 0,
              },
            },
          ],
          letzteFensterGeometrieFallback: fall === 'zentrieren' ? undefined : fallback,
        }),
      );
      expect(plan.uebernommenesFensterLabel).toBe('a');
      expect(plan.geometrieAktion).toEqual(
        fall === 'zentrieren'
          ? { typ: 'zentrieren' }
          : { typ: 'anwenden', geometrie: fall === 'eigene' ? eigeneGeometrie : fallback },
      );
    },
  );

  it('stellt ohne darstellbare Tabs nichts wieder her und erweitert die Bereinigung nicht', () => {
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        fensterLabel: 'main',
        eigenerZustand: {
          tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz fehlt' }) }],
          aktiverIndex: 0,
        },
        andereFensterZustaende: [
          {
            label: 'a',
            zustand: {
              tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz fehlt' }) }],
              aktiverIndex: 0,
            },
          },
          { label: 'leer', zustand: { tabs: [], aktiverIndex: -1 } },
        ],
      }),
    );
    expect(plan.uebernommenesFensterLabel).toBeNull();
    expect(plan.wiederherzustellendeTabs).toEqual([]);
    expect(plan.aktiverIndex).toBe(-1);
    expect(plan.labelsZuBereinigen).toEqual(['leer']);
    expect(plan.labelsZuOeffnen).toEqual([{ label: 'a', geometrie: undefined }]);
  });

  it('MUTATIONSTEST: wendet die EIGENE Geometrie an, wenn main sie hat – VOR dem Fallback', () => {
    const eigeneGeometrie = geometrie({ x: 42 });
    const fallback = geometrie({ x: 99 });
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        fensterLabel: 'main',
        eigenerZustand: { tabs: [], aktiverIndex: -1, geometrie: eigeneGeometrie },
        letzteFensterGeometrieFallback: fallback,
      }),
    );
    expect(plan.geometrieAktion).toEqual({ typ: 'anwenden', geometrie: eigeneGeometrie });
  });

  it('verwendet den Geometrie-Fallback, wenn main keine eigene Geometrie hat', () => {
    const fallback = geometrie({ x: 99 });
    const plan = fensterRestorePlanErstellen(
      basisEingabe({ fensterLabel: 'main', letzteFensterGeometrieFallback: fallback }),
    );
    expect(plan.geometrieAktion).toEqual({ typ: 'anwenden', geometrie: fallback });
  });

  it('zentriert main, wenn weder eigene Geometrie noch Fallback vorhanden sind', () => {
    const plan = fensterRestorePlanErstellen(basisEingabe({ fensterLabel: 'main' }));
    expect(plan.geometrieAktion).toEqual({ typ: 'zentrieren' });
  });

  it('bereinigt nur Labels ohne Inhalt, öffnet nur Labels mit Inhalt', () => {
    const plan = fensterRestorePlanErstellen(
      basisEingabe({
        fensterLabel: 'main',
        eigenerZustand: {
          tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g1' }) }],
          aktiverIndex: 0,
        },
        existenzFuerReferenz: pruefeReferenzen([gesetz('g1')]),
        andereFensterZustaende: [
          { label: 'leer-1', zustand: { tabs: [], aktiverIndex: -1 } },
          { label: 'leer-2', zustand: null },
          {
            label: 'voll-1',
            zustand: {
              tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'Gesetz g2' }) }],
              aktiverIndex: 0,
              geometrie: geometrie(),
            },
          },
        ],
      }),
    );
    expect(plan.labelsZuBereinigen.sort()).toEqual(['leer-1', 'leer-2']);
    expect(plan.labelsZuOeffnen).toEqual([{ label: 'voll-1', geometrie: geometrie() }]);
  });
});

it.each([
  [
    { kurztitel: 'bGb', normgeber: 'de-bund' },
    { kurztitel: 'BGB', normgeber: 'de-bund' },
  ],
  [gesetzesreferenz({ kurztitel: 'bGb' }), gesetzesreferenz({ kurztitel: 'BGB' })],
])('löst die gespeicherte Referenz %j unabhängig von Schreibweise auf', (referenz, bestand) => {
  const passendesGesetz = { ...gesetz('irrelevante-dateibasis'), ...bestand };
  const anderesGesetz = { ...passendesGesetz, normgeber: 'de-bw' };
  const plan = fensterRestorePlanErstellen(
    basisEingabe({
      eigenerZustand: { tabs: [{ gesetzesreferenz: referenz }], aktiverIndex: 0 },
      existenzFuerReferenz: pruefeReferenzen([anderesGesetz, passendesGesetz]),
    }),
  );
  expect(plan.wiederherzustellendeTabs).toEqual([{ gesetzesreferenz: referenz }]);
});
