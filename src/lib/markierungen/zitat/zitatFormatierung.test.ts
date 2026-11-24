// zitatFormatierung.test.ts
//
// Tests für zitatFormatierung.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// Formatierungslogik – Textpfad-Fixtures werden von Hand gebaut (keine echten
// XML-Dateien nötig, analog zu normStrukturPruefung.test.ts).
//
// War bisher nur indirekt über zwei Fälle in
// gesetzesXMLParser.eintragsKette.test.ts abgedeckt (dort Fokus auf die
// Nummer/Litera-Ketten-Disambiguierung, nicht auf formatiereZitat als
// Ganzes) – diese Datei deckt formatiereZitat eigenständig und umfassend ab:
// alle Bausteine einzeln, ihre Reihenfolge, die drei Einstellungs-Optionen
// (abkuerzungenAktiv/ohnePunkt/roemischeAbsaetze) sowie die dokumentierten
// Sonderregeln (satzOhneWort nach römischer Absatzzahl, Nr./lit.-Verschmelzung,
// Titel/Bezeichnungsfeld-Kurzschluss).

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, it, expect } from 'vitest';
import {
  formatiereZitat,
  formatiereFundstelle,
  type ZitatEinstellungenWerte,
} from './zitatFormatierung';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';

const STANDARD: ZitatEinstellungenWerte = {
  abkuerzungenAktiv: true,
  ohnePunkt: false,
  roemischeAbsaetze: false,
};

// ---------------------------------------------------------------------------
// Grundgerüst: Norm-Bezeichnung + Gesetz, ohne jede Verfeinerung
// ---------------------------------------------------------------------------

describe('Grundgerüst (kein Absatz/Satz/Nummer)', () => {
  it('gibt bei leerem Textpfad nur Norm-Bezeichnung und Gesetz zurück', () => {
    expect(formatiereZitat('§ 433', 'BGB', normtextPfad({}), STANDARD)).toBe('§ 433 BGB');
  });

  it('Gesetz-Kurztitel wird IMMER angehängt (Absprache), auch wenn leer (dokumentiertes Randverhalten: führt zu Leerzeichen am Ende)', () => {
    // gesetzKurztitel sollte laut Kopfkommentar praktisch nie leer
    // sein ("Gesetz wird IMMER angehängt") – hier wird nur das technische
    // join(' ')-Verhalten für diesen (im Aufrufer eigentlich
    // ausgeschlossenen) Randfall dokumentiert.
    expect(formatiereZitat('§ 433', '', normtextPfad({ absatz: '(1)' }), STANDARD)).toBe(
      '§ 433 Abs. 1 ',
    );
  });
});

// ---------------------------------------------------------------------------
// Absatz + Einstellungs-Optionen (abkuerzungenAktiv/ohnePunkt)
// ---------------------------------------------------------------------------

describe('Absatz', () => {
  it('mit Abkürzung und Punkt (Standard)', () => {
    expect(formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(1)' }), STANDARD)).toBe(
      '§ 433 Abs. 1 BGB',
    );
  });

  it('ausgeschrieben, wenn abkuerzungenAktiv=false ("Absatz" statt "Abs.")', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(1)' }), {
        ...STANDARD,
        abkuerzungenAktiv: false,
      }),
    ).toBe('§ 433 Absatz 1 BGB');
  });

  it('ohne Punkt, wenn ohnePunkt=true ("Abs" statt "Abs.")', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(1)' }), {
        ...STANDARD,
        ohnePunkt: true,
      }),
    ).toBe('§ 433 Abs 1 BGB');
  });

  it('ohnePunkt ist bei abkuerzungenAktiv=false wirkungslos (lang bleibt lang)', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(1)' }), {
        abkuerzungenAktiv: false,
        ohnePunkt: true,
        roemischeAbsaetze: false,
      }),
    ).toBe('§ 433 Absatz 1 BGB');
  });

  it('bereinigt den Roh-Wert um Klammern ("(1)" → "1")', () => {
    expect(formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(1)' }), STANDARD)).toContain(
      'Abs. 1 ',
    );
  });

  it('EDGE CASE: Klammer, die NICHT am Anfang/Ende steht, bleibt unangetastet (Regex ist bewusst nur auf Rand-Klammern verankert, nicht auf jede Klammer im String)', () => {
    // Synthetischer Fall – bei echten Absatz-Rohwerten aus der XML kommt nur
    // je eine Rand-Klammer vor ("(1)"), nie eine mittendrin. Ohne diesen Test
    // überlebten beim Mutation-Testing zwei Regex-Mutanten unbemerkt: beide
    // entfernten jeweils eines der Anker-Zeichen (^ bzw. $) aus
    // bereinigt()s Regex, wodurch JEDE Klammer im String getroffen worden
    // wäre statt nur die am Rand – kein bestehender Testfall enthielt eine
    // nicht-randständige Klammer, um das zu bemerken.
    expect(formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: 'x(1)y' }), STANDARD)).toBe(
      '§ 433 Abs. x(1)y BGB',
    );
  });
});

