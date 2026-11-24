// gesetzDarstellungAuswertung.test.ts
//
// Tests für gesetzDarstellungAuswertung.ts (kolokiert, Vitest). Bislang gab es
// für diese Funktionen (vorher in gesetzTypes.ts) KEIN eigenes Testfile –
// Mutation-Testing-Analyse (siehe Chatverlauf) hat mehrere echte Lücken
// aufgedeckt, die hier geschlossen werden. Baut GesetzDarstellung/
// NormDarstellung-Fixtures von Hand auf (analog zu normAufloesung.test.ts).

import { normDarstellung, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  berechneElementstand,
  normWeggefallen,
  normKurzzeilenTitel,
  normAmtlicherTitel,
  normVollTitel,
  ueberschriftVollTitel,
  normTextLaenge,
  gesetzNormen,
} from './gesetzDarstellungAuswertung';
import type {
  AbsatzDarstellung,
  DarstellungsElement,
  GesetzDarstellung,
  ListenEintragDarstellung,
  NormDarstellung,
  SatzDarstellung,
  UeberschriftDarstellung,
  UnterabsatzDarstellung,
} from '@/lib/domain/gesetzTypes';

function norm(ueberschreibungen: Partial<NormDarstellung> = {}): NormDarstellung {
  return normDarstellung({
    id: 'n1',
    xmlId: 'n1',
    bezeichnung: '§ 1',
    absaetze: [],
    ...ueberschreibungen,
  });
}

function satz(ueberschreibungen: Partial<SatzDarstellung> = {}): SatzDarstellung {
  return { id: 's1', text: '', eintraege: [], ...ueberschreibungen };
}

function listenEintrag(
  ueberschreibungen: Partial<ListenEintragDarstellung> = {},
): ListenEintragDarstellung {
  return {
    id: 'l1',
    bezeichnung: '1.',
    ebene: 'nummer',
    text: '',
    untereintraege: [],
    ...ueberschreibungen,
  };
}

function absatz(ueberschreibungen: Partial<AbsatzDarstellung> = {}): AbsatzDarstellung {
  return { id: 'a1', saetze: [], ...ueberschreibungen };
}

function unterabsatz(
  ueberschreibungen: Partial<UnterabsatzDarstellung> = {},
): UnterabsatzDarstellung {
  return { id: 'u1', bezeichnung: '1', saetze: [], ...ueberschreibungen };
}

function ueberschrift(
  ueberschreibungen: Partial<UeberschriftDarstellung> = {},
): UeberschriftDarstellung {
  return {
    id: 'u1',
    xmlId: 'u1',
    bezeichnung: 'Erster Teil',
    ebene: 1,
    gliederungskennzahl: '010000',
    ...ueberschreibungen,
  };
}

function gesetz(elemente: DarstellungsElement[]): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel: 'TestG',
    langtitel: 'Test-Gesetz',
    hatGliederungsartikel: false,
    elemente,
  });
}

