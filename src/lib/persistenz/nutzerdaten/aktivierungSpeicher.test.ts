// aktivierungSpeicher.test.ts
// Speicherung und Rückauflösung typisierter Aktivierungen.

// Kein globales localStorage in der Node-Testumgebung (siehe setupNode.ts) –
// einfacher In-Memory-Mock genügt hier.

import { normDarstellung, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import {
  entferneAktivierung,
  ladeAktivierungXmlId,
  speichereAktivierung,
} from './aktivierungSpeicher';
import type {
  DarstellungsElement,
  GesetzDarstellung,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import { ueberschriftAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

beforeEach(() => {
  const speicher = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => speicher.get(key) ?? null,
    setItem: (key: string, wert: string) => void speicher.set(key, wert),
    removeItem: (key: string) => void speicher.delete(key),
    clear: () => speicher.clear(),
    key: (i: number) => Array.from(speicher.keys())[i] ?? null,
    get length() {
      return speicher.size;
    },
  } as Storage;
});

function norm(
  xmlId: string,
  bezeichnung: string,
  optionen: {
    art?: NormDarstellung['art'];
    ueberschriftartig?: boolean;
    gliederungsEbene?: number;
  } = {},
): DarstellungsElement {
  return {
    typ: 'norm',
    data: normDarstellung({
      id: `id-${xmlId}`,
      xmlId,
      bezeichnung,
      absaetze: [],
      ...(optionen.gliederungsEbene !== undefined
        ? {
            art: 'gliederungsartikel',
            gliederungsEbene: optionen.gliederungsEbene,
            ueberschriftartig: false,
          }
        : { art: 'normal' }),
    }) as NormDarstellung,
  };
}

function ueberschrift(xmlId: string, bezeichnung: string, titel?: string): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: { id: `id-${xmlId}`, xmlId, bezeichnung, titel, ebene: 1, gliederungskennzahl: '0' },
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

describe('speichereAktivierung (Storage-Key-Regression)', () => {
  it('MUTATIONSTEST: speichert unter dem stabilen Schlüssel "lexlata.aktivierung"', () => {
    // Deckt mutant 0 ab (STORAGE_KEY-Stringliteral): ein reiner Round-Trip-Test
    // würde eine geänderte Konstante nicht bemerken, da speichereAlle/ladeAlle
    // denselben (mutierten) Wert konsistent referenzieren. Der Schlüssel ist
    // dennoch Teil des Persistenz-Vertrags (Umbenennen = Datenverlust
    // bestehender Nutzer beim Update), daher hier explizit geprüft.
    const elemente = [norm('433', '§ 433')];
    speichereAktivierung(gesetz(elemente), elemente[0]!);
    const roh = localStorage.getItem('lexlata.aktivierung');
    expect(roh).not.toBeNull();
    // speichereAktivierung nutzt im Fallback elementSuchBezeichnung (volle
    // Bezeichnung), nicht letztesToken – anders als xmlIdZuBezeichnung.
    expect(JSON.parse(roh!)).toEqual({
      '["de-bund","testg"]': { typ: 'norm', bezeichnung: '§ 433' },
    });
  });

  it('MUTATIONSTEST: schreibt nicht erneut, wenn sich der Bezeichnung-String nicht geändert hat', () => {
    // Deckt den No-Op-Guard in speichereAktivesElement ab: ein reiner
    // Inhalts-Vergleich würde das nicht bemerken (gleicher Inhalt, ob 1x oder
    // 2x geschrieben) – hier wird stattdessen setItem selbst beobachtet.
    const elemente = [norm('433', '§ 433')];
    const g = gesetz(elemente);
    speichereAktivierung(g, elemente[0]!);
    const setItemSpy = vi.spyOn(localStorage, 'setItem');
    speichereAktivierung(g, elemente[0]!); // identischer Bezeichnung-String erneut
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('eine leere Gliederungskennzahl überschreibt einen bestehenden Eintrag nicht', () => {
    const el = norm('433', '§ 433');
    const g = gesetz([el]);
    speichereAktivierung(g, el);
    const leer = ueberschrift('u', 'Ohne Titel');
    if (leer.typ === 'ueberschrift') leer.data.gliederungskennzahl = '';
    speichereAktivierung(g, leer);
    expect(ladeAktivierungXmlId(g)).toBe('433');
  });
});

// ---------------------------------------------------------------------------
// entferneAktivierung
// ---------------------------------------------------------------------------

describe('entferneAktivierung', () => {
  it('REGRESSIONSTEST: ein Kurztitel "__proto__" wird wie jede andere gespeichert und wieder aufgelöst (Prototype-Pollution-Schutz)', () => {
    // Auch reservierte Objektnamen im Kurztitel bleiben reguläre Referenzen.
    // Die vollständigen Schlüssel vermeiden eine Zuordnung zum Object-Prototyp.
    const elemente = [norm('433', '§ 433')];
    const g = gesetz(elemente, '__proto__');

    speichereAktivierung(g, elemente[0]!);

    expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({
      [gesetzesreferenzSchluessel(g)]: { typ: 'norm', bezeichnung: '§ 433' },
    });
    expect(ladeAktivierungXmlId(g)).toBe(elemente[0]!.data.xmlId);
  });

  it('entfernt einen vorhandenen Eintrag', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'TestG' }))]: {
          typ: 'norm',
          bezeichnung: '§ 433',
        },
      }),
    );
    entferneAktivierung(gesetzesreferenz({ kurztitel: 'TestG' }));
    expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({});
  });

  it('lässt Einträge anderer Gesetze unangetastet', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'TestG' }))]: {
          typ: 'norm',
          bezeichnung: '§ 433',
        },
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' }))]: {
          typ: 'norm',
          bezeichnung: '§ 1',
        },
      }),
    );
    entferneAktivierung(gesetzesreferenz({ kurztitel: 'TestG' }));
    expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({
      [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' }))]: {
        typ: 'norm',
        bezeichnung: '§ 1',
      },
    });
  });

  it('MUTATIONSTEST: schreibt nicht, wenn für das Gesetz gar kein Eintrag existiert (No-Op-Guard)', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' }))]: {
          typ: 'norm',
          bezeichnung: '§ 1',
        },
      }),
    );
    const setItemSpy = vi.spyOn(localStorage, 'setItem');
    entferneAktivierung(gesetzesreferenz({ kurztitel: 'TestG' }));
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('Edge-Case: noch keine Datei/Eintrag vorhanden -> kein Fehler', () => {
    expect(() => entferneAktivierung(gesetzesreferenz({ kurztitel: 'TestG' }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ladeAktivierungXmlId
// ---------------------------------------------------------------------------

describe('ladeAktivierungXmlId', () => {
  it('liefert null, wenn für das Gesetz noch keine Aktivierung gespeichert ist', () => {
    const g = gesetz([norm('433', '§ 433')]);
    expect(ladeAktivierungXmlId(g)).toBeNull();
  });

  it('normale §-Norm (kein Gliederungsartikel-Gesetz): löst die gespeicherte Bezeichnung direkt auf', () => {
    const g = gesetz([norm('433', '§ 433')]);
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'TestG' }))]: {
          typ: 'norm',
          bezeichnung: '433',
        },
      }),
    );
    expect(ladeAktivierungXmlId(g)).toBe('433');
  });

  it('liefert null, wenn die gespeicherte Bezeichnung im aktuellen Gesetz nicht mehr auffindbar ist', () => {
    const g = gesetz([norm('433', '§ 433')]);
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'TestG' }))]: {
          typ: 'norm',
          bezeichnung: '999',
        },
      }),
    );
    expect(ladeAktivierungXmlId(g)).toBeNull();
  });

  function egbgb() {
    return gesetz(
      [
        norm('229', 'Art. 229', {
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          gliederungsEbene: 0,
        }),
        norm('229-1', 'Art. 229 § 1'),
        norm('229-3', 'Art. 229 § 3'),
        norm('249', 'Art. 249', {
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          gliederungsEbene: 0,
        }),
        norm('249-1', 'Art. 249 § 1'),
      ],
      'EGBGB',
    );
  }

  it('Gliederungsartikel-Gesetz: Zwei-Token-Format "229 3" wird in Artikel + Norm gesplittet und aufgelöst', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'EGBGB' }))]: {
          typ: 'norm',
          bezeichnung: '229 3',
        },
      }),
    );
    expect(ladeAktivierungXmlId(egbgb())).toBe('229-3');
  });

  it('Gliederungsartikel-Gesetz: sucht NUR innerhalb des gespeicherten Artikels (kein Übergriff auf Artikel 249)', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'EGBGB' }))]: {
          typ: 'norm',
          bezeichnung: '249 1',
        },
      }),
    );
    expect(ladeAktivierungXmlId(egbgb())).toBe('249-1');
  });

  it('Gliederungsartikel-Gesetz, aber gespeicherter String hat nur EIN Token (z.B. der Artikel selbst war aktiv): Fallback auf einfache Auflösung', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'EGBGB' }))]: {
          typ: 'norm',
          bezeichnung: '229',
        },
      }),
    );
    expect(ladeAktivierungXmlId(egbgb())).toBe('229');
  });

  it('MUTATIONSTEST: Gliederungsartikel-Gesetz mit DREI Tokens (kein gültiges Zwei-Token-Format) -> Fallback auf die volle, ungesplittete Bezeichnung', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'EGBGB' }))]: {
          typ: 'norm',
          bezeichnung: '229 3 x',
        },
      }),
    );
    // '229 3 x' entspricht keiner Normbezeichnung des Gesetzes -> kein Treffer.
    expect(ladeAktivierungXmlId(egbgb())).toBeNull();
  });

  it('MUTATIONSTEST: Ziffern-Check schlägt fehl (Artikel-Token keine Ziffer) -> Fallback auf einfache Auflösung mit der vollen Bezeichnung', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'EGBGB' }))]: {
          typ: 'norm',
          bezeichnung: 'x 3',
        },
      }),
    );
    expect(ladeAktivierungXmlId(egbgb())).toBeNull();
  });

  it('MUTATIONSTEST: Ziffern-Check schlägt fehl (Norm-Token keine Ziffer) -> Fallback auf einfache Auflösung mit der vollen Bezeichnung', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'EGBGB' }))]: {
          typ: 'norm',
          bezeichnung: '229 x',
        },
      }),
    );
    expect(ladeAktivierungXmlId(egbgb())).toBeNull();
  });
});

