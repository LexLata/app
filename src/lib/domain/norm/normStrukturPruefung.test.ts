// normStrukturPruefung.test.ts
//
// Tests für normStrukturPruefung.ts (kolokiert, Vitest). Baut eine kleine,
// synthetische NormDarstellung von Hand auf (keine echten XML-Dateien nötig,
// da die geprüften Funktionen ausschließlich auf dem bereits geparsten
// Laufzeitmodell arbeiten, siehe Kopfkommentar der geprüften Datei) und
// deckt sowohl die normweit-flache Suche (kein Kontext) als auch die
// hierarchisch gescopte Suche (mit ZusatzKontext) ab – inkl. der
// dokumentierten Edge-Cases (Absatz/Nummer mit Buchstaben-Suffix wie "1a",
// Unterabsätze, Satz ohne explizites <satz>-Tag, Litera-Case-Insensitivität,
// nicht auffindbarer Kontext-Absatz/-Satz).

import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import { pruefeZusatzangabe, pruefeZusatzangabeMitKette } from './normStrukturPruefung';
import type {
  AbsatzDarstellung,
  ListenEintragDarstellung,
  ListenEintragEbene,
  NormDarstellung,
  SatzDarstellung,
  UnterabsatzDarstellung,
} from '@/lib/domain/gesetzTypes';

// ---------------------------------------------------------------------------
// Kompakte Test-Factories – bewusst nur die für die Prüfung relevanten
// Felder gesetzt, id-Werte beliebig (ephemer, siehe Projekt-Konventionen).
// ---------------------------------------------------------------------------

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function eintrag(
  bezeichnung: string,
  ebene: ListenEintragEbene = 'nummer',
  untereintraege: ListenEintragDarstellung[] = [],
  saetze?: SatzDarstellung[],
): ListenEintragDarstellung {
  return { id: naechsteId(), bezeichnung, ebene, text: bezeichnung, untereintraege, saetze };
}

function satz(
  zahl: number | undefined,
  eintraege: ListenEintragDarstellung[] = [],
): SatzDarstellung {
  return { id: naechsteId(), zahl, text: `Satz ${zahl ?? '-'}`, eintraege };
}

function unterabsatz(bezeichnung: string, saetze: SatzDarstellung[]): UnterabsatzDarstellung {
  return { id: naechsteId(), bezeichnung, saetze };
}

function absatz(
  bezeichnung: string | undefined,
  saetze: SatzDarstellung[] = [],
  unterabsaetze?: UnterabsatzDarstellung[],
): AbsatzDarstellung {
  return { id: naechsteId(), bezeichnung, saetze: unterabsaetze ? [] : saetze, unterabsaetze };
}

function norm(absaetze: AbsatzDarstellung[]): NormDarstellung {
  return normaleNorm({ id: naechsteId(), xmlId: naechsteId(), bezeichnung: '§ 1', absaetze });
}

// ---------------------------------------------------------------------------
// Testnorm, angelehnt an einen realistischen Aufbau mit den dokumentierten
// Edge-Cases:
//
// (1)   Satz 1: Nr. 1, Nr. 2 (mit lit. a, lit. b)
// (1a)  Satz ohne explizites <satz>-Tag (zahl === undefined), keine Einträge
// (2)   Satz 1, Satz 2: Nr. 1 (mit lit. a)
// (3)   in Unterabsätze gegliedert:
//         UAbs. 1: Satz 1: Nr. 1
//         UAbs. 2: Satz 1 (leer), Satz 2: Nr. 1a (Nummer mit Buchstaben-Suffix)
// (4)   Satz 1: Nr. 1, welche SELBST in weitere Sätze mit eigener Litera
//         gegliedert ist (Nr. 1 Satz 1: lit x, Satz 2: lit y) – deckt die
//         verschachtelte saetze-Rekursion in sammleAlleSaetzeAusEintraegen/
//         sammleAlleEintraege sowie pruefeLiteras eigene
//         nummerEintrag.saetze-Behandlung ab (siehe Mutationstest-Analyse).
//         'x'/'y' bewusst statt 'a'/'b', um Verwechslung mit Absatz 1 ('a','b')
//         auszuschließen.
// ---------------------------------------------------------------------------