describe('normWeggefallen', () => {
  it.each([['(weggefallen)'], ['(gegenstandslos)'], ['(aufgehoben)'], ['(entfallen)']])(
    'erkennt "%s" (inkl. Groß-/Kleinschreibung und Whitespace) als weggefallen',
    (titel) => {
      expect(normWeggefallen(norm({ titel, status: 'weggefallen' }))).toBe(true);
      expect(
        normWeggefallen(norm({ titel: `  ${titel.toUpperCase()}  `, status: 'weggefallen' })),
      ).toBe(true);
    },
  );

  it('ein weggefallener Titel ohne Status genügt nicht', () => {
    expect(normWeggefallen(norm({ titel: '(weggefallen)' }))).toBe(false);
  });
  it('Status ohne Titel genügt bei leerem Text; echter Text verhindert die Kurzzeile', () => {
    expect(normWeggefallen(norm({ status: 'weggefallen' }))).toBe(true);
    expect(
      normWeggefallen(
        norm({
          status: 'weggefallen',
          absaetze: [{ id: 'a', saetze: [{ id: 's', text: 'Erhaltener Text.', eintraege: [] }] }],
        }),
      ),
    ).toBe(false);
  });
  function geparsteNorm(status: string, text: string): NormDarstellung {
    const g = parseGesetzesXML(
      `<gesetz id="strich"><infos><normgeber>de-bund</normgeber><langtitel>Strichtest</langtitel><kurztitel>ST</kurztitel></infos><inhalt><norm id="n1"${status}><bezeichnung>§ 2260</bezeichnung><titel>(weggefallen)</titel><text>${text}</text></norm></inhalt></gesetz>`,
    );
    const element = g?.elemente[0];
    if (element?.typ !== 'norm') throw new Error('Norm erwartet');
    return element.data;
  }
  it.each(['-', ' – ', '—'])(
    'eine als weggefallen gekennzeichnete Norm mit bloßem Strich "%s" gilt als weggefallen',
    (strich) => {
      expect(normWeggefallen(geparsteNorm(' status="weggefallen"', strich))).toBe(true);
    },
  );
  it('ein bloßer Strich ohne Weggefallen-Kennzeichnung genügt nicht', () => {
    expect(normWeggefallen(geparsteNorm('', '-'))).toBe(false);
  });
  it('ein Strich neben echtem Inhalt verhindert die Kurzzeile', () => {
    expect(normWeggefallen(geparsteNorm(' status="weggefallen"', '- Erhaltener Text.'))).toBe(
      false,
    );
    expect(
      normWeggefallen(
        norm({
          status: 'weggefallen',
          absaetze: [absatz({ saetze: [satz({ text: '-' })] })],
          zusatztexte: [{ text: 'Hinweis', nachAbsatz: 1 }],
        }),
      ),
    ).toBe(false);
  });
  it('ein bloßer Strich als Zusatztext einer weggefallenen Norm gilt als weggefallen', () => {
    expect(
      normWeggefallen(norm({ status: 'weggefallen', zusatztexte: [{ text: '–', nachAbsatz: 0 }] })),
    ).toBe(true);
  });
  it('ein normaler Titel gilt NICHT als weggefallen', () => {
    expect(normWeggefallen(norm({ titel: 'Grundgesetz für die Bundesrepublik Deutschland' }))).toBe(
      false,
    );
  });

  it('kein Titel gilt NICHT als weggefallen', () => {
    expect(normWeggefallen(norm({ titel: undefined }))).toBe(false);
  });
});

describe('normKurzzeilenTitel', () => {
  function geparst(normXml: string): NormDarstellung {
    const g = parseGesetzesXML(
      `<gesetz id="k"><infos><normgeber>de-bund</normgeber><langtitel>K</langtitel><kurztitel>K</kurztitel></infos><inhalt>${normXml}</inhalt></gesetz>`,
    );
    const element = g?.elemente[0];
    if (element?.typ !== 'norm') throw new Error('Norm erwartet');
    return element.data;
  }
  it.each(['<text>-</text>', '<text>–</text>', ''])(
    'Norm ohne Kennzeichnung und Titel mit "%s" zeigt „(kein Text veröffentlicht)“',
    (text) => {
      expect(
        normKurzzeilenTitel(geparst(`<norm id="n1"><bezeichnung>§ 25</bezeichnung>${text}</norm>`)),
      ).toBe('(kein Text veröffentlicht)');
    },
  );
  it('weggefallene Norm behält ihren Titel', () => {
    expect(
      normKurzzeilenTitel(
        geparst(
          '<norm id="n1" status="weggefallen"><bezeichnung>§ 2</bezeichnung><titel>(weggefallen)</titel><text>-</text></norm>',
        ),
      ),
    ).toBe('(weggefallen)');
  });
  it('Titel oder echter Text führen zur normalen Darstellung', () => {
    expect(
      normKurzzeilenTitel(
        geparst(
          '<norm id="n1"><bezeichnung>§ 2</bezeichnung><titel>Titel</titel><text>-</text></norm>',
        ),
      ),
    ).toBeUndefined();
    expect(
      normKurzzeilenTitel(
        geparst('<norm id="n1"><bezeichnung>§ 2</bezeichnung><text>Erhaltener Text.</text></norm>'),
      ),
    ).toBeUndefined();
  });
  it('überschriftartiger Gliederungsartikel ohne Titel und Text bleibt normal', () => {
    expect(
      normKurzzeilenTitel(
        norm({ art: 'gliederungsartikel', gliederungsEbene: 1, ueberschriftartig: true }),
      ),
    ).toBeUndefined();
  });
});

describe('normAmtlicherTitel', () => {
  it('liefert den Titel, wenn er amtlich ist', () => {
    expect(normAmtlicherTitel(norm({ titel: 'Amtlicher Titel' }))).toBe('Amtlicher Titel');
  });

  it('liefert undefined, wenn der Titel als nicht-amtlich markiert ist', () => {
    expect(
      normAmtlicherTitel(norm({ titel: 'Nachträglicher Titel', titelIstNichtamtlich: true })),
    ).toBeUndefined();
  });
});

