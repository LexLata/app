import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// useMarkierungenAnzeige.test.ts
// Prüft die Zuordnung geladener Markierungen über den tatsächlichen Ladeeffekt.
// React und Datei-I/O werden ersetzt; die Bezeichnungsauflösung bleibt echt.

import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import { useMarkierungenAnzeige } from './useMarkierungenAnzeige';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const { effekte, setMarkierungen, ladeMarkierungen } = vi.hoisted(() => ({
  effekte: [] as Array<() => void | (() => void)>,
  setMarkierungen: vi.fn(),
  ladeMarkierungen: vi.fn(),
}));
vi.mock('react', () => ({
  useEffectEvent: (handler: unknown) => handler,
  useEffect: (effekt: () => void | (() => void)) => effekte.push(effekt),
  useState: (wert: unknown) => [wert, wert instanceof Map ? setMarkierungen : vi.fn()],
}));
vi.mock('@/lib/markierungen/markierungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/markierungen/markierungen.index')>()),
  ladeMarkierungen,
}));

function gesetz(mitNorm: boolean): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel: 'Test',
    langtitel: 'Test',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'ueberschrift',
        data: {
          id: 'u',
          xmlId: 'u',
          gliederungskennzahl: '010',
          bezeichnung: 'Abschnitt 1',
          ebene: 1,
        },
      },
      ...(mitNorm
        ? [
            {
              typ: 'norm' as const,
              data: normaleNorm({ id: 'n', xmlId: 'n', bezeichnung: 'Anlage 010', absaetze: [] }),
            },
          ]
        : []),
    ],
  });
}

function TestMarkierungenAnzeige(g: GesetzDarstellung) {
  return useMarkierungenAnzeige(g);
}

async function ladeZuordnung(g: GesetzDarstellung, normsymbole?: string[], ueberschrift?: true) {
  const eintrag: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: ueberschrift
      ? ueberschriftAusgangsstelle('010')
      : normAusgangsstelle([(normsymbole ?? ['§']).at(-1), '010'].filter(Boolean).join(' ')),

    kommentarText: 'Notiz',
  });
  ladeMarkierungen.mockResolvedValue([eintrag]);
  TestMarkierungenAnzeige(g);
  effekte[0]!();
  await vi.waitFor(() => expect(setMarkierungen).toHaveBeenCalledOnce());
  return { map: setMarkierungen.mock.calls[0]![0] as Map<string, MarkierungsEintrag[]>, eintrag };
}

beforeEach(() => {
  effekte.length = 0;
  vi.clearAllMocks();
});

describe('Zuordnung mit Ausgangspräfix', () => {
  it.each([false, true])(
    'zeigt fehlende oder umbenannte Norm nicht an der Überschrift (Norm vorhanden: %s)',
    async (mitNorm) => {
      const { map } = await ladeZuordnung(gesetz(mitNorm), ['Anhang']);
      expect(map.size).toBe(0);
    },
  );

  it('ordnet eine gefundene Norm trotz gleicher Überschriftengliederungskennzahl korrekt zu', async () => {
    const { map, eintrag } = await ladeZuordnung(gesetz(true), ['Anlage']);
    expect([...map]).toEqual([['n', [eintrag]]]);
  });

  it.each([undefined, [], ['Art.', '§']])(
    'deutet unmarkierte Kennung nicht zur Überschrift um (%j)',
    async (praefix) => {
      const { map } = await ladeZuordnung(gesetz(false), praefix);
      expect(map.size).toBe(0);
    },
  );
});

it('ordnet Gliederungskennzahl 010 der Überschrift statt § 1010 zu', async () => {
  const g = gesetz(true);
  const n = g.elemente.find((e) => e.typ === 'norm');
  if (n?.typ === 'norm') n.data.bezeichnung = '§ 1010';
  const { map, eintrag } = await ladeZuordnung(g, undefined, true);
  expect([...map]).toEqual([['u', [eintrag]]]);
});

it('blendet Markierungen bei true aus und zeigt denselben erhaltenen Bestand bei false wieder', async () => {
  const eintrag: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: ueberschriftAusgangsstelle('010'),

    kommentarText: 'Notiz',
  });
  const bestand = [eintrag];
  ladeMarkierungen.mockResolvedValue(bestand);
  useMarkierungenAnzeige(gesetz(false), true);
  effekte[0]!();
  expect(setMarkierungen).toHaveBeenCalledWith(new Map());
  expect(ladeMarkierungen).not.toHaveBeenCalled();
  effekte.length = 0;
  setMarkierungen.mockClear();
  useMarkierungenAnzeige(gesetz(false), false);
  effekte[0]!();
  await vi.waitFor(() => expect(setMarkierungen).toHaveBeenCalledWith(new Map([['u', [eintrag]]])));
  expect(bestand).toEqual([eintrag]);
});

it('verteilt eine fachlich eindeutige Kennung bei doppelter XML-ID nicht auf mehrere Blöcke', async () => {
  const g = gesetz(true);
  g.elemente.push({
    typ: 'norm',
    data: normaleNorm({ xmlId: 'n', bezeichnung: '§ 2' }),
  });
  const { map } = await ladeZuordnung(g, ['Anlage']);
  expect(map.size).toBe(0);
});
