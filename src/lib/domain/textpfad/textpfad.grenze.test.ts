// @vitest-environment jsdom
// Prüft die DOM-Eingangskontrolle für strukturelle Textpositionen.
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { expect, it } from 'vitest';
import { blattPfad, ermittleAuswahl } from './textpfad';

it.each([
  '',
  '[]',
  '{}',
  'null',
  'kaputt',
  '[{"ebene":"nummer"}]',
  '[{"ebene":"falsch","bezeichnung":"1"}]',
  '[{"ebene":"nummer","bezeichnung":"1","wiederholung":-1}]',
])('lehnt ungültige vorhandene Eintragsketten ab: %s', (roh) => {
  const blatt = document.createElement('span');
  blatt.setAttribute('data-eintraege', roh);
  expect(blattPfad(blatt)).toBeUndefined();
});
it('unterscheidet fehlende Kette und gültige nicht leere Kette', () => {
  const blatt = document.createElement('span');
  expect(blattPfad(blatt)).toEqual(normtextPfad({}));
  blatt.setAttribute('data-eintraege', '[{"ebene":"nummer","bezeichnung":"1","wiederholung":2}]');
  expect(blattPfad(blatt)).toEqual(
    normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1', wiederholung: 2 }] }),
  );
});
it('lehnt Auswahl mit ungültiger Kette ab', () => {
  document.body.innerHTML =
    '<div data-xml-id="n"><span data-leaf data-eintraege="[]">Text</span></div>';
  const range = document.createRange();
  const blatt = document.querySelector('span');
  const selection = window.getSelection();
  if (!blatt || !selection) throw Error('Auswahlumgebung fehlt');
  range.selectNodeContents(blatt);
  selection.removeAllRanges();
  selection.addRange(range);
  expect(ermittleAuswahl(selection)).toEqual({ fehler: 'ueberspannt-mehrere' });
});
