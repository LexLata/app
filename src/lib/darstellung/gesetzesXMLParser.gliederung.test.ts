// gesetzesXMLParser.gliederung.test.ts
//
// Tests für parseGesetzesXML() (gesetzesXMLParser.ts) – Fokus:
// <gliederung>→UeberschriftDarstellung-Umwandlung (ebeneAusGliederungskennzahl) und den
// zweiten Pass zur ueberschriftartig-Vorberechnung für Gliederungsartikel
// (z.B. EGBGB). Bisher komplett ungetestet. Teil der Aufteilung in vier
// fokussierte Dateien, siehe .gesetzInfos.test.ts für den Gesamtüberblick.

import { describe, it, expect } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { berechneElementstand } from '@/lib/domain/gesetzDarstellungAuswertung';
import { aktuellerTextAnPfad } from '@/lib/domain/textpfad/textpfad.index';
import { parseGesetzesXML } from './gesetzesXMLParser';

function gesetzXml(inhaltInner: string): string {
  return `<?xml version="1.0"?><gesetz id="g1"><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos><inhalt>${inhaltInner}</inhalt></gesetz>`;
}

function normIstUeberschriftartig(gesetz: GesetzDarstellung | null): boolean {
  const element = gesetz?.elemente[0];
  return (
    element?.typ === 'norm' &&
    element.data.art === 'gliederungsartikel' &&
    element.data.ueberschriftartig
  );
}

describe('parseGesetzesXML – <gliederung> → UeberschriftDarstellung', () => {
  it('liest bezeichnung, titel, ebene (aus 3-stelliger Gliederungskennzahl) und leitet die xmlId im Namensraum für Überschriften ab', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<gliederung gliederungskennzahl="010"><bezeichnung>Teil 1</bezeichnung><titel>Allgemeiner Teil</titel></gliederung>',
      ),
    );
    expect(g!.elemente[0]!).toEqual({
      typ: 'ueberschrift',
      data: expect.objectContaining({
        xmlId: 'ueberschrift:010',
        bezeichnung: 'Teil 1',
        titel: 'Allgemeiner Teil',
        ebene: 1,
        gliederungskennzahl: '010',
      }),
    });
  });

  it('EDGE CASE: Ebene wird aus der Anzahl der 3-Zeichen-Gruppen der Gliederungskennzahl berechnet (6 Stellen → Ebene 2)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<gliederung gliederungskennzahl="010010"><bezeichnung>Kapitel 1</bezeichnung></gliederung>',
      ),
    );
    expect(g!.elemente[0]!.data).toMatchObject({ ebene: 2, xmlId: 'ueberschrift:010010' });
  });

  it('EDGE CASE: 9-stellige Gliederungskennzahl → Ebene 3', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<gliederung gliederungskennzahl="010010010"><bezeichnung>Abschnitt 1</bezeichnung></gliederung>',
      ),
    );
    expect(g!.elemente[0]!.data).toMatchObject({ ebene: 3 });
  });

  it('EDGE CASE: leere/fehlende Gliederungskennzahl fällt auf Mindest-Ebene 1 zurück (kein 0 oder negative Ebene)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<gliederung gliederungskennzahl=""><bezeichnung>Ohne Gliederungskennzahl</bezeichnung></gliederung>',
      ),
    );
    expect(g!.elemente[0]!.data).toMatchObject({ ebene: 1, xmlId: 'ueberschrift:' });
  });

  it('EDGE CASE: Gliederungskennzahl mit umschließendem Whitespace wird für die Ebenen-Berechnung getrimmt (Whitespace zählt nicht als Gruppenzeichen)', () => {
    // "   010" hat ungetrimmt 6 Zeichen (→ Ebene 2 wäre falsch), getrimmt "010" nur 3 (→ Ebene 1).
    // Die Kennzahl bleibt in der xmlId ungetrimmt; nur die Ebenen-Berechnung trimmt intern.
    const g = parseGesetzesXML(
      gesetzXml(
        '<gliederung gliederungskennzahl="   010"><bezeichnung>T</bezeichnung></gliederung>',
      ),
    );
    expect(g!.elemente[0]!.data).toMatchObject({ ebene: 1, xmlId: 'ueberschrift:   010' });
  });

  it('ohne titel-Tag bleibt titel undefined (nicht leerer String)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<gliederung gliederungskennzahl="010"><bezeichnung>Teil 1</bezeichnung></gliederung>',
      ),
    );
    expect(g!.elemente[0]!.data.titel).toBeUndefined();
  });

  it('ohne bezeichnung-Tag bleibt bezeichnung leerer String (nicht undefined, nicht wirft)', () => {
    const g = parseGesetzesXML(
      gesetzXml('<gliederung gliederungskennzahl="010"><titel>Allgemeines</titel></gliederung>'),
    );
    expect(g!.elemente[0]!.data.bezeichnung).toBe('');
  });

  it('bezeichnung und titel werden getrimmt (umschließender Whitespace im XML-Text)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<gliederung gliederungskennzahl="010"><bezeichnung>  Teil 1  </bezeichnung><titel>  Allgemeiner Teil  </titel></gliederung>',
      ),
    );
    expect(g!.elemente[0]!.data).toMatchObject({
      bezeichnung: 'Teil 1',
      titel: 'Allgemeiner Teil',
    });
  });
});

