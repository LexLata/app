import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungSpeicher.dateiImport.test.ts
//
// Unit-Tests für zusammenfuehrenMarkierungen/leseMarkierungenRohtext/
// ersetzeMarkierungenDatei aus markierungSpeicher.dateiImport.ts. Analog zu
// markierungSpeicher.undo.test.ts: eigentlich I/O-Orchestrierung, hier aber
// bewusst getestet, da die Dopplungs-Erkennung (Textbezug vs. allgemeiner
// Verweis/Kommentar) und die behalteBestehendeBeiKonflikt-Verzweigung die
// fachlich komplexeste, fehleranfälligste Logik der Datei sind.
//
// '@/lib/persistenz/kern/kern.index' und
// '@/lib/markierungen/eintrag/eintrag.index'/'.hinzufuegen' werden
// komplett gemockt (bereichUeberlappt/istIdentischeAllgemeineMarkierung
// bewusst NICHT als echte Implementierung mitgetestet, siehe deren eigene
// Tests in markierungSpeicher.hinzufuegen.test.ts – hier zählt nur,
// WANN/WIE sie aufgerufen werden). meldeMarkierungenBulkGeaendert aus
// markierungSpeicher.ereignisse.ts (in stosseMarkierungskonfliktPruefungAn)
// wird ebenfalls gemockt.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ersetzeMarkierungenDatei,
  leseMarkierungenRohtext,
  zusammenfuehrenMarkierungen,
} from './markierungSpeicher.dateiImport';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const appDatenLesen = vi.fn<(pfad: string) => Promise<string>>();
const nutzerdatenSchreiben =
  vi.fn<(pfad: string, inhalt: string, token?: string) => Promise<void>>();
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
  appDatenLesen: (...args: [string]) => appDatenLesen(...args),
  appDatenLesenOderNull: async (...args: [string]) => {
    try {
      return await appDatenLesen(...args);
    } catch {
      return null;
    }
  },
  nutzerdatenSchreiben: (...args: [string, string, string?]) => nutzerdatenSchreiben(...args),
}));

const ermittleMarkierungsDateipfad = vi.fn<(gesetz: Gesetzesreferenz) => Promise<string>>();
const ladeEintraege =
  vi.fn<(gesetz: Gesetzesreferenz, token?: string) => Promise<MarkierungsEintrag[]>>();
const schreibeEintraege =
  vi.fn<
    (gesetz: Gesetzesreferenz, eintraege: MarkierungsEintrag[], token?: string) => Promise<void>
  >();
