// importTextstruktur.test.ts
//
// Tests für importTextstruktur.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// String-Helfer der Bund-Import-Pipeline (XML-Escaping, Absatznummer-Extraktion, nummer/litera-Klassifizierung,
// Bezeichnungs-Normalisierung). Bisher komplett ungetestet.

import { describe, it, expect } from 'vitest';
import { escapeXML } from '@/lib/utils/xmlVerarbeitung';
import {
  esc,
  escSatz,
  extrahiereAbsatznummer,
  tagUndAttr,
  normalisiereBezeichnung,
} from './importTextstruktur';

describe('esc', () => {
  it('verwendet den gemeinsamen Escape-Helfer einschließlich Apostroph', () => {
    expect(esc).toBe(escapeXML);
    expect(esc("D'Artagnan")).toBe('D&apos;Artagnan');
  });
  it('escaped &, <, >, "', () => {
    expect(esc('<a> & "b" >')).toBe('&lt;a&gt; &amp; &quot;b&quot; &gt;');
  });

  it('lässt Text ohne Sonderzeichen unverändert', () => {
    expect(esc('normaler Text')).toBe('normaler Text');
  });

  it('escaped & VOR den anderen Zeichen (kein Doppel-Escaping von bereits erzeugten Entities)', () => {
    // Würde & nach <>" escaped, entstünde aus "&lt;" fälschlich "&amp;lt;".
    expect(esc('<')).toBe('&lt;');
  });
});

describe('escSatz', () => {
  it('ersetzt \\n durch <zeilenumbruch/> UND escaped den Rest', () => {
    expect(escSatz('Zeile1\nZeile2 & <x>')).toBe('Zeile1<zeilenumbruch/>Zeile2 &amp; &lt;x&gt;');
  });

  it('mehrere Zeilenumbrüche erzeugen mehrere <zeilenumbruch/>-Marker', () => {
    expect(escSatz('A\nB\nC')).toBe('A<zeilenumbruch/>B<zeilenumbruch/>C');
  });

  it('ohne Zeilenumbruch verhält es sich wie esc()', () => {
    expect(escSatz('Ohne Umbruch & <x>')).toBe(esc('Ohne Umbruch & <x>'));
  });
});

describe('extrahiereAbsatznummer', () => {
  it('extrahiert eine einfache Absatznummer und den Resttext (führendes Leerzeichen entfernt)', () => {
    expect(extrahiereAbsatznummer('(1) Der Text beginnt hier.')).toEqual([
      '(1)',
      'Der Text beginnt hier.',
    ]);
  });

  it('erlaubt genau einen Kleinbuchstaben-Suffix ("4a")', () => {
    expect(extrahiereAbsatznummer('(4a) Mit Buchstabe.')).toEqual(['(4a)', 'Mit Buchstabe.']);
  });

  it('erlaubt mehrstellige Zahlen', () => {
    expect(extrahiereAbsatznummer('(123) X')).toEqual(['(123)', 'X']);
  });

  it('gibt null zurück, wenn kein Absatznummer-Präfix vorliegt', () => {
    expect(extrahiereAbsatznummer('Kein Absatz-Präfix.')).toBeNull();
  });

  it('konsumiert mehrere Leerzeichen nach der Nummer vollständig', () => {
    expect(extrahiereAbsatznummer('(1)    Viel Abstand.')).toEqual(['(1)', 'Viel Abstand.']);
  });

  it('funktioniert auch OHNE Leerzeichen nach der Klammer', () => {
    expect(extrahiereAbsatznummer('(1)DirektDanach.')).toEqual(['(1)', 'DirektDanach.']);
  });

  it('EDGE CASE: ein GROSSbuchstaben-Suffix wird NICHT erkannt (nur [a-z])', () => {
    expect(extrahiereAbsatznummer('(4A) X')).toBeNull();
  });

  it('EDGE CASE: mehr als ein Buchstaben-Suffix wird NICHT erkannt (nur maximal einer)', () => {
    expect(extrahiereAbsatznummer('(4ab) X')).toBeNull();
  });

  it('muss am Textanfang stehen (Präfix mitten im Text zählt nicht)', () => {
    expect(extrahiereAbsatznummer('Siehe (1) weiter oben.')).toBeNull();
  });
});

describe('tagUndAttr', () => {
  it('Ziffer am Anfang → nummer/zahl', () => {
    expect(tagUndAttr('1.')).toEqual(['nummer', 'zahl']);
    expect(tagUndAttr('4a)')).toEqual(['nummer', 'zahl']);
  });

  it('Buchstabe am Anfang → litera/buchstabe', () => {
    expect(tagUndAttr('a)')).toEqual(['litera', 'buchstabe']);
  });

  it('führender Whitespace wird vor der Prüfung getrimmt', () => {
    expect(tagUndAttr('  1.')).toEqual(['nummer', 'zahl']);
  });

  it('EDGE CASE: Bezeichnungen ohne Ziffer am Anfang (z.B. "-") fallen auf litera zurück (Default)', () => {
    expect(tagUndAttr('-')).toEqual(['litera', 'buchstabe']);
  });
});

describe('normalisiereBezeichnung', () => {
  it('entfernt ein führendes "(XXXX)"-Präfix', () => {
    expect(normalisiereBezeichnung('(XXXX)Art 1')).toBe('Art. 1');
  });

  it('ersetzt "Art " durch "Art. "', () => {
    expect(normalisiereBezeichnung('Art 246a')).toBe('Art. 246a');
  });

  it('lässt ein bereits korrektes "Art. " unverändert (kein doppelter Punkt)', () => {
    expect(normalisiereBezeichnung('Art. 246a')).toBe('Art. 246a');
  });

  it('trimmt umgebenden Whitespace', () => {
    expect(normalisiereBezeichnung('  § 1  ')).toBe('§ 1');
  });

  it('EDGE CASE: "Art" als Teil eines längeren Worts wird NICHT ersetzt (Wortgrenze \\b vor UND nach "Art ")', () => {
    expect(normalisiereBezeichnung('Artikel 1')).toBe('Artikel 1');
  });
});
