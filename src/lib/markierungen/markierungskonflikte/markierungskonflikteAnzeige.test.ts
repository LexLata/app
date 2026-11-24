import { normDarstellung, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonflikteAnzeige.test.ts
//
// Unit-Tests für die reinen Funktionen aus markierungskonflikteAnzeige.ts
// (extrahiert aus fuehreVerifikationAus/ladeMarkierungskonflikteFuerAnzeige,
// siehe dortiger Kopfkommentar). Fixture-Stil analog zu
// markierungskonflikteSpeicher.entscheidung.test.ts.
//
// verifiziereKonfliktEintraege verifiziert NUR bereits bekannte Konflikte
// (siehe Funktionskommentar dort) – ein alt.eigenerKonflikt === false bleibt
// daher IMMER false, unabhängig vom aktuellen Norm-Zustand (kein
// Neuentdeckungs-Scan). Die Testfälle spiegeln das bewusst wider.
//
// Ergänzung nach Mutation-Testing-Analyse (siehe Chatverlauf): die
// ursprünglichen Fixtures deckten ausschließlich kommentarEintrag() mit
// leeren zielKonflikte und ohne textstelle ab. Die neuen Fälle unten decken
// gezielt die dadurch unbelichteten Zweige ab: nicht-leere zielKonflikte
// (verweisEintrag), gesetzte bezug.textstelle, live.typ === 'verweismarkierung', sowie die
// AND/OR-Unterscheidung bei nichtamtlicheTitelXmlFehlt.

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel, zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  baueAnzeigeEintrag,
  ladeMarkierungskonflikteFuerAnzeige,
  verifiziereBekannteKonflikte,
} from './markierungskonflikteAnzeige';
import { verifiziereKonfliktEintraege } from './markierungskonflikteAnzeige.verifizieren';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import type {
  GeparsterKonfliktEintrag,
  GespeicherteGesetzKonflikte,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  baueMarkierungskonflikteXML,
  liesMarkierungskonflikteXML,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const {
  gespeicherteGesetzKonflikte,
  geladeneGesetze,
  schreibeGesetzKonflikte,
  ladeEintraege,
  standLaden,
  vollpruefen,
} = vi.hoisted(() => ({
  gespeicherteGesetzKonflikte: new Map<string, GespeicherteGesetzKonflikte>(),
  standLaden: vi.fn(),
  vollpruefen: vi.fn(),
  geladeneGesetze: [] as GesetzDarstellung[],
  schreibeGesetzKonflikte: vi.fn(),
  ladeEintraege: vi.fn(async (): Promise<MarkierungsEintrag[]> => []),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeGesetzeFuerPruefung: async (referenzen: Gesetzesreferenz[]) =>
    geladeneGesetze.filter((g) =>
      referenzen.some(
        (r) =>
          r.normgeber === g.normgeber && r.kurztitel.toLowerCase() === g.kurztitel.toLowerCase(),
      ),
    ),
  existierenNichtamtlicheTitelFuerPruefung: async () => new Set<string>(),
}));
vi.mock('@/lib/markierungen/eintrag/eintrag.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/markierungen/eintrag/eintrag.index')>()),
  ladeEintraegeFuerPruefung: ladeEintraege,
}));
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefsteuerung',
  () => ({ pruefeErforderlicheVollpruefung: vollpruefen }),
);
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefdurchlauf',
  () => ({
    istVollpruefungErforderlich: async (_: string, stand: { pruefstatus: string | null }) =>
      stand.pruefstatus === null,
  }),
);
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette',
  () => ({
    reiheInPruefungsKetteEin: async (aktion: (token: string) => Promise<unknown>) =>
      aktion('konflikttoken'),
  }),
);
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff',
  () => ({
    ladePruefstand: standLaden,
    schreibeGesetzKonflikte,
  }),
);
/** Gespeicherte Konflikte aus einem einzelnen Gesetzesblock der Konfliktdatei. */
function gespeichert(roh: string): GespeicherteGesetzKonflikte {
  const [konflikte] = liesMarkierungskonflikteXML(
    `<markierungskonflikte>${roh}</markierungskonflikte>`,
  ).gesetzKonflikte.values();
  if (!konflikte) throw new Error('Gesetzesblock ohne gültige Gesetzesangabe.');
  return konflikte;
}

beforeEach(() => {
  gespeicherteGesetzKonflikte.clear();
  geladeneGesetze.length = 0;
  vi.clearAllMocks();
  standLaden.mockResolvedValue({
    gesetzKonflikte: gespeicherteGesetzKonflikte,
    pruefstatus: 'aktuell',
    vollpruefungErforderlich: false,
    erweiterungen: { attribute: [], kinder: [] },
  });
});

// Konkreter gespeicherter Titelbezug; Grenzen entsprechen seinem Wortlaut.
const nichtamtlicherTitelBezug = {
  textstelle: {
    pfad: bereichPfad('nichtamtlicherTitel' as const),
    zeichenbereichStart: 0,
    zeichenbereichEnde: 'Kauf'.length,
  },
  bezugstext: 'Kauf',
};

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function norm(
  xmlId: string,
  bezeichnung: string,
  overrides: Partial<NormDarstellung> = {},
): NormDarstellung {
  return normDarstellung({
    id: naechsteId(),
    xmlId,
    bezeichnung,
    absaetze: [],
    ...overrides,
  }) as unknown as NormDarstellung;
}

function gesetz(kurztitel: string, normen: NormDarstellung[] = []): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: normen.map((n) => ({ typ: 'norm' as const, data: n })),
  });
}

// Kommentar-Eintrag OHNE textstelle/elementstand: pruefeEigenenKonflikt liefert
// dann laut markierungskonfliktPruefung.ts ausschließlich "Norm (noch)
// auffindbar? nein -> Konflikt, ja -> kein Konflikt" – bewusst der simpelste
// Fall, um NUR den Verifikations-Wrapper hier zu testen, nicht
// pruefeEigenenKonflikt selbst (bereits eigenständig in
// markierungskonfliktPruefung.test.ts getestet).
function kommentarEintrag(
  bezeichnung: string,
  overrides: Parameters<typeof markierungsEintrag>[0] = {},
): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
    kommentarText: 'x',
    ...overrides,
  }) as MarkierungsEintrag;
}