const sicherstelleOrdner = vi.fn<() => Promise<void>>();
const bereichUeberlappt = vi.fn<(a: unknown, b: unknown) => boolean>();
const istIdentischeAllgemeineMarkierung = vi.fn<(a: unknown, b: unknown) => boolean>();
const meldeMarkierungenBulkGeaendert = vi.fn<(gesetz: Gesetzesreferenz) => void>();
vi.mock('@/lib/markierungen/eintrag/eintrag.index', async (original) => ({
  ...(await original<typeof import('@/lib/markierungen/eintrag/eintrag.index')>()),
  aendereEintraege: async (
    gesetz: Gesetzesreferenz,
    bearbeiten: (
      eintraege: MarkierungsEintrag[],
    ) => import('@/lib/markierungen/eintrag/eintrag.index').EintragsAenderung<void>,
  ) =>
    mitDateiSperre(await ermittleMarkierungsDateipfad(gesetz), async (token) => {
      const aenderung = bearbeiten(await ladeEintraege(gesetz, token));
      if (aenderung.art === 'geaendert') {
        await sicherstelleOrdner();
        await schreibeEintraege(gesetz, [...aenderung.eintraege], token);
        meldeMarkierungenBulkGeaendert(gesetz);
      }
    }),
  leseMarkierungsXML: async (gesetz: Gesetzesreferenz) => {
    try {
      return await appDatenLesen(await ermittleMarkierungsDateipfad(gesetz));
    } catch {
      return null;
    }
  },
  ersetzeMarkierungsXML: async (gesetz: Gesetzesreferenz, inhalt: string) =>
    mitDateiSperre(await ermittleMarkierungsDateipfad(gesetz), async (token) => {
      await sicherstelleOrdner();
      await nutzerdatenSchreiben(await ermittleMarkierungsDateipfad(gesetz), inhalt, token);
      meldeMarkierungenBulkGeaendert(gesetz);
    }),
  ermittleMarkierungsDateipfad: (...args: [Gesetzesreferenz]) =>
    ermittleMarkierungsDateipfad(...args),
  ladeEintraege: (...args: [Gesetzesreferenz, string?]) => ladeEintraege(...args),
  schreibeEintraege: (...args: [Gesetzesreferenz, MarkierungsEintrag[], string?]) =>
    schreibeEintraege(...args),
  sicherstelleOrdner: () => sicherstelleOrdner(),
  bereichUeberlappt: (...args: [unknown, unknown]) => bereichUeberlappt(...args),
  istIdentischeAllgemeineMarkierung: (...args: [unknown, unknown]) =>
    istIdentischeAllgemeineMarkierung(...args),
  meldeMarkierungenBulkGeaendert: (...args: [Gesetzesreferenz]) =>
    meldeMarkierungenBulkGeaendert(...args),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  mitDateiSperre.mockImplementation(async (_pfad, aktion) => aktion(testToken));
  ermittleMarkierungsDateipfad.mockImplementation(async (k) => `${k.kurztitel}.xml`);
  ladeEintraege.mockResolvedValue([]);
  schreibeEintraege.mockResolvedValue(undefined);
  sicherstelleOrdner.mockResolvedValue(undefined);
  bereichUeberlappt.mockReturnValue(false);
  istIdentischeAllgemeineMarkierung.mockReturnValue(false);
  appDatenLesen.mockResolvedValue('<xml/>');
  nutzerdatenSchreiben.mockResolvedValue(undefined);
});

describe('zusammenfuehrenMarkierungen', () => {
  it('kein Bestand, keine Importe -> nichts wird geschrieben, keine Markierungskonflikt-Prüfung', async () => {
    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), []);
    expect(schreibeEintraege).not.toHaveBeenCalled();
    expect(meldeMarkierungenBulkGeaendert).not.toHaveBeenCalled();
  });

  it('Eintrag mit Textbezug OHNE Dopplung -> wird über bereichUeberlappt geprüft und angehängt', async () => {
    const bestehend = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    const neu = eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') });
    ladeEintraege.mockResolvedValue([bestehend]);
    bereichUeberlappt.mockReturnValue(false);

    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [neu]);

    expect(bereichUeberlappt).toHaveBeenCalledWith(bestehend, neu);
    expect(istIdentischeAllgemeineMarkierung).not.toHaveBeenCalled();
    expect(schreibeEintraege).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [bestehend, neu],
      testToken,
    );
    expect(sicherstelleOrdner).toHaveBeenCalled();
    expect(meldeMarkierungenBulkGeaendert).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
    );
  });

  it('Dopplung (+) bei Textbezug UND behalteBestehendeBeiKonflikt=true (Default) -> bestehender Eintrag bleibt, importierter wird übersprungen, NICHTS wird geschrieben', async () => {
    const bestehend = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    const neu = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1'), typ: 'hervorhebung' }); // anderer Typ, gleiche Stelle
    ladeEintraege.mockResolvedValue([bestehend]);
    bereichUeberlappt.mockReturnValue(true);

    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [neu]);

    expect(schreibeEintraege).not.toHaveBeenCalled();
    expect(meldeMarkierungenBulkGeaendert).not.toHaveBeenCalled();
  });

  it('Dopplung (+) bei Textbezug UND behalteBestehendeBeiKonflikt=false -> bestehender Eintrag wird durch importierten ERSETZT', async () => {
    const bestehend = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    const neu = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1'), typ: 'hervorhebung' });
    ladeEintraege.mockResolvedValue([bestehend]);
    bereichUeberlappt.mockReturnValue(true);

    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [neu], false);

    expect(schreibeEintraege).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [neu],
      testToken,
    );
  });

  it("Eintrag OHNE Textbezug vom Typ 'verweismarkierung' -> wird über istIdentischeAllgemeineMarkierung geprüft, NICHT über bereichUeberlappt", async () => {
    const bestehend = eintrag({
      typ: 'verweismarkierung',
      bezug: { typ: 'pauschal', elementstand: { textlaenge: 0 } },

      verweisinhalt: { verweistext: 'GG', verweisziele: [] },
    });
    const neu = eintrag({
      typ: 'verweismarkierung',
      bezug: { typ: 'pauschal', elementstand: { textlaenge: 0 } },

      verweisinhalt: { verweistext: 'GG', verweisziele: [] },
    });
    ladeEintraege.mockResolvedValue([bestehend]);
    istIdentischeAllgemeineMarkierung.mockReturnValue(true);

    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [neu]);

    expect(istIdentischeAllgemeineMarkierung).toHaveBeenCalledWith(bestehend, neu);
    expect(bereichUeberlappt).not.toHaveBeenCalled();
    expect(schreibeEintraege).not.toHaveBeenCalled(); // Dopplung, Default behalteBestehendeBeiKonflikt
  });

  it("Eintrag OHNE Textbezug vom Typ 'kommentar' -> wird ebenfalls über istIdentischeAllgemeineMarkierung geprüft", async () => {
    const bestehend = eintrag({
      typ: 'kommentar',
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },

      kommentarText: 'Alt',
    });
    const neu = eintrag({
      typ: 'kommentar',
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },

      kommentarText: 'Anmerkung',
    });
    ladeEintraege.mockResolvedValue([bestehend]);
    istIdentischeAllgemeineMarkierung.mockReturnValue(false);

    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [neu]);

    expect(istIdentischeAllgemeineMarkierung).toHaveBeenCalledWith(bestehend, neu);
    expect(bereichUeberlappt).not.toHaveBeenCalled();
    expect(schreibeEintraege).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [bestehend, neu],
      testToken,
    );
  });

  it('mehrere importierte Einträge: bereits im Lauf hinzugefügte importierte Einträge zählen für die Dopplungsprüfung NACHFOLGENDER importierter Einträge mit (ergebnis wächst inkrementell)', async () => {
    const ersterImport = eintrag({ ausgangsstelle: normAusgangsstelle('§ A') });
    const zweiterImport = eintrag({ ausgangsstelle: normAusgangsstelle('§ B') });
    ladeEintraege.mockResolvedValue([]);
    // Der zweite Import überlappt (laut Mock) den bereits hinzugefügten ersten.
    bereichUeberlappt.mockImplementation((a) => a === ersterImport);

    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [
      ersterImport,
      zweiterImport,
    ]);

    // Default behalteBestehendeBeiKonflikt: zweiterImport wird als Dopplung
    // übersprungen, nur ersterImport landet im Ergebnis.
    expect(schreibeEintraege).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [ersterImport],
      testToken,
    );
  });

  it('nur veränderte Datei wird geschrieben: keine der importierten Einträge führt zu einer Änderung -> gar kein schreibeEintraege-Aufruf', async () => {
    const bestehend = eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') });
    ladeEintraege.mockResolvedValue([bestehend]);
    bereichUeberlappt.mockReturnValue(true);

    await zusammenfuehrenMarkierungen(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') })],
      true,
    );

    expect(schreibeEintraege).not.toHaveBeenCalled();
  });
});

