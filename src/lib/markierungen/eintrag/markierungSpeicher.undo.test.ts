// markierungSpeicher.undo.test.ts
//
// Unit-Tests für fuehreRueckgaengigAus/fuehreWiederholenAus aus
// markierungSpeicher.undo.ts. Beide sind eigentlich I/O-Orchestrierung
// (rufen letztlich ladeEintraege()/schreibeEintraege() auf) – nach der
// sonst geltenden Konvention (siehe Kopfkommentar in
// markierungSpeicher.hinzufuegen.test.ts) würde das eigentlich NICHT
// getestet. Hier bewusste Ausnahme (Absprache): die eigentliche
// Komplexität liegt nicht im I/O selbst, sondern in der 5-fachen
// Verzweigung nach `aktion.art` und – am fehleranfälligsten – der
// ASYMMETRISCHEN vorher/nachher-Zuordnung zwischen Rückgängig und
// Wiederholen (Such-Kriterium vs. zu schreibender Wert). Genau diese
// Zuordnung wird hier getestet, nicht das Verhalten der gemockten
// Persistenz-Funktionen selbst.
//
// '@/lib/markierungen/eintrag/markierungSpeicher' wird komplett gemockt
// (ladeEintraege, schreibeEintraege, entferneMarkierung,
// sowie die Quellkoordination), ebenso
// meldeMarkierungGeaendert aus markierungSpeicher.ereignisse.ts
// (in wiederherstellenEintrag aufgerufen). identitaetsSchluessel() aus
// markierungskonfliktPruefung.ts bleibt UNGEMOCKT (reine, pure Funktion).
import { markierungsBezug } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import type { mitDateiSperre } from '@/lib/persistenz/kern/kern.index';
import { dateiBasis, merkePruefpflichtigeAenderungVor } from '@/lib/persistenz/kern/kern.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MarkierungEntfernenAktion,
  MarkierungErsetzenAktion,
  MarkierungHinzufuegenAktion,
  MarkierungKommentarBearbeitenAktion,
  MarkierungVerweisBearbeitenAktion,
} from './markierungSpeicher.undo';
import { fuehreRueckgaengigAus, fuehreWiederholenAus } from './markierungSpeicher.undo';
import type { MarkierungsEintrag } from './markierungSpeicher';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: vi.fn(async () => 'markierungs-vorgang'),
  schliessePruefpflichtigeQuelleAb: vi.fn(async () => true),
  mitGesetzDateiSperre: async (
    ref: Gesetzesreferenz,
    _ordner: string,
    _suffix: string,
    aktion: Parameters<typeof mitDateiSperre>[1],
  ) => sperre(`markierungen/${dateiBasis(ref)}-markierungen.xml`, aktion),
  appDatenLesen: async (pfad: string) => appDatenSpeicher.get(pfad) ?? null,
  sichereBeiUngueltigemInhalt: async (_pfad: string, inhalt: string | null) =>
    inhalt === null ? { status: 'fehlt' } : { status: 'gueltig', inhalt },
  nutzerdatenSchreiben: async (pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
  },
}));

const appDatenSpeicher = new Map<string, string>();

const erwerben = vi.fn<(pfad: string) => Promise<string>>();
const sperre: typeof mitDateiSperre = async (pfad, aktion) => aktion(await erwerben(pfad));

const ladeEintraege =
  vi.fn<(gesetz: Gesetzesreferenz, token?: string) => Promise<MarkierungsEintrag[]>>();
const schreibeEintraege =
  vi.fn<
    (gesetz: Gesetzesreferenz, eintraege: MarkierungsEintrag[], token?: string) => Promise<void>
  >();
const entferneMarkierung =
  vi.fn<(gesetz: Gesetzesreferenz, ziel: MarkierungsEintrag) => Promise<boolean>>();

vi.mock('@/lib/markierungen/eintrag/markierungSpeicher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./markierungSpeicher')>()),
  ermittleMarkierungsDateipfad: async (gesetz: Gesetzesreferenz) =>
    `markierungen/${dateiBasis(gesetz)}-markierungen.xml`,
}));
vi.mock('@/lib/markierungen/eintrag/markierungSpeicher.lesen', () => ({
  ladeEintraegeUnterSperre: (gesetz: Gesetzesreferenz, token?: string) =>
    ladeEintraege(gesetz, token),
}));
vi.mock('@/lib/markierungen/eintrag/markierungSpeicher.aendern', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./markierungSpeicher.aendern')>()),
  schreibeEintraege: (gesetz: Gesetzesreferenz, eintraege: MarkierungsEintrag[], token?: string) =>
    schreibeEintraege(gesetz, eintraege, token),
}));
vi.mock('@/lib/markierungen/eintrag/markierungSpeicher.aktionen', () => ({
  entferneMarkierung: (...args: [Gesetzesreferenz, MarkierungsEintrag]) =>
    entferneMarkierung(...args),
}));

