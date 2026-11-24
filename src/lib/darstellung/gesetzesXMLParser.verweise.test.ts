// gesetzesXMLParser.verweise.test.ts
//
// Tests für parseGesetzesXML() (gesetzesXMLParser.ts) – Fokus: getaggte
// Verweise (<verweis>-Tags, verarbeiteInlineKinder/uebernehmeVerweise).
// Bisher nur die wiederholung-Zuordnung bei Duplikat-Bezeichnungen über den
// migrierten Test abgedeckt – hier zusätzlich die Zeichen-Bereich-Korrektur
// gegen den GETRIMMTEN Text (kritisch für TextBlatt/Gesetzestextansicht, siehe
// Kopfkommentar von uebernehmeVerweise in der Quelldatei: divergiert diese
// Korrektur vom Renderer, brechen Markierungs-Ankerpunkte). Teil der
// Aufteilung in vier fokussierte Dateien, siehe .gesetzInfos.test.ts für den
// Gesamtüberblick.

import { describe, it, expect } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';

function normXml(inner: string): string {
  return `<?xml version="1.0"?><gesetz id="g1"><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung>${inner}</norm></inhalt></gesetz>`;
}

function parseNorm(inner: string): NormDarstellung {
  const g = parseGesetzesXML(normXml(inner));
  return g!.elemente[0]!.data as NormDarstellung;
}

describe('parseGesetzesXML – Inline-Dispatch: zeilenumbruch, verweis, unbekannte Tags', () => {
  it('<zeilenumbruch/> fügt "\\n" ein, sowohl im text- als auch im fortsetzung-Teil; Verweise davor und danach werden korrekt dem jeweiligen Teil zugeordnet', () => {
    const n = parseNorm(
      '<text><nummer zahl="1.">Vor <verweis norm="§1">V1</verweis> und<zeilenumbruch/>Text<litera buchstabe="a)">X</litera>Nach<zeilenumbruch/>Verweis: <verweis norm="§9">V2</verweis> Ende.</nummer></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.text).toBe('Vor V1 und\nText');
    expect(eintrag.fortsetzung).toBe('Nach\nVerweis: V2 Ende.');
    expect(n.getaggteVerweise).toHaveLength(2);
    expect(n.getaggteVerweise![0]!).toMatchObject({
      bezugstext: 'V1',
      textstelle: { zeichenbereichStart: 4, zeichenbereichEnde: 6 },
    });
    // "V2" liegt in fortsetzung; versatz = getrimmte Länge von text (15,
    // "Vor V1 und\nText") + lokale Position in fortsetzung (14) = 29.
    expect(n.getaggteVerweise![1]!).toMatchObject({
      bezugstext: 'V2',
      textstelle: { zeichenbereichStart: 29, zeichenbereichEnde: 31 },
    });
  });

  it('ein unbekanntes Inline-Tag (z.B. <fett>) wird als reiner Text übernommen – KEIN Verweis, kein Absturz', () => {
    const n = parseNorm('<text>Vor <fett>Fett</fett> nach.</text>');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('Vor Fett nach.');
    expect(n.getaggteVerweise).toBeUndefined();
  });
});

describe('parseGesetzesXML – getaggte Verweise: Grundfall', () => {
  it('ein Verweis mittendrin (kein Trimming nötig): Zeichen-Bereich entspricht direkt der Position im Text', () => {
    const n = parseNorm('<text>Siehe <verweis norm="§ 2">§ 2</verweis> dazu.</text>');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('Siehe § 2 dazu.');
    expect(n.getaggteVerweise).toEqual([
      {
        bezugstext: '§ 2',
        zielBezeichnung: '§ 2',
        textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 6, zeichenbereichEnde: 9 },
      },
    ]);
  });

  it('zwei Verweise im selben Satz werden beide erfasst, mit korrekten, unabhängigen Zeichen-Bereichen', () => {
    const n = parseNorm(
      '<text>Siehe <verweis norm="§ 2">§ 2</verweis> und <verweis norm="§ 3">§ 3</verweis>.</text>',
    );
    expect(n.getaggteVerweise).toEqual([
      {
        bezugstext: '§ 2',
        zielBezeichnung: '§ 2',
        textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 6, zeichenbereichEnde: 9 },
      },
      {
        bezugstext: '§ 3',
        zielBezeichnung: '§ 3',
        textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 14, zeichenbereichEnde: 17 },
      },
    ]);
  });

  it('zielgesetz wird aus dem gesetz-Attribut übernommen, wenn vorhanden', () => {
    const n = parseNorm(
      '<text>Siehe <verweis norm="§ 2" gesetz="StGB" normgeber="de-bund">§ 2 StGB</verweis>.</text>',
    );
    expect(n.getaggteVerweise![0]!).toMatchObject({
      zielBezeichnung: '§ 2',
      zielgesetz: { kurztitel: 'StGB', normgeber: 'de-bund' },
    });
  });

  it('ohne gesetz-Attribut bleibt zielgesetz undefined', () => {
    const n = parseNorm('<text>Siehe <verweis norm="§ 2">§ 2</verweis>.</text>');
    expect(n.getaggteVerweise![0]!.zielgesetz).toBeUndefined();
  });

  it('EDGE CASE: fehlt das norm-Attribut, wird der Bezugstext selbst als zielBezeichnung verwendet (Fallback)', () => {
    const n = parseNorm('<text>Siehe <verweis>§ 2</verweis>.</text>');
    expect(n.getaggteVerweise![0]!).toMatchObject({ bezugstext: '§ 2', zielBezeichnung: '§ 2' });
  });

  it('kein <verweis>-Tag im Text: getaggteVerweise bleibt undefined (nicht leeres Array)', () => {
    const n = parseNorm('<text>Kein Verweis hier.</text>');
    expect(n.getaggteVerweise).toBeUndefined();
  });
});