describe('leseMarkierungenRohtext', () => {
  it('liest den Rohtext über ermittleMarkierungsDateipfad(kurztitel)', async () => {
    appDatenLesen.mockResolvedValue('<inhalt/>');
    const ergebnis = await leseMarkierungenRohtext(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(ermittleMarkierungsDateipfad).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
    );
    expect(appDatenLesen).toHaveBeenCalledWith('BGB.xml');
    expect(ergebnis).toBe('<inhalt/>');
  });

  it('gibt null zurück, wenn keine Datei existiert (statt zu werfen)', async () => {
    appDatenLesen.mockRejectedValue(new Error('nicht gefunden'));
    const ergebnis = await leseMarkierungenRohtext(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(ergebnis).toBeNull();
  });
});

describe('ersetzeMarkierungenDatei', () => {
  it('schreibt importInhalt 1:1 in die Datei, stellt den Ordner sicher, stößt die Markierungskonflikt-Prüfung an', async () => {
    await ersetzeMarkierungenDatei(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      '<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
    );

    expect(sicherstelleOrdner).toHaveBeenCalled();
    expect(ermittleMarkierungsDateipfad).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
    );
    expect(nutzerdatenSchreiben).toHaveBeenCalledWith(
      'BGB.xml',
      '<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
      testToken,
    );
    expect(meldeMarkierungenBulkGeaendert).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
    );
  });
});

