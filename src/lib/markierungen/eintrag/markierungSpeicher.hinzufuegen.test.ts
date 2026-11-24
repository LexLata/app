import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungSpeicher.hinzufuegen.test.ts
//
// Unit-Tests für die reinen, exportierten Helfer aus
// markierungSpeicher.hinzufuegen.ts: bereichUeberlappt,
// pruefeMarkierungAnStelle, istIdentischeAllgemeineMarkierung,
// deckenVollstaendigAb, splitAlteEintraegeImBereich. Alle fünf sind IO-frei (keine
// Persistenzschicht beteiligt) und bilden zusammen die Konkurrenz-/
// Dopplungs-/Toggle-/Kombinier-/Split-Regeln, die vor bzw. während
// hinzufuegenMarkierung() angewendet werden (siehe Kopfkommentar dort und
// in markierungSpeicher.ts).
//
// deckenVollstaendigAb/splitAlteEintraegeImBereich waren ursprünglich
// modul-privat (enthalten aber die fachlich komplexeste Logik der Datei:
// Toggle-Aus-Erkennung, Kombinieren/Aufsplitten überlappender Bereiche) –
// auf Wunsch für diese Tests exportiert (siehe Kopfkommentar dort), reine
// Sichtbarkeits-Änderung ohne Verhaltensänderung.
//
// BEWUSST NICHT hier getestet: hinzufuegenMarkierung() selbst (die
// öffentliche Orchestrierungsfunktion) – hängt direkt an
// ladeEintraege()/schreibeEintraege() (Datei-I/O über die Persistenzschicht),
// dasselbe Problem wie bei importindexSuche.ts, dort bewusst nicht getestet
// (siehe Absprache).

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { describe, expect, it } from 'vitest';
import { parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  bereichUeberlappt,
  deckenVollstaendigAb,
  istIdentischeAllgemeineMarkierung,
  pruefeMarkierungAnStelle,
  splitAlteEintraegeImBereich,
} from './markierungSpeicher.hinzufuegen';
import type { MarkierungsEintrag } from './markierungSpeicher';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

function eintrag(overrides: Parameters<typeof markierungsEintrag>[0] = {}): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
      },
      bezugstext: 'Text',
    },

    ...overrides,
  });
}

describe('bereichUeberlappt', () => {
  it('überlappende Bereiche derselben Norm/Position -> true', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 3, zeichenbereichEnde: 8 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(true);
  });

  it('Edge-Case: sich berührende, aber nicht überlappende Bereiche ([0,5) und [5,10)) -> false', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 5, zeichenbereichEnde: 10 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(false);
  });

  it('identische Bereiche überlappen', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, { ...a })).toBe(true);
  });

  it('ein Bereich enthält den anderen vollständig -> true', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 10 },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 3, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(true);
  });

  it('gleicher Zeichen-Bereich, aber unterschiedliche bezeichnung (verschiedene Normen) -> false', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 2'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(false);
  });

  it('gleicher Zeichen-Bereich und bezeichnung, aber unterschiedlicher Textpfad (verschiedener Absatz) -> false', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(2)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(false);
  });

  it('a ohne zeichenbereichStart/zeichenbereichEnde (allgemeiner Bezug) -> false', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(false);
  });

  it('b ohne zeichenbereichStart/zeichenbereichEnde -> false', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
    };
    expect(bereichUeberlappt(a, b)).toBe(false);
  });

  it('räumlich getrennte Bereiche ohne jede Berührung -> false', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 20, zeichenbereichEnde: 25 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(false);
  });

  it('MUTATIONSTEST: gespiegelter Berührungsfall (b vor a, [0,5) und [5,10)) -> false – Edge-Case oben deckte nur die Reihenfolge a-vor-b ab, bei der die zweite Bedingung bereits false ist', () => {
    const a = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 5, zeichenbereichEnde: 10 },
        bezugstext: '',
      },
    };
    const b = {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
        bezugstext: '',
      },
    };
    expect(bereichUeberlappt(a, b)).toBe(false);
  });
});

