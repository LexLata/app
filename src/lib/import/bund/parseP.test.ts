// parseP.test.ts
//
// Tests für parseP.ts (kolokiert, Vitest). Übersetzt ein <P>-Element in eine
// ImpAbsatz-Zwischenstruktur. Nutzt echte DOM-Elemente (via DOMParser, siehe
// src/test/setupNode.ts) statt Fixtures von Hand zu bauen, da die Funktion
// direkt auf der DOM-Baumstruktur navigiert (childNodes/nodeType) – ein
// Node-Selection/Range ist hier NICHT nötig (anders als bei
// textpfad.ts), nur reine Baum-Traversierung, die linkedom
// vollständig unterstützt. Bisher komplett ungetestet.

import { describe, it, expect } from 'vitest';
import { parseP } from './parseP';
import type { ImpEintrag } from '@/lib/import/basis/basis.index';

function pElement(inner: string): Element {
  const doc = new DOMParser().parseFromString(`<root>${inner}</root>`, 'application/xml');
  return doc.querySelector('P') as unknown as Element;
}

describe('parseP – reiner Text (kein DL)', () => {
  it('einfacher Text ohne Absatznummer', () => {
    expect(parseP(pElement('<P>Einfacher Text ohne Liste.</P>'))).toEqual({
      elemente: [{ type: 'texte', saetze: ['Einfacher Text ohne Liste.'] }],
    });
  });

  it('extrahiert eine führende Absatznummer aus reinem Text', () => {
    expect(parseP(pElement('<P>(1) Text mit Absatznummer.</P>'))).toEqual({
      nummer: '(1)',
      elemente: [{ type: 'texte', saetze: ['Text mit Absatznummer.'] }],
    });
  });

  it('<BR/> und <ZEILENUMBRUCH/> werden zu \\n, das normalisiereWS anschließend zu einem Leerzeichen glättet', () => {
    // EDGE CASE: der Zeilenumbruch geht dadurch im finalen Fließtext
    // verloren (kein struktureller Unterschied zu einem normalen
    // Leerzeichen) – bewusst dokumentiertes Verhalten, kein Bug-Verdacht,
    // da normalisiereWS \s und \n gleich behandelt.
    expect(parseP(pElement('<P>Zeile1<BR/>Zeile2</P>'))).toEqual({
      elemente: [{ type: 'texte', saetze: ['Zeile1 Zeile2'] }],
    });
  });

  it('leeres <P> ergibt null', () => {
    expect(parseP(pElement('<P></P>'))).toBeNull();
  });

  it('<P> mit ausschließlich Whitespace ergibt null', () => {
    expect(parseP(pElement('<P>   </P>'))).toBeNull();
  });

  it('unbekannte Inline-Elemente (z.B. Fußnoten-Referenzen) werden ignoriert, ihre Kinder aber durchwandert', () => {
    expect(parseP(pElement('<P>Text mit <FnR ID="F1"/> und normal weiter.</P>'))).toEqual({
      elemente: [{ type: 'texte', saetze: ['Text mit und normal weiter.'] }],
    });
  });

  it('Wrapper-Elemente mit Textkindern (z.B. <I>kursiv</I>) werden durchwandert, ihr Text bleibt erhalten', () => {
    expect(parseP(pElement('<P>Vor <I>kursiv</I> nach.</P>'))).toEqual({
      elemente: [{ type: 'texte', saetze: ['Vor kursiv nach.'] }],
    });
  });
});

