// gesetzesXMLParser.eintragsKette.test.ts
//
// Regressionstest für die Textpfad.eintraege-Vereinheitlichung (ersetzt die
// früheren Einzelfelder nummer/litera). Deckt den Fall ab, der die Umstellung
// ausgelöst hat: eine dritte Verschachtelungsebene (z.B. "aa)" unter "a)"
// unter "1.") war vorher nicht von einer strukturell identischen Stelle
// unter einer ANDEREN Nummer (z.B. "aa)" unter "a)" unter "2.")
// unterscheidbar – siehe Kommentar zu Textpfad.eintraege in
// textpfad.ts.
//
// Vitest (Node-Umgebung). Der DOMParser-Polyfill (linkedom, für die
// Browser-DOMParser-API in gesetzesXMLParser.ts) kommt zentral aus
// src/test/setupNode.ts, nicht mehr aus dieser Datei.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';
import { pfadGleich, vergleicheTextpfad } from '@/lib/domain/textpfad/textpfad.index';
import { textAnTextpfad } from '@/lib/domain/textpfad/textpfad.index';
import { formatiereZitat } from '@/lib/markierungen/markierungen.index';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';

// --- Testdaten: § 1 Abs. 1 mit Nr. 1 a) aa)/bb), Nr. 1 b), Nr. 2 a) aa) ---
// (GesetzesXML-Format, keine rohe Bundesjustizamt-Quelle)
const xml = `<?xml version="1.0"?>
<gesetz id="test">
  <infos><normgeber>de-bund</normgeber><langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel></infos>
  <inhalt>
    <norm id="n1">
      <bezeichnung>§ 1</bezeichnung>
      <text>
        <absatz zahl="(1)">
          <nummer zahl="1.">
            <litera buchstabe="a)">
              Text a
              <litera buchstabe="aa)">Text aa unter 1a</litera>
              <litera buchstabe="bb)">Text bb unter 1a</litera>
            </litera>
            <litera buchstabe="b)">Text b unter 1</litera>
          </nummer>
          <nummer zahl="2.">
            <litera buchstabe="a)">
              Text a
              <litera buchstabe="aa)">Text aa unter 2a</litera>
            </litera>
          </nummer>
        </absatz>
      </text>
    </norm>
  </inhalt>
</gesetz>`;

const pfadAaUnter1a: Textpfad = normtextPfad({
  absatz: '(1)',
  eintraege: [
    { ebene: 'nummer', bezeichnung: '1.' },
    { ebene: 'litera', bezeichnung: 'a)' },
    { ebene: 'litera', bezeichnung: 'aa)' },
  ],
});
const pfadAaUnter2a: Textpfad = normtextPfad({
  absatz: '(1)',
  eintraege: [
    { ebene: 'nummer', bezeichnung: '2.' },
    { ebene: 'litera', bezeichnung: 'a)' },
    { ebene: 'litera', bezeichnung: 'aa)' },
  ],
});

describe('Textpfad.eintraege – Baumaufbau und Kernfall der Umstellung', () => {
  let norm: NormDarstellung;

  beforeAll(() => {
    const gesetz = parseGesetzesXML(xml);
    expect(gesetz).not.toBeNull();
    norm = gesetz!.elemente[0]!.data as NormDarstellung;
  });

  it('Baumaufbau: ebene korrekt aus dem echten XML-Tag, nicht aus der Tiefe geraten', () => {
    const satz = norm.absaetze[0]!.saetze[0]!;
    const nr1 = satz.eintraege.find((e) => e.bezeichnung === '1.');
    const nr2 = satz.eintraege.find((e) => e.bezeichnung === '2.');
    expect(nr1?.ebene, 'Nr. 1 vorhanden').toBe('nummer');
    expect(nr2?.ebene, 'Nr. 2 vorhanden').toBe('nummer');

    const litA1 = nr1?.untereintraege.find((e) => e.bezeichnung === 'a)');
    expect(litA1?.ebene, 'lit. a) unter Nr. 1').toBe('litera');
    const litAa1 = litA1?.untereintraege.find((e) => e.bezeichnung === 'aa)');
    expect(litAa1?.ebene, 'lit. aa) unter Nr. 1 a) (3. Ebene korrekt erkannt)').toBe('litera');
  });

  it('pfadGleich: gleicher Pfad ist gleich, unterschiedliche Nummer-Eltern nicht', () => {
    expect(pfadGleich(pfadAaUnter1a, pfadAaUnter1a)).toBe(true);
    expect(
      pfadGleich(pfadAaUnter1a, pfadAaUnter2a),
      'aa) unter 1a) ≠ aa) unter 2a) (Kernfall der Umstellung)',
    ).toBe(false);
  });

  it('vergleicheTextpfad liefert konsistente Ordnung (≠ 0) für unterschiedliche Pfade', () => {
    expect(vergleicheTextpfad(pfadAaUnter1a, pfadAaUnter2a)).not.toBe(0);
  });

  it('textAnTextpfad löst beide Pfade auf den jeweils richtigen (unterschiedlichen) Text auf', () => {
    expect(
      textAnTextpfad(norm, {
        pfad: pfadAaUnter1a,
        zeichenbereichStart: 0,
        zeichenbereichEnde: 100,
      }),
    ).toBe('Text aa unter 1a');
    expect(
      textAnTextpfad(norm, {
        pfad: pfadAaUnter2a,
        zeichenbereichStart: 0,
        zeichenbereichEnde: 100,
      }),
    ).toBe('Text aa unter 2a');
  });

  it('Zitat-Bildung: "Nr. 1a" (verschmolzen) + "lit. aa" (eigenes Token)', () => {
    const zitatEinstellungen = {
      abkuerzungenAktiv: true,
      ohnePunkt: false,
      roemischeAbsaetze: false,
    };
    expect(formatiereZitat('§ 1', 'TestG', pfadAaUnter1a, zitatEinstellungen)).toBe(
      '§ 1 Abs. 1 Nr. 1a lit. aa TestG',
    );
    expect(formatiereZitat('§ 1', 'TestG', pfadAaUnter2a, zitatEinstellungen)).toBe(
      '§ 1 Abs. 1 Nr. 2a lit. aa TestG',
    );
  });
});

