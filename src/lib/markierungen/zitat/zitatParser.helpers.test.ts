// zitatParser.helpers.test.ts
//
// Tests für zitatParser.helpers.ts (kolokiert, Vitest). Die Funktionen
// arbeiten auf bereits tokenisierten Token-Arrays – die Tests nutzen daher
// bewusst tokenisiere() aus zitatParser.tokenizer.ts statt Token-Objekte von
// Hand zu bauen, damit die Fixtures immer realistische, tatsächlich
// erzeugbare Token-Konstellationen abbilden (analog zum Vorgehen in
// zitatParser.test.ts, das ebenfalls über echten Zitat-Text statt
// synthetischer Zwischenwerte testet).

import { describe, it, expect } from 'vitest';
import { tokenisiere } from './zitatParser.tokenizer';
import type { Token } from './zitatParser.tokenizer';
import {
  istZahlOderRoemischerAbsatz,
  hatWeiterenKandidatenImCluster,
  VERFEINERUNGS_EBENE,
  sammleVerfeinerungskette,
  fuehrendeSonstigeVerschieben,
  istOrdnungszahlVorAltVarGr,
  leseSymbolFolge,
  nachTrennern,
} from './zitatParser.helpers';

// ---------------------------------------------------------------------------
// istOrdnungszahlVorAltVarGr
// ---------------------------------------------------------------------------
//
// Bisher nur indirekt über zitatParser.test.ts abgedeckt (u.a. "812 1. Alt")
// – das deckt den positiven Fall (Ordnungszahl VOR Alt/Var/Gr/Hs) gut ab,
// aber weder das Fehlen eines naechstesToken noch einen naechstesToken mit
// anderer Zusatzart (Mutation-Testing-Analyse, mutanten 8/10/12). Da die
// Funktion als einzige gemeinsame Quelle von mehreren Stellen genutzt wird
// (siehe Kopfkommentar der Quelldatei), lohnt sich ein direkter Test ihres
// eigenen Vertrags unabhängig von den Aufrufern.

