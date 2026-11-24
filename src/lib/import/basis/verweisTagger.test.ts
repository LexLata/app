// verweisTagger.test.ts
//
// Unit-Tests für taggeVerweise() (verweisTagger.ts) – reine, synchrone
// String-zu-String-Funktion ohne I/O. Getestet wird ausschließlich die
// öffentliche Funktion taggeVerweise(); die internen Helfer (extrahiereNorm,
// erkenneLaw, ersetzeVerweise, baueGesetzLookup) sind bewusst nicht
// exportiert und werden nur indirekt über ihr Verhalten im Gesamtergebnis
// geprüft. Alle Erwartungswerte wurden vorab per `npx tsx`-Probe gegen den
// echten Code verifiziert (siehe Projekt-Workflow).
//
// Enthält u.a. die Aufteilung von Normketten ("§§ 206, 210, 211" -> mehrere
// <verweis>-Tags), die Qualifizierer "Nr."/"oder" sowie die Idempotenz
// (erneuter Lauf auf bereits getaggtem XML) – siehe die entsprechenden
// describe-Blöcke unten.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { escapeXML } from '@/lib/utils/xmlVerarbeitung';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { taggeVerweise, type GesetzesreferenzMitLangtitel } from './verweisTagger';

describe('taggeVerweise – Grundmuster (§, §§, Artikel)', () => {
  it('schreibt einen Eigenverweis ohne Gesetzesname nur mit norm', () => {
    const xml = taggeVerweise(
      '<text>Siehe § 5 dazu.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Siehe <verweis norm="§ 5">§ 5</verweis> dazu.</text>');
  });

  it('§§ mit "und"-Qualifizierer wird als Normkette in zwei Tags aufgeteilt (siehe eigener Testblock "Normketten")', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5 und 6.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§§ 5 und </verweis><verweis norm="§ 6">6</verweis>.</text>',
    );
  });

  it('§§ mit "bis"-Qualifizierer wird ebenso in zwei Tags aufgeteilt', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5 bis 9.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§§ 5 bis </verweis><verweis norm="§ 9">9</verweis>.</text>',
    );
  });

  it('Artikel allein -> norm="Art. N"', () => {
    const xml = taggeVerweise(
      '<text>Vgl. Artikel 5 EGBGB.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [
        {
          kurztitel: 'EGBGB',
          langtitel: 'Einführungsgesetz zum Bürgerlichen Gesetzbuche',
          normgeber: 'de-bund',
        },
      ],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis gesetz="EGBGB" normgeber="de-bund" norm="Art. 5">Artikel 5</verweis> EGBGB.</text>',
    );
  });

  it('Artikel + § kombiniert -> norm="Art. N § M" (§§ wird auf § normalisiert)', () => {
    const xml = taggeVerweise(
      '<text>Vgl. Artikel 246a § 1 Absatz 2.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="Art. 246a § 1">Artikel 246a § 1 Absatz 2</verweis>.</text>',
    );
  });

  it('flektierte Formen "Artikeln"/"§§" werden erkannt wie "Artikel"/"§"', () => {
    const xml = taggeVerweise(
      '<text>Vgl. Artikeln 5 §§ 1.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="Art. 5 § 1">Artikeln 5 §§ 1</verweis>.</text>');
  });

  it('Buchstabensuffix an der Normzahl ("246a") wird erfasst', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 246a Absatz 1.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 246a">§ 246a Absatz 1</verweis>.</text>');
  });

  it('zwei durch "und" getrennte EIGENSTÄNDIGE §-Verweise (jeweils eigenes §) -> zwei separate Tags', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 und § 6.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§ 5</verweis> und <verweis norm="§ 6">§ 6</verweis>.</text>',
    );
  });

  it('§ ohne nachfolgende Zahl erzeugt keinen Treffer', () => {
    const xml = taggeVerweise(
      '<text>Der Paragraph § regelt nichts Konkretes.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Der Paragraph § regelt nichts Konkretes.</text>');
  });
});

