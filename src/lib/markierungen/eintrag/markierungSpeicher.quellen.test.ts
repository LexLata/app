// markierungSpeicher.quellen.test.ts
// Gemeinsame Quellsperren, frische Fassungen und tatsächliche Schreibergebnisse.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import type { Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  berechneZielKonflikte,
  identitaetsSchluessel,
  pruefeEigenenKonflikt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MarkierungsEintrag } from './markierungSpeicher';
import { hinzufuegenMarkierung } from './markierungSpeicher.hinzufuegen';
import { baueXML, parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { mitGesetzDateiSperre } from '@/lib/persistenz/kern/kern.index';
import {
  aendereEintraegeMitGesetzquellen,
  leseEintraegeMitGesetzquellen,
} from './markierungSpeicher.aendern';
import type { AnzeigeGesetzKonflikte } from '@/lib/markierungen/markierungskonflikte/markierungskonflikte.index';
import {
  aktualisiereAusgangsVerknuepfungMitErgebnis,
  aktualisiereVerknuepfungMitErgebnis,
  ermittleAktuelleVerknuepfungsMoeglichkeit,
  ladeAktuelleMarkierung,
  verknuepfeMitAktuellenNormen,
} from '@/lib/markierungen/markierungskonflikte/markierungskonflikte.index';
import { ladeGesetzFuerVerknuepfung } from '@/lib/persistenz/gesetz/gesetz.index';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const m = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  gehalten: new Set<string>(),
  sperrenBeiPruefung: new Array<string[]>(),
  wartende: new Map<string, (() => void)[]>(),
  ereignisse: [] as string[],
  beimErwerb: vi.fn(),
  beimFreigeben: vi.fn(),
  schreiben: vi.fn(),
  abschluss: vi.fn(),
  pruefung: vi.fn(),
  vormerken: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => {
  const freigeben = (pfad: string) => {
    const naechster = m.wartende.get(pfad)?.shift();
    if (naechster) naechster();
    else m.gehalten.delete(pfad);
  };
  return {
    invoke: async (befehl: string, args: { relativerPfad?: string; token?: string }) => {
      const pfad = args.relativerPfad ?? args.token!;
      m.ereignisse.push(`${befehl}:${pfad}`);
      if (befehl === 'datei_sperre_erwerben') {
        if (m.gehalten.has(pfad))
          await new Promise<void>((resolve) => {
            const queue = m.wartende.get(pfad) ?? [];
            queue.push(resolve);
            m.wartende.set(pfad, queue);
          });
        else m.gehalten.add(pfad);
        try {
          await m.beimErwerb(pfad);
        } catch (fehler) {
          freigeben(pfad);
          throw fehler;
        }
        return pfad;
      }
      if (befehl === 'datei_sperre_freigeben') {
        freigeben(pfad);
        await m.beimFreigeben(pfad);
      }
    },
  };
});
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...m.dateien.keys()]
      .filter((p) => p.startsWith(`${ordner}/`))
      .map((p) => ({ name: p.slice(ordner.length + 1) })),
  ermittleGesetzDateipfad: async (ref: { kurztitel: string }, ordner: string, suffix = '.xml') =>
    `${ordner}/${ref.kurztitel}_de-bund${suffix}`,
  appDatenLesen: async (pfad: string) => {
    if (!m.dateien.has(pfad)) throw new Error('fehlt');
    return m.dateien.get(pfad)!;
  },
  appDatenExistiert: async (pfad: string) => m.dateien.has(pfad),
  nutzerdatenSchreiben: (...args: unknown[]) => m.schreiben(...args),
  sicherstelleOrdner: async () => {},
  merkePruefpflichtigeAenderungVor: () => m.vormerken(),
  schliessePruefpflichtigeQuelleAb: (...args: unknown[]) => m.abschluss(...args),
}));
// Die echte Pfadermittlung der Sperrstufe liest ebenfalls diesen Bestand.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...m.dateien.keys()]
      .filter((p) => p.startsWith(`${ordner}/`))
      .map((p) => ({ name: p.slice(ordner.length + 1) })),
  appDatenExistiert: async (pfad: string) => m.dateien.has(pfad),
}));
vi.mock('./markierungSpeicher.ereignisse', () => ({
  meldeMarkierungGeaendert: vi.fn(),
  meldeMarkierungenBulkGeaendert: () => {
    expect(m.gehalten.has('markierungen/A_de-bund-markierungen.xml')).toBe(false);
    // Die Konfliktprüfung beginnt erst, wenn keine Quell- oder Gesetzsperre mehr gehalten wird.
    m.sperrenBeiPruefung.push([...m.gehalten]);
    m.ereignisse.push('pruefen');
    return m.pruefung();
  },
}));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', () => ({
  sendeGlobal: vi.fn(),
}));
const sync = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/event', () => ({ emitTo: sync }));
const gesetz = gesetzesreferenz({ kurztitel: 'A' });
const markPfad = 'markierungen/A_de-bund-markierungen.xml';
const gesetzPfad = 'gesetze/B_de-bund.xml';
const alt: MarkierungsEintrag = markierungsEintrag({
  typ: 'kommentar',
  ausgangsstelle: normAusgangsstelle('§ 1'),
  kommentarText: 'Kommentar',
  bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 1 } },
});
function gesetzesXML(titel: string, kurztitel = 'B'): string {
  return `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>${kurztitel}</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><titel>${titel}</titel><text><absatz>Text</absatz></text></norm></inhalt></gesetz>`;
}
afterEach(() => {
  for (const gehalten of m.sperrenBeiPruefung) expect(gehalten).toEqual([]);
});
beforeEach(() => {
  m.dateien.clear();
  m.gehalten.clear();
  m.sperrenBeiPruefung.length = 0;
  m.wartende.clear();
  m.ereignisse.length = 0;
  m.beimErwerb.mockReset();
  m.beimFreigeben.mockReset();
  m.vormerken.mockReset().mockResolvedValue('vorgang');
  sync.mockReset().mockResolvedValue(undefined);
  m.pruefung.mockReset().mockResolvedValue([]);
  m.abschluss.mockReset().mockImplementation(async () => {
    expect(m.gehalten.has(markPfad)).toBe(false);
  });
  m.schreiben.mockReset().mockImplementation(async (pfad: string, xml: string, token: string) => {
    expect(m.gehalten.has(pfad)).toBe(true);
    expect(token).toBe(pfad);
    expect([...m.gehalten].some((p) => p.startsWith('gesetze/'))).toBe(true);
    m.dateien.set(pfad, xml);
  });
  m.dateien.set(markPfad, baueXML(gesetz, [alt]));
  m.dateien.set(gesetzPfad, gesetzesXML('Alt'));
});
it('berücksichtigt Update vor Sperrerwerb und hält Quellen bis zum echten Bulk-Schreiben', async () => {
  m.beimErwerb.mockImplementation(async (pfad: string) => {
    if (pfad === gesetzPfad) m.dateien.set(gesetzPfad, gesetzesXML('Neu'));
  });
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (alle, quellen) => {
      expect(m.gehalten.has(gesetzPfad)).toBe(true);
      expect(quellen.get('["de-bund","b"]')?.elemente[0]?.data.titel).toBe('Neu');
      return {
        art: 'geaendert',
        eintraege: alle.map((e) =>
          markierungsEintrag({
            ...e,
            bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 4 } },
          }),
        ),
        ergebnis: 1,
      };
    },
  );
  expect(ergebnis).toEqual({ status: 'geaendert', ergebnis: 1 });
  expect(m.schreiben).toHaveBeenCalledTimes(1);
  expect(m.gehalten.size).toBe(0);
  expect(m.ereignisse.at(-1)).toBe('pruefen');
});
it('unveränderte Kopien und verschwundene Markierungen schreiben nichts', async () => {
  const kopie = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (alle) => ({
      art: 'geaendert',
      eintraege: alle.map((e) => markierungsEintrag({ ...e })),
      ergebnis: 0,
    }),
  );
  expect(kopie.status).toBe('unveraendert');
  m.beimErwerb.mockImplementation(async (pfad: string) => {
    if (pfad === markPfad) m.dateien.set(markPfad, baueXML(gesetz, []));
  });
  const weg = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (alle) => {
      expect(alle).toEqual([]);
      return { art: 'unveraendert', ergebnis: 0 };
    },
  );
  expect(weg.status).toBe('unveraendert');
  expect(m.schreiben).not.toHaveBeenCalled();
});
it('liest frische Gesetzquellen unter gemeinsamen Sperren ohne vorgemerkte Änderung', async () => {
  m.beimErwerb.mockImplementation(async (pfad: string) => {
    if (pfad === gesetzPfad) m.dateien.set(gesetzPfad, gesetzesXML('Neu'));
  });
  const titel = await leseEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (eintraege, quellen) => {
      expect(eintraege).toEqual([alt]);
      expect(m.gehalten.has(markPfad)).toBe(true);
      expect(m.gehalten.has(gesetzPfad)).toBe(true);
      return quellen.get('["de-bund","b"]')?.elemente[0]?.data.titel;
    },
  );
  expect(titel).toBe('Neu');
  expect(m.vormerken).not.toHaveBeenCalled();
  expect(m.abschluss).not.toHaveBeenCalled();
  expect(m.schreiben).not.toHaveBeenCalled();
  expect(m.gehalten.size).toBe(0);
});
it('gibt bei beschädigter Gesetzquelle die Lesesperren frei und reicht den Fehler weiter', async () => {
  m.dateien.set(gesetzPfad, '<gesetz>');
  const lesen = vi.fn();
  await expect(
    leseEintraegeMitGesetzquellen(gesetz, () => [gesetzesreferenz({ kurztitel: 'B' })], lesen),
  ).rejects.toThrow();
  expect(lesen).not.toHaveBeenCalled();
  expect(m.vormerken).not.toHaveBeenCalled();
  expect(m.abschluss).not.toHaveBeenCalled();
  expect(m.schreiben).not.toHaveBeenCalled();
  expect(m.gehalten.size).toBe(0);
});
it('protokolliert auch einen Fehler beim Freigeben der Lesesperren', async () => {
  const fehler = new Error('Freigabe');
  m.beimFreigeben.mockImplementation(async (pfad: string) => {
    if (pfad === markPfad) throw fehler;
  });
  const melden = vi.spyOn(console, 'error');
  try {
    expect(
      await leseEintraegeMitGesetzquellen(
        gesetz,
        () => [gesetzesreferenz({ kurztitel: 'B' })],
        () => 1,
      ),
    ).toBe(1);
    expect(melden).toHaveBeenCalledWith('Dateisperre konnte nicht freigegeben werden:', fehler);
    expect(m.vormerken).not.toHaveBeenCalled();
    expect(m.gehalten.size).toBe(0);
  } finally {
    melden.mockRestore();
  }
});
it('behält gespeicherte Änderung bei nachgelagertem Abschlussfehler im Ergebnis', async () => {
  const fehler = new Error('Abschluss');
  m.abschluss.mockRejectedValue(fehler);
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (alle) => ({
      art: 'geaendert',
      eintraege: alle.map((e) => markierungsEintrag({ ...e, kommentarText: 'Neu' })),
      ergebnis: 1,
    }),
  );
  expect(ergebnis).toEqual({ status: 'geaendert', ergebnis: 1, nachgelagerterFehler: fehler });
  expect(m.gehalten.size).toBe(0);
  expect(m.ereignisse.at(-1)).toBe('pruefen');
});
it('gibt alle Quellen nach Schreibfehler und Wartefrist frei', async () => {
  const fehler = new Error('Schreiben');
  m.schreiben.mockRejectedValue(fehler);
  const bearbeiten = (alle: readonly MarkierungsEintrag[]) => ({
    art: 'geaendert' as const,
    eintraege: [],
    ergebnis: alle.length,
  });
  expect(
    await aendereEintraegeMitGesetzquellen(
      gesetz,
      () => [gesetzesreferenz({ kurztitel: 'B' })],
      bearbeiten,
    ),
  ).toEqual({ status: 'fehlgeschlagen', fehler });
  expect(m.gehalten.size).toBe(0);
  m.beimErwerb.mockImplementation(async (pfad: string) => {
    if (pfad === markPfad) throw 'wartefrist';
  });
  expect(
    (
      await aendereEintraegeMitGesetzquellen(
        gesetz,
        () => [gesetzesreferenz({ kurztitel: 'B' })],
        bearbeiten,
      )
    ).status,
  ).toBe('fehlgeschlagen');
  expect(m.gehalten.size).toBe(0);
});