// ---------------------------------------------------------------------------
// roemischeAbsaetze + satzOhneWort-Sonderregel
// ---------------------------------------------------------------------------

describe('roemischeAbsaetze (nur relevant zusammen mit abkuerzungenAktiv)', () => {
  it('formatiert Absatz als römische Zahl statt Dezimalzahl', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(3)' }), {
        ...STANDARD,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 III BGB');
  });

  it('hängt einen Buchstaben-Suffix unverändert an die römische Zahl an ("1a" → "Ia")', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(1a)' }), {
        ...STANDARD,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 Ia BGB');
  });

  it('EDGE CASE: unerwartetes Absatz-Format (kein führendes Ziffern-Segment) wird unverändert durchgereicht statt zu werfen (Best-effort)', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: 'abc' }), {
        ...STANDARD,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 abc BGB');
  });

  it('funktioniert auch für MEHRSTELLIGE Absatzzahlen (Regressionstest, Mutation-Testing-Fund: Ziffernfolge darf nicht nur einstellig geprüft werden)', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(10)' }), {
        ...STANDARD,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 X BGB');
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(12a)' }), {
        ...STANDARD,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 XIIa BGB');
  });

  it('roemischeAbsaetze ist bei abkuerzungenAktiv=false wirkungslos (fällt auf "Absatz N" zurück, KEIN Fehler)', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(3)' }), {
        abkuerzungenAktiv: false,
        ohnePunkt: false,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 Absatz 3 BGB');
  });

  it('Sonderregel satzOhneWort: Satz UNMITTELBAR nach römischer Absatzzahl (kein Unterabsatz dazwischen) erscheint OHNE "S."-Wort', () => {
    // Dokumentierte Zitierkonvention (Absprache Punkt 5.3.2), z.B. "§ 433
    // III 2" statt "§ 433 III S. 2".
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(3)', satz: 2 }), {
        ...STANDARD,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 III 2 BGB');
  });

  it('Sonderregel gilt NICHT bei nicht-römischer Absatzzahl (Satz behält "S."-Wort)', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(3)', satz: 2 }), STANDARD),
    ).toBe('§ 433 Abs. 3 S. 2 BGB');
  });

  it('EDGE CASE: ein dazwischenliegender Unterabsatz setzt die Sonderregel zurück – Satz bekommt wieder "S."', () => {
    expect(
      formatiereZitat(
        '§ 433',
        'BGB',
        normtextPfad({ absatz: '(3)', unterabsatz: '[2]', satz: 1 }),
        { ...STANDARD, roemischeAbsaetze: true },
      ),
    ).toBe('§ 433 III UAbs. 2 S. 1 BGB');
  });
});

// ---------------------------------------------------------------------------
// Unterabsatz
// ---------------------------------------------------------------------------

