// HTMLImporterBW.test.ts
//
// Bisher ungetesteter Importer – Tests wurden VOR dem Cognitive-Complexity-
// Refactor von leseNormen() anhand des bestehenden Verhaltens geschrieben und
// dienen als Regressionsbasis für die anschließende Aufteilung der Funktion.
// Rundreise-Ansatz (wie an anderer Stelle im Projekt für Import-Pipelines
// üblich): importiereGesetzHTMLBW() liefert GesetzesXML zurück,
// das hier zusätzlich über parseGesetzesXML() zurück in ein GesetzDarstellung
// geparst wird, um Struktur-Assertions auf der vertrauten Darstellungsebene
// statt auf rohem XML-String zu erlauben. satztokenisierungAktiv wird in den
// meisten Tests bewusst auf false gesetzt, um Satztokenizer-Details (eigene
// Baustelle, siehe cognitive-complexity-Backlog für satzTokenizer.ts)
// auszublenden – hier interessiert nur die BW-spezifische HTML→Struktur-Logik.

import { describe, it, expect } from 'vitest';
import { importiereGesetzHTMLBW } from './HTMLImporterBW';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import type { NormDarstellung, UeberschriftDarstellung } from '@/lib/domain/gesetzTypes';

function titelZeile(
  kurz: string,
  langUndDatum: string,
  weiteres = 'gültig ab: 2000-01-01',
): string {
  return `Landesrecht BW -   ${kurz} | Landesnorm Baden-Württemberg | Gesamtausgabe | ${langUndDatum} | ${weiteres}`;
}

function doc(titel: string, koerper: string): string {
  return `<!DOCTYPE html><html><head><title>${titel}</title></head><body>${koerper}</body></html>`;
}

function importieren(
  koerper: string,
  titel = titelZeile('TestG', 'Testgesetz (TestG) vom 1. Januar 2000'),
) {
  // satztokenisierungAktiv=false: blendet Satztokenizer-Details aus (eigene
  // Baustelle, siehe cognitive-complexity-Backlog für satzTokenizer.ts) –
  // hier interessiert nur die BW-spezifische HTML→Struktur-Logik.
  return importiereGesetzHTMLBW(doc(titel, koerper), undefined, false);
}

const H = 'style="font-family: Arial"'; // istInhaltsUeberschrift-Marker