describe('pruefeMarkierungAnStelle', () => {
  describe('blockiertNeueMarkierung', () => {
    it('true, wenn ein bestehender "verweismarkierung" überlappt', () => {
      const bisherige = [
        eintrag({
          typ: 'verweismarkierung',
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: normtextPfad({ absatz: '(1)' }),
              zeichenbereichStart: 2,
              zeichenbereichEnde: 6,
            },
            bezugstext: '',
          },
        }),
      ];
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      };
      expect(pruefeMarkierungAnStelle(bisherige, bereich).blockiertNeueMarkierung).toBe(true);
    });

    it('true, wenn ein bestehender "kommentar" überlappt', () => {
      const bisherige = [
        eintrag({
          typ: 'kommentar',
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: normtextPfad({ absatz: '(1)' }),
              zeichenbereichStart: 2,
              zeichenbereichEnde: 6,
            },
            bezugstext: '',
          },
        }),
      ];
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      };
      expect(pruefeMarkierungAnStelle(bisherige, bereich).blockiertNeueMarkierung).toBe(true);
    });

    it('Edge-Case: false, wenn NUR eine "unterstreichung"/"hervorhebung" überlappt (Konkurrenz-Regel gilt nur für verweis/kommentar)', () => {
      const bisherige = [
        eintrag({
          typ: 'unterstreichung',
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: normtextPfad({ absatz: '(1)' }),
              zeichenbereichStart: 2,
              zeichenbereichEnde: 6,
            },
            bezugstext: '',
          },
        }),
        eintrag({
          typ: 'hervorhebung',
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: normtextPfad({ absatz: '(1)' }),
              zeichenbereichStart: 2,
              zeichenbereichEnde: 6,
            },
            bezugstext: '',
          },
        }),
      ];
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      };
      expect(pruefeMarkierungAnStelle(bisherige, bereich).blockiertNeueMarkierung).toBe(false);
    });

    it('false ohne jede Überlappung', () => {
      const bisherige = [
        eintrag({
          typ: 'verweismarkierung',
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: normtextPfad({ absatz: '(1)' }),
              zeichenbereichStart: 20,
              zeichenbereichEnde: 25,
            },
            bezugstext: '',
          },
        }),
      ];
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      };
      expect(pruefeMarkierungAnStelle(bisherige, bereich).blockiertNeueMarkierung).toBe(false);
    });

    it('Edge-Case: bereich ohne zeichenbereichStart/zeichenbereichEnde (allgemeiner Verweis/Kommentar) -> immer false, unabhängig vom Bestand', () => {
      const bisherige = [
        eintrag({
          typ: 'verweismarkierung',
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: normtextPfad({ absatz: '(1)' }),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 100,
            },
            bezugstext: '',
          },
        }),
      ];
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      };
      expect(pruefeMarkierungAnStelle(bisherige, bereich).blockiertNeueMarkierung).toBe(false);
    });

    it('leerer Bestand -> false', () => {
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      };
      expect(pruefeMarkierungAnStelle([], bereich).blockiertNeueMarkierung).toBe(false);
    });
  });

  describe('ueberlappende', () => {
    it('liefert ALLE überlappenden Typen (anders als blockiertNeueMarkierung), z.B. unterstreichung UND verweis gleichzeitig', () => {
      const unterstreichung = eintrag({
        typ: 'unterstreichung',
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      });
      const verweis = eintrag({
        typ: 'verweismarkierung',
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 2,
            zeichenbereichEnde: 4,
          },
          bezugstext: '',
        },
      });
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 1,
            zeichenbereichEnde: 3,
          },
          bezugstext: '',
        },
      };
      expect(pruefeMarkierungAnStelle([unterstreichung, verweis], bereich).ueberlappende).toEqual([
        unterstreichung,
        verweis,
      ]);
    });

    it('nicht überlappende Einträge werden nicht zurückgegeben', () => {
      const treffer = eintrag({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      });
      const kandidatOhneUeberlappung = eintrag({
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 20,
            zeichenbereichEnde: 25,
          },
          bezugstext: '',
        },
      });
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      };
      expect(
        pruefeMarkierungAnStelle([treffer, kandidatOhneUeberlappung], bereich).ueberlappende,
      ).toEqual([treffer]);
    });

    it('Edge-Case: bereich ohne zeichenbereichStart/zeichenbereichEnde -> leeres Array', () => {
      const bisherige = [
        eintrag({
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: normtextPfad({ absatz: '(1)' }),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 5,
            },
            bezugstext: '',
          },
        }),
      ];
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      };
      expect(pruefeMarkierungAnStelle(bisherige, bereich).ueberlappende).toEqual([]);
    });

    it('leerer Bestand -> leeres Array', () => {
      const bereich = {
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({ absatz: '(1)' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 5,
          },
          bezugstext: '',
        },
      };
      expect(pruefeMarkierungAnStelle([], bereich).ueberlappende).toEqual([]);
    });
  });
});