// Verweis-Eintrag mit einem oder mehreren Zitat-Zielen – deckt den in den
// bisherigen Fixtures komplett fehlenden live.typ === 'verweismarkierung'-Zweig ab
// (siehe verifiziereEinenKonfliktEintrag Z. 285/287 bzw. berechneZielKonflikte).
// `ziel.gesetz: undefined` bedeutet Ziel im eigenen Gesetz. verweistext wird
// aus den Ziel-Bezeichnungen zusammengesetzt (Zeichen-Bereiche daraus
// abgeleitet) – für die hiesigen Tests reicht diese Annäherung, da
// berechneZielKonflikte verweistextZeichenbereich selbst nicht auswertet.
function verweisEintrag(
  bezeichnung: string,
  ziele: { gesetz?: Gesetzesreferenz; bezeichnung: string }[],
  overrides: Parameters<typeof markierungsEintrag>[0] = {},
): MarkierungsEintrag {
  const verweistext = ziele.map((z) => z.bezeichnung).join(' ');
  let position = 0;
  const verweisziele: Verweisziel[] = ziele.map((z) => {
    const start = position;
    position += z.bezeichnung.length + 1;
    return verweisziel({
      typ: 'zielnorm',
      gesetz: z.gesetz,
      bezeichnung: z.bezeichnung,
      verweistextZeichenbereich: [start, start + z.bezeichnung.length],
      elementstand: { textlaenge: 1 },
    });
  });
  return markierungsEintrag({
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
    verweisinhalt: { verweistext, verweisziele },
    ...overrides,
  }) as MarkierungsEintrag;
}

const SCHLUESSEL_433 = 'norm:§ 433|kommentar|t:x';

// ---------------------------------------------------------------------------
// verifiziereKonfliktEintraege
// ---------------------------------------------------------------------------

