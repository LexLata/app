// xmlSerialisierung.flattenElemente.test.ts
//
// Unit-Tests für flattenElemente() (xmlSerialisierung.ts) – reine
// Umformungslogik von ImpElement[] (Zwischenformat des Importers) zu
// SatzXML[] (Absatz-Ebene). Fokus: die "fortsetzung"-Erkennung, die einen
// Satz erkennt, der über eine Aufzählung (nummer/litera) hinweg weiterläuft
// (z.B. "Es gilt: 1. ... 2. ... sind wirksam."), im Unterschied zu einem
// Satz, der VOR einer neuen, eigenständigen Aufzählung einfach endet.
//
// Alle Fixtures von Hand gebaut (keine echten XML-Dateien nötig, siehe
// normStrukturPruefung.test.ts / markierungskonfliktPruefung.test.ts für das
// gleiche Vorgehen). Für das Zusammenspiel mit dem satzTokenizer UND der
// vollen XML-Serialisierung siehe stattdessen
// gesetzesXMLNachbereiten.test.ts (Integrationstest auf Ebene des
// GesetzesXML-Strings).

import { describe, it, expect } from 'vitest';
import { flattenElemente } from './xmlSerialisierung';
import type { ImpElement, ImpEintrag } from './importTextstruktur';

function eintrag(bezeichnung: string, texteVor: string[], texteNach: string[] = []): ImpEintrag {
  return { bezeichnung, texteVor, texteNach, untereintraege: [], unterlistenTyp: 'aufzaehlung' };
}

describe('flattenElemente – reiner Fließtext', () => {
  it('mehrere Sätze ohne Liste werden zu eigenständigen SatzXML-Einträgen', () => {
    const elems: ImpElement[] = [{ type: 'texte', saetze: ['Satz eins.', 'Satz zwei.'] }];
    expect(flattenElemente(elems)).toEqual([{ text: 'Satz eins.' }, { text: 'Satz zwei.' }]);
  });

  it('leeres saetze-Array erzeugt keine Einträge', () => {
    expect(flattenElemente([{ type: 'texte', saetze: [] }])).toEqual([]);
  });
});

describe('flattenElemente – Text unmittelbar vor einer Liste', () => {
  it('einzelner Satz direkt vor einer Liste wird dieser als eintraege zugeordnet (nicht als eigener SatzXML-Eintrag)', () => {
    const elems: ImpElement[] = [
      { type: 'texte', saetze: ['Es folgt:'] },
      { type: 'liste', eintraege: [eintrag('1', ['Fall eins.'])] },
    ];
    expect(flattenElemente(elems)).toEqual([
      { text: 'Es folgt:', eintraege: [eintrag('1', ['Fall eins.'])] },
    ]);
  });

  it('bei mehreren Sätzen vor der Liste wird NUR der letzte der Liste zugeordnet, die übrigen bleiben eigenständig', () => {
    const elems: ImpElement[] = [
      { type: 'texte', saetze: ['Vorher.', 'Es folgt:'] },
      { type: 'liste', eintraege: [eintrag('1', ['Fall eins.'])] },
    ];
    expect(flattenElemente(elems)).toEqual([
      { text: 'Vorher.' },
      { text: 'Es folgt:', eintraege: [eintrag('1', ['Fall eins.'])] },
    ]);
  });

  it('reine Liste ganz ohne vorangehenden Text bekommt einen leeren text-Eintrag', () => {
    const elems: ImpElement[] = [{ type: 'liste', eintraege: [eintrag('1', ['Fall eins.'])] }];
    expect(flattenElemente(elems)).toEqual([
      { text: '', eintraege: [eintrag('1', ['Fall eins.'])] },
    ]);
  });
});