describe('importiereGesetzHTMLBW – Fehler-/Kantenfälle', () => {
  it('fehlender/unvollständiger <title> (weniger als 4 Segmente) → Fehler', () => {
    const ergebnis = importieren(
      '<div class="docLayoutText"></div>',
      'Zu wenige | Segmente | hier',
    );
    expect(ergebnis.fehler).toBeDefined();
    expect(ergebnis.xmlString).toBeUndefined();
  });

  it('fehlender Inhaltsbereich (.docLayoutText) → Fehler', () => {
    const ergebnis = importieren('<div class="andereKlasse"></div>');
    expect(ergebnis.fehler).toMatch(/docLayoutText/);
  });

  it('keine Normen im Dokument gefunden → Fehler', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><p>Nur ein Absatz ohne Norm.</p></div>`,
    );
    expect(ergebnis.fehler).toMatch(/Normen/);
  });
});

describe('importiereGesetzHTMLBW – Metadaten aus <title>', () => {
  it('extrahiert kurztitel, langtitel und ausfertigung ("vom ...")', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4><p>Text.</p></div>`,
      titelZeile('TestG', 'Testgesetz (TestG) vom 1. Januar 2000'),
    );
    expect(ergebnis.kurztitel).toBe('TestG');
    expect(ergebnis.langtitel).toBe('Testgesetz');
    const g = parseGesetzesXML(ergebnis.xmlString!);
    expect(g!.ausfertigung).toBe('2000-01-01');
  });

  it('EDGE CASE: amtliche Abkürzung NICHT am Ende, sondern gefolgt von "in der Fassung vom ..." (z.B. GemO)', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4><p>Text.</p></div>`,
      titelZeile('GemO', 'Gemeindeordnung (GemO) in der Fassung vom 5. Mai 1999'),
    );
    expect(ergebnis.langtitel).toBe('Gemeindeordnung');
    const g = parseGesetzesXML(ergebnis.xmlString!);
    expect(g!.ausfertigung).toBe('1999-05-05');
  });

  it('kurztitelOverride ersetzt den aus dem Titel abgeleiteten Kurztitel', () => {
    const ergebnis = importiereGesetzHTMLBW(
      doc(
        titelZeile('TestG', 'Testgesetz (TestG) vom 1. Januar 2000'),
        `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4><p>Text.</p></div>`,
      ),
      undefined,
      true,
      'AbwGesetz',
    );
    expect(ergebnis.kurztitel).toBe('AbwGesetz');
  });

  it('liest den Stand-Text aus td.StandangabeStand (Präfix "letzte berücksichtigte Änderung:" entfernt)', () => {
    const ergebnis = importieren(
      `<table><tr><td class="StandangabeStand">Stand</td><td>letzte berücksichtigte Änderung: 12.03.2021</td></tr></table>` +
        `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4><p>Text.</p></div>`,
    );
    expect(ergebnis.aenderungsvermerk).toBe('12.03.2021');
  });
});

describe('importiereGesetzHTMLBW – Norm-/Gliederungserkennung', () => {
  it('einstufige Struktur (nur §, keine Gliederungsebene): Norm-Bezeichnung und Titel werden korrekt gelesen', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1<br/>Erste Vorschrift</h4><p>Inhaltstext.</p></div>`,
    );
    const g = parseGesetzesXML(ergebnis.xmlString!)!;
    expect(g.elemente).toHaveLength(1);
    const norm = g.elemente[0]!.data as NormDarstellung;
    expect(norm.bezeichnung).toBe('§ 1');
    expect(norm.titel).toBe('Erste Vorschrift');
  });

  it('zweistufige Struktur (h4=Abschnitt, h5=§): Gliederungsebene bekommt gliederungskennzahl "010", Norm liegt darunter', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText">` +
        `<h4 ${H}>Erster Abschnitt Allgemeines</h4>` +
        `<h5 ${H}>§ 1<br/>Erste Vorschrift</h5><p>Text.</p>` +
        `</div>`,
    );
    const g = parseGesetzesXML(ergebnis.xmlString!)!;
    expect(g.elemente).toHaveLength(2);
    const ueberschrift = g.elemente[0]!.data as UeberschriftDarstellung;
    expect(ueberschrift.gliederungskennzahl).toBe('010');
    expect(ueberschrift.ebene).toBe(1);
    expect((g.elemente[1]!.data as NormDarstellung).bezeichnung).toBe('§ 1');
  });

  it('EDGE CASE: dasselbe Heading-Tag ist an einer Stelle Gliederung, an anderer Norm (Rolle wird am Text entschieden, nicht am Tag)', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText">` +
        `<h5 ${H}>6. Abschnitt Sonderregeln</h5>` +
        `<h5 ${H}>§ 10<br/>Sonderregel</h5><p>Text.</p>` +
        `</div>`,
    );
    const g = parseGesetzesXML(ergebnis.xmlString!)!;
    expect(g.elemente).toHaveLength(2);
    expect(g.elemente[0]!.typ).toBe('ueberschrift');
    expect(g.elemente[1]!.typ).toBe('norm');
    expect((g.elemente[1]!.data as NormDarstellung).bezeichnung).toBe('§ 10');
  });

  it('EDGE CASE: eine Nicht-Inhalts-Überschrift ("Nichtamtliches Inhaltsverzeichnis", ohne Inline-Style) wird komplett übersprungen', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText">` +
        `<h4 class="doc">Nichtamtliches Inhaltsverzeichnis</h4>` +
        `<h4 ${H}>§ 1<br/>Erste Vorschrift</h4><p>Text.</p>` +
        `</div>`,
    );
    const g = parseGesetzesXML(ergebnis.xmlString!)!;
    expect(g.elemente).toHaveLength(1);
    expect((g.elemente[0]!.data as NormDarstellung).bezeichnung).toBe('§ 1');
  });

  it('erkennt Anhang/Anlage/Art. ebenfalls als Norm, nicht als Gliederung', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>Anlage 1 Gebührenverzeichnis</h4><p>Text.</p></div>`,
    );
    const g = parseGesetzesXML(ergebnis.xmlString!)!;
    expect(g.elemente[0]!.typ).toBe('norm');
  });

  it('EDGE CASE: <br>-getrennte Heading-Segmente und Fußnoten-Referenzlink werden korrekt zu Bezeichnung/Titel', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1<br/>Inkrafttreten<a class="footnotelink">1</a></h4><p>Text.</p></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.bezeichnung).toBe('§ 1');
    expect(norm.titel).toBe('Inkrafttreten');
  });
});

describe('importiereGesetzHTMLBW – Absatz-Bildung', () => {
  it('ein Absatz mit expliziter Nummer "(1)" wird als eigener, nummerierter Absatz erfasst', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4><p>(1) Erster Satz.</p></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(1);
    expect(norm.absaetze[0]!.bezeichnung).toBe('(1)');
  });

  it('ein Folgeabsatz OHNE eigene Nummer wird an den offenen Absatz angehängt statt einen neuen zu erzeugen', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<p>(1) Erster Satz.</p><p>Zweiter Satz ohne Nummer.</p></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(1);
    expect(norm.absaetze[0]!.saetze.map((s) => s.text)).toEqual([
      'Erster Satz.',
      'Zweiter Satz ohne Nummer.',
    ]);
  });

  it('zwei Absätze mit je eigener Nummer bleiben getrennt', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<p>(1) Erster Absatz.</p><p>(2) Zweiter Absatz.</p></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(2);
    expect(norm.absaetze[0]!.bezeichnung).toBe('(1)');
    expect(norm.absaetze[1]!.bezeichnung).toBe('(2)');
  });

  it('EDGE CASE: "Zur Einzelansicht"-Permalink-Absatz (nur ein a.doclink) wird komplett übersprungen', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<p>(1) Erster Satz.</p><p><a class="doclink">Zur Einzelansicht</a></p></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(1);
  });

  it('<p>/<dl> außerhalb jeder Norm (z.B. Kopfbereich vor der ersten Überschrift) wird ignoriert', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><p>Kopfbereich-Text.</p><h4 ${H}>§ 1 Titel</h4><p>(1) Erster Satz.</p></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(1);
    expect(norm.absaetze[0]!.saetze[0]!.text).toBe('Erster Satz.');
  });

  it('EDGE CASE: eine neue Überschrift setzt den offenen Absatz zurück (kein Anhängen über Normgrenzen hinweg)', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText">` +
        `<h4 ${H}>§ 1 Titel</h4><p>Text ohne Nummer in § 1.</p>` +
        `<h4 ${H}>§ 2 Titel</h4><p>Text ohne Nummer in § 2.</p>` +
        `</div>`,
    );
    const g = parseGesetzesXML(ergebnis.xmlString!)!;
    const norm1 = g.elemente[0]!.data as NormDarstellung;
    const norm2 = g.elemente[1]!.data as NormDarstellung;
    expect(norm1.absaetze).toHaveLength(1);
    expect(norm2.absaetze).toHaveLength(1);
    expect(norm2.absaetze[0]!.saetze[0]!.text).toBe('Text ohne Nummer in § 2.');
  });

  it('Tabellen innerhalb des Normtexts werden komplett übersprungen (bekannte v1-Einschränkung)', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<p>(1) Vor der Tabelle.</p><table><tr><td><p>In der Tabelle.</p></td></tr></table></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(1);
    expect(norm.absaetze[0]!.saetze[0]!.text).toBe('Vor der Tabelle.');
  });
});

