// @vitest-environment jsdom
// textBlatt.auswahl.test.tsx
// Echte DOM-Ranges prüfen Schutzgruppen gegen Auswahl, textstelle und Rückwärtsauflösung.

import { gliederungsartikel } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { act, useEffect, type ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  aktuellerTextAnPfad,
  ermittleAuswahl,
  ermittleMehrfachAuswahl,
  textAnTextpfad,
  type Textpfad,
} from '@/lib/domain/textpfad/textpfad.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import { TextBlatt } from './textBlatt';
import { SaetzeListe } from './satzEintragBausteine';
import {
  TextDarstellungsRahmen,
  useTextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { NormBlock } from './normBlock';
import { UeberschriftZeile } from './ueberschriftZeile';
import { EinklappCtx } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import * as MarkierungAnzeige from '@/components/gesetzestextansicht/markierung/markierung.index';
import { getaggteVerweiseAlsTextauszeichnungen } from '@/components/gesetzestextansicht/markierung/markierung.index';
import { useZitatKopieren } from '@/components/gesetzestextansicht/auswahl/auswahl.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

function TestRahmen({ children }: { children: ReactElement }) {
  const modell = useTextDarstellungsModell({});
  return <TextDarstellungsRahmen modell={modell}>{children}</TextDarstellungsRahmen>;
}

const dom = domTestWurzel();
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  document.body.append(dom.host);
  window.getSelection()!.removeAllRanges();
});
afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()!.removeAllRanges();
  dom.host.remove();
});

function gesetzAus(inhalt: string) {
  return parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)">${inhalt}</absatz></text></norm></inhalt></gesetz>`,
  )!;
}
function normAus(inhalt: string) {
  const element = gesetzAus(inhalt).elemente[0]!;
  if (element.typ !== 'norm') throw new Error('Norm fehlt');
  return element.data;
}

// Grenzen liegen in den tatsächlich von React erzeugten Textknoten. Anhänge
// sind sichtbar, gehören aber nicht zum Zeichenbereich des Gesetzestextes.
function textGrenze(blatt: Element, position: number, ende = false): [Text, number] {
  const walker = document.createTreeWalker(blatt, NodeFilter.SHOW_TEXT);
  let versatz = 0;
  let knoten: Node | null;
  while ((knoten = walker.nextNode())) {
    if (knoten.parentElement?.closest('[data-zitatanhang]')) continue;
    const text = knoten as Text;
    const bis = versatz + text.length;
    if (position < bis || (ende && position === bis)) return [text, position - versatz];
    versatz = bis;
  }
  throw new Error(`Keine Textgrenze bei ${position}`);
}
function waehle(blatt: Element, von: number, bis: number): Selection {
  const range = document.createRange();
  range.setStart(...textGrenze(blatt, von));
  range.setEnd(...textGrenze(blatt, bis, true));
  const auswahl = window.getSelection()!;
  auswahl.removeAllRanges();
  auswahl.addRange(range);
  return auswahl;
}

const text = '😀 § 9999 Abs. 1 danach';
const anzeige = '😀 §\u00a09999 Abs.\u00a01 danach';
const pfad: Textpfad = normtextPfad({ absatz: '(1)', satz: 1 });