describe('verifiziereKonfliktEintraege', () => {
  it('Markierung selbst gelöscht (kein live-Eintrag mehr) -> veraendert, Eintrag entfernt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      schluessel: 'nicht-mehr-vorhanden',
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).toEqual({ neueEintraege: [], veraendert: true });
  });

  it('bekannter Konflikt jetzt aufgelöst (Norm wieder auffindbar) -> veraendert, Eintrag entfernt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const live = kommentarEintrag('433');
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      schluessel: SCHLUESSEL_433,
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).toEqual({ neueEintraege: [], veraendert: true });
  });

  it('bekannter Konflikt besteht weiterhin (Norm weiterhin nicht auffindbar) -> unverändert', () => {
    const g = gesetz('BGB', []);
    const live = kommentarEintrag('433');
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'pauschalerBezugFehlt',
      zielKonflikte: [],
      schluessel: SCHLUESSEL_433,
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result.veraendert).toBe(false);
    expect(result.neueEintraege).toEqual([
      {
        eigenerKonflikt: 'pauschalerBezugFehlt',
        zielKonflikte: [],
        ausgangsstelle: normAusgangsstelle('§ 433'),
        markierungstyp: 'kommentar',
        kommentarText: 'x',
      },
    ]);
  });

  it('kein bekannter Konflikt (alt.eigenerKonflikt=false) bleibt false, auch wenn die Norm fehlt (kein Neuentdeckungs-Scan)', () => {
    const g = gesetz('BGB', []); // Norm fehlt -> würde eine NEUE Prüfung als Konflikt erkennen
    const live = kommentarEintrag('433');
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [],
      schluessel: SCHLUESSEL_433,
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).toEqual({ neueEintraege: [], veraendert: false });
  });

  it('nichtamtlicheTitelXmlFehlt: Bereich nichtamtlicherTitel + nichtamtlicheTitelVorhanden fehlt für dieses Gesetz -> eigenerKonflikt unterdrückt, gilt als aufgelöst', () => {
    const g = gesetz('BGB', []); // Norm fehlt -> würde sonst weiterhin als Konflikt gelten
    const live = kommentarEintrag('433', { ...nichtamtlicherTitelBezug });
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      schluessel: identitaetsSchluessel(live),
    };
    // BGB bewusst NICHT in nichtamtlicheTitelVorhanden:
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result).toEqual({ neueEintraege: [], veraendert: true });
  });

  // Ergänzung nach Mutation-Testing-Analyse: Z.250 verknüpft Bereich nichtamtlicherTitel
  // und nichtamtlicheTitelVorhanden.has(...) mit &&. Der vorige Testfall hatte
  // beide Operanden gleichzeitig wahr (BGB NICHT in nichtamtlicheTitelVorhanden)
  // und unterscheidet && nicht von || (mutant 83). Hier ist BGB explizit
  // VORHANDEN -> nichtamtlicherTitelBetroffen muss false sein (&&), nicht true
  // (||), sodass der normale eigenerKonflikt-Check greift.
  it('nichtamtlicheTitelXmlFehlt: Bereich nichtamtlicherTitel, aber nichtamtlicheTitelVorhanden für dieses Gesetz IST vorhanden -> normaler eigenerKonflikt-Check greift (AND, nicht OR)', () => {
    const g = gesetz('BGB', []); // Norm fehlt -> pruefeEigenenKonflikt liefert true
    const live = kommentarEintrag('433', { ...nichtamtlicherTitelBezug });
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set([gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' }))]),
    );
    expect(result).toEqual({
      neueEintraege: [
        {
          eigenerKonflikt: 'bezugstextFehltOderUnpassend',
          zielKonflikte: [],
          ausgangsstelle: normAusgangsstelle('§ 433'),
          markierungstyp: 'kommentar',
          textstelle: live.bezug.textstelle,
        },
      ],
      veraendert: false,
    });
  });

  // Ab hier: Testfälle mit NICHT-LEEREN zielKonflikte (verweisEintrag) bzw.
  // gesetzte bezug.textstelle/live.typ === 'verweismarkierung' – bisher komplett unbelichtete Zweige
  // (siehe Mutation-Testing-Analyse, Cluster 1).

  it('Ziel-Konflikt (zielGesetzFehlt) bleibt unverändert bestehen -> zielKonflikte korrekt berechnet, nur bekannte Zielgesetze berücksichtigt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    // Zwei Zitat-Ziele: StGB (bereits bekannt, siehe alt unten) und HGB (dem
    // Verifikations-Check laut Funktionskommentar bewusst NICHT bekannt) –
    // HGB darf im Ergebnis nicht auftauchen (bekannteZielgesetze-Filter).
    const live = verweisEintrag('433', [
      { gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), bezeichnung: '§ 1' },
      { gesetz: gesetzesreferenz({ kurztitel: 'HGB' }), bezeichnung: '§ 2' },
    ]);
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielGesetzFehlt' }],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result.veraendert).toBe(false);
    expect(result.neueEintraege).toMatchObject([
      {
        eigenerKonflikt: undefined,
        zielKonflikte: [
          {
            gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
            typ: 'zielGesetzFehlt',
            bezeichnungen: [{ bezeichnung: '§ 1' }],
          },
        ],
        ausgangsstelle: normAusgangsstelle('§ 433'),
        markierungstyp: 'verweismarkierung',
      },
    ]);
  });

  it('Ziel-Konflikte: ein bekanntes Ziel wird im Verweis nicht mehr zitiert -> Längen-Änderung wird als "verändert" erkannt', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const live = verweisEintrag('433', [
      { gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), bezeichnung: '§ 1' },
    ]); // HGB fehlt jetzt
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [
        { gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielGesetzFehlt' },
        { gesetz: gesetzesreferenz({ kurztitel: 'HGB' }), typ: 'zielGesetzFehlt' },
      ],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result.veraendert).toBe(true);
    expect(result.neueEintraege[0]?.zielKonflikte).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielGesetzFehlt',
        bezeichnungen: [{ bezeichnung: '§ 1' }],
      },
    ]);
  });

  it('Bezug mit textstelle -> textstelle-Feld gesetzt, kommentarText/verweistext unterdrückt', () => {
    const g = gesetz('BGB', []); // Norm fehlt -> pruefeEigenenKonflikt liefert true, unabhängig von der textstelle
    const live = kommentarEintrag('433', {
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 5, zeichenbereichEnde: 10 },
        bezugstext: 'Text',
      },
    });
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result.veraendert).toBe(false);
    expect(result.neueEintraege[0]).toMatchObject({
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      textstelle: live.bezug.textstelle,
      kommentarText: undefined,
      verweistext: undefined,
    });
  });

  it('live.typ === "verweismarkierung" ohne textstelle -> verweistext gesetzt, kommentarText unterdrückt (auch wenn zufällig vorhanden)', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const live = verweisEintrag(
      '433',
      [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), bezeichnung: '§ 1' }],
      {
        // Feld sollte bei typ 'verweismarkierung' laut markierungSpeicher.types.ts nie
        // gesetzt sein – hier bewusst trotzdem gesetzt, um zu beweisen, dass
        // die Anzeige wirklich auf live.typ prüft und nicht nur auf die textstelle.
        kommentarText: 'sollte nicht auftauchen',
      },
    );
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielGesetzFehlt' }],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result.neueEintraege[0]).toMatchObject({
      verweistext: '§ 1',
      kommentarText: undefined,
    });
  });

  it('live.typ === "kommentar" mit (unrealistischem) verweisinhalt -> verweistext bleibt unterdrückt (typ entscheidet, nicht die bloße Feld-Existenz)', () => {
    const g = gesetz('BGB', []); // Norm fehlt -> pruefeEigenenKonflikt liefert true, damit ein Eintrag gebaut wird
    const live = kommentarEintrag('433', {
      verweisinhalt: { verweistext: 'sollte nicht auftauchen', verweisziele: [] },
    });
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result.neueEintraege[0]).toMatchObject({
      kommentarText: 'x',
      verweistext: undefined,
    });
  });

  it('Verweis MIT textstelle -> verweistext bleibt unterdrückt, obwohl live.typ === "verweismarkierung" und verweisinhalt gesetzt ist', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const live = verweisEintrag(
      '433',
      [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), bezeichnung: '§ 1' }],
      {
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 5 },
          bezugstext: 'Text1',
        },
      },
    );
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielGesetzFehlt' }],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      g,
      [g],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result.neueEintraege[0]).toMatchObject({
      textstelle: live.bezug.textstelle,
      verweistext: undefined,
      kommentarText: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// baueAnzeigeEintrag
// ---------------------------------------------------------------------------

describe('baueAnzeigeEintrag', () => {
  it('live-Markierung nicht (mehr) vorhanden -> undefined', () => {
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [],
      schluessel: 'x',
    };
    const result = baueAnzeigeEintrag(e, new Map(), undefined, []);
    expect(result).toBeUndefined();
  });

  it('Gesetz vorhanden, Norm auffindbar -> bezeichnungAnzeige aus dem Gesetz aufgelöst', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const live = kommentarEintrag('433');
    const liveNachSchluessel = new Map([[SCHLUESSEL_433, live]]);
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [],
      schluessel: SCHLUESSEL_433,
    };
    const result = baueAnzeigeEintrag(e, liveNachSchluessel, g, [g]);
    expect(result).toMatchObject({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezeichnungAnzeige: '§ 433',
      markierungstyp: 'kommentar',
      schluessel: SCHLUESSEL_433,
      zielKonflikte: [],
    });
  });

  it('Gesetz fehlt (gesetzFehlt) -> Fallback auf die rohe Bezeichnung, leere zielKonflikte-Bezeichnungen', () => {
    const live = kommentarEintrag('433');
    const liveNachSchluessel = new Map([[SCHLUESSEL_433, live]]);
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielGesetzFehlt' }],
      schluessel: SCHLUESSEL_433,
    };
    const result = baueAnzeigeEintrag(e, liveNachSchluessel, undefined, []);
    expect(result?.bezeichnungAnzeige).toBe('§ 433');
    expect(result?.zielKonflikte).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielGesetzFehlt',
        bezeichnungenAnzeige: [],
      },
    ]);
  });

  it('Norm unter der Bezeichnung im Gesetz nicht mehr auffindbar -> Fallback auf die rohe Bezeichnung', () => {
    const g = gesetz('BGB', []); // 433 existiert nicht (mehr)
    const live = kommentarEintrag('433');
    const liveNachSchluessel = new Map([[SCHLUESSEL_433, live]]);
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [],
      schluessel: SCHLUESSEL_433,
    };
    const result = baueAnzeigeEintrag(e, liveNachSchluessel, g, [g]);
    expect(result?.bezeichnungAnzeige).toBe('§ 433');
    expect(result?.nichtamtlicherTitelGrund).toBeUndefined();
  });

  // Ergänzung nach Mutation-Testing-Analyse (Cluster 2): der einzige bisherige
  // "Norm auffindbar"-Testfall (oben) nutzt norm('433', '§ 433') – die
  // vollständige Bezeichnung fällt dort zufällig mit der rohen Kennung
  // zusammen und verdeckt so den gesamten Auflösungs-Zweig. Ab hier: Gesetz
  // mit MEHREREN Normen (macht die .find-Suche in Z.454 beobachtbar) und
  // vollständiger Bezeichnung ("§ …"), die sich sichtbar von der rohen
  // Kennung unterscheidet.
  it('löst vollständige Normbezeichnung auf und erhält den eigenen Konflikt ohne Titelbereich', () => {
    const g = gesetz('BGB', [
      norm('100', '§ 100', { titel: 'Deckname' }),
      norm('432', '§ 432', { titel: 'Titel432' }),
      norm('433', '§ 433', { titel: 'InoffiziellerTitel', titelIstNichtamtlich: true }),
    ]);
    const live = kommentarEintrag('432');
    const liveNachSchluessel = new Map([['norm:§ 432|kommentar|t:x', live]]);
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      schluessel: 'norm:§ 432|kommentar|t:x',
    };
    const result = baueAnzeigeEintrag(e, liveNachSchluessel, g, [g]);
    expect(result).toMatchObject({
      ausgangsstelle: normAusgangsstelle('§ 432'),
      bezeichnungAnzeige: '§ 432', // NICHT '432' -> beweist, dass wirklich aufgelöst wurde
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      nichtamtlicherTitelGrund: undefined,
    });
  });

  it('setzt bei Normtextmarkierung keinen Grund zum nichtamtlichen Titel', () => {
    const g = gesetz('BGB', [
      norm('100', '§ 100', { titel: 'Deckname' }),
      norm('432', '§ 432', { titel: 'Titel432' }),
      norm('433', '§ 433', { titel: 'InoffiziellerTitel', titelIstNichtamtlich: true }),
    ]);
    const live = kommentarEintrag('433');
    const liveNachSchluessel = new Map([[SCHLUESSEL_433, live]]);
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [],
      schluessel: SCHLUESSEL_433,
    };
    const result = baueAnzeigeEintrag(e, liveNachSchluessel, g, [g]);
    expect(result).toMatchObject({
      ausgangsstelle: normAusgangsstelle('§ 433'),
      bezeichnungAnzeige: '§ 433',
      eigenerKonflikt: undefined,
      nichtamtlicherTitelGrund: undefined,
    });
  });

  it('Gesetz fehlt (gesetzFehlt), Verweis mit Ziel-Konflikt -> bezeichnungenAnzeige bleibt leer, kein Absturz trotz live.typ === "verweismarkierung"', () => {
    const live = verweisEintrag('433', [
      { gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), bezeichnung: '§ 1' },
    ]);
    const schluessel = identitaetsSchluessel(live);
    const liveNachSchluessel = new Map([[schluessel, live]]);
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielGesetzFehlt' }],
      schluessel,
    };
    const result = baueAnzeigeEintrag(e, liveNachSchluessel, undefined, []);
    expect(result?.zielKonflikte).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielGesetzFehlt',
        bezeichnungenAnzeige: [],
      },
    ]);
  });

  it('Gesetz vorhanden, Verweis mit Ziel-Konflikt -> bezeichnungenAnzeige wird tatsächlich befüllt (Gegenprobe zum vorigen Fall)', () => {
    const g = gesetz('BGB', [norm('433', '§ 433')]);
    const zielgesetz = gesetz('StGB', []); // existiert, aber Norm '1' fehlt -> zielNormFehlt
    const live = verweisEintrag('433', [
      { gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), bezeichnung: '§ 1' },
    ]);
    const schluessel = identitaetsSchluessel(live);
    const liveNachSchluessel = new Map([[schluessel, live]]);
    const e: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'StGB' }), typ: 'zielNormFehlt' }],
      schluessel,
    };
    const result = baueAnzeigeEintrag(e, liveNachSchluessel, g, [g, zielgesetz]);
    expect(result?.zielKonflikte).toEqual([
      {
        gesetz: gesetzesreferenz({ kurztitel: 'StGB' }),
        typ: 'zielNormFehlt',
        bezeichnungenAnzeige: [{ bezeichnung: '§ 1', befund: 'fehlt' }],
      },
    ]);
  });
});