describe('parseP – einfache Liste (<DL>/<DT>/<DD>)', () => {
  it('EDGE CASE: reiner Text DIREKT in <DD> (ohne <LA>-Wrapper) wird NICHT erfasst – walkDD verarbeitet nur <LA>- und <DL>-Kinder', () => {
    // Bewusst dokumentiertes Verhalten, kein Bug-Verdacht: im
    // Bundesjustizamt-Format steht Fließtext in <DD> laut Konvention immer
    // in <LA> gewrappt (siehe processLAInDD-Pfad weiter unten) – reiner
    // Text ohne <LA> kommt in der Praxis nicht vor. Ohne <LA>-Wrapper bleibt
    // texteVor/texteNach hier leer, nur bezeichnung wird gesetzt.
    const absatz = parseP(
      pElement(
        '<P><DL Type="arabic"><DT>1.</DT><DD>Erster Eintrag</DD><DT>2.</DT><DD>Zweiter Eintrag</DD></DL></P>',
      ),
    );
    expect(absatz?.elemente).toEqual([
      {
        type: 'liste',
        eintraege: [
          {
            bezeichnung: '1.',
            texteVor: [],
            untereintraege: [],
            unterlistenTyp: 'other',
            texteNach: [],
          },
          {
            bezeichnung: '2.',
            texteVor: [],
            untereintraege: [],
            unterlistenTyp: 'other',
            texteNach: [],
          },
        ],
      },
    ]);
  });

  it('mit dem korrekten <LA>-Wrapper wird der Text sehr wohl erfasst (Gegenprobe zum vorigen Test)', () => {
    const absatz = parseP(
      pElement('<P><DL Type="arabic"><DT>1.</DT><DD><LA>Erster Eintrag</LA></DD></DL></P>'),
    );
    expect(
      (absatz?.elemente[0] as { eintraege: { texteVor: string[] }[] }).eintraege[0]!.texteVor,
    ).toEqual(['Erster Eintrag']);
  });

  it('EDGE CASE: DD ohne vorangehendes DT bekommt die Fallback-Bezeichnung "-"', () => {
    const absatz = parseP(pElement('<P><DL Type="arabic"><DD>Ohne DT</DD></DL></P>'));
    expect(absatz?.elemente[0]).toMatchObject({
      type: 'liste',
      eintraege: [expect.objectContaining({ bezeichnung: '-' })],
    });
  });

  it('DT-Text wird getrimmt', () => {
    const absatz = parseP(pElement('<P><DL Type="arabic"><DT>  1.  </DT><DD>X</DD></DL></P>'));
    expect(
      (absatz?.elemente[0] as { eintraege: { bezeichnung: string }[] }).eintraege[0]!.bezeichnung,
    ).toBe('1.');
  });

  it('eine leere <DL> (kein DT/DD) ergibt ein liste-Element mit leerer eintraege-Liste (kein null/Absturz)', () => {
    const absatz = parseP(pElement('<P><DL Type="arabic"></DL></P>'));
    expect(absatz?.elemente).toEqual([{ type: 'liste', eintraege: [] }]);
  });
});

describe('parseP – Text vor/nach einer Liste', () => {
  it('Text VOR der Liste (inkl. Absatznummer-Extraktion) wird als eigenes texte-Element vorangestellt', () => {
    const absatz = parseP(
      pElement('<P>(1) Einleitungstext:<DL Type="arabic"><DT>1.</DT><DD>Eintrag</DD></DL></P>'),
    );
    expect(absatz?.nummer).toBe('(1)');
    expect(absatz?.elemente[0]).toEqual({ type: 'texte', saetze: ['Einleitungstext:'] });
    expect(absatz?.elemente[1]!.type).toBe('liste');
  });

  it('Text NACH der Liste wird als eigenes texte-Element angehängt', () => {
    const absatz = parseP(
      pElement('<P><DL Type="arabic"><DT>1.</DT><DD>Eintrag</DD></DL>Text danach.</P>'),
    );
    expect(absatz?.elemente[0]!.type).toBe('liste');
    expect(absatz?.elemente[1]).toEqual({ type: 'texte', saetze: ['Text danach.'] });
  });

  it('EDGE CASE: Text ZWISCHEN zwei top-level Listen verhindert die Zusammenführung (bleiben getrennte liste-Elemente)', () => {
    const absatz = parseP(
      pElement(
        '<P><DL Type="arabic"><DT>1.</DT><DD>A</DD></DL>Zwischentext<DL Type="arabic"><DT>2.</DT><DD>B</DD></DL></P>',
      ),
    );
    expect(absatz?.elemente.map((e) => e.type)).toEqual(['liste', 'texte', 'liste']);
  });

  it('EDGE CASE: zwei UNMITTELBAR aufeinanderfolgende top-level Listen werden zu EINER liste zusammengeführt (z.B. Art. 73 GG)', () => {
    const absatz = parseP(
      pElement(
        '<P><DL Type="arabic"><DT>1.</DT><DD>A</DD></DL><DL Type="arabic"><DT>2.</DT><DD>B</DD></DL></P>',
      ),
    );
    expect(absatz?.elemente).toHaveLength(1);
    expect(absatz?.elemente[0]!.type).toBe('liste');
    expect((absatz?.elemente[0] as { eintraege: unknown[] }).eintraege).toHaveLength(2);
  });
});

