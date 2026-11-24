import { normaleNorm, gesetzesreferenz, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// konfliktaktionen.zuordnung.test.ts
// Bestehende Verknüpfungsaktionen verwenden dieselbe strikte Zuordnung wie die Prüfung.

import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { aktualisiereVerknuepfungMitErgebnis } from './konfliktaktionen.verknuepfen';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const mocks = vi.hoisted(() => ({
  laden: vi.fn(),
  gesetze: vi.fn(),
  aendern: vi.fn(),
  pruefen: vi.fn(),
  verifizieren: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('@/lib/markierungen/eintrag/eintrag.index', () => ({
  ladeEintraege: mocks.laden,
  aendereEintraegeMitGesetzquellen: mocks.aendern,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({ ladeAlleGesetze: mocks.gesetze }));
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette',
  () => ({
    reiheInPruefungsKetteEin: mocks.pruefen,
  }),
);
vi.mock('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige', () => ({
  verifiziereBekannteKonflikte: mocks.verifizieren,
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: mocks.sync }));
const gesetz = gesetzesreferenz({ kurztitel: 'Test' });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pruefen.mockReset().mockResolvedValue(undefined);
  mocks.sync.mockReset().mockResolvedValue(undefined);
  mocks.verifizieren.mockReset().mockResolvedValue(undefined);
});
function norm(xmlId: string, bezeichnung: string): NormDarstellung {
  return normaleNorm({ id: xmlId, xmlId, bezeichnung, titel: 'Aktuell', absaetze: [] });
}
it.each([
  { normen: [norm('90', '§ 90')], bezeichnung: '§ 9', erwartet: 'unveraendert' },
  {
    normen: [norm('p', '§ 1'), norm('a', 'Anhang 1')],
    bezeichnung: '1',

    erwartet: 'unveraendert',
  },
  { normen: [norm('p', '§ 1')], bezeichnung: 'Art. 1', erwartet: 'unveraendert' },
  { normen: [norm('p', '§ 1')], bezeichnung: 'Art. § 1', erwartet: 'unveraendert' },
  {
    normen: [norm('p', '§ 1'), norm('p2', '§ 1')],
    bezeichnung: '§ 1',

    erwartet: 'unveraendert',
  },
  {
    normen: [norm('p', '§ 1'), norm('a', 'Anhang 1')],
    bezeichnung: 'Anhang 1',

    erwartet: 'Anhang',
  },
  { normen: [norm('p', '§ 1')], bezeichnung: '§ 1', erwartet: '§' },
])(
  'verknüpft nur eindeutig vorhandene Normen: $bezeichnung, $praefix',
  async ({ normen, bezeichnung, erwartet }) => {
    const z: Verweisziel = verweisziel({
      typ: 'zielnorm',
      bezeichnung,
      elementstand: { textlaenge: 9 },
      verweistextZeichenbereich: [0, 1],
    });
    const live: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'Ziel', verweisziele: [z] },
    });
    const g: GesetzDarstellung = {
      ...gesetz,
      langtitel: 'Test',
      hatGliederungsartikel: false,
      elemente: normen.map((data) => ({ typ: 'norm', data })),
    };
    mocks.laden.mockResolvedValue([live]);
    mocks.gesetze.mockResolvedValue([g]);
    mocks.aendern.mockImplementation(async (_gesetz, quellen, berechnen) => {
      expect(quellen([live])).toEqual([gesetz]);
      const ergebnis = berechnen([live], new Map([[gesetzesreferenzSchluessel(gesetz), g]]));
      if (erwartet === 'unveraendert')
        expect(ergebnis).toEqual({
          art: 'unveraendert',
          ergebnis: { elementstaende: 0, verweisziele: 0, markierungen: 0 },
        });
      else
        expect(ergebnis.eintraege[0].verweisinhalt.verweisziele[0]).toEqual({
          ...z,
          elementstand: { titel: 'Aktuell', textlaenge: 0 },
          bezeichnung: `${erwartet} 1`,
        });
      return { status: ergebnis.art, ergebnis: ergebnis.ergebnis };
    });
    const ergebnis = await aktualisiereVerknuepfungMitErgebnis(
      gesetz,
      identitaetsSchluessel(live),
      gesetz,
      'verknuepfen',
      { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung }] },
    );
    expect(ergebnis.status).not.toBe('fehlgeschlagen');
    expect(ergebnis).not.toHaveProperty('nachgelagerterFehler');
  },
);

