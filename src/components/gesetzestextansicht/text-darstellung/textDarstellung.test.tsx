// textDarstellung.test.tsx
// Lokale Darstellung bleibt zwischen Hauptansichten und Vorschauen getrennt.
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/Gesetzestextansicht';
import type { ComponentProps } from 'react';
import { TextDarstellungsRahmen } from './textDarstellung';
import { describe, expect, expectTypeOf, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AbsatzListe } from '@/components/gesetzestextansicht/baum/baum.index';
import { UI_SCHRIFT_FALLBACK } from '@/lib/stil/gesetzTextDarstellung';

import { testAbsaetze as absaetze } from '@/test/gesetz/testDarstellung';
afterEach(() => vi.unstubAllGlobals());

describe('lokale Absatzdarstellung', () => {
  it('rendert zwei eigenständige Vorschauen mit getrennten Textwerten ohne Steuerungsprovider', () => {
    const html = renderToStaticMarkup(
      <>
        <AbsatzListe
          absaetze={absaetze}
          schrift={14}
          satzNeuZeile={false}
          schriftart="serif"
          zeilenabstand={1.8}
          blocksatz={false}
          sprache="de"
          silbentrennungAktiviert={false}
        />
        <AbsatzListe
          absaetze={absaetze}
          schrift={14}
          satzNeuZeile={true}
          schriftart="sans"
          zeilenabstand={1.2}
          blocksatz={true}
          sprache="en"
        />
      </>,
    );
    expect(html).toContain('font-family:&#x27;Source Serif 4&#x27;, serif');
    expect(html).toContain('--zeilen-abstand:1.8;--text-align:left;--hyphens:none');
    expect(html).toContain(`font-family:${UI_SCHRIFT_FALLBACK.replaceAll("'", '&#x27;')}`);
    expect(html).toContain('--zeilen-abstand:1.2;--text-align:justify;--hyphens:auto');
    expect(html).toContain('font-size:14px');
    expect(html).toContain('lang="en"');
  });
  it('wendet auch in zwei vollständigen Gesetzestextansicht-Instanzen getrennte Textwerte an', () => {
    const gesetz = gesetzDarstellung({
      kurztitel: 'G',
      langtitel: 'Gesetz',
      hatGliederungsartikel: false,
      elemente: [],
    });
    const html = renderToStaticMarkup(
      <>
        <Gesetzestextansicht
          gesetz={gesetz}
          schriftart="serif"
          zeilenabstand={1.8}
          blocksatz={false}
        />
        <Gesetzestextansicht
          gesetz={gesetz}
          schriftart="sans"
          zeilenabstand={1.2}
          blocksatz={true}
        />
      </>,
    );
    expect(html).toContain('font-family:&#x27;Source Serif 4&#x27;, serif');
    expect(html).toContain('--zeilen-abstand:1.8;--text-align:left');
    expect(html).toContain(`font-family:${UI_SCHRIFT_FALLBACK.replaceAll("'", '&#x27;')}`);
    expect(html).toContain('--zeilen-abstand:1.2;--text-align:justify');
  });
  it('löst den UI-Font für sichtbare CSS und Messung identisch auf', () => {
    const fonts: string[] = [];
    const ctx = {
      font: '',
      measureText() {
        fonts.push(this.font);
        return { width: 20 };
      },
    };
    vi.stubGlobal('document', {
      documentElement: {},
      createElement: () => ({ getContext: () => ctx }),
    });
    const computed = vi.fn(() => ({
      getPropertyValue: (name: string) => {
        expect(name).toBe('--schrift');
        return 'Meine UI, sans-serif';
      },
    }));
    vi.stubGlobal('getComputedStyle', computed);
    const html = renderToStaticMarkup(
      <AbsatzListe absaetze={absaetze} schrift={14} satzNeuZeile={false} />,
    );
    expect(html).toContain('font-family:Meine UI, sans-serif');
    expect(fonts).toEqual(['14px Meine UI, sans-serif']);
  });
  it('hat ohne DOM zentrale Sans-Defaults', () => {
    const html = renderToStaticMarkup(
      <AbsatzListe absaetze={[]} schrift={14} satzNeuZeile={false} />,
    );
    expect(html).toContain(UI_SCHRIFT_FALLBACK.replaceAll("'", '&#x27;'));
  });
});

it('erlaubt im Darstellungsrahmen ausschließlich Elemente als weitergereichte Kinder', () => {
  type Kinder = ComponentProps<typeof TextDarstellungsRahmen>['children'];
  expectTypeOf<string>().not.toExtend<Kinder>();
  expectTypeOf<number>().not.toExtend<Kinder>();
});

