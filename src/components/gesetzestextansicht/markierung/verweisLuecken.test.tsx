// @vitest-environment jsdom
// verweisLuecken.test.tsx
// Vollständiger Verweistext und Navigation bleiben bei Lücken zwischen Verweiszielen erhalten.
import { getaggterVerweis } from '@/test/gesetz/textauszeichnungFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import type { VerweisInhalt, Verweisziel } from '@/lib/markierungen/markierungen.index';
import { MarkierungCtx } from './markierungContext';
import { GetaggterVerweisText, VerweisAnzeige } from './markierungsBausteine';
import { geschuetzterBlatttext } from './darstellungstext';

const dom = domTestWurzel();
beforeEach(() => document.body.append(dom.host));
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  dom.host.remove();
});

it.each([false, true])(
  'zeigt Anfang, Zwischenräume und Ende ohne Ziel (Bestandsformat: %s)',
  async (bestand) => {
    const erstes: Verweisziel = verweisziel({
      typ: 'zielnormOhneElementstand',
      bezeichnung: '1',
      verweistextZeichenbereich: [4, 6],
    });
    const zweites: Verweisziel = verweisziel({
      typ: 'zielnormOhneElementstand',
      bezeichnung: '2',
      verweistextZeichenbereich: [14, 17],
    });
    const verweisinhalt: VerweisInhalt = {
      verweistext: 'vor § 1 sowie § 2 danach',
      verweisziele: bestand ? [erstes, zweites] : [erstes, zweites],
    };
    const navigation = vi.fn();
    await act(async () =>
      dom.root.render(
        <MarkierungCtx.Provider
          value={{ markierungenNachXmlId: new Map(), onVerweisKlick: navigation }}
        >
          <VerweisAnzeige verweisinhalt={verweisinhalt} ausgangsXmlId="n1" />
        </MarkierungCtx.Provider>,
      ),
    );
    expect(dom.host.textContent).toBe(' vor §\u00a01 sowie §\u00a02 danach');
    const gruppen = [...dom.host.querySelectorAll('span')].filter(
      (el) => el.style.whiteSpace === 'nowrap',
    );
    expect(gruppen.map((el) => el.textContent)).toEqual(['§\u00a01', '§\u00a02']);
    const links = [...dom.host.querySelectorAll('span')].filter(
      (el) => el.style.cursor === 'pointer',
    );
    expect(links.map((el) => el.textContent)).toEqual(['§\u00a0', '§\u00a02']);
    await act(async () => {
      for (const link of links)
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    });
    expect(navigation.mock.calls).toEqual([
      ['n1', erstes, true],
      ['n1', zweites, true],
    ]);
    navigation.mockClear();
    await act(async () => {
      for (const span of dom.host.querySelectorAll('span')) {
        if (!span.closest('[style*="cursor: pointer"]'))
          span.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
    expect(navigation).not.toHaveBeenCalled();
  },
);

it('zeigt auch einen Verweis ohne Verweisziele vollständig', async () => {
  await act(async () =>
    dom.root.render(
      <VerweisAnzeige verweisinhalt={{ verweistext: 'Abs. 3 allein', verweisziele: [] }} />,
    ),
  );
  expect(dom.host.textContent).toBe(' Abs.\u00a03 allein');
  expect(dom.host.querySelector('[style*="cursor: pointer"]')).toBeNull();
});

it('verwendet beim getaggten Verweis weiterhin das erste tatsächliche Ziel', async () => {
  const ziel = { typ: 'getaggterVerweis', zielBezeichnung: '§ 1', zielgesetz: undefined };
  const navigation = vi.fn();
  await act(async () =>
    dom.root.render(
      <MarkierungCtx.Provider
        value={{ markierungenNachXmlId: new Map(), onVerweisKlick: navigation }}
      >
        <GetaggterVerweisText
          text={geschuetzterBlatttext('vor § 1')}
          ausgangsXmlId="n1"
          verweis={getaggterVerweis({ zielBezeichnung: '§ 1' })}
        />
      </MarkierungCtx.Provider>,
    ),
  );
  const link = dom.host.querySelector('[style*="cursor: pointer"]');
  expect(link).not.toBeNull();
  await act(async () => link?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(navigation).toHaveBeenCalledExactlyOnceWith('n1', ziel, false);
});

it('macht im gemischten Verweis nur Norm und ganzes Gesetz klickbar', async () => {
  const text = '§ 6 EGBGB, Abs. 3 und GG';
  const ziele: Verweisziel[] = [
    verweisziel({
      typ: 'zielnormOhneElementstand',
      gesetz: { kurztitel: 'EGBGB', normgeber: 'de-bund' },
      bezeichnung: '6',
      verweistextZeichenbereich: [0, 9],
    }),
    verweisziel({
      typ: 'ganzesGesetz',
      gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
      verweistextZeichenbereich: [text.length - 2, text.length],
    }),
  ];
  const navigation = vi.fn();
  await act(async () =>
    dom.root.render(
      <MarkierungCtx.Provider
        value={{ markierungenNachXmlId: new Map(), onVerweisKlick: navigation }}
      >
        <VerweisAnzeige
          verweisinhalt={{ verweistext: text, verweisziele: ziele }}
          ausgangsXmlId="n1"
        />
      </MarkierungCtx.Provider>,
    ),
  );
  expect(dom.host.textContent?.replaceAll('\u00a0', ' ')).toBe(` ${text}`);
  const links = [...dom.host.querySelectorAll<HTMLElement>('[style*="cursor: pointer"]')];
  expect(links.map((el) => el.textContent?.replaceAll('\u00a0', ' '))).toEqual([
    '§ 6',
    ' EGBGB',
    'GG',
  ]);
  await act(async () => {
    links.forEach((el) => el.click());
  });
  expect(navigation.mock.calls.map((aufruf) => aufruf[1])).toEqual([ziele[0], ziele[0], ziele[1]]);
});