describe('parseP – verschachtelte Listen (Unterlisten)', () => {
  it('<LA> mit eingebettetem <DL>: Text vor/nach dem DL wird getrennt, das DL wird zu untereintraege', () => {
    const absatz = parseP(
      pElement(
        '<P><DL Type="arabic"><DT>1.</DT><DD><LA>Text vor<DL Type="alpha"><DT>a)</DT><DD>Unterpunkt</DD></DL>Text nach</LA></DD></DL></P>',
      ),
    );
    const eintrag = (absatz?.elemente[0] as { eintraege: ImpEintrag[] }).eintraege[0]!;
    expect(eintrag.texteVor).toEqual(['Text vor']);
    expect(eintrag.texteNach).toEqual(['Text nach']);
    expect(eintrag.unterlistenTyp).toBe('alpha');
    expect(eintrag.untereintraege).toEqual([
      {
        bezeichnung: 'a)',
        texteVor: [],
        untereintraege: [],
        unterlistenTyp: 'other',
        texteNach: [],
      },
    ]);
  });

  it('<DL> direkt als Kind von <DD> (ohne <LA>-Wrapper) wird ebenso zu untereintraege', () => {
    const absatz = parseP(
      pElement(
        '<P><DL Type="arabic"><DT>1.</DT><DD><DL Type="alpha"><DT>a)</DT><DD>Unter</DD></DL></DD></DL></P>',
      ),
    );
    const eintrag = (absatz?.elemente[0] as { eintraege: ImpEintrag[] }).eintraege[0]!;
    expect(eintrag.untereintraege).toHaveLength(1);
    expect(eintrag.unterlistenTyp).toBe('alpha');
  });

  it('EDGE CASE: hatInneresDL ist ein DD-weites Flag – LA-Elemente NACH der DL-haltigen LA landen automatisch in texteNach, auch ohne eigenes DL', () => {
    const absatz = parseP(
      pElement(
        '<P><DL Type="arabic"><DT>1.</DT><DD>' +
          '<LA>Vor A</LA>' +
          '<LA>Vor B<DL Type="alpha"><DT>a)</DT><DD>Unter</DD></DL></LA>' +
          '<LA>Nach A</LA>' +
          '</DD></DL></P>',
      ),
    );
    const eintrag = (absatz?.elemente[0] as { eintraege: ImpEintrag[] }).eintraege[0]!;
    // "Vor A" kommt VOR der DL-haltigen LA → texteVor.
    // "Vor B" ist der Text-vor-DL-Anteil DERSELBEN LA, die das DL enthält → ebenfalls texteVor.
    // "Nach A" kommt NACH der DL-haltigen LA (hatInneresDL bereits true) → texteNach.
    expect(eintrag.texteVor).toEqual(['Vor A', 'Vor B']);
    expect(eintrag.texteNach).toEqual(['Nach A']);
  });
});
