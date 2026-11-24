// @vitest-environment jsdom
// Charakterisiert die Reihenfolge sämtlicher passiver Effekte beim Fensterlebenszyklus.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import {
  bereiteMarkierungsFensterDateienVor,
  markierungsFensterNativeAttrappe,
} from '@/test/markierungen/markierungsFensterNativeAttrappe';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import type { VerweismarkierungKontext } from '@/lib/markierungen/markierungen.index';
import VerweismarkierungFenster from './VerweismarkierungFenster';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const protokoll = vi.hoisted(() => ({ naechste: 0, eintraege: [] as string[] }));
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useEffect: (
      effekt: Parameters<typeof react.useEffect>[0],
      deps: Parameters<typeof react.useEffect>[1],
    ) => {
      const kennung = react.useRef<number | null>(null);
      if (kennung.current === null) kennung.current = ++protokoll.naechste;
      react.useEffect(() => {
        protokoll.eintraege.push(`start:${kennung.current}`);
        const aufraeumen = effekt();
        return () => {
          protokoll.eintraege.push(`ende:${kennung.current}`);
          aufraeumen?.();
        };
      }, deps);
    },
  };
});
vi.mock('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse', async (original) => ({
  ...(await original<typeof import('@/components/hilfsfenster/gemeinsam/hilfsfensterGroesse')>()),
  useDynamischeFensterGroesse: vi.fn(),
}));
const m = markierungsFensterNativeAttrappe<VerweismarkierungKontext>();
const dom = domTestWurzel();
it('erhält Mount-, Aktualisierungs- und Aufräumreihenfolge', async () => {
  bereiteMarkierungsFensterDateienVor();
  m.kontext = {
    gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    openerLabel: 'fenster-1',
    ausgangsstelle: normAusgangsstelle('§ 1'),
  };
  await act(async () => dom.root.render(<VerweismarkierungFenster />));
  const mount = [...protokoll.eintraege];
  protokoll.eintraege.length = 0;
  await act(async () => dom.root.render(<VerweismarkierungFenster />));
  const aktualisierung = [...protokoll.eintraege];
  protokoll.eintraege.length = 0;
  await act(async () => dom.root.render(null));
  expect({ mount, aktualisierung, aufraeumen: protokoll.eintraege }).toMatchInlineSnapshot(`
    {
      "aktualisierung": [],
      "aufraeumen": [
        "ende:1",
        "ende:2",
        "ende:3",
        "ende:4",
        "ende:5",
        "ende:6",
        "ende:7",
        "ende:8",
        "ende:9",
        "ende:10",
        "ende:11",
      ],
      "mount": [
        "start:8",
        "start:1",
        "start:2",
        "start:3",
        "start:4",
        "start:5",
        "start:6",
        "start:7",
        "ende:4",
        "start:4",
        "ende:4",
        "start:9",
        "start:10",
        "start:11",
        "start:4",
      ],
    }
  `);
});