it.each(
  (['unterstreichung', 'hervorhebung'] as const).flatMap((typ) =>
    [
      [3, 4],
      [5, 9],
      [4, 5],
    ].map(([von, bis]) => ({ typ, von: von!, bis: bis! })),
  ),
)('erhält textstelle und Bezugstext über die $typ-Grenze $von–$bis', async ({ typ, von, bis }) => {
  const norm = normAus(`<satz zahl="1">${text}</satz>`);
  const markierung: MarkierungsEintrag = markierungsEintrag({
    typ,
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: { pfad, zeichenbereichStart: von, zeichenbereichEnde: bis },
      bezugstext: text.slice(von, bis),
    },
  });
  const original = structuredClone({ norm, markierung });
  await act(async () =>
    dom.root.render(
      <div data-xml-id="n1">
        <TextBlatt text={text} pfad={pfad} markierungen={[markierung]} style={{}} />
      </div>,
    ),
  );
  const blatt = dom.host.querySelector('[data-leaf]')!;
  expect(blatt.textContent).toBe(anzeige);
  expect(blatt.textContent.length).toBe(text.length);
  // Sowohl die markierten Einzelzeichen als auch eine Auswahl über sämtliche
  // dekorativen Grenzen ergeben unveränderte UTF-16-Positionen.
  for (const [start, ende] of [
    [von, bis],
    [3, 16],
    [0, 2],
  ]) {
    const selection = waehle(blatt, start!, ende!);
    expect(ermittleAuswahl(selection)).toEqual({
      textstelle: { pfad, zeichenbereichStart: start, zeichenbereichEnde: ende },
      xmlId: 'n1',
      bezugstext: anzeige.slice(start, ende),
    });
    expect(
      textAnTextpfad(norm, { pfad: pfad, zeichenbereichStart: start!, zeichenbereichEnde: ende! }),
    ).toBe(selection.toString());
    expect(ermittleMehrfachAuswahl(selection)).toEqual({ xmlId: 'n1', pfad });
  }
  expect({ norm, markierung }).toEqual(original);
});

it('erhält Auswahl und Rückwärtsauflösung über eine getaggte Verweisgrenze zwischen Präfix und Zahl', async () => {
  const norm = normAus(
    '<satz zahl="1">😀 §<verweis norm="§ 9999"> 9999</verweis> Abs. 1 danach</satz>',
  );
  const getaggteVerweise = getaggteVerweiseAlsTextauszeichnungen(norm);
  expect(getaggteVerweise[0]).toMatchObject({
    verweis: {
      textstelle: {
        pfad: { typ: 'normtext' as const },
        zeichenbereichStart: 5,
        zeichenbereichEnde: 9,
      },
    },
  });
  await act(async () =>
    dom.root.render(
      <div data-xml-id="n1">
        <TextBlatt
          text={text}
          pfad={pfad}
          markierungen={[]}
          getaggteVerweise={getaggteVerweise}
          style={{}}
        />
      </div>,
    ),
  );
  const selection = waehle(dom.host.querySelector('[data-leaf]')!, 3, 16);
  expect(ermittleAuswahl(selection)).toEqual({
    textstelle: { pfad, zeichenbereichStart: 3, zeichenbereichEnde: 16 },
    xmlId: 'n1',
    bezugstext: '§\u00a09999 Abs.\u00a01',
  });
  expect(textAnTextpfad(norm, { pfad: pfad, zeichenbereichStart: 3, zeichenbereichEnde: 16 })).toBe(
    selection.toString(),
  );
});

it.each(['verweismarkierung', 'kommentar'] as const)(
  'zählt einen in der Schutzgruppe liegenden %s-Anhang bei nachfolgender Auswahl nicht mit',
  async (typ) => {
    const norm = normAus(`<satz zahl="1">${text}</satz>`);
    const markierung: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad, zeichenbereichStart: 3, zeichenbereichEnde: 4 },
        bezugstext: '§',
      },

      kommentarText: 'Art.  1\tAbs. 1\n§ 9999',
      verweisinhalt: {
        verweistext: 'Art.  1 Abs. 2',
        verweisziele: [
          verweisziel({
            typ: 'zielnormOhneElementstand',
            bezeichnung: 'Art. 1',
            verweistextZeichenbereich: [0, 14],
          }),
        ],
      },
    });
    const original = structuredClone(markierung);
    await act(async () =>
      dom.root.render(
        <div data-xml-id="n1">
          <TextBlatt text={text} pfad={pfad} markierungen={[markierung]} style={{}} />
        </div>,
      ),
    );
    const blatt = dom.host.querySelector('[data-leaf]')!;
    const anhang = blatt.querySelector('[data-zitatanhang]')!;
    expect(anhang).not.toBeNull();
    const selection = waehle(blatt, 5, 16);
    expect(ermittleAuswahl(selection)).toEqual({
      textstelle: { pfad, zeichenbereichStart: 5, zeichenbereichEnde: 16 },
      xmlId: 'n1',
      bezugstext: '9999 Abs.\u00a01',
    });
    expect(
      textAnTextpfad(norm, { pfad: pfad, zeichenbereichStart: 5, zeichenbereichEnde: 16 }),
    ).toBe(selection.toString());
    // Auch eine Range, die den sichtbaren Anhang einschließt, zählt nur
    // Gesetzestextzeichen. Ihr Bezugstext bleibt der originale Selection-Text.
    const mitAnhang = waehle(blatt, 3, 16);
    expect(mitAnhang.toString()).toContain(anhang.textContent);
    expect(ermittleAuswahl(mitAnhang)).toEqual({
      textstelle: { pfad, zeichenbereichStart: 3, zeichenbereichEnde: 16 },
      xmlId: 'n1',
      bezugstext: mitAnhang.toString(),
    });
    expect(markierung).toEqual(original);
  },
);