function testNorm(): NormDarstellung {
  const abs1 = absatz('(1)', [
    satz(1, [
      eintrag('1.', 'nummer'),
      eintrag('2.', 'nummer', [eintrag('a)', 'litera'), eintrag('b)', 'litera')]),
    ]),
  ]);
  const abs1a = absatz('(1a)', [satz(undefined, [])]);
  const abs2 = absatz('(2)', [
    satz(1, []),
    satz(2, [eintrag('1.', 'nummer', [eintrag('a)', 'litera')])]),
  ]);
  const abs3 = absatz(
    '(3)',
    [],
    [
      unterabsatz('[1]', [satz(1, [eintrag('1.', 'nummer')])]),
      unterabsatz('[2]', [satz(1, []), satz(2, [eintrag('1a.', 'nummer')])]),
    ],
  );
  const abs4 = absatz('(4)', [
    satz(1, [
      eintrag(
        '1.',
        'nummer',
        [],
        [satz(1, [eintrag('x)', 'litera')]), satz(2, [eintrag('y)', 'litera')])],
      ),
    ]),
  ]);
  return norm([abs1, abs1a, abs2, abs3, abs4]);
}

// ---------------------------------------------------------------------------
// absatz
// ---------------------------------------------------------------------------

describe('pruefeZusatzangabe – absatz', () => {
  it('findet einen normal nummerierten Absatz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'absatz', '1')).toBe(true);
  });

  it('Edge-Case: findet einen Absatz mit Buchstaben-Suffix ("1a")', () => {
    expect(pruefeZusatzangabe(testNorm(), 'absatz', '1a')).toBe(true);
  });

  it('unterscheidet "1" und "1a" als unterschiedliche Absätze', () => {
    const n = testNorm();
    expect(pruefeZusatzangabe(n, 'absatz', '1')).toBe(true);
    expect(pruefeZusatzangabe(n, 'absatz', '1a')).toBe(true);
    expect(pruefeZusatzangabe(n, 'absatz', '1b')).toBe(false);
  });

  it('liefert false für nicht existierenden Absatz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'absatz', '9')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// unterabsatz
// ---------------------------------------------------------------------------

describe('pruefeZusatzangabe – unterabsatz', () => {
  it('findet Unterabsatz normweit-flach ohne Kontext', () => {
    expect(pruefeZusatzangabe(testNorm(), 'unterabsatz', '2')).toBe(true);
  });

  it('findet Unterabsatz gescopt auf den richtigen Absatz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'unterabsatz', '1', { absatz: '3' })).toBe(true);
  });

  it('liefert false, wenn der Kontext-Absatz keine Unterabsätze hat', () => {
    expect(pruefeZusatzangabe(testNorm(), 'unterabsatz', '1', { absatz: '1' })).toBe(false);
  });

  it('Edge-Case: liefert false statt normweiter Suche, wenn der Kontext-Absatz gar nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'unterabsatz', '1', { absatz: '99' })).toBe(false);
  });

  it('liefert false für einen normweit-flach nicht existierenden Unterabsatz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'unterabsatz', '3')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// satz
// ---------------------------------------------------------------------------

describe('pruefeZusatzangabe – satz', () => {
  it('findet Satz normweit-flach ohne Kontext', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '2')).toBe(true);
  });

  it('findet Satz gescopt auf einen Absatz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '2', { absatz: '2' })).toBe(true);
  });

  it('liefert false, wenn der Satz im gescopten Absatz nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '2', { absatz: '1' })).toBe(false);
  });

  it('Edge-Case: Absatz ohne explizites <satz>-Tag (zahl undefined) matcht keinen Satz-Zusatz', () => {
    // (1a) hat einen Satz mit zahl === undefined – "Satz 1" darf dafür NICHT
    // als vorhanden gelten, da kein explizites <satz>-Tag im Quell-XML stand.
    expect(pruefeZusatzangabe(testNorm(), 'satz', '1', { absatz: '1a' })).toBe(false);
  });

  it('findet Satz gescopt auf einen Unterabsatz (Satz-Zählung beginnt dort neu bei 1)', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '2', { absatz: '3', unterabsatz: '2' })).toBe(
      true,
    );
  });

  it('liefert false, wenn der Kontext-Unterabsatz nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '1', { absatz: '3', unterabsatz: '9' })).toBe(
      false,
    );
  });

  it('Edge-Case: liefert false statt normweiter Suche, wenn der Kontext-Absatz gar nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '1', { absatz: '99' })).toBe(false);
  });

  it('liefert false für einen normweit-flach nicht existierenden Satz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '99')).toBe(false);
  });

  it('liefert false für einen innerhalb eines existierenden Unterabsatzes nicht existierenden Satz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '99', { absatz: '3', unterabsatz: '2' })).toBe(
      false,
    );
  });

  it('findet Satz gescopt auf einen Absatz OHNE Unterabsatz-Angabe (Suche über alle Unterabsätze hinweg)', () => {
    // (3) hat keine eigenen Sätze, nur Unterabsätze – Satz 2 existiert nur in
    // UAbs. 2. Ohne explizite unterabsatz-Angabe muss über alle Unterabsätze
    // hinweg gesucht werden (siehe alleSaetzeEinesAbsatzes-Kommentar).
    expect(pruefeZusatzangabe(testNorm(), 'satz', '2', { absatz: '3' })).toBe(true);
  });

  it('liefert false für einen in keinem Unterabsatz von (3) existierenden Satz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'satz', '99', { absatz: '3' })).toBe(false);
  });

  it('Edge-Case: findet einen Satz, der nur innerhalb der verschachtelten saetze eines Listeneintrags existiert', () => {
    // (4) Satz 1 selbst hat nur zahl=1 – Satz 2 existiert ausschließlich
    // innerhalb der eigenen saetze von Nr. 1 (siehe testNorm-Kommentar).
    expect(pruefeZusatzangabe(testNorm(), 'satz', '2', { absatz: '4' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// nummer
// ---------------------------------------------------------------------------

describe('pruefeZusatzangabe – nummer', () => {
  it('findet Nummer normweit-flach ohne Kontext', () => {
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '2')).toBe(true);
  });

  it('findet Nummer gescopt auf einen Absatz', () => {
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '1', { absatz: '2' })).toBe(true);
  });

  it('findet Nummer gescopt auf einen Satz innerhalb eines Absatzes', () => {
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '1', { absatz: '2', satz: '2' })).toBe(true);
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '1', { absatz: '2', satz: '1' })).toBe(false);
  });

  it('Edge-Case: findet Nummer mit Buchstaben-Suffix ("1a") gescopt auf einen Unterabsatz', () => {
    expect(
      pruefeZusatzangabe(testNorm(), 'nummer', '1a', { absatz: '3', unterabsatz: '2', satz: '2' }),
    ).toBe(true);
  });

  it('liefert false, wenn der Kontext-Satz nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '1', { absatz: '2', satz: '9' })).toBe(false);
  });

  it('liefert false für eine normweit-flach nicht existierende Nummer', () => {
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '99')).toBe(false);
  });

  it('Edge-Case: liefert false statt normweiter Suche, wenn der Kontext-Absatz gar nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '1', { absatz: '99' })).toBe(false);
  });

  it('liefert false, wenn der Kontext-Unterabsatz nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '1', { absatz: '3', unterabsatz: '9' })).toBe(
      false,
    );
  });

  it('findet Nummer gescopt auf einen Unterabsatz OHNE Satz-Angabe (Suche über alle Sätze des Unterabsatzes)', () => {
    // UAbs. 1 hat nur einen Satz (Satz 1: Nr. 1) – ohne satz-Angabe muss
    // trotzdem gefunden werden.
    expect(pruefeZusatzangabe(testNorm(), 'nummer', '1', { absatz: '3', unterabsatz: '1' })).toBe(
      true,
    );
  });

  it('liefert false, wenn der gescopte Satz innerhalb eines existierenden Unterabsatzes keine passende Nummer hat', () => {
    // UAbs. 2 Satz 1 ist absichtlich leer (siehe testNorm) – Nr. 1 existiert
    // nur in UAbs. 1 Satz 1, darf hier NICHT gefunden werden.
    expect(
      pruefeZusatzangabe(testNorm(), 'nummer', '1', {
        absatz: '3',
        unterabsatz: '2',
        satz: '1',
      }),
    ).toBe(false);
  });

  it('liefert false, wenn der Kontext-Satz innerhalb eines existierenden Unterabsatzes nicht existiert', () => {
    expect(
      pruefeZusatzangabe(testNorm(), 'nummer', '1a', {
        absatz: '3',
        unterabsatz: '2',
        satz: '9',
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// litera
// ---------------------------------------------------------------------------

describe('pruefeZusatzangabe – litera', () => {
  it('findet Litera normweit-flach ohne Kontext', () => {
    expect(pruefeZusatzangabe(testNorm(), 'litera', 'b')).toBe(true);
  });

  it('Edge-Case: Litera-Vergleich ist case-insensitiv (Zitat "B" matcht gespeichertes "b)")', () => {
    expect(pruefeZusatzangabe(testNorm(), 'litera', 'B')).toBe(true);
  });

  it('findet Litera gescopt auf Absatz + Satz, ohne Nummer-Einschränkung', () => {
    expect(pruefeZusatzangabe(testNorm(), 'litera', 'a', { absatz: '1', satz: '1' })).toBe(true);
  });

  it('findet Litera zusätzlich gescopt auf eine bestimmte Nummer', () => {
    expect(
      pruefeZusatzangabe(testNorm(), 'litera', 'a', { absatz: '1', satz: '1', nummer: '2' }),
    ).toBe(true);
    // lit. a existiert nur unter Nr. 2, nicht unter Nr. 1
    expect(
      pruefeZusatzangabe(testNorm(), 'litera', 'a', { absatz: '1', satz: '1', nummer: '1' }),
    ).toBe(false);
  });

  it('liefert false, wenn die Kontext-Nummer selbst nicht existiert', () => {
    expect(
      pruefeZusatzangabe(testNorm(), 'litera', 'a', { absatz: '1', satz: '1', nummer: '9' }),
    ).toBe(false);
  });

  it('liefert false für nicht existierende Litera', () => {
    expect(pruefeZusatzangabe(testNorm(), 'litera', 'z')).toBe(false);
  });

  it('Edge-Case: liefert false statt normweiter Suche, wenn der Kontext-Absatz gar nicht existiert', () => {
    expect(pruefeZusatzangabe(testNorm(), 'litera', 'a', { absatz: '99' })).toBe(false);
  });

  it('Edge-Case: findet Litera normweit-flach, die nur innerhalb der verschachtelten saetze eines Nummer-Eintrags existiert', () => {
    // 'x' existiert in testNorm() ausschließlich innerhalb der eigenen saetze
    // von (4) Nr. 1 (siehe testNorm-Kommentar) – nur über die Rekursion in
    // sammleAlleEintraege auffindbar.
    expect(pruefeZusatzangabe(testNorm(), 'litera', 'x')).toBe(true);
  });

  it('Edge-Case: findet Litera gescopt auf die Nummer, deren eigene saetze sie enthalten (unabhängig davon, in welchem der inneren Sätze)', () => {
    expect(
      pruefeZusatzangabe(testNorm(), 'litera', 'x', { absatz: '4', satz: '1', nummer: '1' }),
    ).toBe(true);
    expect(
      pruefeZusatzangabe(testNorm(), 'litera', 'y', { absatz: '4', satz: '1', nummer: '1' }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pruefeZusatzangabeMitKette
// ---------------------------------------------------------------------------

describe('pruefeZusatzangabeMitKette', () => {
  it('prüft eine vollständige Kette Absatz → Satz → Nummer → Litera', () => {
    const ok = pruefeZusatzangabeMitKette(testNorm(), 'absatz', '1', undefined, [
      { art: 'satz', wert: '1' },
      { art: 'nummer', wert: '2' },
      { art: 'litera', wert: 'b' },
    ]);
    expect(ok).toBe(true);
  });

  it('bricht ab (false), wenn ein mittleres Kettenglied nicht existiert', () => {
    const ok = pruefeZusatzangabeMitKette(testNorm(), 'absatz', '1', undefined, [
      { art: 'satz', wert: '1' },
      { art: 'nummer', wert: '9' }, // existiert nicht
      { art: 'litera', wert: 'b' },
    ]);
    expect(ok).toBe(false);
  });

  it('Edge-Case: Kette über einen Unterabsatz mit Nummer-Suffix ("1a")', () => {
    const ok = pruefeZusatzangabeMitKette(testNorm(), 'absatz', '3', undefined, [
      { art: 'unterabsatz', wert: '2' },
      { art: 'satz', wert: '2' },
      { art: 'nummer', wert: '1a' },
    ]);
    expect(ok).toBe(true);
  });

  it('leere Kette verhält sich wie pruefeZusatzangabe ohne Verfeinerung', () => {
    expect(pruefeZusatzangabeMitKette(testNorm(), 'absatz', '1a', undefined, [])).toBe(true);
  });

  it('erste Ebene bereits ungültig → false, unabhängig von der Kette', () => {
    const ok = pruefeZusatzangabeMitKette(testNorm(), 'absatz', '99', undefined, [
      { art: 'satz', wert: '1' },
    ]);
    expect(ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Kontextverlust-Erkennung: die folgenden Tests bestätigen, dass jeder
  // Kettenschritt den Kontext des VORHERIGEN Schritts tatsächlich mitnimmt,
  // statt ihn zu verlieren. Ein verlorener Kontext würde in testNorm() sonst
  // durch einen zufälligen Treffer an falscher Stelle kaschiert (siehe
  // Mutationstest-Analyse) – die Testdaten sind hier bewusst so gewählt, dass
  // Kontextverlust zu einem FALSCHEN true statt korrektem false führen würde.
  // -------------------------------------------------------------------------

  it('Kontextverlust-Erkennung: absatz-Kontext bleibt beim nummer-Schritt erhalten (dedizierte Fixture)', () => {
    // Absatz 1, Satz 1 hat nur Nr. 9 – Nr. 1 existiert nur in Satz 2
    // desselben Absatzes. Ginge der absatz-Kontext beim satz→nummer-Schritt
    // verloren, würde normweit gesucht und Nr. 1 aus Satz 2 fälschlich
    // gefunden.
    const abs1 = absatz('(1)', [
      satz(1, [eintrag('9.', 'nummer')]),
      satz(2, [eintrag('1.', 'nummer')]),
    ]);
    const n = norm([abs1]);
    const ok = pruefeZusatzangabeMitKette(n, 'absatz', '1', undefined, [
      { art: 'satz', wert: '1' },
      { art: 'nummer', wert: '1' },
    ]);
    expect(ok).toBe(false);
  });

  it('Kontextverlust-Erkennung: unterabsatz-Kontext bleibt beim satz-Schritt erhalten', () => {
    // UAbs. 2 Satz 1 ist leer (siehe testNorm) – Nr. 1 existiert nur in
    // UAbs. 1 Satz 1. Ginge der unterabsatz-Kontext verloren, würde über
    // beide Unterabsätze hinweg gesucht und Nr. 1 aus UAbs. 1 fälschlich
    // gefunden.
    const ok = pruefeZusatzangabeMitKette(testNorm(), 'absatz', '3', undefined, [
      { art: 'unterabsatz', wert: '2' },
      { art: 'satz', wert: '1' },
      { art: 'nummer', wert: '1' },
    ]);
    expect(ok).toBe(false);
  });

  it('Kontextverlust-Erkennung: nummer-Kontext bleibt beim litera-Schritt erhalten', () => {
    // Nr. 1 in Absatz 1 Satz 1 hat KEINE Litera – lit. a existiert nur unter
    // Nr. 2. Ginge der nummer-Kontext verloren, würde ohne Nummer-Einschränkung
    // gesucht und lit. a von Nr. 2 fälschlich gefunden.
    const ok = pruefeZusatzangabeMitKette(testNorm(), 'absatz', '1', undefined, [
      { art: 'satz', wert: '1' },
      { art: 'nummer', wert: '1' },
      { art: 'litera', wert: 'a' },
    ]);
    expect(ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dedizierte Mini-Fixtures für Regex-/Optional-Chaining-Edge-Cases, die
// testNorm() bewusst NICHT belasten (isolierte, einmalig genutzte Daten statt
// eine zentral geteilte Fixture weiter aufzublähen).
// ---------------------------------------------------------------------------

describe('Edge-Cases: unnummerierter Absatz und mehrstellige/mehrbuchstabige Werte', () => {
  it('unnummerierter Absatz (name === undefined) liefert false statt zu werfen', () => {
    const n = norm([absatz(undefined, [satz(1, [eintrag('1.', 'nummer')])])]);
    expect(() => pruefeZusatzangabe(n, 'absatz', '1')).not.toThrow();
    expect(pruefeZusatzangabe(n, 'absatz', '1')).toBe(false);
  });

  it('unterscheidet mehrstellige Nummer korrekt von ihrem ersten Ziffernzeichen', () => {
    const n = norm([absatz('(1)', [satz(1, [eintrag('12.', 'nummer')])])]);
    expect(pruefeZusatzangabe(n, 'nummer', '12')).toBe(true);
    expect(pruefeZusatzangabe(n, 'nummer', '1')).toBe(false);
  });

  it('unterscheidet Doppelbuchstaben-Litera ("aa") korrekt von ihrem ersten Buchstaben', () => {
    const n = norm([
      absatz('(1)', [satz(1, [eintrag('1.', 'nummer', [eintrag('aa)', 'litera')])])]),
    ]);
    expect(pruefeZusatzangabe(n, 'litera', 'aa')).toBe(true);
    expect(pruefeZusatzangabe(n, 'litera', 'a')).toBe(false);
  });
});

describe('vollständige Datenbezeichnungsnummern', () => {
  it.each(['1a', '1ab', '1abc', '1abcdef'])(
    'vergleicht Absatz und Listeneintrag %s vollständig',
    (nummer) => {
      const n = norm([absatz(`(${nummer})`, [satz(1, [eintrag(`${nummer}.`)])])]);
      expect(pruefeZusatzangabe(n, 'absatz', nummer)).toBe(true);
      expect(pruefeZusatzangabe(n, 'nummer', nummer)).toBe(true);
      for (let laenge = 1; laenge < nummer.length; laenge++) {
        expect(pruefeZusatzangabe(n, 'absatz', nummer.slice(0, laenge))).toBe(false);
        expect(pruefeZusatzangabe(n, 'nummer', nummer.slice(0, laenge))).toBe(false);
      }
    },
  );

  it.each(['1ab2', '1abA', '1A', 'A1ab'])(
    'bestätigt keine alphanumerische Teilnummer aus %s',
    (nummer) => {
      const n = norm([absatz(`(${nummer})`, [satz(1, [eintrag(`${nummer}.`)])])]);
      for (const wert of ['1', '1a', '1ab']) {
        expect(pruefeZusatzangabe(n, 'absatz', wert)).toBe(false);
        expect(pruefeZusatzangabe(n, 'nummer', wert)).toBe(false);
      }
    },
  );

  it('verwendet vollständige Absatz- und Nummernkontexte auch in Ketten', () => {
    const nummer = eintrag('2ab.', 'nummer', [eintrag('a)', 'litera')]);
    const n = norm([absatz('(1ab)', [satz(1, [nummer])])]);
    expect(pruefeZusatzangabe(n, 'nummer', '2ab', { absatz: '1ab', satz: '1' })).toBe(true);
    expect(pruefeZusatzangabe(n, 'nummer', '2ab', { absatz: '1a', satz: '1' })).toBe(false);
    expect(pruefeZusatzangabe(n, 'litera', 'a', { absatz: '1ab', nummer: '2a' })).toBe(false);
    const kette = [
      { art: 'satz' as const, wert: '1' },
      { art: 'nummer' as const, wert: '2ab' },
      { art: 'litera' as const, wert: 'a' },
    ];
    expect(pruefeZusatzangabeMitKette(n, 'absatz', '1ab', undefined, kette)).toBe(true);
    expect(pruefeZusatzangabeMitKette(n, 'absatz', '1a', undefined, kette)).toBe(false);
    expect(
      pruefeZusatzangabeMitKette(n, 'absatz', '1ab', undefined, [{ art: 'nummer', wert: '2a' }]),
    ).toBe(false);
  });
});