describe('Phase D: fehlendes Gesetz in Anzeige und Verifikation', () => {
  it('zeigt einen gespeicherten gesetzFehlt-Konflikt ohne Nachladen von Markierungen', async () => {
    gespeicherteGesetzKonflikte.set(
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
      gespeichert(
        '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ),
    );
    expect(await ladeMarkierungskonflikteFuerAnzeige()).toEqual({
      pruefstatus: 'aktuell',
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    });
    expect(ladeEintraege).not.toHaveBeenCalled();
    expect(schreibeGesetzKonflikte).not.toHaveBeenCalled();
  });

  it('entfernt beim Wiedererscheinen des Gesetzes den gesetzFehlt-Block', async () => {
    gespeicherteGesetzKonflikte.set(
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
      gespeichert(
        '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ),
    );
    geladeneGesetze.push(gesetz('BGB'));
    await verifiziereBekannteKonflikte();
    expect(gespeicherteGesetzKonflikte.size).toBe(0);
    expect(schreibeGesetzKonflikte).toHaveBeenCalledExactlyOnceWith(
      gespeicherteGesetzKonflikte,
      'konflikttoken',
      {
        pruefstatus: 'aktuell',
        erweiterungen: { attribute: [], kinder: [] },
      },
    );
    expect(ladeEintraege).not.toHaveBeenCalled();
  });
});

it('Nachprüfung schreibt verbleibenden Präfix-Konflikt mit passendem Live-Schlüssel erneut', async () => {
  const { erstelleGespeicherteGesetzKonflikte } =
    await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
  const live = [
    kommentarEintrag('1', { ausgangsstelle: normAusgangsstelle('§ 1') }),
    kommentarEintrag('1', { ausgangsstelle: normAusgangsstelle('Anhang 1') }),
  ];
  gespeicherteGesetzKonflikte.set(
    gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'Test' })),
    erstelleGespeicherteGesetzKonflikte({
      gesetz: gesetzesreferenz({ kurztitel: 'Test' }),
      eintraege: live.map((e) => ({
        ausgangsstelle: e.ausgangsstelle,

        markierungstyp: e.typ,
        kommentarText: e.kommentarText,
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
      })),
    }),
  );
  geladeneGesetze.push(gesetz('Test', [norm('p1', '§ 1')]));
  ladeEintraege.mockResolvedValue(live);
  await verifiziereBekannteKonflikte();
  expect(schreibeGesetzKonflikte).toHaveBeenCalledTimes(1);
  const geschrieben = schreibeGesetzKonflikte.mock.calls[0]![0] as Map<
    string,
    GespeicherteGesetzKonflikte
  >;
  const konflikte = geschrieben.get(
    gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'Test' })),
  )!;
  const xml = baueMarkierungskonflikteXML({
    gesetzKonflikte: new Map([['Test', konflikte]]),
    pruefstatus: 'aktuell',
  });
  expect(xml).toContain('<bezeichnung>Anhang 1</bezeichnung>');
  const gelesen = konflikte.eintraege;
  expect(gelesen).toHaveLength(1);
  expect(gelesen[0]?.schluessel).toBe(identitaetsSchluessel(live[1]!));
});

it('verifiziert bekannte Zielkonflikte nur für denselben Normgeber und erkennt Casevarianten', () => {
  const eigen = { ...gesetz('Ausgang', [norm('1', '§ 1')]), normgeber: 'de-bund' };
  const live = verweisEintrag('1', [
    { gesetz: { kurztitel: 'ABC', normgeber: 'de-bund' }, bezeichnung: '§ 1' },
    { gesetz: { kurztitel: 'abc', normgeber: 'de-bw' }, bezeichnung: '§ 2' },
  ]);
  const alt: GeparsterKonfliktEintrag = {
    eigenerKonflikt: undefined,
    zielKonflikte: [{ gesetz: { kurztitel: 'ABC', normgeber: 'de-bw' }, typ: 'zielGesetzFehlt' }],
    schluessel: identitaetsSchluessel(live),
  };
  const ergebnis = verifiziereKonfliktEintraege([alt], [live], eigen, [eigen], eigen, new Set());
  expect(ergebnis.veraendert).toBe(false);
  expect(ergebnis.neueEintraege[0]?.zielKonflikte).toEqual([
    {
      gesetz: { kurztitel: 'abc', normgeber: 'de-bw' },
      typ: 'zielGesetzFehlt',
      bezeichnungen: [{ bezeichnung: '§ 2' }],
    },
  ]);
});