const meldeMarkierungGeaendert = vi.fn<(...args: unknown[]) => void>();
vi.mock('@/lib/markierungen/eintrag/markierungSpeicher.ereignisse', () => ({
  meldeMarkierungGeaendert: (...args: unknown[]) => meldeMarkierungGeaendert(...args),
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
  appDatenSpeicher.clear();
  erwerben.mockReset().mockResolvedValue('test-token');
  ladeEintraege.mockResolvedValue([]);
  schreibeEintraege.mockResolvedValue(undefined);
  entferneMarkierung.mockResolvedValue(true);
});

describe('fuehreRueckgaengigAus', () => {
  it("art 'hinzufuegen' -> entferneMarkierung(kurztitel, eintrag), Rückgabewert durchgereicht", async () => {
    const aktion: MarkierungHinzufuegenAktion = {
      art: 'hinzufuegen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintrag: eintrag(),
    };
    entferneMarkierung.mockResolvedValue(false);
    const ergebnis = await fuehreRueckgaengigAus(aktion);
    expect(entferneMarkierung).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      aktion.eintrag,
    );
    expect(ergebnis).toBe(false);
  });

  it("art 'entfernen' -> stellt den Eintrag wieder her (ladeEintraege + schreibeEintraege mit angehängtem Eintrag) und prüft danach den Markierungskonflikt dieses Eintrags", async () => {
    const bestand = [eintrag({ ausgangsstelle: normAusgangsstelle('§ 2') })];
    ladeEintraege.mockResolvedValue(bestand);
    const aktion: MarkierungEntfernenAktion = {
      art: 'entfernen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintrag: eintrag({ ausgangsstelle: normAusgangsstelle('§ 1') }),
    };
    const ergebnis = await fuehreRueckgaengigAus(aktion);
    expect(ladeEintraege).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'test-token',
    );
    expect(schreibeEintraege).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [...bestand, aktion.eintrag],
      'test-token',
    );
    expect(meldeMarkierungGeaendert).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|unterstreichung|z:0-5|[null,"(1)",0,null,1,[],1]',
      'markierungs-vorgang',
      undefined,
    );
    expect(ergebnis).toBe(true);
  });

  it("art 'ersetzen' MIT neu: entfernt neu + jedes rest-Stück, stellt jeden entfernt-Eintrag wieder her", async () => {
    const neu = eintrag({ ausgangsstelle: normAusgangsstelle('§ neu') });
    const restA = eintrag({ ausgangsstelle: normAusgangsstelle('§ restA') });
    const restB = eintrag({ ausgangsstelle: normAusgangsstelle('§ restB') });
    const altA = eintrag({ ausgangsstelle: normAusgangsstelle('§ altA') });
    const altB = eintrag({ ausgangsstelle: normAusgangsstelle('§ altB') });
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      neu,
      rest: [restA, restB],
      entfernt: [altA, altB],
    };
    const ergebnis = await fuehreRueckgaengigAus(aktion);
    expect(entferneMarkierung).toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }), neu);
    expect(entferneMarkierung).toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }), restA);
    expect(entferneMarkierung).toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }), restB);
    expect(entferneMarkierung).toHaveBeenCalledTimes(3);
    // Wiederherstellung = ladeEintraege+schreibeEintraege je Alt-Eintrag.
    expect(schreibeEintraege).toHaveBeenCalledTimes(2);
    expect(ergebnis).toBe(true);
  });

  it("art 'ersetzen' OHNE neu (reiner Toggle-Aus): kein entferneMarkierung(neu)-Aufruf, rest/entfernt trotzdem verarbeitet", async () => {
    const restA = eintrag({ ausgangsstelle: normAusgangsstelle('§ restA') });
    const altA = eintrag({ ausgangsstelle: normAusgangsstelle('§ altA') });
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      rest: [restA],
      entfernt: [altA],
    };
    await fuehreRueckgaengigAus(aktion);
    expect(entferneMarkierung).toHaveBeenCalledTimes(1);
    expect(entferneMarkierung).toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }), restA);
    expect(schreibeEintraege).toHaveBeenCalledTimes(1);
  });

  it("art 'ersetzen': ok wird false, wenn IRGENDEIN Teilschritt scheitert, auch wenn spätere Schritte wieder true liefern (kein Verlorengehen des Fehlerzustands)", async () => {
    entferneMarkierung.mockResolvedValueOnce(false); // neu
    entferneMarkierung.mockResolvedValueOnce(true); // rest[0]
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      neu: eintrag({ ausgangsstelle: normAusgangsstelle('§ neu') }),
      rest: [eintrag({ ausgangsstelle: normAusgangsstelle('§ rest') })],
      entfernt: [],
    };
    const ergebnis = await fuehreRueckgaengigAus(aktion);
    expect(ergebnis).toBe(false);
  });

  it('stellt beim Kommentar den vorherigen Inhalt ohne neue Zeitstempel wieder her', async () => {
    const aktion: MarkierungKommentarBearbeitenAktion = {
      art: 'kommentarBearbeiten',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      ziel: { ausgangsstelle: normAusgangsstelle('§ 1') },
      vorher: {
        elementstand: testElementstand(),
        kommentarText: 'alt',
        bezugstext: 'Text',
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
      nachher: {
        elementstand: testElementstand(),
        kommentarText: 'neu',
        bezugstext: 'Text',
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
    };
    const aktuell = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: aktion.ziel.ausgangsstelle,
      ...aktion.nachher,
    });
    ladeEintraege.mockResolvedValue([aktuell]);
    await fuehreRueckgaengigAus(aktion);
    expect(schreibeEintraege).toHaveBeenCalledWith(
      aktion.gesetz,
      [
        {
          ...markierungsEintrag({
            typ: 'kommentar',
            ausgangsstelle: aktion.ziel.ausgangsstelle,
            ...aktion.vorher,
          }),
          erstellt: aktion.vorher.erstellt,
          geaendert: aktion.vorher.geaendert,
        },
      ],
      'test-token',
    );
  });

  it('stellt beim Verweis den vorherigen Inhalt ohne neue Zeitstempel wieder her', async () => {
    const aktion: MarkierungVerweisBearbeitenAktion = {
      art: 'verweisBearbeiten',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      ziel: { ausgangsstelle: normAusgangsstelle('§ 1') },
      vorher: {
        elementstand: testElementstand(),
        verweisinhalt: { verweistext: 'alt', verweisziele: [] },
        bezugstext: 'Text',
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
      nachher: {
        verweisinhalt: { verweistext: 'neu', verweisziele: [] },
        bezugstext: 'Text',
        elementstand: { textlaenge: 10 },
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
    };
    const aktuell = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: aktion.ziel.ausgangsstelle,
      ...aktion.nachher,
    });
    ladeEintraege.mockResolvedValue([aktuell]);
    await fuehreRueckgaengigAus(aktion);
    expect(schreibeEintraege).toHaveBeenCalledWith(
      aktion.gesetz,
      [
        {
          ...markierungsEintrag({
            typ: 'verweismarkierung',
            ausgangsstelle: aktion.ziel.ausgangsstelle,
            ...aktion.vorher,
          }),
          erstellt: aktion.vorher.erstellt,
          geaendert: aktion.vorher.geaendert,
        },
      ],
      'test-token',
    );
  });
});

