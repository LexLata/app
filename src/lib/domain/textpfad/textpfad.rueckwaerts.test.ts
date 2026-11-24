// textpfad.rueckwaerts.test.ts
//
// Tests für textpfad.rueckwaerts.ts (kolokiert, Vitest). Baut
// NormDarstellung/UeberschriftDarstellung-Fixtures von Hand auf (analog zu
// normStrukturPruefung.test.ts – dieselben Factories bewusst lokal
// dupliziert statt importiert, siehe dortiges Muster/Projekt-Konvention
// "intentionale lokale Duplikation kleiner Helfer").
//
// Bisher nur über 1 Happy-Path-Fall (ein Absatz, ein Satz, verschachtelte
// Einträge) im migrierten gesetzesXMLParser.eintragsKette.test.ts indirekt
// abgedeckt – hier zusätzlich: titel-Pfad, unnummerierter Absatz,
// Unterabsatz-Pfad (inkl. nicht gefunden), satzInEintrag-Pfad, wiederholung-
// basiertes Auffinden gleichlautender Geschwister-Einträge, Haupt-
// text+Fortsetzung-Zusammensetzung (inkl. Versatz), sowie sämtliche
// "nicht mehr auffindbar" (undefined)-Fälle, die für die
// Markierungskonflikt-Prüfung (einziger Aufrufer) entscheidend sind.

import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, it, expect } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { schuetzeLeerzeichen } from '@/lib/domain/basis/textNachbearbeitung';
import { textAnTextpfad, aktuellerTextAnPfad } from '@/lib/domain/textpfad/textpfad.rueckwaerts';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad';
import type {
  AbsatzDarstellung,
  ListenEintragDarstellung,
  ListenEintragEbene,
  NormDarstellung,
  SatzDarstellung,
  UeberschriftDarstellung,
  UnterabsatzDarstellung,
} from '@/lib/domain/gesetzTypes';

// ---------------------------------------------------------------------------
// Kompakte Test-Factories (siehe Kopfkommentar) – nur die für
// textAnTextpfad relevanten Felder gesetzt.
// ---------------------------------------------------------------------------

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function eintrag(
  bezeichnung: string,
  ebene: ListenEintragEbene = 'nummer',
  text = 'X',
  optionen: {
    untereintraege?: ListenEintragDarstellung[];
    saetze?: SatzDarstellung[];
    fortsetzung?: string;
  } = {},
): ListenEintragDarstellung {
  return {
    id: naechsteId(),
    bezeichnung,
    ebene,
    text,
    untereintraege: optionen.untereintraege ?? [],
    saetze: optionen.saetze,
    fortsetzung: optionen.fortsetzung,
  };
}

function satz(
  zahl: number | undefined,
  text: string,
  eintraege: ListenEintragDarstellung[] = [],
  fortsetzung?: string,
): SatzDarstellung {
  return { id: naechsteId(), zahl, text, eintraege, fortsetzung };
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

function norm(absaetze: AbsatzDarstellung[], titel?: string): NormDarstellung {
  return normaleNorm({
    id: naechsteId(),
    xmlId: naechsteId(),
    bezeichnung: '§ 1',
    titel,
    absaetze,
  });
}

function ueberschrift(titel?: string, bezeichnung = 'Erster Teil'): UeberschriftDarstellung {
  return {
    id: naechsteId(),
    xmlId: naechsteId(),
    bezeichnung,
    titel,
    ebene: 1,
    gliederungskennzahl: '010000',
  };
}

// ---------------------------------------------------------------------------
// textAnTextpfad: Absatz-Auflösung
// ---------------------------------------------------------------------------

describe('textAnTextpfad – Absatz-Auflösung', () => {
  it('findet den Text im richtigen Absatz und schneidet [start, ende) heraus', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Erster Absatztext.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 7,
      }),
    ).toBe('Erster ');
  });

  it('unnummerierter Absatz (bezeichnung undefined) wird über pfad.absatz===undefined adressiert', () => {
    const n = norm([absatz(undefined, [satz(undefined, 'Ohne Nummer.')])]);
    expect(
      textAnTextpfad(n, { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 }),
    ).toBe('Ohne');
  });

  it('gibt undefined zurück, wenn der Absatz in der aktuellen Norm nicht mehr existiert (Konflikt-Signal)', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Text.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(9)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 4,
      }),
    ).toBeUndefined();
  });

  it('mehrere Absätze: wählt exakt den passenden aus (nicht nur den ersten)', () => {
    const n = norm([
      absatz('(1)', [satz(undefined, 'Erster.')]),
      absatz('(2)', [satz(undefined, 'Zweiter.')]),
    ]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(2)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 6,
      }),
    ).toBe('Zweite');
  });
});

