// textBlatt.test.tsx
// Rechtsklick muss den tatsächlichen gespeicherten Eintrag erreichen.

import { getaggterVerweis } from '@/test/gesetz/textauszeichnungFabrik';
import type { GetaggterVerweis } from '@/lib/domain/gesetzTypes';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import type { FunctionComponent, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import { TextBlatt as OriginalTextBlatt } from './textBlatt';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const rechtsklick = vi.hoisted(() => vi.fn());
const verweisKlick = vi.hoisted(() => vi.fn());
const kommentarKlick = vi.hoisted(() => vi.fn());
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useContext: () => ({
    onMarkierungRechtsklick: rechtsklick,
    onVerweisKlick: verweisKlick,
    onKommentarKlick: kommentarKlick,
  }),
}));

function elemente(knoten: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(knoten)) return knoten.flatMap(elemente);
  if (!knoten || typeof knoten !== 'object' || !('props' in knoten)) return [];
  const el = knoten as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') {
    return elemente((el.type as FunctionComponent<Record<string, unknown>>)(el.props));
  }
  return [el, ...elemente(el.props.children)];
}

beforeEach(() => {
  rechtsklick.mockClear();
  verweisKlick.mockClear();
  kommentarKlick.mockClear();
});

it.each(['unterstreichung', 'hervorhebung', 'verweismarkierung', 'kommentar'] as const)(
  'ordnet Rechtsklick bei angrenzenden %s-Einträgen einzeln zu',
  (typ) => {
    const markierungen: MarkierungsEintrag[] = [0, 1].map((index) =>
      markierungsEintrag({
        typ,
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ satz: 1 }),
            zeichenbereichStart: index === 0 ? 0 : 4,
            zeichenbereichEnde: index === 0 ? 4 : 10,
          },
          bezugstext: index === 0 ? 'auf ' : 'Antrag',
        },
      }),
    );
    const handler = elemente(
      TextBlatt({
        text: 'auf Antrag',
        pfad: normtextPfad({ satz: 1 }),
        markierungen,
        style: {},
        ausgangsXmlId: 'n1',
      }),
    ).filter((el) => el.props.onContextMenu);
    expect(handler).toHaveLength(2);
    for (const [index, el] of handler.entries()) {
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      (el.props.onContextMenu as (e: unknown) => void)(event);
      expect(rechtsklick).toHaveBeenLastCalledWith('n1', markierungen[index]);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
  },
);