it('erhält den vollständigen Eintragspfad und inneren Satz mit Emoji', async () => {
  const norm = normAus(
    '<satz zahl="1">Liste:<nummer zahl="1">Gruppe:<litera buchstabe="a"><satz zahl="2">😀 § 9999 Abs. 1 danach</satz></litera></nummer></satz>',
  );
  function Anzeige() {
    const modell = useTextDarstellungsModell({});
    return (
      <TextDarstellungsRahmen modell={modell}>
        <div data-xml-id="n1">
          <SaetzeListe
            saetze={norm.absaetze[0]!.saetze}
            satzNrBreite={10}
            schrift={16}
            satzNeuZeile={true}
            basisPfad={normtextPfad({ absatz: '(1)' })}
            satzFeld="satz"
            markierungen={[]}
          />
        </div>
      </TextDarstellungsRahmen>
    );
  }
  await act(async () => dom.root.render(<Anzeige />));
  const blatt = [...dom.host.querySelectorAll('[data-leaf]')].find((b) =>
    b.hasAttribute('data-satz-in-eintrag'),
  )!;
  const versatz = 3;
  const erwartet: Textpfad = {
    ...pfad,
    eintraege: [
      { ebene: 'nummer', bezeichnung: '1' },
      { ebene: 'litera', bezeichnung: 'a' },
    ],
    satzInEintrag: 2,
  };
  const selection = waehle(blatt, 3, 16);
  expect(ermittleAuswahl(selection)).toEqual({
    textstelle: { pfad: erwartet, zeichenbereichStart: versatz, zeichenbereichEnde: versatz + 13 },
    xmlId: 'n1',
    bezugstext: '§\u00a09999 Abs.\u00a01',
  });
  expect(
    textAnTextpfad(norm, {
      pfad: erwartet,
      zeichenbereichStart: versatz,
      zeichenbereichEnde: versatz + 13,
    }),
  ).toBe(selection.toString());
});

it.each(['satz', 'eintrag'] as const)(
  'erhält den Fortsetzungsversatz eines %s nach einer Liste',
  async (art) => {
    const inhalt =
      art === 'satz'
        ? '<satz zahl="1">😀 Anfang:<nummer zahl="1">Zwischen</nummer>§ 9999 Abs. 1 danach</satz>'
        : '<satz zahl="1"><nummer zahl="1">😀 Anfang:<litera buchstabe="a">Zwischen</litera>§ 9999 Abs. 1 danach</nummer></satz>';
    const norm = normAus(inhalt);
    const erwartet: Textpfad = {
      ...pfad,
      ...(art === 'eintrag'
        ? normtextPfad({ eintraege: [{ ebene: 'nummer' as const, bezeichnung: '1' }] })
        : normtextPfad({})),
    };
    const versatz = '😀 Anfang:'.length;
    const markierung: MarkierungsEintrag = markierungsEintrag({
      typ: 'hervorhebung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: erwartet,
          zeichenbereichStart: versatz + 1,
          zeichenbereichEnde: versatz + 2,
        },
        bezugstext: '',
      },
    });
    function Anzeige() {
      const modell = useTextDarstellungsModell({});
      return (
        <TextDarstellungsRahmen modell={modell}>
          <div data-xml-id="n1">
            <SaetzeListe
              saetze={norm.absaetze[0]!.saetze}
              satzNrBreite={10}
              schrift={16}
              satzNeuZeile={true}
              basisPfad={normtextPfad({ absatz: '(1)' })}
              satzFeld="satz"
              markierungen={[markierung]}
            />
          </div>
        </TextDarstellungsRahmen>
      );
    }
    await act(async () => dom.root.render(<Anzeige />));
    const blatt = [...dom.host.querySelectorAll('[data-leaf]')].find((b) =>
      b.hasAttribute('data-zeichen-versatz'),
    )!;
    expect(blatt.getAttribute('data-zeichen-versatz')).toBe(String(versatz));
    const selection = waehle(blatt, 0, 13);
    expect(ermittleAuswahl(selection)).toEqual({
      textstelle: {
        pfad: erwartet,
        zeichenbereichStart: versatz,
        zeichenbereichEnde: versatz + 13,
      },
      xmlId: 'n1',
      bezugstext: '§\u00a09999 Abs.\u00a01',
    });
    expect(
      textAnTextpfad(norm, {
        pfad: erwartet,
        zeichenbereichStart: versatz,
        zeichenbereichEnde: versatz + 13,
      }),
    ).toBe(selection.toString());
  },
);