describe('normVollTitel', () => {
  it('kombiniert Bezeichnung und Titel, wenn ein Titel vorhanden ist', () => {
    expect(normVollTitel(norm({ bezeichnung: '§ 1', titel: 'Anwendungsbereich' }))).toBe(
      '§ 1 Anwendungsbereich',
    );
  });

  it('liefert nur die Bezeichnung, wenn kein Titel vorhanden ist', () => {
    expect(normVollTitel(norm({ bezeichnung: '§ 1', titel: undefined }))).toBe('§ 1');
  });
});

describe('ueberschriftVollTitel', () => {
  it('liefert nur die Bezeichnung, wenn kein Titel vorhanden ist', () => {
    expect(
      ueberschriftVollTitel(ueberschrift({ bezeichnung: 'Erster Teil', titel: undefined })),
    ).toBe('Erster Teil');
  });

  it('trennt mit ": ", wenn die Bezeichnung NICHT auf Satzzeichen endet', () => {
    expect(
      ueberschriftVollTitel(ueberschrift({ bezeichnung: 'Erster Teil', titel: 'Allgemeines' })),
    ).toBe('Erster Teil: Allgemeines');
  });

  it('trennt nur mit Leerzeichen, wenn die Bezeichnung bereits auf Satzzeichen endet', () => {
    expect(ueberschriftVollTitel(ueberschrift({ bezeichnung: '1.', titel: 'Allgemeines' }))).toBe(
      '1. Allgemeines',
    );
    expect(
      ueberschriftVollTitel(ueberschrift({ bezeichnung: 'Teil)', titel: 'Allgemeines' })),
    ).toBe('Teil) Allgemeines');
  });

  it('MUTATIONSTEST: ein Satzzeichen NUR in der Mitte der Bezeichnung zählt NICHT (Regex-Anker $)', () => {
    // "Art. 1" enthält einen Punkt, endet aber auf "1" – muss mit ": " getrennt werden.
    expect(
      ueberschriftVollTitel(ueberschrift({ bezeichnung: 'Art. 1', titel: 'Allgemeines' })),
    ).toBe('Art. 1: Allgemeines');
  });

  it('MUTATIONSTEST: trailing Whitespace nach dem Satzzeichen wird via trim() ignoriert', () => {
    expect(ueberschriftVollTitel(ueberschrift({ bezeichnung: '1. ', titel: 'Allgemeines' }))).toBe(
      '1.  Allgemeines',
    );
  });
});