describe('Unterabsatz', () => {
  it('wird zwischen Absatz und Satz eingehängt', () => {
    expect(
      formatiereZitat(
        '§ 6',
        'EUV',
        normtextPfad({ absatz: '(1)', unterabsatz: '[2]', satz: 1 }),
        STANDARD,
      ),
    ).toBe('§ 6 Abs. 1 UAbs. 2 S. 1 EUV');
  });

  it('kann auch ohne vorangehenden Absatz stehen', () => {
    expect(formatiereZitat('§ 6', 'EUV', normtextPfad({ unterabsatz: '[2]' }), STANDARD)).toBe(
      '§ 6 UAbs. 2 EUV',
    );
  });

  it('ausgeschrieben, wenn abkuerzungenAktiv=false ("Unterabsatz" statt "UAbs.")', () => {
    expect(
      formatiereZitat('§ 6', 'EUV', normtextPfad({ absatz: '(1)', unterabsatz: '[2]' }), {
        ...STANDARD,
        abkuerzungenAktiv: false,
      }),
    ).toBe('§ 6 Absatz 1 Unterabsatz 2 EUV');
  });
});

// ---------------------------------------------------------------------------
// Satz (top-level, unabhängig von der Eintrags-Kette – siehe satzInEintrag
// weiter unten für "Nr. 1 Satz 2")
// ---------------------------------------------------------------------------

describe('Satz', () => {
  it('mit Abkürzung und Punkt (Standard)', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(3)', satz: 2 }), STANDARD),
    ).toBe('§ 433 Abs. 3 S. 2 BGB');
  });

  it('ausgeschrieben, wenn abkuerzungenAktiv=false ("Satz" statt "S.") – NICHT zu verwechseln mit der satzOhneWort-Sonderregel bei römischen Absätzen', () => {
    expect(
      formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: '(3)', satz: 2 }), {
        ...STANDARD,
        abkuerzungenAktiv: false,
      }),
    ).toBe('§ 433 Absatz 3 Satz 2 BGB');
  });
});

// ---------------------------------------------------------------------------
// Eintrags-Kette (Nummer/Litera, beliebig tief) – Verschmelzungsregel
// ---------------------------------------------------------------------------

