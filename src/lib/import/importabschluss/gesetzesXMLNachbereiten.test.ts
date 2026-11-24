// gesetzesXMLNachbereiten.test.ts
//
// Integrationstest für tokenisiereGesetzesXML() (gesetzesXMLNachbereiten.ts):
// Testinput ist rohes, fertiges GesetzesXML OHNE Satzzahlen
// (wie es z.B. ein manuell nachgepflegtes oder älteres Import-Ergebnis ohne
// Tokenisierung wäre), Output ist der satztokenisierte XML-String. Deckt
// damit das reale Zusammenspiel aus DOM-Rückbau (baueElementeAusContainer/
// baueEintragAusElement/baueAbsaetzeAusInhalt), satzTokenizer.tokenize(),
// flattenElemente() und baueText()/baueEintrag() End-to-End ab, im
// Unterschied zu xmlSerialisierung.flattenElemente.test.ts (reiner
// Unit-Test der fortsetzung-Logik ohne echtes XML-Parsing/-Serialisieren)
// bzw. xmlSerialisierung.baueEintrag.test.ts/.baueText.test.ts (reine
// Unit-Tests der Serialisierungsseite ohne DOM-Rückbau).
//
// Enthält u.a. die Idempotenz von tokenisiereGesetzesXML() (erneuter
// Lauf auf bereits tokenisiertem XML, siehe entferneSatzTags()) – siehe
// den entsprechenden describe-Block unten.
//
// Absichtlich NICHT hier getestet: nachbereiteGesetzesXML() (die async
// Wrapper-Funktion, die zusätzlich ermittleGesetzRefs()/taggeVerweise()
// aufruft) – ermittleGesetzRefs() liest über die Persistenzschicht
// installierte Gesetze/Indizes von der Festplatte (Tauri-Plugins), was in
// dieser reinen Node-Testumgebung ohne aufwändiges Mocken der Persistenz-
// schicht nicht sinnvoll isoliert testbar ist. Die hier abgedeckte
// Tokenisierung ist der fachlich komplexe, deterministische Kern; das
// Verweis-Tagging selbst ist Aufgabe von verweisTagger.ts (siehe dessen
// eigene Testdatei für die dortige Idempotenz).
//
// Vitest (Node-Umgebung). DOMParser- UND XMLSerializer-Polyfill (linkedom)
// kommen zentral aus src/test/setupNode.ts.
//
// WICHTIGER HINWEIS zur Testbarkeit: linkedom erzeugt bei fehlerhaftem XML
// (anders als ein echter Browser-DOMParser) NIEMALS ein <parsererror>-
// Element, sondern parst großzügig/nachsichtig durch (verifiziert). Der
// defensive Fallback in tokenisiereGesetzesXML() ("bei Parse-Fehler
// Originalstring unverändert zurückgeben") ist daher in dieser
// Testumgebung nicht auslösbar und wird hier bewusst NICHT getestet – das
// ist eine Einschränkung der Testumgebung, kein Hinweis auf einen Fehler
// in der Produktionslogik (die in der echten Tauri-WebView mit echtem
// Browser-DOMParser läuft).

import { describe, it, expect } from 'vitest';
import { tokenisiereGesetzesXML } from './gesetzesXMLNachbereiten';

function gesetz(inhalt: string, weitereNormen = ''): string {
  return `<?xml version="1.0"?>
<gesetz id="test">
  <infos><normgeber>de-bund</normgeber><langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel></infos>
  <inhalt>
    <norm id="n1">
      <bezeichnung>§ 1</bezeichnung>
      <text>${inhalt}</text>
    </norm>
    ${weitereNormen}
  </inhalt>
</gesetz>`;
}

/** Entfernt Whitespace an Tag-Grenzen (inkl. zwischen Text und folgendem
 *  Tag) für robuste Vergleiche, die nicht von Einrückung/Pretty-Printing
 *  der Serialisierung abhängen; verbleibender Whitespace innerhalb von
 *  Textinhalten wird auf ein einzelnes Leerzeichen kollabiert. */
function ohneZwischenraum(xml: string): string {
  return xml.replace(/>\s+/g, '>').replace(/\s+</g, '<').replace(/\s+/g, ' ').trim();
}