// ---------------------------------------------------------------------------
// textAnTextpfad: Unterabsatz-Auflösung
// ---------------------------------------------------------------------------

describe('textAnTextpfad – Unterabsatz-Auflösung', () => {
  it('findet den Satz im richtigen Unterabsatz statt in absatz.saetze', () => {
    const n = norm([
      absatz(
        '(1)',
        [],
        [
          unterabsatz('[1]', [satz(undefined, 'UA-Eins.')]),
          unterabsatz('[2]', [satz(undefined, 'UA-Zwei.')]),
        ],
      ),
    ]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)', unterabsatz: '[2]' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 7,
      }),
    ).toBe('UA-Zwei');
  });

  it('gibt undefined zurück, wenn der Unterabsatz nicht mehr existiert', () => {
    const n = norm([absatz('(1)', [], [unterabsatz('[1]', [satz(undefined, 'X.')])])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)', unterabsatz: '[99]' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 1,
      }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// textAnTextpfad: Satz-Auflösung
// ---------------------------------------------------------------------------

describe('textAnTextpfad – Satz-Auflösung', () => {
  it('findet den richtigen Satz über satz.zahl', () => {
    const n = norm([absatz('(1)', [satz(1, 'Satz eins.'), satz(2, 'Satz zwei.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)', satz: 2 }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 9,
      }),
    ).toBe('Satz zwei');
  });

  it('Satz ohne explizites <satz>-Tag (zahl===undefined) wird über pfad.satz===undefined gefunden', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Einziger Satz.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 8,
      }),
    ).toBe('Einziger');
  });

  it('gibt undefined zurück, wenn der Satz nicht mehr existiert', () => {
    const n = norm([absatz('(1)', [satz(1, 'X.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)', satz: 99 }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 1,
      }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// textAnTextpfad: Haupttext + Fortsetzung
// ---------------------------------------------------------------------------

describe('textAnTextpfad – Haupttext + Fortsetzung', () => {
  it('setzt Haupttext und Fortsetzung zu EINEM durchgehenden Bereich zusammen', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Anfang', [], 'Ende.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 10,
      }),
    ).toBe('AnfangEnde');
  });

  it('Versatz in die Fortsetzung hinein liefert nur den entsprechenden Fortsetzungs-Ausschnitt', () => {
    // "Anfang" hat 6 Zeichen, ab Zeichen 6 beginnt "Ende."
    const n = norm([absatz('(1)', [satz(undefined, 'Anfang', [], 'Ende.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 6,
        zeichenbereichEnde: 11,
      }),
    ).toBe('Ende.');
  });

  it('ohne Fortsetzung bleibt nur der Haupttext maßgeblich', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Nur Haupttext.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 3,
      }),
    ).toBe('Nur');
  });
});

// ---------------------------------------------------------------------------
// textAnTextpfad: Eintrags-Kette (findeEintrag/findeMitWiederholung)
// ---------------------------------------------------------------------------