it('wiederholt bei geänderter Quellenmenge mit vollständig freigegebenen alten Sperren', async () => {
  m.dateien.set(markPfad, baueXML(gesetz, [markierungsEintrag({ ...alt, kommentarText: 'B' })]));
  m.dateien.set('gesetze/C_de-bund.xml', gesetzesXML('C neu', 'C'));
  let geaendert = false;
  m.beimErwerb.mockImplementation(async (pfad: string) => {
    if (pfad === markPfad && !geaendert) {
      geaendert = true;
      m.dateien.set(
        markPfad,
        baueXML(gesetz, [markierungsEintrag({ ...alt, kommentarText: 'C' })]),
      );
    }
  });
  const bearbeiten = vi.fn(
    (alle: readonly MarkierungsEintrag[], quellen: ReadonlyMap<string, unknown>) => {
      expect(m.gehalten.has(gesetzPfad)).toBe(false);
      expect(m.gehalten.has('gesetze/C_de-bund.xml')).toBe(true);
      expect(quellen.has('["de-bund","c"]')).toBe(true);
      return { art: 'unveraendert' as const, ergebnis: alle.length };
    },
  );
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    (alle) => alle.map((e) => gesetzesreferenz({ kurztitel: e.kommentarText! })),
    bearbeiten,
  );
  expect(ergebnis).toEqual({ status: 'unveraendert', ergebnis: 1 });
  expect(bearbeiten).toHaveBeenCalledTimes(1);
  expect(m.ereignisse.indexOf(`datei_sperre_freigeben:${gesetzPfad}`)).toBeLessThan(
    m.ereignisse.indexOf('datei_sperre_erwerben:gesetze/C_de-bund.xml'),
  );
  expect(m.gehalten.size).toBe(0);
});
it('Selbstverweise erwerben dieselbe Gesetzquelle nur einmal und reichen dieselbe Fassung weiter', async () => {
  m.dateien.set('gesetze/A_de-bund.xml', gesetzesXML('Eigen', 'A'));
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetz, gesetz],
    (_alle, quellen) => {
      expect(quellen.size).toBe(1);
      expect(quellen.get('["de-bund","a"]')?.kurztitel).toBe('A');
      return { art: 'unveraendert', ergebnis: 0 };
    },
  );
  expect(ergebnis.status).toBe('unveraendert');
  expect(
    m.ereignisse.filter((e) => e === 'datei_sperre_erwerben:gesetze/A_de-bund.xml'),
  ).toHaveLength(1);
});
it('Ladefehler verändern nichts und lassen keine Quellsperren zurück', async () => {
  m.dateien.set(gesetzPfad, '<gesetz normgeber="de-bund">beschädigt</gesetz>');
  const bearbeiten = vi.fn();
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    bearbeiten,
  );
  expect(ergebnis.status).toBe('fehlgeschlagen');
  expect(bearbeiten).not.toHaveBeenCalled();
  expect(m.schreiben).not.toHaveBeenCalled();
  expect(m.gehalten.size).toBe(0);
});

