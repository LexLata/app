// gesetzesXMLParser.text.test.ts
//
// Tests für parseGesetzesXML() (gesetzesXMLParser.ts) – Fokus: <text>-
// Baumaufbau (Absatz/Unterabsatz/Satz/ListenEintrag, jeweils mit und ohne
// expliziten Wrapper), den ausdrücklichen Weggefallen-Status und
// Fußnoten. Bisher nur die Eintrags-KETTE selbst (nummer/litera-Verschachtelung)
// über den migrierten Test abgedeckt – hier zusätzlich alle
// Wrapper-vs-Inline-Varianten und die dokumentierten Schwellenwerte
// (z.B. saetze nur ab 2 <satz>-Kindern gesetzt). Teil der Aufteilung in vier
// fokussierte Dateien, siehe .gesetzInfos.test.ts für den Gesamtüberblick.

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

// ---------------------------------------------------------------------------
// Norm-Metadaten (bezeichnung/titel/fussnoten) – Trimming und Fehlen
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – Norm-Metadaten: bezeichnung/titel/fussnoten', () => {
  function gesetzXmlMitNorm(normInner: string): string {
    return `<?xml version="1.0"?><gesetz id="g1"><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos><inhalt><norm id="n1">${normInner}</norm></inhalt></gesetz>`;
  }

  it('fehlt das <bezeichnung>-Tag komplett, bleibt bezeichnung leerer String statt zu werfen', () => {
    const g = parseGesetzesXML(gesetzXmlMitNorm('<text>Text.</text>'));
    expect((g!.elemente[0]!.data as NormDarstellung).bezeichnung).toBe('');
  });

  it('bezeichnung, titel und fussnoten werden getrimmt (umschließender Whitespace im XML-Text)', () => {
    const g = parseGesetzesXML(
      gesetzXmlMitNorm(
        '<bezeichnung>  § 1  </bezeichnung><titel>  Ein Titel  </titel><text>Text.</text><fussnoten>  Fußnotentext  </fussnoten>',
      ),
    );
    const norm = g!.elemente[0]!.data as NormDarstellung;
    expect(norm).toMatchObject({
      bezeichnung: '§ 1',
      titel: 'Ein Titel',
      fussnoten: 'Fußnotentext',
    });
  });
});

// ---------------------------------------------------------------------------
// Robustheit: unerwartete Knotentypen (Kommentare) in Inline-Inhalten
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – Robustheit: XML-Kommentarknoten werden ignoriert', () => {
  it('ein XML-Kommentar zwischen Textknoten wird übersprungen statt zu werfen (kein Text-, kein Element-Knoten)', () => {
    const n = parseNorm('<text>Text<!-- ein Kommentar -->Ende.</text>');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('TextEnde.');
  });
});

