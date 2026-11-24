// Einheitliche Abstände am Normtext und innerhalb verschachtelter Aufzählungen.
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  useTextDarstellungsModell,
  TextDarstellungsRahmen,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { NormBlock } from './normBlock';

function zeigeNorm(inhalt: string, schrift: number, zeilenabstand: number, satzNeuZeile: boolean) {
  const gesetz = parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text>${inhalt}</text></norm></inhalt></gesetz>`,
  );
  const element = gesetz?.elemente[0];
  if (element?.typ !== 'norm') throw new Error('Norm erwartet');
  const norm = element.data;
  function Ansicht() {
    const modell = useTextDarstellungsModell({ zeilenabstand });
    return (
      <TextDarstellungsRahmen modell={modell}>
        <NormBlock norm={norm} schrift={schrift} satzNeuZeile={satzNeuZeile} />
      </TextDarstellungsRahmen>
    );
  }
  return new DOMParser().parseFromString(renderToStaticMarkup(<Ansicht />), 'text/html');
}

it.each([
  ['Normtext ohne Absatzgliederung.', 20, 1.8, false, '7px'],
  ['Normtext ohne Absatzgliederung.', 16, 1.2, true, '5.6px'],
  ['<absatz zahl="(1)">Erster.</absatz><absatz zahl="(2)">Zweiter.</absatz>', 20, 1.8, true, '7px'],
] as const)(
  'trennt Normzeile und Normtext auch ohne Absatzgliederung (%s, Schrift %s)',
  (inhalt, schrift, zeilenabstand, satzNeuZeile, erwartet) => {
    const doc = zeigeNorm(inhalt, schrift, zeilenabstand, satzNeuZeile);
    const koerper = doc.querySelector<HTMLElement>('[data-scroll-koerper]');
    expect(koerper?.style.paddingBlockStart).toBe(`calc(${erwartet} * var(--zeilen-abstand))`);
    expect(koerper?.textContent).toContain(inhalt.startsWith('<') ? 'Erster.' : inhalt);
  },
);

it('verwendet innerhalb von Sätzen, Unterabsätzen und verschachtelten Aufzählungen keine zusätzlichen vertikalen Abstände', () => {
  const doc = zeigeNorm(
    '<absatz><unterabsatz zahl="[1]"><satz zahl="1">Einleitung:<nummer zahl="1">Nummer:<litera buchstabe="a"><satz zahl="1">Erster.</satz><satz zahl="2">Zweiter.</satz></litera><litera buchstabe="b">Litera.</litera>Fortsetzung der Nummer.</nummer><nummer zahl="2">Weitere Nummer.</nummer>Fortsetzung des Satzes.</satz><satz zahl="2">Nächster Satz.</satz></unterabsatz><unterabsatz zahl="[2]">Weiterer Unterabsatz.</unterabsatz></absatz>',
    20,
    1.8,
    true,
  );
  const koerper = doc.querySelector('[data-scroll-koerper]');
  if (!koerper) throw new Error('Normtext erwartet');
  expect(koerper.textContent).toContain('Weitere Nummer.');
  expect(koerper.textContent).toContain('Weiterer Unterabsatz.');
  const bloecke = [...koerper.querySelectorAll<HTMLElement>('div')];
  expect(bloecke.length).toBeGreaterThan(10);
  for (const el of bloecke) {
    for (const wert of [
      el.style.gap,
      el.style.rowGap,
      el.style.paddingBlock,
      el.style.paddingTop,
      el.style.paddingBottom,
      el.style.marginBlockStart,
      el.style.marginTop,
      el.style.marginBottom,
    ]) {
      expect(['', '0', '0px', undefined]).toContain(wert);
    }
  }
});