function frischerBestand(live: MarkierungsEintrag[], gesetze: GesetzDarstellung[]) {
  mocks.aendern.mockImplementation(async (_gesetz, ermittleQuellen, berechnen) => {
    const refs = ermittleQuellen(live);
    const quellen = new Map(
      refs.map((ref: Gesetzesreferenz) => [
        gesetzesreferenzSchluessel(ref),
        gesetze.find((g) => gesetzesreferenzSchluessel(g) === gesetzesreferenzSchluessel(ref)) ??
          null,
      ]),
    );
    const aenderung = berechnen(live, quellen);
    return { status: aenderung.art, ergebnis: aenderung.ergebnis };
  });
}
function zielgesetz(kurztitel: string): GesetzDarstellung {
  return gesetzMitNormen(['§ 1'], {
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    kennung: () => 'p',
    norm: { titel: 'Aktuell' },
  });
}
it('überspringt live entfernte Verknüpfungen und inzwischen verschwundene Markierungen', async () => {
  const live: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    verweisinhalt: {
      verweistext: 'Ziel',
      verweisziele: [
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: '1',
          verweistextZeichenbereich: [0, 1],
        }),
      ],
    },
  });
  frischerBestand([live], [zielgesetz(gesetz.kurztitel)]);
  expect(
    await aktualisiereVerknuepfungMitErgebnis(
      gesetz,
      identitaetsSchluessel(live),
      gesetz,
      'verknuepfen',
      { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
    ),
  ).toEqual({
    status: 'unveraendert',
    ergebnis: { elementstaende: 0, verweisziele: 0, markierungen: 0 },
  });
  frischerBestand([], [zielgesetz(gesetz.kurztitel)]);
  expect(
    await aktualisiereVerknuepfungMitErgebnis(
      gesetz,
      identitaetsSchluessel(live),
      gesetz,
      'verknuepfen',
      { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
    ),
  ).toEqual({
    status: 'unveraendert',
    ergebnis: { elementstaende: 0, verweisziele: 0, markierungen: 0 },
  });
});
it('ändert nur die betroffene Zielgesetzgruppe und zählt bereits passende Ziele nicht', async () => {
  const z: Verweisziel = verweisziel({
    typ: 'zielnorm',
    bezeichnung: '§ 1',

    elementstand: { textlaenge: 9 },
    verweistextZeichenbereich: [0, 1],
  });
  const fremd = { ...z, gesetz: gesetzesreferenz({ kurztitel: 'Fremd' }) };
  const live: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    verweisinhalt: { verweistext: 'Ziele', verweisziele: [z, fremd] },
  });
  mocks.aendern.mockImplementation(async (_gesetz, ermittleQuellen, berechnen) => {
    expect(ermittleQuellen([live])).toEqual([gesetz]);
    const aenderung = berechnen(
      [live],
      new Map([[gesetzesreferenzSchluessel(gesetz), zielgesetz(gesetz.kurztitel)]]),
    );
    expect(aenderung.eintraege[0].verweisinhalt.verweisziele[1]).toBe(fremd);
    const aktuell = aenderung.eintraege[0];
    expect(
      berechnen(
        [aktuell],
        new Map([[gesetzesreferenzSchluessel(gesetz), zielgesetz(gesetz.kurztitel)]]),
      ).art,
    ).toBe('unveraendert');
    return { status: aenderung.art, ergebnis: aenderung.ergebnis };
  });
  expect(
    await aktualisiereVerknuepfungMitErgebnis(
      gesetz,
      identitaetsSchluessel(live),
      gesetz,
      'verknuepfen',
      { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
    ),
  ).toEqual({
    status: 'geaendert',
    ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
  });
});
it('erhält gespeicherte Änderungen auch bei nachgelagerten Prüf-/Synchronisierungsfehlern', async () => {
  const fehler = new Error('Prüfung');
  mocks.aendern.mockResolvedValue({
    status: 'geaendert',
    ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
  });
  mocks.pruefen.mockRejectedValue(fehler);
  expect(
    await aktualisiereVerknuepfungMitErgebnis(gesetz, 'schluessel', gesetz, 'verknuepfen', {
      zeilenart: 'zielNormUnpassend',
      verweisziele: [{ bezeichnung: '§ 1' }],
    }),
  ).toEqual({
    status: 'geaendert',
    ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
    nachgelagerterFehler: fehler,
  });
  mocks.pruefen.mockResolvedValue(undefined);
  mocks.sync.mockRejectedValue(fehler);
  expect(
    await aktualisiereVerknuepfungMitErgebnis(gesetz, 'schluessel', gesetz, 'verknuepfen', {
      zeilenart: 'zielNormUnpassend',
      verweisziele: [{ bezeichnung: '§ 1' }],
    }),
  ).toEqual({
    status: 'geaendert',
    ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
    nachgelagerterFehler: fehler,
  });
});
it('meldet Schreibfehler ohne Erfolg oder anschließende Prüfung', async () => {
  const fehler = new Error('Schreiben');
  mocks.aendern.mockResolvedValue({ status: 'fehlgeschlagen', fehler });
  expect(
    await aktualisiereVerknuepfungMitErgebnis(gesetz, 'schluessel', gesetz, 'verknuepfen', {
      zeilenart: 'zielNormUnpassend',
      verweisziele: [{ bezeichnung: '§ 1' }],
    }),
  ).toEqual({ status: 'fehlgeschlagen', fehler });
  expect(mocks.pruefen).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

it.each(['geaendert', 'unveraendert'] as const)(
  'liefert %s mit unbestätigtem Abschluss ohne erneutes Warten auf blockierte Prüfqueue',
  async (status) => {
    const fehler = new Error('Quellabschluss nicht bestätigt');
    const gespeichert = {
      status,
      ergebnis: {
        elementstaende: 0,
        verweisziele: status === 'geaendert' ? 1 : 0,
        markierungen: status === 'geaendert' ? 1 : 0,
      },
      nachgelagerterFehler: fehler,
    };
    mocks.aendern.mockResolvedValue(gespeichert);
    mocks.pruefen.mockImplementation(() => new Promise<void>(() => {}));
    mocks.verifizieren.mockImplementation(() => new Promise<void>(() => {}));
    expect(
      await aktualisiereVerknuepfungMitErgebnis(gesetz, 'schluessel', gesetz, 'verknuepfen', {
        zeilenart: 'zielNormUnpassend',
        verweisziele: [{ bezeichnung: '§ 1' }],
      }),
    ).toEqual(gespeichert);
    expect(mocks.pruefen).not.toHaveBeenCalled();
    expect(mocks.verifizieren).not.toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledOnce();
  },
);
it('ergänzt Synchronisierungsfehler beim vorhandenen Nachfehler ohne erneute Prüfung', async () => {
  const abschluss = new Error('Abschluss');
  const sync = new Error('Sync');
  mocks.aendern.mockResolvedValue({
    status: 'geaendert',
    ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
    nachgelagerterFehler: abschluss,
  });
  mocks.pruefen.mockImplementation(() => new Promise<void>(() => {}));
  mocks.sync.mockRejectedValue(sync);
  const ergebnis = await aktualisiereVerknuepfungMitErgebnis(
    gesetz,
    'schluessel',
    gesetz,
    'verknuepfen',
    { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
  );
  expect(ergebnis.status).toBe('geaendert');
  if (ergebnis.status !== 'fehlgeschlagen')
    expect(ergebnis.nachgelagerterFehler).toMatchObject({ errors: [abschluss, sync] });
  expect(mocks.pruefen).not.toHaveBeenCalled();
});

it.each([
  ['zielNormUnpassend', '1'],
  ['zielNormNichtEindeutig', '2'],
  ['zielNormFehlt', '9'],
] as const)(
  'entfernt ausschließlich angezeigte und frisch passende Konflikte der Zeilenart %s',
  async (zeilenart, bezeichnung) => {
    const ziele = ['1', '2', '9', '3', '4'].map((b) =>
      verweisziel({
        typ: 'zielnorm',
        bezeichnung: `§ ${b}`,

        elementstand: { titel: 'Aktuell', textlaenge: b === '3' ? 0 : 9 },
        verweistextZeichenbereich: [0, 1] as [number, number],
      }),
    );
    const live: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'Ziele', verweisziele: ziele },
    });
    const g = gesetzMitNormen(['§ 1', '§ 2', '§ 2', '§ 3', '§ 4'], {
      kurztitel: gesetz.kurztitel,
      langtitel: gesetz.kurztitel,
      hatGliederungsartikel: false,
      kennung: (i) => (i === 0 ? 'p' : `n${i - 1}`),
      norm: { titel: 'Aktuell' },
    });
    mocks.aendern.mockImplementation(async (_gesetz, _quellen, berechnen) => {
      const aenderung = berechnen([live], new Map([[gesetzesreferenzSchluessel(gesetz), g]]));
      const neu = aenderung.eintraege[0].verweisinhalt.verweisziele;
      ziele.forEach((z, i) => {
        if (z.bezeichnung === `§ ${bezeichnung}`) expect(neu[i].elementstand).toBeUndefined();
        else expect(neu[i]).toBe(z);
      });
      return { status: aenderung.art, ergebnis: aenderung.ergebnis };
    });
    expect(
      await aktualisiereVerknuepfungMitErgebnis(
        gesetz,
        identitaetsSchluessel(live),
        gesetz,
        'entfernen',
        {
          zeilenart,
          verweisziele: [{ bezeichnung: '§ ' + bezeichnung }, { bezeichnung: '§ 3' }],
        },
      ),
    ).toEqual({
      status: 'geaendert',
      ergebnis: { markierungen: 1, verweisziele: 1, elementstaende: 0 },
    });
  },
);