// ---------------------------------------------------------------------------
// Absatz-Varianten
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – Absatz-Varianten', () => {
  it('kein <absatz>-Wrapper: <text> selbst wird als (einziger, unbenannter) Absatz behandelt', () => {
    const n = parseNorm('<text>Direkter Text.</text>');
    expect(n.absaetze).toHaveLength(1);
    expect(n.absaetze[0]!.bezeichnung).toBeUndefined();
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('Direkter Text.');
  });

  it('<absatz> ohne <satz>-Wrapper (Inline-Text): Absatz selbst wird als Satz behandelt', () => {
    const n = parseNorm('<text><absatz zahl="(1)">Text im Absatz.</absatz></text>');
    expect(n.absaetze[0]!).toMatchObject({ bezeichnung: '(1)' });
    expect(n.absaetze[0]!.saetze).toHaveLength(1);
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('Text im Absatz.');
  });

  it('<absatz> mit expliziten <satz>-Kindern', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><satz zahl="1">Erster.</satz><satz zahl="2">Zweiter.</satz></absatz></text>',
    );
    expect(n.absaetze[0]!.saetze.map((s) => [s.zahl, s.text])).toEqual([
      [1, 'Erster.'],
      [2, 'Zweiter.'],
    ]);
  });

  it('mehrere <absatz>-Elemente werden alle übernommen', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)">Eins.</absatz><absatz zahl="(2)">Zwei.</absatz></text>',
    );
    expect(n.absaetze.map((a) => a.bezeichnung)).toEqual(['(1)', '(2)']);
  });

  it('XML-Attribut heißt "zahl", das Modellfeld heißt "bezeichnung"', () => {
    const n = parseNorm('<text><absatz zahl="(3)">X.</absatz></text>');
    expect(n.absaetze[0]!).toHaveProperty('bezeichnung', '(3)');
  });

  it('<satz> ohne zahl-Attribut in einem regulären (nicht-Unterabsatz-)Absatz: zahl bleibt undefined statt NaN', () => {
    const n = parseNorm('<text><absatz zahl="(1)"><satz>Ohne Zahl.</satz></absatz></text>');
    expect(n.absaetze[0]!.saetze[0]!.zahl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unterabsatz
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – Unterabsatz', () => {
  it('bei <unterabsatz>-Kindern wird KEINE flache saetze-Liste gebildet, sondern unterabsaetze', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><unterabsatz zahl="[1]"><satz zahl="1">UA1S1.</satz></unterabsatz><unterabsatz zahl="[2]">Inline UA2.</unterabsatz></absatz></text>',
    );
    expect(n.absaetze[0]!.saetze).toEqual([]);
    expect(n.absaetze[0]!.unterabsaetze).toHaveLength(2);
    expect(n.absaetze[0]!.unterabsaetze![0]!).toMatchObject({ bezeichnung: '[1]' });
    expect(n.absaetze[0]!.unterabsaetze![0]!.saetze[0]!.text).toBe('UA1S1.');
  });

  it('Unterabsatz ohne <satz>-Wrapper: der Unterabsatz selbst wird als Satz behandelt', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><unterabsatz zahl="[1]">Inline-Text.</unterabsatz></absatz></text>',
    );
    expect(n.absaetze[0]!.unterabsaetze![0]!.saetze).toHaveLength(1);
    expect(n.absaetze[0]!.unterabsaetze![0]!.saetze[0]!.text).toBe('Inline-Text.');
  });

  it('Unterabsatz ohne zahl-Attribut hat eine leere Bezeichnung', () => {
    const n = parseNorm('<text><absatz zahl="(1)"><unterabsatz>X.</unterabsatz></absatz></text>');
    expect(n.absaetze[0]!.unterabsaetze![0]!.bezeichnung).toBe('');
  });

  it('Satz-Zählung beginnt pro Unterabsatz neu (kein absatzweiter Zähler)', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)">' +
        '<unterabsatz zahl="[1]"><satz zahl="1">A.</satz></unterabsatz>' +
        '<unterabsatz zahl="[2]"><satz zahl="1">B.</satz></unterabsatz>' +
        '</absatz></text>',
    );
    expect(n.absaetze[0]!.unterabsaetze!.map((ua) => ua.saetze[0]!.zahl)).toEqual([1, 1]);
  });

  it('<satz> ohne zahl-Attribut innerhalb eines Unterabsatzes: zahl bleibt undefined statt NaN', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><unterabsatz zahl="[1]"><satz>Ohne Zahl.</satz></unterabsatz></absatz></text>',
    );
    expect(n.absaetze[0]!.unterabsaetze![0]!.saetze[0]!.zahl).toBeUndefined();
  });

  it('EDGE CASE: ein Unterabsatz mit GEMISCHTEN Kindern (ein <satz> plus ein fremdes Element) zählt nur die echten <satz>-Kinder – das fremde Element wird nicht fälschlich als weiterer Satz behandelt', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><unterabsatz zahl="[1]"><satz zahl="1">Echter Satz.</satz><fussnote>Kein Satz.</fussnote></unterabsatz></absatz></text>',
    );
    const ua = n.absaetze[0]!.unterabsaetze![0]!;
    expect(ua.saetze).toHaveLength(1);
    expect(ua.saetze[0]!.text).toBe('Echter Satz.');
  });
});