describe('tokenisiereGesetzesXML – reiner Fließtext', () => {
  it('mehrere Sätze in einem Absatz ohne Liste werden zu <satz zahl="n">-Elementen', () => {
    const result = tokenisiereGesetzesXML(
      gesetz('<absatz zahl="(1)">Erster Satz. Zweiter Satz.</absatz>'),
    );
    expect(ohneZwischenraum(result)).toContain(
      ohneZwischenraum(
        '<absatz zahl="(1)"><satz zahl="1">Erster Satz.</satz><satz zahl="2">Zweiter Satz.</satz></absatz>',
      ),
    );
  });

  it('ein einzelner Satz bleibt ohne <satz>-Wrapper (Kurzform)', () => {
    const result = tokenisiereGesetzesXML(gesetz('<absatz zahl="(1)">Nur ein Satz.</absatz>'));
    expect(ohneZwischenraum(result)).toContain('<absatz zahl="(1)">Nur ein Satz.</absatz>');
  });
});

describe('tokenisiereGesetzesXML – Text unmittelbar vor einer Liste', () => {
  it('ein einleitender Satz mit nummer-Elementen bleibt direkt im Absatz ohne Satz-Hülle', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        '<absatz zahl="(1)">Es gilt: <nummer zahl="1.">Fall eins.</nummer><nummer zahl="2.">Fall zwei.</nummer></absatz>',
      ),
    );
    expect(ohneZwischenraum(result)).toContain(
      ohneZwischenraum(
        '<absatz zahl="(1)">Es gilt:<nummer zahl="1.">Fall eins.</nummer><nummer zahl="2.">Fall zwei.</nummer></absatz>',
      ),
    );
  });
});

describe('tokenisiereGesetzesXML – "fortsetzung" über eine Liste hinweg', () => {
  it('offene Liste (kein Punkt im letzten Eintrag) + nachfolgender Mehrsatz-Text: erster Satz als fortsetzung, weitere als eigener <satz>', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        '<absatz zahl="(1)"><nummer zahl="1.">Fall eins</nummer><nummer zahl="2.">Fall zwei</nummer> sind wirksam. Weiterer Satz.</absatz>',
      ),
    );
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain(
      '<nummer zahl="1.">Fall eins</nummer><nummer zahl="2.">Fall zwei</nummer>',
    );
    expect(kompakt).toContain('sind wirksam.');
    expect(kompakt).toContain('<satz zahl="2">Weiterer Satz.</satz>');
  });
});