for (const pruefstatus of ['ausstehend', 'fehlgeschlagen'] as const) {
  it(`lädt ${pruefstatus} und Befunde einmal gemeinsam ohne automatische Vollprüfung`, async () => {
    const stand = {
      gesetzKonflikte: gespeicherteGesetzKonflikte,
      pruefstatus,
      vollpruefungErforderlich: true,
      erweiterungen: { attribute: [], kinder: [] },
    };
    standLaden.mockResolvedValue(stand);
    gespeicherteGesetzKonflikte.set(
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
      gespeichert(
        '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ),
    );
    expect(await ladeMarkierungskonflikteFuerAnzeige()).toEqual({
      pruefstatus,
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    });
    expect(standLaden).toHaveBeenCalledTimes(1);
    expect(vollpruefen).not.toHaveBeenCalled();
    geladeneGesetze.push(gesetz('BGB'));
    expect(await ladeMarkierungskonflikteFuerAnzeige()).toEqual({ pruefstatus, gesetze: [] });
    expect(schreibeGesetzKonflikte).toHaveBeenCalledWith(
      gespeicherteGesetzKonflikte,
      'konflikttoken',
      {
        pruefstatus,
        erweiterungen: stand.erweiterungen,
      },
    );
  });
}
it('baut einen statuslosen Stand vollständig auf und liest anschließend frisch', async () => {
  standLaden.mockResolvedValueOnce({ gesetzKonflikte: new Map(), pruefstatus: null });
  expect(await ladeMarkierungskonflikteFuerAnzeige()).toEqual({
    pruefstatus: 'aktuell',
    gesetze: [],
  });
  expect(vollpruefen).toHaveBeenCalledTimes(1);
  expect(standLaden).toHaveBeenCalledTimes(2);
});
it('gibt Zugriffsfehler weiter und baut beschädigte Stände hier nicht automatisch neu auf', async () => {
  const fehler = new Error('Ungültiges XML');
  standLaden.mockRejectedValueOnce(fehler);
  await expect(ladeMarkierungskonflikteFuerAnzeige()).rejects.toBe(fehler);
  expect(vollpruefen).not.toHaveBeenCalled();
  expect(schreibeGesetzKonflikte).not.toHaveBeenCalled();
});

it('liest nach Quellfehler frisch gespeicherte Befunde ohne Live-Texte', async () => {
  const { erstelleGespeicherteGesetzKonflikte } =
    await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
  const gesetzKonflikte = new Map([
    [
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'Alt' })),
      gespeichert(
        '<gesetz kurztitel="Alt" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
      ),
    ],
    [
      'quelle',
      erstelleGespeicherteGesetzKonflikte({
        gesetz: gesetzesreferenz({ kurztitel: 'Quelle' }),
        nichtamtlicheTitelXmlFehlt: true,
        eintraege: [],
      }),
    ],
  ]);
  const frisch = new Map([
    [
      'de-bund',
      erstelleGespeicherteGesetzKonflikte({
        gesetz: { kurztitel: 'Gleich', normgeber: 'de-bund' },
        eintraege: [
          {
            ausgangsstelle: normAusgangsstelle('1 Art. & § <2>|x'),

            markierungstyp: 'kommentar',
            kommentarText: 'a|b<&',
            eigenerKonflikt: 'bezugstextFehltOderUnpassend',
            zielKonflikte: [
              { gesetz: { kurztitel: 'Gleich', normgeber: 'de-bw' }, typ: 'zielNormFehlt' },
            ],
          },
        ],
      }),
    ],
    [
      'titel',
      erstelleGespeicherteGesetzKonflikte({
        gesetz: gesetzesreferenz({ kurztitel: 'Titel' }),
        nichtamtlicheTitelXmlFehlt: true,
        eintraege: [],
      }),
    ],
    [
      'fehlt',
      erstelleGespeicherteGesetzKonflikte({
        gesetz: gesetzesreferenz({ kurztitel: 'Fehlt' }),
        fehlendesGesetz: true,
        eintraege: [],
      }),
    ],
  ]);
  standLaden
    .mockResolvedValueOnce({ gesetzKonflikte, pruefstatus: 'aktuell' })
    .mockResolvedValue({ gesetzKonflikte: frisch, pruefstatus: 'fehlgeschlagen' });
  ladeEintraege.mockRejectedValue(new Error('Quelle unlesbar'));
  geladeneGesetze.push(
    gesetzesreferenz({ kurztitel: 'Alt' }) as GesetzDarstellung,
    gesetzesreferenz({ kurztitel: 'Quelle' }) as GesetzDarstellung,
  );
  // Der gelesene Ausgangsbestand unterscheidet sich vom dauerhaft gespeicherten
  // Fehlerstand. Der Rückfall muss ausschließlich den frisch gelesenen Stand verwenden.
  const ergebnis = await ladeMarkierungskonflikteFuerAnzeige();
  expect(ergebnis.pruefstatus).toBe('fehlgeschlagen');
  expect(standLaden).toHaveBeenCalledTimes(2);
  expect(ergebnis.gesetze).toHaveLength(3);
  expect(ergebnis.gesetze[0]).toMatchObject({
    gesetz: { kurztitel: 'Gleich', normgeber: 'de-bund' },
    eintraege: [
      {
        ausgangsstelle: normAusgangsstelle('1 Art. & § <2>|x'),
        bezeichnungAnzeige: '1 Art. & § <2>|x',
        markierungstyp: 'kommentar',
        schluessel: expect.stringContaining('a|b<&'),
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [
          {
            gesetz: { kurztitel: 'Gleich', normgeber: 'de-bw' },
            typ: 'zielNormFehlt',
            bezeichnungenAnzeige: [],
          },
        ],
      },
    ],
  });
  expect(ergebnis.gesetze[0]?.eintraege[0]?.bezugstext).toBeUndefined();
  expect(ergebnis.gesetze[1]?.nichtamtlicheTitelXmlFehlt).toBe(true);
  expect(ergebnis.gesetze[2]?.fehlendesGesetz).toBe(true);
});