// ---------------------------------------------------------------------------
// Satz: fortsetzung (Text NACH einer in den Satz selbst eingebetteten Liste –
// analog zur ListenEintrag-fortsetzung oben, hier aber auf Satz-Ebene)
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – Satz: fortsetzung nach eingebetteter Liste', () => {
  it('Text nach einer in den Satz eingebetteten Unterliste landet getrimmt in satz.fortsetzung', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><satz zahl="1">Text vor<litera buchstabe="a)">X</litera>  Text danach  </satz></absatz></text>',
    );
    const satz = n.absaetze[0]!.saetze[0]!;
    expect(satz.text).toBe('Text vor');
    expect(satz.fortsetzung).toBe('Text danach');
  });

  it('nur Whitespace nach der eingebetteten Liste: fortsetzung bleibt undefined statt leerer/ungetrimmter String', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><satz zahl="1">Text<litera buchstabe="a)">X</litera>   </satz></absatz></text>',
    );
    expect(n.absaetze[0]!.saetze[0]!.fortsetzung).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ListenEintrag (<nummer>/<litera>)
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – ListenEintrag: nurSatzKinder-Pfad (ausdrückliche <satz>-Kinder)', () => {
  it('ein <nummer> mit AUSSCHLIESSLICH >=2 <satz>-Kindern bekommt eine eigene saetze-Liste, Text ist die Verkettung', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1."><satz zahl="1">Erstes.</satz><satz zahl="2">Zweites.</satz></nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.saetze?.map((s) => [s.zahl, s.text])).toEqual([
      [1, 'Erstes.'],
      [2, 'Zweites.'],
    ]);
    expect(eintrag.text).toBe('Erstes. Zweites.');
  });

  it('ein einzelnes ausdrückliches <satz>-Kind behält seine saetze-Liste', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1."><satz zahl="1">Einziger.</satz></nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.saetze).toHaveLength(1);
    expect(eintrag.saetze?.map((s) => [s.zahl, s.text])).toEqual([[1, 'Einziger.']]);
    expect(eintrag.text).toBe('Einziger.');
  });

  it('<satz>-Kind ohne zahl-Attribut fällt auf den 1-basierten Index zurück', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1."><satz>Erster.</satz><satz>Zweiter.</satz></nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.saetze?.map((s) => s.zahl)).toEqual([1, 2]);
  });

  it('<satz>-Kind MIT zahl-Attribut übernimmt dessen Wert (nicht den 1-basierten Index, auch wenn er abweicht)', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1."><satz zahl="5">Erster.</satz><satz zahl="6">Zweiter.</satz></nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.saetze?.map((s) => s.zahl)).toEqual([5, 6]);
  });

  it('roh.text der einzelnen <satz>-Kinder wird getrimmt; jeder erzeugte Satz trägt eine leere eintraege-Liste, der ListenEintrag selbst eine leere untereintraege-Liste (nurSatzKinder-Pfad hat keine eigene Unterliste)', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1.">  <satz zahl="1">  Erstes.  </satz><satz zahl="2">Zweites.</satz>  </nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.saetze?.[0]!.text).toBe('Erstes.');
    expect(eintrag.saetze?.[0]!.eintraege).toEqual([]);
    expect(eintrag.untereintraege).toEqual([]);
  });

  it('EDGE CASE: GEMISCHTE Kinder (ein <satz> plus ein NICHT-<satz>-Element) unterschreiten den nurSatzKinder-Pfad – auch bei >=2 Kindern insgesamt', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1."><satz zahl="1">Satzteil.</satz><litera buchstabe="a)">Unterpunkt.</litera></nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    // Nicht der nurSatzKinder-Pfad (saetze bliebe sonst gesetzt): stattdessen
    // wird der erste <satz> als regulärer Text-Beginn behandelt und die
    // <litera> als Unterlisten-Eintrag.
    expect(eintrag.saetze).toBeUndefined();
    expect(eintrag.text).toBe('Satzteil.');
    expect(eintrag.untereintraege).toHaveLength(1);
    expect(eintrag.untereintraege[0]!).toMatchObject({ bezeichnung: 'a)', text: 'Unterpunkt.' });
  });
});

describe('parseGesetzesXML – ListenEintrag: Einzelsatz/Unterlisten-Pfad', () => {
  it('Rohtext ohne Unterliste: text gesetzt, keine untereintraege', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1.">Reiner Text.</nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag).toMatchObject({ text: 'Reiner Text.', untereintraege: [] });
  });

  it('EDGE CASE: Text VOR einer Unterliste und Text DANACH werden zu text/fortsetzung getrennt', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1.">Text vor<litera buchstabe="a)">Unterpunkt a</litera>Fortsetzungstext</nummer></absatz></text>',
    );
    const eintrag = n.absaetze[0]!.saetze[0]!.eintraege[0]!;
    expect(eintrag.text).toBe('Text vor');
    expect(eintrag.fortsetzung).toBe('Fortsetzungstext');
    expect(eintrag.untereintraege).toHaveLength(1);
    expect(eintrag.untereintraege[0]!).toMatchObject({
      bezeichnung: 'a)',
      ebene: 'litera',
      text: 'Unterpunkt a',
    });
  });

  it('Ebene wird aus dem echten XML-Tag gelesen (nummer→nummer bleibt "nummer", nicht automatisch "litera" bei tieferer Verschachtelung)', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1.">Text<nummer zahl="1.1.">Verschachtelte nummer</nummer></nummer></absatz></text>',
    );
    expect(n.absaetze[0]!.saetze[0]!.eintraege[0]!.untereintraege[0]!.ebene).toBe('nummer');
  });

  it('leere fortsetzung (kein Text danach) bleibt undefined statt leerer String', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><nummer zahl="1.">Text<litera buchstabe="a)">X</litera></nummer></absatz></text>',
    );
    expect(n.absaetze[0]!.saetze[0]!.eintraege[0]!.fortsetzung).toBeUndefined();
  });
});

