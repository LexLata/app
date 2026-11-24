// xmlSerialisierung.baueEintrag.test.ts
//
// Unit-Tests für baueEintrag() (xmlSerialisierung.ts) – Serialisierung eines
// einzelnen Listeneintrags (nummer/litera) inkl. Rekursion über
// untereintraege – sowie für baueSatzInline()/baueSatzBlock(), die
// baueEintrag() für den eintraege-Fall aufrufen. Fokus: die Fallunterscheidung
// leer/Einzelsatz/Mehrsatz sowie das dokumentierte Zusammenspiel von
// texteVor/texteNach mit und ohne Unterliste (siehe Kopfkommentar von
// baueEintrag in xmlSerialisierung.ts).
//
// Für flattenElemente() siehe xmlSerialisierung.flattenElemente.test.ts, für
// baueText()/gruppiereAbsaetze() (Absatz-Ebene) siehe
// xmlSerialisierung.baueText.test.ts. Für das Zusammenspiel mit dem echten
// satzTokenizer UND vollständiger XML-Serialisierung/-Parsing siehe
// gesetzesXMLNachbereiten.test.ts.

import { describe, it, expect } from 'vitest';
import { baueEintrag, baueSatzInline, baueSatzBlock } from './xmlSerialisierung';
import type { ImpEintrag, SatzXML } from './importTextstruktur';

function eintrag(overrides: Partial<ImpEintrag> & { bezeichnung: string }): ImpEintrag {
  return {
    texteVor: [],
    texteNach: [],
    untereintraege: [],
    unterlistenTyp: 'aufzaehlung',
    ...overrides,
  };
}

describe('baueEintrag – tag-Wahl (nummer vs. litera)', () => {
  it('Bezeichnung beginnt mit Ziffer -> <nummer zahl="…">', () => {
    expect(baueEintrag(eintrag({ bezeichnung: '1.' }), '')).toEqual(['<nummer zahl="1."/>']);
  });

  it('Bezeichnung beginnt mit Buchstabe -> <litera buchstabe="…">', () => {
    expect(baueEintrag(eintrag({ bezeichnung: 'a)' }), '')).toEqual(['<litera buchstabe="a)"/>']);
  });
});

describe('baueEintrag – ohne Unterliste', () => {
  it('kein Text (weder vor noch nach) -> selbstschließendes Element', () => {
    expect(baueEintrag(eintrag({ bezeichnung: '9.' }), '  ')).toEqual(['  <nummer zahl="9."/>']);
  });

  it('nur Whitespace als Text -> zählt wie leer (trim/filter in texteVor)', () => {
    expect(baueEintrag(eintrag({ bezeichnung: '10.', texteVor: ['   '] }), '  ')).toEqual([
      '  <nummer zahl="10."/>',
    ]);
  });

  it('ein einzelner Satz -> Kurzform ohne <satz>-Wrapper', () => {
    expect(baueEintrag(eintrag({ bezeichnung: 'a)', texteVor: ['Ein Satz.'] }), '  ')).toEqual([
      '  <litera buchstabe="a)">Ein Satz.</litera>',
    ]);
  });

  it('mehrere Sätze -> jeder Satz als eigenes <satz zahl="n">-Kind', () => {
    expect(
      baueEintrag(eintrag({ bezeichnung: '2.', texteVor: ['Satz eins.', 'Satz zwei.'] }), '  '),
    ).toEqual([
      '  <nummer zahl="2.">',
      '    <satz zahl="1">Satz eins.</satz>',
      '    <satz zahl="2">Satz zwei.</satz>',
      '  </nummer>',
    ]);
  });

  it('Edge-Case: texteVor UND texteNach ohne Unterliste werden zu einem gemeinsamen Text zusammengeführt (Bugfix-Kommentar im Quellcode, z.B. BW-dd-Split)', () => {
    expect(
      baueEintrag(
        eintrag({ bezeichnung: '3.', texteVor: ['Vorher.'], texteNach: ['Nachher.'] }),
        '  ',
      ),
    ).toEqual([
      '  <nummer zahl="3.">',
      '    <satz zahl="1">Vorher.</satz>',
      '    <satz zahl="2">Nachher.</satz>',
      '  </nummer>',
    ]);
  });

  it('Edge-Case: mehrere texteVor-Array-Einträge werden per \\n zusammengefügt – endet ein Eintrag auf Satzzeichen, trennt der Tokenizer sie in eigenständige <satz>-Elemente statt eines <zeilenumbruch/> (Unterschied zum hatDL-Zweig, siehe unten)', () => {
    expect(
      baueEintrag(eintrag({ bezeichnung: '8.', texteVor: ['Zeile eins.', 'Zeile zwei.'] }), '  '),
    ).toEqual([
      '  <nummer zahl="8.">',
      '    <satz zahl="1">Zeile eins.</satz>',
      '    <satz zahl="2">Zeile zwei.</satz>',
      '  </nummer>',
    ]);
  });

  it('XML-Sonderzeichen in Bezeichnung und Text werden escaped', () => {
    expect(
      baueEintrag(eintrag({ bezeichnung: '4.', texteVor: ['A & B < "C" > D.'] }), '  '),
    ).toEqual(['  <nummer zahl="4.">A &amp; B &lt; &quot;C&quot; &gt; D.</nummer>']);
  });
});