it('erhält Befunde gleicher Kurztitel verschiedener Normgeber und gespeicherte Präfixe', async () => {
  const { erstelleGespeicherteGesetzKonflikte } =
    await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
  const gesetzKonflikte = new Map(
    ['de-bund', 'de-bw'].map((normgeber) => [
      normgeber,
      erstelleGespeicherteGesetzKonflikte({
        gesetz: { kurztitel: 'Gleich', normgeber },
        eintraege: [
          {
            ausgangsstelle: normAusgangsstelle('Art. 229 § 2'),

            markierungstyp: 'verweismarkierung',
            verweistext: 'a|b<&',
            eigenerKonflikt: 'bezugstextFehltOderUnpassend',
            zielKonflikte: [{ gesetz: { kurztitel: 'Ziel', normgeber }, typ: 'zielGesetzFehlt' }],
          },
        ],
      }),
    ]),
  );
  standLaden.mockResolvedValue({ gesetzKonflikte, pruefstatus: 'fehlgeschlagen' });
  ladeEintraege.mockRejectedValue(new Error('Quelle unlesbar'));
  geladeneGesetze.push({ kurztitel: 'Gleich', normgeber: 'de-bund' } as GesetzDarstellung);
  const ergebnis = await ladeMarkierungskonflikteFuerAnzeige();
  expect(ergebnis.gesetze.map((g) => g.gesetz)).toEqual([
    { kurztitel: 'Gleich', normgeber: 'de-bund' },
    { kurztitel: 'Gleich', normgeber: 'de-bw' },
  ]);
  for (const gesetz of ergebnis.gesetze)
    expect(gesetz.eintraege).toMatchObject([
      {
        ausgangsstelle: normAusgangsstelle('Art. 229 § 2'),
        bezeichnungAnzeige: 'Art. 229 § 2',
        markierungstyp: 'verweismarkierung',
        schluessel: expect.stringContaining('v:a|b<&'),
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [{ typ: 'zielGesetzFehlt', bezeichnungenAnzeige: [] }],
      },
    ]);
});

it.each(['unlesbar', 'ungültiger Status', 'leerer Fehlerstand'])(
  'erfindet nach Quellfehler keine Befunde: %s',
  async (fall) => {
    const gesetzKonflikte = new Map([
      [
        'quelle',
        gespeichert(
          '<gesetz kurztitel="Quelle" normgeber="de-bund"><konflikt typ="nichtamtliche-titel-xml-fehlt"/></gesetz>',
        ),
      ],
    ]);
    standLaden.mockResolvedValueOnce({ gesetzKonflikte, pruefstatus: 'aktuell' });
    if (fall === 'unlesbar') standLaden.mockRejectedValue(new Error('Konfliktdatei unlesbar'));
    else
      standLaden.mockResolvedValue({
        gesetzKonflikte: new Map(),
        pruefstatus: fall === 'ungültiger Status' ? null : 'fehlgeschlagen',
      });
    geladeneGesetze.push(gesetzesreferenz({ kurztitel: 'Quelle' }) as GesetzDarstellung);
    ladeEintraege.mockRejectedValue(new Error('Quelle unlesbar'));
    if (fall === 'leerer Fehlerstand')
      await expect(ladeMarkierungskonflikteFuerAnzeige()).resolves.toEqual({
        pruefstatus: 'fehlgeschlagen',
        gesetze: [],
      });
    else
      await expect(ladeMarkierungskonflikteFuerAnzeige()).rejects.toThrow(
        fall === 'unlesbar' ? 'Konfliktdatei unlesbar' : 'Quelle unlesbar',
      );
  },
);

it('zeigt Überschrift 010 statt der kollidierenden § 1010-Norm an und erhält Konfliktkennung', () => {
  const g = gesetz('BGB', [norm('1010', '§ 1010')]);
  g.elemente.unshift({
    typ: 'ueberschrift',
    data: { id: 'u', xmlId: 'u', gliederungskennzahl: '010', bezeichnung: 'Buch 1', ebene: 1 },
  });
  const live: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: ueberschriftAusgangsstelle('010'),

    kommentarText: 'Text',
  });
  const schluessel = identitaetsSchluessel(live);
  const alt: GeparsterKonfliktEintrag = {
    eigenerKonflikt: 'bezugstextFehltOderUnpassend',
    zielKonflikte: [],
    schluessel,
  };
  expect(baueAnzeigeEintrag(alt, new Map([[schluessel, live]]), g, [g])).toMatchObject({
    bezeichnungAnzeige: 'Buch 1',
    ausgangsstelle: ueberschriftAusgangsstelle('010'),
  });
  const geaendert = markierungsEintrag({
    ...live,
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: bereichPfad('bezeichnung' as const),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 6,
      },
      bezugstext: 'Alt',
    },
  });
  const neuerSchluessel = identitaetsSchluessel(geaendert);
  const result = verifiziereKonfliktEintraege(
    [{ ...alt, schluessel: neuerSchluessel }],
    [geaendert],
    g,
    [g],
    gesetzesreferenz({ kurztitel: 'BGB' }),
    new Set(),
  );
  expect(result).toMatchObject({
    neueEintraege: [{ ausgangsstelle: ueberschriftAusgangsstelle('010') }],
  });
});

it('reicht den gespeicherten Live-Präfix unverändert an die Ausgangsnavigation durch', () => {
  const g = gesetz('Test', [norm('p', '§ 1'), norm('a', 'Anhang 1')]);
  const live = kommentarEintrag('1', { ausgangsstelle: normAusgangsstelle('Anhang 1') });
  const schluessel = identitaetsSchluessel(live);
  const alt: GeparsterKonfliktEintrag = {
    eigenerKonflikt: 'bezugstextFehltOderUnpassend',
    zielKonflikte: [],
    schluessel,
  };
  expect(baueAnzeigeEintrag(alt, new Map([[schluessel, live]]), g, [g])).toMatchObject({
    ausgangsstelle: normAusgangsstelle('Anhang 1'),
  });
});

it('erneuert den eigenen Worttyp bei Verifikation und zeigt Mehrdeutigkeit ohne falsche Normdetails', () => {
  const live = kommentarEintrag('1', {
    bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Alt', textlaenge: 0 } },
  });
  const schluessel = identitaetsSchluessel(live);
  const alt: GeparsterKonfliktEintrag = {
    eigenerKonflikt: 'pauschalerBezugUnpassend',
    zielKonflikte: [],
    schluessel,
  };
  for (const normen of [
    [norm('90', '§ 90')],
    [norm('p', '§ 1'), norm('a', '§ 1')],
    [norm('p', '§ 1'), norm('zweiter', '§ 1')],
  ]) {
    const g = gesetz('BGB', normen);
    const neu = verifiziereKonfliktEintraege([alt], [live], g, [g], g, new Set());
    expect(neu).toMatchObject({
      veraendert: true,
      neueEintraege: [{ eigenerKonflikt: 'pauschalerBezugFehlt' }],
    });
    const angezeigt = baueAnzeigeEintrag(
      { ...alt, eigenerKonflikt: 'pauschalerBezugFehlt' },
      new Map([[schluessel, live]]),
      g,
      [g],
    );
    expect(angezeigt).toMatchObject({
      bezeichnungAnzeige: '§ 1',
      eigenerKonflikt: 'pauschalerBezugFehlt',
    });
    expect(angezeigt?.nichtamtlicherTitelGrund).toBeUndefined();
  }
  const g = gesetz('BGB', [norm('p', '§ 1', { titel: 'Neu' })]);
  const neu = verifiziereKonfliktEintraege(
    [{ ...alt, eigenerKonflikt: 'pauschalerBezugFehlt' }],
    [live],
    g,
    [g],
    g,
    new Set(),
  );
  expect(neu).toMatchObject({
    veraendert: true,
    neueEintraege: [{ eigenerKonflikt: 'pauschalerBezugUnpassend' }],
  });
});

