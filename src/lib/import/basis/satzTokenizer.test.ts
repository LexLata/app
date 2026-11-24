// satzTokenizer.test.ts
//
// Tests für satzTokenizer.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// String-Logik (direkte Übersetzung aus Swift, siehe Kopfkommentar der
// Quelldatei) – keine Fixtures nötig, nur Ein-/Ausgabe-Paare.
//
// Einzelbuchstaben vor einem Punkt werden kontextabhängig beurteilt
// (Ketten wie "z. B." sind Abkürzungen, einzelne Großbuchstaben Initialen
// außer nach Gliederungsbezeichnungen, einzelne Kleinbuchstaben Satzende) –
// siehe Abschnitt "Einzelbuchstaben" unten.
//
// Das Wort "Satz" selbst stand früher zusätzlich in der Liste (gedacht für
// Zitate wie "Satz 2"), wurde aber entfernt: bei einem Zitat wie "Satz 2"
// steht "Satz" NIE unmittelbar vor einem Punkt (deutsche Zitierkonvention
// schreibt "Satz 2", nicht "Satz. 2") – der Eintrag hatte daher keinen
// Nutzen, sondern verhinderte nur fälschlich die Trennung an echten
// Satzenden, die zufällig auf das Wort "Satz" enden.

import { describe, it, expect } from 'vitest';
import { tokenize } from './satzTokenizer';

// ---------------------------------------------------------------------------
// Grundverhalten
// ---------------------------------------------------------------------------

