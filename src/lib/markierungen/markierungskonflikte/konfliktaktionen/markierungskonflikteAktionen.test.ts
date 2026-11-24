import { gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonflikteAktionen.test.ts
//
// Unit-Tests für loescheMarkierungsDatei/berechneZielelementstaende. Erstere ist
// I/O-Orchestrierung (appDatenLoeschen/appDatenSchreiben, ladeEintraege),
// nach der sonst geltenden Konvention (siehe Kopfkommentar in
// markierungSpeicher.hinzufuegen.test.ts) würde das eigentlich NICHT
// getestet – hier bewusste Ausnahme analog zu markierungSpeicher.undo.test.ts:
// die eigentliche Komplexität liegt nicht im I/O selbst, sondern in der
// Zuordnungslogik von berechneZielelementstaende (welche verweisziele sind
// vom Zielgesetz betroffen, wie wirkt sich berechneNeuenElementstand auf
// elementstand/praefix aus).
//
// '@/lib/persistenz/kern/kern.index' und
// '@/lib/markierungen/eintrag/eintrag.index' werden komplett
// gemockt, ebenso ermittleMarkierungsDateipfad/ladeEintraege aus
// '@/lib/markierungen/eintrag/eintrag.index'. identitaetsSchluessel()
// aus markierungskonfliktPruefung.ts bleibt UNGEMOCKT (reine, pure Funktion) –
// genau wie in markierungSpeicher.undo.test.ts.

import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  berechneElementstand,
  berechneZielelementstaende,
  loescheMarkierungsDatei,
} from './markierungskonflikteAktionen';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const appDatenLoeschen = vi.fn<(pfad: string, token?: string) => Promise<void>>();
const appDatenSchreiben = vi.fn<(pfad: string, inhalt: string, token?: string) => Promise<void>>();
const testToken = 'sperrtoken-import';
const mitDateiSperre = vi.fn(async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
  aktion(testToken),
);
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitGesetzDateiSperre: async (
    ref: Gesetzesreferenz,
    _ordner: string,
    _suffix: string,
    aktion: (token: string) => Promise<unknown>,
  ) => mitDateiSperre(await ermittleMarkierungsDateipfad(ref), aktion),
  appDatenLoeschen: (...args: [string, string?]) => appDatenLoeschen(...args),
  appDatenSchreiben: (...args: [string, string, string?]) => appDatenSchreiben(...args),
}));

const baueXML = vi.fn<(gesetz: Gesetzesreferenz, eintraege: MarkierungsEintrag[]) => string>();
const ermittleMarkierungsDateipfad = vi.fn<(gesetz: Gesetzesreferenz) => Promise<string>>();
const ladeEintraege =
  vi.fn<(gesetz: Gesetzesreferenz, token?: string) => Promise<MarkierungsEintrag[]>>();
vi.mock('@/lib/markierungen/eintrag/eintrag.index', () => ({
  loescheMarkierungsDatei: async (gesetz: Gesetzesreferenz) =>
    mitDateiSperre(await ermittleMarkierungsDateipfad(gesetz), (token) =>
      appDatenLoeschen(`${gesetz.kurztitel}.xml`, token),
    ),
  ermittleMarkierungsDateipfad: (...args: [Gesetzesreferenz]) =>
    ermittleMarkierungsDateipfad(...args),
  ladeEintraege: (...args: [Gesetzesreferenz, string?]) => ladeEintraege(...args),
}));