describe('parseGesetzesXML – ListenEintrag: wiederholung bei identischer bezeichnung', () => {
  it('zwei Geschwister-Einträge mit identischer bezeichnung (z.B. unnummerierte Liste "-") werden beide korrekt geparst (kein Verlust)', () => {
    const n = parseNorm(
      '<text><absatz zahl="(1)"><litera buchstabe="-">Erster</litera><litera buchstabe="-">Zweiter</litera></absatz></text>',
    );
    const eintraege = n.absaetze[0]!.saetze[0]!.eintraege;
    expect(eintraege.map((e) => e.text)).toEqual(['Erster', 'Zweiter']);
    expect(eintraege.map((e) => e.bezeichnung)).toEqual(['-', '-']);
  });
});

// ---------------------------------------------------------------------------
// Weggefallen-Status und Erhalt vorhandenen Texts
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – ausschließlich ausdrücklicher Status', () => {
  it.each([
    '(weggefallen)',
    '(gegenstandslos)',
    '(aufgehoben)',
    '(entfallen)',
    '(WEGGEFALLEN)',
    '  (weggefallen)  ',
  ])('deutet reinen Text %s ohne Status nicht um', (wert) => {
    const n = parseNorm(`<text>${wert}</text>`);
    expect(n.titel).toBeUndefined();
    expect(n).not.toHaveProperty('status', 'weggefallen');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe(wert.trim());
  });
  it('deutet einen weggefallenen Titel ohne Attribut nicht als Status', () => {
    const n = parseNorm('<titel>(weggefallen)</titel>');
    expect(n.titel).toBe('(weggefallen)');
    expect(n).not.toHaveProperty('status', 'weggefallen');
    expect(n.absaetze).toEqual([]);
  });
  it('liest Status und erhält gleichzeitig echten Text und dessen Verweise', () => {
    const g = parseGesetzesXML(
      normXml(
        '<titel>(weggefallen)</titel><text>Siehe <verweis norm="§ 2">§ 2</verweis>.</text>',
      ).replace('<norm id="n1">', '<norm id="n1" status="weggefallen">'),
    );
    const n = g!.elemente[0]!.data as NormDarstellung;
    expect(n).toMatchObject({ status: 'weggefallen', titel: '(weggefallen)' });
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('Siehe § 2.');
    expect(n.getaggteVerweise![0]!.bezugstext).toBe('§ 2');
  });
  it('liest den Status auch ohne Titel oder Text, ignoriert unbekannte Statuswerte', () => {
    for (const wert of ['weggefallen', 'zukuenftig']) {
      const g = parseGesetzesXML(
        normXml('').replace('<norm id="n1">', `<norm id="n1" status="${wert}">`),
      );
      expect(g!.elemente[0]!.data).toMatchObject({ absaetze: [] });
      expect((g!.elemente[0]!.data as NormDarstellung).status).toBe(
        wert === 'weggefallen' ? wert : undefined,
      );
    }
  });
  it('erhält normalen Titel und Text sowie Text mit dem Wort weggefallen', () => {
    const n = parseNorm(
      '<titel>Ein Titel</titel><text>Der Paragraph ist weggefallen, siehe Anmerkung.</text>',
    );
    expect(n.titel).toBe('Ein Titel');
    expect(n.absaetze[0]!.saetze[0]!.text).toBe('Der Paragraph ist weggefallen, siehe Anmerkung.');
  });
});

// ---------------------------------------------------------------------------
// Fußnoten, Erwägungsgrund
// ---------------------------------------------------------------------------