describe('fuehreWiederholenAus', () => {
  it("art 'hinzufuegen' -> stellt den Eintrag wieder her (Spiegelbild zu fuehreRueckgaengigAus bei 'entfernen')", async () => {
    const aktion: MarkierungHinzufuegenAktion = {
      art: 'hinzufuegen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintrag: eintrag(),
    };
    await fuehreWiederholenAus(aktion);
    expect(schreibeEintraege).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      [aktion.eintrag],
      'test-token',
    );
    expect(entferneMarkierung).not.toHaveBeenCalled();
  });

  it("art 'entfernen' -> entferneMarkierung(kurztitel, eintrag) (Spiegelbild zu fuehreRueckgaengigAus bei 'hinzufuegen')", async () => {
    const aktion: MarkierungEntfernenAktion = {
      art: 'entfernen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      eintrag: eintrag(),
    };
    await fuehreWiederholenAus(aktion);
    expect(entferneMarkierung).toHaveBeenCalledWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      aktion.eintrag,
    );
    expect(schreibeEintraege).not.toHaveBeenCalled();
  });

  it("art 'ersetzen' MIT neu: entfernt jeden entfernt-Eintrag, stellt jedes rest-Stück UND neu wieder her (spiegelverkehrte Reihenfolge zu fuehreRueckgaengigAus)", async () => {
    const neu = eintrag({ ausgangsstelle: normAusgangsstelle('§ neu') });
    const restA = eintrag({ ausgangsstelle: normAusgangsstelle('§ restA') });
    const altA = eintrag({ ausgangsstelle: normAusgangsstelle('§ altA') });
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      neu,
      rest: [restA],
      entfernt: [altA],
    };
    const ergebnis = await fuehreWiederholenAus(aktion);
    expect(entferneMarkierung).toHaveBeenCalledWith(gesetzesreferenz({ kurztitel: 'BGB' }), altA);
    expect(entferneMarkierung).toHaveBeenCalledTimes(1);
    // Wiederherstellung: rest (1x) + neu (1x) = 2 schreibeEintraege-Aufrufe.
    expect(schreibeEintraege).toHaveBeenCalledTimes(2);
    expect(ergebnis).toBe(true);
  });

  it("art 'ersetzen' OHNE neu: kein zusätzlicher wiederherstellenEintrag-Aufruf für neu", async () => {
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      rest: [eintrag({ ausgangsstelle: normAusgangsstelle('§ restA') })],
      entfernt: [],
    };
    await fuehreWiederholenAus(aktion);
    expect(schreibeEintraege).toHaveBeenCalledTimes(1);
    expect(entferneMarkierung).not.toHaveBeenCalled();
  });

  it("art 'ersetzen': ok wird false, wenn IRGENDEIN Teilschritt scheitert, auch wenn der neu-Schritt danach wieder true liefert", async () => {
    entferneMarkierung.mockResolvedValueOnce(false); // entfernt[0]
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      neu: eintrag({ ausgangsstelle: normAusgangsstelle('§ neu') }),
      rest: [],
      entfernt: [eintrag({ ausgangsstelle: normAusgangsstelle('§ alt') })],
    };
    const ergebnis = await fuehreWiederholenAus(aktion);
    expect(ergebnis).toBe(false);
  });

  it('stellt beim Wiederholen den nachherigen Kommentarstand wieder her', async () => {
    const aktion: MarkierungKommentarBearbeitenAktion = {
      art: 'kommentarBearbeiten',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      ziel: { ausgangsstelle: normAusgangsstelle('§ 1') },
      vorher: {
        elementstand: testElementstand(),
        kommentarText: 'alt',
        bezugstext: 'Text',
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
      nachher: {
        elementstand: testElementstand(),
        kommentarText: 'neu',
        bezugstext: 'Text',
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
    };
    const aktuell = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: aktion.ziel.ausgangsstelle,
      ...aktion.vorher,
    });
    ladeEintraege.mockResolvedValue([aktuell]);
    await fuehreWiederholenAus(aktion);
    expect(schreibeEintraege).toHaveBeenCalledWith(
      aktion.gesetz,
      [
        {
          ...markierungsEintrag({
            typ: 'kommentar',
            ausgangsstelle: aktion.ziel.ausgangsstelle,
            ...aktion.nachher,
          }),
          erstellt: aktion.nachher.erstellt,
          geaendert: aktion.nachher.geaendert,
        },
      ],
      'test-token',
    );
  });

  it('stellt beim Wiederholen den nachherigen Verweisstand wieder her', async () => {
    const aktion: MarkierungVerweisBearbeitenAktion = {
      art: 'verweisBearbeiten',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      ziel: { ausgangsstelle: normAusgangsstelle('§ 1') },
      vorher: {
        elementstand: testElementstand(),
        verweisinhalt: { verweistext: 'alt', verweisziele: [] },
        bezugstext: 'Text',
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
      nachher: {
        verweisinhalt: { verweistext: 'neu', verweisziele: [] },
        bezugstext: 'Text',
        elementstand: { textlaenge: 10 },
        textstelle: {
          pfad: normtextPfad({ absatz: '(1)' }),
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
        },
      },
    };
    const aktuell = markierungsEintrag({
      typ: 'verweismarkierung',
      ausgangsstelle: aktion.ziel.ausgangsstelle,
      ...aktion.vorher,
    });
    ladeEintraege.mockResolvedValue([aktuell]);
    await fuehreWiederholenAus(aktion);
    expect(schreibeEintraege).toHaveBeenCalledWith(
      aktion.gesetz,
      [
        {
          ...markierungsEintrag({
            typ: 'verweismarkierung',
            ausgangsstelle: aktion.ziel.ausgangsstelle,
            ...aktion.nachher,
          }),
          erstellt: aktion.nachher.erstellt,
          geaendert: aktion.nachher.geaendert,
        },
      ],
      'test-token',
    );
  });
});