function eintrag(overrides: Parameters<typeof markierungsEintrag>[0] = {}): MarkierungsEintrag {
  return markierungsEintrag({
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mitDateiSperre.mockImplementation(async (_pfad, aktion) => aktion(testToken));
  ermittleMarkierungsDateipfad.mockImplementation(async (k) => `${k.kurztitel}.xml`);
  appDatenLoeschen.mockResolvedValue(undefined);
  appDatenSchreiben.mockResolvedValue(undefined);
  baueXML.mockReturnValue('<xml/>');
  ladeEintraege.mockResolvedValue([]);
});

describe('loescheMarkierungsDatei', () => {
  it('löscht die Datei über ermittleMarkierungsDateipfad(kurztitel)', async () => {
    await loescheMarkierungsDatei(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(ermittleMarkierungsDateipfad).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
    );
    expect(appDatenLoeschen).toHaveBeenCalledWith('BGB.xml', testToken);
    expect(mitDateiSperre).toHaveBeenCalledWith('BGB.xml', expect.any(Function));
  });

  it('reicht Löschfehler weiter; fehlende Dateien behandelt bereits der native Befehl', async () => {
    const fehler = new Error('ungültiger Token');
    appDatenLoeschen.mockRejectedValue(fehler);
    await expect(loescheMarkierungsDatei(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toBe(
      fehler,
    );
  });
});

describe('berechneZielelementstaende', () => {
  const BGB = gesetzesreferenz({ kurztitel: 'BGB' });
  const GG = gesetzesreferenz({ kurztitel: 'GG' });

  it('liefert denselben Eintrag, wenn er kein verweisinhalt hat', () => {
    const bestand = eintrag();
    expect(berechneZielelementstaende(BGB, bestand, GG, () => 'unveraendert')).toBe(bestand);
  });

  it("nur verweisziele mit passendem Zielgesetz werden über berechneNeuenElementstand verarbeitet, andere bleiben unverändert (auch bei 'unveraendert')", () => {
    const passend: Verweisziel = verweisziel({
      typ: 'zielnorm',
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      bezeichnung: '§ 1',
      verweistextZeichenbereich: [0, 3],
      elementstand: { textlaenge: 5 },
    });
    const andereGesetz: Verweisziel = verweisziel({
      typ: 'zielnorm',
      gesetz: gesetzesreferenz({ kurztitel: 'HGB' }),
      bezeichnung: '§ 2',
      verweistextZeichenbereich: [3, 6],
      elementstand: { textlaenge: 7 },
    });
    const bestand = eintrag({
      verweisinhalt: { verweistext: 'GG, HGB', verweisziele: [passend, andereGesetz] },
    });

    const berechneNeuenElementstand = vi.fn(() => 'unveraendert' as const);
    const ergebnis = berechneZielelementstaende(BGB, bestand, GG, berechneNeuenElementstand);

    expect(berechneNeuenElementstand).toHaveBeenCalledTimes(1);
    expect(berechneNeuenElementstand).toHaveBeenCalledWith(passend);
    expect(ergebnis).toBe(bestand);
    expect(bestand.verweisinhalt!.verweisziele).toEqual([passend, andereGesetz]);
  });

  it('Selbstverweis: fehlendes z.gesetz wird als kurztitel des eigenen Gesetzes behandelt', () => {
    const selbstverweis: Verweisziel = verweisziel({
      typ: 'zielnorm',
      // kein gesetz -> Selbstverweis auf BGB selbst
      bezeichnung: '§ 1',
      verweistextZeichenbereich: [0, 3],
      elementstand: { textlaenge: 5 },
    });
    const bestand = eintrag({
      verweisinhalt: { verweistext: '§ 1', verweisziele: [selbstverweis] },
    });

    const berechneNeuenElementstand = vi.fn(() => 'unveraendert' as const);
    berechneZielelementstaende(BGB, bestand, BGB, berechneNeuenElementstand);

    expect(berechneNeuenElementstand).toHaveBeenCalledWith(selbstverweis);
  });

  it("berechneNeuenElementstand liefert ein Ergebnis-Objekt -> elementstand UND praefix werden gesetzt ('verknüpfen')", () => {
    const ziel1: Verweisziel = verweisziel({
      typ: 'zielnorm',
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      bezeichnung: '§ 1',
      verweistextZeichenbereich: [0, 3],
      elementstand: { textlaenge: 5 },
    });
    const bestand = eintrag({
      verweisinhalt: { verweistext: 'GG', verweisziele: [ziel1] },
    });

    const neuerElementstand = { textlaenge: 42, titel: 'GG' };
    const neueBezeichnung = 'Art. 1';
    const ergebnis = berechneZielelementstaende(BGB, bestand, GG, () => ({
      elementstand: neuerElementstand,
      bezeichnung: neueBezeichnung,
    }));

    expect(ergebnis).toEqual({
      ...bestand,
      verweisinhalt: {
        verweistext: 'GG',
        verweisziele: [{ ...ziel1, elementstand: neuerElementstand, bezeichnung: neueBezeichnung }],
      },
    });
  });

  it("berechneNeuenElementstand liefert undefined -> Elementstand wird entfernt und der bekannte Präfix bleibt erhalten ('Verknüpfung entfernen')", () => {
    const ziel1: Verweisziel = verweisziel({
      typ: 'zielnorm',
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      bezeichnung: '§ 1',
      verweistextZeichenbereich: [0, 3],
      elementstand: { textlaenge: 5 },
    });
    const bestand = eintrag({
      verweisinhalt: { verweistext: 'GG', verweisziele: [ziel1] },
    });

    const ergebnis = berechneZielelementstaende(BGB, bestand, GG, () => undefined);

    expect(ergebnis).toEqual({
      ...bestand,
      verweisinhalt: {
        verweistext: 'GG',
        verweisziele: [{ ...ziel1, typ: 'zielnormOhneElementstand', elementstand: undefined }],
      },
    });
  });
});

it('löscht bei fehlgeschlagenem Sperrerwerb nichts', async () => {
  const fehler = new Error('wartefrist');
  mitDateiSperre.mockRejectedValueOnce(fehler);
  await expect(loescheMarkierungsDatei(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toBe(
    fehler,
  );
  expect(appDatenLoeschen).not.toHaveBeenCalled();
});

it('aktualisiert bei gleichen Kurztiteln nur das vollständig gewählte Ziel einschließlich Casevarianten', async () => {
  const eigen = { kurztitel: 'ABC', normgeber: 'de-bund' };
  const bund: Verweisziel = verweisziel({
    typ: 'zielnorm',
    bezeichnung: '§ 1',
    verweistextZeichenbereich: [0, 1],
    elementstand: { textlaenge: 5 },
  });
  const bw: Verweisziel = { ...bund, gesetz: { kurztitel: 'abc', normgeber: 'de-bw' } };
  const unbekannt: Verweisziel = { ...bund, gesetz: { kurztitel: 'ABC', normgeber: 'unbekannt' } };
  const bestand = eintrag({
    verweisinhalt: { verweistext: '1; 1; 1', verweisziele: [bund, bw, unbekannt] },
  });
  const berechnen = vi.fn(() => undefined);
  const ergebnis = berechneZielelementstaende(
    eigen,
    bestand,
    { kurztitel: 'ABC', normgeber: 'de-bw' },
    berechnen,
  );
  expect(berechnen).toHaveBeenCalledExactlyOnceWith(bw);
  expect(ergebnis).toEqual(
    markierungsEintrag({
      ...bestand,
      verweisinhalt: {
        verweistext: '1; 1; 1',
        verweisziele: [
          bund,
          { ...bw, typ: 'zielnormOhneElementstand', elementstand: undefined },
          unbekannt,
        ],
      },
    }),
  );
});

it('stellt eine entfernte Verknüpfung auch mit angebotener aktueller Norm nicht wieder her', async () => {
  const z: Verweisziel = verweisziel({
    typ: 'zielnormOhneElementstand',
    bezeichnung: '1',
    gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
    verweistextZeichenbereich: [0, 1],
  });
  const bestand = eintrag({ verweisinhalt: { verweistext: 'GG', verweisziele: [z] } });
  const berechnen = vi.fn(() => ({ elementstand: { textlaenge: 5 }, bezeichnung: '§ 1' }));
  expect(
    berechneZielelementstaende(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      bestand,
      gesetzesreferenz({ kurztitel: 'GG' }),
      berechnen,
    ),
  ).toBe(bestand);
  expect(berechnen).not.toHaveBeenCalled();
});

it('aktualisiert bei bewusster Verknüpfung auch den Elementstand einer Überschrift', () => {
  const u = {
    id: 'u',
    xmlId: 'u',
    bezeichnung: 'Teil',
    titel: 'Neu',
    gliederungskennzahl: '010',
    ebene: 1,
  };
  const gesetz = gesetzDarstellung({ elemente: [{ typ: 'ueberschrift', data: u }] });
  const e: MarkierungsEintrag = markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: ueberschriftAusgangsstelle('010'),

    kommentarText: 'Notiz',
    bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Alt', textlaenge: 99 } },
  });
  expect(berechneElementstand(e, gesetz).bezug.elementstand).toEqual({
    titel: 'Neu',
    textlaenge: 7,
  });
});