it('ein Gesetzupdate nach Sperrerwerb wartet bis zum Schreiben der geschützten Fassung', async () => {
  let update: Promise<void> | undefined;
  let updateFertig = false;
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (alle, quellen) => {
      expect(quellen.get('["de-bund","b"]')?.elemente[0]?.data.titel).toBe('Alt');
      update = mitGesetzDateiSperre(
        gesetzesreferenz({ kurztitel: 'B' }),
        'gesetze',
        '.xml',
        async (token) => {
          expect(token).toBe(gesetzPfad);
          expect(m.schreiben).toHaveBeenCalledTimes(1);
          m.dateien.set(gesetzPfad, gesetzesXML('Nachher'));
          updateFertig = true;
        },
      );
      expect(updateFertig).toBe(false);
      return {
        art: 'geaendert',
        eintraege: alle.map((e) =>
          markierungsEintrag({ ...e, kommentarText: 'Aus Alt berechnet' }),
        ),
        ergebnis: 1,
      };
    },
  );
  await update;
  expect(ergebnis.status).toBe('geaendert');
  expect(updateFertig).toBe(true);
  expect(m.dateien.get(markPfad)).toContain('Aus Alt berechnet');
  expect(m.dateien.get(gesetzPfad)).toContain('Nachher');
  expect(m.gehalten.size).toBe(0);
  // Bei Prüfbeginn hält nur das wartende fremde Gesetzupdate seine eben übernommene Sperre.
  expect(m.sperrenBeiPruefung).toEqual([['gesetze/b_de-bund.xml.referenz-sperre']]);
  m.sperrenBeiPruefung.length = 0;
});