describe('typisierte Aktivierung', () => {
  it.each(['gleich', undefined])(
    'findet Überschriften mit Titel %s über die Gliederungskennzahl nach Titeländerung',
    (titel) => {
      const a = ueberschrift('a', 'Teil', titel);
      const b = ueberschrift('b', 'Teil', titel);
      if (b.typ === 'ueberschrift') b.data.gliederungskennzahl = '2';
      const g = gesetz([a, b]);
      speichereAktivierung(g, b);
      if (b.typ === 'ueberschrift') b.data.titel = 'Geändert';
      expect(ladeAktivierungXmlId(g)).toBe('b');
      expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'TestG' }))]:
          ueberschriftAusgangsstelle('2'),
      });
      expect(ladeAktivierungXmlId(gesetz([norm('n', '§ 2')]))).toBeNull();
    },
  );

  it('stellt normale Norm, Gliederungsartikel, untergeordnete Norm und Erwägungsgrund wieder her', () => {
    const normaleNorm = norm('433', '§ 433');
    const artikel = norm('229', 'Art. 229', {
      art: 'gliederungsartikel',
      ueberschriftartig: false,
      gliederungsEbene: 0,
    });
    const unter = norm('229-3', '§ 3');
    const erwaegung = norm('e25', 'E25');
    if (erwaegung.typ === 'norm') erwaegung.data.art = 'erwaegungsgrund';
    const normal = gesetz([normaleNorm, erwaegung]);
    const gegliedert = gesetz([artikel, unter], 'EGBGB');
    expect(gegliedert.hatGliederungsartikel).toBe(true);
    for (const [g, el] of [
      [normal, normaleNorm],
      [gegliedert, artikel],
      [gegliedert, unter],
      [normal, erwaegung],
    ] as const) {
      speichereAktivierung(g, el);
      expect(ladeAktivierungXmlId(g)).toBe(el.data.xmlId);
    }
  });

  it('delegiert Zwei-Token-Normeinträge auch ohne Gliederungsartikel an die zentrale Auflösung', () => {
    // Der zentrale Vertrag interpretiert zwei numerische Tokens als Artikel + Norm;
    // die Aktivierung enthält dafür keine eigene abweichende Suchregel mehr.
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'TestG' }))]: {
          typ: 'norm',
          bezeichnung: '229 3',
        },
      }),
    );
    // Auch ohne Präfix gilt der bestehende strikte Resolververtrag: eine
    // vollständig gleiche, eindeutige Zweizahlen-Bezeichnung ist auflösbar.
    expect(ladeAktivierungXmlId(gesetz([norm('229 3', '229 3')]))).toBe('229 3');
  });

  it.each(
    [
      '433',
      null,
      [],
      {},
      { typ: 'norm', bezeichnung: 433 },
      { typ: 'norm', bezeichnung: ' ' },
      ueberschriftAusgangsstelle(''),
      { typ: 'falsch', bezeichnung: '433' },
    ].map((wert) => [wert]),
  )('ignoriert ungültige oder alte Einträge: %j', (wert) => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'TestG' }))]: wert,
        [gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' }))]: {
          typ: 'norm',
          bezeichnung: '§ 1',
        },
      }),
    );
    expect(ladeAktivierungXmlId(gesetz([norm('433', '§ 433')]))).toBeNull();
    const el = norm('433', '§ 433');
    speichereAktivierung(gesetz([el]), el);
    expect(ladeAktivierungXmlId(gesetz([norm('1', '§ 1')], 'ZPO'))).toBe('1');
  });
});

