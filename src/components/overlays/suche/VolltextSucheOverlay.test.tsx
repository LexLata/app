// @vitest-environment jsdom
// VolltextSucheOverlay.test.tsx
// Öffentliche Overlay-Verträge und exklusive Volltext-Suchmodi werden bei der Typprüfung gesichert.
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { afterEach, assert, beforeEach, expect, expectTypeOf, it, vi } from 'vitest';
import { act, useState } from 'react';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import * as nachbearbeitung from '@/lib/domain/basis/textNachbearbeitung';
import { VolltextSucheOverlay } from './VolltextSucheOverlay';
import {
  baueSuchIndexFuerGesetz,
  extrahiereKontext,
  tokenisiere,
} from './VolltextSucheOverlay.helpers';
import type { ComponentProps } from 'react';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { OeffnenOverlayProps } from './OeffnenOverlay';
import type { AktualisierenOverlayProps } from '@/components/overlays/standard/AktualisierenOverlay';
import type { DateiImportOverlayProps } from '@/components/overlays/standard/DateiImportOverlay';
import type { ExportOverlayProps } from '@/components/overlays/standard/ExportOverlay';
import type { FavoritenHinzufuegenOverlayProps } from '@/components/overlays/standard/FavoritenHinzufuegenOverlay';
import type { GesetzesuebersichtProps } from '@/components/overlays/standard/Gesetzesuebersicht';
import type { GesetzInfoOverlayProps } from '@/components/overlays/standard/GesetzInfoOverlay';
import type { ImportindexOverlayProps } from '@/components/overlays/standard/ImportindexOverlay';
import type { LinuxTitelleistenAbfrageProps } from '@/components/overlays/standard/LinuxTitelleistenAbfrage';
import type { VerlaufOverlayProps } from '@/components/overlays/standard/VerlaufOverlay';
import type { VolltextSucheOverlayProps } from './VolltextSucheOverlay';
import type { TrefferZeileProps } from './OeffnenTrefferZeile';

type Fassade = typeof import('@/components/overlays/overlays.index');
type Vertraege = {
  AktualisierenOverlay: AktualisierenOverlayProps;
  DateiImportOverlay: DateiImportOverlayProps;
  ExportOverlay: ExportOverlayProps;
  FavoritenHinzufuegenOverlay: FavoritenHinzufuegenOverlayProps;
  Gesetzesuebersicht: GesetzesuebersichtProps;
  GesetzInfoOverlay: GesetzInfoOverlayProps;
  OeffnenOverlay: OeffnenOverlayProps;
  ImportindexOverlay: ImportindexOverlayProps;
  LinuxTitelleistenAbfrage: LinuxTitelleistenAbfrageProps;
  VerlaufOverlay: VerlaufOverlayProps;
  VolltextSucheOverlay: VolltextSucheOverlayProps;
  TrefferZeile: TrefferZeileProps;
};

it('exportiert die tatsächlichen Komponentenverträge über die Fassade', () => {
  expectTypeOf<Vertraege>().toEqualTypeOf<{
    [Name in keyof Vertraege]: ComponentProps<Fassade[Name]>;
  }>();
});

it('erlaubt genau Einzel- oder Alle-Modus mit den gemeinsamen Callbacks', () => {
  const gesetz: GesetzDarstellung = gesetzDarstellung({
    kurztitel: 'BGB',
    langtitel: 'Bürgerliches Gesetzbuch',
    hatGliederungsartikel: false,
    elemente: [],
  });
  const gemeinsam = {
    onSchliessen: () => {},
    onNormNavigieren: (_gesetz: GesetzDarstellung, _normXmlId: string) => {},
    minimalistischerModus: true,
    onModusUmschalten: () => {},
  };
  expectTypeOf({ ...gemeinsam, gesetz }).toExtend<VolltextSucheOverlayProps>();
  expectTypeOf({
    ...gemeinsam,
    onNormNavigieren: () => {},
    suchstand: suchstand([gesetz]),
  }).toExtend<VolltextSucheOverlayProps>();
  expectTypeOf({
    ...gemeinsam,
    onNormNavigieren: () => {},
    suchstand: suchstand([]),
  }).toExtend<VolltextSucheOverlayProps>();
  expectTypeOf({
    ...gemeinsam,
    gesetz,
    suchstand: suchstand([gesetz]),
    // @ts-expect-error Beide Suchbereiche zugleich sind kein gültiger Vertrag.
  }).toExtend<VolltextSucheOverlayProps>();
  // @ts-expect-error Ohne Suchbereich ist kein Modus bestimmt.
  expectTypeOf(gemeinsam).toExtend<VolltextSucheOverlayProps>();
});