describe('Mehrteilige Historienaktionen nach Teilfehler', () => {
  it.each(
    (['rueckgaengig', 'wiederholen'] as const).flatMap((richtung) =>
      [1, 2, 3, 4, 5].map((fehlschritt) => ({ richtung, fehlschritt })),
    ),
  )(
    '$richtung setzt nach wiederholtem Fristfehler in Schritt $fehlschritt nur offene Schritte fort',
    async ({ richtung, fehlschritt }) => {
      const neu = eintrag({ ausgangsstelle: normAusgangsstelle('§ neu') });
      const rest = [
        eintrag({ ausgangsstelle: normAusgangsstelle('§ restA') }),
        eintrag({ ausgangsstelle: normAusgangsstelle('§ restB') }),
      ];
      const entfernt = [
        eintrag({ ausgangsstelle: normAusgangsstelle('§ altA') }),
        eintrag({ ausgangsstelle: normAusgangsstelle('§ altB') }),
      ];
      const fremd = eintrag({ ausgangsstelle: normAusgangsstelle('anderes § Fenster') });
      const aktion: MarkierungErsetzenAktion = {
        art: 'ersetzen',
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        neu,
        rest,
        entfernt,
      };
      let bestand = richtung === 'rueckgaengig' ? [neu, ...rest] : [...entfernt];
      ladeEintraege.mockImplementation(async () => bestand);
      schreibeEintraege.mockImplementation(async (_gesetz, eintraege) => {
        bestand = eintraege;
      });
      entferneMarkierung.mockImplementation(async (_gesetz, ziel) =>
        sperre('markierungen/BGB_de-bund-markierungen.xml', async () => {
          const vorhanden = bestand.includes(ziel);
          bestand = bestand.filter((e) => e !== ziel);
          return vorhanden;
        }),
      );
      let erwerbungen = 0;
      erwerben.mockImplementation(async () => {
        erwerbungen += 1;
        if (erwerbungen === fehlschritt || erwerbungen === fehlschritt + 1) throw 'wartefrist';
        return 'test-token';
      });
      const ausfuehren = richtung === 'rueckgaengig' ? fuehreRueckgaengigAus : fuehreWiederholenAus;
      await expect(ausfuehren(aktion)).rejects.toBe('wartefrist');
      bestand.push(fremd);
      await expect(ausfuehren(aktion)).rejects.toBe('wartefrist');
      await expect(ausfuehren(aktion)).resolves.toBe(true);
      const erwartet = richtung === 'rueckgaengig' ? entfernt : [...rest, neu];
      expect(bestand).toHaveLength(erwartet.length + 1);
      expect(bestand).toEqual(expect.arrayContaining([...erwartet, fremd]));
      expect(erwerbungen).toBe(7); // fünf Einzelschritte und zwei abgewiesene Erwerbungen
      const gegenrichtung =
        richtung === 'rueckgaengig' ? fuehreWiederholenAus : fuehreRueckgaengigAus;
      await expect(gegenrichtung(aktion)).resolves.toBe(true);
      await expect(ausfuehren(aktion)).resolves.toBe(true);
      expect(bestand).toHaveLength(erwartet.length + 1);
      expect(bestand).toEqual(expect.arrayContaining([...erwartet, fremd]));
    },
  );

  it('behält einen nicht gefundenen Eintrag auch über einen späteren Fristfehler als Misserfolg', async () => {
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      neu: eintrag(),
      rest: [],
      entfernt: [eintrag({ ausgangsstelle: normAusgangsstelle('§ alt') })],
    };
    entferneMarkierung.mockResolvedValueOnce(false).mockResolvedValue(true);
    erwerben.mockRejectedValueOnce('wartefrist');
    await expect(fuehreRueckgaengigAus(aktion)).rejects.toBe('wartefrist');
    await expect(fuehreRueckgaengigAus(aktion)).resolves.toBe(false);
    expect(entferneMarkierung).toHaveBeenCalledTimes(1);
  });
});

