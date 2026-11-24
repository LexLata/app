// useStrukturZustand.test.ts
// Bedienoperationen erhalten vier Klappstufen, Vorfahrenregeln und getrennte Aktivierung.
import { normaleNorm, gliederungsartikel } from '@/test/gesetz/gesetzFabriken';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { useStrukturZustand } from './useStrukturZustand';
import type { StrukturZustand, StrukturMomentaufnahme } from './struktur.index';
import type {
  StrukturZustandOptionen,
  ZielVorbereitung,
  KlappschrittErgebnis,
} from './StrukturZustand.types';
const u = (id: string, ebene: number): DarstellungsElement => ({
  typ: 'ueberschrift',
  data: { id, xmlId: `xml-${id}`, bezeichnung: id, ebene, gliederungskennzahl: '000000' },
});
const n = (id: string): DarstellungsElement => ({
  typ: 'norm',
  data: normaleNorm({ id, xmlId: `xml-${id}`, bezeichnung: id, absaetze: [] }),
});
const elemente = [u('u1', 1), u('u2', 2), n('n1'), n('n2'), u('u3', 1), n('n3')];
let cleanup: () => Promise<void>;
beforeEach(() => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await cleanup?.();
  vi.unstubAllGlobals();
});
async function render(options: Partial<StrukturZustandOptionen> = {}) {
  const root = createRoot(document.getElementById('root')!);
  let s!: StrukturZustand;
  function Probe() {
    s = useStrukturZustand({ elemente, initialNormAktiv: false, ...options });
    return null;
  }
  await act(async () => root.render(createElement(Probe)));
  cleanup = async () => {
    await act(async () => root.unmount());
  };
  return {
    get s() {
      return s;
    },
    visible: () => s.sichtbareElemente.map((el) => el.data.id),
  };
}
describe('semantischer Strukturzustand', () => {
  it('durchläuft sämtliche vier Klappstufen und zurück, auch mit verborgenen Vorfahren', async () => {
    const h = await render();
    expect(h.s.kannAufklappen).toBe(false);
    await act(async () => {
      const ergebnis: KlappschrittErgebnis = h.s.klappeStufe('zu', 'n1');
      expect(ergebnis.zielId).not.toBeUndefined();
    });
    expect([...h.s.momentaufnahme.eingeklappteNormen]).toEqual(['n1', 'n2', 'n3']);
    expect(h.visible()).toEqual(['u1', 'u2', 'n1', 'n2', 'u3', 'n3']);
    await act(async () => {
      h.s.klappeStufe('zu', 'n1');
    });
    expect(h.visible()).toEqual(['u1', 'u2', 'u3']);
    await act(async () => {
      h.s.klappeStufe('zu', 'u2');
    });
    expect(h.visible()).toEqual(['u1', 'u3']);
    expect(h.s.kannZuklappen).toBe(false);
    await act(async () => {
      h.s.klappeStufe('auf', 'u1');
    });
    expect(h.visible()).toEqual(['u1', 'u2', 'u3']);
    await act(async () => {
      h.s.klappeStufe('auf', 'u1');
    });
    expect(h.visible()).toHaveLength(6);
    expect(h.s.momentaufnahme.eingeklappteNormen.size).toBe(3);
    await act(async () => {
      h.s.klappeStufe('auf', 'u1');
    });
    expect(h.s.momentaufnahme.eingeklappteNormen.size).toBe(0);
    expect(h.s.momentaufnahme.eingeklappteUeberschriften.size).toBe(0);
  });
  it('öffnet notwendige Vorfahren eines XML-Ziels, benötigt einen neuen Renderstand und aktiviert die Parse-ID', async () => {
    const h = await render({
      initial: {
        eingeklappteUeberschriften: new Set(['u1', 'u2']),
        eingeklappteNormen: new Set(['n1']),
        aktivesElementId: 'u3',
      },
    });
    await act(async () => {
      const ziel: ZielVorbereitung = h.s.bereiteZielVor('xml-n1', false);
      expect(ziel).toEqual({ status: 'nicht-gefunden' });
    });
    expect(h.s.momentaufnahme.aktivesElementId).toBe('u3');
    await act(async () => {
      expect(h.s.bereiteZielVor('xml-n1', true)).toEqual({ status: 'aufklappen', elementId: 'n1' });
    });
    expect(h.visible()).toContain('n1');
    expect(h.s.momentaufnahme.aktivesElementId).toBe('n1');
    expect(h.s.momentaufnahme.eingeklappteNormen.has('n1')).toBe(true);
    await act(async () => {
      expect(h.s.bereiteZielVor('xml-n1', true)).toEqual({
        status: 'sichtbar',
        elementId: 'n1',
        index: 2,
      });
    });
  });
  it('Pfeil rechts öffnet eine Überschrift und liefert das erst nach Rendern sichtbare Kind', async () => {
    const h = await render({
      initial: {
        eingeklappteUeberschriften: new Set(['u2']),
        eingeklappteNormen: new Set(),
        aktivesElementId: 'u2',
      },
    });
    await act(async () => {
      expect(h.s.fuehrePfeilaktionAus('rechts')).toEqual({ zielId: 'n1' });
    });
    expect(h.visible()).toContain('n1');
    expect(h.s.momentaufnahme.aktivesElementId).toBe('n1');
    await act(async () => {
      expect(h.s.fuehrePfeilaktionAus('hoch', { alt: true })).toEqual({ zielId: 'u2' });
    });
    await act(async () => {
      h.s.fuehrePfeilaktionAus('links');
    });
    expect(h.visible()).toContain('n1');
  });
  it('Textaktivierung ändert weder Sichtbarkeit noch Klappzustand und übernimmt initiale Sets als Kopien', async () => {
    const normen = new Set(['n2']);
    const h = await render({
      initial: {
        eingeklappteUeberschriften: new Set(),
        eingeklappteNormen: normen,
        aktivesElementId: 'n1',
      },
    });
    const snapshot: StrukturMomentaufnahme = h.s.momentaufnahme;
    expect(snapshot.eingeklappteNormen).not.toBe(normen);
    normen.clear();
    const vorher = h.s.sichtbareElemente;
    await act(async () => h.s.waehleNormText('n3'));
    expect(h.s.momentaufnahme.aktivesElementId).toBe('n3');
    expect(h.s.momentaufnahme.eingeklappteNormen).toEqual(new Set(['n2']));
    expect(h.s.sichtbareElemente).toBe(vorher);
  });
  it('behält die bestehenden Einführungssperren für Überschriften, Titel und Text', async () => {
    const h = await render({
      sperren: {
        ueberschriftenGesperrt: true,
        einklappenGesperrt: true,
        normAuswahlGesperrt: true,
      },
    });
    await act(async () => {
      h.s.schalteUeberschrift('u2');
      h.s.schalteNorm('n2');
      h.s.waehleNormText('n3');
    });
    expect(h.s.momentaufnahme.aktivesElementId).toBe('u1');
    expect(h.s.momentaufnahme.eingeklappteUeberschriften.size).toBe(0);
    expect(h.s.momentaufnahme.eingeklappteNormen.size).toBe(0);
  });
});