describe('taggeVerweise – Qualifizierer (Absatz/Abs./Satz/Nummer)', () => {
  it('Kette Absatz + Satz + Nummer wird komplett in den Match aufgenommen', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Absatz 2 Satz 1 Nummer 3.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§ 5 Absatz 2 Satz 1 Nummer 3</verweis>.</text>',
    );
  });

  it('Abkürzung "Abs." wird wie "Absatz" behandelt', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Abs. 2.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§ 5 Abs. 2</verweis>.</text>');
  });

  it('Komma NACH einem Absatz-Qualifizierer wird als weiterer Absatz gelesen, nicht als neue Norm (norm bleibt "§ 5")', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Abs. 3, 4.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§ 5 Abs. 3, 4</verweis>.</text>');
  });
});

describe('taggeVerweise – Normketten werden in einzelne Verweise aufgeteilt', () => {
  // Der Originaltext bleibt dabei IMMER unverändert – jedes Kettenglied
  // bekommt nur einen eigenen <verweis>-Tag um seinen jeweiligen
  // Teil-String; das Trennzeichen (", " / " und " / " bis ") gehört zum
  // TEXT des vorangehenden Glieds. Aneinanderreihung aller Glied-Texte ergibt
  // wieder exakt den ursprünglichen Normketten-String.
  it('Normkette mit drei durch Komma getrennten Paragraphen ("§§ 206, 210, 211")', () => {
    const xml = taggeVerweise(
      '<text>Vorschriften der §§ 206, 210, 211 entsprechende Anwendung</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vorschriften der ' +
        '<verweis norm="§ 206">§§ 206, </verweis>' +
        '<verweis norm="§ 210">210, </verweis>' +
        '<verweis norm="§ 211">211</verweis>' +
        ' entsprechende Anwendung</text>',
    );
  });

  it('Normkette mit einzelnem "§" (nicht "§§") vor der Kommaliste wird ebenso aufgeteilt ("§ 206, 210, 211")', () => {
    const xml = taggeVerweise(
      '<text>Vorschriften der § 206, 210, 211 entsprechende Anwendung</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vorschriften der ' +
        '<verweis norm="§ 206">§ 206, </verweis>' +
        '<verweis norm="§ 210">210, </verweis>' +
        '<verweis norm="§ 211">211</verweis>' +
        ' entsprechende Anwendung</text>',
    );
  });

  it('Normkette mit zwei durch Komma getrennten Paragraphen ("§§ 260, 261")', () => {
    const xml = taggeVerweise(
      '<text>Die §§ 260, 261 sind entsprechend anzuwenden.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Die ' +
        '<verweis norm="§ 260">§§ 260, </verweis>' +
        '<verweis norm="§ 261">261</verweis>' +
        ' sind entsprechend anzuwenden.</text>',
    );
  });

  it('Normkette mit "und" statt Komma ("§§ 5 und 6")', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5 und 6.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§§ 5 und </verweis><verweis norm="§ 6">6</verweis>.</text>',
    );
  });

  it('Normkette mit "bis" statt Komma ("§§ 5 bis 9")', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5 bis 9.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§§ 5 bis </verweis><verweis norm="§ 9">9</verweis>.</text>',
    );
  });

  it('Artikel-Kette ("Artikel 1, 2, 3") wird ebenso aufgeteilt (norm="Art. N")', () => {
    const xml = taggeVerweise(
      '<text>Vgl. Artikel 1, 2, 3.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. ' +
        '<verweis norm="Art. 1">Artikel 1, </verweis>' +
        '<verweis norm="Art. 2">2, </verweis>' +
        '<verweis norm="Art. 3">3</verweis>' +
        '.</text>',
    );
  });

  it('ein Gesetzesname NACH der gesamten Kette wird auf JEDES Kettenglied als gesetz-Attribut angewandt', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5, 6 BGB.</text>',
      { kurztitel: 'StGB', normgeber: 'de-bund' },
      [{ kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', normgeber: 'de-bund' }],
    );
    expect(xml).toBe(
      '<text>Vgl. ' +
        '<verweis gesetz="BGB" normgeber="de-bund" norm="§ 5">§§ 5, </verweis>' +
        '<verweis gesetz="BGB" normgeber="de-bund" norm="§ 6">6</verweis>' +
        ' BGB.</text>',
    );
  });

  it('Kette im gleichen Gesetz wie aktuellesGesetz -> nur norm auf den Kettengliedern', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5, 6 BGB.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [{ kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', normgeber: 'de-bund' }],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§§ 5, </verweis><verweis norm="§ 6">6</verweis> BGB.</text>',
    );
  });

  it('Roundtrip-Invariante: Originaltext bleibt beim Entfernen aller <verweis>-Tags exakt erhalten', () => {
    const original = '<text>Vorschriften der §§ 206, 210, 211 entsprechende Anwendung</text>';
    const getaggt = taggeVerweise(original, { kurztitel: 'BGB', normgeber: 'de-bund' }, []);
    expect(getaggt.replace(/<\/?verweis[^>]*>/g, '')).toBe(original);
  });
});