describe('istIdentischeAllgemeineMarkierung', () => {
  it('zwei inhaltlich identische Verweise (gleiche bezeichnung, Pfad, verweistext) -> true', () => {
    const a: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'GG', verweisziele: [] },
    });
    const b: MarkierungsEintrag = markierungsEintrag({ ...a });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(true);
  });

  it('zwei inhaltlich identische Kommentare (gleicher kommentarText) -> true', () => {
    const a: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'Anmerkung',
    });
    const b: MarkierungsEintrag = markierungsEintrag({ ...a });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(true);
  });

  it('unterschiedlicher Typ -> false, obwohl sonst alles gleich', () => {
    const a: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'x',
    });
    const b: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'x',
    });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(false);
  });

  it('unterschiedliche bezeichnung -> false', () => {
    const a: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'Anmerkung',
    });
    const b: MarkierungsEintrag = markierungsEintrag({
      ...a,
      ausgangsstelle: normAusgangsstelle('§ 2'),
    });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(false);
  });

  it('verwirft unvollständige Textbezüge statt sie als pauschale Duplikate zu behandeln', () => {
    for (const absatz of ['(1)', '(2)']) {
      const gelesen = parseEintraege(
        `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><textstelle><absatz>${absatz}</absatz></textstelle><kommentartext>Anmerkung</kommentartext></kommentar></inhalt></markierungen>`,
      );
      expect(gelesen.eintraege).toEqual([]);
      expect(gelesen.befunde).toMatchObject([{ fall: 'textbezugUngueltig' }]);
    }
  });

  it('verweis: unterschiedlicher verweistext -> false', () => {
    const a: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'GG', verweisziele: [] },
    });
    const b: MarkierungsEintrag = markierungsEintrag({
      ...a,
      verweisinhalt: { verweistext: 'BGB', verweisziele: [] },
    });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(false);
  });

  it('kommentar: unterschiedlicher kommentarText -> false', () => {
    const a: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'A',
    });
    const b: MarkierungsEintrag = markierungsEintrag({ ...a, kommentarText: 'B' });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(false);
  });

  it('MUTATIONSTEST: typ "verweismarkierung" ohne verweisinhalt (inkonsistente/veraltete Daten) -> false statt Absturz', () => {
    const a: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
    });
    const b: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'GG', verweisziele: [] },
    });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(false);
    expect(istIdentischeAllgemeineMarkierung(b, a)).toBe(false);
  });

  it('Edge-Case: typ "unterstreichung"/"hervorhebung" (weder verweis noch kommentar) -> immer false, unabhängig von sonstiger Übereinstimmung', () => {
    const a: MarkierungsEintrag = eintrag({ typ: 'unterstreichung' });
    const b: MarkierungsEintrag = markierungsEintrag({ ...a });
    expect(istIdentischeAllgemeineMarkierung(a, b)).toBe(false);
  });
});

function markierung(
  zeichenbereichStart: number,
  zeichenbereichEnde: number,
  bezugstext?: string,
): MarkierungsEintrag {
  return eintrag({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: zeichenbereichStart,
        zeichenbereichEnde: zeichenbereichEnde,
      },
      bezugstext: bezugstext ?? 'x'.repeat(zeichenbereichEnde - zeichenbereichStart),
    },
  });
}