it('ändert ohne ladbares Zielgesetz nichts', async () => {
  const live: MarkierungsEintrag = markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    verweisinhalt: {
      verweistext: 'Ziel',
      verweisziele: [
        verweisziel({
          typ: 'zielnorm',
          bezeichnung: '§ 1',

          elementstand: { textlaenge: 9 },
          verweistextZeichenbereich: [0, 1],
        }),
      ],
    },
  });
  frischerBestand([live], []);
  expect(
    await aktualisiereVerknuepfungMitErgebnis(
      gesetz,
      identitaetsSchluessel(live),
      gesetz,
      'entfernen',
      { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
    ),
  ).toEqual({
    status: 'unveraendert',
    ergebnis: { markierungen: 0, verweisziele: 0, elementstaende: 0 },
  });
});

it.each(['verknuepfen', 'entfernen'] as const)(
  'beachtet Präfix und Zielgesetz der angezeigten Identität beim %s',
  async (modus) => {
    const verweisziele: Verweisziel[] = [
      verweisziel({
        typ: 'zielnorm',
        bezeichnung: '§ 1',

        elementstand: { textlaenge: 9 },
        verweistextZeichenbereich: [0, 1],
      }),
      verweisziel({
        typ: 'zielnorm',
        bezeichnung: 'Art. 1',

        elementstand: { textlaenge: 9 },
        verweistextZeichenbereich: [2, 3],
      }),
      verweisziel({
        typ: 'zielnorm',
        bezeichnung: '§ 1',

        gesetz: gesetzesreferenz({ kurztitel: 'Anderes' }),
        elementstand: { textlaenge: 9 },
        verweistextZeichenbereich: [4, 5],
      }),
    ];
    const live: MarkierungsEintrag = markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'verweismarkierung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      verweisinhalt: { verweistext: 'Ziele', verweisziele },
    });
    const g = zielgesetz(gesetz.kurztitel);
    g.elemente.push({ typ: 'norm', data: norm('a', 'Art. 1') });
    mocks.aendern.mockImplementation(async (_gesetz, _quellen, berechnen) => {
      const aenderung = berechnen([live], new Map([[gesetzesreferenzSchluessel(gesetz), g]]));
      const neu = aenderung.eintraege[0].verweisinhalt.verweisziele;
      expect(neu[0]).not.toBe(verweisziele[0]);
      expect(neu[1]).toBe(verweisziele[1]);
      expect(neu[2]).toBe(verweisziele[2]);
      return { status: aenderung.art, ergebnis: aenderung.ergebnis };
    });
    expect(
      await aktualisiereVerknuepfungMitErgebnis(
        gesetz,
        identitaetsSchluessel(live),
        gesetz,
        modus,
        { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
      ),
    ).toEqual({
      status: 'geaendert',
      ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
    });
  },
);

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: mocks.gesetze,
}));