describe('textAnTextpfad – Eintrags-Kette', () => {
  it('findet einen einzelnen Eintrag über die Kette', () => {
    const n = norm([
      absatz('(1)', [satz(undefined, '', [eintrag('1.', 'nummer', 'Erster Eintrag.')])]),
    ]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)', eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }] }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 7,
      }),
    ).toBe('Erster ');
  });

  it('steigt mehrstufig ab (nummer → litera)', () => {
    const n = norm([
      absatz('(1)', [
        satz(undefined, '', [
          eintrag('1.', 'nummer', '', {
            untereintraege: [eintrag('a)', 'litera', 'Tief verschachtelt.')],
          }),
        ]),
      ]),
    ]);
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [
        { ebene: 'nummer', bezeichnung: '1.' },
        { ebene: 'litera', bezeichnung: 'a)' },
      ],
    });
    expect(textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 0, zeichenbereichEnde: 4 })).toBe(
      'Tief',
    );
  });

  it('gibt undefined zurück, wenn ein Kettenschritt nicht mehr existiert', () => {
    const n = norm([absatz('(1)', [satz(undefined, '', [eintrag('1.', 'nummer', 'X.')])])]);
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '2.' }],
    });
    expect(
      textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 0, zeichenbereichEnde: 1 }),
    ).toBeUndefined();
  });

  it('gibt undefined zurück, wenn bereits der ERSTE Kettenschritt nicht existiert (verhindert Absturz statt Weitersuchen)', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Kein Eintrag hier.')])]);
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
    });
    expect(
      textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 0, zeichenbereichEnde: 1 }),
    ).toBeUndefined();
  });

  it('EDGE CASE (wiederholung): findet unter mehreren GLEICHLAUTENDEN Geschwister-Einträgen (z.B. zwei "a)" auf unterschiedlichen Ebenen-Zweigen) genau den durch wiederholung adressierten', () => {
    const n = norm([
      absatz('(1)', [
        satz(undefined, '', [
          eintrag('a)', 'litera', 'Erstes a.'),
          eintrag('a)', 'litera', 'Zweites a.'),
        ]),
      ]),
    ]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({
          absatz: '(1)',
          eintraege: [{ ebene: 'litera', bezeichnung: 'a)', wiederholung: 0 }],
        }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 9,
      }),
    ).toBe('Erstes a.'.slice(0, 9));
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({
          absatz: '(1)',
          eintraege: [{ ebene: 'litera', bezeichnung: 'a)', wiederholung: 1 }],
        }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 10,
      }),
    ).toBe('Zweites a.');
  });

  it('fehlendes wiederholung-Feld verhält sich wie wiederholung=0 (erster Treffer)', () => {
    const n = norm([
      absatz('(1)', [
        satz(undefined, '', [
          eintrag('a)', 'litera', 'Erstes.'),
          eintrag('a)', 'litera', 'Zweites.'),
        ]),
      ]),
    ]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)', eintraege: [{ ebene: 'litera', bezeichnung: 'a)' }] }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 7,
      }),
    ).toBe('Erstes.');
  });

  it('leeres eintraege-Array verhält sich wie fehlendes eintraege (Satz selbst ist das Blatt)', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Satztext.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 4,
      }),
    ).toBe('Satz');
  });
});

// ---------------------------------------------------------------------------
// textAnTextpfad: satzInEintrag
// ---------------------------------------------------------------------------

describe('textAnTextpfad – satzInEintrag', () => {
  it('findet den inneren Satz eines Eintrags über satzInEintrag', () => {
    const n = norm([
      absatz('(1)', [
        satz(undefined, '', [
          eintrag('1.', 'nummer', '', {
            saetze: [satz(1, 'Innerer Satz eins.'), satz(2, 'Innerer Satz zwei.')],
          }),
        ]),
      ]),
    ]);
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
      satzInEintrag: 2,
    });
    expect(textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 0, zeichenbereichEnde: 7 })).toBe(
      'Innerer',
    );
  });

  it('gibt undefined zurück, wenn der innere Satz nicht mehr existiert', () => {
    const n = norm([
      absatz('(1)', [
        satz(undefined, '', [eintrag('1.', 'nummer', '', { saetze: [satz(1, 'X.')] })]),
      ]),
    ]);
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
      satzInEintrag: 99,
    });
    expect(
      textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 0, zeichenbereichEnde: 1 }),
    ).toBeUndefined();
  });

  it('ohne satzInEintrag wird stattdessen der Eintragstext selbst genutzt', () => {
    const n = norm([
      absatz('(1)', [satz(undefined, '', [eintrag('1.', 'nummer', 'Eintragstext direkt.')])]),
    ]);
    const pfad: Textpfad = normtextPfad({
      absatz: '(1)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
    });
    expect(textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 0, zeichenbereichEnde: 10 })).toBe(
      'Eintragste',
    );
  });
});

// ---------------------------------------------------------------------------
// textAnTextpfad: Titel
// ---------------------------------------------------------------------------

describe('textAnTextpfad – Titel', () => {
  it('pfad.bereich adressiert norm.titel statt der Absätze (Absatz-Auflösung wird übersprungen)', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Ignoriert.')])], 'Der Norm-Titel');
    expect(
      textAnTextpfad(n, {
        pfad: bereichPfad('amtlicherTitel'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 3,
      }),
    ).toBe('Der');
  });

  it('fehlender norm.titel ergibt bei pfad.bereich einen leeren String (kein undefined, kein Wurf)', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'X.')])]);
    expect(
      textAnTextpfad(n, {
        pfad: bereichPfad('amtlicherTitel'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 3,
      }),
    ).toBe('');
  });
});