it('kopiert aus der echten Auswahl ein fachliches Zitat mit ursprünglichen Leerzeichen', async () => {
  const gesetz = gesetzAus(`<satz zahl="1">${text}</satz>`);
  const original = structuredClone(gesetz);
  const schreiben = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText: schreiben } });
  let kopieren!: ReturnType<typeof useZitatKopieren>['kopieren'];
  function Anzeige() {
    const { kopieren: aktion } = useZitatKopieren(gesetz);
    useEffect(() => {
      kopieren = aktion;
    }, [aktion]);
    return (
      <TestRahmen>
        <div data-xml-id="n1">
          <SaetzeListe
            saetze={
              gesetz.elemente[0]!.typ === 'norm' ? gesetz.elemente[0]!.data.absaetze[0]!.saetze : []
            }
            satzNrBreite={10}
            schrift={16}
            satzNeuZeile={true}
            basisPfad={normtextPfad({ absatz: '(1)' })}
            satzFeld="satz"
            markierungen={[]}
          />
        </div>
      </TestRahmen>
    );
  }
  await act(async () => dom.root.render(<Anzeige />));
  const selection = waehle(dom.host.querySelector('[data-leaf]')!, 3, 16);
  const ziel = ermittleMehrfachAuswahl(selection);
  if ('fehler' in ziel) throw new Error(ziel.fehler);
  expect(await kopieren(ziel)).toBe(true);
  expect(schreiben).toHaveBeenCalledExactlyOnceWith('§ 1 Abs. 1 S. 1 TestG');
  expect(selection.toString()).toBe('§\u00a09999 Abs.\u00a01');
  expect(gesetz).toEqual(original);
});