describe('parseGesetzesXML – getaggte Verweise: Trim-Korrektur (Zeichen-Bereich gegen GETRIMMTEN Text)', () => {
  it('EDGE CASE: führender Whitespace vor dem Verweis wird weggetrimmt – der Zeichen-Bereich verschiebt sich entsprechend nach vorne', () => {
    const n = parseNorm('<text>  <verweis norm="§ 2">§ 2</verweis> gilt entsprechend.</text>');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('§ 2 gilt entsprechend.');
    expect(n.getaggteVerweise![0]!).toMatchObject({
      textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 3 },
    });
  });

  it('EDGE CASE: nachgestellter Whitespace nach dem Verweis wird weggetrimmt, der Verweis selbst bleibt am (nun) Textende unverschoben', () => {
    const n = parseNorm('<text>Vgl. <verweis norm="§ 2">§ 2</verweis>  </text>');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('Vgl. § 2');
    expect(n.getaggteVerweise![0]!).toMatchObject({
      textstelle: { zeichenbereichStart: 5, zeichenbereichEnde: 8 },
    });
  });

  it('EDGE CASE: der Verweis selbst steht ganz am Anfang UND es folgt trailing Whitespace am Textende – beide Korrekturen gleichzeitig', () => {
    const n = parseNorm('<text> <verweis norm="§ 2">§ 2</verweis>  </text>');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('§ 2');
    expect(n.getaggteVerweise![0]!).toMatchObject({
      textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 3 },
    });
  });
});