it.each(['auf Antrag', 'auf  Antrag', 'auf\tAntrag', 'auf\nAntrag', '§\u00a01  Antrag'])(
  'erhält alle DOM-Zeichen bei der Unterstreichungsdarstellung von %j',
  (text) => {
    const markup = renderToStaticMarkup(
      <TextBlatt
        text={text}
        pfad={normtextPfad({ satz: 1 })}
        markierungen={[
          markierungsEintrag({
            typ: 'unterstreichung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({ satz: 1 }),
                zeichenbereichStart: 0,
                zeichenbereichEnde: text.length,
              },
              bezugstext: text,
            },
          }),
        ]}
        style={{}}
      />,
    );
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    expect(doc.querySelector('[data-leaf]')!.textContent).toBe(text);
  },
);

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'getaggter Verweis bleibt im %s-Bereich klickbar und bearbeitbar',
  (typ) => {
    const ziel = { typ: 'getaggterVerweis', zielBezeichnung: '§ 77', zielgesetz: undefined };
    const nutzer: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ satz: 1 }),
          zeichenbereichStart: 5,
          zeichenbereichEnde: 11,
        },
        bezugstext: '',
      },
    });
    const knoten = elemente(
      TextBlatt({
        text: '§ 77 Absatz 2',
        pfad: normtextPfad({ satz: 1 }),
        style: {},
        ausgangsXmlId: 'n1',
        markierungen: [
          getaggterVerweis({
            textstelle: {
              pfad: nutzer.bezug.textstelle.pfad,
              zeichenbereichStart: 0,
              zeichenbereichEnde: 13,
            },
            zielBezeichnung: '§ 77',
          }),
          nutzer,
        ],
      }),
    );
    const markiert = knoten.find((el) => el.props.onContextMenu);
    const link = elemente(markiert?.props.children).find((el) => el.props.onClick);
    expect(link).toBeDefined();
    expect(markiert).toBeDefined();
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => '' }) });
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn(), ctrlKey: true };
    try {
      (link!.props.onClick as (e: unknown) => void)(event);
      expect(verweisKlick).toHaveBeenLastCalledWith('n1', ziel, true);
      (markiert!.props.onContextMenu as (e: unknown) => void)(event);
      expect(rechtsklick).toHaveBeenLastCalledWith('n1', nutzer);
      verweisKlick.mockClear();
      vi.stubGlobal('window', { getSelection: () => ({ toString: () => 'Absatz' }) });
      (link!.props.onClick as (e: unknown) => void)(event);
      expect(verweisKlick).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

function ueberlagerteMarkierungen(
  typ: 'hervorhebung' | 'kommentar',
): (MarkierungsEintrag | GetaggterVerweis)[] {
  const text = 'Siehe §\u00a01 und §\u00a02 heute';
  return [
    markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 3'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ satz: 1 }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: text.length,
        },
        bezugstext: '',
      },

      kommentarText: typ === 'kommentar' ? 'Kommentar' : undefined,
    }),
    ...[6, 14].map((start, i) =>
      getaggterVerweis({
        textstelle: {
          pfad: normtextPfad({ satz: 1 }),
          zeichenbereichStart: start,
          zeichenbereichEnde: start + 3,
        },
        zielBezeichnung: `§ ${i + 1}`,
      }),
    ),
  ];
}
it('zeichnet eine lückenlose Hervorhebungsfläche mit Verweisunterstreichung über geschützte Räume hinweg', () => {
  const markup = renderToStaticMarkup(
    <TextBlatt
      text={'Siehe §\u00a01 und §\u00a02 heute'}
      pfad={normtextPfad({ satz: 1 })}
      style={{}}
      ausgangsXmlId="n3"
      markierungen={ueberlagerteMarkierungen('hervorhebung')}
    />,
  );
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const hintergruende = [...doc.querySelectorAll('span')].filter((el) =>
    el.getAttribute('style')?.includes('background:'),
  );
  expect(hintergruende.map((el) => el.textContent).join('')).toBe(
    'Siehe §\u00a01 und §\u00a02 heute',
  );
  for (const [index, el] of hintergruende.entries()) {
    expect(el.getAttribute('style')).toContain(`border-top-left-radius:${index === 0 ? 2 : 0}`);
    expect(el.getAttribute('style')).toContain(
      `border-top-right-radius:${index === hintergruende.length - 1 ? 2 : 0}`,
    );
  }
  const linien = [...doc.querySelectorAll('span')].filter((el) =>
    el.getAttribute('style')?.includes('text-decoration:underline'),
  );
  expect(linien.map((el) => el.textContent).join('')).toBe('§\u00a01§\u00a02');
});
it('Kommentartext öffnet die jeweiligen Verweise; nur ein abschließendes ⓘ öffnet den Kommentar', () => {
  const markierungen = ueberlagerteMarkierungen('kommentar');
  const knoten = elemente(
    TextBlatt({
      text: 'Siehe §\u00a01 und §\u00a02 heute',
      pfad: normtextPfad({ satz: 1 }),
      style: {},
      ausgangsXmlId: 'n3',
      markierungen,
    }),
  );
  const icons = knoten.filter((el) => el.props['data-zitatanhang'] !== undefined);
  const links = knoten.filter(
    (el) => el.props.onClick && el.props['data-zitatanhang'] === undefined,
  );
  expect(icons).toHaveLength(1);
  expect(links).toHaveLength(2);
  const event = { stopPropagation: vi.fn(), preventDefault: vi.fn(), metaKey: true };
  vi.stubGlobal('window', { getSelection: () => ({ toString: () => '' }) });
  try {
    for (const [i, link] of links.entries()) {
      (link.props.onClick as (e: unknown) => void)(event);
      expect(verweisKlick).toHaveBeenLastCalledWith(
        'n3',
        { typ: 'getaggterVerweis', zielBezeichnung: `§ ${i + 1}`, zielgesetz: undefined },
        true,
      );
      expect(kommentarKlick).not.toHaveBeenCalled();
    }
    verweisKlick.mockClear();
    (icons[0]!.props.onClick as (e: unknown) => void)(event);
    expect(kommentarKlick).toHaveBeenLastCalledWith('n3', markierungen[0]);
    expect(verweisKlick).not.toHaveBeenCalled();
    const rechts = knoten.filter((el) => el.props.onContextMenu);
    expect(rechts).toHaveLength(5);
    for (const el of rechts) {
      (el.props.onContextMenu as (e: unknown) => void)(event);
      expect(rechtsklick).toHaveBeenLastCalledWith('n3', markierungen[0]);
    }
  } finally {
    vi.unstubAllGlobals();
  }
  const markup = renderToStaticMarkup(
    <TextBlatt
      text={'Siehe §\u00a01 und §\u00a02 heute'}
      pfad={normtextPfad({ satz: 1 })}
      style={{}}
      markierungen={markierungen}
    />,
  );
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  expect(doc.querySelector('[data-leaf]')?.textContent).toBe('Siehe §\u00a01 und §\u00a02 heuteⓘ');
});