describe('importiereGesetzHTMLBW – Listen (<dl>/<dt>/<dd>)', () => {
  it('eine einfache nummerierte Liste wird zu Listeneinträgen', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<p>Einleitung:</p>` +
        `<dl><dt>1.</dt><dd><p>Erster Punkt.</p></dd><dt>2.</dt><dd><p>Zweiter Punkt.</p></dd></dl>` +
        `</div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(1);
    const eintraege = norm.absaetze[0]!.saetze[0]!.eintraege;
    expect(eintraege).toHaveLength(2);
    expect(eintraege[0]!.bezeichnung).toBe('1.');
    expect(eintraege[1]!.bezeichnung).toBe('2.');
  });

  it('eine Liste direkt am Norm-Anfang (ohne vorangehenden Text) erzeugt einen eigenen unnummerierten Absatz', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<dl><dt>a)</dt><dd><p>Erster Punkt.</p></dd></dl></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    expect(norm.absaetze).toHaveLength(1);
    expect(norm.absaetze[0]!.bezeichnung).toBeUndefined();
  });

  it('EDGE CASE: "nachgeschobenes" <dd> ohne eigenes <dt> wird als Fortsetzung des vorherigen Eintrags gelesen (nur wenn die <dl> überhaupt <dt> enthält)', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<dl><dt>2.</dt><dd><p>Einleitungstext.</p></dd>` +
        `<dd><dl><dt>a)</dt><dd><p>Unterpunkt.</p></dd></dl></dd>` +
        `<dt>3.</dt><dd><p>Dritter Punkt.</p></dd></dl></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    const eintraege = norm.absaetze[0]!.saetze[0]!.eintraege;
    expect(eintraege).toHaveLength(2);
    expect(eintraege[0]!.bezeichnung).toBe('2.');
    expect(eintraege[0]!.untereintraege).toHaveLength(1);
    expect(eintraege[0]!.untereintraege[0]!.bezeichnung).toBe('a)');
    expect(eintraege[1]!.bezeichnung).toBe('3.');
  });

  it('EDGE CASE: bei rein unnummerierten Aufzählungen (kein <dt> in der ganzen <dl>) bleibt JEDES <dd> ein eigener Eintrag', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<dl><dd><p>Erster Feiertag.</p></dd><dd><p>Zweiter Feiertag.</p></dd></dl></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    const eintraege = norm.absaetze[0]!.saetze[0]!.eintraege;
    expect(eintraege).toHaveLength(2);
    expect(eintraege[0]!.bezeichnung).toBe('-');
    expect(eintraege[1]!.bezeichnung).toBe('-');
  });

  it('EDGE CASE: Text VOR und NACH einer verschachtelten Unterliste innerhalb eines <dd> wird als texteVor/texteNach getrennt', () => {
    const ergebnis = importieren(
      `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4>` +
        `<dl><dt>1.</dt><dd><p>Vor der Liste.</p>` +
        `<dl><dt>a)</dt><dd><p>Unterpunkt.</p></dd></dl>` +
        `<p>Nach der Liste.</p></dd></dl></div>`,
    );
    const norm = parseGesetzesXML(ergebnis.xmlString!)!.elemente[0]!.data as NormDarstellung;
    const eintrag = norm.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.text).toBe('Vor der Liste.');
    expect(eintrag.untereintraege).toHaveLength(1);
    // texteNach landet als "fortsetzung" des Eintrags selbst (nach der
    // Unterliste, siehe xmlSerialisierung.ts::baueEintrag), nicht als
    // eigener Satz.
    expect(eintrag.fortsetzung).toBe('Nach der Liste.');
  });
});