it('Alt-Pfeil geht eine Norm weiter', async () => {
  const h = await render({
    elemente: Array.from({ length: 12 }, (_, i) => n(String(i))),
    initial: {
      eingeklappteUeberschriften: new Set(),
      eingeklappteNormen: new Set(),
      aktivesElementId: '0',
    },
  });
  await act(async () => {
    expect(h.s.fuehrePfeilaktionAus('runter', { alt: true })).toEqual({ zielId: '1' });
  });
  expect(h.s.momentaufnahme.aktivesElementId).toBe('1');
});
it('Shift-Pfeil rechts öffnet ausschließlich die aktive Norm, Shift-links aktiviert deren Eltern und klappt sie ein', async () => {
  const h = await render({
    initial: {
      eingeklappteUeberschriften: new Set(),
      eingeklappteNormen: new Set(['n1', 'n2']),
      aktivesElementId: 'n1',
    },
  });
  await act(async () => {
    h.s.fuehrePfeilaktionAus('rechts', { shift: true });
  });
  expect(h.s.momentaufnahme.eingeklappteNormen).toEqual(new Set(['n2']));
  await act(async () => {
    expect(h.s.fuehrePfeilaktionAus('links', { shift: true })).toEqual({ zielId: 'u2' });
  });
  expect(h.s.momentaufnahme.eingeklappteUeberschriften).toEqual(new Set(['u2']));
});

it('Meta-Pfeil reicht den Überschriftenblocksprung durch den Strukturzustand weiter', async () => {
  const h = await render({
    initial: {
      aktivesElementId: 'u1',
      eingeklappteUeberschriften: new Set(),
      eingeklappteNormen: new Set(),
    },
  });
  await act(async () => {
    expect(h.s.fuehrePfeilaktionAus('runter', { meta: true })).toEqual({ zielId: 'u3' });
  });
  expect(h.s.momentaufnahme.aktivesElementId).toBe('u3');
});

it.each([false, true])(
  'P2-A5/A6: aktive untergeordnete Überschrift (Gliederungsartikel: %s) liefert beim Zuklappen das neue aktive Element als Ankerziel',
  async (artikel) => {
    const teil = artikel
      ? {
          typ: 'norm' as const,
          data: gliederungsartikel({
            id: 'teil',
            xmlId: 'teil',
            bezeichnung: 'Art. 1',
            ueberschriftartig: true,
            gliederungsEbene: 2,
            absaetze: [],
          }),
        }
      : u('teil', 2);
    const h = await render({
      elemente: [u('haupt', 1), teil, n('norm')],
      initial: {
        eingeklappteUeberschriften: new Set(),
        eingeklappteNormen: new Set(),
        aktivesElementId: 'teil',
      },
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        const ziel = h.s.klappeStufe('zu', h.s.momentaufnahme.aktivesElementId);
        if (i < 2) expect(ziel.zielId).toBe('teil');
        else expect(ziel).toEqual({ zielId: 'haupt', offsetInItem: 0 });
      });
    }
    expect(h.s.momentaufnahme.aktivesElementId).toBe('haupt');
  },
);