it('bewahrt das Schreibergebnis, wenn die tatsächlich angestoßene Prüfung scheitert', async () => {
  const fehler = new Error('Prüflauf');
  m.pruefung.mockResolvedValue([fehler]);
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (alle) => ({
      art: 'geaendert',
      eintraege: alle.map((e) => markierungsEintrag({ ...e, kommentarText: 'Gespeichert' })),
      ergebnis: 1,
    }),
  );
  expect(ergebnis.status).toBe('geaendert');
  if (ergebnis.status !== 'fehlgeschlagen')
    expect(ergebnis.nachgelagerterFehler).toBeInstanceOf(AggregateError);
  expect(m.dateien.get(markPfad)).toContain('Gespeichert');
  expect(m.gehalten.size).toBe(0);
});
it('bricht wiederholt wechselnde Quellen begrenzt ab und gibt sämtliche Sperren frei', async () => {
  let kurztitel = 'B';
  m.dateien.set(
    markPfad,
    baueXML(gesetz, [markierungsEintrag({ ...alt, kommentarText: kurztitel })]),
  );
  m.dateien.set('gesetze/C_de-bund.xml', gesetzesXML('C', 'C'));
  m.beimErwerb.mockImplementation(async (pfad) => {
    if (pfad === markPfad) {
      kurztitel = kurztitel === 'B' ? 'C' : 'B';
      m.dateien.set(
        markPfad,
        baueXML(gesetz, [markierungsEintrag({ ...alt, kommentarText: kurztitel })]),
      );
    }
  });
  const bearbeiten = vi.fn();
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    (alle) => alle.map((e) => gesetzesreferenz({ kurztitel: e.kommentarText! })),
    bearbeiten,
  );
  expect(ergebnis.status).toBe('fehlgeschlagen');
  if (ergebnis.status === 'fehlgeschlagen')
    expect(ergebnis.fehler).toMatchObject({
      message: expect.stringContaining('wiederholt verändert'),
    });
  expect(m.ereignisse.filter((e) => e === `datei_sperre_erwerben:${markPfad}`)).toHaveLength(3);
  expect(bearbeiten).not.toHaveBeenCalled();
  expect(m.schreiben).not.toHaveBeenCalled();
  expect(m.gehalten.size).toBe(0);
});