// ---------------------------------------------------------------------------
// GetaggterVerweis.eintraege trägt wiederholung bei Duplikat-Bezeichnung
// (Regressionstest für den Fix: <verweismarkierung>-Tags im ZWEITEN von zwei
// Listeneinträgen mit identischer bezeichnung, z.B. unnummerierte Listen
// buchstabe="-", wurden vorher fälschlich dem ERSTEN Eintrag zugeordnet, da
// die Eintrags-Kette von GetaggterVerweis nie ein wiederholung-Feld trug.)
// ---------------------------------------------------------------------------

describe('GetaggterVerweis.eintraege – wiederholung bei Duplikat-Bezeichnung', () => {
  let norm2: NormDarstellung;

  beforeAll(() => {
    const xmlDuplikat = `<?xml version="1.0"?>
<gesetz id="test2">
  <infos><normgeber>de-bund</normgeber><langtitel>Testgesetz 2</langtitel><kurztitel>TestG2</kurztitel></infos>
  <inhalt>
    <norm id="n2">
      <bezeichnung>§ 2</bezeichnung>
      <text>
        <absatz zahl="(1)">
          <litera buchstabe="-">Erster Punkt <verweis norm="§ 1 TestG2">§ 1</verweis> Ende</litera>
          <litera buchstabe="-">Zweiter Punkt <verweis norm="§ 2 TestG2">§ 2</verweis> Ende</litera>
        </absatz>
      </text>
    </norm>
  </inhalt>
</gesetz>`;
    const gesetz2 = parseGesetzesXML(xmlDuplikat);
    expect(gesetz2, 'Gesetz 2 (Duplikat-Bezeichnung) erfolgreich geparst').not.toBeNull();
    norm2 = gesetz2!.elemente[0]!.data as NormDarstellung;
  });

  it('findet zwei getaggte Verweise', () => {
    const verweise = norm2.getaggteVerweise ?? [];
    expect(verweise.length).toBe(2);
  });

  it('unterscheidet ersten und zweiten Duplikat-Eintrag über wiederholung', () => {
    const verweise = norm2.getaggteVerweise ?? [];
    const ersterVerweis = verweise.find((v) => v.zielBezeichnung === '§ 1 TestG2');
    const zweiterVerweis = verweise.find((v) => v.zielBezeichnung === '§ 2 TestG2');

    expect(
      ersterVerweis?.textstelle.pfad.eintraege?.[0]?.wiederholung,
      'Verweis im ERSTEN Duplikat-Eintrag: wiederholung undefined/0',
    ).toBeFalsy();
    expect(
      zweiterVerweis?.textstelle.pfad.eintraege?.[0]?.wiederholung,
      'Verweis im ZWEITEN Duplikat-Eintrag: wiederholung = 1 (Kern des Fixes)',
    ).toBe(1);
    expect(
      ersterVerweis?.textstelle.pfad.eintraege,
      'Eintrags-Ketten der beiden Verweise sind dadurch NICHT mehr identisch',
    ).not.toEqual(zweiterVerweis?.textstelle.pfad.eintraege);
  });
});

it('normalisiert Haupttext, Fortsetzung und Unterliste unabhängig', () => {
  const gesetz = parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><text><nummer zahl="1."> \nVor  😀 <verweis norm="§ 1">§\t1</verweis> \n<litera buchstabe="a)"> \nKind\t Text \n</litera> \nNach  <verweis norm="§ 2">§\n2</verweis> \n</nummer></text></norm></inhalt></gesetz>`,
  );
  const norm = gesetz!.elemente[0]!.data as NormDarstellung;
  const eintrag = norm.absaetze[0]!.saetze[0]!.eintraege[0]!;
  expect(eintrag.text).toBe('Vor 😀 § 1');
  expect(eintrag.fortsetzung).toBe('Nach § 2');
  expect(eintrag.untereintraege[0]!.text).toBe('Kind Text');
  expect(norm.getaggteVerweise).toMatchObject([
    { bezugstext: '§ 1', textstelle: { zeichenbereichStart: 7, zeichenbereichEnde: 10 } },
    { bezugstext: '§ 2', textstelle: { zeichenbereichStart: 15, zeichenbereichEnde: 18 } },
  ]);
});
