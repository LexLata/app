// nichtamtlicheTitelSpeicher.pruefen.test.ts
// Gelesene nichtamtliche Titel und Bezeichnungsschlüssel stehen unabhängig von der Quellschreibweise in NFC.
import { describe, expect, it } from 'vitest';
import { pruefeNichtamtlicheTitelXML } from '@/lib/persistenz/gesetz/gesetz.index';

// „ä“ zerlegt: a + U+0308, zusammengesetzt: U+00E4.
const zerlegt = (s: string) => s.replaceAll('\u00e4', 'a\u0308');

describe('pruefeNichtamtlicheTitelXML – Unicode-Normalform', () => {
  it('liest Titel und Bezeichnungsschlüssel einer zerlegt geschriebenen Datei als NFC', () => {
    const xml = zerlegt(
      '<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><norm><bezeichnung>Präambel</bezeichnung><titel>Verträge über Präambeln</titel></norm></inhalt></nichtamtlicheTitel>',
    );
    expect(xml).not.toContain('ä');

    const ergebnis = pruefeNichtamtlicheTitelXML(xml, { kurztitel: 'BGB', normgeber: 'de-bund' });

    expect(ergebnis).toEqual({
      status: 'gueltig',
      titel: new Map([['Präambel', 'Verträge über Präambeln']]),
    });
  });
});
