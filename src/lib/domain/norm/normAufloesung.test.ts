// normAufloesung.test.ts
//
// Tests für normAufloesung.ts (kolokiert, Vitest). Baut GesetzDarstellung/
// DarstellungsElement-Fixtures von Hand auf (analog zu
// normStrukturPruefung.test.ts) – reine, DOM-freie Logik, keine echten
// XML-Dateien nötig. Deckt beide Schichten ab: Auflösung (bezeichnung ↔
// xmlId, inkl. EGBGB-Zwei-Stufen-Modus und Bereichs-§§) und Navigation
// (xmlIdZuSprungZiel, inkl. Stack-Verhalten bei verschachtelten
// Überschriften/Gliederungsartikeln).

import { normDarstellung, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import { elementSuchBezeichnung } from '@/lib/domain/gesetzDarstellungAuswertung';
import {
  istArtikelBezeichnung,
  praefixVonBezeichnung,
  praefixeVonNorm,
  findeEindeutigeNorm,
  loeseNormEindeutigAuf,
  xmlIdZuSprungZiel,
  findeUebergeordnetenArtikel,
  mitArtikelPraefix,
  vollstaendigeBezeichnung,
} from '@/lib/domain/norm/normAufloesung';
import type {
  DarstellungsElement,
  GesetzDarstellung,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';

// ---------------------------------------------------------------------------
// Kompakte Test-Factories – nur die für normAufloesung relevanten Felder
// gesetzt (analog zum Muster in normStrukturPruefung.test.ts).
// ---------------------------------------------------------------------------

function norm(
  xmlId: string,
  bezeichnung: string,
  optionen: {
    gliederungsEbene?: number;
    art?: NormDarstellung['art'];
    ueberschriftartig?: boolean;
    status?: NormDarstellung['status'];
  } = {},
): DarstellungsElement {
  return {
    typ: 'norm',
    data: normDarstellung({
      id: `id-${xmlId}`,
      xmlId,
      bezeichnung,
      status: optionen.status,
      ...(optionen.art === 'erwaegungsgrund'
        ? { art: 'erwaegungsgrund' }
        : optionen.gliederungsEbene !== undefined
          ? {
              art: 'gliederungsartikel',
              gliederungsEbene: optionen.gliederungsEbene,
              ueberschriftartig: false,
            }
          : { art: 'normal' }),
    }),
  };
}

function ueberschrift(
  xmlId: string,
  ebene: number,
  titel?: string,
  bezeichnung = `B-${xmlId}`,
): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: { id: `id-${xmlId}`, xmlId, bezeichnung, titel, ebene, gliederungskennzahl: '0' },
  };
}

function gesetz(elemente: DarstellungsElement[], kurztitel = 'TestG'): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: elemente.some(
      (el) => el.typ === 'norm' && el.data.art === 'gliederungsartikel',
    ),
    elemente,
  });
}

// ---------------------------------------------------------------------------
// Schicht 1: kleine Textbausteine
// ---------------------------------------------------------------------------

describe('elementSuchBezeichnung', () => {
  it('liefert bei einer Norm die bezeichnung', () => {
    expect(elementSuchBezeichnung(norm('433', '§ 433'))).toBe('§ 433');
  });

  it('liefert bei einer Überschrift den titel', () => {
    expect(elementSuchBezeichnung(ueberschrift('u1', 1, 'Erster Teil'))).toBe('Erster Teil');
  });

  it('liefert undefined, wenn eine Überschrift keinen titel hat', () => {
    expect(elementSuchBezeichnung(ueberschrift('u1', 1))).toBeUndefined();
  });
});