it.each([false, true])(
  'erklärt eigene Mehrdeutigkeit frisch bei Textbezug %s und unterscheidet unpassende Präfixe',
  (mitTextbezug) => {
    const g = gesetz('BGB', [norm('p', '§ 1'), norm('p2', '§ 1')]);
    const live = kommentarEintrag('1', {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      ...(mitTextbezug
        ? {
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: bereichPfad('bezeichnung' as const),
                zeichenbereichStart: 0,
                zeichenbereichEnde: 1,
              },
              bezugstext: '§',
            },
          }
        : {}),
    });
    const schluessel = identitaetsSchluessel(live);
    const alt: GeparsterKonfliktEintrag = {
      schluessel,
      eigenerKonflikt: mitTextbezug ? 'bezugstextFehltOderUnpassend' : 'pauschalerBezugFehlt',
      zielKonflikte: [],
    };
    expect(
      baueAnzeigeEintrag(alt, new Map([[schluessel, live]]), g, [g])?.ausgangsTrefferzahl,
    ).toBe(2);
    const unpassend = markierungsEintrag({
      ...live,
      ausgangsstelle: normAusgangsstelle(
        ['Art.', bezeichnungAusgangsstelle(live.ausgangsstelle).replace(/^\S+\s+/, '')]
          .filter(Boolean)
          .join(' '),
      ),
    });
    const unpassenderSchluessel = identitaetsSchluessel(unpassend);
    expect(
      baueAnzeigeEintrag(
        { ...alt, schluessel: unpassenderSchluessel },
        new Map([[unpassenderSchluessel, unpassend]]),
        g,
        [g],
      )?.ausgangsTrefferzahl,
    ).toBeUndefined();
    expect(
      baueAnzeigeEintrag(
        alt,
        new Map([[schluessel, live]]),
        gesetz('BGB', [norm('90', '§ 90')]),
        [],
      )?.ausgangsTrefferzahl,
    ).toBeUndefined();
  },
);

it.each([undefined, ['§'], ['Art.']])(
  'zeigt Mehrdeutigkeit einzelner Ziele nur für mehrere tatsächlich passende Kandidaten (%j)',
  (praefix) => {
    const g = gesetz('BGB', [norm('p', '§ 1'), norm('p2', '§ 1')]);
    const ziel: Verweisziel = verweisziel({
      typ: 'zielnorm',
      bezeichnung: praefix ? `${praefix[0]} 1` : '1',

      elementstand: testElementstand(),
      verweistextZeichenbereich: [0, 1],
    });
    const live: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 2'),
      verweisinhalt: { verweistext: '1', verweisziele: [ziel] },
    });
    const schluessel = identitaetsSchluessel(live);
    const alt: GeparsterKonfliktEintrag = {
      schluessel,
      eigenerKonflikt: undefined,
      zielKonflikte: [{ gesetz: g, typ: 'zielNormFehlt' }],
    };
    const anzeige = baueAnzeigeEintrag(alt, new Map([[schluessel, live]]), g, [g]);
    expect(anzeige?.zielKonflikte[0]?.bezeichnungenAnzeige[0]?.befund).toBe(
      praefix?.[0] === 'Art.' ? 'fehlt' : 'nichtEindeutig',
    );
  },
);

it('gliedert eigene, Selbst- und Fremdzielkonflikte mit frischen Details; gleichnamige Normgeber bleiben getrennt', () => {
  const eigen = {
    ...gesetz('Test', [norm('p', '§ 1', { titel: 'Neu' }), norm('q', '§ 2')]),
    normgeber: 'de-bund',
  };
  const fremd = { ...gesetz('Test', [norm('p', '§ 1', { titel: 'Land' })]), normgeber: 'de-bw' };
  const z = (
    bezeichnung: string,
    extra: Partial<Extract<Verweisziel, { typ: 'zielnorm' }>> = {},
  ): Verweisziel =>
    zielnormTestdaten({
      bezeichnung: '§ ' + bezeichnung,

      verweistextZeichenbereich: [0, 1],
      elementstand: { textlaenge: 9 },
      ...extra,
    });
  const live: MarkierungsEintrag = markierungsEintrag({
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),

    bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 9 } },
    verweisinhalt: {
      verweistext: 'Ziele',
      verweisziele: [
        z('1'),
        z('9'),
        z('2', { elementstand: testElementstand() }),
        z('2', { elementstand: undefined }),
        z('1', { gesetz: { kurztitel: 'Test', normgeber: 'de-bw' } }),
      ],
    },
  });
  const schluessel = identitaetsSchluessel(live);
  const bekannt: GeparsterKonfliktEintrag = {
    schluessel,
    eigenerKonflikt: 'pauschalerBezugUnpassend',
    zielKonflikte: [
      { gesetz: eigen, typ: 'zielNormFehlt' },
      { gesetz: fremd, typ: 'zielNormUnpassend' },
    ],
  };
  const eintrag = baueAnzeigeEintrag(bekannt, new Map([[schluessel, live]]), eigen, [eigen, fremd]);
  expect(eintrag?.eigenerKonflikt).toBe('pauschalerBezugUnpassend');
  expect(eintrag?.zielKonflikte).toHaveLength(2);

  expect(eintrag?.zielKonflikte[0]?.bezeichnungenAnzeige).toEqual([
    { bezeichnung: '§ 9', befund: 'fehlt' },
  ]);
});

it('verifiziert einen alten gemischten Zielkonflikt zu zwei getrennten Einträgen mit eigenen Anzeigenormen', () => {
  const g = gesetz('BGB', [norm('1', '§ 1')]);
  const gg = gesetz('GG', [norm('10', 'Art. 10')]);
  const live = verweisEintrag(
    '1',
    ['10', '999'].map((bezeichnung) => ({
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      bezeichnung: 'Art. ' + bezeichnung,
    })),
  );
  const alt: GeparsterKonfliktEintrag = {
    schluessel: identitaetsSchluessel(live),
    eigenerKonflikt: undefined,
    zielKonflikte: [{ gesetz: gesetzesreferenz({ kurztitel: 'GG' }), typ: 'zielNormFehlt' }],
  };
  const result = verifiziereKonfliktEintraege([alt], [live], g, [g, gg], g, new Set());
  expect(result.veraendert).toBe(true);
  const neu = result.neueEintraege[0]!;
  expect(neu.zielKonflikte.map((z) => z.typ)).toEqual(['zielNormUnpassend', 'zielNormFehlt']);
  const anzeige = baueAnzeigeEintrag(
    { ...neu, eigenerKonflikt: neu.eigenerKonflikt, schluessel: alt.schluessel },
    new Map([[alt.schluessel, live]]),
    g,
    [g, gg],
  );
  expect(anzeige?.zielKonflikte.map((z) => z.bezeichnungenAnzeige)).toEqual([
    [{ bezeichnung: 'Art. 10', befund: 'unpassend' }],
    [{ bezeichnung: 'Art. 999', befund: 'fehlt' }],
  ]);
});

