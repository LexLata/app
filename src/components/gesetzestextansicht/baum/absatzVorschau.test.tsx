// absatzVorschau.test.tsx
// Interne Absatzlisten verwenden ausschließlich den vorhandenen Elternrahmen.
import {
  useTextDarstellungsModell,
  TextDarstellungsRahmen,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AbsatzListe as AbsatzBaum } from './absatzBausteine';

import { testAbsaetze as absaetze } from '@/test/gesetz/testDarstellung';
afterEach(() => vi.unstubAllGlobals());

describe('geerbte Absatzdarstellung', () => {
  it('interne Absatzlisten messen mit dem Elternfont ohne Defaults zu überschreiben', () => {
    const fonts: string[] = [];
    const ctx = {
      font: '',
      measureText() {
        fonts.push(this.font);
        return { width: 20 };
      },
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ctx }) });
    function ElternAnsicht() {
      const modell = useTextDarstellungsModell({ schriftart: 'serif', zeilenabstand: 1.6 });
      return (
        <TextDarstellungsRahmen modell={modell}>
          <AbsatzBaum absaetze={absaetze} schrift={14} satzNeuZeile={false} />
        </TextDarstellungsRahmen>
      );
    }
    const html = renderToStaticMarkup(<ElternAnsicht />);
    expect(fonts).toEqual(["14px 'Source Serif 4', serif"]);
    expect(html.match(/--zeilen-abstand:/g)).toHaveLength(1);
    expect(html).toContain('--zeilen-abstand:1.6');
  });
});