describe('istArtikelBezeichnung', () => {
  it('erkennt "Art." und "Artikel" (mit Leerzeichen danach)', () => {
    expect(istArtikelBezeichnung('Art. 1')).toBe(true);
    expect(istArtikelBezeichnung('Artikel 1')).toBe(true);
  });

  it('erkennt § NICHT als Artikel', () => {
    expect(istArtikelBezeichnung('§ 1')).toBe(false);
  });

  it('ist case-insensitiv', () => {
    expect(istArtikelBezeichnung('art. 5')).toBe(true);
  });

  it('EDGE CASE: "Art" MUSS von einem Leerzeichen gefolgt sein – "Artikelserie" (kein Leerzeichen) trifft NICHT', () => {
    expect(istArtikelBezeichnung('Artikelserie')).toBe(false);
  });

  it('toleriert führenden Whitespace', () => {
    expect(istArtikelBezeichnung('  Art. 5')).toBe(true);
  });

  it('MUTATIONSTEST: kein Treffer mitten im String – der ^-Anker verhindert einen Fund innerhalb eines umgebenden Texts', () => {
    expect(istArtikelBezeichnung('Vgl. Art. 1')).toBe(false);
  });

  it('MUTATIONSTEST: "Art" ohne Punkt und ohne "ikel", nur gefolgt von Leerzeichen, gilt ebenfalls als Artikel', () => {
    expect(istArtikelBezeichnung('Art 1')).toBe(true);
  });
});

describe('praefixVonBezeichnung', () => {
  it('extrahiert das Symbol vor der letzten Zahl', () => {
    expect(praefixVonBezeichnung('§ 6')).toBe('§');
    expect(praefixVonBezeichnung('Art. 229')).toBe('Art.');
  });

  it('EDGE CASE: reine Zahl ohne jeden Präfix-Text ergibt einen leeren String', () => {
    expect(praefixVonBezeichnung('433')).toBe('');
  });

  it('ist bewusst NICHT auf "§"/"Art." hartkodiert – funktioniert mit beliebigem Präfix-Text', () => {
    expect(praefixVonBezeichnung('Anhang 1')).toBe('Anhang');
  });

  it('MUTATIONSTEST: trailing Whitespace nach der Zahl darf das Ergebnis nicht verfälschen', () => {
    expect(praefixVonBezeichnung('433   ')).toBe('');
    expect(praefixVonBezeichnung('§ 6   ')).toBe('§');
  });
});

// ---------------------------------------------------------------------------
// xmlIdZuSprungZiel – Vorfahren-Stack
// ---------------------------------------------------------------------------

describe('xmlIdZuSprungZiel', () => {
  function struktur() {
    return [
      ueberschrift('u1', 1, 'Teil 1'),
      ueberschrift('u2', 2, 'Kapitel 1'),
      norm('n1', '§ 1'),
      ueberschrift('u3', 2, 'Kapitel 2'),
      norm('n2', '§ 2'),
      ueberschrift('u4', 1, 'Teil 2'),
      norm('n3', '§ 3'),
    ];
  }

  it('findet eine Norm und liefert alle umschließenden Vorfahren, von außen nach innen', () => {
    expect(xmlIdZuSprungZiel(struktur(), 'n1')).toEqual({
      index: 2,
      vorfahrenIds: ['id-u1', 'id-u2'],
    });
  });

  it('EDGE CASE: eine Geschwister-Überschrift GLEICHER oder höherer Ebene ersetzt die vorherige im Stack (kein Anhäufen)', () => {
    // Kapitel 2 (Ebene 2) ersetzt Kapitel 1 (ebenfalls Ebene 2), Teil 1
    // (Ebene 1) bleibt als äußerer Vorfahre erhalten.
    expect(xmlIdZuSprungZiel(struktur(), 'n2')).toEqual({
      index: 4,
      vorfahrenIds: ['id-u1', 'id-u3'],
    });
  });

  it('EDGE CASE: eine Überschrift NIEDRIGERER Ebene poppt ALLE tieferen Vorfahren vom Stack', () => {
    // Teil 2 (Ebene 1) poppt sowohl Teil 1 als auch Kapitel 2 vom Stack.
    expect(xmlIdZuSprungZiel(struktur(), 'n3')).toEqual({ index: 6, vorfahrenIds: ['id-u4'] });
  });

  it('findet auch eine Überschrift selbst als Ziel (nicht nur Normen)', () => {
    expect(xmlIdZuSprungZiel(struktur(), 'u3')).toEqual({
      index: 3,
      vorfahrenIds: ['id-u1', 'id-u2'],
    });
  });

  it('Gliederungsartikel (gliederungsEbene gesetzt) verhalten sich für den Stack wie Überschriften', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-1', 'Art. 229 § 1'),
    ];
    expect(xmlIdZuSprungZiel(elemente, '229-1')).toEqual({ index: 1, vorfahrenIds: ['id-229'] });
  });

  it('MUTATIONSTEST: der Gliederungsartikel selbst ist als Sprungziel auffindbar (nicht nur seine Kinder)', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-1', 'Art. 229 § 1'),
    ];
    expect(xmlIdZuSprungZiel(elemente, '229')).toEqual({ index: 0, vorfahrenIds: [] });
  });

  it('gibt null zurück, wenn die xmlId nicht existiert', () => {
    expect(xmlIdZuSprungZiel(struktur(), 'xxx')).toBeNull();
  });

  it('leere elemente-Liste ergibt null', () => {
    expect(xmlIdZuSprungZiel([], 'n1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Schicht 3: Anzeige – Artikel-Präfix
// ---------------------------------------------------------------------------

describe('findeUebergeordnetenArtikel', () => {
  it('findet den zuletzt gesehenen Gliederungsartikel vor der gesuchten Norm', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-1', '§ 1'),
      norm('229-2', '§ 2'),
    ];
    expect(findeUebergeordnetenArtikel(elemente, '229-2')?.xmlId).toBe('229');
  });

  it('EDGE CASE: ignoriert dazwischenliegende Überschriften (bricht dort NICHT ab)', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      ueberschrift('u1', 2, 'Zwischenüberschrift'),
      norm('229-1', '§ 1'),
    ];
    expect(findeUebergeordnetenArtikel(elemente, '229-1')?.xmlId).toBe('229');
  });

  it('gibt null zurück, wenn gar kein Gliederungsartikel im Gesetz vorkommt (normales Gesetz)', () => {
    const elemente = [norm('433', '§ 433')];
    expect(findeUebergeordnetenArtikel(elemente, '433')).toBeNull();
  });

  it('aktualisiert sich beim Wechsel zwischen mehreren Artikeln (nimmt immer den zuletzt gesehenen)', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-1', '§ 1'),
      norm('249', 'Art. 249', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('249-1', '§ 1'),
    ];
    expect(findeUebergeordnetenArtikel(elemente, '249-1')?.xmlId).toBe('249');
  });

  it('MUTATIONSTEST: eine Überschrift, deren xmlId zufällig mit der gesuchten normXmlId kollidiert, ist KEIN Treffer', () => {
    const elemente = [
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      ueberschrift('imposter', 1),
    ];
    expect(findeUebergeordnetenArtikel(elemente, 'imposter')).toBeNull();
  });
});