describe('parseGesetzesXML – Fußnoten und Erwägungsgrund-Flag', () => {
  it('liest fussnoten, wenn vorhanden', () => {
    const n = parseNorm('<text>Text.</text><fussnoten>Eine Fußnote.</fussnoten>');
    expect(n.fussnoten).toBe('Eine Fußnote.');
  });

  it('fussnoten bleibt undefined, wenn nicht vorhanden', () => {
    const n = parseNorm('<text>Text.</text>');
    expect(n.fussnoten).toBeUndefined();
  });

  it('leerer fussnoten-Tag ergibt undefined (leerer String zählt als "nicht vorhanden")', () => {
    const n = parseNorm('<text>Text.</text><fussnoten></fussnoten>');
    expect(n.fussnoten).toBeUndefined();
  });

  it('typ="erwaegungsgrund"-Attribut setzt istErwaegungsgrund auf true', () => {
    const g = parseGesetzesXML(
      '<?xml version="1.0"?><gesetz id="g1"><infos><normgeber>de-bund</normgeber><langtitel>T</langtitel><kurztitel>K</kurztitel></infos><inhalt><norm id="e1" typ="erwaegungsgrund"><bezeichnung>E1</bezeichnung></norm></inhalt></gesetz>',
    );
    expect((g!.elemente[0]!.data as NormDarstellung).art).toBe('erwaegungsgrund');
  });

  it('ohne typ-Attribut bleibt istErwaegungsgrund undefined (nicht false)', () => {
    const n = parseNorm('<text>Text.</text>');
    expect(n.art).toBe('normal');
  });
});

describe('Fließtext-Normalisierung', () => {
  it.each([
    '<text>%s</text>',
    '<text><absatz>%s</absatz></text>',
    '<text><absatz><unterabsatz zahl="[1]">%s</unterabsatz></absatz></text>',
    '<text><satz>%s</satz></text>',
  ])('glättet gewöhnlichen Leerraum in %s', (wrapper) => {
    const norm = parseNorm(
      wrapper.replace('%s', ' \tAlpha\r\n  <fremd> Beta\t Gamma </fremd> Delta \n '),
    );
    const absatz = norm.absaetze[0]!;
    const saetze = absatz.unterabsaetze?.[0]?.saetze ?? absatz.saetze;
    expect(saetze[0]!.text).toBe('Alpha Beta Gamma Delta');
  });
  it('bewahrt NBSP und entfernt mehrfache ausdrückliche Randumbrüche', () => {
    const norm = parseNorm(
      '<text> \n<zeilenumbruch/> \t<zeilenumbruch/> \n Alpha   Beta  \n<zeilenumbruch/> \t</text>',
    );
    expect(norm.absaetze[0]!.saetze[0]!.text).toBe(' Alpha  Beta ');
  });
  it('erfindet keine Wortgrenzen und repariert keine Interpunktion', () => {
    const norm = parseNorm('<text>Wort<fremd>teil</fremd>\n. Ab\nbruch</text>');
    expect(norm.absaetze[0]!.saetze[0]!.text).toBe('Wortteil . Ab bruch');
  });
});

it('glättet die Fortsetzung auch über mehrere Unterlisten hinweg', () => {
  const norm = parseNorm(
    '<text>Vor<nummer zahl="1.">Kind</nummer>Nach <nummer zahl="2.">Kind</nummer>weiter</text>',
  );
  expect(norm.absaetze[0]!.saetze[0]!.fortsetzung).toBe('Nach weiter');
});

it('erhält mehrfache innere Umbrüche und entfernt reine Umbruchblätter', () => {
  const norm = parseNorm(
    '<text><satz zahl="1"><zeilenumbruch/>Alpha <zeilenumbruch/> \t<zeilenumbruch/> Beta<zeilenumbruch/></satz><satz zahl="2"><zeilenumbruch/> \n<zeilenumbruch/></satz></text>',
  );
  expect(norm.absaetze[0]!.saetze.map((satz) => satz.text)).toEqual(['Alpha\n\nBeta', '']);
});

it.each([
  [' zahl="[2]"', '[2]'],
  ['', ''],
])('führt die Unterabsatz-Bezeichnung als Text (%s)', (attribut, erwartet) => {
  const n = parseNorm(`<text><absatz><unterabsatz${attribut}>Text.</unterabsatz></absatz></text>`);
  expect(n.absaetze[0]!.unterabsaetze![0]).toHaveProperty('bezeichnung', erwartet);
});
