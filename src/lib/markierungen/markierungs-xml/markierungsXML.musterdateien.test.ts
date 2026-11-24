// markierungsXML.musterdateien.test.ts
// Liest die unveränderlichen Version-1-Musterdateien in src/test/musterdateien/markierungen-v1.
//
// Regeln: Musterdateien werden ab dem Release nur ergänzt, nicht geändert; eine neue
// Schemaversion erhält einen neuen Ordner. Jede künftige App-Version muss sie lesen können.
// Die erwarteten Einträge sind von Hand aus Datei und Formatdoku abgeleitet, nicht aus der
// Parserausgabe. Abweichende Zeilenenden (etwa nach dem Auschecken unter Windows) sind
// unschädlich, weil der XML-Leser sie vereinheitlicht.
//
// Abdeckung (Plan Phase 6, Änderung 1):
// - Unterstreichung im Normtext (Absatz, Satz, Zeichenbereich, erstellt): unterstreichung-hervorhebung.xml, § 433
// - Hervorhebung in Eintragskette (Unterabsatz, äußerer Satz, Nummer mit wiederholung,
//   Litera, Satz im Eintrag): unterstreichung-hervorhebung.xml, § 312g
// - Pauschaler Kommentar mit Elementstand (Titel, Textlänge), mehrzeiligem Kommentartext
//   mit Umlauten, &amp; und Leerraum am Rand, erstellt und geaendert: kommentare.xml, § 433
// - Kommentar mit Textbezug: kommentare.xml, Überschrift 002001
// - Verweismarkierung mit Zielen im gleichen Gesetz, anderen Gesetz und ganzen Gesetz,
//   verweistextZeichenbereich und Elementstand: verweismarkierungen.xml, E25
// - Ausgangsstellen Norm (§ 433), Erwägungsgrund (E25), Überschrift (gliederungskennzahl);
//   Bereiche amtlicher-titel (§ 437), nichtamtlicher-titel (Art. 9), bezeichnung (002001)
// - Emoji in Bezugstext und Zeichenbereich (§ 438, 002001); geschütztes Leerzeichen (§ 438)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { baueXML, parseEintraege } from './markierungs-xml.index';

const ordner = resolve('src/test/musterdateien/markierungen-v1');
const bgb: Gesetzesreferenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const dsgvo: Gesetzesreferenz = { kurztitel: 'DSGVO', normgeber: 'eu' };

