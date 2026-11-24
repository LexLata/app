// gesetzesXMLParser.property.test.ts
//
// Property-based Tests (fast-check) für parseGesetzesXML() (gesetzesXMLParser.ts).
// Erster Anwendungsfall von fast-check im Projekt (siehe Chatverlauf zur
// Mutation-Testing-Auswertung): ergänzt die beispielbasierten Tests in den
// anderen vier gesetzesXMLParser.*.test.ts-Dateien gezielt dort, wo eine klare,
// formulierbare Invariante existiert – nicht als Ersatz für die
// Beispiel-Tests, sondern für die Fälle, in denen "für JEDE Eingabe dieser
// Form gilt X" die eigentliche Eigenschaft ist, die geprüft werden soll.
//
// Bewusst NICHT für den Rest der Datei eingesetzt: der DOM-Struktur-Aufbau
// (Absatz/Unterabsatz/Satz/ListenEintrag) hat keine kompakte mathematische
// Invariante, sondern ist an das konkrete Bundesjustizamt-XML-Format
// gebunden – dafür bleiben Beispiel-Fixtures das richtige Werkzeug.
//
// Beide Eigenschaften unten werden bewusst über die ÖFFENTLICHE API
// (parseGesetzesXML) geprüft statt über exportierte interne Helper
// (ebeneAusGliederungskennzahl, wiederholungsIndexVonElementen) – das vermeidet eine
// zusätzliche, nur für Tests existierende Export-Fläche (siehe
// "keine Abstraktion ohne zwei echte Anwendungsfälle" im Projekt) und prüft
// gleichzeitig realistischer, dass die Invariante auch nach dem Rundgang
// durchs echte XML-Parsing hält.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseGesetzesXML } from './gesetzesXMLParser';
import type { NormDarstellung, UeberschriftDarstellung } from '@/lib/domain/gesetzTypes';

function gesetzXml(inhaltInner: string): string {
  return `<?xml version="1.0"?><gesetz id="g1"><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos><inhalt>${inhaltInner}</inhalt></gesetz>`;
}

describe('parseGesetzesXML – Property: Gliederungs-Ebene aus Gliederungskennzahl-Länge', () => {
  it('Ebene = max(1, Anzahl vollständiger 3-Zeichen-Gruppen der GETRIMMTEN Gliederungskennzahl) – für beliebige Kernlänge und beliebiges umschließendes Whitespace-Padding', () => {
    fc.assert(
      fc.property(
        // Kern: nur Ziffern (entspricht dem realen Format echter
        // gliederungskennzahl-Werte, z.B. "010010") – vermeidet zugleich
        // jede Notwendigkeit von XML-Escaping im generierten Attributwert.
        fc.string({
          unit: fc.constantFrom(...'0123456789'.split('')),
          minLength: 0,
          maxLength: 15,
        }),
        // Padding: nur Leerzeichen/Tabs (kein \n – XML-Attributwerte
        // normalisieren jedes Whitespace-Zeichen ohnehin auf ein einzelnes
        // #x20 beim Parsen, das würde die Längen-Invariante nicht verfälschen,
        // ist hier aber bewusst vermieden, um diese Normalisierung nicht
        // ungewollt mitzutesten).
        fc.array(fc.constantFrom(' ', '\t'), { maxLength: 5 }).map((a) => a.join('')),
        fc.array(fc.constantFrom(' ', '\t'), { maxLength: 5 }).map((a) => a.join('')),
        (kern, padLinks, padRechts) => {
          const gliederungskennzahl = padLinks + kern + padRechts;
          const erwarteteEbene = Math.max(1, Math.floor(kern.length / 3));
          const g = parseGesetzesXML(
            gesetzXml(
              `<gliederung gliederungskennzahl="${gliederungskennzahl}"><bezeichnung>T</bezeichnung></gliederung>`,
            ),
          );
          expect((g!.elemente[0]!.data as UeberschriftDarstellung).ebene).toBe(erwarteteEbene);
        },
      ),
    );
  });
});

