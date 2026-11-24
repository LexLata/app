// @vitest-environment jsdom
// GesetzTextScreen.anzeige.test.tsx
// Mobil-Screen rendert den echten gemeinsamen Textbaum; nur Fenstergeometrie ist ersetzt.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { GesetzTextScreen } from './GesetzTextScreen';
import { ermittleAuswahl, textAnTextpfad } from '@/lib/domain/textpfad/textpfad.index';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; getItemKey(index: number): string | number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: options.getItemKey(index),
        start: index * 1000,
        size: 1000,
      })),
    getOffsetForIndex: (index: number) => [index * 1000],
    getTotalSize: () => options.count * 1000,
    measureElement: () => {},
  }),
}));
const dom = domTestWurzel();
beforeEach(() => {
  document.body.append(dom.host);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()!.removeAllRanges();
  dom.host.remove();
});

it('schützt Titel und getaggte Verweisgrenzen im echten Mobil-Screen und navigiert mit Originalzielen', async () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><titel>😀 Art. 1 Abs. 2 I 3</titel><text><absatz><satz zahl="1">😀 §<verweis norm="§ 9999"> 9999</verweis> Abs. 1 I 2</satz></absatz></text></norm></inhalt></gesetz>',
  )!;
  const anderes = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>ZielG</kurztitel></infos><inhalt><norm id="ziel"><bezeichnung>§ 9999</bezeichnung><text><absatz>Originalziel</absatz></text></norm></inhalt></gesetz>',
  )!;
  const el = gesetz.elemente[0]!;
  if (el.typ !== 'norm') throw new Error('Norm fehlt');
  const norm = el.data;
  norm.getaggteVerweise![0]!.zielgesetz = gesetzesreferenz({ kurztitel: anderes.kurztitel });
  const vorher = structuredClone({ gesetz, anderes });
  const oeffnen = vi.fn();
  await act(async () =>
    dom.root.render(
      <GesetzTextScreen
        gesetz={gesetz}

        schriftgroesse={18}
        randInline={16}
        seitenleistenGroesse={12}
        onZurueckZuOeffnen={vi.fn()}
        onEinstellungenOeffnen={vi.fn()}
        onAnderesGesetzOeffnen={oeffnen}
      />,
    ),
  );
  expect(dom.host.querySelector('[data-bereich="amtlicherTitel"]')!.textContent).toBe(
    '😀 Art.\u00a01 Abs.\u00a02 I 3',
  );
  const blatt = dom.host.querySelector('[data-leaf][data-satz="1"]')!;
  expect(blatt.textContent).toBe('😀 §\u00a09999 Abs.\u00a01 I 2');
  const gruppe = [...blatt.querySelectorAll<HTMLElement>('span')].find(
    (s) => s.style.whiteSpace === 'nowrap' && s.textContent === '§\u00a09999',
  )!;
  expect(gruppe).toBeDefined();
  const zahl = [...gruppe.querySelectorAll<HTMLElement>('span')].find(
    (s) => s.textContent === '9999',
  )!;
  const range = document.createRange();
  range.selectNodeContents(zahl);
  const selection = window.getSelection()!;
  selection.addRange(range);
  expect(ermittleAuswahl(selection)).toMatchObject({
    textstelle: {
      pfad: { typ: 'normtext' as const, satz: 1 },
      zeichenbereichStart: 5,
      zeichenbereichEnde: 9,
    },
    xmlId: norm.xmlId,
  });
  expect(
    textAnTextpfad(norm, {
      pfad: normtextPfad({ satz: 1 }),
      zeichenbereichStart: 5,
      zeichenbereichEnde: 9,
    }),
  ).toBe('9999');
  await act(async () => zahl.click());
  expect(oeffnen).not.toHaveBeenCalled();
  selection.removeAllRanges();
  await act(async () => zahl.click());
  expect(oeffnen).toHaveBeenCalledExactlyOnceWith(
    { kurztitel: 'ZielG', normgeber: 'de-bund' },
    '§ 9999',
  );

  expect({ gesetz, anderes }).toEqual(vorher);
});
