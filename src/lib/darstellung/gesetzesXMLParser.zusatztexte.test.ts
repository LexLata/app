// gesetzesXMLParser.zusatztexte.test.ts
// Prüft offene Werte und die von Absatzadressen unabhängigen Zusatztexte.
import { expect, it } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';

function norm(text: string, attribute = '') {
  const gesetz = parseGesetzesXML(
    `<gesetz><infos><kurztitel>G</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="1" ${attribute}><bezeichnung>§ 1</bezeichnung><text>${text}</text></norm></inhalt></gesetz>`,
  );
  if (!gesetz) throw Error('Gesetz fehlt');
  const element = gesetz.elemente[0];
  if (!element) throw Error('Norm fehlt');
  if (element.typ !== 'norm') throw new Error('Norm erwartet');
  return element.data;
}

it('liest unbekannte Typen und Status als normale Norm und normalen Absatz', () => {
  const n = norm('<absatz typ="neu">A</absatz>', 'typ="anlage" status="neu"');
  expect(n.art).toBe('normal');
  expect(n.status).toBeUndefined();
  expect(n.absaetze[0]?.zwischenueberschrift).toBeUndefined();
});

it('bewahrt unbekannte Blöcke mit Position und normalisiert verschachtelten Text', () => {
  const n = norm(
    '<kasten> Vorne </kasten><kasten> Noch davor </kasten><absatz zahl="(1)">A</absatz><tabelle><zeile>x   y</zeile></tabelle><kasten>z\n <b> u </b> v</kasten><absatz>B</absatz>',
  );
  expect(n.absaetze.map((a) => [a.bezeichnung, a.saetze[0]?.text])).toEqual([
    ['(1)', 'A'],
    [undefined, 'B'],
  ]);
  expect(n).toHaveProperty('zusatztexte', [
    { nachAbsatz: 0, text: 'Vorne' },
    { nachAbsatz: 0, text: 'Noch davor' },
    { nachAbsatz: 1, text: 'x y' },
    { nachAbsatz: 1, text: 'z u v' },
  ]);
});

it('behält ohne Absatzkinder unbekannte Inline-Hüllen im einzigen Absatz', () => {
  const n = norm('A <neu>B</neu> C');
  expect(n.absaetze[0]?.saetze[0]?.text).toBe('A B C');
});