describe('Bearbeiten mit Ausgangspräfix im gespeicherten Bestand', () => {
  it.each(
    (['kommentar', 'verweismarkierung'] as const).flatMap((typ) =>
      [false, true].flatMap((mitTextbezug) =>
        (['rueckgaengig', 'wiederholen'] as const).map((richtung) => ({
          typ,
          mitTextbezug,
          richtung,
        })),
      ),
    ),
  )(
    '$richtung verändert nur Anhang 1: $typ, Textbezug $mitTextbezug',
    async ({ typ, mitTextbezug, richtung }) => {
      const speicher = {
        ...(await vi.importActual<typeof import('./markierungSpeicher.aktionen')>(
          './markierungSpeicher.aktionen',
        )),
        ...(await vi.importActual<typeof import('./markierungSpeicher.aendern')>(
          './markierungSpeicher.aendern',
        )),
        ...(await vi.importActual<typeof import('./markierungSpeicher.lesen')>(
          './markierungSpeicher.lesen',
        )),
      };
      // Echte CRUD-Funktionen verwenden deren XML-Lader und Identitätsvergleich.
      ladeEintraege.mockImplementation(speicher.ladeEintraegeUnterSperre);
      schreibeEintraege.mockImplementation(speicher.schreibeEintraege);
      const textbezug = mitTextbezug
        ? {
            bezugstext: 'Text',
            textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 },
          }
        : { elementstand: testElementstand() };
      const vorherTextbezug = mitTextbezug
        ? {
            bezugstext: 'Tex',
            textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 3 },
          }
        : { elementstand: testElementstand() };
      const verweisziele = [
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: '2',
          verweistextZeichenbereich: [0, 3] as [number, number],
        }),
      ];
      const vorher =
        typ === 'kommentar'
          ? { kommentarText: 'alt', ...vorherTextbezug }
          : { verweisinhalt: { verweistext: '§ 2 alt', verweisziele }, ...vorherTextbezug };
      const nachher =
        typ === 'kommentar'
          ? { kommentarText: 'neu', ...textbezug }
          : { verweisinhalt: { verweistext: '§ 2 neu', verweisziele }, ...textbezug };
      const aktuellerStand = richtung === 'rueckgaengig' ? nachher : vorher;
      const gewuenschterStand = richtung === 'rueckgaengig' ? vorher : nachher;
      const anhang: MarkierungsEintrag = markierungsEintrag({
        typ,
        ausgangsstelle: normAusgangsstelle('Anhang 1'),

        ...aktuellerStand,
      });
      // Gleiche Zahl, Inhalt und Textstelle: ohne Präfix träfe die Suche den Alt-Eintrag.
      const altEintrag = markierungsEintrag({
        ...anhang,
        ausgangsstelle: normAusgangsstelle(bezeichnungAusgangsstelle(anhang.ausgangsstelle)),
      });
      const paragraph = markierungsEintrag({
        ...anhang,
        ausgangsstelle: normAusgangsstelle(bezeichnungAusgangsstelle(anhang.ausgangsstelle)),
      });
      await speicher.schreibeEintraege(gesetzesreferenz({ kurztitel: 'Test' }), [
        altEintrag,
        paragraph,
        anhang,
      ]);
      const bestand = await speicher.ladeEintraege(gesetzesreferenz({ kurztitel: 'Test' }));
      const unberuehrt = bestand.filter(
        (e) => !bezeichnungAusgangsstelle(e.ausgangsstelle).startsWith('Anhang '),
      );
      const ziel = { ausgangsstelle: normAusgangsstelle('Anhang 1') };
      const aktion =
        typ === 'kommentar'
          ? ({
              art: 'kommentarBearbeiten',
              gesetz: gesetzesreferenz({ kurztitel: 'Test' }),
              ziel,
              vorher,
              nachher,
            } as MarkierungKommentarBearbeitenAktion)
          : ({
              art: 'verweisBearbeiten',
              gesetz: gesetzesreferenz({ kurztitel: 'Test' }),
              ziel,
              vorher,
              nachher,
            } as MarkierungVerweisBearbeitenAktion);
      const ausfuehren = richtung === 'rueckgaengig' ? fuehreRueckgaengigAus : fuehreWiederholenAus;
      await expect(ausfuehren(aktion)).resolves.toBe(true);
      const geladen = await speicher.ladeEintraege(gesetzesreferenz({ kurztitel: 'Test' }));
      expect(geladen).toHaveLength(3);
      expect(
        geladen.filter((e) => !bezeichnungAusgangsstelle(e.ausgangsstelle).startsWith('Anhang ')),
      ).toEqual(unberuehrt);
      expect(
        geladen.find((e) => bezeichnungAusgangsstelle(e.ausgangsstelle).startsWith('Anhang ')),
      ).toEqual({
        ...markierungsEintrag({
          ...anhang,
          ...gewuenschterStand,
        }),
      });
    },
  );
});

vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...appDatenSpeicher.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenExistiert: async (pfad: string) => appDatenSpeicher.has(pfad),
}));

it.each(['rueckgaengig', 'wiederholen'] as const)(
  '%s merkt einen nach Vorabfehler fortgesetzten Wiederherstellungsschritt erneut vor',
  async (richtung) => {
    const aktion: MarkierungErsetzenAktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      neu: eintrag({ ausgangsstelle: normAusgangsstelle('§ neu') }),
      rest: [],
      entfernt: [eintrag({ ausgangsstelle: normAusgangsstelle('§ alt') })],
    };
    const ausfuehren = richtung === 'rueckgaengig' ? fuehreRueckgaengigAus : fuehreWiederholenAus;
    const fehler = new Error('Vormerken fehlgeschlagen');
    vi.mocked(merkePruefpflichtigeAenderungVor).mockRejectedValueOnce(fehler);
    await expect(ausfuehren(aktion)).rejects.toBe(fehler);
    expect(aktion.fortschritt).toMatchObject({ naechsterSchritt: 1, erfolgreich: true });
    expect(erwerben).not.toHaveBeenCalled();
    expect(ladeEintraege).not.toHaveBeenCalled();
    expect(schreibeEintraege).not.toHaveBeenCalled();
    await expect(ausfuehren(aktion)).resolves.toBe(true);
    expect(merkePruefpflichtigeAenderungVor).toHaveBeenCalledTimes(2);
    expect(entferneMarkierung).toHaveBeenCalledTimes(1);
    expect(schreibeEintraege).toHaveBeenCalledTimes(1);
    expect(aktion.fortschritt).toBeUndefined();
  },
);