describe('parseGesetzesXML – getaggte Verweise: Kontext-Pfad (absatz/satz/eintraege)', () => {
  it('der Verweis-Pfad trägt den umgebenden absatz/satz-Kontext', () => {
    const n = parseNorm(
      '<text><absatz zahl="(2)"><satz zahl="3">Siehe <verweis norm="§ 9">§ 9</verweis>.</satz></absatz></text>',
    );
    expect(n.getaggteVerweise![0]!).toMatchObject({
      textstelle: { pfad: { absatz: '(2)', satz: 3 } },
    });
  });

  it('ein Verweis innerhalb eines ListenEintrags trägt die passende eintraege-Kette', () => {
    const n = parseNorm(
      '<text><nummer zahl="1.">Siehe <verweis norm="§ 9">§ 9</verweis> hier.</nummer></text>',
    );
    expect(n.getaggteVerweise![0]!.textstelle.pfad.eintraege).toEqual([
      { ebene: 'nummer', bezeichnung: '1.' },
    ]);
  });

  it('EDGE CASE: ein Verweis in der FORTSETZUNG (nach einer Unterliste) wird korrekt gegen ein DURCHGEHENDES text+fortsetzung-Koordinatensystem positioniert (siehe versatz in satzEintragBausteine.tsx) – NICHT lokal gegen fortsetzung allein', () => {
    const n = parseNorm(
      '<text><nummer zahl="1.">Text vor<litera buchstabe="a)">X</litera>Siehe <verweis norm="§ 9">§ 9</verweis> hier.</nummer></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.text).toBe('Text vor');
    expect(eintrag.fortsetzung).toBe('Siehe § 9 hier.');
    // "§ 9" steht lokal an Position 6 in "Siehe § 9 hier.", aber TextBlatt
    // rechnet fortsetzung-Positionen als Fortsetzung von text (versatz =
    // getrimmte Länge von text = 8), daher hier 8+6=14, nicht 6.
    expect(n.getaggteVerweise![0]!).toMatchObject({
      textstelle: { zeichenbereichStart: 14, zeichenbereichEnde: 17 },
    });
  });

  it('EDGE CASE: Verweis in fortsetzung UND der vorangehende text-Teil hat umschließenden Whitespace – die getrimmte (nicht rohe) text-Länge fließt in den versatz ein', () => {
    const n = parseNorm(
      '<text><nummer zahl="1."> Vor <verweis norm="§1">V1</verweis> Text   <litera buchstabe="a)">X</litera>  Nach <verweis norm="§2">V2</verweis> Rest</nummer></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.text).toBe('Vor V1 Text');
    expect(eintrag.fortsetzung).toBe('Nach V2 Rest');
    const [v1, v2] = n.getaggteVerweise!;
    // V1 liegt in text: lokal, unbeeinflusst von fortsetzung.
    expect(v1).toMatchObject({
      bezugstext: 'V1',
      textstelle: { zeichenbereichStart: 4, zeichenbereichEnde: 6 },
    });
    // V2 liegt in fortsetzung: lokal wäre Position 5 ("Nach V2 Rest"), aber
    // versatz = getrimmte text-Länge (11) → 11+5=16, nicht 5 und erst recht
    // nicht die frühere (fehlerhafte) Formel, die hier 1 ergeben hätte.
    expect(v2).toMatchObject({
      bezugstext: 'V2',
      textstelle: { zeichenbereichStart: 16, zeichenbereichEnde: 18 },
    });
  });

  it('ein Verweis innerhalb eines Unterabsatzes trägt das unterabsatz-Feld im Verweis-Pfad', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><unterabsatz zahl="[2]"><satz zahl="1">Siehe <verweis norm="§ 9">§ 9</verweis>.</satz></unterabsatz></absatz></text>',
    );
    expect(n.getaggteVerweise![0]!).toMatchObject({
      textstelle: { pfad: { absatz: '(1)', unterabsatz: '[2]', satz: 1 } },
    });
  });

  it('ein Verweis innerhalb eines Satzes IN einem ListenEintrag (nurSatzKinder-Pfad) trägt satzInEintrag statt satz', () => {
    const n = parseNorm(
      '<text><nummer zahl="1."><satz zahl="1">Erstens.</satz><satz zahl="2">Siehe <verweis norm="§ 9">§ 9</verweis>.</satz></nummer></text>',
    );
    expect(n.getaggteVerweise![0]!).toMatchObject({
      textstelle: { pfad: { satz: undefined, satzInEintrag: 2 } },
    });
  });
});