describe('taggeVerweise – Abgrenzung: keine Kettenaufteilung bei Einzelnorm / Lücke in der Kette', () => {
  it('einzelne Norm ohne Kette bleibt unverändert (kein Kettenpfad)', () => {
    const xml = taggeVerweise(
      '<text>Siehe § 5 dazu.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Siehe <verweis norm="§ 5">§ 5</verweis> dazu.</text>');
  });

  it('Komma-Fortsetzung NACH einem Absatz-Qualifizierer bleibt EIN Tag (Komma folgt nicht direkt auf die Zahl -> Lücke, keine Kette, siehe "§ 5 Abs. 3, 4")', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Abs. 3, 4.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§ 5 Abs. 3, 4</verweis>.</text>');
  });

  it('Artikel + § kombiniert bleibt EIN Tag (kein Kettenpfad, andere Grammatik)', () => {
    const xml = taggeVerweise(
      '<text>Vgl. Artikel 246a § 1 Absatz 2.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="Art. 246a § 1">Artikel 246a § 1 Absatz 2</verweis>.</text>',
    );
  });

  it('einzelne Norm mit Absatz-Qualifizierer (§§ ohne Kette) bleibt unverändert', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Absatz 2.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§ 5 Absatz 2</verweis>.</text>');
  });

  it('Qualifizierer MITTEN in der Kette (nicht erst am Ende) wird NICHT interpretiert -> keine Aufteilung', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5 Absatz 2, 6.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§§ 5 Absatz 2, 6</verweis>.</text>');
  });
});

describe('taggeVerweise – Normkette mit nachgestelltem Qualifizierer (nur letztes Glied betroffen)', () => {
  // Absprache: bei "§§ 5, 6 Absatz 2" ist unklar, ob "Absatz 2" für beide
  // Normen oder nur für die letzte gilt – hier festgelegt: NUR für die
  // zuletzt genannte Norm, § 5 wird komplett (ohne Zusatz) zitiert.
  it('"§§ 5, 6 Absatz 2" -> "§ 5" (vollständig) und "§ 6 Absatz 2" (mit Qualifizierer)', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5, 6 Absatz 2.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§§ 5, </verweis><verweis norm="§ 6">6 Absatz 2</verweis>.</text>',
    );
  });

  it('drei Kettenglieder + Nummer-Qualifizierer am Ende -> nur beim letzten Glied', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5, 6, 7 Nummer 3.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. ' +
        '<verweis norm="§ 5">§§ 5, </verweis>' +
        '<verweis norm="§ 6">6, </verweis>' +
        '<verweis norm="§ 7">7 Nummer 3</verweis>' +
        '.</text>',
    );
  });

  it('Artikel-Kette + Absatz-Qualifizierer am Ende', () => {
    const xml = taggeVerweise(
      '<text>Vgl. Artikel 1, 2 Absatz 3.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="Art. 1">Artikel 1, </verweis><verweis norm="Art. 2">2 Absatz 3</verweis>.</text>',
    );
  });

  it('Roundtrip-Invariante gilt auch mit nachgestelltem Qualifizierer', () => {
    const original = '<text>Vgl. §§ 5, 6 Absatz 2.</text>';
    const getaggt = taggeVerweise(original, { kurztitel: 'BGB', normgeber: 'de-bund' }, []);
    expect(getaggt.replace(/<\/?verweis[^>]*>/g, '')).toBe(original);
  });
});