describe('baueEintrag – mit Unterliste (untereintraege)', () => {
  it('nur texteVor -> öffnender Tag inkl. Text, dann rekursiv die Untereinträge, dann schließender Tag', () => {
    expect(
      baueEintrag(
        eintrag({
          bezeichnung: '5.',
          texteVor: ['Es gilt:'],
          untereintraege: [
            eintrag({ bezeichnung: 'a)', texteVor: ['Fall A.'] }),
            eintrag({ bezeichnung: 'b)', texteVor: ['Fall B.'] }),
          ],
        }),
        '  ',
      ),
    ).toEqual([
      '  <nummer zahl="5.">Es gilt:',
      '    <litera buchstabe="a)">Fall A.</litera>',
      '    <litera buchstabe="b)">Fall B.</litera>',
      '  </nummer>',
    ]);
  });

  it('leeres texteVor -> öffnender Tag OHNE Text davor (eigene Zeile)', () => {
    expect(
      baueEintrag(
        eintrag({
          bezeichnung: '7.',
          untereintraege: [eintrag({ bezeichnung: 'a)', texteVor: ['Fall A.'] })],
        }),
        '  ',
      ),
    ).toEqual([
      '  <nummer zahl="7.">',
      '    <litera buchstabe="a)">Fall A.</litera>',
      '  </nummer>',
    ]);
  });

  it('texteVor UND texteNach -> texteNach wird nach den Untereinträgen als <zeilenumbruch/>+Text angehängt (bewusst NICHT satztokenisiert, siehe Kopfkommentar)', () => {
    expect(
      baueEintrag(
        eintrag({
          bezeichnung: '6.',
          texteVor: ['Es gilt:'],
          texteNach: ['sind wirksam.'],
          untereintraege: [eintrag({ bezeichnung: 'a)', texteVor: ['Fall A.'] })],
        }),
        '  ',
      ),
    ).toEqual([
      '  <nummer zahl="6.">Es gilt:',
      '    <litera buchstabe="a)">Fall A.</litera>',
      '    <zeilenumbruch/>sind wirksam.',
      '  </nummer>',
    ]);
  });

  it('Edge-Case: texteNach mit mehreren Array-Einträgen bleibt als EIN Rohtextblock ohne <satz>-Aufteilung (kein tokenize() im hatDL-Zweig) – die Verkettung selbst wird aber über escSatz() zu einem literalen <zeilenumbruch/>-Tag (nicht zu rohem \\n)', () => {
    expect(
      baueEintrag(
        eintrag({
          bezeichnung: '11.',
          untereintraege: [eintrag({ bezeichnung: 'a)', texteVor: ['Fall A.'] })],
          texteNach: ['Satz eins.', 'Satz zwei.'],
        }),
        '  ',
      ),
    ).toEqual([
      '  <nummer zahl="11.">',
      '    <litera buchstabe="a)">Fall A.</litera>',
      '    <zeilenumbruch/>Satz eins.<zeilenumbruch/>Satz zwei.',
      '  </nummer>',
    ]);
  });

  it('rekursive Verschachtelung: ein Untereintrag hat selbst wieder untereintraege', () => {
    expect(
      baueEintrag(
        eintrag({
          bezeichnung: '1.',
          texteVor: ['Ebene 1:'],
          untereintraege: [
            eintrag({
              bezeichnung: 'a)',
              texteVor: ['Ebene 2:'],
              untereintraege: [eintrag({ bezeichnung: 'aa)', texteVor: ['Ebene 3.'] })],
            }),
          ],
        }),
        '',
      ),
    ).toEqual([
      '<nummer zahl="1.">Ebene 1:',
      '  <litera buchstabe="a)">Ebene 2:',
      '    <litera buchstabe="aa)">Ebene 3.</litera>',
      '  </litera>',
      '</nummer>',
    ]);
  });
});

