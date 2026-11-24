import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// @vitest-environment jsdom
// markierungsAnzeige.anzeige.test.tsx
// Pauschale Anzeigen verwenden den spezialisierten Zitatweg und erhalten Originalaktionen.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import { MarkierungCtx } from './markierungContext';
import { KommentarSuperscript, VerweisSuperscript } from './markierungsAnzeige';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

function mitTextbezug(markierung: MarkierungsEintrag): MarkierungsEintrag {
  return markierungsEintrag({
    ...markierung,
    bezug: {
      typ: 'bezugstext',
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
      bezugstext: '',
    },
  });
}

const dom = domTestWurzel();
beforeEach(() => document.body.append(dom.host));
afterEach(() => {
  window.getSelection()!.removeAllRanges();
  dom.host.remove();
});

it('schützt pauschale Verweise über Zielgrenzen mit ausdrücklichen Zitatregeln', async () => {
  const verweistext = '§ 9999 Abs. 1 I 2 ZPO';
  const ziel = verweisziel({
    typ: 'zielnormOhneElementstand',
    bezeichnung: '§ 9999',
    verweistextZeichenbereich: [1, verweistext.length] as [number, number],
  });
  const markierung: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    verweisinhalt: {
      verweistext,
      verweisziele: [ziel],
    },
  });
  const zweite: MarkierungsEintrag = markierungsEintrag({
    ...markierung,
    verweisinhalt: {
      verweistext: 'Art. 1',
      verweisziele: [
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: 'Art. 1',
          verweistextZeichenbereich: [0, 6],
        }),
      ],
    },
  });
  const original = structuredClone([markierung, zweite]);
  const rechts = vi.fn();
  const navigation = vi.fn();
  await act(async () =>
    dom.root.render(
      <MarkierungCtx.Provider
        value={{
          markierungenNachXmlId: new Map(),
          onMarkierungRechtsklick: rechts,
          onVerweisKlick: navigation,
        }}
      >
        <VerweisSuperscript
          markierungen={[markierung, zweite, mitTextbezug(markierung)]}
          ausgangsXmlId="n1"
        />
      </MarkierungCtx.Provider>,
    ),
  );
  expect(dom.host.textContent).toBe(' §\u00a09999 Abs.\u00a01 I\u00a02 ZPO; Art.\u00a01');
  const gruppen = [...dom.host.querySelectorAll('span')].filter(
    (el) => el.style.whiteSpace === 'nowrap',
  );
  expect(gruppen.map((el) => el.textContent)).toEqual([
    '§\u00a09999',
    'Abs.\u00a01',
    'I\u00a02',
    'Art.\u00a01',
  ]);
  const links = [...dom.host.querySelectorAll('span')].filter(
    (el) => el.style.cursor === 'pointer',
  );
  const erstesZiel = links.find((el) => el.textContent?.endsWith('9999'))!;
  await act(async () => {
    erstesZiel.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    erstesZiel.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  expect(navigation).toHaveBeenCalledExactlyOnceWith('n1', ziel, true);
  expect(rechts).toHaveBeenCalledExactlyOnceWith('n1', markierung);
  const range = document.createRange();
  range.selectNodeContents(erstesZiel);
  window.getSelection()!.addRange(range);
  navigation.mockClear();
  await act(async () => erstesZiel.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(navigation).not.toHaveBeenCalled();
  expect([markierung, zweite]).toEqual(original);
});

it('behält pauschale Kommentare als Symbolanzeige und erreicht den ursprünglichen Eintrag', async () => {
  const markierung: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'Art.  1\tAbs. 1\n§ 9999',
  });
  const original = structuredClone(markierung);
  const klick = vi.fn();
  const rechts = vi.fn();
  await act(async () =>
    dom.root.render(
      <MarkierungCtx.Provider
        value={{
          markierungenNachXmlId: new Map(),
          onKommentarKlick: klick,
          onMarkierungRechtsklick: rechts,
        }}
      >
        <KommentarSuperscript
          markierungen={[markierung, mitTextbezug(markierung)]}
          ausgangsXmlId="n1"
        />
      </MarkierungCtx.Provider>,
    ),
  );
  expect(dom.host.textContent).toBe('ⓘ');
  const symbol = dom.host.querySelector('[data-zitatanhang]')!;
  await act(async () => {
    symbol.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    symbol.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  expect(klick).toHaveBeenCalledExactlyOnceWith('n1', markierung);
  expect(rechts).toHaveBeenCalledExactlyOnceWith('n1', markierung);
  expect(markierung).toEqual(original);
});