describe('parseGesetzesXML – ueberschriftartig (nur bei hatGliederungsartikel=true)', () => {
  it('EDGE CASE: ein Gliederungsartikel gefolgt von einem tieferen Element (§ darunter) wird als überschriftsartig erkannt', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="229" gliederungskennzahl="229"><bezeichnung>Art. 229</bezeichnung></norm>' +
          '<norm id="229-1" gliederungskennzahl="229010"><bezeichnung>Art. 229 § 1</bezeichnung></norm>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(true);
  });

  it('ein Gliederungsartikel OHNE tieferes Folgeelement bleibt ueberschriftartig=false (z.B. Art. 223a EGBGB)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="223a" gliederungskennzahl="223"><bezeichnung>Art. 223a</bezeichnung></norm>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(false);
  });

  it('EDGE CASE: zwei Gliederungsartikel GLEICHER Ebene hintereinander – der erste bleibt false (Folgeelement ist nicht TIEFER)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="229" gliederungskennzahl="229"><bezeichnung>Art. 229</bezeichnung></norm>' +
          '<norm id="249" gliederungskennzahl="249"><bezeichnung>Art. 249</bezeichnung></norm>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(false);
  });

  it('EDGE CASE: eine tiefere <gliederung>-Überschrift als Folgeelement zählt ebenfalls als "tiefer" (nicht nur Normen)', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="229" gliederungskennzahl="229"><bezeichnung>Art. 229</bezeichnung></norm>' +
          '<gliederung gliederungskennzahl="229010"><bezeichnung>Unterabschnitt</bezeichnung></gliederung>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(true);
  });

  it('Gliederungsartikel mit tieferem Folgeelement werden ohne zusätzlichen Infotag erkannt', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="229" gliederungskennzahl="229"><bezeichnung>Art. 229</bezeichnung></norm>' +
          '<norm id="229-1" gliederungskennzahl="229010"><bezeichnung>Art. 229 § 1</bezeichnung></norm>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(true);
  });

  it('normale §-Normen (kein gliederungskennzahl-Attribut) werden vom zweiten Pass ignoriert', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="433"><bezeichnung>§ 433</bezeichnung></norm>' +
          '<norm id="434"><bezeichnung>§ 434</bezeichnung></norm>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(false);
  });

  it('EDGE CASE: eine <gliederung>-Überschrift als Folgeelement, die NICHT tiefer (gleiche Ebene) ist, macht das Gliederungsartikel-Element NICHT überschriftsartig', () => {
    // Grenzfall zu der Zeile darüber: dort ist die Folge-Überschrift TIEFER (Ebene 2) und
    // macht ueberschriftartig=true. Hier ist sie GLEICH TIEF (Ebene 1) wie der
    // Gliederungsartikel selbst (gliederungskennzahl "229" hat implizit Ebene 1) – das darf NICHT als
    // "tiefer" durchgehen, egal welche Ebene die Folge-Überschrift tatsächlich hat.
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="229" gliederungskennzahl="229010"><bezeichnung>Art. 229 § 1</bezeichnung></norm>' +
          '<gliederung gliederungskennzahl="230"><bezeichnung>Teil 2</bezeichnung></gliederung>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(false);
  });

  it('letztes Element im Gesetz (kein Folgeelement) bleibt ueberschriftartig=false statt zu werfen', () => {
    const g = parseGesetzesXML(
      gesetzXml(
        '<norm id="229" gliederungskennzahl="229"><bezeichnung>Art. 229</bezeichnung></norm>',
      ),
    );
    expect(normIstUeberschriftartig(g)).toBe(false);
  });
});