describe('tokenisiereGesetzesXML – Idempotenz (unterstützter Aufrufpfad)', () => {
  it('eine Norm mit vorhandenem <satz> um einen EINZELNEN Satz wird beim erneuten Aufruf zur kanonischen Kurzform normalisiert (kein <satz>-Wrapper für nur einen Satz, siehe "reiner Fließtext"-Block oben)', () => {
    const eingabe = gesetz(
      '<absatz zahl="(1)"><satz zahl="1">Bereits verarbeitet.</satz></absatz>',
    );
    const result = tokenisiereGesetzesXML(eingabe);
    expect(ohneZwischenraum(result)).toContain('<absatz zahl="(1)">Bereits verarbeitet.</absatz>');
  });

  it('erneuter Lauf auf bereits tokenisiertem Mehrsatz-Absatz liefert exakt dasselbe Ergebnis', () => {
    const roh = gesetz('<absatz zahl="(1)">Erster Satz. Zweiter Satz.</absatz>');
    const einmal = tokenisiereGesetzesXML(roh);
    const zweimal = tokenisiereGesetzesXML(einmal);
    expect(zweimal).toBe(einmal);
  });

  it('erneuter Lauf auf bereits tokenisiertem Satz MIT eingebetteter Liste bleibt stabil (kritischer Fall: <litera> steckt nach dem ersten Lauf innerhalb von <satz>)', () => {
    const roh = gesetz(
      '<absatz zahl="(1)">Voraussetzungen gelten. Es gilt: <nummer zahl="1.">Fall eins.</nummer><nummer zahl="2.">Fall zwei.</nummer></absatz>',
    );
    const einmal = tokenisiereGesetzesXML(roh);
    const zweimal = tokenisiereGesetzesXML(einmal);
    expect(zweimal).toBe(einmal);
    // Die Liste darf beim erneuten Rückbau NICHT verloren gehen (das war der
    // eigentliche Fehler vor der Umstellung: <satz> wurde als "unbekanntes
    // Inline-Element" behandelt und sein GESAMTER Inhalt inkl. der darin
    // verschachtelten <nummer>-Liste per .textContent zu Fließtext
    // abgeflacht).
    expect(ohneZwischenraum(zweimal)).toContain(
      '<satz zahl="2">Es gilt:<nummer zahl="1.">Fall eins.</nummer><nummer zahl="2.">Fall zwei.</nummer></satz>',
    );
  });

  it('erneuter Lauf bei Unterabsätzen (EU-Recht) bleibt stabil und behält die korrekte Nummerierung (Sonderfall: pro <unterabsatz>-Element entsteht beim Rückbau erneut ein Marker, die dadurch entstehende führende leere Gruppe wird aber intern übersprungen)', () => {
    const roh = gesetz(
      '<absatz zahl="(1)"><unterabsatz zahl="[1]">UA1 Satz1. UA1 Satz2.</unterabsatz><unterabsatz zahl="[2]">UA2 einzelsatz.</unterabsatz></absatz>',
    );
    const einmal = tokenisiereGesetzesXML(roh);
    const zweimal = tokenisiereGesetzesXML(einmal);
    expect(zweimal).toBe(einmal);
    const kompakt = ohneZwischenraum(zweimal);
    expect(kompakt).toContain(
      '<unterabsatz zahl="[1]"><satz zahl="1">UA1 Satz1.</satz><satz zahl="2">UA1 Satz2.</satz></unterabsatz>',
    );
    expect(kompakt).toContain('<unterabsatz zahl="[2]">UA2 einzelsatz.</unterabsatz>');
  });

  it('erhält vorhandene Verweise auch in der einsätzigen Kurzform', () => {
    const eingabe = gesetz(
      '<absatz zahl="(1)"><verweis norm="§ 9">Text mit Verweis.</verweis></absatz>',
    );
    expect(ohneZwischenraum(tokenisiereGesetzesXML(eingabe))).toContain(
      '<absatz zahl="(1)"><verweis norm="§ 9">Text mit Verweis.</verweis></absatz>',
    );
  });

  it('bei mehreren Normen wird jetzt JEDE einheitlich neu aufgebaut, nicht mehr selektiv übersprungen (der bereits einsätzige "verarbeitete" Absatz wird dabei ebenfalls zur Kurzform normalisiert)', () => {
    const xml = gesetz(
      '<absatz zahl="(1)">Erster Satz. Zweiter Satz.</absatz>',
      `<norm id="n2">
        <bezeichnung>§ 2</bezeichnung>
        <text><absatz zahl="(1)"><satz zahl="1">Bereits verarbeitet.</satz></absatz></text>
      </norm>`,
    );
    const result = tokenisiereGesetzesXML(xml);
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain(
      '<absatz zahl="(1)"><satz zahl="1">Erster Satz.</satz><satz zahl="2">Zweiter Satz.</satz></absatz>',
    );
    expect(kompakt).toContain('<absatz zahl="(1)">Bereits verarbeitet.</absatz>');
  });
});

describe('tokenisiereGesetzesXML – Randfälle', () => {
  it('leerer <text> ohne jeglichen Text bleibt unverändert (kein Absturz)', () => {
    const eingabe = gesetz('');
    const result = tokenisiereGesetzesXML(eingabe);
    // baueText() liefert [] für einen komplett leeren Inhalt -> die Norm
    // wird übersprungen (continue), das leere <text> bleibt daher exakt
    // wie vom (linkedom-)Serializer für ein leeres Element ausgegeben.
    expect(ohneZwischenraum(result)).toContain('<text />');
  });

  it('mehrere Absätze werden unabhängig voneinander korrekt tokenisiert', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        '<absatz zahl="(1)">Satz eins. Satz zwei.</absatz><absatz zahl="(2)">Nur ein Satz hier.</absatz>',
      ),
    );
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain(
      '<absatz zahl="(1)"><satz zahl="1">Satz eins.</satz><satz zahl="2">Satz zwei.</satz></absatz>',
    );
    expect(kompakt).toContain('<absatz zahl="(2)">Nur ein Satz hier.</absatz>');
  });

  it('erhält einen ausdrücklich vorhandenen unnummerierten Absatz einschließlich Satzstruktur', () => {
    const result = tokenisiereGesetzesXML(gesetz('<absatz>Satz eins. Satz zwei.</absatz>'));
    const kompakt = ohneZwischenraum(result);
    // Die ausdrücklich gespeicherte Absatzgrenze gehört zur Textstruktur.
    expect(kompakt).toContain(
      '<text><absatz><satz zahl="1">Satz eins.</satz><satz zahl="2">Satz zwei.</satz></absatz></text>',
    );
  });
});