it.each([
  'amtlicher Titel',
  'nichtamtlicher Titel',
  'Gliederungsartikel',
  'weggefallene Norm',
  'Überschrift',
  'Überschrift ohne Titel',
] as const)('erhält originale Eingänge, Auswahl und Aktionen: %s', async (art) => {
  let norm = normAus('<satz zahl="1">Inhalt</satz>');
  norm.titel = '😀 § 9999 Abs. 1 I 2 danach';
  if (art === 'nichtamtlicher Titel') norm.titelIstNichtamtlich = true;
  if (art === 'Gliederungsartikel') {
    norm.bezeichnung = 'Art. 229';
    norm = gliederungsartikel({ ...norm, art: 'gliederungsartikel', gliederungsEbene: 1 });
  }
  if (art === 'weggefallene Norm') {
    norm.status = 'weggefallen';
    norm.absaetze = [];
  }
  const u = {
    id: 'u1',
    xmlId: 'u1',
    ebene: 1,
    gliederungskennzahl: '000',
    bezeichnung: art === 'Überschrift ohne Titel' ? (norm.titel ?? '') : 'Abschnitt 2',
    titel: art === 'Überschrift ohne Titel' ? undefined : norm.titel,
  };
  const istU = art.startsWith('Überschrift');
  const element = istU ? u : norm;
  const bereich =
    art === 'Überschrift ohne Titel'
      ? 'bezeichnung'
      : art === 'nichtamtlicher Titel'
        ? 'nichtamtlicherTitel'
        : 'amtlicherTitel';
  const markierung: MarkierungsEintrag = markierungsEintrag({
    typ: 'kommentar',
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: { pfad: bereichPfad(bereich), zeichenbereichStart: 3, zeichenbereichEnde: 16 },
      bezugstext: '§ 9999 Abs. 1',
    },
    ausgangsstelle: normAusgangsstelle(['§', element.bezeichnung].filter(Boolean).join(' ')),

    kommentarText: 'Originaler Kommentar',
  });
  const vorher = structuredClone({ norm, u, markierung });
  const rechts = vi.fn();
  const kommentar = vi.fn();
  const klappen = vi.fn();
  const eingang = vi.spyOn(MarkierungAnzeige, 'geschuetzterBlatttext');
  await act(async () =>
    dom.root.render(
      <TestRahmen>
        <EinklappCtx.Provider
          value={{
            eingeklappteUeberschriften: new Set(),
            eingeklappteNormen: new Set(),
            aktivesElementId: null,
            ueberschriftArtigeNormIds: new Set(art === 'Gliederungsartikel' ? [norm.id] : []),
            trennerVorIds: new Set(),
            unterArtikelIds: new Set(),
            onNormKlick: klappen,
            onNormTextKlick: vi.fn(),
            onUeberschriftKlick: klappen,
            minimalistischerModus: false,
          }}
        >
          <MarkierungAnzeige.MarkierungCtx.Provider
            value={{
              markierungenNachXmlId: new Map([[element.xmlId, [markierung]]]),
              onMarkierungRechtsklick: rechts,
              onKommentarKlick: kommentar,
            }}
          >
            {istU ? (
              <UeberschriftZeile u={u} schrift={16} />
            ) : (
              <NormBlock norm={norm} schrift={16} satzNeuZeile={true} />
            )}
          </MarkierungAnzeige.MarkierungCtx.Provider>
        </EinklappCtx.Provider>
      </TestRahmen>,
    ),
  );
  const blatt = dom.host.querySelector(`[data-bereich="${bereich}"]`)!;
  expect(eingang).toHaveBeenCalledWith(norm.titel);
  expect(blatt.querySelectorAll('[data-zitatanhang]')).toHaveLength(1);
  expect(blatt.textContent).toBe('😀 §\u00a09999 Abs.\u00a01ⓘ I 2 danach');
  const gruppe = [...blatt.querySelectorAll<HTMLElement>('span')].find(
    (s) => s.style.whiteSpace === 'nowrap' && s.textContent === '§\u00a09999',
  );
  expect(gruppe).toBeDefined();
  const selection = waehle(blatt, 3, 16);
  expect(ermittleAuswahl(selection)).toMatchObject({
    textstelle: {
      pfad: { typ: 'bereich' as const, bereich },
      zeichenbereichStart: 3,
      zeichenbereichEnde: 16,
    },
    xmlId: element.xmlId,
  });
  // Titel/Bezeichnung werden fachlich unmittelbar am Original aufgelöst;
  // hier darf die Anzeigeersetzung gerade nicht zurückgeschrieben werden.
  expect(
    aktuellerTextAnPfad(element, {
      pfad: bereichPfad(bereich),
      zeichenbereichStart: 3,
      zeichenbereichEnde: 16,
    }),
  ).toBe('§ 9999 Abs. 1');
  const symbol = blatt.querySelector<HTMLElement>('[data-zitatanhang]')!;
  await act(async () => symbol.click());
  expect(kommentar).not.toHaveBeenCalled();
  window.getSelection()!.removeAllRanges();
  await act(async () => symbol.click());
  expect(kommentar).toHaveBeenCalledExactlyOnceWith(element.xmlId, markierung);
  expect(kommentar.mock.calls[0]![1]).toBe(markierung);
  await act(async () =>
    [...blatt.querySelectorAll<HTMLElement>('span')]
      .find((s) => s.style.textDecoration === 'underline')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
  );
  expect(rechts).toHaveBeenCalledExactlyOnceWith(element.xmlId, markierung);
  expect(rechts.mock.calls[0]![1]).toBe(markierung);
  if (art !== 'weggefallene Norm') {
    await act(async () => dom.host.querySelector<HTMLElement>('.gt-klapp-zeile')!.click());
    expect(klappen).toHaveBeenCalledExactlyOnceWith(element.id);
  }
  expect({ norm, u, markierung }).toEqual(vorher);
});