describe('Normarten als Fälle', () => {
  it.each([
    ['', 'normal', undefined],
    ['typ="unbekannt"', 'normal', undefined],
    ['typ="erwaegungsgrund"', 'erwaegungsgrund', undefined],
    ['gliederungskennzahl="010"', 'gliederungsartikel', false],
  ])('liest %s mit und ohne Wegfallstatus', (attribute, art, ueberschriftartig) => {
    for (const status of ['', 'status="weggefallen"']) {
      const gesetz = parseGesetzesXML(
        gesetzXml(`<norm id="n" ${attribute} ${status}><bezeichnung>1</bezeichnung></norm>`),
      );
      const element = gesetz?.elemente[0];
      expect(element?.typ).toBe('norm');
      if (element?.typ !== 'norm') throw new Error('Norm erwartet');
      expect(element.data).toMatchObject({ art });
      expect(Reflect.get(element.data, 'ueberschriftartig')).toBe(ueberschriftartig);
      expect(element.data.status).toBe(status ? 'weggefallen' : undefined);
    }
  });

  it('kennzeichnet den Gliederungsartikel vor einer normalen Norm als überschriftartig', () => {
    const gesetz = parseGesetzesXML(
      gesetzXml(
        '<norm id="a" gliederungskennzahl="010"><bezeichnung>Art. 1</bezeichnung></norm><norm id="n"><bezeichnung>§ 1</bezeichnung></norm>',
      ),
    );
    expect(gesetz?.elemente[0]?.data).toMatchObject({
      art: 'gliederungsartikel',
      gliederungsEbene: 1,
      ueberschriftartig: true,
    });
  });
});

it('liest Regelungstext samt Zusatztext und Verweisen unter Überschriften, ohne Fußnoten zu übernehmen', () => {
  const g = parseGesetzesXML(
    gesetzXml(
      '<gliederung gliederungskennzahl="010"><text><absatz zahl="(1)">Siehe <verweis norm="§ 1">hier</verweis>.</absatz><tabelle>Zusatz</tabelle></text><fussnoten>Fußnote</fussnoten></gliederung>',
    ),
  );
  expect(g?.elemente[0]?.data).toMatchObject({
    text: {
      absaetze: [{ bezeichnung: '(1)', saetze: [{ text: 'Siehe hier.' }] }],
      zusatztexte: [{ nachAbsatz: 1, text: 'Zusatz' }],
      getaggteVerweise: [expect.any(Object)],
    },
  });
  expect(g?.elemente[0]?.data).not.toHaveProperty('fussnoten');
});

it.each(['', '<text/>', '<text>  </text>'])(
  'setzt bei fehlendem oder leerem Überschrifttext kein Textfeld: %s',
  (text) => {
    const g = parseGesetzesXML(
      gesetzXml(`<gliederung gliederungskennzahl="010">${text}</gliederung>`),
    );
    expect(g?.elemente[0]?.data).not.toHaveProperty('text');
  },
);

it('behandelt Überschriften mit Text weiterhin als Überschriften für Elementstand und Textpfade', () => {
  const g = parseGesetzesXML(
    gesetzXml(
      '<gliederung gliederungskennzahl="010"><bezeichnung>Teil 1</bezeichnung><titel>Titel</titel><text>Regelung</text></gliederung>',
    ),
  );
  const u = g?.elemente[0]?.data;
  if (!u) throw new Error('Überschrift erwartet');
  expect(berechneElementstand(u)).toEqual({ titel: 'Titel', textlaenge: 11 });
  expect(
    aktuellerTextAnPfad(u, {
      pfad: { typ: 'normtext' },
      zeichenbereichStart: 0,
      zeichenbereichEnde: 4,
    }),
  ).toBeUndefined();
});