describe('normTextLaenge', () => {
  it('zählt den Satztext eines einfachen Absatzes', () => {
    const n = norm({ absaetze: [absatz({ saetze: [satz({ text: 'abcde' })] })] });
    expect(normTextLaenge(n)).toBe(5);
  });

  it('MUTATIONSTEST: zählt fortsetzung des Satzes HINZU, nicht ab (Additions-, nicht Subtraktionslogik)', () => {
    // Mit "-" statt "+" würde "abc" (3) + "de" (2) fälschlich 1 statt 5 ergeben.
    const n = norm({
      absaetze: [absatz({ saetze: [satz({ text: 'abc', fortsetzung: 'de' })] })],
    });
    expect(normTextLaenge(n)).toBe(5);
  });

  it('MUTATIONSTEST: zählt verschachtelte Listen-Einträge EINES Satzes hinzu (satz.eintraege nicht leer)', () => {
    const n = norm({
      absaetze: [
        absatz({
          saetze: [
            satz({
              text: 'ab',
              eintraege: [listenEintrag({ text: 'xyz' }), listenEintrag({ text: 'q' })],
            }),
          ],
        }),
      ],
    });
    // 'ab' (2) + 'xyz' (3) + 'q' (1)
    expect(normTextLaenge(n)).toBe(6);
  });

  it('zählt fortsetzung eines Listen-Eintrags mit', () => {
    const n = norm({
      absaetze: [
        absatz({
          saetze: [
            satz({ text: '', eintraege: [listenEintrag({ text: 'ab', fortsetzung: 'cd' })] }),
          ],
        }),
      ],
    });
    expect(normTextLaenge(n)).toBe(4);
  });

  it('zählt untereintraege eines Listen-Eintrags rekursiv (verschachtelte Nummern/Literae)', () => {
    const n = norm({
      absaetze: [
        absatz({
          saetze: [
            satz({
              eintraege: [
                listenEintrag({ text: 'a', untereintraege: [listenEintrag({ text: 'bb' })] }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(normTextLaenge(n)).toBe(3);
  });

  it('zählt eigene Sätze eines Listen-Eintrags statt dessen text, wenn saetze gesetzt ist', () => {
    const n = norm({
      absaetze: [
        absatz({
          saetze: [
            satz({
              eintraege: [
                listenEintrag({ text: 'wird ignoriert', saetze: [satz({ text: 'abcd' })] }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(normTextLaenge(n)).toBe(4);
  });

  it('MUTATIONSTEST: zählt Sätze aus Unterabsätzen (abs.unterabsaetze), nicht nur abs.saetze', () => {
    const n = norm({
      absaetze: [
        absatz({
          saetze: [], // laut Typ leer, wenn unterabsaetze gesetzt ist
          unterabsaetze: [
            unterabsatz({ bezeichnung: '1', saetze: [satz({ text: 'abc' })] }),
            unterabsatz({ bezeichnung: '2', saetze: [satz({ text: 'de' })] }),
          ],
        }),
      ],
    });
    expect(normTextLaenge(n)).toBe(5);
  });

  it('eine Norm ganz ohne Inhalt hat Länge 0', () => {
    expect(normTextLaenge(norm())).toBe(0);
  });
});

describe('gesetzNormen', () => {
  it('MUTATIONSTEST: filtert Überschriften heraus, liefert nur type "norm" (exakte Reihenfolge/Inhalt)', () => {
    const n1 = norm({ id: 'n1' });
    const n2 = norm({ id: 'n2' });
    const g = gesetz([
      { typ: 'ueberschrift', data: ueberschrift() },
      { typ: 'norm', data: n1 },
      { typ: 'ueberschrift', data: ueberschrift({ id: 'u2' }) },
      { typ: 'norm', data: n2 },
    ]);
    expect(gesetzNormen(g)).toEqual([n1, n2]);
  });

  it('leere elemente-Liste ergibt leere Liste', () => {
    expect(gesetzNormen(gesetz([]))).toEqual([]);
  });

  it('nur Überschriften, keine Normen, ergibt leere Liste', () => {
    expect(gesetzNormen(gesetz([{ typ: 'ueberschrift', data: ueberschrift() }]))).toEqual([]);
  });
});

describe('normTextLaenge – normalisiertes GesetzesXML', () => {
  it('zählt Haupttexte, Fortsetzungen und Unterlisten unabhängig von der Einrückung', () => {
    const inhalte = [
      '<absatz zahl="(1)"><satz zahl="1">Nach § 5:<nummer zahl="1.">Erste Nummer<litera buchstabe="a)">Tiefer Text\u00a0bleibt.</litera>Ende Nummer.</nummer>Ende Satz.</satz></absatz><absatz zahl="(2)"><unterabsatz>Weiterer Text.</unterabsatz></absatz>',
      `<absatz zahl="(1)">
        <satz zahl="1">
          Nach   §\t5:
          <nummer zahl="1.">
            Erste\r\n  Nummer
            <litera buchstabe="a)">
              Tiefer   Text\u00a0bleibt.
            </litera>
            Ende   Nummer.
          </nummer>
          Ende   Satz.
        </satz>
      </absatz>
      <absatz zahl="(2)">
        <unterabsatz>
          Weiterer   Text.
        </unterabsatz>
      </absatz>`,
    ];
    const erwarteteLaenge = [
      'Nach § 5:',
      'Erste Nummer',
      'Tiefer Text\u00a0bleibt.',
      'Ende Nummer.',
      'Ende Satz.',
      'Weiterer Text.',
    ].reduce((summe, text) => summe + text.length, 0);

    for (const inhalt of inhalte) {
      const g = parseGesetzesXML(
        `<gesetz id="laenge"><infos><normgeber>de-bund</normgeber><langtitel>Längentest</langtitel><kurztitel>LG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text>${inhalt}</text></norm></inhalt></gesetz>`,
      );
      expect(g).not.toBeNull();
      expect(normTextLaenge(g!.elemente[0]!.data as NormDarstellung)).toBe(erwarteteLaenge);
    }
  });
});

describe('berechneElementstand', () => {
  it('bewahrt die bisherige Berechnung für Normen', () => {
    const n = norm({ titel: 'Titel', absaetze: [absatz({ saetze: [satz({ text: 'Text' })] })] });
    expect(berechneElementstand(n)).toEqual({ titel: 'Titel', textlaenge: 4 });
  });
  it.each([undefined, 'Titel'])('zählt Bezeichnung und Titel einer Überschrift (%s)', (titel) => {
    const u = ueberschrift({ bezeichnung: 'Teil 1', titel });
    expect(berechneElementstand(u)).toEqual({ titel, textlaenge: 6 + (titel?.length ?? 0) });
  });
});