describe('tokenisiereGesetzesXML – Unterabsatz-Rekonstruktion (EU-Recht)', () => {
  it('zwei <unterabsatz>-Geschwister mit Rohtext werden je eigenständig tokenisiert, Satzzählung startet pro Unterabsatz neu', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        '<absatz zahl="(1)"><unterabsatz zahl="[1]">UA1 Satz1. UA1 Satz2.</unterabsatz><unterabsatz zahl="[2]">UA2 einzelsatz.</unterabsatz></absatz>',
      ),
    );
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain(
      '<unterabsatz zahl="[1]"><satz zahl="1">UA1 Satz1.</satz><satz zahl="2">UA1 Satz2.</satz></unterabsatz>',
    );
    expect(kompakt).toContain('<unterabsatz zahl="[2]">UA2 einzelsatz.</unterabsatz>');
  });
});

describe('tokenisiereGesetzesXML – verschachtelte Listen', () => {
  it('litera-Kinder innerhalb eines nummer-Elements werden rekursiv rekonstruiert (untereintraege)', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        '<absatz zahl="(1)">Es gilt: <nummer zahl="1.">Fall eins: <litera buchstabe="a)">Unterfall A.</litera><litera buchstabe="b)">Unterfall B.</litera></nummer></absatz>',
      ),
    );
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain(
      '<nummer zahl="1.">Fall eins:<litera buchstabe="a)">Unterfall A.</litera><litera buchstabe="b)">Unterfall B.</litera></nummer>',
    );
  });

  it('Whitespace-only Textknoten (Pretty-Print-Einrückung) zwischen zwei nummer-Geschwistern bricht die Liste NICHT auseinander', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        '<absatz zahl="(1)"><nummer zahl="1.">Fall eins.</nummer>\n      <nummer zahl="2.">Fall zwei.</nummer></absatz>',
      ),
    );
    const kompakt = ohneZwischenraum(result);
    // Beide Einträge bleiben gemeinsam direkt im Absatz ohne Satz-Hülle.
    expect(kompakt).toContain(
      '<absatz zahl="(1)"><nummer zahl="1.">Fall eins.</nummer><nummer zahl="2.">Fall zwei.</nummer></absatz>',
    );
  });

  it('Edge-Case: ECHTER Text zwischen zwei nummer-Geschwistern beendet die erste Liste – daraus werden zwei getrennte <satz>-Einträge (zweite mit neuer, eigener Liste)', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        '<absatz zahl="(1)"><nummer zahl="1.">Fall eins.</nummer> und außerdem <nummer zahl="2.">Fall zwei.</nummer></absatz>',
      ),
    );
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain('<satz zahl="1"><nummer zahl="1.">Fall eins.</nummer></satz>');
    expect(kompakt).toContain(
      '<satz zahl="2">und außerdem<nummer zahl="2.">Fall zwei.</nummer></satz>',
    );
  });

  it('Edge-Case: ein leeres, selbstschließendes <nummer zahl="…"/> (kein Text) wird ohne Absturz rekonstruiert', () => {
    const result = tokenisiereGesetzesXML(
      gesetz('<absatz zahl="(1)"><nummer zahl="1."/></absatz>'),
    );
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain('<absatz zahl="(1)"><nummer zahl="1." /></absatz>');
  });
});

describe('tokenisiereGesetzesXML – <zeilenumbruch/> außerhalb von Listen', () => {
  it('ein <zeilenumbruch/> im reinen Fließtext (kein Listenkontext) trennt bei folgendem Satzanfang in eigenständige <satz>-Elemente', () => {
    const result = tokenisiereGesetzesXML(
      gesetz('<absatz zahl="(1)">Erster Teil.<zeilenumbruch/>Zweiter Teil.</absatz>'),
    );
    const kompakt = ohneZwischenraum(result);
    expect(kompakt).toContain(
      '<absatz zahl="(1)"><satz zahl="1">Erster Teil.</satz><satz zahl="2">Zweiter Teil.</satz></absatz>',
    );
  });
});