describe('parseGesetzesXML – Property: wiederholung-Index bei Listeneintrags-Geschwistern', () => {
  it('für jeden Eintrag entspricht wiederholung genau der Anzahl VORHERIGER Geschwister mit identischer bezeichnung (unabhängig von der Gesamtreihenfolge/Verteilung)', () => {
    fc.assert(
      fc.property(
        // Kleines Alphabet an bezeichnungen, absichtlich mit hoher
        // Kollisionswahrscheinlichkeit (a/b/c), damit Duplikat- UND
        // Nicht-Duplikat-Nachbarschaften in derselben generierten Folge
        // vorkommen – genau der Fall, den der überlebende Mutant (#120,
        // bezeichnungVonListenElement(...) === bezeichnung → immer true)
        // bricht.
        fc.array(fc.constantFrom('a)', 'b)', 'c)'), { minLength: 1, maxLength: 8 }),
        (bezeichnungen) => {
          const inner = bezeichnungen
            .map(
              (b, i) =>
                `<litera buchstabe="${b}">Text <verweis norm="ziel${i}">Z${i}</verweis></litera>`,
            )
            .join('');
          const g = parseGesetzesXML(
            gesetzXml(`<norm id="n1"><bezeichnung>§1</bezeichnung><text>${inner}</text></norm>`),
          );
          const norm = g!.elemente[0]!.data as NormDarstellung;
          const verweise = norm.getaggteVerweise ?? [];

          bezeichnungen.forEach((b, i) => {
            const erwarteteWiederholung = bezeichnungen.slice(0, i).filter((x) => x === b).length;
            const verweis = verweise.find((v) => v.zielBezeichnung === `ziel${i}`);
            const tatsaechlich = verweis?.textstelle.pfad.eintraege?.[0]?.wiederholung ?? 0;
            expect(tatsaechlich).toBe(erwarteteWiederholung);
          });
        },
      ),
    );
  });
});

describe('parseGesetzesXML – Properties der Fließtext-Normalisierung', () => {
  const wort = fc.string({
    unit: fc.constantFrom('a', 'b', '😀', ' '),
    minLength: 1,
    maxLength: 8,
  });
  const leerraum = fc
    .array(fc.constantFrom(' ', '\t', '\r', '\n'), { minLength: 1, maxLength: 8 })
    .map((zeichen) => zeichen.join(''));
  function normMitText(inhalt: string): NormDarstellung {
    return parseGesetzesXML(
      gesetzXml(`<norm><bezeichnung>§ 1</bezeichnung><text>${inhalt}</text></norm>`),
    )!.elemente[0]!.data as NormDarstellung;
  }
  it('zusätzliche Einrückung erhält Text, Bezugstext und Verweispositionen', () => {
    fc.assert(
      fc.property(wort, wort, leerraum, (links, rechts, abstand) => {
        const kompakt = normMitText(`${links} <verweis norm="§ 2">${rechts} Ziel</verweis> Ende`);
        const eingerueckt = normMitText(
          `${abstand}${links}${abstand}<verweis norm="§ 2">${rechts}${abstand}Ziel</verweis>${abstand}Ende${abstand}`,
        );
        expect(eingerueckt.absaetze[0]!.saetze[0]!.text).toBe(kompakt.absaetze[0]!.saetze[0]!.text);
        expect(eingerueckt.getaggteVerweise).toEqual(kompakt.getaggteVerweise);
      }),
    );
  });
  it('wiederholtes Lesen des normalisierten Textes ändert ihn nicht', () => {
    fc.assert(
      fc.property(wort, wort, leerraum, (links, rechts, abstand) => {
        const einmal = normMitText(`${abstand}${links}${abstand}${rechts}${abstand}`).absaetze[0]!
          .saetze[0]!.text;
        expect(einmal).toBe(`${links} ${rechts}`);
        const zweimal = normMitText(einmal).absaetze[0]!.saetze[0]!.text;
        expect(zweimal).toBe(einmal);
      }),
    );
  });
});