describe('deckenVollstaendigAb', () => {
  it('leere Eingabe -> false', () => {
    expect(deckenVollstaendigAb([], 0, 10)).toBe(false);
  });

  it('ein Eintrag deckt den Bereich exakt ab -> true', () => {
    expect(deckenVollstaendigAb([markierung(0, 10)], 0, 10)).toBe(true);
  });

  it('ein Eintrag deckt den Bereich nur teilweise ab -> false', () => {
    expect(deckenVollstaendigAb([markierung(0, 5)], 0, 10)).toBe(false);
  });

  it('Edge-Case: zwei Einträge mit Lücke dazwischen decken NICHT ab', () => {
    expect(deckenVollstaendigAb([markierung(0, 4), markierung(6, 10)], 0, 10)).toBe(false);
  });

  it('zwei direkt angrenzende Einträge (keine Lücke, keine Überlappung) decken vollständig ab', () => {
    expect(deckenVollstaendigAb([markierung(0, 5), markierung(5, 10)], 0, 10)).toBe(true);
  });

  it('zwei überlappende Einträge decken ab', () => {
    expect(deckenVollstaendigAb([markierung(0, 6), markierung(4, 10)], 0, 10)).toBe(true);
  });

  it('ein Eintrag reicht über den Zielbereich hinaus (links UND rechts) -> deckt trotzdem ab', () => {
    expect(deckenVollstaendigAb([markierung(0, 20)], 5, 10)).toBe(true);
  });

  it('Edge-Case: der erste (sortierte) Eintrag beginnt bereits NACH start -> Lücke am Anfang, false', () => {
    expect(deckenVollstaendigAb([markierung(2, 10)], 0, 10)).toBe(false);
  });

  it('Reihenfolge der Eingabe spielt keine Rolle (wird intern sortiert)', () => {
    expect(
      deckenVollstaendigAb([markierung(6, 10), markierung(0, 4), markierung(4, 6)], 0, 10),
    ).toBe(true);
  });

  it('MUTATIONSTEST: erster Eintrag deckt den Zielbereich bereits vollständig ab, ein späterer, disjunkter Eintrag darf das Ergebnis nicht verfälschen', () => {
    // Ohne den frühen return-true-Ausstieg direkt nach vollständiger Abdeckung
    // würde die Schleife weiterlaufen und beim späteren, weit entfernten
    // Eintrag fälschlich eine "Lücke" erkennen (dessen zeichenbereichStart liegt
    // oberhalb des längst abgedeckten abgedecktBis).
    expect(deckenVollstaendigAb([markierung(0, 20), markierung(50, 60)], 0, 10)).toBe(true);
  });
});