describe('taggeVerweise – "oder" als Kettenkonnektor (analog zu "und"/"bis")', () => {
  it('"§§ 5 oder 6" wird ebenso in zwei Kettenglieder aufgeteilt', () => {
    const xml = taggeVerweise(
      '<text>Vgl. §§ 5 oder 6.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§§ 5 oder </verweis><verweis norm="§ 6">6</verweis>.</text>',
    );
  });
});

describe('taggeVerweise – Problem 2: Abkürzung "Nr." und Konnektor "oder"', () => {
  it('"Nr." (Abkürzung von "Nummer") und "oder" werden jetzt vollständig in den Match/Tag aufgenommen', () => {
    const xml = taggeVerweise(
      '<text>gemäß § 346 Abs. 3 Nr. 1 oder 2 ausgeschlossen</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>gemäß <verweis norm="§ 346">§ 346 Abs. 3 Nr. 1 oder 2</verweis> ausgeschlossen</text>',
    );
  });

  it('"oder" als Konnektor auch ohne vorherigen Nr.-Qualifizierer (analog zu "und"/"bis")', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Absatz 2 oder 3.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§ 5 Absatz 2 oder 3</verweis>.</text>');
  });
});

describe('taggeVerweise – Gesetzeserkennung: Direkttreffer auf Kurztitel', () => {
  const bgb: GesetzesreferenzMitLangtitel = {
    kurztitel: 'BGB',
    langtitel: 'Bürgerliches Gesetzbuch',
    normgeber: 'de-bund',
  };

  it('Kurztitel direkt nach der Norm (mit abschließendem Punkt) wird erkannt', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 BGB.</text>',
      { kurztitel: 'StGB', normgeber: 'de-bund' },
      [bgb],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis gesetz="BGB" normgeber="de-bund" norm="§ 5">§ 5</verweis> BGB.</text>',
    );
  });

  it('Erkennung ist case-insensitiv', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 bgb.</text>',
      { kurztitel: 'StGB', normgeber: 'de-bund' },
      [bgb],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis gesetz="BGB" normgeber="de-bund" norm="§ 5">§ 5</verweis> bgb.</text>',
    );
  });

  it('Verweis auf das GLEICHE Gesetz wie aktuellesGesetz trägt nur norm', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 BGB.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [bgb],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§ 5</verweis> BGB.</text>');
  });
});

describe('taggeVerweise – Gesetzeserkennung: Langtitel-Präfixvergleich', () => {
  it('exakter Präfix-Treffer wählt unter mehreren Kandidaten mit gleichem ersten Wort das passende Gesetz aus', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 des Gesetzes über Abwasserabgaben.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [
        { kurztitel: 'AbwAG', langtitel: 'Gesetz über Abwasserabgaben', normgeber: 'de-bund' },
        {
          kurztitel: 'AtG',
          langtitel: 'Gesetz über die friedliche Verwendung der Kernenergie',
          normgeber: 'de-bund',
        },
      ],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis gesetz="AbwAG" normgeber="de-bund" norm="§ 5">§ 5</verweis> des Gesetzes über Abwasserabgaben.</text>',
    );
  });

  it('mehrdeutig: zwei Kandidaten mit gleichem ersten Wort, keiner passt exakt als Präfix -> kein Treffer (auch kein Fallback, da >1 Kandidat)', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Gesetz über irgendwas.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [
        { kurztitel: 'AbwAG', langtitel: 'Gesetz über Abwasserabgaben', normgeber: 'de-bund' },
        {
          kurztitel: 'AtG',
          langtitel: 'Gesetz über die friedliche Verwendung der Kernenergie',
          normgeber: 'de-bund',
        },
      ],
    );
    expect(xml).toBe('<text>Vgl. <verweis norm="§ 5">§ 5</verweis> Gesetz über irgendwas.</text>');
  });
});