it.each([false, true])(
  'schützt Absatz- und Eintragsbezeichnungen in Vorschauen (Satzzeilen: %s)',
  (satzNeuZeile) => {
    const original = '§ 9999 Abs. 1 I 2 😀';
    const absaetze = [
      {
        id: 'a1',
        bezeichnung: original,
        saetze: [
          {
            id: 's1',
            zahl: 1,
            text: 'Text',
            eintraege: [
              {
                id: 'e1',
                ebene: 'nummer' as const,
                bezeichnung: original,
                text: 'Eintrag',
                untereintraege: [],
              },
            ],
          },
        ],
      },
      { id: 'a2', bezeichnung: '(2)', saetze: [] },
    ];
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <AbsatzListe absaetze={absaetze} schrift={16} satzNeuZeile={satzNeuZeile} />,
      ),
      'text/html',
    );
    const gruppen = [...doc.querySelectorAll('span')].filter(
      (el) => el.style.whiteSpace === 'nowrap',
    );
    // Auch fortlaufende Sätze zeigen die Aufzählung samt Eintragsbezeichnung.
    expect(gruppen.map((el) => el.textContent)).toEqual([
      '§\u00a09999',
      'Abs.\u00a01',
      '§\u00a09999',
      'Abs.\u00a01',
    ]);
    expect(doc.documentElement.textContent).toContain('I 2 😀');
    expect(absaetze[0]!.bezeichnung).toBe(original);
    expect(absaetze[0]!.saetze[0]!.eintraege[0]!.bezeichnung).toBe(original);
  },
);

it.each([false, true])(
  'erhält Unterabsatz- und Satznummern samt ursprünglichen Blattpfaden (Satzzeilen: %s)',
  (satzNeuZeile) => {
    const saetze = [
      { id: 's1', zahl: 4, text: 'Erster', eintraege: [] },
      { id: 's2', zahl: 9, text: 'Zweiter', eintraege: [] },
    ];
    const absaetze = [
      {
        id: 'a',
        bezeichnung: '(1)',
        saetze: [],
        unterabsaetze: [{ id: 'ua', bezeichnung: '[3]', saetze }],
      },
    ];
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <AbsatzListe absaetze={absaetze} schrift={16} satzNeuZeile={satzNeuZeile} />,
      ),
      'text/html',
    );
    expect([...doc.querySelectorAll('sup')].map((el) => el.textContent)).toEqual(['1', '2']);
    expect(doc.documentElement.textContent?.match(/\[3\]/g)).toHaveLength(1);
    expect(doc.documentElement.textContent).not.toContain('[[3]]');
    expect(
      [...doc.querySelectorAll('[data-leaf]')].map((el) => [
        el.getAttribute('data-unterabsatz'),
        el.getAttribute('data-satz'),
        el.textContent,
      ]),
    ).toEqual([
      ['[3]', '4', 'Erster'],
      ['[3]', '9', 'Zweiter'],
    ]);
    expect(saetze.map((s) => s.zahl)).toEqual([4, 9]);
  },
);

it.each([false, true])(
  'zeigt gespeicherte Unterabsatzklammern genau einmal (Satzzeilen: %s)',
  (satzNeuZeile) => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <AbsatzListe
          absaetze={[
            {
              id: 'a',
              bezeichnung: '(1)',
              saetze: [],
              unterabsaetze: [
                {
                  id: 'u1',
                  bezeichnung: '[1]',
                  saetze: [{ id: 's1', text: 'Eins.', eintraege: [] }],
                },
                {
                  id: 'u2',
                  bezeichnung: '[2]',
                  saetze: [{ id: 's2', text: 'Zwei.', eintraege: [] }],
                },
              ],
            },
          ]}
          schrift={16}
          satzNeuZeile={satzNeuZeile}
        />,
      ),
      'text/html',
    );
    expect(doc.documentElement.textContent?.match(/\[[12]\]/g)).toEqual(['[1]', '[2]']);
    expect(doc.documentElement.textContent).not.toContain('[[');
  },
);

it.each([false, true])(
  'gibt nur Folgeabsätzen zusätzlich 0,35 Zeilenhöhen Abstand (Satzzeilen: %s)',
  (satzNeuZeile) => {
    const absatz = {
      id: 'a1',
      saetze: [],
      unterabsaetze: [
        { id: 'u1', bezeichnung: '[1]', saetze: [{ id: 's1', text: 'Eins.', eintraege: [] }] },
        { id: 'u2', bezeichnung: '[2]', saetze: [{ id: 's2', text: 'Zwei.', eintraege: [] }] },
      ],
    };
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <AbsatzListe
          absaetze={[absatz, { ...absatz, id: 'a2' }, { ...absatz, id: 'a3' }]}
          schrift={20}
          zeilenabstand={1.8}
          satzNeuZeile={satzNeuZeile}
        />,
      ),
      'text/html',
    );
    const abstaende = [...doc.querySelectorAll<HTMLElement>('[style]')].filter(
      (el) => el.style.marginBlockStart,
    );
    expect(abstaende).toHaveLength(2);
    expect(abstaende.map((el) => el.style.marginBlockStart)).toEqual([
      'calc(7px * var(--zeilen-abstand))',
      'calc(7px * var(--zeilen-abstand))',
    ]);
  },
);