describe('mitArtikelPraefix', () => {
  function egbgb() {
    return gesetz(
      [
        norm('229', 'Art. 229', {
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          gliederungsEbene: 0,
        }),
        norm('229-1', '§ 1'),
      ],
      'EGBGB',
    );
  }

  it('stellt den Artikel voran, wenn die Norm ein § innerhalb eines Gliederungsartikels ist', () => {
    expect(mitArtikelPraefix(egbgb(), '229-1', '§ 1')).toBe('Art. 229 § 1');
  });

  it('EDGE CASE: der Gliederungsartikel selbst bekommt KEINEN weiteren Präfix (gliederungsEbene bereits gesetzt)', () => {
    expect(mitArtikelPraefix(egbgb(), '229', 'Art. 229')).toBe('Art. 229');
  });

  it('normale Norm ohne umschließenden Gliederungsartikel bleibt unverändert', () => {
    const g = gesetz([norm('433', '§ 433')]);
    expect(mitArtikelPraefix(g, '433', '§ 433')).toBe('§ 433');
  });

  it('gibt die eigene Bezeichnung unverändert zurück, wenn die xmlId nicht gefunden wird', () => {
    const g = gesetz([norm('433', '§ 433')]);
    expect(mitArtikelPraefix(g, 'xxx', '§ 433')).toBe('§ 433');
  });
});

