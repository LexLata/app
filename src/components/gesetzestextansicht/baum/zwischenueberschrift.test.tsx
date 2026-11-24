// zwischenueberschrift.test.tsx
// Prüft Darstellung und Nummernspalten bei Zwischenüberschriften.
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AbsatzListe } from './absatzBausteine';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  useTextDarstellungsModell,
  TextDarstellungsRahmen,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import type { AbsatzDarstellung } from '@/lib/domain/gesetzTypes';

function Inhalt({ absaetze }: { absaetze: AbsatzDarstellung[] }) {
  const modell = useTextDarstellungsModell({});
  return (
    <TextDarstellungsRahmen modell={modell}>
      <AbsatzListe absaetze={absaetze} schrift={16} satzNeuZeile={true} />
    </TextDarstellungsRahmen>
  );
}

it('zeigt Zwischenüberschrift kursiv mit Abstand ohne Nummer und erhält folgende Nummernspalten', () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><norm id="1" vorgaenger="ex-Artikel 6 EGV"><bezeichnung>Art. 1</bezeichnung><text><absatz zahl="(1)">Vorher.</absatz><absatz typ="zwischenueberschrift">Erste Lesung</absatz><absatz zahl="(2)">Nachher.</absatz></text></norm></inhalt></gesetz>',
  )!;
  const norm = gesetz.elemente[0]!;
  if (norm.typ !== 'norm') throw new Error('Norm erwartet');
  const mit = new DOMParser().parseFromString(
    renderToStaticMarkup(<Inhalt absaetze={norm.data.absaetze} />),
    'text/html',
  );
  const ohne = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <Inhalt absaetze={norm.data.absaetze.filter((a) => !a.zwischenueberschrift)} />,
    ),
    'text/html',
  );
  const blocks = Array.from(mit.querySelectorAll('div')).filter(
    (el) => el.style.display === 'flex' && el.style.alignItems === 'flex-start',
  );
  const titel = blocks.find((el) => el.textContent === 'Erste Lesung')!;
  expect(titel.style.fontStyle).toBe('italic');
  expect(titel.style.marginBlockStart).toBe('calc(5.6px * var(--zeilen-abstand))');
  expect(titel.children).toHaveLength(1);
  const spalte = (doc: Document) =>
    Array.from(doc.querySelectorAll('span')).find(
      (el) => el.textContent === '(2)' && el.style.minWidth,
    )!;
  expect(spalte(mit).style.minWidth).toBe(spalte(ohne).style.minWidth);
  expect(spalte(mit).style.minWidth).not.toBe('0');
});

it('zeigt Präambelabsätze getrennt mit bestehenden Abständen und ohne Nummernspalte', () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><norm id="Präambel"><bezeichnung>Präambel</bezeichnung><text><absatz>Erster.</absatz><absatz>Zweiter.</absatz></text></norm></inhalt></gesetz>',
  )!;
  const norm = gesetz.elemente[0]!;
  if (norm.typ !== 'norm') throw new Error('Norm erwartet');
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(<Inhalt absaetze={norm.data.absaetze} />),
    'text/html',
  );
  const blocks = Array.from(doc.querySelectorAll('div')).filter(
    (el) =>
      el.style.display === 'flex' &&
      el.style.alignItems === 'flex-start' &&
      el.parentElement?.style.display !== 'flex',
  );
  expect(blocks.map((el) => el.textContent)).toEqual(['Erster.', 'Zweiter.']);
  expect(blocks.every((el) => el.children.length === 1)).toBe(true);
  expect(
    blocks.every((el) => el.style.lineHeight === '' && el.querySelector('[data-leaf]') !== null),
  ).toBe(true);
});