// ---------------------------------------------------------------------------
// aktuellerTextAnPfad: Bezeichnungsfeld/Titel generisch für Norm UND Überschrift
// ---------------------------------------------------------------------------

describe('aktuellerTextAnPfad', () => {
  it('Bereich bezeichnung liest element.bezeichnung, unabhängig von Norm/Überschrift', () => {
    const n = norm([]);
    expect(
      aktuellerTextAnPfad(n, {
        pfad: bereichPfad('bezeichnung'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 3,
      }),
    ).toBe('§ 1'.slice(0, 3));
    const u = ueberschrift(undefined, 'Zweiter Teil');
    expect(
      aktuellerTextAnPfad(u, {
        pfad: bereichPfad('bezeichnung'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 6,
      }),
    ).toBe('Zweite');
  });

  it('titel funktioniert für UeberschriftDarstellung genauso wie für NormDarstellung', () => {
    const u = ueberschrift('Überschrift-Titeltext');
    expect(
      aktuellerTextAnPfad(u, {
        pfad: bereichPfad('amtlicherTitel'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 11,
      }),
    ).toBe('Überschrift');
  });

  it('Bereich bezeichnung/titel werden VOR der Norm-only-Weiche geprüft (funktionieren auch ohne absaetze)', () => {
    const u = ueberschrift('T');
    expect(
      aktuellerTextAnPfad(u, {
        pfad: bereichPfad('amtlicherTitel'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 1,
      }),
    ).toBe('T');
  });

  it('gibt bei einer UeberschriftDarstellung UND einem Nicht-Titel/Nicht-Bezeichnungsfeld-Pfad undefined zurück (keine Absätze vorhanden)', () => {
    const u = ueberschrift();
    expect(
      aktuellerTextAnPfad(u, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 3,
      }),
    ).toBeUndefined();
  });

  it('delegiert bei einer NormDarstellung und Nicht-Titel/Nicht-Bezeichnungsfeld-Pfad korrekt an textAnTextpfad', () => {
    const n = norm([absatz('(1)', [satz(undefined, 'Delegiert.')])]);
    expect(
      aktuellerTextAnPfad(n, {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 9,
      }),
    ).toBe('Delegiert');
  });

  it('fehlendes element.titel ergibt bei pfad.bereich einen leeren String (analog zu textAnTextpfad, aber eigener Code-Pfad)', () => {
    const u = ueberschrift(undefined);
    expect(
      aktuellerTextAnPfad(u, {
        pfad: bereichPfad('amtlicherTitel'),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 3,
      }),
    ).toBe('');
  });
});

describe('Textauflösung – normalisiertes GesetzesXML', () => {
  const nummerPfad: Textpfad = normtextPfad({
    absatz: '(1)',
    satz: 1,
    eintraege: [{ ebene: 'nummer', bezeichnung: '1.' }],
  });

  it.each([
    {
      name: 'Satz mit Fortsetzung',
      pfad: normtextPfad({ absatz: '(1)', satz: 1 }),
      haupt: 'Gemäß § 5:',
      fortsetzung: 'gilt Art. 2.',
    },
    {
      name: 'Nummer mit Fortsetzung',
      pfad: nummerPfad,
      haupt: 'Nach Nr. 3:',
      fortsetzung: 'endet Satz 4.',
    },
    {
      name: 'Unterliste als eigenes Blatt',
      pfad: normtextPfad({
        ...nummerPfad,
        eintraege: [...nummerPfad.eintraege!, { ebene: 'litera' as const, bezeichnung: 'a)' }],
      }),
      haupt: 'Am 1. Januar\u00a0bleibt es.',
      fortsetzung: '',
    },
  ])(
    '$name verwendet dieselben Zeichenbereiche wie die Darstellung',
    ({ pfad, haupt, fortsetzung }) => {
      const kompakt =
        '<absatz zahl="(1)"><satz zahl="1">Gemäß § 5:<nummer zahl="1.">Nach Nr. 3:<litera buchstabe="a)">Am 1. Januar\u00a0bleibt es.</litera>endet Satz 4.</nummer>gilt Art. 2.</satz></absatz>';
      const eingerueckt = `<absatz zahl="(1)">
      <satz zahl="1">
        Gemäß\t §   5:
        <nummer zahl="1.">
          Nach   Nr.\r\n  3:
          <litera buchstabe="a)">
            Am   1.   Januar\u00a0bleibt   es.
          </litera>
          endet   Satz   4.
        </nummer>
        gilt   Art.   2.
      </satz>
    </absatz>`;
      const dargestellterHaupttext = schuetzeLeerzeichen(haupt);
      const dargestellteFortsetzung = schuetzeLeerzeichen(fortsetzung);
      const erwartet = dargestellterHaupttext + dargestellteFortsetzung;
      expect(erwartet).toContain('\u00a0');

      for (const inhalt of [kompakt, eingerueckt]) {
        const g = parseGesetzesXML(
          `<gesetz id="pfad"><infos><normgeber>de-bund</normgeber><langtitel>Pfadtest</langtitel><kurztitel>PG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text>${inhalt}</text></norm></inhalt></gesetz>`,
        );
        expect(g).not.toBeNull();
        const n = g!.elemente[0]!.data as NormDarstellung;
        expect(
          textAnTextpfad(n, {
            pfad: pfad,
            zeichenbereichStart: 0,
            zeichenbereichEnde: erwartet.length,
          }),
        ).toBe(erwartet);
        expect(
          aktuellerTextAnPfad(n, {
            pfad: pfad,
            zeichenbereichStart: dargestellterHaupttext.length,
            zeichenbereichEnde: erwartet.length,
          }),
        ).toBe(dargestellteFortsetzung);
        expect(
          textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 2, zeichenbereichEnde: 7 }),
        ).toBe(erwartet.slice(2, 7));
      }
    },
  );
});

it.each([false, true])(
  'löst äußeren und inneren Satz exakt auf (Unterabsatz: %s)',
  (mitUnterabsatz) => {
    const saetze =
      '<satz zahl="1"><nummer zahl="1"><satz zahl="1">Falsches B.</satz><neu/><satz zahl="2">Siehe B.</satz></nummer></satz><satz zahl="2"><nummer zahl="1"><satz zahl="1">C.</satz><satz zahl="2">Siehe C.</satz></nummer></satz>';
    const g = parseGesetzesXML(
      `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>Test</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz>${mitUnterabsatz ? `<unterabsatz zahl="[2]">${saetze}</unterabsatz>` : saetze}</absatz></text></norm></inhalt></gesetz>`,
    )!;
    const el = g.elemente[0]!;
    if (el.typ !== 'norm') throw new Error('Norm fehlt');
    const pfad = normtextPfad({
      ...(mitUnterabsatz ? { unterabsatz: '[2]' } : {}),
      satz: 1,
      eintraege: [{ ebene: 'nummer' as const, bezeichnung: '1' }],
      satzInEintrag: 2,
    });
    expect(
      textAnTextpfad(el.data, { pfad: pfad, zeichenbereichStart: 6, zeichenbereichEnde: 7 }),
    ).toBe('B');
    expect(
      textAnTextpfad(el.data, {
        pfad: { ...pfad, satz: 2 },
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      }),
    ).toBe('C');
    expect(
      textAnTextpfad(el.data, {
        pfad: { ...pfad, satz: 3 },
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      }),
    ).toBeUndefined();
  },
);

it('löst einen einzelnen expliziten Satz im wiederholten verschachtelten Eintrag exakt auf', () => {
  const g = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>Test</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz><unterabsatz zahl="[2]"><satz zahl="1"><nummer zahl="1"><litera buchstabe="-"><satz>Siehe A.</satz></litera><litera buchstabe="-"><neu/><satz>Siehe B.</satz><neu/></litera></nummer></satz></unterabsatz></absatz></text></norm></inhalt></gesetz>',
  )!;
  const el = g.elemente[0]!;
  if (el.typ !== 'norm') throw new Error('Norm fehlt');
  const pfad = normtextPfad({
    unterabsatz: '[2]',
    satz: 1,
    eintraege: [
      { ebene: 'nummer' as const, bezeichnung: '1' },
      { ebene: 'litera' as const, bezeichnung: '-', wiederholung: 1 },
    ],
    satzInEintrag: 1,
  });
  expect(
    textAnTextpfad(el.data, { pfad: pfad, zeichenbereichStart: 6, zeichenbereichEnde: 7 }),
  ).toBe('B');
  expect(
    textAnTextpfad(el.data, {
      pfad: { ...pfad, satzInEintrag: 2 },
      zeichenbereichStart: 6,
      zeichenbereichEnde: 7,
    }),
  ).toBeUndefined();
  expect(
    textAnTextpfad(el.data, {
      pfad: { ...pfad, satz: 2 },
      zeichenbereichStart: 6,
      zeichenbereichEnde: 7,
    }),
  ).toBeUndefined();
  expect(
    textAnTextpfad(el.data, {
      pfad: { ...pfad, unterabsatz: '[3]' },
      zeichenbereichStart: 6,
      zeichenbereichEnde: 7,
    }),
  ).toBeUndefined();
});