describe('tokenisiereGesetzesXML – einsätzige Strukturen mit Aufzählung', () => {
  const liste = '<nummer zahl="1.">Fall eins</nummer><nummer zahl="2.">Fall zwei</nummer>';

  it.each([
    ['Text', '', ''],
    ['Absatz', '<absatz zahl="(1)">', '</absatz>'],
    ['Unterabsatz', '<absatz zahl="(1)"><unterabsatz zahl="[1]">', '</unterabsatz></absatz>'],
  ])(
    '%s: Liste und Fortsetzung bleiben ohne Satz-Hülle, auch beim erneuten Aufruf',
    (_name, vor, nach) => {
      const inhalt = `${vor}Wirksam sind:${liste}unter diesen Bedingungen.${nach}`;
      const result = tokenisiereGesetzesXML(gesetz(inhalt));
      const text = new DOMParser()
        .parseFromString(result, 'application/xml')
        .querySelector('norm > text');
      expect(ohneZwischenraum(text?.innerHTML ?? '')).toBe(ohneZwischenraum(inhalt));
      expect(ohneZwischenraum(tokenisiereGesetzesXML(result))).toBe(ohneZwischenraum(result));
    },
  );

  it('ein vorhandener einzelner Satz mit verschachtelter Liste wird zur Kurzform ohne Verlust der Fortsetzung', () => {
    const inhalt =
      '<absatz zahl="(1)">Wirksam sind:<nummer zahl="1.">die Fälle:<litera buchstabe="a)">Unterfall A</litera><litera buchstabe="b)">Unterfall B</litera><zeilenumbruch />unter diesen Bedingungen</nummer>ab heute.</absatz>';
    const eingabe = inhalt
      .replace('>Wirksam sind:', '><satz zahl="1">Wirksam sind:')
      .replace('ab heute.</absatz>', 'ab heute.</satz></absatz>');
    const result = tokenisiereGesetzesXML(gesetz(eingabe));
    const text = new DOMParser()
      .parseFromString(result, 'application/xml')
      .querySelector('norm > text');
    expect(ohneZwischenraum(text?.innerHTML ?? '')).toBe(ohneZwischenraum(inhalt));
    expect(ohneZwischenraum(tokenisiereGesetzesXML(result))).toBe(ohneZwischenraum(result));
  });

  it.each(['nummer', 'litera'])(
    '%s: einsätziger Eintrag bleibt kurz, mehrsätziger Eintrag behält nummerierte Sätze',
    (tag) => {
      const attr = tag === 'nummer' ? 'zahl="1."' : 'buchstabe="a)"';
      const kurz = `<${tag} ${attr}>Nur ein Satz.</${tag}>`;
      const lang = `<${tag} ${attr}><satz zahl="1">Erster Satz.</satz><satz zahl="2">Zweiter Satz.</satz></${tag}>`;
      expect(ohneZwischenraum(tokenisiereGesetzesXML(gesetz(kurz)))).toContain(kurz);
      expect(
        ohneZwischenraum(
          tokenisiereGesetzesXML(gesetz(`<${tag} ${attr}>Erster Satz. Zweiter Satz.</${tag}>`)),
        ),
      ).toContain(lang);
    },
  );

  it('mehrsätziger Unterabsatz behält die Satz-Hüllen einschließlich Liste und Fortsetzung', () => {
    const result = tokenisiereGesetzesXML(
      gesetz(
        `<absatz zahl="(1)"><unterabsatz zahl="[1]">Wirksam sind:${liste}unter diesen Bedingungen. Weiterer Satz.</unterabsatz></absatz>`,
      ),
    );
    expect(ohneZwischenraum(result)).toContain(
      `<unterabsatz zahl="[1]"><satz zahl="1">Wirksam sind:${liste}unter diesen Bedingungen.</satz><satz zahl="2">Weiterer Satz.</satz></unterabsatz>`,
    );
  });
});