it('meldet einen unbestätigten Quellabschluss ohne auf eine deshalb blockierte Prüfung zu warten', async () => {
  m.abschluss.mockResolvedValue(false);
  m.pruefung.mockImplementation(() => new Promise<unknown[]>(() => {}));
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    () => [gesetzesreferenz({ kurztitel: 'B' })],
    (alle) => ({
      art: 'geaendert',
      eintraege: alle.map((e) => markierungsEintrag({ ...e, kommentarText: 'Gespeichert' })),
      ergebnis: 1,
    }),
  );
  expect(ergebnis.status).toBe('geaendert');
  if (ergebnis.status !== 'fehlgeschlagen')
    expect(ergebnis.nachgelagerterFehler).toMatchObject({
      message: expect.stringContaining('Prüfabschluss'),
    });
  expect(m.gehalten.size).toBe(0);
});

function konfliktListe(e: MarkierungsEintrag, ref = gesetz): AnzeigeGesetzKonflikte[] {
  return [
    {
      gesetz: ref,
      eintraege: [
        {
          ausgangsstelle: normAusgangsstelle(bezeichnungAusgangsstelle(e.ausgangsstelle)),
          bezeichnungAnzeige: bezeichnungAusgangsstelle(e.ausgangsstelle),
          markierungstyp: e.typ,
          schluessel: identitaetsSchluessel(e),
          eigenerKonflikt: 'pauschalerBezugUnpassend',
          zielKonflikte: e.verweisinhalt
            ? [
                {
                  gesetz: gesetzesreferenz({ kurztitel: 'B' }),
                  typ: 'zielNormFehlt',
                  bezeichnungenAnzeige: [],
                },
              ]
            : [],
        },
      ],
    },
  ];
}
function verweis(): MarkierungsEintrag {
  return markierungsEintrag({
    ...alt,
    typ: 'verweismarkierung',
    kommentarText: undefined,
    verweisinhalt: {
      verweistext: 'Ziele',
      verweisziele: [
        verweisziel({
          typ: 'zielnorm',
          gesetz: gesetzesreferenz({ kurztitel: 'B' }),
          bezeichnung: '§ 1',

          elementstand: { textlaenge: 9 },
          verweistextZeichenbereich: [0, 1],
        }),
        verweisziel({
          typ: 'zielnorm',
          gesetz: gesetzesreferenz({ kurztitel: 'B' }),
          bezeichnung: '§ 9',

          elementstand: { textlaenge: 9 },
          verweistextZeichenbereich: [2, 3],
        }),
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: gesetzesreferenz({ kurztitel: 'B' }),
          bezeichnung: '§ 1',

          verweistextZeichenbereich: [4, 5],
        }),
      ],
    },
  });
}
function gespeicherte(): MarkierungsEintrag[] {
  return parseEintraege(m.dateien.get(markPfad)!, gesetz).eintraege;
}
it('Anzeigeermittlung löst keinen neuen Prüfbedarf oder Quellabschluss aus', async () => {
  const e = verweis();
  m.dateien.set(markPfad, baueXML(gesetz, [e]));
  m.dateien.set('gesetze/A_de-bund.xml', gesetzesXML('Eigen', 'A'));
  expect(await ermittleAktuelleVerknuepfungsMoeglichkeit(konfliktListe(e))).toEqual({
    moeglich: true,
    fehler: [],
  });
  expect(m.vormerken).not.toHaveBeenCalled();
  expect(m.abschluss).not.toHaveBeenCalled();
  expect(m.schreiben).not.toHaveBeenCalled();
  expect(m.gehalten.size).toBe(0);
});
it('Zieldetails zum Anzeigen lösen keinen neuen Prüfbedarf aus', async () => {
  const e = verweis();
  m.dateien.set(markPfad, baueXML(gesetz, [e]));
  const details = await ladeAktuelleMarkierung(gesetz, identitaetsSchluessel(e));
  expect(details?.verweisinhalt).toEqual(e.verweisinhalt);
  expect(m.vormerken).not.toHaveBeenCalled();
  expect(m.abschluss).not.toHaveBeenCalled();
  expect(m.schreiben).not.toHaveBeenCalled();
});
it('Einzel-Ausgangsaktion speichert nur den frischen Ausgangsstand; Zielaktion nur die betroffene Gruppe', async () => {
  const e = verweis();
  m.dateien.set(markPfad, baueXML(gesetz, [e]));
  m.dateien.set('gesetze/A_de-bund.xml', gesetzesXML('Eigen', 'A'));
  const ausgang = await aktualisiereAusgangsVerknuepfungMitErgebnis(
    gesetz,
    identitaetsSchluessel(e),
  );
  expect(ausgang).toEqual({
    status: 'geaendert',
    ergebnis: { elementstaende: 1, verweisziele: 0, markierungen: 1 },
  });
  expect(gespeicherte()[0]!.verweisinhalt).toEqual(e.verweisinhalt);
  const vorZiel = gespeicherte()[0]!;
  const ziel = await aktualisiereVerknuepfungMitErgebnis(
    gesetz,
    identitaetsSchluessel(e),
    gesetzesreferenz({ kurztitel: 'B' }),
    'verknuepfen',
    { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
  );
  expect(ziel).toEqual({
    status: 'geaendert',
    ergebnis: { elementstaende: 0, verweisziele: 1, markierungen: 1 },
  });
  expect(gespeicherte()[0]!.bezug.elementstand).toEqual(vorZiel.bezug.elementstand);
  expect(gespeicherte()[0]!.verweisinhalt!.verweisziele.slice(1)).toEqual(
    e.verweisinhalt!.verweisziele.slice(1),
  );
  const quelle = await mitGesetzDateiSperre(
    gesetzesreferenz({ kurztitel: 'B' }),
    'gesetze',
    '.xml',
    (token) =>
      ladeGesetzFuerVerknuepfung(gesetzesreferenz({ kurztitel: 'B' }), { pfad: gesetzPfad, token }),
  );
  expect(berechneZielKonflikte(gespeicherte()[0]!, quelle!, [quelle!])).toMatchObject([
    { typ: 'zielNormFehlt', bezeichnungen: [{ bezeichnung: '§ 9' }] },
  ]);
  expect(m.gehalten.size).toBe(0);
});
it('Sammelaktion ermittelt und speichert über die gesamte angezeigte Liste beide Standarten je Markierung einmal', async () => {
  const e = verweis();
  m.dateien.set(markPfad, baueXML(gesetz, [e]));
  m.dateien.set('gesetze/A_de-bund.xml', gesetzesXML('Eigen', 'A'));
  const liste = konfliktListe(e);
  expect(await ermittleAktuelleVerknuepfungsMoeglichkeit(liste)).toEqual({
    moeglich: true,
    fehler: [],
  });
  expect(m.schreiben).not.toHaveBeenCalled();
  const details = await ladeAktuelleMarkierung(gesetz, identitaetsSchluessel(e));
  expect(details?.verweisinhalt).toEqual(e.verweisinhalt);
  const bericht = await verknuepfeMitAktuellenNormen([...liste, ...liste]);
  expect(bericht.zahlen).toEqual({ elementstaende: 1, verweisziele: 1, markierungen: 1 });
  expect(bericht.fehler).toEqual([]);
  expect(bericht.gesetze).toHaveLength(1);
  expect(m.schreiben).toHaveBeenCalledOnce();
  expect(await ermittleAktuelleVerknuepfungsMoeglichkeit(liste)).toEqual({
    moeglich: false,
    fehler: [],
  });
  expect((await verknuepfeMitAktuellenNormen(liste)).zahlen.markierungen).toBe(0);
  const eigenes = await mitGesetzDateiSperre(gesetz, 'gesetze', '.xml', (token) =>
    ladeGesetzFuerVerknuepfung(gesetz, { pfad: 'gesetze/A_de-bund.xml', token }),
  );
  expect(pruefeEigenenKonflikt(gespeicherte()[0]!, eigenes!)).toBeUndefined();
});
it.each(['aktualisiert', 'geloescht', 'zielEntfernt'] as const)(
  'Sammelaktion berücksichtigt %s unter Sperre statt des Fensterstandes',
  async (art) => {
    const e = verweis();
    m.dateien.set(markPfad, baueXML(gesetz, [e]));
    m.dateien.set('gesetze/A_de-bund.xml', gesetzesXML('Eigen', 'A'));
    let ersetzt = false;
    m.beimErwerb.mockImplementation(async (pfad) => {
      if (pfad !== markPfad || ersetzt) return;
      ersetzt = true;
      const neu = markierungsEintrag({
        ...e,
        bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Eigen', textlaenge: 4 } },
        verweisinhalt: {
          ...e.verweisinhalt!,
          verweisziele: e.verweisinhalt!.verweisziele.map((z): Verweisziel => {
            if (z.typ !== 'zielnorm') return z;
            if (art === 'zielEntfernt') {
              const { elementstand: _stand, ...kennung } = z;
              return { ...kennung, typ: 'zielnormOhneElementstand' };
            }
            return {
              ...z,
              elementstand:
                z.bezeichnung === '§ 1' ? { titel: 'Alt', textlaenge: 4 } : z.elementstand,
            };
          }),
        },
      });
      m.dateien.set(markPfad, baueXML(gesetz, art === 'geloescht' ? [] : [neu]));
    });
    const bericht = await verknuepfeMitAktuellenNormen(konfliktListe(e));
    expect(bericht.zahlen.markierungen).toBe(0);
    expect(m.schreiben).not.toHaveBeenCalled();
    expect(m.gehalten.size).toBe(0);
  },
);
it('Ladefehler bleiben bei Möglichkeitsermittlung Fehler und werden nicht als Konfliktfreiheit ausgegeben', async () => {
  m.dateien.set('gesetze/A_de-bund.xml', '<gesetz normgeber="de-bund">kaputt</gesetz>');
  const moeglichkeit = await ermittleAktuelleVerknuepfungsMoeglichkeit(konfliktListe(alt));
  expect(moeglichkeit.moeglich).toBe(false);
  expect(moeglichkeit.fehler).toHaveLength(1);
  const bericht = await verknuepfeMitAktuellenNormen(konfliktListe(alt));
  expect(bericht.zahlen.markierungen).toBe(0);
  expect(bericht.gesetze[0]!.ergebnis.status).toBe('fehlgeschlagen');
  expect(m.gehalten.size).toBe(0);
});
it('Teil-Schreibfehler lassen gespeicherte Änderungen anderer Gesetze und offene Fehler im Bericht stehen', async () => {
  m.dateien.set('gesetze/A_de-bund.xml', gesetzesXML('Eigen', 'A'));
  m.dateien.set(
    'markierungen/C_de-bund-markierungen.xml',
    baueXML(gesetzesreferenz({ kurztitel: 'C' }), [alt]),
  );
  m.dateien.set('gesetze/C_de-bund.xml', gesetzesXML('Eigen', 'C'));
  const erfolgreichSchreiben = m.schreiben.getMockImplementation()!;
  m.schreiben.mockImplementation(async (...args: unknown[]) => {
    if (args[0] === 'markierungen/C_de-bund-markierungen.xml')
      throw new Error('C nicht schreibbar');
    return erfolgreichSchreiben(...args);
  });
  const bericht = await verknuepfeMitAktuellenNormen([
    ...konfliktListe(alt),
    ...konfliktListe(alt, gesetzesreferenz({ kurztitel: 'C' })),
  ]);
  expect(bericht.zahlen).toEqual({ elementstaende: 1, verweisziele: 0, markierungen: 1 });
  expect(bericht.gesetze.map((g) => g.ergebnis.status)).toEqual(['geaendert', 'fehlgeschlagen']);
  expect(bericht.fehler).toHaveLength(1);
  expect(gespeicherte()[0]!.bezug.elementstand).toEqual({ titel: 'Eigen', textlaenge: 4 });
  expect(m.gehalten.size).toBe(0);
});
it('unbestätigter Quellabschluss erhält gespeicherte Zahlen, versucht Sync und lässt übrige Gesetze ausdrücklich offen', async () => {
  m.dateien.set('gesetze/A_de-bund.xml', gesetzesXML('Eigen', 'A'));
  m.abschluss.mockResolvedValue(false);
  m.pruefung.mockImplementation(() => new Promise<unknown[]>(() => {}));
  const bericht = await verknuepfeMitAktuellenNormen([
    ...konfliktListe(alt),
    ...konfliktListe(alt, gesetzesreferenz({ kurztitel: 'C' })),
  ]);
  expect(bericht.zahlen.markierungen).toBe(1);
  expect(bericht.fehler).toHaveLength(1);
  expect(bericht.unbearbeiteteGesetze).toEqual([gesetzesreferenz({ kurztitel: 'C' })]);
  expect(sync).toHaveBeenCalledOnce();
  expect(m.gehalten.size).toBe(0);
});

it('gibt einen Rohwertfehler beim Lesen mit Meldung und freigegebenen Sperren als Error weiter', async () => {
  await expect(
    leseEintraegeMitGesetzquellen(
      gesetz,
      () => [],
      () => {
        throw 'Lesen gescheitert';
      },
    ),
  ).rejects.toMatchObject({ message: 'Lesen gescheitert', cause: 'Lesen gescheitert' });
  expect(m.gehalten.size).toBe(0);
});

it('hält beim echten Anlegen die Gesetzquelle bis zum Schreiben gegen ein wartendes Update gesperrt', async () => {
  const quellPfad = 'gesetze/A_de-bund.xml';
  m.dateien.set(quellPfad, gesetzesXML('Alt', 'A'));
  m.dateien.set(markPfad, baueXML(gesetz, []));
  let update: Promise<void> | undefined;
  let updateFertig = false;
  m.beimErwerb.mockImplementation(async (pfad: string) => {
    if (pfad !== markPfad) return;
    expect(m.gehalten.has(quellPfad)).toBe(true);
    update = mitGesetzDateiSperre(gesetz, 'gesetze', '.xml', async () => {
      expect(m.schreiben).toHaveBeenCalledTimes(1);
      m.dateien.set(quellPfad, gesetzesXML('Nachher', 'A'));
      updateFertig = true;
    });
  });
  m.schreiben.mockImplementation(async (pfad: string, xml: string, token: string) => {
    expect(token).toBe(markPfad);
    expect(m.gehalten.has(quellPfad)).toBe(true);
    expect(updateFertig).toBe(false);
    expect([...m.wartende.values()].some((queue) => queue.length > 0)).toBe(true);
    m.dateien.set(pfad, xml);
  });
  const ergebnis = await hinzufuegenMarkierung(gesetz, alt);
  await update;
  expect(ergebnis.erfolgreich).toBe(true);
  const [gespeichert] = parseEintraege(m.dateien.get(markPfad) ?? '').eintraege;
  expect(gespeichert?.bezug.elementstand?.titel).toBe('Alt');
  expect(m.dateien.get(quellPfad)).toContain('Nachher');
  expect(updateFertig).toBe(true);
  expect(m.gehalten.size).toBe(0);
});