it('übernimmt Absatz-, Nummer- und Litera-Labels samt Satzzeichen ins GesetzesXML', () => {
  const ergebnis = importieren(
    `<div class="docLayoutText"><h4 ${H}>§ 1 Titel</h4><p>(1) Es gilt:</p><dl><dt>1.</dt><dd><p>Fall:</p><dl><dt>a)</dt><dd><p>Text.</p></dd></dl></dd></dl></div>`,
  );
  expect(ergebnis.xmlString).toContain('<absatz zahl="(1)">');
  expect(ergebnis.xmlString).toContain('<nummer zahl="1.">');
  expect(ergebnis.xmlString).toContain('<litera buchstabe="a)">');
});

it('schreibt den bisherigen Datenquellennamen ohne Adresse', () => {
  const ergebnis = importieren(
    `<div class="docLayoutText"><h4 ${H}>§ 1 Zweck</h4><p>Text.</p></div>`,
  );
  expect(ergebnis.fehler).toBeUndefined();
  if (!ergebnis.xmlString) throw new Error('GesetzesXML fehlt');
  const gesetz = parseGesetzesXML(ergebnis.xmlString);
  expect(gesetz?.datenquelle).toEqual({ name: 'Landesrecht BW', url: undefined });
});

it('weist hundert Gliederungen derselben Ebene beim BW-Import zurück', () => {
  const ueberschriften = Array.from(
    { length: 100 },
    (_, i) => `<h4 ${H}>${i + 1}. Abschnitt</h4>`,
  ).join('');
  expect(() => importieren(`<div class="docLayoutText">${ueberschriften}</div>`)).toThrow(
    'Zu viele Gliederungen auf derselben Ebene.',
  );
});