describe('Überschriften bearbeiten, rückgängig machen, wiederholen und neu laden', () => {
  it.each(
    (['kommentar', 'verweismarkierung'] as const).flatMap((typ) =>
      [false, true].map((mitTextbezug) => ({ typ, mitTextbezug })),
    ),
  )(
    '$typ bleibt mit Textbezug $mitTextbezug von gleichnamiger Norm getrennt',
    async ({ typ, mitTextbezug }) => {
      const speicher = {
        ...(await vi.importActual<typeof import('./markierungSpeicher.aktionen')>(
          './markierungSpeicher.aktionen',
        )),
        ...(await vi.importActual<typeof import('./markierungSpeicher.aendern')>(
          './markierungSpeicher.aendern',
        )),
        ...(await vi.importActual<typeof import('./markierungSpeicher.lesen')>(
          './markierungSpeicher.lesen',
        )),
      };
      ladeEintraege.mockImplementation(speicher.ladeEintraegeUnterSperre);
      schreibeEintraege.mockImplementation(speicher.schreibeEintraege);
      const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
      const verweisziele = [
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: '§ 1010',

          verweistextZeichenbereich: [0, 6] as [number, number],
        }),
      ];
      const textbezug = mitTextbezug
        ? {
            bezugstext: 'Buch',
            textstelle: {
              pfad: bereichPfad('bezeichnung' as const),
              zeichenbereichStart: 0,
              zeichenbereichEnde: 4,
            },
          }
        : { elementstand: testElementstand() };
      const vorher =
        typ === 'kommentar'
          ? { kommentarText: 'alt', ...textbezug }
          : { verweisinhalt: { verweistext: '§ 1010', verweisziele }, ...textbezug };
      const nachher =
        typ === 'kommentar'
          ? { kommentarText: 'neu', ...textbezug }
          : { verweisinhalt: { verweistext: '§ 1010 neu', verweisziele }, ...textbezug };
      const u: MarkierungsEintrag = markierungsEintrag({
        typ,
        ausgangsstelle: ueberschriftAusgangsstelle('010'),
        ...vorher,
      });
      const n: MarkierungsEintrag = markierungsEintrag({
        ...u,
        ausgangsstelle: normAusgangsstelle(bezeichnungAusgangsstelle(u.ausgangsstelle)),
      });
      await speicher.schreibeEintraege(gesetz, [n, u]);
      const ursprung = await speicher.ladeEintraege(gesetz);
      const norm = ursprung.find((e) => !(e.ausgangsstelle.typ === 'ueberschrift'))!;
      const ziel = {
        ausgangsstelle: (true as const)
          ? ueberschriftAusgangsstelle('010')
          : normAusgangsstelle('§ 010'),
      };
      const aktion =
        typ === 'kommentar'
          ? ({
              art: 'kommentarBearbeiten' as const,
              gesetz,
              ziel,
              vorher,
              nachher,
            } as MarkierungKommentarBearbeitenAktion)
          : ({
              art: 'verweisBearbeiten' as const,
              gesetz,
              ziel,
              vorher,
              nachher,
            } as MarkierungVerweisBearbeitenAktion);
      const assertStand = async (werte: typeof vorher) => {
        const geladen = await speicher.ladeEintraege(gesetz);
        expect(geladen).toHaveLength(2);
        expect(geladen.find((e) => !(e.ausgangsstelle.typ === 'ueberschrift'))).toEqual(norm);
        expect(geladen.find((e) => e.ausgangsstelle.typ === 'ueberschrift')).toMatchObject(
          markierungsEintrag({
            ...u,
            ...werte,
          }),
        );
        expect([...appDatenSpeicher.values()].join('')).toContain(
          '<gliederungskennzahl>010</gliederungskennzahl>',
        );
      };
      if (typ === 'kommentar') await speicher.aktualisiereKommentar(gesetz, u, 'neu', textbezug);
      else if ('verweisinhalt' in nachher)
        await speicher.aktualisiereZielnorm(
          gesetz,
          u,
          nachher.verweisinhalt,
          textbezug,
          mitTextbezug ? undefined : testElementstand(),
        );
      await assertStand(nachher);
      await expect(fuehreRueckgaengigAus(aktion)).resolves.toBe(true);
      await assertStand(vorher);
      await expect(fuehreWiederholenAus(aktion)).resolves.toBe(true);
      await assertStand(nachher);
    },
  );
});

