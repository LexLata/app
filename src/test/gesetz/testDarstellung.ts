// src/test/gesetz/testDarstellung.ts
// Testgrundlage aus dem echten öffentlichen Darstellungsmodell.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useTextDarstellungsModell } from '@/components/gesetzestextansicht/gesetzestextansicht.index';

type TextDarstellungsWerte = Parameters<typeof useTextDarstellungsModell>[0];
type TextMessung = ReturnType<typeof useTextDarstellungsModell>['messung'];

export function erstelleTestTextMessung(
  schriftart: TextDarstellungsWerte['schriftart'] = 'serif',
): TextMessung {
  let messung: TextMessung | undefined;
  function Modell() {
    messung = useTextDarstellungsModell({ schriftart }).messung;
    return null;
  }
  renderToStaticMarkup(createElement(Modell));
  if (!messung) throw new Error('Darstellungsmodell wurde nicht gerendert.');
  return messung;
}

export const testAbsaetze = [
  {
    id: 'a1',
    bezeichnung: '(1)',
    saetze: [{ id: 's1', nummer: 1, text: 'Erster Satz.', eintraege: [] }],
  },
  {
    id: 'a2',
    bezeichnung: '(2)',
    saetze: [{ id: 's2', nummer: 1, text: 'Zweiter Satz.', eintraege: [] }],
  },
];
