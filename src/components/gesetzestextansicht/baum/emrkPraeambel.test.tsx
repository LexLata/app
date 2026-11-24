// @vitest-environment jsdom
// Die gebündelte Präambel erscheint mit Absatzabständen und ohne Nummernspalte.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, assert, expect, it, vi } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  TextDarstellungsRahmen,
  useTextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { AbsatzListe } from './absatzBausteine';
afterEach(() => vi.restoreAllMocks());
it('zeigt Präambel P1 als mehrere Absätze ohne Absatznummernspalte', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const gesetz = parseGesetzesXML(
    readFileSync('src-tauri/resources/europa/EMRK_europarat.xml', 'utf8'),
  );
  assert(gesetz);
  const norm = gesetz.elemente.find(
    (e) => e.typ === 'norm' && e.data.bezeichnung === 'Präambel P1',
  );
  if (norm?.typ !== 'norm') throw new Error('Präambel erwartet');
  const absaetze = norm.data.absaetze;
  function Ansicht() {
    const modell = useTextDarstellungsModell({});
    return (
      <TextDarstellungsRahmen modell={modell}>
        <AbsatzListe absaetze={absaetze} schrift={16} satzNeuZeile={false} />
      </TextDarstellungsRahmen>
    );
  }
  const dom = new DOMParser().parseFromString(renderToStaticMarkup(<Ansicht />), 'text/html');
  expect(absaetze).toHaveLength(3);
  expect(dom.body.textContent).toContain('Die Unterzeichnerregierungen');
  expect(dom.body.textContent).toContain('haben Folgendes vereinbart:');
  expect(dom.querySelectorAll('[style*="margin-block-start"]')).toHaveLength(2);
  expect(dom.querySelector('[style*="flex-shrink:0"]')).toBeNull();
});