function blattDokument(
  text: string,
  markierungen: (MarkierungsEintrag | GetaggterVerweis)[],
  versatz = 0,
) {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <TextBlatt
        text={text}
        pfad={normtextPfad({ satz: 1 })}
        markierungen={markierungen}
        style={{}}
        versatz={versatz}
        ausgangsXmlId="n1"
      />,
    ),
    'text/html',
  );
}

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'schützt die ganze Normangabe über jede einzelne %s-Grenze hinweg',
  (typ) => {
    for (const [von, bis] of [
      [0, 1],
      [2, 6],
      [1, 2],
    ]) {
      const markierung: MarkierungsEintrag = markierungsEintrag({
        typ,
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ satz: 1 }),
            zeichenbereichStart: von!,
            zeichenbereichEnde: bis!,
          },
          bezugstext: '§ 9999 Abs. 1'.slice(von, bis),
        },
      });
      const original = structuredClone(markierung);
      const doc = blattDokument('§ 9999 Abs. 1', [markierung]);
      const gruppen = [...doc.querySelectorAll('span')].filter((el) =>
        el.getAttribute('style')?.includes('white-space:nowrap'),
      );
      expect(gruppen.map((el) => el.textContent)).toContain('§\u00a09999');
      expect(gruppen.map((el) => el.textContent)).toContain('Abs.\u00a01');
      const deko = [...doc.querySelectorAll('span')].filter((el) =>
        el
          .getAttribute('style')
          ?.includes(typ === 'hervorhebung' ? 'background:' : 'text-decoration:underline'),
      );
      expect(deko.map((el) => el.textContent).join('')).toBe(
        '§\u00a09999 Abs.\u00a01'.slice(von, bis),
      );
      const box = [...doc.querySelectorAll('span')].find((el) =>
        el.getAttribute('style')?.includes('display:inline-block'),
      );
      expect(box?.textContent).toBe('\u00a0');
      expect(markierung).toEqual(original);
    }
  },
);

it('hält eine Normangabe über die getaggte Linkgrenze zusammen', () => {
  const ziel = { typ: 'getaggterVerweis', zielBezeichnung: '§ 9999', zielgesetz: undefined };
  const markierung = getaggterVerweis({
    textstelle: { pfad: normtextPfad({ satz: 1 }), zeichenbereichStart: 1, zeichenbereichEnde: 6 },
    zielBezeichnung: '§ 9999',
  });
  const doc = blattDokument('§ 9999 Abs. 1', [markierung]);
  const knoten = elemente(
    TextBlatt({
      text: '§ 9999 Abs. 1',
      pfad: normtextPfad({ satz: 1 }),
      markierungen: [markierung],
      style: {},
      ausgangsXmlId: 'n1',
    }),
  );
  const link = knoten.find((el) => el.props.onClick)!;
  expect(link).toBeDefined();
  expect(knoten.some((el) => el.props.onContextMenu)).toBe(false);
  const event = { stopPropagation: vi.fn(), ctrlKey: true };
  vi.stubGlobal('window', { getSelection: () => ({ toString: () => '' }) });
  try {
    (link.props.onClick as (e: unknown) => void)(event);
    expect(verweisKlick).toHaveBeenLastCalledWith('n1', ziel, true);
    verweisKlick.mockClear();
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => '9999' }) });
    (link.props.onClick as (e: unknown) => void)(event);
    expect(verweisKlick).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
  expect(
    [...doc.querySelectorAll('span')].some(
      (el) =>
        el.getAttribute('style')?.includes('white-space:nowrap') &&
        el.textContent === '§\u00a09999',
    ),
  ).toBe(true);
});

it.each(['verweismarkierung', 'kommentar'] as const)(
  'fügt bei gruppenübergreifendem %s nur einen Anhang am ursprünglichen Ende an',
  (typ) => {
    const text = '😀 § 9999 Abs. 1';
    const versatz = 9;
    const markierung: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ satz: 1 }),
          zeichenbereichStart: versatz,
          zeichenbereichEnde: versatz + text.length,
        },
        bezugstext: text,
      },

      verweisinhalt:
        typ === 'verweismarkierung'
          ? {
              verweistext: 'Art. 1',
              verweisziele: [
                verweisziel({
                  typ: 'zielnormOhneElementstand',
                  bezeichnung: 'Art. 1',
                  verweistextZeichenbereich: [0, 6],
                }),
              ],
            }
          : undefined,
    });
    const original = structuredClone(markierung);
    const doc = blattDokument(text, [markierung], versatz);
    const blatt = doc.querySelector('[data-leaf]')!;
    expect(blatt.getAttribute('data-zeichen-versatz')).toBe(String(versatz));
    expect(blatt.getAttribute('data-satz')).toBe('1');
    const anhaenge = [...blatt.querySelectorAll('[data-zitatanhang]')];
    expect(anhaenge).toHaveLength(1);
    expect(blatt.textContent?.endsWith(anhaenge[0]!.textContent)).toBe(true);
    anhaenge.forEach((el) => el.remove());
    expect(blatt.textContent).toBe('😀 §\u00a09999 Abs.\u00a01');
    expect(blatt.textContent.length).toBe(text.length);
    expect(markierung).toEqual(original);
  },
);