describe('textAnTextpfad – vollständige Eintragsidentität', () => {
  it('lehnt Artwechsel bei gleicher Bezeichnung und unverändertem Text ab', () => {
    const n = norm([absatz(undefined, [satz(undefined, '', [eintrag('a', 'litera', 'Gleich')])])]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: 'a' }] }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 6,
      }),
    ).toBeUndefined();
  });

  it('zählt gemischte und wiederholte Geschwister nur nach Bezeichnung und weicht bei falscher Art nicht aus', () => {
    const n = norm([
      absatz(undefined, [
        satz(undefined, '', [
          eintrag('a', 'nummer', 'Erster'),
          eintrag('b', 'litera', 'Andere'),
          eintrag('a', 'litera', 'Zweiter'),
          eintrag('a', 'litera', 'Dritter'),
        ]),
      ]),
    ]);
    const pfad = (ebene: ListenEintragEbene, wiederholung?: number): Textpfad =>
      normtextPfad({
        eintraege: [{ ebene, bezeichnung: 'a', wiederholung }],
      });
    expect(
      textAnTextpfad(n, { pfad: pfad('nummer'), zeichenbereichStart: 0, zeichenbereichEnde: 20 }),
    ).toBe('Erster');
    expect(
      textAnTextpfad(n, { pfad: pfad('litera'), zeichenbereichStart: 0, zeichenbereichEnde: 20 }),
    ).toBeUndefined();
    expect(
      textAnTextpfad(n, {
        pfad: pfad('litera', 1),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 20,
      }),
    ).toBe('Zweiter');
    expect(
      textAnTextpfad(n, {
        pfad: pfad('nummer', 1),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 20,
      }),
    ).toBeUndefined();
    expect(
      textAnTextpfad(n, {
        pfad: pfad('litera', 2),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 20,
      }),
    ).toBe('Dritter');
    expect(
      textAnTextpfad(n, {
        pfad: pfad('litera', 3),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 20,
      }),
    ).toBeUndefined();
  });

  it.each([0, 1, 2])(
    'prüft auch Kettenschritt %i bei verschachtelten gleichen Bezeichnungen',
    (wechsel) => {
      const kette: Textpfad['eintraege'] = [
        { ebene: 'nummer', bezeichnung: 'a', wiederholung: 1 },
        { ebene: 'litera', bezeichnung: 'a', wiederholung: 1 },
        { ebene: 'nummer', bezeichnung: 'a' },
      ];
      const n = norm([
        absatz(undefined, [
          satz(undefined, '', [
            eintrag('a', 'litera', 'Falscher Zweig'),
            eintrag('a', 'nummer', '', {
              untereintraege: [
                eintrag('a', 'nummer', 'Falscher Unterzweig'),
                eintrag('a', 'litera', '', { untereintraege: [eintrag('a', 'nummer', 'Gleich')] }),
              ],
            }),
          ]),
        ]),
      ]);
      expect(
        textAnTextpfad(n, {
          pfad: normtextPfad({ eintraege: kette }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 6,
        }),
      ).toBe('Gleich');
      const geaendert = kette.map((schritt, index) =>
        index === wechsel
          ? {
              ...schritt,
              ebene: schritt.ebene === 'nummer' ? ('litera' as const) : ('nummer' as const),
            }
          : schritt,
      );
      expect(
        textAnTextpfad(n, {
          pfad: normtextPfad({ eintraege: geaendert }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 6,
        }),
      ).toBeUndefined();
    },
  );
});