const muster: { datei: string; gesetz: Gesetzesreferenz; erwartet: MarkierungsEintrag[] }[] = [
  {
    datei: 'unterstreichung-hervorhebung.xml',
    gesetz: bgb,
    erwartet: [
      {
        typ: 'unterstreichung',
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 433' },
        bezug: {
          typ: 'bezugstext',
          textstelle: {
            pfad: { typ: 'normtext', absatz: '(1)', satz: 2 },
            zeichenbereichStart: 12,
            zeichenbereichEnde: 34,
          },
          bezugstext: 'frei von Sach- und Rec',
        },
        erstellt: '2026-11-19T08:15:00Z',
      },
      {
        typ: 'hervorhebung',
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 312g' },
        bezug: {
          typ: 'bezugstext',
          textstelle: {
            pfad: {
              typ: 'normtext',
              absatz: '(2)',
              unterabsatz: '[1]',
              satz: 3,
              eintraege: [
                { ebene: 'nummer', bezeichnung: '2.', wiederholung: 1 },
                { ebene: 'litera', bezeichnung: 'b)' },
              ],
              satzInEintrag: 2,
            },
            zeichenbereichStart: 0,
            zeichenbereichEnde: 9,
          },
          bezugstext: 'Lieferung',
        },
        erstellt: '2026-11-19T08:20:00Z',
      },
      {
        typ: 'hervorhebung',
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 438' },
        bezug: {
          typ: 'bezugstext',
          // 18 UTF-16-Einheiten: „binnen 2“ (8), geschütztes Leerzeichen (1), „Wochen “ (7), Emoji (2).
          textstelle: {
            pfad: { typ: 'normtext' },
            zeichenbereichStart: 10,
            zeichenbereichEnde: 28,
          },
          bezugstext: 'binnen 2\u00a0Wochen \u{1F4C5}',
        },
      },
      {
        typ: 'unterstreichung',
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 437' },
        bezug: {
          typ: 'bezugstext',
          textstelle: {
            pfad: { typ: 'bereich', bereich: 'amtlicherTitel' },
            zeichenbereichStart: 0,
            zeichenbereichEnde: 7,
          },
          bezugstext: 'Rechte ',
        },
      },
    ],
  },
  {
    datei: 'kommentare.xml',
    gesetz: bgb,
    erwartet: [
      {
        typ: 'kommentar',
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 433' },
        bezug: {
          typ: 'pauschal',
          elementstand: { titel: 'Vertragstypische Pflichten beim Kaufvertrag', textlaenge: 842 },
        },
        kommentarText:
          '  Käufer & Verkäufer: Pflichten prüfen.\nÜbergabe und Übereignung „Zug um Zug“.  ',
        erstellt: '2026-11-19T08:30:00Z',
        geaendert: '2026-11-19T08:45:10Z',
      },
      {
        typ: 'kommentar',
        ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '002001' },
        bezug: {
          typ: 'bezugstext',
          // 10 UTF-16-Einheiten: „Titel 1 “ (8) und Emoji (2).
          textstelle: {
            pfad: { typ: 'bereich', bereich: 'bezeichnung' },
            zeichenbereichStart: 0,
            zeichenbereichEnde: 10,
          },
          bezugstext: 'Titel 1 \u{1F4C5}',
        },
        kommentarText: 'Überschrift prüfen',
        erstellt: '2026-11-19T08:31:00Z',
      },
    ],
  },
  {
    datei: 'verweismarkierungen.xml',
    gesetz: dsgvo,
    erwartet: [
      {
        typ: 'verweismarkierung',
        ausgangsstelle: { typ: 'erwaegungsgrund', bezeichnung: 'E25' },
        bezug: { typ: 'pauschal', elementstand: { textlaenge: 412 } },
        verweisinhalt: {
          // „Art. 6“ 0–6, „§ 26 BDSG“ 13–22, „GG“ 27–29.
          verweistext: 'Art. 6 sowie § 26 BDSG und GG',
          verweisziele: [
            {
              typ: 'zielnorm',
              bezeichnung: 'Art. 6',
              verweistextZeichenbereich: [0, 6],
              elementstand: { titel: 'Rechtmäßigkeit der Verarbeitung', textlaenge: 3051 },
            },
            {
              typ: 'zielnorm',
              gesetz: { kurztitel: 'BDSG', normgeber: 'de-bund' },
              bezeichnung: '§ 26',
              verweistextZeichenbereich: [13, 22],
              elementstand: {
                titel: 'Datenverarbeitung für Zwecke des Beschäftigungsverhältnisses',
                textlaenge: 2280,
              },
            },
            {
              typ: 'ganzesGesetz',
              gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
              verweistextZeichenbereich: [27, 29],
            },
          ],
        },
        erstellt: '2026-11-19T08:40:00Z',
        geaendert: '2026-11-19T08:50:00Z',
      },
      {
        typ: 'verweismarkierung',
        ausgangsstelle: { typ: 'norm', bezeichnung: 'Art. 9' },
        bezug: {
          typ: 'bezugstext',
          textstelle: {
            pfad: { typ: 'bereich', bereich: 'nichtamtlicherTitel' },
            zeichenbereichStart: 0,
            zeichenbereichEnde: 10,
          },
          bezugstext: 'Kategorien',
        },
        verweisinhalt: {
          verweistext: 'Art. 4',
          verweisziele: [
            {
              typ: 'zielnormOhneElementstand',
              bezeichnung: 'Art. 4',
              verweistextZeichenbereich: [0, 6],
            },
          ],
        },
        erstellt: '2026-11-19T08:41:00Z',
      },
    ],
  },
];

describe.each(muster)('Version-1-Musterdatei $datei', ({ datei, gesetz, erwartet }) => {
  const xml = readFileSync(resolve(ordner, datei), 'utf8');

  it('erfüllt das Markierungsschema', async () => {
    const ergebnis = await pruefeSchema('markierungen', xml);
    expect(ergebnis.valid, JSON.stringify(ergebnis.errors)).toBe(true);
  });

  it('wird ohne Befunde mit den erwarteten Einträgen gelesen', () => {
    expect(parseEintraege(xml, gesetz)).toEqual({ eintraege: erwartet, befunde: [] });
  });

  it('hat Zeichenbereiche, die zur Länge von Bezugstext und Verweistext passen', () => {
    for (const eintrag of erwartet) {
      if (eintrag.bezug.typ === 'bezugstext') {
        const { textstelle, bezugstext } = eintrag.bezug;
        expect(textstelle.zeichenbereichEnde - textstelle.zeichenbereichStart).toBe(
          bezugstext.length,
        );
      }
      const verweistext = eintrag.verweisinhalt?.verweistext ?? '';
      for (const {
        verweistextZeichenbereich: [start, ende],
      } of eintrag.verweisinhalt?.verweisziele ?? []) {
        expect(0 <= start && start < ende && ende <= verweistext.length).toBe(true);
      }
    }
  });

  it('ergibt nach Schreiben und erneutem Lesen dieselben Einträge', () => {
    const geschrieben = baueXML(gesetz, parseEintraege(xml, gesetz).eintraege);
    const erneut = parseEintraege(geschrieben, gesetz);
    expect(erneut.befunde).toEqual([]);
    expect(erneut.eintraege).toHaveLength(erwartet.length);
    expect(erneut.eintraege).toEqual(expect.arrayContaining(erwartet));
  });
});