describe('splitAlteEintraegeImBereich', () => {
  it('Bereich am Ende des Alt-Eintrags -> nur linkes Rest-Stück', () => {
    const alt = markierung(0, 10);
    const { entfernt, rest } = splitAlteEintraegeImBereich([alt], 5, 10);
    expect(entfernt).toEqual([alt]);
    expect(rest).toEqual([
      {
        ...alt,
        erstellt: expect.any(String),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { ...alt.bezug.textstelle!, zeichenbereichEnde: 5 },
          bezugstext: 'xxxxx',
        },
      },
    ]);
  });

  it('Bereich am Anfang des Alt-Eintrags -> nur rechtes Rest-Stück', () => {
    const alt = markierung(0, 10);
    const { rest } = splitAlteEintraegeImBereich([alt], 0, 5);
    expect(rest).toEqual([
      {
        ...alt,
        erstellt: expect.any(String),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { ...alt.bezug.textstelle!, zeichenbereichStart: 5 },
          bezugstext: 'xxxxx',
        },
      },
    ]);
  });

  it('Bereich mittig im Alt-Eintrag -> beide Rest-Stücke (links UND rechts)', () => {
    const alt = markierung(0, 10);
    const { rest } = splitAlteEintraegeImBereich([alt], 3, 7);
    expect(rest).toEqual([
      {
        ...alt,
        erstellt: expect.any(String),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { ...alt.bezug.textstelle!, zeichenbereichEnde: 3 },
          bezugstext: 'xxx',
        },
      },
      {
        ...alt,
        erstellt: expect.any(String),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { ...alt.bezug.textstelle!, zeichenbereichStart: 7 },
          bezugstext: 'xxx',
        },
      },
    ]);
  });

  it('Edge-Case: Alt-Eintrag liegt VOLLSTÄNDIG im Bereich -> kein Rest-Stück, aber trotzdem in entfernt', () => {
    const alt = markierung(3, 7);
    const { entfernt, rest } = splitAlteEintraegeImBereich([alt], 0, 10);
    expect(entfernt).toEqual([alt]);
    expect(rest).toEqual([]);
  });

  it('mehrere Alt-Einträge werden unabhängig voneinander behandelt, Ergebnisse gesammelt', () => {
    const altA = markierung(0, 10);
    const altB = markierung(20, 30);
    const { entfernt, rest } = splitAlteEintraegeImBereich([altA, altB], 5, 25);
    expect(entfernt).toEqual([altA, altB]);
    expect(rest).toEqual([
      {
        ...altA,
        erstellt: expect.any(String),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { ...altA.bezug.textstelle!, zeichenbereichEnde: 5 },
          bezugstext: 'xxxxx',
        },
      },
      {
        ...altB,
        erstellt: expect.any(String),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { ...altB.bezug.textstelle!, zeichenbereichStart: 25 },
          bezugstext: 'xxxxx',
        },
      },
    ]);
  });

  it('leeres alt-Array -> beide Ergebnislisten leer', () => {
    expect(splitAlteEintraegeImBereich([], 0, 10)).toEqual({ entfernt: [], rest: [] });
  });

  it('Fallback OHNE aktuellesElement: bezugstext der Rest-Stücke wird aus dem (ggf. veralteten) Alt-bezugstext herausgeschnitten', () => {
    const alt = markierung(0, 10, 'ABCDEFGHIJ');
    const { rest } = splitAlteEintraegeImBereich([alt], 5, 10);
    expect(rest[0]!.bezug.bezugstext).toBe('ABCDE');
  });

  it('MUTATIONSTEST: Fallback bei zeichenbereichStart !== 0 – bisherige Tests nutzten stets zeichenbereichStart 0, wodurch "start - zeichenbereichStart" und "start + zeichenbereichStart" zufällig gleich waren', () => {
    const alt = markierung(3, 10, 'ABCDEFG'); // 7 Zeichen, deckt [3,10)
    const { rest } = splitAlteEintraegeImBereich([alt], 5, 10);
    // slice(0, 5 - 3) = slice(0, 2) = 'AB'
    expect(rest[0]!.bezug.bezugstext).toBe('AB');
  });

  it('MUTATIONSTEST: Fallback OHNE aktuellesElement und OHNE bezugstext (bezugstext?.slice) -> bezugstext bleibt undefined statt Absturz', () => {
    // Bewusst NICHT der markierung()-Helfer: der setzt bei fehlendem
    // bezugstext per ?? einen Default – hier soll das Feld tatsächlich fehlen.
    const alt: MarkierungsEintrag = eintrag({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 10,
        },
        bezugstext: '',
      },
    });
    const { rest } = splitAlteEintraegeImBereich([alt], 5, 10);
    expect(rest[0]!.bezug.bezugstext).toBe('');
  });

  it('MUTATIONSTEST: rechtes Rest-Stück ohne aktuellesElement und ohne bezugstext -> bezugstext bleibt undefined statt Absturz', () => {
    const alt: MarkierungsEintrag = eintrag({
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 10,
        },
        bezugstext: '',
      },
    });
    const { rest } = splitAlteEintraegeImBereich([alt], 0, 5);
    expect(rest[0]!.bezug.bezugstext).toBe('');
  });

  it('Edge-Case: MIT aktuellesElement wird bezugstext der Rest-Stücke frisch aus dem AKTUELLEN Text abgeleitet statt aus dem (ggf. veralteten) Alt-bezugstext geschnitten', () => {
    const alt: MarkierungsEintrag = markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('irrelevant für Bereich § bezeichnung'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: bereichPfad('bezeichnung'),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 10,
        },
        bezugstext: 'VERALTET!!',
      },
    });
    const element: NormDarstellung = normaleNorm({
      id: 'n1',
      xmlId: 'n1',
      bezeichnung: 'Der Titel Text',
      absaetze: [],
    });
    const { rest } = splitAlteEintraegeImBereich([alt], 5, 10, element);
    // aktuellerTextAnPfad liest bei bereich=bezeichnung aus element.bezeichnung
    // statt aus dem (hier absichtlich falschen) alt.bezugstext.
    expect(rest[0]!.bezug.bezugstext).toBe('Der T');
  });
});