describe('istOrdnungszahlVorAltVarGr', () => {
  it('warOrdnungszahl=true, aber kein naechstesToken (Textende) -> false, kein Wurf', () => {
    expect(istOrdnungszahlVorAltVarGr(true, undefined)).toBe(false);
  });

  it('warOrdnungszahl=false -> false, unabhängig vom naechstesToken', () => {
    const alt = { art: 'zusatz', norm: 'alternative' } as unknown as Token;
    expect(istOrdnungszahlVorAltVarGr(false, alt)).toBe(false);
    expect(istOrdnungszahlVorAltVarGr(undefined, alt)).toBe(false);
  });

  it('naechstesToken ist kein zusatz-Token (art-Guard greift, auch bei zufällig passendem norm-Wert) -> false', () => {
    // Testet den eigenen art-Guard der Funktion unabhängig vom Tokenizer:
    // ein Token mit art !== 'zusatz' trägt laut Tokenizer-Vertrag nie einen
    // der vier Alt/Var/Gr/Hs-norm-Werte – dieser Fall ist daher künstlich,
    // dokumentiert aber, dass die Funktion sich nicht allein auf norm
    // verlässt, sondern den art-Guard tatsächlich prüft (mutant 8).
    const fake = { art: 'zahl', norm: 'alternative' } as unknown as Token;
    expect(istOrdnungszahlVorAltVarGr(true, fake)).toBe(false);
  });

  it.each(['absatz', 'unterabsatz', 'satz', 'nummer', 'litera'] as const)(
    'zusatz-Token mit norm=%s (nicht Alt/Var/Gr/Hs) -> false',
    (norm) => {
      const t = { art: 'zusatz', norm } as unknown as Token;
      expect(istOrdnungszahlVorAltVarGr(true, t)).toBe(false);
    },
  );

  it.each(['alternative', 'variante', 'gruppe', 'halbsatz'] as const)(
    'zusatz-Token mit norm=%s UND warOrdnungszahl=true -> true',
    (norm) => {
      const t = { art: 'zusatz', norm } as unknown as Token;
      expect(istOrdnungszahlVorAltVarGr(true, t)).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// leseSymbolFolge – liest seit 2026-08-27 AUSSCHLIESSLICH den expliziten
// "§ M"-Binnenparagraph (mit eigenem §-Token). Der vormalige zweite Zweig
// ("bloße Zahl direkt nach Symbol+Zahl ohne eigenes §", z.B. "229 6 Var 1")
// wurde entfernt (SSOT-Rücksprache): zitatParser.normgrenzen.ts
// (behandleZahlMitOffenerNorm) deckt diesen Fall bereits – und allgemeiner,
// auch ganz ohne führendes Symbol – ab. Der Test unten dokumentiert genau
// diesen neuen Vertrag: eine bloße zweite Zahl wird NICHT mehr konsumiert.
// ---------------------------------------------------------------------------

describe('leseSymbolFolge – expliziter "§ M"-Binnenparagraph-Zweig', () => {
  it('bloße Zahl direkt nach Symbol+Zahl (ohne eigenes §) wird NICHT konsumiert – das übernimmt der Zahlhandler separat', () => {
    const tokens = tokenisiere('Art. 229 6 Var. 1');
    const { teile, naechsterIndex } = leseSymbolFolge(tokens, 0);
    expect(teile).toEqual(['229']);
    expect(naechsterIndex).toBe(2); // Index der "6", nicht dahinter
  });

  it('zweites Symbol mit norm != "§" (z.B. erneutes "Art") wird NICHT als Binnenparagraph-Fortsetzung gelesen', () => {
    const tokens = tokenisiere('Art. 229 Art 5');
    const { teile, naechsterIndex } = leseSymbolFolge(tokens, 0);
    expect(teile).toEqual(['229']);
    expect(naechsterIndex).toBe(2); // Index des zweiten "Art"-Symbols, nicht dahinter
  });

  it('"§" am Textende (kein drittesToken) wird nicht als Binnenparagraph gelesen, kein Wurf', () => {
    const tokens = tokenisiere('Art. 229 §');
    const { teile, naechsterIndex } = leseSymbolFolge(tokens, 0);
    expect(teile).toEqual(['229']);
    expect(naechsterIndex).toBe(2);
  });

  it('"§" gefolgt von einem Wort statt einer Zahl wird nicht als Binnenparagraph gelesen', () => {
    const tokens = tokenisiere('Art. 229 § EGBGB');
    const { teile, naechsterIndex } = leseSymbolFolge(tokens, 0);
    expect(teile).toEqual(['229']);
    expect(naechsterIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// VERFEINERUNGS_EBENE
// ---------------------------------------------------------------------------

describe('VERFEINERUNGS_EBENE', () => {
  it('bildet die dokumentierte Reihenfolge absatz < unterabsatz < satz < nummer < litera ab', () => {
    expect(VERFEINERUNGS_EBENE.absatz).toBeLessThan(VERFEINERUNGS_EBENE.unterabsatz);
    expect(VERFEINERUNGS_EBENE.unterabsatz).toBeLessThan(VERFEINERUNGS_EBENE.satz);
    expect(VERFEINERUNGS_EBENE.satz).toBeLessThan(VERFEINERUNGS_EBENE.nummer);
    expect(VERFEINERUNGS_EBENE.nummer).toBeLessThan(VERFEINERUNGS_EBENE.litera);
  });
});

// ---------------------------------------------------------------------------
// sammleVerfeinerungskette
// ---------------------------------------------------------------------------

describe('sammleVerfeinerungskette', () => {
  it('sammelt eine einfache Zusatzwort+Zahl-Kette bis zum Textende', () => {
    const tokens = tokenisiere('Abs 1 Satz 2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([
      { art: 'absatz', wert: '1' },
      { art: 'satz', wert: '2' },
    ]);
  });

  it('bricht am nächsten Komma ab (nur bis dahin gehört zur Kette)', () => {
    const tokens = tokenisiere('Abs 1, 281');
    // "281" liegt hinter dem Komma und gehört NICHT mehr zur Kette dieses
    // Aufrufs (die Grenze für die Existenzprüfung ist ausschließlich das
    // Komma, siehe Kopfkommentar der Quelldatei).
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'absatz', wert: '1' }]);
  });

  it('bricht ebenso am nächsten Schrägstrich ab', () => {
    const tokens = tokenisiere('Abs 1/2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'absatz', wert: '1' }]);
  });

  it('überspringt dazwischenliegende sonstige-Wörter (z.B. "analog"), ohne die Kette abzubrechen', () => {
    const tokens = tokenisiere('analog Abs 1');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'absatz', wert: '1' }]);
  });

  it('römische Zahl als Absatz-Kurzform wird als einzelnes Kettenglied übernommen (Original-Zahl als Dezimalwert)', () => {
    const tokens = tokenisiere('III Nr 2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([
      { art: 'absatz', wert: '3' },
      { art: 'nummer', wert: '2' },
    ]);
  });

  it('Litera-Buchstabe (Token-Art "buchstabe") wird als gültiger Wert für ein Zusatzwort akzeptiert', () => {
    const tokens = tokenisiere('lit a');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'litera', wert: 'a' }]);
  });

  it('nicht-prüfbare Zusatzarten (Gr/Var/Hs/Alt) werden NICHT in die Kette aufgenommen', () => {
    const tokens = tokenisiere('Gr 2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([]);
  });

  it('UAbs (unterabsatz) wird als eigenes Kettenglied erkannt', () => {
    // Bisher wurde 'unterabsatz' nur in der VERFEINERUNGS_EBENE-Reihenfolge
    // geprüft, nie als tatsächlicher Token-Input (Mutation-Testing-Analyse,
    // mutanten 132/134).
    const tokens = tokenisiere('UAbs 2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'unterabsatz', wert: '2' }]);
  });

  it('bricht am Komma ab, selbst wenn DANACH ein eigentlich gültiges Zusatzwort+Wert-Paar folgen würde', () => {
    // Unterschied zum bereits vorhandenen Test 'bricht am nächsten Komma ab'
    // oben: dort folgt nach dem Komma nur eine bloße Zahl ohne Zusatzwort,
    // wodurch ein Wegfall der Abbruchbedingung selbst nicht auffällt
    // (Mutation-Testing-Analyse, mutanten 173/174/175/177/178/180). "Nr 2"
    // hier IST ein gültiges Paar und darf trotzdem nicht mit aufgenommen
    // werden.
    const tokens = tokenisiere('Abs 1, Nr 2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'absatz', wert: '1' }]);
  });

  it('bricht ebenso am Schrägstrich ab, selbst wenn danach ein gültiges Paar folgen würde', () => {
    const tokens = tokenisiere('Abs 1/Nr 2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'absatz', wert: '1' }]);
  });

  it('EDGE CASE: Zusatzwort ohne gültigen Wert direkt danach (z.B. gefolgt von einem weiteren Zusatzwort statt Zahl/Buchstabe) wird selbst NICHT aufgenommen – der Scan läuft aber weiter und sammelt ein nachfolgendes gültiges Paar', () => {
    // "Abs Satz 2": auf "Abs" folgt "Satz" (kein zahl/buchstabe) – "Abs"
    // bleibt also ohne Wert und wird übersprungen; "Satz 2" danach ist ein
    // gültiges Paar und wird gesammelt. Das ist ein Grenzfall der Aufrufer
    // (parseZitat) in der Praxis so nicht erzeugt (echte Freitexte haben
    // zwischen zwei Zusatzwörtern normalerweise einen Wert) – ich bin mir
    // hier nicht 100%ig sicher, ob dieses Verhalten so beabsichtigt ist oder
    // nur ein Nebenprodukt der Implementierung; der Test dokumentiert
    // jedenfalls den IST-Zustand. Bitte kurz bestätigen, falls das
    // überraschend ist.
    const tokens = tokenisiere('Abs Satz 2');
    expect(sammleVerfeinerungskette(tokens, 0)).toEqual([{ art: 'satz', wert: '2' }]);
  });

  it('startIndex jenseits des Token-Arrays liefert eine leere Kette', () => {
    const tokens = tokenisiere('Abs 1');
    expect(sammleVerfeinerungskette(tokens, 99)).toEqual([]);
  });

  it('leeres Token-Array liefert eine leere Kette', () => {
    expect(sammleVerfeinerungskette([], 0)).toEqual([]);
  });

  it('startIndex mitten in der Kette: nur ab dort wird gesammelt', () => {
    const tokens = tokenisiere('Abs 1 Satz 2');
    // Index 2 ist bereits "Satz" (0:"Abs", 1:"1", 2:"Satz", 3:"2").
    expect(sammleVerfeinerungskette(tokens, 2)).toEqual([{ art: 'satz', wert: '2' }]);
  });
});

// ---------------------------------------------------------------------------
// fuehrendeSonstigeVerschieben
// ---------------------------------------------------------------------------

describe('fuehrendeSonstigeVerschieben', () => {
  it('zieht den Textbereich-Start über ein unmittelbar davorstehendes sonstige-Wort zurück ("vgl § 280")', () => {
    const tokens = tokenisiere('vgl § 280');
    const symbolIndex = tokens.findIndex((t) => t.art === 'symbol');
    const start = fuehrendeSonstigeVerschieben(tokens, symbolIndex, tokens[symbolIndex]!.start);
    expect(start).toBe(0); // Start von "vgl", nicht von "§"
  });

  it('zieht über MEHRERE unmittelbar aneinandergereihte sonstige-Wörter zurück ("analog vgl § 1")', () => {
    const tokens = tokenisiere('analog vgl § 1');
    const symbolIndex = tokens.findIndex((t) => t.art === 'symbol');
    const start = fuehrendeSonstigeVerschieben(tokens, symbolIndex, tokens[symbolIndex]!.start);
    expect(start).toBe(0); // Start von "analog", dem ersten der beiden Wörter
  });

  it('bricht bei einem Komma direkt davor ab ("..., vgl, § 280" – Komma ist kein sonstige-Token)', () => {
    const tokens = tokenisiere('x, vgl, § 280');
    const symbolIndex = tokens.findIndex((t) => t.art === 'symbol');
    const start = fuehrendeSonstigeVerschieben(tokens, symbolIndex, tokens[symbolIndex]!.start);
    // Das Komma VOR "§" stoppt den Rückwärtslauf sofort – "vgl" bleibt
    // dadurch textlich bei der VORHERGEHENDEN Norm, siehe Kopfkommentar der
    // Quelldatei ("bezieht sich dann auf die VORHERGEHENDE Norm").
    expect(start).toBe(tokens[symbolIndex]!.start);
  });

  it('bleibt unverändert, wenn direkt davor gar kein sonstige-Token steht', () => {
    const tokens = tokenisiere('280, 281');
    const start = fuehrendeSonstigeVerschieben(tokens, 2, tokens[2]!.start);
    expect(start).toBe(tokens[2]!.start);
  });

  it('ti=0 (kein Vorgänger-Token vorhanden): gibt startOffset unverändert zurück', () => {
    const tokens = tokenisiere('§ 280');
    const start = fuehrendeSonstigeVerschieben(tokens, 0, tokens[0]!.start);
    expect(start).toBe(tokens[0]!.start);
  });

  it('leeres Token-Array gibt startOffset unverändert zurück', () => {
    expect(fuehrendeSonstigeVerschieben([], 0, 5)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// istZahlOderRoemischerAbsatz
// ---------------------------------------------------------------------------

describe('istZahlOderRoemischerAbsatz', () => {
  it('true für ein zahl-Token', () => {
    expect(istZahlOderRoemischerAbsatz(tokenisiere('280')[0])).toBe(true);
  });

  it('true für ein zusatz/absatz-Token MIT roemischWert', () => {
    expect(istZahlOderRoemischerAbsatz(tokenisiere('III')[0])).toBe(true);
  });

  it('false für ein zusatz/absatz-Token OHNE roemischWert (normales "Abs")', () => {
    expect(istZahlOderRoemischerAbsatz(tokenisiere('Abs 1')[0])).toBe(false);
  });

  it('false für andere Tokenarten (symbol, komma, wort)', () => {
    expect(istZahlOderRoemischerAbsatz(tokenisiere('§')[0])).toBe(false);
    expect(istZahlOderRoemischerAbsatz(tokenisiere(',')[0])).toBe(false);
    expect(istZahlOderRoemischerAbsatz(tokenisiere('ZPO')[0])).toBe(false);
  });

  it('false für undefined (kein Token vorhanden)', () => {
    expect(istZahlOderRoemischerAbsatz(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hatWeiterenKandidatenImCluster
// ---------------------------------------------------------------------------

describe('hatWeiterenKandidatenImCluster', () => {
  it('true, wenn im Cluster noch mindestens ein weiterer Komma-Kandidat folgt', () => {
    const tokens = tokenisiere('§§ 280 Abs 1, 2, 3');
    // ab Index 4 (direkt hinter dem Wert-Token der "1"): ", 2" und ", 3"
    // sind beides gültige Kandidaten.
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(true);
  });

  it('true auch, wenn nur noch GENAU EIN weiterer Kandidat folgt (das aktuell letzte Element im Cluster)', () => {
    const tokens = tokenisiere('§§ 280 Abs 1, 2');
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(true);
  });

  it('false, sobald ein Semikolon erreicht wird, BEVOR ein Kandidat gefunden wurde (Cluster-Ende)', () => {
    const tokens = tokenisiere('§§ 280 Abs 1; 2');
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(false);
  });

  it('false, sobald ein neues §/§§/Art-Symbol erreicht wird, BEVOR ein Kandidat gefunden wurde (neues Cluster)', () => {
    const tokens = tokenisiere('§ 280 Abs 1 § 4');
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(false);
  });

  it('Komma gefolgt von einem NICHT-Kandidaten (z.B. Zusatzwort "S") bricht die Suche nicht ab, sondern läuft weiter', () => {
    const tokens = tokenisiere('280 Abs 1, S 2, 3');
    // Erstes Komma (Index 3) führt zu "S" (kein zahl/römisch-Kandidat) –
    // die Suche muss trotzdem bis zum zweiten Komma weiterlaufen und dort
    // "3" als Kandidaten finden.
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(true);
  });

  it('Schrägstrich verhält sich wie Komma (ebenfalls weiche Grenze für Kandidatensuche)', () => {
    const tokens = tokenisiere('§§ 280 Abs 1/2');
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(true);
  });

  it('false, wenn das Textende ohne weiteren Kandidaten erreicht wird', () => {
    const tokens = tokenisiere('§ 280 Abs 1');
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(false);
  });

  it('false bei leerem Token-Array bzw. abIndex jenseits des Endes', () => {
    expect(hatWeiterenKandidatenImCluster([], 0)).toBe(false);
    const tokens = tokenisiere('§ 280 Abs 1');
    expect(hatWeiterenKandidatenImCluster(tokens, 999)).toBe(false);
  });

  it('Semikolon beendet die Suche auch dann, wenn IM NEUEN Cluster danach noch ein Komma-Kandidat folgt (Grenze gilt unabhängig davon, was danach kommt)', () => {
    const tokens = tokenisiere('§§ 280 Abs 1; 2, 3');
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(false);
  });

  it('ein neues §/§§/Art-Symbol beendet die Suche auch dann, wenn danach noch ein Komma-Kandidat folgt', () => {
    const tokens = tokenisiere('§ 280 Abs 1 § 4, 5');
    expect(hatWeiterenKandidatenImCluster(tokens, 4)).toBe(false);
  });

  it('ein Komma OHNE weiteren Kandidaten im restlichen Cluster liefert false – nicht schon "irgendein Komma gefunden" reicht', () => {
    const tokens = tokenisiere('280 Abs 1, S 2');
    expect(hatWeiterenKandidatenImCluster(tokens, 3)).toBe(false);
  });

  it('geprüft wird der Token NACH einem komma/schraegstrich-Token, nicht davor – ein Zusatzwort mit vorangehender Zahl aber nachfolgendem Nicht-Kandidaten ist selbst kein Treffer', () => {
    const tokens = tokenisiere('§§ 280 Abs 1 2');
    expect(hatWeiterenKandidatenImCluster(tokens, 2)).toBe(false);
  });
});

describe('nachTrennern', () => {
  it.each([
    [',, 2', 0, 2],
    ['// 2', 0, 2],
    [',/,/ 2', 0, 4],
    ['1 ,/ 2', 1, 3],
    [',/; 2', 0, 2],
    [',/', 0, 2],
    ['2, 3', 0, 0],
  ] as const)('überspringt nur die Trenner ab dem Start: %s', (text, start, ende) => {
    expect(nachTrennern(tokenisiere(text), start)).toBe(ende);
  });

  it('bleibt am Ende eines leeren Tokenbestands', () => {
    expect(nachTrennern([], 0)).toBe(0);
  });
});