describe('flattenElemente – "fortsetzung" (Satz läuft über die Liste hinweg weiter)', () => {
  it('Liste OHNE abschließenden Punkt im letzten Eintrag + nachfolgender Text -> erster Folgesatz wird "fortsetzung"', () => {
    const elems: ImpElement[] = [
      { type: 'liste', eintraege: [eintrag('1', ['Fall eins'])] }, // kein Punkt am Ende!
      { type: 'texte', saetze: ['sind wirksam.', 'Weiterer Satz.'] },
    ];
    expect(flattenElemente(elems)).toEqual([
      { text: '', eintraege: [eintrag('1', ['Fall eins'])], fortsetzung: 'sind wirksam.' },
      { text: 'Weiterer Satz.' },
    ]);
  });

  it('nur der ERSTE Folgesatz wird fortsetzung, weitere Sätze desselben Textblocks bleiben eigenständig', () => {
    // Bereits oben mitgetestet (zweiter Eintrag "Weiterer Satz." bleibt
    // eigenständig statt an die Liste angehängt zu werden) – hier
    // zusätzlich mit drei Folgesätzen, um die Grenze klar zu zeigen.
    const elems: ImpElement[] = [
      { type: 'liste', eintraege: [eintrag('1', ['Fall eins'])] },
      { type: 'texte', saetze: ['sind wirksam.', 'Zweiter.', 'Dritter.'] },
    ];
    const result = flattenElemente(elems);
    expect(result).toHaveLength(3);
    expect(result[0]!.fortsetzung).toBe('sind wirksam.');
    expect(result[1]).toEqual({ text: 'Zweiter.' });
    expect(result[2]).toEqual({ text: 'Dritter.' });
  });

  it('Liste MIT abschließendem Punkt im letzten Eintrag -> KEINE fortsetzung, Folgetext bleibt eigenständig', () => {
    const elems: ImpElement[] = [
      { type: 'liste', eintraege: [eintrag('1', ['Fall eins.'])] }, // Punkt vorhanden
      { type: 'texte', saetze: ['sind wirksam.', 'Weiterer Satz.'] },
    ];
    expect(flattenElemente(elems)).toEqual([
      { text: '', eintraege: [eintrag('1', ['Fall eins.'])] },
      { text: 'sind wirksam.' },
      { text: 'Weiterer Satz.' },
    ]);
  });

  it('Edge-Case: letzter Listeneintrag mit leerem texteVor -> kein lastChar ermittelbar -> KEINE fortsetzung', () => {
    const elems: ImpElement[] = [
      { type: 'liste', eintraege: [eintrag('1', [])] },
      { type: 'texte', saetze: ['Danach.'] },
    ];
    expect(flattenElemente(elems)).toEqual([
      { text: '', eintraege: [eintrag('1', [])] },
      { text: 'Danach.' },
    ]);
  });

  it('Edge-Case: geprüft wird der LETZTE (nicht erste) Eintrag der Liste', () => {
    const elems: ImpElement[] = [
      {
        type: 'liste',
        eintraege: [eintrag('1', ['Fall eins.']), eintrag('2', ['Fall zwei'])], // letzter ohne Punkt
      },
      { type: 'texte', saetze: ['sind wirksam.'] },
    ];
    const result = flattenElemente(elems);
    expect(result[0]!.fortsetzung).toBe('sind wirksam.');
  });

  it('Edge-Case: zwei Text-Blöcke direkt nacheinander nach offener Liste -> nur der ERSTE Block wird als fortsetzung geprüft', () => {
    // Sobald result[letzter].fortsetzung gesetzt ist, greift die
    // Sonderbehandlung für einen weiteren, direkt folgenden 'texte'-Block
    // nicht mehr erneut (Bedingung `letzter.fortsetzung === undefined`).
    const elems: ImpElement[] = [
      { type: 'liste', eintraege: [eintrag('1', ['Fall eins'])] },
      { type: 'texte', saetze: ['sind wirksam.'] },
      { type: 'texte', saetze: ['Ganz neuer Satz.'] },
    ];
    const result = flattenElemente(elems);
    expect(result).toEqual([
      { text: '', eintraege: [eintrag('1', ['Fall eins'])], fortsetzung: 'sind wirksam.' },
      { text: 'Ganz neuer Satz.' },
    ]);
  });
});

describe('flattenElemente – unterabsatz-Marker', () => {
  it('unterabsatz-ImpElement wird zu einem eigenen Marker-Eintrag', () => {
    expect(flattenElemente([{ type: 'unterabsatz' }])).toEqual([
      { text: '', istUnterabsatzMarker: true },
    ]);
  });
});

describe('flattenElemente – Apostroph', () => {
  it('behält den Rohtext bis zur Serialisierung unverändert', () => {
    expect(flattenElemente([{ type: 'texte', saetze: ["D'Artagnan."] }])).toEqual([
      { text: "D'Artagnan." },
    ]);
  });
});