describe('baueSatzInline / baueSatzBlock', () => {
  it('baueSatzInline ohne eintraege: einfacher <tag attr>text</tag>', () => {
    expect(baueSatzInline({ text: 'Ein Text.' }, 'absatz', ' zahl="(1)"', '  ')).toEqual([
      '  <absatz zahl="(1)">Ein Text.</absatz>',
    ]);
  });

  it('baueSatzInline ohne Attribut-String (z.B. unnummerierter <text>)', () => {
    expect(baueSatzInline({ text: 'Nur Text.' }, 'text', '', '  ')).toEqual([
      '  <text>Nur Text.</text>',
    ]);
  });

  it('baueSatzInline mit eintraege UND fortsetzung: fortsetzung-Text wird nach den Einträgen OHNE eigene Einrückung angehängt', () => {
    const s: SatzXML = {
      text: 'Es gilt:',
      eintraege: [eintrag({ bezeichnung: '1', texteVor: ['Fall eins'] })],
      fortsetzung: 'sind wirksam.',
    };
    expect(baueSatzInline(s, 'absatz', ' zahl="(1)"', '  ')).toEqual([
      '  <absatz zahl="(1)">Es gilt:',
      '    <nummer zahl="1">Fall eins</nummer>',
      'sind wirksam.',
      '  </absatz>',
    ]);
  });

  it('baueSatzBlock mit eintraege ohne fortsetzung: <satz zahl="n"> als Wrapper um Text + Einträge', () => {
    const s: SatzXML = {
      text: 'Es gilt:',
      eintraege: [eintrag({ bezeichnung: '1', texteVor: ['Fall eins.'] })],
    };
    expect(baueSatzBlock(s, 3, '  ')).toEqual([
      '  <satz zahl="3">Es gilt:',
      '    <nummer zahl="1">Fall eins.</nummer>',
      '  </satz>',
    ]);
  });

  it('baueSatzBlock ohne eintraege: einfaches <satz zahl="n">text</satz>', () => {
    expect(baueSatzBlock({ text: 'Nur Text.' }, 1, '  ')).toEqual([
      '  <satz zahl="1">Nur Text.</satz>',
    ]);
  });
});

describe('baueEintrag – Apostroph', () => {
  it('maskiert Apostrophe in Bezeichnung und Satztext und liest sie unverändert zurück', () => {
    const xml = baueEintrag(eintrag({ bezeichnung: "a')", texteVor: ["D'Artagnan."] }), '').join(
      '',
    );
    expect(xml).toBe('<litera buchstabe="a&apos;)">D&apos;Artagnan.</litera>');
    const element = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
    expect(element.getAttribute('buchstabe')).toBe("a')");
    expect(element.textContent).toBe("D'Artagnan.");
  });
});