describe('parseGesetzesXML – getaggte Verweise: wiederholung bei Duplikat-Bezeichnung (Regressionsfall)', () => {
  it('zwei Geschwister-Einträge mit identischer bezeichnung: Verweis im zweiten Eintrag trägt wiederholung=1 in seiner Kette', () => {
    const n = parseNorm(
      '<text><litera buchstabe="-">Erster Punkt <verweis norm="§ 1">§ 1</verweis> Ende</litera>' +
        '<litera buchstabe="-">Zweiter Punkt <verweis norm="§ 2">§ 2</verweis> Ende</litera></text>',
    );
    const verweise = n.getaggteVerweise ?? [];
    expect(verweise).toHaveLength(2);
    const ersterVerweis = verweise.find((v) => v.zielBezeichnung === '§ 1');
    const zweiterVerweis = verweise.find((v) => v.zielBezeichnung === '§ 2');
    expect(ersterVerweis?.textstelle.pfad.eintraege?.[0]?.wiederholung).toBeFalsy();
    expect(zweiterVerweis?.textstelle.pfad.eintraege?.[0]?.wiederholung).toBe(1);
  });

  it('EDGE CASE: eine abweichende bezeichnung ZWISCHEN zwei identischen darf NICHT mitgezählt werden – nur echte Duplikate derselben bezeichnung zählen für den wiederholung-Index', () => {
    const n = parseNorm(
      '<text>' +
        '<litera buchstabe="a)">Erster A <verweis norm="§ 1">§ 1</verweis></litera>' +
        '<litera buchstabe="b)">Einziger B <verweis norm="§ 2">§ 2</verweis></litera>' +
        '<litera buchstabe="a)">Zweiter A <verweis norm="§ 3">§ 3</verweis></litera>' +
        '</text>',
    );
    const verweise = n.getaggteVerweise ?? [];
    // Für den DRITTEN Eintrag (zweites "a)") darf nur der ERSTE (echtes "a)")
    // als vorheriges Duplikat gezählt werden, NICHT auch der mittlere "b)" –
    // sonst würde wiederholung fälschlich 2 statt 1 betragen.
    const dritterVerweis = verweise.find((v) => v.zielBezeichnung === '§ 3');
    expect(dritterVerweis?.textstelle.pfad.eintraege?.[0]?.wiederholung).toBe(1);
  });
});

describe('Verweise im normalisierten Fließtext', () => {
  it.each([
    { inhalt: '§<zeilenumbruch/>2', erwartet: '§\n2' },
    { inhalt: ' \t§ \n<zeilenumbruch/> \t<zeilenumbruch/> 2 \n', erwartet: '§\n\n2' },
    { inhalt: ' § <zeilenumbruch/> 2 ', erwartet: ' §\n2 ' },
  ])('erhält innere Umbrüche eines Verweises: $inhalt', ({ inhalt, erwartet }) => {
    const norm = parseNorm(`<text>😀 Vor <verweis norm="§ 2">${inhalt}</verweis> Nach</text>`);
    expect(norm.absaetze[0]!.saetze[0]!.text).toBe(`😀 Vor ${erwartet} Nach`);
    expect(norm.getaggteVerweise![0]).toMatchObject({
      bezugstext: erwartet,
      zielBezeichnung: '§ 2',
      textstelle: {
        pfad: { typ: 'normtext' },
        zeichenbereichStart: 7,
        zeichenbereichEnde: 7 + erwartet.length,
      },
    });
  });

  it('entfernt Umbrüche nur am Blattrand und kürzt auch Bezugstext und Ziel-Fallback', () => {
    const norm = parseNorm(
      '<text><verweis><zeilenumbruch/>Alpha<zeilenumbruch/></verweis>Beta<verweis><zeilenumbruch/>Gamma<zeilenumbruch/><zeilenumbruch/></verweis></text>',
    );
    expect(norm.absaetze[0]!.saetze[0]!.text).toBe('Alpha\nBeta\nGamma');
    expect(norm.getaggteVerweise).toMatchObject([
      {
        bezugstext: 'Alpha\n',
        zielBezeichnung: 'Alpha\n',
        textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 6 },
      },
      {
        bezugstext: '\nGamma',
        zielBezeichnung: '\nGamma',
        textstelle: { zeichenbereichStart: 10, zeichenbereichEnde: 16 },
      },
    ]);
  });

  it('berechnet Verweisbereiche mit Umbrüchen in Haupttext, Unterliste und Fortsetzung', () => {
    const norm = parseNorm(
      '<text><verweis norm="H">A<zeilenumbruch/>B<zeilenumbruch/></verweis><nummer zahl="1."><verweis norm="K"><zeilenumbruch/>Kind<zeilenumbruch/></verweis></nummer><verweis norm="F"><zeilenumbruch/>C<zeilenumbruch/>D<zeilenumbruch/></verweis></text>',
    );
    const satz = norm.absaetze[0]!.saetze[0]!;
    expect(satz.text).toBe('A\nB');
    expect(satz.eintraege[0]!.text).toBe('Kind');
    expect(satz.fortsetzung).toBe('C\nD');
    expect(norm.getaggteVerweise).toMatchObject([
      { bezugstext: 'A\nB', textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 3 } },
      { bezugstext: 'C\nD', textstelle: { zeichenbereichStart: 3, zeichenbereichEnde: 6 } },
      { bezugstext: 'Kind', textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 4 } },
    ]);
  });

  it('zählt UTF-16-Positionen nach Emoji und glättet über Inline-Grenzen', () => {
    const norm = parseNorm(
      '<text> \n😀 Siehe \t<verweis norm="§ 2"> \n§\t 2 \n</verweis> \tund<verweis norm="§ 3">§ 3</verweis>.</text>',
    );
    const text = norm.absaetze[0]!.saetze[0]!.text;
    expect(text).toBe('😀 Siehe § 2 und§ 3.');
    expect(norm.getaggteVerweise).toMatchObject([
      { bezugstext: '§ 2', textstelle: { zeichenbereichStart: 9, zeichenbereichEnde: 12 } },
      { bezugstext: '§ 3', textstelle: { zeichenbereichStart: 16, zeichenbereichEnde: 19 } },
    ]);
  });
  it('entfernt Einrückung an Umbrüchen und lässt NBSP im Bezugstext', () => {
    const norm = parseNorm(
      '<text> \t<zeilenumbruch/> \n<verweis norm="§ 2"> §  2 </verweis> \n<zeilenumbruch/> </text>',
    );
    expect(norm.absaetze[0]!.saetze[0]!.text).toBe(' § 2 ');
    expect(norm.getaggteVerweise![0]).toMatchObject({
      bezugstext: ' § 2 ',
      textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 5 },
    });
  });
});