it.each([
  ['weggefallen', 'Resttext', 'normWeggefallen'],
  [undefined, 'Amtlicher Titel', 'normHatAmtlichenTitel'],
] as const)(
  'erklärt nichtamtliche Titel fachlich nach Normstatus (%s)',
  (status, titel, erwartet) => {
    const n = norm('p5', '§ 5', {
      status,
      titel,
      absaetze: [{ inhalt: 'Resttext' }] as unknown as NormDarstellung['absaetze'],
    });
    const g = gesetz('BGB', [n]);
    const live = kommentarEintrag('5', {
      ausgangsstelle: normAusgangsstelle('§ 5'),
      ...nichtamtlicherTitelBezug,
    });
    const key = identitaetsSchluessel(live);
    const e = {
      schluessel: key,
      eigenerKonflikt: 'bezugstextFehltOderUnpassend' as const,
      zielKonflikte: [],
    };
    expect(baueAnzeigeEintrag(e, new Map([[key, live]]), g, [g])).toMatchObject({
      bezeichnungAnzeige: '§ 5',
      nichtamtlicherTitelGrund: erwartet,
      textpfad: bereichPfad('nichtamtlicherTitel'),
    });
  },
);

it('liefert gespeicherte Präfixe, keine falschen Titelgründe bei Mehrdeutigkeit und keine Gliederungskennzahl', () => {
  for (const doppelt of [false, true]) {
    const g = gesetz('BGB', doppelt ? [norm('p5', '§ 5'), norm('p5b', '§ 5')] : []);
    const live = kommentarEintrag('5', {
      ausgangsstelle: normAusgangsstelle('§ 5'),
      ...nichtamtlicherTitelBezug,
    });
    const key = identitaetsSchluessel(live);
    const e = {
      schluessel: key,
      eigenerKonflikt: 'bezugstextFehltOderUnpassend' as const,
      zielKonflikte: [],
    };
    expect(baueAnzeigeEintrag(e, new Map([[key, live]]), g, [g])).toMatchObject({
      bezeichnungAnzeige: '§ 5',
      nichtamtlicherTitelGrund: doppelt ? undefined : 'normNichtImGesetz',
    });
  }
  for (const titel of [undefined, 'Allgemeine Vorschriften'])
    for (const anzahl of [0, 1, 2]) {
      const g = gesetz('BGB');
      for (let i = 0; i < anzahl; i++)
        g.elemente.push({
          typ: 'ueberschrift',
          data: {
            id: `u${i}`,
            xmlId: `u${i}`,
            gliederungskennzahl: '010',
            bezeichnung: 'Erster Teil',
            titel,
            ebene: 1,
          },
        });
      const live = kommentarEintrag('010', { ausgangsstelle: ueberschriftAusgangsstelle('010') });
      const key = identitaetsSchluessel(live);
      const e = {
        schluessel: key,
        eigenerKonflikt: 'pauschalerBezugFehlt' as const,
        zielKonflikte: [],
      };
      expect(baueAnzeigeEintrag(e, new Map([[key, live]]), g, [g])?.bezeichnungAnzeige).toBe(
        anzahl === 1 ? (titel ?? 'Erster Teil') : 'Überschrift',
      );
    }
});

it('zeigt Überschriften im gespeicherten Fehlerstand ohne Gliederungskennzahl oder Live-Angaben', async () => {
  const { erstelleGespeicherteGesetzKonflikte } =
    await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
  const gesetzKonflikte = new Map([
    [
      'BGB',
      erstelleGespeicherteGesetzKonflikte({
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        eintraege: [
          {
            ausgangsstelle: ueberschriftAusgangsstelle('010'),

            markierungstyp: 'kommentar',
            kommentarText: 'Notiz',
            textstelle: {
              pfad: bereichPfad('amtlicherTitel'),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 5,
            },
            eigenerKonflikt: 'bezugstextFehltOderUnpassend',
            zielKonflikte: [],
          },
        ],
      }),
    ],
  ]);
  standLaden.mockResolvedValue({ gesetzKonflikte, pruefstatus: 'fehlgeschlagen' });
  ladeEintraege.mockRejectedValue(new Error('Quelle unlesbar'));
  geladeneGesetze.push(gesetz('BGB'));
  const ergebnis = await ladeMarkierungskonflikteFuerAnzeige();
  const e = ergebnis.gesetze[0]!.eintraege[0]!;
  expect(e).toMatchObject({
    ausgangsstelle: ueberschriftAusgangsstelle('010'),
    bezeichnungAnzeige: 'Überschrift',
  });
  expect(e.bezugstext).toBeUndefined();
  expect(e.verweistext).toBeUndefined();
  expect(e.textpfad).toBeUndefined();
  expect(e.nichtamtlicherTitelGrund).toBeUndefined();
});

it('verwirft einen Konflikt mit altem Schlüssel trotz vorhandener Markierung', () => {
  const g = gesetz('BGB', []);
  const live = kommentarEintrag('433');
  const alt: GeparsterKonfliktEintrag = {
    schluessel: '433|kommentar|t:x',
    eigenerKonflikt: 'pauschalerBezugFehlt',
    zielKonflikte: [],
  };
  expect(verifiziereKonfliktEintraege([alt], [live], g, [g], g, new Set())).toEqual({
    neueEintraege: [],
    veraendert: true,
  });
});

it.each(['eindeutig', 'umbenannt', 'mehrdeutig', 'doppelte XML-ID'])(
  'ordnet Präambelkonflikt über denselben Auflösungseinstieg zu: %s',
  (fall) => {
    const live = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: { typ: 'norm', bezeichnung: 'Präambel' },
      bezug: { typ: 'pauschal', elementstand: { textlaenge: 999 } },
    });
    const schluessel = identitaetsSchluessel(live);
    const normen = [norm('p', fall === 'umbenannt' ? 'Präambel neu' : 'Präambel')];
    if (fall === 'mehrdeutig' || fall === 'doppelte XML-ID')
      normen.push(
        norm(fall === 'doppelte XML-ID' ? 'p' : 'q', fall === 'mehrdeutig' ? 'Präambel' : '§ 1'),
      );
    const g = gesetz('BGB', normen);
    const angezeigt = baueAnzeigeEintrag(
      { schluessel, eigenerKonflikt: 'pauschalerBezugFehlt', zielKonflikte: [] },
      new Map([[schluessel, live]]),
      g,
      [g],
    );
    expect(angezeigt?.bezeichnungAnzeige).toBe('Präambel');
    expect(angezeigt?.ausgangsTrefferzahl).toBe(
      fall === 'mehrdeutig' || fall === 'doppelte XML-ID' ? 2 : undefined,
    );
  },
);