describe('vollstaendigeBezeichnung', () => {
  it('kombiniert Artikel-Präfix und eigene Bezeichnung für §§ in Gliederungsartikeln', () => {
    const g = gesetz(
      [
        norm('229', 'Art. 229', {
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          gliederungsEbene: 0,
        }),
        norm('229-1', '§ 1'),
      ],
      'EGBGB',
    );
    expect(vollstaendigeBezeichnung(g, '229-1')).toBe('Art. 229 § 1');
  });

  it('gibt null zurück, wenn die xmlId nicht existiert', () => {
    const g = gesetz([norm('433', '§ 433')]);
    expect(vollstaendigeBezeichnung(g, 'xxx')).toBeNull();
  });

  it('gibt null zurück, wenn das gefundene Element kein Such-Bezeichnungsfeld hat (Überschrift ohne titel)', () => {
    const g = gesetz([ueberschrift('u1', 1)]);
    expect(vollstaendigeBezeichnung(g, 'u1')).toBeNull();
  });

  it('funktioniert auch für Überschriften mit titel (nutzt elementSuchBezeichnung)', () => {
    const g = gesetz([ueberschrift('u1', 1, 'Erster Teil')]);
    expect(vollstaendigeBezeichnung(g, 'u1')).toBe('Erster Teil');
  });
});

// ---------------------------------------------------------------------------
// praefixeVonNorm
// ---------------------------------------------------------------------------

describe('praefixeVonNorm', () => {
  it('liefert für ein § innerhalb eines Gliederungsartikels BEIDE Präfixe (Artikel + eigener)', () => {
    const g = gesetz(
      [
        norm('229', 'Art. 229', {
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          gliederungsEbene: 0,
        }),
        norm('229-1', '§ 1'),
      ],
      'EGBGB',
    );
    const eigeneNorm = (g.elemente[1] as { typ: 'norm'; data: NormDarstellung }).data;
    expect(praefixeVonNorm(g, eigeneNorm)).toEqual(['Art.', '§']);
  });

  it('liefert für eine normale Norm (kein Gliederungsartikel-Kontext) nur den eigenen Präfix', () => {
    const g = gesetz([norm('433', '§ 433')]);
    const eigeneNorm = (g.elemente[0] as { typ: 'norm'; data: NormDarstellung }).data;
    expect(praefixeVonNorm(g, eigeneNorm)).toEqual(['§']);
  });

  it('der Gliederungsartikel selbst (gliederungsEbene gesetzt) bekommt keinen zusätzlichen Artikel-Präfix vorangestellt', () => {
    const g = gesetz(
      [
        norm('229', 'Art. 229', {
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          gliederungsEbene: 0,
        }),
      ],
      'EGBGB',
    );
    const artikel = (g.elemente[0] as { typ: 'norm'; data: NormDarstellung }).data;
    expect(praefixeVonNorm(g, artikel)).toEqual(['Art.']);
  });
});