it('erhält Elementstände und Textbezug beim vollständigen Kommentar-Undo/Redo neben einem zweiten Kommentar derselben Norm', async () => {
  const speicher = {
    ...(await vi.importActual<typeof import('./markierungSpeicher.aktionen')>(
      './markierungSpeicher.aktionen',
    )),
    ...(await vi.importActual<typeof import('./markierungSpeicher.aendern')>(
      './markierungSpeicher.aendern',
    )),
    ...(await vi.importActual<typeof import('./markierungSpeicher.lesen')>(
      './markierungSpeicher.lesen',
    )),
  };
  ladeEintraege.mockImplementation(speicher.ladeEintraegeUnterSperre);
  schreibeEintraege.mockImplementation(speicher.schreibeEintraege);
  const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
  const ziel = { ausgangsstelle: normAusgangsstelle('§ 1'), bereich: 'bezeichnung' as const };
  const fremd: MarkierungsEintrag = markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),

    kommentarText: 'Zweiter Kommentar',
    bezug: { typ: 'pauschal' as const, elementstand: { titel: 'Zweiter Stand', textlaenge: 13 } },
  });
  const staende = [
    { kommentarText: 'Alt', elementstand: { titel: 'Alt', textlaenge: 9 } },
    { kommentarText: 'Pauschal neu', elementstand: { titel: 'Neu', textlaenge: 10 } },
    {
      kommentarText: 'Text',
      bezugstext: '§',
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
    },
    { kommentarText: 'Zurück pauschal', elementstand: { textlaenge: 11 } },
  ];
  await speicher.schreibeEintraege(gesetz, [
    markierungsEintrag({ typ: 'kommentar', ...ziel, ...staende[0]! }),
    fremd,
  ]);
  const gespeicherterFremd = (await speicher.ladeEintraege(gesetz))[1]!;
  for (let i = 1; i < staende.length; i++) {
    const vorher = staende[i - 1]!;
    const nachher = staende[i]!;
    const aktion: MarkierungKommentarBearbeitenAktion = {
      art: 'kommentarBearbeiten',
      gesetz,
      ziel,
      vorher,
      nachher,
    };
    await speicher.aktualisiereKommentar(
      gesetz,
      { ...ziel, ...vorher, bezug: markierungsBezug(vorher) },
      nachher.kommentarText,
      nachher,
    );
    const assertStand = async (stand: typeof vorher) => {
      const gelesen = await speicher.ladeEintraege(gesetz);
      expect(gelesen).toHaveLength(2);
      expect(gelesen.find((e) => e.kommentarText === fremd.kommentarText)).toEqual(
        gespeicherterFremd,
      );
      expect(gelesen.find((e) => e.kommentarText === stand.kommentarText)).toMatchObject({
        kommentarText: stand.kommentarText,
        bezug: markierungsBezug(stand),
      });
      expect(
        gelesen.find((e) => e.kommentarText === stand.kommentarText)?.bezug.elementstand,
      ).toEqual('elementstand' in stand ? stand.elementstand : undefined);
    };
    await assertStand(nachher);
    await expect(fuehreRueckgaengigAus(aktion)).resolves.toBe(true);
    await assertStand(vorher);
    await expect(fuehreWiederholenAus(aktion)).resolves.toBe(true);
    await assertStand(nachher);
  }
});