describe('tokenize – Grundverhalten', () => {
  it('leerer String liefert leeres Array', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('reiner Whitespace-String (inkl. Zeilenumbruch) liefert leeres Array', () => {
    expect(tokenize('   \n  ')).toEqual([]);
  });

  it('Text ohne jedes Satzzeichen bleibt als einziger Satz erhalten', () => {
    expect(tokenize('Kein Satzzeichen am Ende')).toEqual(['Kein Satzzeichen am Ende']);
  });

  it('einfacher Zwei-Satz-Text wird korrekt getrennt', () => {
    expect(tokenize('Dies ist der erste Text. Dies ist der zweite Text.')).toEqual([
      'Dies ist der erste Text.',
      'Dies ist der zweite Text.',
    ]);
  });

  it('drei Sätze hintereinander', () => {
    expect(tokenize('Satz eins. Satz zwei. Satz drei.')).toEqual([
      'Satz eins.',
      'Satz zwei.',
      'Satz drei.',
    ]);
  });

  it('einzelner Satz am Textende ohne Folgetext bleibt unverändert', () => {
    expect(tokenize('Nur ein Text.')).toEqual(['Nur ein Text.']);
  });

  it('Text endet mit Satzzeichen + nachfolgendem Leerzeichen (kein Folgetext)', () => {
    expect(tokenize('Text eins. ')).toEqual(['Text eins.']);
  });
});

// ---------------------------------------------------------------------------
// Satzzeichen: . ! ?
// ---------------------------------------------------------------------------

describe('tokenize – Satzzeichen', () => {
  it('Ausrufezeichen trennt wie ein Punkt', () => {
    expect(tokenize('Achtung! Das ist wichtig.')).toEqual(['Achtung!', 'Das ist wichtig.']);
  });

  it('Fragezeichen trennt wie ein Punkt', () => {
    expect(tokenize('Wer haftet? Der Verkäufer.')).toEqual(['Wer haftet?', 'Der Verkäufer.']);
  });

  it('Edge-Case: "?!" kombiniert – Trennung erfolgt am zweiten Zeichen (Leerzeichen dahinter)', () => {
    expect(tokenize('Wirklich?! Kaum zu glauben.')).toEqual(['Wirklich?!', 'Kaum zu glauben.']);
  });

  it('Auslassungspunkte "..." trennen am letzten Punkt der Kette', () => {
    expect(tokenize('Ein Gedanke bricht ab... Der nächste beginnt.')).toEqual([
      'Ein Gedanke bricht ab...',
      'Der nächste beginnt.',
    ]);
  });

  it('kein Satzende ohne Leerzeichen nach dem Satzzeichen', () => {
    expect(tokenize('Dies ist Text eins.Dies ist Text zwei ohne Leerzeichen.')).toEqual([
      'Dies ist Text eins.Dies ist Text zwei ohne Leerzeichen.',
    ]);
  });

  it('kein Satzende, wenn auf das Leerzeichen ein Kleinbuchstabe folgt', () => {
    expect(tokenize('Das hier ist ein Test. das geht klein weiter.')).toEqual([
      'Das hier ist ein Test. das geht klein weiter.',
    ]);
  });

  it('Doppelpunkt und Semikolon lösen kein Satzende aus', () => {
    expect(tokenize('Erster Teil: es folgt mehr; und noch mehr.')).toEqual([
      'Erster Teil: es folgt mehr; und noch mehr.',
    ]);
  });

  it('Klammer als Satzanfang wird als Satzende-Trigger erkannt', () => {
    expect(tokenize('Der Vertrag gilt. (Wichtiger Hinweis) Weitere Regel folgt.')).toEqual([
      'Der Vertrag gilt.',
      '(Wichtiger Hinweis) Weitere Regel folgt.',
    ]);
  });

  it('Umlaut-Großbuchstabe als Satzanfang wird erkannt', () => {
    expect(tokenize('Text eins. Ähnlicher Text zwei.')).toEqual([
      'Text eins.',
      'Ähnlicher Text zwei.',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Abkürzungen (verhindern Satztrennung)
// ---------------------------------------------------------------------------

describe('tokenize – Abkürzungen', () => {
  it('juristische Abkürzung "Abs." verhindert Trennung an dieser Stelle', () => {
    expect(tokenize('Siehe Abs. 3 dieser Vorschrift. Weiterer Text.')).toEqual([
      'Siehe Abs. 3 dieser Vorschrift.',
      'Weiterer Text.',
    ]);
  });

  it('Kette mehrerer Abkürzungen hintereinander bleibt zusammen', () => {
    expect(tokenize('Vgl. Art. 5 Abs. 2. Weiterer Text.')).toEqual([
      'Vgl. Art. 5 Abs. 2. Weiterer Text.',
    ]);
  });

  it('Einzelbuchstaben-Kürzelkette "z. B." verhindert Trennung', () => {
    expect(tokenize('Das gilt z. B. für Fälle. Nächster Text.')).toEqual([
      'Das gilt z. B. für Fälle.',
      'Nächster Text.',
    ]);
  });

  it('führendes Klammer-Zeichen vor Abkürzung wird beim Abgleich ignoriert ("(BGBl.")', () => {
    expect(tokenize('(BGBl. I S. 1) Neuer Text.')).toEqual(['(BGBl. I S. 1) Neuer Text.']);
  });

  it('Regressionstest: das Wort "Satz" am echten Satzende trennt korrekt (früherer Listen-Eintrag entfernt)', () => {
    expect(tokenize('Dies ist ein Satz. Es folgt noch einer.')).toEqual([
      'Dies ist ein Satz.',
      'Es folgt noch einer.',
    ]);
  });

  it('Edge-Case: "Art" als normales deutsches Wort (nicht "Artikel") kollidiert ebenfalls mit der Abkürzungsliste', () => {
    expect(tokenize('Das ist die Art. Sie überzeugt mich.')).toEqual([
      'Das ist die Art. Sie überzeugt mich.',
    ]);
  });

  it('Bindestrich-Wort ohne Listentreffer wird normal getrennt', () => {
    expect(tokenize('Das ist rechts-konform. Weiter geht es.')).toEqual([
      'Das ist rechts-konform.',
      'Weiter geht es.',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Einzelbuchstaben
// ---------------------------------------------------------------------------

describe('tokenize – Einzelbuchstaben', () => {
  it.each([
    'Das gilt z. B. Bayern. Nächster Text.',
    'Das gilt z.B. Bayern. Nächster Text.',
    'Das gilt z.\u00A0B. Bayern. Nächster Text.',
  ])('Kette "z. B." vor Großbuchstabe trennt nicht: %s', (text) => {
    expect(tokenize(text)).toEqual([text.replace(' Nächster Text.', ''), 'Nächster Text.']);
  });

  it('Kette "d. h." vor Großbuchstabe trennt nicht', () => {
    expect(tokenize('Es gilt, d. h. Verträge bleiben. Weiter.')).toEqual([
      'Es gilt, d. h. Verträge bleiben.',
      'Weiter.',
    ]);
  });

  it('Kette "d.h." ohne Leerzeichen trennt nicht', () => {
    expect(tokenize('Es gilt, d.h. Verträge bleiben.')).toEqual([
      'Es gilt, d.h. Verträge bleiben.',
    ]);
  });

  it('unbekannte Kette "m. E." trennt an keiner Stelle', () => {
    expect(tokenize('Das ist m. E. Unsinn. Weiter.')).toEqual(['Das ist m. E. Unsinn.', 'Weiter.']);
  });

  it('dreiteilige Ketten "i. V. m." und "a. a. O." trennen nicht', () => {
    expect(tokenize('§ 1 i. V. m. Art. 2 a. a. O. Der Text.')).toEqual([
      '§ 1 i. V. m. Art. 2 a. a. O. Der Text.',
    ]);
  });

  it('Kette "u. U." am Zeilenende trennt nicht', () => {
    expect(tokenize('Das gilt u. U.\nNicht immer.')).toEqual(['Das gilt u. U.\nNicht immer.']);
  });

  it('einzelner Großbuchstabe als Initiale trennt nicht ("H. Office")', () => {
    expect(tokenize('Veröffentlicht von H. Office in London.')).toEqual([
      'Veröffentlicht von H. Office in London.',
    ]);
  });

  it('Großbuchstabe nach Gliederungsbezeichnung ist Satzende ("Anlage B.")', () => {
    expect(tokenize('Es gilt Anlage B. Der Rest entfällt.')).toEqual([
      'Es gilt Anlage B.',
      'Der Rest entfällt.',
    ]);
  });

  it('Großbuchstabe nach Gliederungsbezeichnung ist auch am Zeilenende Satzende', () => {
    expect(tokenize('Es gilt Teil C.\nDer Rest entfällt.')).toEqual([
      'Es gilt Teil C.',
      'Der Rest entfällt.',
    ]);
  });

  it('einzelner Kleinbuchstabe ist Satzende ("Buchstabe d.")', () => {
    expect(tokenize('Es gilt Nummer 2 Buchstabe d. Der Rest entfällt.')).toEqual([
      'Es gilt Nummer 2 Buchstabe d.',
      'Der Rest entfällt.',
    ]);
  });

  it('"f." (folgende) bleibt eigenständige Abkürzung', () => {
    expect(tokenize('Siehe § 5 f. Der Text geht weiter.')).toEqual([
      'Siehe § 5 f. Der Text geht weiter.',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Zahlen (Absatz-/Nummer-Angaben verhindern Satztrennung)
// ---------------------------------------------------------------------------

describe('tokenize – Zahlen', () => {
  it('einstellige Zahl direkt vor Punkt verhindert Trennung', () => {
    expect(tokenize('Die Frist beträgt 5. Der Vertrag endet dann.')).toEqual([
      'Die Frist beträgt 5. Der Vertrag endet dann.',
    ]);
  });

  it('mehrstellige Zahl direkt vor Punkt verhindert Trennung ebenso', () => {
    expect(tokenize('Die Frist beträgt 123. Der Vertrag endet dann.')).toEqual([
      'Die Frist beträgt 123. Der Vertrag endet dann.',
    ]);
  });

  it('Ordnungszahl-Datum ("1. Januar") trennt trotz Großbuchstabe danach nicht', () => {
    expect(tokenize('Es gilt ab dem 1. Januar tritt es in Kraft.')).toEqual([
      'Es gilt ab dem 1. Januar tritt es in Kraft.',
    ]);
  });

  it('Regressionstest laut Quellcode-Kommentar: Zahl nach führender Klammer "(6" bleibt als Zahl erkennbar', () => {
    // istAbkuerzungOderZahl() darf Ziffern beim Bereinigen NICHT abstreifen,
    // sonst würde "(6" zu "" und wäre nicht mehr als Zahl erkennbar (siehe
    // Kommentar in satzTokenizer.ts). Ohne den Fix würde hier fälschlich
    // getrennt.
    expect(tokenize('Siehe Absatz (6. Dort steht mehr.')).toEqual([
      'Siehe Absatz (6. Dort steht mehr.',
    ]);
  });

  it('Tausenderpunkt in einer Zahl "1.000" trennt nicht mitten im Wert', () => {
    expect(tokenize('Die Strafe beträgt 1.000 Euro. Das gilt sofort.')).toEqual([
      'Die Strafe beträgt 1.000 Euro.',
      'Das gilt sofort.',
    ]);
  });

  it('Edge-Case: Absatzbezeichnung mit Buchstaben-Suffix ("1a") ist KEINE reine Zahl -> wird normal getrennt', () => {
    // istAbkuerzungOderZahl() prüft /^\d+$/ auf den vollständigen
    // (bereinigten) String – "1a" besteht nicht nur aus Ziffern und gilt
    // daher weder als Zahl noch als Abkürzung.
    expect(tokenize('Siehe Nr. 1a. Weiter geht es.')).toEqual(['Siehe Nr. 1a.', 'Weiter geht es.']);
  });
});

// ---------------------------------------------------------------------------
// Zeilenumbrüche
// ---------------------------------------------------------------------------

describe('tokenize – Zeilenumbrüche', () => {
  it('Zeilenumbruch nach Satzende + Großbuchstabe danach trennt wie ein Leerzeichen', () => {
    expect(tokenize('Erster Text.\nZweiter Text.')).toEqual(['Erster Text.', 'Zweiter Text.']);
  });

  it('Zeilenumbruch nach Satzende + Kleinbuchstabe danach trennt NICHT', () => {
    expect(tokenize('Erster Text.\nkleiner geht weiter.')).toEqual([
      'Erster Text.\nkleiner geht weiter.',
    ]);
  });

  it('Zeilenumbruch ohne vorangehendes Satzzeichen trennt nicht', () => {
    expect(tokenize('Erster Teil\nzweiter Teil.')).toEqual(['Erster Teil\nzweiter Teil.']);
  });

  it('Zeilenumbruch nach einer als Zahl erkannten Nummer trennt nicht', () => {
    expect(tokenize('Nummer 6.\nNächste Zeile.')).toEqual(['Nummer 6.\nNächste Zeile.']);
  });

  it('mehrfacher Zeilenumbruch (Absatztrennung) wird wie ein einzelner behandelt, keine Leer-Einträge', () => {
    expect(tokenize('Erster Text.\n\nZweiter Text.')).toEqual(['Erster Text.', 'Zweiter Text.']);
  });

  it('Edge-Case: abschließender Zeilenumbruch wird bereits vor der Tokenisierung getrimmt', () => {
    // text.trim() entfernt am Anfang der Funktion jeglichen Whitespace
    // (inkl. \n) am Rand, sodass "bereinigt" nie mit einem Zeilenumbruch
    // endet – der spezielle "Zeilenumbruch am Textende ohne Satzanfang
    // danach"-Zweig im Loop ist dadurch über die öffentliche Funktion
    // praktisch nicht erreichbar.
    expect(tokenize('Letzter Text.\n')).toEqual(['Letzter Text.']);
  });

  it('Edge-Case: Windows-Zeilenende \\r\\n wird korrekt wie \\n behandelt (kein Rest-\\r im Ergebnis)', () => {
    expect(tokenize('Erster Text.\r\nZweiter Text.')).toEqual(['Erster Text.', 'Zweiter Text.']);
  });
});

// ---------------------------------------------------------------------------
// Whitespace-Sonderfälle
// ---------------------------------------------------------------------------

describe('tokenize – Whitespace-Sonderfälle', () => {
  it('mehrere aufeinanderfolgende Leerzeichen werden zu einem kollabiert', () => {
    expect(tokenize('Erster Text.    Zweiter Text.')).toEqual(['Erster Text.', 'Zweiter Text.']);
  });

  it('geschütztes Leerzeichen (U+00A0) wirkt wie ein normales Leerzeichen für die Trennung', () => {
    expect(tokenize('Erster Text.\u00A0Zweiter Text.')).toEqual(['Erster Text.', 'Zweiter Text.']);
  });

  it('zwei aufeinanderfolgende geschützte Leerzeichen (U+00A0) nach Satzzeichen lösen ebenfalls eine Trennung aus', () => {
    expect(tokenize('Erster Text.\u00A0\u00A0Zweiter Text.')).toEqual([
      'Erster Text.',
      'Zweiter Text.',
    ]);
  });

  it('Edge-Case: ein Tabulator direkt nach dem Satzzeichen löst KEINE Trennung aus (nur Space/NBSP/\\n zählen)', () => {
    expect(tokenize('Erster Text.\tZweiter Text.')).toEqual(['Erster Text.\tZweiter Text.']);
  });
});

// ---------------------------------------------------------------------------
// aktiv=false (Diagnose-Modus, siehe Funktionskommentar)
// ---------------------------------------------------------------------------

describe('tokenize – aktiv=false (Tokenisierung übersprungen)', () => {
  it('liefert den getrimmten Gesamttext als einzigen Eintrag', () => {
    expect(tokenize('Erster Text. Zweiter Text.  ', false)).toEqual(['Erster Text. Zweiter Text.']);
  });

  it('kollabiert trotz deaktivierter Tokenisierung weiterhin doppelte Leerzeichen', () => {
    // bereinigt = text.trim().replace(/ {2,}/g, ' ') läuft unabhängig vom
    // aktiv-Flag vor der Weiche.
    expect(tokenize('Erster  Text.', false)).toEqual(['Erster Text.']);
  });

  it('leerer String liefert weiterhin leeres Array, unabhängig vom aktiv-Flag', () => {
    expect(tokenize('', false)).toEqual([]);
  });
});