it.each(['', ' \n\t'])('hält einen leeren Verweisbereich gültig: %j', (inhalt) => {
  const norm = parseNorm(`<text>Vor <verweis norm="§ 2">${inhalt}</verweis>Nach</text>`);
  expect(norm.absaetze[0]!.saetze[0]!.text).toBe('Vor Nach');
  expect(norm.getaggteVerweise![0]).toMatchObject({
    bezugstext: '',
    textstelle: { zeichenbereichStart: 3, zeichenbereichEnde: 3 },
  });
});

it('zählt Verweise nach entfernten Randumbrüchen in Haupttext und Fortsetzung', () => {
  const norm = parseNorm(
    '<text><zeilenumbruch/><verweis norm="§ 1">§ 1</verweis><zeilenumbruch/><nummer zahl="1."><zeilenumbruch/>Kind<zeilenumbruch/></nummer><zeilenumbruch/><zeilenumbruch/>Nach <verweis norm="§ 2">§ 2</verweis><zeilenumbruch/><verweis norm="leer"/></text>',
  );
  const satz = norm.absaetze[0]!.saetze[0]!;
  expect(satz.text).toBe('§ 1');
  expect(satz.fortsetzung).toBe('Nach § 2');
  expect(satz.eintraege[0]!.text).toBe('Kind');
  expect(norm.getaggteVerweise).toMatchObject([
    { bezugstext: '§ 1', textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 3 } },
    { bezugstext: '§ 2', textstelle: { zeichenbereichStart: 8, zeichenbereichEnde: 11 } },
    { bezugstext: '', textstelle: { zeichenbereichStart: 11, zeichenbereichEnde: 11 } },
  ]);
});

it('übernimmt ein fremdes Ziel ohne Normgeber nicht als getaggten Verweis', () => {
  const n = parseNorm('<text><verweis gesetz="X" norm="§ 1" neu="ja">§ 1</verweis></text>');
  expect(n.getaggteVerweise).toBeUndefined();
  expect(JSON.stringify(n.absaetze)).toContain('§ 1');
});