describe('taggeVerweise – Gesetzeserkennung: Ein-Kandidat-Fallback', () => {
  it('genau ein Kandidat mit passendem ersten Wort, nicht-generisch -> wird auch ohne vollständigen Präfix-Treffer erkannt', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 Grundgesetzes für Sonderfälle.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [
        {
          kurztitel: 'GG',
          langtitel: 'Grundgesetz für die Bundesrepublik Deutschland',
          normgeber: 'de-bund',
        },
      ],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis gesetz="GG" normgeber="de-bund" norm="§ 5">§ 5</verweis> Grundgesetzes für Sonderfälle.</text>',
    );
  });

  it('genau ein Kandidat, aber generisches erstes Wort ("Verordnung") UND kein exakter Präfix-Treffer -> kein Treffer', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 5 der Verordnung über besondere Sonderfälle.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [{ kurztitel: 'SonderVO', langtitel: 'Verordnung über Sonderfälle', normgeber: 'de-bund' }],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis norm="§ 5">§ 5</verweis> der Verordnung über besondere Sonderfälle.</text>',
    );
  });
});

describe('taggeVerweise – Gesetzeserkennung: 8-Wort-Grenze', () => {
  // Der Gesetzname muss immer UNMITTELBAR nach der Norm beginnen (erstes
  // Wort des Anschlusstexts) – die 8-Wort-Grenze bestimmt nicht, wie weit
  // entfernt ein Gesetzname noch gefunden wird, sondern wie viele Wörter
  // beim Abgleich gegen einen (langen) Langtitel höchstens herangezogen
  // werden. Dieser Test zeigt die daraus resultierende Konsequenz: Bei einem
  // 9 Wörter langen Langtitel wird nur mit den ersten 8 Text-Wörtern
  // verglichen – ein vom Titel abweichendes 9. Wort im Text wird dadurch gar
  // nicht mehr geprüft, der Treffer erfolgt trotzdem.
  it('9-Wort-Langtitel: nur die ersten 8 Text-Wörter werden verglichen, ein abweichendes 9. Wort bleibt ungeprüft', () => {
    const xml = taggeVerweise(
      '<text>Vgl. § 1 des Eins Zwei Drei Vier Fuenf Sechs Sieben Acht Zehn.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [
        {
          kurztitel: 'XYZ',
          langtitel: 'Eins Zwei Drei Vier Fuenf Sechs Sieben Acht Neun',
          normgeber: 'de-bund',
        },
      ],
    );
    expect(xml).toBe(
      '<text>Vgl. <verweis gesetz="XYZ" normgeber="de-bund" norm="§ 1">§ 1</verweis> des Eins Zwei Drei Vier Fuenf Sechs Sieben Acht Zehn.</text>',
    );
  });
});

describe('taggeVerweise – XML-Traversal: nur innerhalb von <text>', () => {
  it('Text außerhalb von <text> bleibt unverändert, auch bei norm-ähnlichem Inhalt', () => {
    const xml = taggeVerweise(
      '<gesetz><titel>§ 5 sollte nicht getaggt werden</titel><text>§ 5 hier schon</text></gesetz>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<gesetz><titel>§ 5 sollte nicht getaggt werden</titel><text><verweis norm="§ 5">§ 5</verweis> hier schon</text></gesetz>',
    );
  });

  it('kein <text>-Tag im Dokument -> gesamtes Dokument bleibt unverändert', () => {
    const xml = taggeVerweise(
      '<gesetz><titel>§ 5</titel></gesetz>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<gesetz><titel>§ 5</titel></gesetz>');
  });

  it('Tag-Name <TEXT> in Großschreibung wird ebenfalls als inhalt-Bereich erkannt', () => {
    const xml = taggeVerweise(
      '<TEXT>§ 5 hier</TEXT>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<TEXT><verweis norm="§ 5">§ 5</verweis> hier</TEXT>');
  });

  it('verschachtelte <text>-Elemente: Tiefenzählung bleibt über beide Ebenen hinweg aktiv', () => {
    const xml = taggeVerweise(
      '<text>außen § 1 <text>innen § 2</text> außen weiter</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text>außen <verweis norm="§ 1">§ 1</verweis> <text>innen <verweis norm="§ 2">§ 2</verweis></text> außen weiter</text>',
    );
  });

  it('selbstschließendes <text/> erhöht die Tiefe NICHT -> nachfolgender Text bleibt unangetastet', () => {
    const xml = taggeVerweise(
      '<text/><p>§ 5 draußen</p>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text/><p>§ 5 draußen</p>');
  });

  it('nur Whitespace im Textknoten wird nicht verarbeitet (kein Absturz, keine Änderung)', () => {
    const xml = taggeVerweise('<text>   </text>', { kurztitel: 'BGB', normgeber: 'de-bund' }, []);
    expect(xml).toBe('<text>   </text>');
  });
});