it.each(['unterstreichung', 'hervorhebung', 'verweismarkierung'] as const)(
  'erhält Titelmarkierung und Zitatziele über Schutzgruppen: %s',
  async (typ) => {
    const norm = normAus('<satz zahl="1">Inhalt</satz>');
    norm.titel = '😀 § 9999 Abs. 1 I 2 danach';
    const verweisinhalt = {
      verweistext: 'I 2 Art. 1',
      verweisziele: [
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: '§ 2',
          verweistextZeichenbereich: [0, 2] as [number, number],
        }),
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: 'Art. 1',
          verweistextZeichenbereich: [2, 10] as [number, number],
        }),
      ],
    };
    const markierung: MarkierungsEintrag = markierungsEintrag({
      typ,
      ausgangsstelle: normAusgangsstelle(['§', norm.bezeichnung].filter(Boolean).join(' ')),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('amtlicherTitel'),
          zeichenbereichStart: 3,
          zeichenbereichEnde: 16,
        },
        bezugstext: '§ 9999 Abs. 1',
      },

      ...(typ === 'verweismarkierung' ? { verweisinhalt } : {}),
    });
    const vorher = structuredClone({ norm, markierung });
    const rechts = vi.fn();
    const navigation = vi.fn();
    await act(async () =>
      dom.root.render(
        <TestRahmen>
          <MarkierungAnzeige.MarkierungCtx.Provider
            value={{
              markierungenNachXmlId: new Map([[norm.xmlId, [markierung]]]),
              onMarkierungRechtsklick: rechts,
              onVerweisKlick: navigation,
            }}
          >
            <NormBlock norm={norm} schrift={16} satzNeuZeile={true} />
          </MarkierungAnzeige.MarkierungCtx.Provider>
        </TestRahmen>,
      ),
    );
    const blatt = dom.host.querySelector('[data-bereich="amtlicherTitel"]')!;
    const anhaenge = blatt.querySelectorAll<HTMLElement>('[data-zitatanhang]');
    expect(anhaenge).toHaveLength(typ === 'verweismarkierung' ? 1 : 0);
    const gruppe = [...blatt.querySelectorAll<HTMLElement>('span')].find(
      (s) => s.style.whiteSpace === 'nowrap' && s.textContent === '§\u00a09999',
    )!;
    expect(gruppe).toBeDefined();
    const dekoriert = [...gruppe.querySelectorAll<HTMLElement>('span')].find(
      (s) => s.style.textDecoration === 'underline' || s.style.background,
    )!;
    await act(async () =>
      dekoriert.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(rechts).toHaveBeenCalledExactlyOnceWith(norm.xmlId, markierung);
    expect(rechts.mock.calls[0]![1]).toBe(markierung);
    if (typ === 'verweismarkierung') {
      const anhang = anhaenge[0]!;
      expect(anhang.textContent).toBe(' I\u00a02 Art.\u00a01');
      const zitatgruppe = [...anhang.querySelectorAll<HTMLElement>('span')].find(
        (s) => s.style.whiteSpace === 'nowrap' && s.textContent === 'I\u00a02',
      )!;
      expect(zitatgruppe).toBeDefined();
      const zahl = [...zitatgruppe.querySelectorAll<HTMLElement>('span')].find(
        (s) => s.textContent === '2',
      )!;
      await act(async () =>
        zahl.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })),
      );
      expect(navigation).toHaveBeenCalledExactlyOnceWith(
        norm.xmlId,
        verweisinhalt.verweisziele[1],
        true,
      );
      expect(navigation.mock.calls[0]![1]).toBe(verweisinhalt.verweisziele[1]);
      const selection = waehle(blatt, 17, 20);
      expect(selection.toString()).toBe('I 2');
      expect(ermittleAuswahl(selection)).toMatchObject({
        textstelle: {
          pfad: { typ: 'bereich' as const, bereich: 'amtlicherTitel' },
          zeichenbereichStart: 17,
          zeichenbereichEnde: 20,
        },
      });
    }
    expect({ norm, markierung }).toEqual(vorher);
  },
);