describe('Dateisperre', () => {
  it('erwirbt vor dem Lesen genau eine Sperre und reicht den Token weiter', async () => {
    ladeEintraege.mockImplementation(async (_kurztitel, token) => {
      expect(mitDateiSperre).toHaveBeenCalledTimes(1);
      expect(token).toBe(testToken);
      return [];
    });
    await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag()]);
    expect(mitDateiSperre).toHaveBeenCalledWith('BGB.xml', expect.any(Function));
  });

  it('führt bei fehlgeschlagenem Erwerb keine Dateioperation aus', async () => {
    const fehler = new Error('wartefrist');
    mitDateiSperre.mockRejectedValueOnce(fehler);
    await expect(
      zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag()]),
    ).rejects.toBe(fehler);
    expect(ladeEintraege).not.toHaveBeenCalled();
    expect(nutzerdatenSchreiben).not.toHaveBeenCalled();
  });
});

it('Ersetzen beginnt erst nach erfolgreichem Sperrerwerb', async () => {
  const fehler = new Error('wartefrist');
  mitDateiSperre.mockRejectedValueOnce(fehler);
  await expect(
    ersetzeMarkierungenDatei(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      '<markierungen><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt/></markierungen>',
    ),
  ).rejects.toBe(fehler);
  expect(sicherstelleOrdner).not.toHaveBeenCalled();
  expect(nutzerdatenSchreiben).not.toHaveBeenCalled();
  expect(meldeMarkierungenBulkGeaendert).not.toHaveBeenCalled();
});

it('hält die Importsperre bis Schreiben und synchroner Änderungsmeldung abgeschlossen sind', async () => {
  let gesperrt = false;
  mitDateiSperre.mockImplementation(async (_pfad, aktion) => {
    gesperrt = true;
    try {
      return await aktion(testToken);
    } finally {
      gesperrt = false;
    }
  });
  schreibeEintraege.mockImplementation(async () => {
    await Promise.resolve();
    expect(gesperrt).toBe(true);
  });
  meldeMarkierungenBulkGeaendert.mockImplementation(() => {
    expect(gesperrt).toBe(true);
  });
  await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag()]);
  expect(gesperrt).toBe(false);
  expect(mitDateiSperre).toHaveBeenCalledTimes(1);
});

it('führt für eine vorab erkennbar leere Importliste keine Quellaktion aus', async () => {
  await zusammenfuehrenMarkierungen(gesetzesreferenz({ kurztitel: 'BGB' }), []);
  expect(mitDateiSperre).not.toHaveBeenCalled();
  expect(ladeEintraege).not.toHaveBeenCalled();
  expect(nutzerdatenSchreiben).not.toHaveBeenCalled();
});