describe('Eintrags-Kette (Nummer/Litera)', () => {
  it('einzelne Nummer ohne Verschmelzung', () => {
    const pfad: Textpfad = normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }] });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 Nr. 1 BGB');
  });

  it('einzelne Nummer ausgeschrieben ("Nummer" statt "Nr.")', () => {
    const pfad: Textpfad = normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }] });
    expect(formatiereZitat('§ 433', 'BGB', pfad, { ...STANDARD, abkuerzungenAktiv: false })).toBe(
      '§ 433 Nummer 1 BGB',
    );
  });

  it('eine litera, die DIREKT auf eine nummer folgt, wird verschmolzen ("Nr. 1a" statt "Nr. 1 lit. a")', () => {
    const pfad: Textpfad = normtextPfad({
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'litera', bezeichnung: 'a)' },
      ],
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 Nr. 1a BGB');
  });

  it('eine litera OHNE direkt vorangehende nummer bleibt eigenes "lit."-Token', () => {
    const pfad: Textpfad = normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a)' }] });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 lit. a BGB');
  });

  it('eine litera OHNE direkt vorangehende nummer, ausgeschrieben ("litera" statt "lit.")', () => {
    const pfad: Textpfad = normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a)' }] });
    expect(formatiereZitat('§ 433', 'BGB', pfad, { ...STANDARD, abkuerzungenAktiv: false })).toBe(
      '§ 433 litera a BGB',
    );
  });

  it('eine ZWEITE, tiefer verschachtelte litera (nach litera, nicht nach nummer) verschmilzt NICHT zusätzlich, sondern wird als eigenes "lit."-Token angehängt ("Nr. 1a lit. aa")', () => {
    const pfad: Textpfad = normtextPfad({
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'litera', bezeichnung: 'a)' },
        { ebene: 'litera', bezeichnung: 'aa)' },
      ],
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 Nr. 1a lit. aa BGB');
  });

  it('EDGE CASE: zwei aufeinanderfolgende nummer-Schritte verschmelzen NICHT (Verschmelzungsregel gilt nur litera-nach-nummer)', () => {
    const pfad: Textpfad = normtextPfad({
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'nummer', bezeichnung: '2.' },
      ],
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 Nr. 1 Nr. 2 BGB');
  });

  it('EDGE CASE: nummer nach litera (umgekehrte Reihenfolge) verschmilzt ebenfalls NICHT (Regel ist gerichtet: nur litera-nach-nummer)', () => {
    const pfad: Textpfad = normtextPfad({
      eintraege: [
        { ebene: 'litera', bezeichnung: 'a)' },
        { ebene: 'nummer', bezeichnung: '1.' },
      ],
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 lit. a Nr. 1 BGB');
  });

  it('bereinigt Nummer-/Litera-Rohwerte um Punkt/Klammer ("1." → "1", "a)" → "a")', () => {
    // Gezielt der bereinigte NUMMER-/LITERA-Wert wird geprüft (nicht der
    // Gesamt-String – "Nr."/"lit." als Abkürzungswort selbst enthält
    // erwartungsgemäß weiterhin einen Punkt).
    const pfad: Textpfad = normtextPfad({
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'litera', bezeichnung: 'a)' },
      ],
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 Nr. 1a BGB');
  });

  it('EDGE CASE: MEHRERE trailing Satzzeichen werden vollständig entfernt, nicht nur eins ("1..)" → "1")', () => {
    // Synthetischer Fall wie beim Klammer-Randfall oben – deckt ab, dass
    // die zweite bereinigt()-Regex (/[.)]+$/) wirklich GIERIG die gesamte
    // Rand-Sequenz aus Punkten/Klammern entfernt (das '+') und nicht nur das
    // letzte Zeichen. Ohne diesen Test überlebte beim Mutation-Testing ein
    // dritter Regex-Mutant unbemerkt, der genau das '+' entfernte – kein
    // bestehender Testfall hatte einen Rohwert mit mehr als einem
    // trailing Satzzeichen NACH der ersten (Klammer-)Bereinigung.
    const pfad: Textpfad = normtextPfad({
      eintraege: [{ ebene: 'nummer', bezeichnung: '1..)' }],
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 Nr. 1 BGB');
  });

  it('Normtext ohne Eintragskette hat keine Eintragsangabe', () => {
    expect(formatiereZitat('§ 433', 'BGB', normtextPfad({}), STANDARD)).toBe('§ 433 BGB');
  });
});

// ---------------------------------------------------------------------------
// satzInEintrag ("Nr. 1 Satz 2") – unabhängig von satzOhneWort
// ---------------------------------------------------------------------------

describe('satzInEintrag', () => {
  it('wird nach der Eintrags-Kette angehängt, immer MIT "S."-Wort', () => {
    const pfad: Textpfad = normtextPfad({
      eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
      satzInEintrag: 2,
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 Nr. 1 S. 2 BGB');
  });

  it('EDGE CASE: behält "S." auch dann, wenn zuvor eine römische Absatzzahl satzOhneWort aktiviert hat (die Sonderregel gilt NUR für `satz`, nicht für `satzInEintrag`)', () => {
    const pfad: Textpfad = normtextPfad({
      absatz: '(3)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
      satzInEintrag: 2,
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, { ...STANDARD, roemischeAbsaetze: true })).toBe(
      '§ 433 III Nr. 1 S. 2 BGB',
    );
  });

  it('ausgeschrieben, wenn abkuerzungenAktiv=false', () => {
    const pfad: Textpfad = normtextPfad({
      eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
      satzInEintrag: 2,
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, { ...STANDARD, abkuerzungenAktiv: false })).toBe(
      '§ 433 Nummer 1 Satz 2 BGB',
    );
  });
});

// ---------------------------------------------------------------------------
// Titel/Bezeichnungsfeld: atomarer Kurzschluss (ignoriert alle übrigen Felder)
// ---------------------------------------------------------------------------

describe('Titel/Bezeichnungsfeld (atomar, keine weitere Verfeinerung)', () => {
  it('titel=true ignoriert Absatz/Eintrags-Kette vollständig', () => {
    const pfad: Textpfad = bereichPfad('amtlicherTitel');
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 BGB');
  });

  it('bereich=bezeichnung ignoriert Absatz/Eintrags-Kette ebenso vollständig', () => {
    const pfad: Textpfad = bereichPfad('bezeichnung');
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe('§ 433 BGB');
  });
});

// ---------------------------------------------------------------------------
// Vollständige Integrationsfälle (alle Bausteine in dokumentierter Reihenfolge)
// ---------------------------------------------------------------------------

describe('vollständige Zitate (Reihenfolge aller Bausteine)', () => {
  it('Absatz → Unterabsatz → Satz → Nummer+Litera (verschmolzen) → Satz-in-Eintrag → Gesetz', () => {
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      unterabsatz: '[2]',
      satz: 1,
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'litera', bezeichnung: 'a)' },
      ],
      satzInEintrag: 2,
    });
    expect(formatiereZitat('§ 433', 'BGB', pfad, STANDARD)).toBe(
      '§ 433 Abs. 1 UAbs. 2 S. 1 Nr. 1a S. 2 BGB',
    );
  });

  it('dieselbe Kette mit römischen Absätzen und ohne Punkt', () => {
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'litera', bezeichnung: 'a)' },
      ],
    });
    expect(
      formatiereZitat('§ 433', 'BGB', pfad, {
        abkuerzungenAktiv: true,
        ohnePunkt: true,
        roemischeAbsaetze: true,
      }),
    ).toBe('§ 433 I Nr 1a BGB');
  });

  it('reale Fixtur aus gesetzesXMLParser.eintragsKette.test.ts: "aa)" unter unterschiedlichen Nummern bleibt über die Kette unterscheidbar', () => {
    const pfadUnter1: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'litera', bezeichnung: 'a)' },
        { ebene: 'litera', bezeichnung: 'aa)' },
      ],
    });
    const pfadUnter2: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [
        { ebene: 'nummer', bezeichnung: '2.' },
        { ebene: 'litera', bezeichnung: 'a)' },
        { ebene: 'litera', bezeichnung: 'aa)' },
      ],
    });
    expect(formatiereZitat('§ 1', 'TestG', pfadUnter1, STANDARD)).toBe(
      '§ 1 Abs. 1 Nr. 1a lit. aa TestG',
    );
    expect(formatiereZitat('§ 1', 'TestG', pfadUnter2, STANDARD)).toBe(
      '§ 1 Abs. 1 Nr. 2a lit. aa TestG',
    );
  });
});