describe('tokenisiereGesetzesXML – Verweiserhalt', () => {
  it.each([
    'Siehe <verweis gesetz="Ziel" normgeber="eu" norm="Art. 1" absatz="2" fremd="&amp;">Art. 1 Abs. 2</verweis>. Weiterer Satz.',
    '<verweis gesetz="Ziel" norm="§ 1">§ 1</verweis> gilt. Weiterer Satz.',
    'Erster Satz. <verweis gesetz="Ziel" norm="§ 1">§ 1</verweis> gilt.',
    'Es gelten:<nummer zahl="1"><verweis gesetz="Ziel" norm="§ 1">§ 1</verweis> und<litera buchstabe="a"><verweis gesetz="Ziel" norm="§ 2">§ 2</verweis>,</litera>danach</nummer> <verweis gesetz="Ziel" norm="§ 3">§ 3</verweis>. Weiterer Satz.',
    '<unterabsatz zahl="[1]">Siehe <verweis gesetz="Ziel" norm="§ 1">§ 1</verweis>. Weiterer Satz.</unterabsatz><unterabsatz zahl="[2]"><verweis gesetz="Ziel" norm="§ 2">§ 2</verweis> gilt.</unterabsatz>',
    '<nummer zahl="1">Siehe <verweis gesetz="Ziel" norm="§ 1">§ 1</verweis>. Weiterer Satz.</nummer>',
  ])('erhält Verweisziele und Attribute in %s', (inhalt) => {
    const xml = gesetz(`<absatz zahl="(1)">${inhalt}</absatz>`);
    const verweise = (text: string) =>
      Array.from(
        new DOMParser().parseFromString(text, 'application/xml').querySelectorAll('verweis'),
      ).map((el) => new XMLSerializer().serializeToString(el));
    const result = tokenisiereGesetzesXML(xml);
    expect(verweise(result)).toEqual(verweise(xml));
    expect(ohneZwischenraum(tokenisiereGesetzesXML(result))).toBe(ohneZwischenraum(result));
  });
});

it('ordnet gleichlautende Verweise mit unterschiedlichen Zielen positionsgetreu zu', () => {
  const eingabe = gesetz(
    '<absatz zahl="1"><satz zahl="9">Siehe <verweis gesetz="A" norm="§ 1">§ 1</verweis> und <verweis gesetz="B" norm="§ 2">§ 1</verweis> für die Regel. Weiterer Satz.</satz></absatz>',
  );
  const result = tokenisiereGesetzesXML(eingabe);
  expect(result).toContain('<verweis gesetz="A" norm="§ 1">§ 1</verweis>');
  expect(result).toContain('<verweis gesetz="B" norm="§ 2">§ 1</verweis>');
  expect(result).toContain('<satz zahl="2">Weiterer Satz.</satz>');
  expect(ohneZwischenraum(tokenisiereGesetzesXML(result))).toBe(ohneZwischenraum(result));
});

it('verändert keine unbekannten Normtextstrukturen oder Satz-Tags außerhalb des Normtextes', () => {
  const eingabe = gesetz(
    '<absatz zahl="1"><fremd ziel="A"><satz zahl="8">Erster Satz. Zweiter Satz.</satz></fremd></absatz>',
  ).replace(
    '<kurztitel>TestG</kurztitel>',
    '<kurztitel>TestG</kurztitel><fremd><satz zahl="7">Metadaten.</satz></fremd>',
  );
  const result = tokenisiereGesetzesXML(eingabe);
  expect(result).toContain(
    '<fremd ziel="A"><satz zahl="8">Erster Satz. Zweiter Satz.</satz></fremd>',
  );
  expect(result).toContain('<fremd><satz zahl="7">Metadaten.</satz></fremd>');
});

it('erhält einen Verweis über eine neue Satzgrenze unverändert und verarbeitet andere Normen weiter', () => {
  const inhalt =
    '<absatz zahl="1">Siehe <verweis gesetz="Ziel" norm="§ 9">diese Regel. Eine weitere Regel</verweis> gilt.</absatz>';
  const eingabe = gesetz(
    inhalt,
    '<norm id="n2"><bezeichnung>§ 2</bezeichnung><text>Erster Satz. Zweiter Satz.</text></norm>',
  );
  const result = tokenisiereGesetzesXML(eingabe);
  const doc = new DOMParser().parseFromString(result, 'application/xml');
  expect(ohneZwischenraum(doc.querySelector('norm[id="n1"] > text')?.innerHTML ?? '')).toBe(
    ohneZwischenraum(inhalt),
  );
  expect(ohneZwischenraum(doc.querySelector('norm[id="n2"] > text')?.innerHTML ?? '')).toBe(
    '<satz zahl="1">Erster Satz.</satz><satz zahl="2">Zweiter Satz.</satz>',
  );
  expect(ohneZwischenraum(tokenisiereGesetzesXML(result))).toBe(ohneZwischenraum(result));
});
