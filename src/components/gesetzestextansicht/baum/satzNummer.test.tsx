// satzNummer.test.tsx
// Satznummern: echte Hochziffern der Serifenschrift, verkleinerte Ziffern bei der Standardschrift.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AbsatzListe } from '@/components/gesetzestextansicht/baum/baum.index';

const absaetze = [
  {
    id: 'a1',
    bezeichnung: '(1)',
    saetze: [
      { id: 's1', nummer: 1, text: 'Erster Satz.', eintraege: [] },
      { id: 's2', nummer: 2, text: 'Zweiter Satz.', eintraege: [] },
    ],
  },
];

function rendere(schriftart: 'sans' | 'serif', satzNeuZeile: boolean): string {
  return renderToStaticMarkup(
    <AbsatzListe
      absaetze={absaetze}
      schrift={20}
      satzNeuZeile={satzNeuZeile}
      schriftart={schriftart}
      zeilenabstand={1.2}
      blocksatz={true}
      sprache="de"
    />,
  );
}

function hochgestellt(html: string): string[] {
  return [...html.matchAll(/<sup style="([^"]*)"/g)].map((treffer) => treffer[1] ?? '');
}

describe.each([
  ['als eigene Spalte', true],
  ['fortlaufend im Fließtext', false],
])('Satznummern %s', (_name, satzNeuZeile) => {
  it('nutzt bei der Serifenschrift echte Hochziffern in voller Schriftgröße', () => {
    const stile = hochgestellt(rendere('serif', satzNeuZeile));
    expect(stile.length).toBeGreaterThan(0);
    for (const stil of stile) {
      expect(stil).toContain('font-variant-position:super');
      expect(stil).toContain('font-size:20px');
      expect(stil).toContain('vertical-align:baseline');
    }
  });

  it('verkleinert bei der Standardschrift die Ziffern auf 60 Prozent', () => {
    const stile = hochgestellt(rendere('sans', satzNeuZeile));
    expect(stile.length).toBeGreaterThan(0);
    for (const stil of stile) {
      expect(stil).toContain('font-size:12px');
      expect(stil).not.toContain('font-variant-position');
    }
  });
});