function suchstand(gesetze: GesetzDarstellung[]) {
  return {
    eintraege: gesetze.flatMap(baueSuchIndexFuerGesetz),
    erledigt: gesetze.length,
    gesamt: gesetze.length,
    vollstaendig: true,
  };
}

const dom = domTestWurzel();
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

function suchGesetz(text = '😀 § 9999 Abs. 1 ZPO I 2') {
  return parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>Art. 2 TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 7</bezeichnung><titel>Art. 3</titel><text><absatz zahl="(1)"><satz zahl="1">${text}</satz></absatz></text></norm></inhalt></gesetz>`,
  )!;
}

async function suche(query: string) {
  const input =
    dom.host.querySelector('input[type="text"]') ??
    dom.host.querySelector('input:not([type="checkbox"])');
  if (!(input instanceof HTMLInputElement)) throw new Error('Suchfeld fehlt');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toBe(query);
}

it.each(['§', '9999', 'Abs.', '§ 9999 Abs. 1', '9999 Abs.', '😀', 'I'])(
  'schützt zusammenhängenden Originalkontext beim Treffer %s vor der Hervorhebung',
  async (query) => {
    const gesetz = suchGesetz();
    const vorher = structuredClone(gesetz);
    const formatter = vi.spyOn(nachbearbeitung, 'schuetzeLeerzeichen');
    await act(async () =>
      dom.root.render(
        <VolltextSucheOverlay
          suchstand={suchstand([gesetz])}
          onSchliessen={() => {}}
          onNormNavigieren={() => {}}
        />,
      ),
    );
    await suche(query);
    const zeile = dom.host.querySelector('[data-idx="0"]')!;
    const kontext = zeile.lastElementChild!;
    const segmente = extrahiereKontext(
      baueSuchIndexFuerGesetz(gesetz)[0]!.volltext,
      tokenisiere(query),
    );
    const original = segmente.map((s) => s.text).join('');
    expect(formatter).toHaveBeenCalledWith(original);
    expect(kontext.textContent).toBe('Art.\u00a03 😀 §\u00a09999 Abs.\u00a01 ZPO I 2');
    expect([...kontext.querySelectorAll('strong')].map((s) => s.textContent).join('')).toBe(
      segmente
        .filter((s) => s.hervorgehoben)
        .map((s) => s.text.replaceAll(' ', '\u00a0'))
        .join(''),
    );
    for (const text of ['§\u00a09999', 'Abs.\u00a01']) {
      expect(
        [...kontext.querySelectorAll<HTMLElement>('span')].some(
          (s) => s.style.whiteSpace === 'nowrap' && s.textContent === text,
        ),
      ).toBe(true);
    }
    let position = 0;
    for (const segment of segmente) {
      if (segment.hervorgehoben) {
        const hervorhebung = [...kontext.querySelectorAll('strong')].find((el) => {
          const davor = document.createRange();
          davor.selectNodeContents(kontext);
          davor.setEndBefore(el);
          return davor.toString().length === position;
        });
        expect(hervorhebung?.textContent?.replaceAll('\u00a0', ' ')).toBe(segment.text);
      }
      position += segment.text.length;
    }
    expect(zeile.firstElementChild!.textContent).toBe('§\u00a07Art.\u00a02 TestGArt.\u00a03');
    expect(gesetz).toEqual(vorher);
  },
);

it.each([
  ['anfang', 'x'.repeat(100) + '§ 9999 ' + 'y'.repeat(86) + 'ziel ' + 'z'.repeat(150), 'ziel'],
  ['ende', 'ziel ' + 'x'.repeat(82) + ' Abs. 123456 ' + 'y'.repeat(150), 'ziel'],
  ['unvollständig', '😀 § Abs. Art. Nr. I 2', '😀'],
] as const)('erhält Ausschnittbegrenzung und Originalzeichen am %s', async (_fall, text, query) => {
  const gesetz = suchGesetz(text);
  await act(async () =>
    dom.root.render(
      <VolltextSucheOverlay gesetz={gesetz} onSchliessen={() => {}} onNormNavigieren={() => {}} />,
    ),
  );
  await suche(query);
  const kontext = dom.host.querySelector('[data-idx="0"]')!.lastElementChild!;
  const segmente = extrahiereKontext(
    baueSuchIndexFuerGesetz(gesetz)[0]!.volltext,
    tokenisiere(query),
  );
  const original = segmente.map((s) => s.text).join('');
  expect(kontext.textContent).toBe(nachbearbeitung.schuetzeLeerzeichen(original));
  expect(kontext.textContent!.replaceAll('\u00a0', ' ')).toBe(original);
  expect([...kontext.querySelectorAll('strong')].map((s) => s.textContent).join('')).toBe(query);
});

it.each(['Enter', 'Klick'] as const)(
  'erhält Suchwert, Moduswechsel und originale Navigation bei %s',
  async (aktion) => {
    const gesetz = suchGesetz();
    const schliessen = vi.fn();
    const navigation = vi.fn();
    const modus = vi.fn();
    await act(async () =>
      dom.root.render(
        <VolltextSucheOverlay
          gesetz={gesetz}
          onSchliessen={schliessen}
          onNormNavigieren={navigation}
          onModusUmschalten={modus}
        />,
      ),
    );
    await act(async () =>
      dom.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    expect(modus).toHaveBeenCalledTimes(1);
    await suche('§');
    const zeile = dom.host.querySelector<HTMLElement>('[data-idx="0"]')!;
    await act(async () => {
      if (aktion === 'Enter')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      else zeile.click();
    });
    expect(navigation).toHaveBeenCalledExactlyOnceWith(gesetz, 'n1');
    expect(navigation.mock.calls[0]![0]).toBe(gesetz);
    expect(schliessen.mock.invocationCallOrder[0]).toBeLessThan(
      navigation.mock.invocationCallOrder[0]!,
    );
  },
);

it.each(['Einzel', 'Alle'] as const)(
  'öffnet im %s-Modus den direkt angeklickten Treffer ohne vorherige Mausbewegung',
  async (modus) => {
    const gesetz = suchGesetz();
    const norm = gesetz.elemente[0]!;
    if (norm.typ !== 'norm') throw new Error('Norm fehlt');
    gesetz.elemente.push({ typ: 'norm', data: { ...norm.data, xmlId: 'n2' } });
    const schliessen = vi.fn();
    const navigation = vi.fn();
    const suchbereich = modus === 'Einzel' ? { gesetz } : { suchstand: suchstand([gesetz]) };
    await act(async () =>
      dom.root.render(
        <VolltextSucheOverlay
          {...suchbereich}
          onSchliessen={schliessen}
          onNormNavigieren={navigation}
        />,
      ),
    );
    await suche('9999');
    expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(2);
    await act(async () => dom.host.querySelector<HTMLElement>('[data-idx="1"]')!.click());
    expect(navigation).toHaveBeenCalledExactlyOnceWith(gesetz, 'n2');
    expect(schliessen).toHaveBeenCalledTimes(1);
    expect(schliessen.mock.invocationCallOrder[0]).toBeLessThan(
      navigation.mock.invocationCallOrder[0]!,
    );
  },
);

it('begrenzt Treffer auf 200, erhält Zählhinweis, Tastatur-/Mausauswahl und Kein-Ergebnis-Anzeige', async () => {
  const gesetz = suchGesetz();
  const norm = gesetz.elemente[0]!;
  if (norm.typ !== 'norm') throw new Error('Norm fehlt');
  gesetz.elemente = Array.from({ length: 202 }, (_, i) => ({
    typ: 'norm' as const,
    data: { ...norm.data, xmlId: `n${i}` },
  }));
  const vorher = structuredClone(gesetz);
  const navigation = vi.fn();
  const schliessen = vi.fn();
  await act(async () =>
    dom.root.render(
      <VolltextSucheOverlay
        gesetz={gesetz}
        onSchliessen={schliessen}
        onNormNavigieren={navigation}
      />,
    ),
  );
  await suche('9999');
  expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(200);
  expect(dom.host.textContent).toContain('2 weitere Treffer – Suche verfeinern');
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(navigation).toHaveBeenLastCalledWith(gesetz, 'n1');
  const zeile = dom.host.querySelector<HTMLElement>('[data-idx="2"]')!;
  await act(async () => zeile.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })));
  await act(async () => zeile.click());
  expect(navigation).toHaveBeenLastCalledWith(gesetz, 'n2');
  await suche('kein-treffer');
  expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(0);
  expect(dom.host.textContent).toContain('Kein Treffer');
  expect(gesetz).toEqual(vorher);
});

it('hält gleiche Norm-XML-IDs in namensgleichen Gesetzen verschiedener Normgeber getrennt', async () => {
  const fehler = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const gesetze = ['de-bund', 'de-bw', 'unbekannt'].map((normgeber) => ({
    ...suchGesetz('Suchwort'),

    normgeber,
  }));
  const navigieren = vi.fn();
  await act(async () =>
    dom.root.render(
      <VolltextSucheOverlay
        suchstand={suchstand(gesetze)}
        onSchliessen={vi.fn()}
        onNormNavigieren={navigieren}
      />,
    ),
  );
  await suche('suchwort');
  for (let i = 0; i < gesetze.length; i++) {
    if (i > 0)
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
      );
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(navigieren).toHaveBeenLastCalledWith(gesetze[i], 'n1');
  }
  expect(fehler).not.toHaveBeenCalled();
});

it('springt beim Treffer ausschließlich im Zusatztext zur Norm ohne Markierungsaktion', async () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><kurztitel>G</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung><text><absatz>A</absatz><tabelle>Tabellenwort</tabelle><absatz>B</absatz></text></norm></inhalt></gesetz>',
  );
  if (!gesetz) throw Error('Gesetz fehlt');
  const navigation = vi.fn();
  await act(async () =>
    dom.root.render(
      <VolltextSucheOverlay
        gesetz={gesetz}
        onSchliessen={() => {}}
        onNormNavigieren={navigation}
      />,
    ),
  );
  await suche('Tabellenwort');
  const zeile = dom.host.querySelector<HTMLElement>('[data-idx="0"]');
  if (!zeile) throw Error('Treffer fehlt');
  expect(zeile.textContent).toContain('Tabellenwort');
  await act(async () => zeile.click());
  expect(navigation).toHaveBeenCalledExactlyOnceWith(gesetz, 'n');
  expect(dom.host.querySelector('[data-leaf]')).toBeNull();
  expect(
    [...dom.host.querySelectorAll('button')].some((b) =>
      /unterstreich|hervorheb|kommentar|markier/i.test(b.textContent ?? ''),
    ),
  ).toBe(false);
});

it('passt den Platzhalter beim Umschalten des Suchbereichs in beide Richtungen an', async () => {
  const gesetz = suchGesetz();
  function Probe() {
    const [alle, setAlle] = useState(false);
    const gemeinsam = {
      onSchliessen: () => {},
      onNormNavigieren: () => {},
      onModusUmschalten: () => setAlle((wert) => !wert),
    };
    return alle ? (
      <VolltextSucheOverlay {...gemeinsam} suchstand={suchstand([gesetz])} />
    ) : (
      <VolltextSucheOverlay {...gemeinsam} gesetz={gesetz} />
    );
  }
  await act(async () => dom.root.render(<Probe />));
  const platzhalter = () =>
    dom.host.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.placeholder;
  expect(platzhalter()).toBe('Text im geöffneten Gesetz suchen …');
  const umschalten = async () => {
    const haken = dom.host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    assert(haken);
    await act(async () => haken.click());
  };
  await umschalten();
  expect(platzhalter()).toBe('Text in allen Gesetzen suchen …');
  await umschalten();
  expect(platzhalter()).toBe('Text im geöffneten Gesetz suchen …');
});

it('zeigt den Gesetzeskurztitel im Treffer genauso blau wie die Normbezeichnung', async () => {
  await act(async () =>
    dom.root.render(
      <VolltextSucheOverlay
        suchstand={suchstand([suchGesetz('Suchwort')])}
        onSchliessen={() => {}}
        onNormNavigieren={() => {}}
      />,
    ),
  );
  await suche('Suchwort');
  const kopf = dom.host.querySelector('[data-idx="0"]')?.firstElementChild;
  assert(kopf);
  const norm = kopf.children[0];
  const gesetz = kopf.children[1];
  assert(norm instanceof HTMLElement);
  assert(gesetz instanceof HTMLElement);
  expect(norm.style.color).toBe('var(--akzent)');
  expect(gesetz.style.color).toBe('var(--akzent)');
});