describe('vollständige Gesetzesreferenz', () => {
  it('trennt gleichnamige Gesetze und löscht nur die gewählte Referenz', () => {
    const bundNorm = norm('bund-1', '§ 1');
    const bwNorm = norm('bw-2', '§ 2');
    const unbekanntNorm = norm('unbekannt-3', '§ 3');
    const bund = { ...gesetz([bundNorm]), normgeber: 'de-bund' };
    const bw = { ...gesetz([bwNorm]), normgeber: 'de-bw' };
    const unbekannt = { ...gesetz([unbekanntNorm]), normgeber: 'unbekannt' };
    speichereAktivierung(bund, bundNorm);
    speichereAktivierung(bw, bwNorm);
    speichereAktivierung(unbekannt, unbekanntNorm);
    expect(ladeAktivierungXmlId(bund)).toBe('bund-1');
    expect(ladeAktivierungXmlId(bw)).toBe('bw-2');
    expect(ladeAktivierungXmlId(unbekannt)).toBe('unbekannt-3');
    entferneAktivierung({ kurztitel: 'testg', normgeber: 'de-bund' });
    expect(ladeAktivierungXmlId(bund)).toBeNull();
    expect(ladeAktivierungXmlId(bw)).toBe('bw-2');
    expect(ladeAktivierungXmlId(unbekannt)).toBe('unbekannt-3');
  });

  it('verwendet bei anderer Schreibweise dieselbe Aktivierung', () => {
    const el = norm('1', '§ 1');
    const bund = { ...gesetz([el], 'BGB'), normgeber: 'de-bund' };
    speichereAktivierung(bund, el);
    expect(ladeAktivierungXmlId({ ...bund, kurztitel: 'bgb', normgeber: 'de-bund' })).toBe('1');
    const setItemSpy = vi.spyOn(localStorage, 'setItem');
    speichereAktivierung({ ...bund, kurztitel: 'bgb', normgeber: 'de-bund' }, el);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('übernimmt alte Kurztitel-Schlüssel nicht', () => {
    localStorage.setItem(
      'lexlata.aktivierung',
      JSON.stringify({ TestG: { typ: 'norm', bezeichnung: '§ 1' } }),
    );
    expect(ladeAktivierungXmlId(gesetz([norm('1', '§ 1')]))).toBeNull();
  });
});

it('verwendet Referenzschlüssel auch für reservierte Windows-Namen', () => {
  const el = norm('1', '§ 1');
  const g = { ...gesetz([el], 'CON.x'), normgeber: 'de-bund' };
  speichereAktivierung(g, el);
  expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({
    '["de-bund","con.x"]': { typ: 'norm', bezeichnung: '§ 1' },
  });
  expect(ladeAktivierungXmlId({ ...g, kurztitel: 'con.x', normgeber: 'de-bund' })).toBe('1');
});
it('übernimmt keine alten Dateibasis-Schlüssel', () => {
  const el = norm('1', '§ 1');
  localStorage.setItem(
    'lexlata.aktivierung',
    JSON.stringify({ 'testg_de-bund': { typ: 'norm', bezeichnung: '§ 1' } }),
  );
  expect(ladeAktivierungXmlId(gesetz([el]))).toBeNull();
  speichereAktivierung(gesetz([el]), el);
  expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({
    '["de-bund","testg"]': { typ: 'norm', bezeichnung: '§ 1' },
  });
});

it.each(['at-bund', 'de-by'])('aktiviert die originale Code-Referenz %s', (normgeber) => {
  const el = norm('1', '§ 1');
  const g = { ...gesetz([el]), normgeber };
  speichereAktivierung(g, el);
  expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({
    [gesetzesreferenzSchluessel(g)]: { typ: 'norm', bezeichnung: '§ 1' },
  });
  expect(ladeAktivierungXmlId(gesetzDarstellung({ ...g, kurztitel: 'testg' }))).toBe('1');
  expect(g.normgeber).toBe(normgeber);
  entferneAktivierung(g);
  expect(ladeAktivierungXmlId(g)).toBeNull();
});

it.each([
  ['§ 90', '§ 9a'],
  ['§ 9', '§ 9'],
  ['Art. 9', '§ 90'],
])('erhält eine nichtzuordenbare Aktivierung bei %s und %s ohne Ersatznorm', (...bezeichnungen) => {
  const g = gesetz(bezeichnungen.map((b, i) => norm(String(i), b)));
  const roh = JSON.stringify({
    [gesetzesreferenzSchluessel(g)]: { typ: 'norm', bezeichnung: '§ 9' },
  });
  localStorage.setItem('lexlata.aktivierung', roh);
  expect(ladeAktivierungXmlId(g)).toBeNull();
  expect(localStorage.getItem('lexlata.aktivierung')).toBe(roh);
});

it('verwirft alte Überschriftaktivierungen beim nächsten Speichern und erhält Normaktivierungen', () => {
  const g = gesetz([ueberschrift('u', 'Teil')]);
  const normGesetz = gesetz([norm('1', '§ 1')], 'ZPO');
  const ersatz = gesetz([norm('2', '§ 2')], 'BGB');
  localStorage.setItem(
    'lexlata.aktivierung',
    JSON.stringify({
      [gesetzesreferenzSchluessel(g)]: { typ: 'ueberschrift', kennzahl: '0' },
      [gesetzesreferenzSchluessel(normGesetz)]: { typ: 'norm', bezeichnung: '§ 1' },
    }),
  );
  expect(ladeAktivierungXmlId(g)).toBeNull();
  expect(ladeAktivierungXmlId(normGesetz)).toBe('1');
  speichereAktivierung(ersatz, ersatz.elemente[0]!);
  expect(JSON.parse(localStorage.getItem('lexlata.aktivierung')!)).toEqual({
    [gesetzesreferenzSchluessel(normGesetz)]: { typ: 'norm', bezeichnung: '§ 1' },
    [gesetzesreferenzSchluessel(ersatz)]: { typ: 'norm', bezeichnung: '§ 2' },
  });
});

it('liest das neue Überschriftaktivierungs-JSON direkt aus dem Bestand', () => {
  const g = gesetz([ueberschrift('u', 'Teil')]);
  localStorage.setItem(
    'lexlata.aktivierung',
    JSON.stringify({
      [gesetzesreferenzSchluessel(g)]: ueberschriftAusgangsstelle('0'),
    }),
  );
  expect(ladeAktivierungXmlId(g)).toBe('u');
});