describe('taggeVerweise – XML-Traversal: Kommentare, PIs, Attribute', () => {
  it('XML-Kommentare werden unverändert übernommen, ihr Inhalt wird NICHT durchsucht', () => {
    const xml = taggeVerweise(
      '<text><!-- § 5 im Kommentar --> § 6 im Text</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe(
      '<text><!-- § 5 im Kommentar --> <verweis norm="§ 6">§ 6</verweis> im Text</text>',
    );
  });

  it('Processing Instructions vor dem Root-Element werden unverändert übernommen', () => {
    const xml = taggeVerweise(
      '<?xml-stylesheet href="x"?><text>§ 5</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<?xml-stylesheet href="x"?><text><verweis norm="§ 5">§ 5</verweis></text>');
  });

  it('Attributwerte (auch mit §-Zeichen) werden nicht durchsucht, da sie keine Textknoten sind', () => {
    const xml = taggeVerweise(
      '<text><fussnote text="siehe § 5">Text ohne Verweis</fussnote></text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text><fussnote text="siehe § 5">Text ohne Verweis</fussnote></text>');
  });
});

describe('taggeVerweise – Robustheit', () => {
  it('leerer String liefert leeren String', () => {
    expect(taggeVerweise('', { kurztitel: 'BGB', normgeber: 'de-bund' }, [])).toBe('');
  });

  it('unabgeschlossenes Tag am Ende des Dokuments wird unverändert angehängt statt zu werfen', () => {
    const xml = taggeVerweise(
      '<text>Text</text><verweis norm',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Text</text><verweis norm');
  });
});

describe('taggeVerweise – Idempotenz (unterstützter Aufrufpfad)', () => {
  it('erneuter Lauf auf bereits getaggtem XML liefert exakt dasselbe Ergebnis wie der erste Lauf', () => {
    const original = '<text>Siehe § 2 dazu.</text>';
    const einmal = taggeVerweise(original, { kurztitel: 'BGB', normgeber: 'de-bund' }, []);
    const zweimal = taggeVerweise(einmal, { kurztitel: 'BGB', normgeber: 'de-bund' }, []);
    expect(zweimal).toBe(einmal);
    expect(zweimal).toBe('<text>Siehe <verweis norm="§ 2">§ 2</verweis> dazu.</text>');
  });

  it('erneuter Lauf auf bereits getaggter Normkette bleibt stabil (Idempotenz gilt auch für Kettenaufteilung)', () => {
    const original = '<text>Vorschriften der §§ 206, 210, 211 entsprechende Anwendung</text>';
    const einmal = taggeVerweise(original, { kurztitel: 'BGB', normgeber: 'de-bund' }, []);
    const zweimal = taggeVerweise(einmal, { kurztitel: 'BGB', normgeber: 'de-bund' }, []);
    expect(zweimal).toBe(einmal);
  });

  it('bereits pathologisch verschachtelte <verweis>-Tags (z.B. aus einem früheren Doppel-Tagging-Lauf) werden beim nächsten Aufruf vollständig aufgelöst', () => {
    const xml = taggeVerweise(
      '<text>Siehe <verweis gesetz="BGB" normgeber="de-bund" norm="§ 2"><verweis gesetz="BGB" normgeber="de-bund" norm="§ 2">§ 2</verweis></verweis>.</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text>Siehe <verweis norm="§ 2">§ 2</verweis>.</text>');
  });

  it('vereinfachte Grenze (bewusst in Kauf genommen, siehe Kommentar bei entferneBestehendeVerweise): das Entfernen bestehender <verweis>-Tags ist NICHT Kommentar-bewusst, anders als das normale Neu-Tagging – ein literales <verweis> IN einem Kommentar verliert daher beim Bereinigen seine Tags (Text bleibt)', () => {
    const xml = taggeVerweise(
      '<text><!-- <verweis gesetz="BGB" normgeber="de-bund" norm="§ 9">Alt</verweis> --> § 6</text>',
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      [],
    );
    expect(xml).toBe('<text><!-- Alt --> <verweis norm="§ 6">§ 6</verweis></text>');
  });
});

it('maskiert das Zielgesetz und erhält bereits maskierten Nutztext', () => {
  const gesetz = `&<>"' &amp; &lt;`;
  const eingabe = '<text>&amp; &lt; &gt; &quot; &apos; &amp;amp; § 5 Sondergesetz</text>';
  const xml = taggeVerweise(eingabe, { kurztitel: 'BGB', normgeber: 'de-bund' }, [
    { kurztitel: gesetz, langtitel: 'Sondergesetz', normgeber: 'de-bund' },
  ]);
  expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
  expect(xml).toContain(`gesetz="${escapeXML(gesetz)}"`);
  expect(xml).toContain('&amp; &lt; &gt; &quot; &apos; &amp;amp;');
  expect(
    taggeVerweise(xml, { kurztitel: 'BGB', normgeber: 'de-bund' }, [
      { kurztitel: gesetz, langtitel: 'Sondergesetz', normgeber: 'de-bund' },
    ]),
  ).toBe(xml);
});

it.each(['de-sn', 'unbekannt'])(
  'taggt für %s ausschließlich Eigenverweise ohne Gesetzesattribute',
  (normgeber) => {
    const xml = taggeVerweise('<text>§ 5 BGB und § 6.</text>', { kurztitel: 'X', normgeber }, [
      { kurztitel: 'BGB', normgeber: 'de-bund', langtitel: 'Bürgerliches Gesetzbuch' },
    ]);
    expect(xml).toBe(
      `<text><verweis norm="§ 5">§ 5</verweis> BGB und <verweis norm="§ 6">§ 6</verweis>.</text>`,
    );
  },
);

it('erhält den Normgeber des ersten gleichnamigen Verzeichnistreffers für Lang- und Kurztitel', () => {
  const xml = taggeVerweise(
    '<text>§ 1 X. § 2 Landesgesetz.</text>',
    { kurztitel: 'Eigen', normgeber: 'de-bw' },
    [
      { kurztitel: 'X', langtitel: 'Landesgesetz', normgeber: 'de-bw' },
      { kurztitel: 'X', langtitel: 'Bundesgesetz', normgeber: 'de-bund' },
    ],
  );
  expect(xml).toBe(
    '<text><verweis gesetz="X" normgeber="de-bw" norm="§ 1">§ 1</verweis> X. <verweis gesetz="X" normgeber="de-bw" norm="§ 2">§ 2</verweis> Landesgesetz.</text>',
  );
});

it('erkennt eine EU-Norm ausschließlich am Langtitel mit vollständigem Zielnorm', () => {
  expect(
    taggeVerweise(
      '<text>Siehe Artikel 5 des Vertrags über die Arbeitsweise der Europäischen Union.</text>',
      { kurztitel: 'EUV', normgeber: 'eu' },
      [
        {
          kurztitel: 'AEUV',
          langtitel: 'Vertrag über die Arbeitsweise der Europäischen Union',
          normgeber: 'eu',
        },
      ],
    ),
  ).toBe(
    '<text>Siehe <verweis gesetz="AEUV" normgeber="eu" norm="Art. 5">Artikel 5</verweis> des Vertrags über die Arbeitsweise der Europäischen Union.</text>',
  );
});

describe('Canon-Profil', () => {
  const referenz = gesetzesreferenz({ kurztitel: 'CIC' });
  const profil = { normpraefix: 'canon' as const };
  function taggen(text: string) {
    return taggeVerweise(`<text>${text}</text>`, referenz, [], profil);
  }
  it.each([
    ['can. 9 § 2', '9'],
    ['Canons 2265, § 2, 2275, n. 3, and 2283', '2265'],
    ['Can.9, §§ 2, 3, nn. 4', '9'],
  ])('taggt den ganzen qualifizierten Ausdruck %s', (text, zahl) => {
    expect(taggen(text)).toBe(`<text><verweis norm="Can. ${zahl}">${text}</verweis></text>`);
  });
  it.each(['can.', 'canon', 'c.', 'Kan.', 'Kanon', 'cann.', 'canons', 'canones', 'cc.', 'Kanones'])(
    'erkennt %s unabhängig von Großschreibung',
    (alias) => {
      expect(taggen(`${alias.toUpperCase()} 12`)).toContain('norm="Can. 12"');
    },
  );
  it.each(['und', 'bis', 'oder', 'and', 'or', 'to', 'et'])(
    'teilt reine Ketten mit %s und erhält Text und Idempotenz',
    (wort) => {
      const text = `cann. 5, 6, ${wort} 7`;
      const xml = taggen(text);
      expect([...xml.matchAll(/norm="([^"]+)"/g)].map((m) => m[1])).toEqual([
        'Can. 5',
        'Can. 6',
        'Can. 7',
      ]);
      expect(xml.replace(/<\/?verweis\b[^>]*>/g, '')).toBe(`<text>${text}</text>`);
      expect(taggeVerweise(xml, referenz, [], profil)).toBe(xml);
    },
  );
  it.each([
    'siehe § 2',
    'siehe §§ 2 und 3',
    'can 12',
    'abc. 12',
    'c. ohne Zahl',
    'lit. c.',
    'lit. n',
  ])('lässt %s unverändert', (text) => {
    expect(taggen(text)).toBe(`<text>${text}</text>`);
  });
  it('erhält lit. n und begrenzt n.-Qualifizierer', () => {
    expect(taggen('Can. 9 lit. n. 3')).toBe(
      '<text><verweis norm="Can. 9">Can. 9</verweis> lit. n. 3</text>',
    );
  });
  it.each([undefined, 'paragraph' as const, 'artikel' as const])(
    'erhält bisherige Muster ohne Canon-Profil %s',
    (normpraefix) => {
      expect(taggeVerweise('<text>can. 12; can. 9 § 2</text>', referenz, [], { normpraefix })).toBe(
        '<text>can. 12; can. 9 <verweis norm="§ 2">§ 2</verweis></text>',
      );
    },
  );
  it('erhält bekannte externe Paragraphen nur innerhalb des bisherigen Referenzwegs', () => {
    const gesetze = [
      { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', normgeber: 'de-bund' },
    ];
    const eingabe = '<text>§ 2 BGB; § 3 Unbekannt</text>';
    expect(
      taggeVerweise(eingabe, { kurztitel: 'CIC', normgeber: 'de-bund' }, gesetze, profil),
    ).toBe(
      '<text><verweis gesetz="BGB" normgeber="de-bund" norm="§ 2">§ 2</verweis> BGB; § 3 Unbekannt</text>',
    );
    expect(
      taggeVerweise(eingabe, { kurztitel: 'CIC', normgeber: 'unbekannt' }, gesetze, profil),
    ).toBe(eingabe);
  });
});

it('erhält Canon-Zahlenketten für beliebigen Leerraum und bleibt idempotent', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 9999 }), { minLength: 2, maxLength: 8 }),
      fc.constantFrom(' ', '\t', '\u00a0', '\n'),
      fc.constantFrom(',', ' und ', ', and ', ' et ', ' to '),
      (zahlen, leerraum, trenner) => {
        const original = `<text>cann.${leerraum}${zahlen.join(trenner)}</text>`;
        const referenz = gesetzesreferenz({ kurztitel: 'CIC' });
        const profil = { normpraefix: 'canon' as const };
        const xml = taggeVerweise(original, referenz, [], profil);
        expect([...xml.matchAll(/norm="([^"]+)"/g)].map((m) => m[1])).toEqual(
          zahlen.map((zahl) => `Can. ${zahl}`),
        );
        expect(xml.replace(/<\/?verweis\b[^>]*>/g, '')).toBe(original);
        expect(taggeVerweise(xml, referenz, [], profil)).toBe(xml);
      },
    ),
  );
});

it('lässt eine leere Normkette ohne Zahl unverändert', () => {
  expect(taggeVerweise('<text>§§ </text>', { kurztitel: 'BGB', normgeber: 'de-bund' }, [])).toBe(
    '<text>§§ </text>',
  );
});