describe('findeEindeutigeNorm – strikte Zuordnung gespeicherter Bezeichnungen', () => {
  it('unterscheidet § und Anhang bei gleicher Kurzform, ohne Überschriften zu treffen', () => {
    const g = gesetz([
      ueberschrift('u', 1, 'Anhang 1'),
      norm('paragraph', '§ 1'),
      norm('anhang', 'Anhang 1'),
    ]);
    expect(findeEindeutigeNorm(g, '§ 1')?.xmlId ?? null).toBe('paragraph');
    expect(findeEindeutigeNorm(g, 'Anhang 1')?.xmlId ?? null).toBe('anhang');
  });

  it('berücksichtigt Gliederungsartikel und alle Präfixe', () => {
    const g = gesetz([
      norm('229', 'Art. 229', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('229-3', '§ 3'),
      norm('230', 'Art. 230', {
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        gliederungsEbene: 0,
      }),
      norm('230-3', '§ 3'),
    ]);
    expect(findeEindeutigeNorm(g, 'Art. 229 § 3')?.xmlId ?? null).toBe('229-3');
    expect(findeEindeutigeNorm(g, 'Art. 229')?.xmlId ?? null).toBe('229');
    expect(findeEindeutigeNorm(g, 'Art. 231 § 3')?.xmlId ?? null).toBeNull();
  });

  it('findet Bereichsnormen anhand des letzten Tokens und des vollständigen Präfixes', () => {
    const g = gesetz([norm('6', '§ 6'), norm('bereich', '§§ 3 bis 6', { status: 'weggefallen' })]);
    expect(findeEindeutigeNorm(g, '§§ 3 bis 6')?.xmlId ?? null).toBe('bereich');
    expect(findeEindeutigeNorm(g, '§§ 3 bis 4')?.xmlId ?? null).toBeNull();
  });

  it('normalisiert Whitespace in Kurzform, Präfix und vollständiger Bezeichnung', () => {
    const g = gesetz([norm('n', '  Anhang   1  ')]);
    expect(findeEindeutigeNorm(g, ' Anhang    1 ')?.xmlId ?? null).toBe('n');
  });

  it.each(['1', 'Art. § 1'])(
    'verweigert bei fehlendem oder unpassendem Präfix eine mehrdeutige Auflösung (%j)',
    (bezeichnung) => {
      const g = gesetz([norm('paragraph', '§ 1'), norm('anhang', 'Anhang 1')]);
      expect(findeEindeutigeNorm(g, bezeichnung)?.xmlId ?? null).toBeNull();
    },
  );

  it('fällt bei einem gültigen, aber geänderten Präfix nicht auf die Kurzform zurück', () => {
    const g = gesetz([norm('n', '§ 1')]);
    expect(findeEindeutigeNorm(g, 'Artikel 1')?.xmlId ?? null).toBeNull();
  });

  it('vergleicht die ganze Nummer und normalisiert bekannte Präfixschreibweisen', () => {
    const g = gesetz([norm('n10', 'Anhang 10'), norm('klein', 'anhang 1')]);
    expect(findeEindeutigeNorm(g, 'Anhang 1')?.xmlId ?? null).toBe('klein');
  });

  it('weist mehrere passende Kandidaten zurück', () => {
    const g = gesetz([norm('erst', '§ 1'), norm('zweit', '§ 1')]);
    expect(findeEindeutigeNorm(g, '§ 1')?.xmlId ?? null).toBeNull();
  });

  it('erhält die Erwägungsgrundauflösung unabhängig von Leerzeichen', () => {
    const g = gesetz([norm('e25', 'E25', { art: 'erwaegungsgrund' })]);
    expect(findeEindeutigeNorm(g, 'E25')?.xmlId ?? null).toBe('e25');
    expect(findeEindeutigeNorm(g, ' E25 ')?.xmlId ?? null).toBe('e25');
  });
});

describe('kompakte Canon-Präfixe', () => {
  it.each(['Can.', 'canon', 'c.', 'Kan.', 'Kanon', 'cann.', 'canons', 'canones', 'cc.', 'Kanones'])(
    'erhält den Präfixtext %s',
    (praefix) => {
      expect(praefixVonBezeichnung(`${praefix}8`)).toBe(praefix);
    },
  );
  it('lässt ungültiges can und sonstige Kennungen unverändert', () => {
    expect(praefixVonBezeichnung('can8')).toBe('');
    expect(praefixVonBezeichnung('E25')).toBe('');
    expect(praefixVonBezeichnung('§31')).toBe('§');
    expect(praefixVonBezeichnung('Artikel31')).toBe('Artikel');
  });
});

describe('eindeutige Normzuordnung', () => {
  it('verwendet ohne Präfix nur exakte und eindeutige Nummern', () => {
    const g = gesetz([norm('90', '§ 90'), norm('1', '§ 1'), norm('art-1', 'Art. 1')]);
    expect(findeEindeutigeNorm(g, '9')).toBeUndefined();
    expect(findeEindeutigeNorm(g, '1')).toBeUndefined();
    expect(findeEindeutigeNorm(g, '§ 1')).toMatchObject({ xmlId: '1' });
    expect(findeEindeutigeNorm(g, 'Canon 1')).toBeUndefined();
    expect(findeEindeutigeNorm(g, 'Art. § 1')).toBeUndefined();
  });
  it('berücksichtigt sämtliche exakten Treffer, auch mit gleichen XML-IDs', () => {
    const g = gesetz([norm('1', '§ 1'), norm('1', '§ 1')]);
    expect(findeEindeutigeNorm(g, '§ 1')).toBeUndefined();
  });
});

it('unterscheidet fehlende, präfixunpassende und mehrdeutige Normen anhand derselben Kandidaten', () => {
  const g = gesetz([norm('p', '§ 1'), norm('a', 'Anhang 1')]);
  expect(loeseNormEindeutigAuf(g, '9').anzahlTreffer).toBe(0);
  expect(loeseNormEindeutigAuf(g, 'Art. 1').anzahlTreffer).toBe(0);
  expect(loeseNormEindeutigAuf(g, '1').anzahlTreffer).toBe(2);
  expect(loeseNormEindeutigAuf(g, '§ 1')).toMatchObject({
    anzahlTreffer: 1,
    norm: { xmlId: 'p' },
  });
});