describe('Präfix in Konkurrenzprüfungen', () => {
  it('Überlappung und Dublette nur bei gleichem Präfix', () => {
    const a = eintrag({
      ausgangsstelle: normAusgangsstelle('§ 1'),
    });
    const b = markierungsEintrag({
      ...a,
      ausgangsstelle: normAusgangsstelle(
        ['Anhang', bezeichnungAusgangsstelle(a.ausgangsstelle).replace(/^\S+\s+/, '')]
          .filter(Boolean)
          .join(' '),
      ),
    });
    expect(bereichUeberlappt(a, b)).toBe(false);
    expect(bereichUeberlappt(a, { ...a })).toBe(true);
    expect(pruefeMarkierungAnStelle([a], b).ueberlappende).toEqual([]);
    const k = markierungsEintrag({
      ...a,
      typ: 'kommentar' as const,
      kommentarText: 'x',
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
    });
    expect(
      istIdentischeAllgemeineMarkierung(
        k,
        markierungsEintrag({
          ...k,
          ausgangsstelle: normAusgangsstelle(
            ['Anhang', bezeichnungAusgangsstelle(k.ausgangsstelle).replace(/^\S+\s+/, '')]
              .filter(Boolean)
              .join(' '),
          ),
        }),
      ),
    ).toBe(false);
    expect(istIdentischeAllgemeineMarkierung(k, markierungsEintrag({ ...k }))).toBe(true);
  });
});

it('trennt gleichnamige Norm und Überschrift bei Konkurrenz und Duplikaten', () => {
  const u = eintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: ueberschriftAusgangsstelle('010'),

    kommentarText: 'Text',
  });
  const n = markierungsEintrag({
    ...u,
    ausgangsstelle: normAusgangsstelle(bezeichnungAusgangsstelle(u.ausgangsstelle)),
  });
  expect(bereichUeberlappt(u, n)).toBe(false);
  expect(pruefeMarkierungAnStelle([n], u)).toEqual({
    ueberlappende: [],
    blockiertNeueMarkierung: false,
  });
  expect(
    istIdentischeAllgemeineMarkierung(
      markierungsEintrag({
        ...u,
        bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      }),
      markierungsEintrag({
        ...n,
        bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      }),
    ),
  ).toBe(false);
});

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'entfernt beim Ausschalten von %s angrenzende markierte Räume',
  (typ) => {
    const text = 'Der \u00a0 nette  Verkäufer';
    const alt = eintrag({
      typ,
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: text.length,
        },
        bezugstext: text,
      },
    });
    expect(
      splitAlteEintraegeImBereich([alt], 6, 11, undefined, true).rest.map(
        (e) => e.bezug.bezugstext,
      ),
    ).toEqual(['Der', 'Verkäufer']);
    expect(splitAlteEintraegeImBereich([alt], 0, 3, undefined, true).rest[0]).toMatchObject({
      bezug: { textstelle: { zeichenbereichStart: 6 }, bezugstext: 'nette  Verkäufer' },
    });
  },
);
it('entfernt bei ausgeschalteten Markierungen keine Zeilenumbrüche', () => {
  const alt = eintrag({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '(1)' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 6,
      },
      bezugstext: 'A \n Bx',
    },
  });
  expect(splitAlteEintraegeImBereich([alt], 4, 6, undefined, true).rest[0]?.bezug.bezugstext).toBe(
    'A \n',
  );
});