describe('Fundstelle ohne Norm und Gesetz', () => {
  it.each<[Textpfad, string]>([
    [normtextPfad({ absatz: '(1)', satz: 1 }), 'Abs. 1 S. 1'],
    [normtextPfad({ absatz: '(1)', unterabsatz: '[2]', satz: 1 }), 'Abs. 1 UAbs. 2 S. 1'],
    [
      normtextPfad({
        absatz: '(2)',
        satz: 1,
        eintraege: [
          { ebene: 'nummer', bezeichnung: '3.' },
          { ebene: 'litera', bezeichnung: 'a)' },
        ],
        satzInEintrag: 2,
      }),
      'Abs. 2 S. 1 Nr. 3a S. 2',
    ],
    [
      normtextPfad({
        eintraege: [
          { ebene: 'nummer', bezeichnung: '1.' },
          { ebene: 'litera', bezeichnung: 'a)' },
          { ebene: 'litera', bezeichnung: 'aa)' },
        ],
      }),
      'Nr. 1a lit. aa',
    ],
    [bereichPfad('amtlicherTitel'), ''],
    [normtextPfad({}), ''],
  ])('%j ergibt %s', (pfad, erwartet) => {
    expect(formatiereFundstelle(pfad, STANDARD)).toBe(erwartet);
  });
});