it.each(['verweismarkierung', 'kommentar'] as const)(
  'alle Darstellungsteile eines %s erreichen den ursprünglichen Eintrag',
  (typ) => {
    const ziel = verweisziel({
      typ: 'zielnormOhneElementstand',
      bezeichnung: 'Art. 1',
      verweistextZeichenbereich: [0, 6] as [number, number],
    });
    const text = '§ 9999 Abs. 1';
    const markierung: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ satz: 1 }),
          zeichenbereichStart: 7,
          zeichenbereichEnde: 7 + text.length,
        },
        bezugstext: '',
      },

      verweisinhalt: { verweistext: 'Art. 1', verweisziele: [ziel] },
    });
    const knoten = elemente(
      TextBlatt({
        text,
        pfad: normtextPfad({ satz: 1 }),
        markierungen: [markierung],
        style: {},
        versatz: 7,
        ausgangsXmlId: 'n1',
      }),
    );
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn(), ctrlKey: true };
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => '' }) });
    try {
      const rechts = knoten.filter((el) => el.props.onContextMenu);
      expect(rechts.length).toBeGreaterThan(1);
      for (const el of rechts) {
        (el.props.onContextMenu as (e: unknown) => void)(event);
        expect(rechtsklick).toHaveBeenLastCalledWith('n1', markierung);
      }
      const klicks = knoten.filter((el) => el.props.onClick);
      for (const el of klicks) {
        (el.props.onClick as (e: unknown) => void)(event);
        if (typ === 'verweismarkierung')
          expect(verweisKlick).toHaveBeenLastCalledWith('n1', ziel, true);
        else expect(kommentarKlick).toHaveBeenLastCalledWith('n1', markierung);
      }
      kommentarKlick.mockClear();
      verweisKlick.mockClear();
      vi.stubGlobal('window', { getSelection: () => ({ toString: () => '§ 9999' }) });
      for (const el of klicks) (el.props.onClick as (e: unknown) => void)(event);
      expect(verweisKlick).not.toHaveBeenCalled();
      expect(kommentarKlick).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it('schützt und dekoriert jeden Raum einer gemischten Abstandfolge ohne Positionsänderung', () => {
  const text = '§ \u00a0 9999';
  const doc = blattDokument(text, [
    markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ satz: 1 }),
          zeichenbereichStart: 1,
          zeichenbereichEnde: 4,
        },
        bezugstext: '',
      },
    }),
  ]);
  const gruppe = [...doc.querySelectorAll('span')].find(
    (el) =>
      el.getAttribute('style')?.includes('white-space:nowrap') &&
      el.textContent === '§\u00a0\u00a0\u00a09999',
  );
  expect(gruppe).toBeDefined();
  const boxen = [...gruppe!.querySelectorAll('span')].filter((el) =>
    el.getAttribute('style')?.includes('display:inline-block'),
  );
  expect(boxen).toHaveLength(3);
  for (const box of boxen) {
    expect(box.textContent).toBe('\u00a0');
    expect(box.getAttribute('style')).toContain('text-decoration:underline');
  }
  expect(doc.querySelector('[data-leaf]')?.textContent?.length).toBe(text.length);
});

it('verwendet im Basistext die allgemeinen Regeln ohne römische Zitatkurzformen', () => {
  const original = '😀 § 9999 I 2 Abs. 1 danach';
  const doc = blattDokument(original, []);
  expect(doc.querySelector('[data-leaf]')?.textContent).toBe(
    '😀 §\u00a09999 I 2 Abs.\u00a01 danach',
  );
  const gruppen = [...doc.querySelectorAll('span')].filter((el) =>
    el.getAttribute('style')?.includes('white-space:nowrap'),
  );
  expect([...new Set(gruppen.map((el) => el.textContent))]).toEqual(['§\u00a09999', 'Abs.\u00a01']);
  expect(doc.querySelector('[data-leaf]')?.textContent?.length).toBe(original.length);
});

function TextBlatt({
  markierungen,
  ...props
}: Omit<Parameters<typeof OriginalTextBlatt>[0], 'markierungen'> & {
  markierungen: (MarkierungsEintrag | GetaggterVerweis)[];
}) {
  return OriginalTextBlatt({
    ...props,
    markierungen: markierungen.filter((m): m is MarkierungsEintrag => 'typ' in m),
    getaggteVerweise: markierungen
      .filter((m): m is GetaggterVerweis => !('typ' in m))
      .map((verweis) => ({ typ: 'getaggterVerweis', verweis })),
  });
}
